import {
  Component,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  NgZone,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, filter, Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ProcessService } from '../../core/services/process';
import { TramiteService, TramiteNodeInfo } from '../../core/services/tramite';
import { FormSchemaService, FormField, NodeFormSchema } from '../../core/services/form-schema';
import { DepartmentService } from '../../core/services/department';
import { NotificationService, WorkflowEvent } from '../../core/services/notification';
import { AuthService } from '../../core/services/auth';
import { VoiceService } from '../../core/services/voice';
import { VoiceCommand } from '../../core/models/voice-command.model';
import { SpeechService } from '../../core/services/speech';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface NodeProps {
  name: string;
  departmentId: string;
  slaHours: number;
  formSchemaId: string;
}

interface EdgeProps {
  name: string;
  condition: string;
}

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="sample-diagram"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="Process_1" isExecutable="false">
    <bpmn2:startEvent id="StartEvent_1" name="Inicio"/>
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="172" y="152" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`;

@Component({
  selector: 'app-designer',
  imports: [FormsModule, ReactiveFormsModule, SlicePipe],
  templateUrl: './designer.html',
  styleUrl: './designer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Designer implements AfterViewInit, OnDestroy {
  @ViewChild('bpmnCanvas', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('cursorsLayer', { static: true }) cursorsLayerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvasWrapper', { static: true }) canvasWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('transcriptBody', { static: false }) transcriptBodyRef?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private authService = inject(AuthService);
  private voiceService = inject(VoiceService);
  private speechService = inject(SpeechService);
  private http = inject(HttpClient);
  private processService = inject(ProcessService);
  private tramiteService = inject(TramiteService);
  private formSchemaService = inject(FormSchemaService);
  private departmentService = inject(DepartmentService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  private modeler: any = null;
  private cdr = inject(ChangeDetectorRef);
  processId: string | null = null;

  // ── Colaboración en tiempo real (Yjs) ────────────────────────────────────
  private ydoc: any = null;
  private wsProvider: any = null;
  private yXml: any = null;
  private collabDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  collabStatus: 'connected' | 'disconnected' | 'connecting' | null = null;
  /** True mientras se está aplicando un cambio remoto — evita re-enviar el XML al canal Yjs */
  private isApplyingRemote = false;

  // ── Cursores colaborativos ────────────────────────────────────────────────
  /** clientId → elemento DOM del cursor en la capa overlay */
  private cursorElements = new Map<number, HTMLElement>();
  private mousemoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseleaveHandler: (() => void) | null = null;
  private awarenessChangeHook: (() => void) | null = null;
  private lastAwarenessMs = 0; // throttle cursor updates to ~25fps
  private analyzeOnCooldown = false; // evita repetir análisis si ya está en curso

  /** Lista de peers conectados — usada para mostrar avatares en la toolbar */
  collabPeers: { clientId: number; name: string; color: string }[] = [];

  // ── Agente JARVIS ─────────────────────────────────────────────────────────
  isAgentListening = false; // true mientras SpeechService.listen() está activo
  isSpeaking = false; // true mientras speechSynthesis está activo → activa audio wave
  private analyzeSubject$ = new Subject<void>(); // canal para debounce del análisis

  // ── Agente de voz (Web Speech API) ────────────────────────────────────────
  speechSupported =
    typeof window !== 'undefined' && !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  isRecording = false;
  showVoicePanel = false;
  voiceHistory: Array<{ role: 'user' | 'ai'; text: string }> = [];
  interimTranscript = ''; // fragmento parcial en curso
  voiceError = '';
  voiceCommandResult = ''; // feedback de la última acción ejecutada
  voiceIsExecuting = false; // true mientras espera respuesta del backend
  private recognition: SpeechRecognition | null = null;
  private voiceFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  processName = '';

  selectedElement: any = null;
  nodeProps: NodeProps = { name: '', departmentId: '', slaHours: 0, formSchemaId: '' };
  nodePropsMap: Record<string, NodeProps> = {};
  edgeProps: EdgeProps = { name: '', condition: '' };

  departments: { id: string; name: string }[] = [];
  formSchemas = ['form-conexion-agua', 'form-reclamo', 'form-inspeccion', 'form-aprobacion'];

  readonly palette = [
    {
      section: 'Navegación',
      items: [
        { id: 'hand', label: 'Mano', icon: '✋', svg: 'hand', action: 'tool' },
        { id: 'lasso', label: 'Selección', icon: '⬚', svg: 'lasso', action: 'tool' },
      ],
    },
    {
      section: 'Eventos',
      items: [
        { id: 'bpmn:StartEvent', label: 'Inicio', icon: '▶', action: 'create' },
        { id: 'bpmn:EndEvent', label: 'Fin', icon: '⏹', action: 'create' },
        { id: 'bpmn:IntermediateCatchEvent', label: 'Intermedio', icon: '◑', action: 'create' },
        { id: 'bpmn:BoundaryEvent', label: 'Límite', icon: '◐', action: 'create' },
      ],
    },
    {
      section: 'Tareas',
      items: [
        { id: 'bpmn:Task', label: 'Tarea', icon: '□', action: 'create' },
        { id: 'bpmn:UserTask', label: 'Usuario', icon: '👤', action: 'create' },
        { id: 'bpmn:ServiceTask', label: 'Servicio', icon: '⚙', action: 'create' },
        { id: 'bpmn:SendTask', label: 'Envío', icon: '📤', action: 'create' },
        { id: 'bpmn:ReceiveTask', label: 'Recepción', icon: '📥', action: 'create' },
        { id: 'bpmn:ScriptTask', label: 'Script', icon: '📝', action: 'create' },
      ],
    },
    {
      section: 'Gateways',
      items: [
        { id: 'bpmn:ExclusiveGateway', label: 'Exclusivo', icon: '✕', action: 'create' },
        { id: 'bpmn:ParallelGateway', label: 'Paralelo', icon: '+', action: 'create' },
        { id: 'bpmn:InclusiveGateway', label: 'Inclusivo', icon: 'O', action: 'create' },
        { id: 'bpmn:EventBasedGateway', label: 'Por evento', icon: '⬡', action: 'create' },
      ],
    },
    {
      section: 'Contenedores',
      items: [
        {
          id: 'bpmn:SubProcess',
          label: 'Sub-proceso',
          icon: '▣',
          action: 'create',
          expanded: true,
        },
        { id: 'bpmn:Pool', label: 'Pool', icon: '▬', action: 'create-pool' },
      ],
    },
    {
      section: 'Datos',
      items: [
        { id: 'bpmn:DataObjectReference', label: 'Objeto', icon: '📄', action: 'create' },
        { id: 'bpmn:DataStoreReference', label: 'Almacén', icon: '🗃', action: 'create' },
      ],
    },
  ];

  saving = false;
  publishing = false;
  savedOk = false;

  /** nodeId → cantidad de trámites activos en ese nodo */
  activeNodeCounts: Map<string, number> = new Map();

  // ── Form schema state ──────────────────────────────────────────────────
  schemaLoading = false;
  schemaFields: FormField[] = [];
  showAddField = false;
  addFieldForm!: FormGroup;
  savingSchema = false;

  get isSelectType(): boolean {
    return this.addFieldForm?.get('type')?.value === 'SELECT';
  }

  get elementIcon(): string {
    const t = this.selectedElement?.type ?? '';
    if (t.includes('Task')) return '📋';
    if (t.includes('StartEvent')) return '▶';
    if (t.includes('EndEvent')) return '⏹';
    if (t.includes('Gateway')) return '◆';
    return '⬡';
  }

  get elementColor(): string {
    const t = this.selectedElement?.type ?? '';
    if (t.includes('Task')) return '#dbeafe';
    if (t.includes('StartEvent')) return '#dcfce7';
    if (t.includes('EndEvent')) return '#fee2e2';
    if (t.includes('Gateway')) return '#fef9c3';
    return '#ede9fe';
  }

  get elementClass(): string {
    const t = this.selectedElement?.type ?? '';
    if (t.includes('Task')) return 'task';
    if (t.includes('Event')) return 'event';
    if (t.includes('Gateway')) return 'gateway';
    if (t.includes('SequenceFlow')) return 'sequence';
    return 'default';
  }

  /** Solo tareas (Task/UserTask/etc.) tienen departamento, SLA y formulario */
  get isTaskNode(): boolean {
    const t = this.selectedElement?.type ?? '';
    return t.includes('Task');
  }

  /** Es una flecha de secuencia (condición solo aplica aquí) */
  get isSequenceFlow(): boolean {
    return this.selectedElement?.type === 'bpmn:SequenceFlow';
  }

  async ngAfterViewInit(): Promise<void> {
    this.initAddFieldForm();

    // Saludo inicial del agente JARVIS (no bloquea la carga del canvas)
    setTimeout(
      () => this.speechService.speak('Hola, soy tu asistente de diseño. ¿Cómo puedo ayudarte?'),
      600,
    );

    // Pipeline de análisis automático del diagrama con debounce de 1.2 s
    this.analyzeSubject$
      .pipe(debounceTime(1200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.analyzeDiagram());

    // Cargar departamentos reales desde la API
    this.departmentService.getAll().subscribe({
      next: (depts: any[]) => {
        this.departments = depts
          .filter((d: any) => d.active !== false)
          .map((d: any) => ({ id: d.id, name: d.name }));
        this.cdr.markForCheck();
      },
    });

    const { default: BpmnModeler } = await import('bpmn-js/lib/Modeler');

    this.modeler = new BpmnModeler({
      container: this.canvasRef.nativeElement,
    });

    const stateId: string | undefined = (window.history.state as any)?.processId;
    const paramId =
      this.route.snapshot.paramMap.get('id') ?? this.route.snapshot.queryParamMap.get('id');

    if (stateId) {
      this.processId = stateId;
      this.loadProcess(this.processId);
    } else if (paramId) {
      if (/^[0-9a-f]{24}$/i.test(paramId)) {
        this.processId = paramId;
        this.loadProcess(this.processId);
      } else {
        this.processService.getAll().subscribe({
          next: (procs: any[]) => {
            const match = procs.find((p: any) => this.toSlug(p.name) === paramId);
            if (match) {
              this.processId = match.id;
              this.loadProcess(this.processId!);
            } else {
              this.modeler.importXML(EMPTY_XML).then(() => {
                this.fitCanvas();
              });
              this.processName = '';
            }
          },
          error: async () => {
            await this.modeler.importXML(EMPTY_XML);
            this.fitCanvas();
            this.processName = '';
          },
        });
      }
    } else {
      await this.modeler.importXML(EMPTY_XML);
      this.fitCanvas();
      this.processName = '';
    }

    this.bindEvents();

    // Refrescar colores y badges del canvas en tiempo real cuando un trámite avanza.
    // Se filtra por processId para ignorar eventos de otros procesos de la misma empresa.
    // debounceTime(800) agrupa ráfagas de eventos consecutivos en una sola llamada.
    this.notificationService.companyEvent$
      .pipe(
        filter(
          (event: WorkflowEvent) =>
            !!this.processId && (!event.processId || event.processId === this.processId),
        ),
        debounceTime(800),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.highlightActiveNodes(this.processId!));
  }

  private bindEvents(): void {
    // Agente JARVIS: analizar diagrama cada vez que el usuario hace un cambio.
    // analyzeSubject$ actúa como buffer con debounce para no saturar el backend.
    this.modeler.on('commandStack.changed', () => this.analyzeSubject$.next());

    this.modeler.on('selection.changed', ({ newSelection }: any) => {
      this.zone.run(() => {
        const el = newSelection?.[0];
        if (el && el.type !== 'bpmn:Process' && el.type !== '__implicitroot') {
          this.selectedElement = el;
          this.nodeProps = this.nodePropsMap[el.id] ?? {
            name: el.businessObject?.name ?? '',
            departmentId: '',
            slaHours: 0,
            formSchemaId: '',
          };
          // Cargar condición si es SequenceFlow
          if (el.type === 'bpmn:SequenceFlow') {
            this.edgeProps = {
              name: el.businessObject?.name ?? '',
              condition: el.businessObject?.conditionExpression?.body ?? '',
            };
          }
          // Cargar schema solo para tareas, no para gateways/eventos
          this.schemaFields = [];
          this.showAddField = false;
          this.addFieldForm?.reset({ type: 'TEXT', required: false });
          if (this.processId && el.type?.includes('Task')) this.loadNodeSchema(el.id);
        } else {
          this.selectedElement = null;
          this.schemaFields = [];
          this.showAddField = false;
        }
        this.cdr.markForCheck();
      });
    });
  }

  private toSlug(text: string): string {
    return (
      (text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'proceso'
    );
  }

  private loadProcess(id: string): void {
    this.processService.getById(id).subscribe({
      next: async (process: any) => {
        const xml = process.bpmnXml ?? EMPTY_XML;
        this.nodePropsMap = process.nodeProperties ?? {};
        this.processName = process.name ?? '';
        this.title.setTitle(this.processName ? `${this.processName} — Diseñador` : 'Diseñador');
        await this.modeler.importXML(xml);
        this.fitCanvas();
        this.highlightActiveNodes(id);
        this.cdr.markForCheck();
        this.initCollaboration(id); // ← arrancar colaboración después del load inicial
      },
      error: async () => {
        await this.modeler.importXML(EMPTY_XML);
        this.fitCanvas();
      },
    });
  }

  /**
   * Consulta los trámites activos del proceso y pinta en verde
   * los nodos que tienen al menos un trámite en curso.
   * Puede llamarse en cualquier momento después de importXML.
   */
  highlightActiveNodes(processId: string): void {
    this.tramiteService.getTramitesByProcess(processId).subscribe({
      next: (tramites: TramiteNodeInfo[]) => {
        // 1. Construir mapa nodeId → cantidad de trámites
        const nodeCount = new Map<string, number>();
        for (const t of tramites) {
          if (t.currentNodeId) {
            nodeCount.set(t.currentNodeId, (nodeCount.get(t.currentNodeId) ?? 0) + 1);
          }
        }
        this.activeNodeCounts = nodeCount;

        const modeling = this.modeler.get('modeling');
        const elementRegistry = this.modeler.get('elementRegistry');

        // 2. Limpiar estado visual previo (colores + badges)
        this.resetNodeColors(modeling, elementRegistry);
        this.clearBadges();

        // 3. Colorear los nodos activos
        nodeCount.forEach((count, nodeId) => {
          const element = elementRegistry.get(nodeId);
          if (!element) return;

          const color =
            count >= 3
              ? { fill: '#ff4d4f', stroke: '#cf1322' } // rojo: carga alta
              : count === 2
                ? { fill: '#fa8c16', stroke: '#d46b08' } // naranja: carga media
                : { fill: '#52c41a', stroke: '#389e0d' }; // verde: 1 trámite

          try {
            modeling.setColor(element, color);
          } catch {
            /* no soporta color */
          }
        });

        // 4. Agregar badges con la cantidad encima de cada nodo
        this.addBadgesToNodes(nodeCount);

        this.cdr.markForCheck();
      },
      error: () => {
        /* no bloquear al diseñador si falla */
      },
    });
  }

  /**
   * Agrega un overlay tipo badge sobre cada nodo que tenga trámites activos.
   * Elimina los badges anteriores antes de crear los nuevos (idempotente).
   */
  addBadgesToNodes(nodeCount: Map<string, number>): void {
    const overlays = this.modeler.get('overlays');
    const elementRegistry = this.modeler.get('elementRegistry');

    // Limpiar badges previos del mismo tipo para evitar duplicados
    try {
      overlays.remove({ type: 'tramite-badge' });
    } catch {
      /* ignore */
    }

    if (nodeCount.size === 0) return;

    nodeCount.forEach((count, nodeId) => {
      // Verificar que el nodo existe en el canvas antes de agregar overlay
      const element = elementRegistry.get(nodeId);
      if (!element) return;

      const bgColor = count >= 3 ? '#cf1322' : count === 2 ? '#d46b08' : '#1677ff';

      try {
        overlays.add(nodeId, 'tramite-badge', {
          position: { top: -12, right: -12 },
          html: this.buildBadgeHtml(count, bgColor),
        });
      } catch {
        /* nodo no soporta overlay */
      }
    });
  }

  /** Genera el HTML inline del badge (sin clases externas para evitar conflictos) */
  private buildBadgeHtml(count: number, bgColor: string): string {
    const label = count > 99 ? '99+' : String(count);
    const width = label.length > 2 ? 'auto' : '22px';
    return `<div style="
      min-width: ${width};
      height: 22px;
      padding: 0 6px;
      background: ${bgColor};
      color: #fff;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 2px 6px rgba(0,0,0,0.40);
      border: 2px solid #fff;
      white-space: nowrap;
      user-select: none;
      cursor: default;
      box-sizing: border-box;
    ">${label}</div>`;
  }

  /** Elimina todos los overlays de tipo 'tramite-badge' del canvas */
  private clearBadges(): void {
    try {
      this.modeler.get('overlays').remove({ type: 'tramite-badge' });
    } catch {
      /* ignore */
    }
  }

  /** Restablece fill/stroke a null en todos los shapes del canvas */
  private resetNodeColors(modeling: any, elementRegistry: any): void {
    const elements: any[] = elementRegistry.getAll();
    for (const el of elements) {
      if (el.type === '__implicitroot' || el.type === 'bpmn:SequenceFlow') continue;
      try {
        modeling.setColor(el, { fill: null, stroke: null });
      } catch {
        /* ignorar */
      }
    }
  }

  private fitCanvas(): void {
    try {
      this.modeler.get('canvas').zoom('fit-viewport', 'auto');
    } catch {
      /* ignore */
    }
  }

  updateNodeName(): void {
    if (!this.selectedElement) return;
    try {
      this.modeler.get('modeling').updateLabel(this.selectedElement, this.nodeProps.name);
    } catch {
      /* element may not support labels */
    }
    this.persistNodeProps();
  }

  persistNodeProps(): void {
    if (!this.selectedElement) return;
    this.nodePropsMap[this.selectedElement.id] = { ...this.nodeProps };
  }

  persistEdgeCondition(): void {
    if (!this.selectedElement || !this.isSequenceFlow) return;
    try {
      const modeling = this.modeler.get('modeling');
      const moddle = this.modeler.get('moddle');
      const condBody = (this.edgeProps.condition ?? '').trim();
      const nameVal = (this.edgeProps.name ?? '').trim();

      const props: any = {};
      if (nameVal !== (this.selectedElement.businessObject?.name ?? '')) {
        props.name = nameVal || undefined;
      }
      if (condBody) {
        props.conditionExpression = moddle.create('bpmn:FormalExpression', { body: condBody });
      } else {
        props.conditionExpression = undefined;
      }
      modeling.updateProperties(this.selectedElement, props);
      this.toastr.success('Condición guardada', '✅');
    } catch (e) {
      this.toastr.error('No se pudo guardar la condición', 'Error');
    }
  }

  private extractNodesAndEdges(): { nodes: any[]; edges: any[] } {
    const registry = this.modeler.get('elementRegistry');
    const elements = registry.getAll();

    const typeMap: Record<string, string> = {
      'bpmn:StartEvent': 'START',
      'bpmn:EndEvent': 'END',
      'bpmn:Task': 'USER_TASK',
      'bpmn:UserTask': 'USER_TASK',
      'bpmn:ServiceTask': 'USER_TASK',
      'bpmn:SendTask': 'USER_TASK',
      'bpmn:ReceiveTask': 'USER_TASK',
      'bpmn:ScriptTask': 'USER_TASK',
      'bpmn:ExclusiveGateway': 'EXCLUSIVE_GW',
      'bpmn:ParallelGateway': 'PARALLEL_GW',
      'bpmn:InclusiveGateway': 'EXCLUSIVE_GW',
      'bpmn:SubProcess': 'USER_TASK',
    };

    const nodes: any[] = [];
    const edges: any[] = [];

    for (const el of elements) {
      if (el.type === '__implicitroot' || el.type === 'bpmn:Process') continue;

      if (el.type === 'bpmn:SequenceFlow') {
        edges.push({
          id: el.id,
          source: el.source?.id ?? el.businessObject?.sourceRef?.id,
          target: el.target?.id ?? el.businessObject?.targetRef?.id,
          label: el.businessObject?.name ?? '',
          condition: el.businessObject?.conditionExpression?.body ?? '',
        });
      } else if (typeMap[el.type]) {
        const props = this.nodePropsMap[el.id] ?? {};
        nodes.push({
          id: el.id,
          type: typeMap[el.type],
          label: (props as any).name || el.businessObject?.name || el.id,
          departmentId: (props as any).departmentId ?? '',
          slaHours: (props as any).slaHours ?? 0,
        });
      }
    }

    return { nodes, edges };
  }

  async save(): Promise<void> {
    if (!this.processName.trim()) {
      this.toastr.warning('Ingresa un nombre para el proceso', 'Atención');
      return;
    }
    this.saving = true;
    try {
      const { xml } = await this.modeler.saveXML({ format: true });
      const { nodes, edges } = this.extractNodesAndEdges();

      const payload = {
        name: this.processName.trim(),
        bpmnXml: xml,
        nodeProperties: this.nodePropsMap,
        nodes,
        edges,
        companyId: 'saguapac',
      };

      const call = this.processId
        ? this.processService.update(this.processId, payload)
        : this.processService.create(payload);

      call.subscribe({
        next: (res: any) => {
          if (!this.processId && res?.id) this.processId = res.id;
          this.toastr.success('Proceso guardado correctamente', '✅ Guardado');
          this.saving = false;
          this.savedOk = true;
          this.cdr.markForCheck();
          setTimeout(() => {
            this.savedOk = false;
            this.cdr.markForCheck();
          }, 3000);
        },
        error: () => {
          this.toastr.error('Error al guardar el proceso', 'Error');
          this.saving = false;
          this.cdr.markForCheck();
        },
      });
    } catch {
      this.toastr.error('Error al exportar el XML', 'Error');
      this.saving = false;
    }
  }

  publish(): void {
    if (!this.processId) {
      this.toastr.warning('Guarda el proceso primero antes de publicar', 'Atención');
      return;
    }
    if (!confirm('¿Deseas publicar este proceso? Quedará disponible para nuevos trámites.')) return;

    this.publishing = true;
    this.processService.publish(this.processId).subscribe({
      next: () => {
        this.toastr.success('Proceso publicado exitosamente', 'Publicado');
        this.publishing = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastr.error('Error al publicar el proceso', 'Error');
        this.publishing = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Controles de Zoom ────────────────────────────────────────────────────

  /**
   * Aumenta el zoom del canvas en un 10%
   * Usa la rueda de desplazamiento del modeler
   */
  zoomIn(): void {
    if (!this.modeler) return;
    try {
      const zoomScroll = this.modeler.get('zoomScroll');
      if (zoomScroll) {
        zoomScroll.zoom(0.1, undefined);
      }
    } catch (error) {
      console.warn('Error al hacer zoom in:', error);
    }
  }

  /**
   * Disminuye el zoom del canvas en un 10%
   * Usa la rueda de desplazamiento del modeler
   */
  zoomOut(): void {
    if (!this.modeler) return;
    try {
      const zoomScroll = this.modeler.get('zoomScroll');
      if (zoomScroll) {
        zoomScroll.zoom(-0.1, undefined);
      }
    } catch (error) {
      console.warn('Error al hacer zoom out:', error);
    }
  }

  /**
   * Ajusta el diagrama completo a la pantalla visible
   * Useful para ver el flujo completo de un vistazo
   */
  fitScreen(): void {
    if (!this.modeler) return;
    try {
      const canvas = this.modeler.get('canvas');
      if (canvas) {
        canvas.zoom('fit-viewport', 'auto');
      }
    } catch (error) {
      console.warn('Error al ajustar a pantalla:', error);
    }
  }

  clearSelection(): void {
    this.selectedElement = null;
    try {
      this.modeler.get('selection').select(null);
    } catch {
      /* ignore */
    }
  }

  // ── Custom palette ────────────────────────────────────────────────────
  onPaletteMousedown(event: MouseEvent, item: any): void {
    if (!this.modeler) return;
    event.preventDefault();

    if (item.action === 'tool') {
      if (item.id === 'hand') {
        try {
          this.modeler.get('handTool').toggle();
        } catch {}
      }
      if (item.id === 'lasso') {
        try {
          this.modeler.get('lassoTool').toggle();
        } catch {}
      }
      return;
    }

    if (item.action === 'create' || item.action === 'create-pool') {
      try {
        const factory = this.modeler.get('elementFactory');
        const create = this.modeler.get('create');
        let shape: any;

        if (item.action === 'create-pool') {
          shape = factory.createParticipantShape(true);
        } else if (item.id === 'bpmn:SubProcess' && item.expanded) {
          shape = factory.createShape({ type: item.id, isExpanded: true });
        } else {
          shape = factory.createShape({ type: item.id });
        }
        create.start(event, shape);
      } catch {
        /* ignore unsupported types */
      }
    }
  }

  // ── Form Schema ───────────────────────────────────────────────────────

  /** Inicializa el ReactiveForm del diálogo "Agregar campo" */
  private initAddFieldForm(): void {
    this.addFieldForm = this.fb.group({
      label: ['', [Validators.required, Validators.minLength(2)]],
      type: ['TEXT' as FormField['type'], Validators.required],
      required: [false],
      placeholder: [''],
      options: [''], // solo se valida cuando type === SELECT
    });

    // Validación dinámica: options requerida solo si SELECT
    this.addFieldForm.get('type')!.valueChanges.subscribe((t: string) => {
      const optCtrl = this.addFieldForm.get('options')!;
      t === 'SELECT' ? optCtrl.setValidators([Validators.required]) : optCtrl.clearValidators();
      optCtrl.updateValueAndValidity();
      this.cdr.markForCheck();
    });
  }

  /** Convierte un texto en snake_case ASCII (para usar como name/id de campo) */
  private slugify(text: string): string {
    return (
      (text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // quitar tildes
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'campo'
    );
  }

  /** Carga el FormSchema existente para el nodo; si no hay, inicializa vacío */
  private loadNodeSchema(nodeId: string): void {
    this.schemaLoading = true;
    this.cdr.markForCheck();

    this.formSchemaService.getByNode(this.processId!, nodeId).subscribe({
      next: (schema: NodeFormSchema | null) => {
        this.schemaFields = schema?.fields ?? [];
        this.schemaLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.schemaFields = [];
        this.schemaLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleAddField(): void {
    this.showAddField = !this.showAddField;
    if (this.showAddField) {
      this.addFieldForm.reset({
        type: 'TEXT',
        required: false,
        label: '',
        placeholder: '',
        options: '',
      });
    }
  }

  cancelAddField(): void {
    this.showAddField = false;
    this.addFieldForm.reset({
      type: 'TEXT',
      required: false,
      label: '',
      placeholder: '',
      options: '',
    });
  }

  /** Valida el form inline y agrega el campo a la lista en memoria */
  saveField(): void {
    this.addFieldForm.markAllAsTouched();
    if (this.addFieldForm.invalid) return;

    const { label, type, required, placeholder, options } = this.addFieldForm.getRawValue();
    const slug = this.slugify((label as string).trim());

    const field: FormField = {
      id: slug,
      name: slug,
      label: (label as string).trim(),
      type: type as FormField['type'],
      required: !!required,
      placeholder: (placeholder as string)?.trim() || undefined,
      ...(type === 'SELECT' && {
        options: (options as string)
          .split(',')
          .map((o: string) => o.trim())
          .filter((o: string) => o.length > 0),
      }),
    };

    this.schemaFields = [...this.schemaFields, field];
    this.cancelAddField();
    this.cdr.markForCheck();
  }

  deleteField(index: number): void {
    this.schemaFields = this.schemaFields.filter((_, i) => i !== index);
    this.cdr.markForCheck();
  }

  /** Persiste el schema completo vía POST /api/form-schemas */
  saveSchema(): void {
    if (!this.selectedElement) return;
    if (!this.processId) {
      this.toastr.warning(
        'Guarda el proceso primero antes de guardar el formulario',
        '⚠️ Proceso sin guardar',
      );
      return;
    }
    this.savingSchema = true;
    this.cdr.markForCheck();

    const payload: NodeFormSchema = {
      processId: this.processId,
      nodeId: this.selectedElement.id,
      fields: this.schemaFields,
    };

    this.formSchemaService.save(payload).subscribe({
      next: () => {
        this.toastr.success('Formulario guardado correctamente', '✅ Guardado');
        this.savingSchema = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastr.error('Error al guardar el formulario', 'Error');
        this.savingSchema = false;
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Inicializa la colaboración en tiempo real usando Yjs + WebsocketProvider.
   * Se llama una vez que processId y modeler ya están listos.
   *
   * Flujo:
   *  – commandStack.changed → saveXML → escribe en Y.Text (cambio local)
   *  – Y.Text cambia por peer remoto → importXML en el canvas
   *
   * Anti-loop: `transaction.local` de Yjs distingue cambios propios de remotos,
   * por lo que el observe solo re-importa XML cuando viene de otro usuario.
   * Un debounce de 300 ms agrupa ráfagas de commandStack.changed (ej. arrastrar).
   */
  private async initCollaboration(processId: string): Promise<void> {
    try {
      const Y = await import('yjs');
      const { WebsocketProvider } = await import('y-websocket');

      this.ydoc = new Y.Doc();
      this.yXml = this.ydoc.getText('bpmnXml');

      this.wsProvider = new WebsocketProvider(environment.wsCollabUrl, processId, this.ydoc);

      // Indicador de estado de conexión
      this.wsProvider.on('status', ({ status }: { status: string }) => {
        this.zone.run(() => {
          this.collabStatus = status as 'connected' | 'disconnected' | 'connecting';
          this.cdr.markForCheck();
        });
      });

      this.initAwareness();

      // Cambios remotos → aplicar al canvas
      this.yXml.observe(async (_event: any, transaction: any) => {
        if (transaction.local) return; // ignorar nuestros propios cambios

        const xml = (this.yXml.toString() as string).trim();
        if (!xml.includes('<bpmn')) return; // xml vacío o inválido

        try {
          // Bloquear el listener de commandStack mientras se importa el XML remoto.
          // Sin esto, importXML dispara commandStack.changed → se reenvía el XML
          // local (viejo) sobreescribiendo el cambio del colaborador.
          this.isApplyingRemote = true;
          if (this.collabDebounceTimer) {
            clearTimeout(this.collabDebounceTimer);
            this.collabDebounceTimer = null;
          }
          await this.modeler.importXML(xml);
          // Actualizar el panel de propiedades si hay un elemento seleccionado
          this.zone.run(() => {
            if (this.selectedElement) {
              const registry = this.modeler.get('elementRegistry');
              const refreshed = registry.get(this.selectedElement.id);
              if (refreshed) {
                this.selectedElement = refreshed;
                this.nodeProps = {
                  ...this.nodePropsMap[refreshed.id],
                  name: refreshed.businessObject?.name ?? '',
                };
              }
            }
            this.cdr.markForCheck();
          });
        } catch {
          /* xml inválido enviado por un peer, ignorar */
        } finally {
          // Liberar el bloqueo en el siguiente microtask para que bpmn-js
          // termine de procesar todos los eventos del importXML antes de
          // volver a escuchar commandStack.changed
          queueMicrotask(() => {
            this.isApplyingRemote = false;
          });
        }
      });

      // Cambios locales → publicar a Yjs (con debounce para no saturar)
      this.modeler.on('commandStack.changed', () => {
        // Ignorar si estamos aplicando un cambio remoto
        if (this.isApplyingRemote) return;

        if (this.collabDebounceTimer) clearTimeout(this.collabDebounceTimer);

        this.collabDebounceTimer = setTimeout(async () => {
          if (!this.yXml || !this.ydoc || this.isApplyingRemote) return;
          try {
            const { xml } = await this.modeler.saveXML({ format: true });
            if (!xml) return;
            this.ydoc.transact(() => {
              this.yXml.delete(0, this.yXml.length);
              this.yXml.insert(0, xml);
            });
          } catch {
            /* error de serialización, ignorar */
          }
        }, 300);
      });
    } catch (err) {
      console.warn('[Collab] No se pudo inicializar la colaboración:', err);
    }
  }

  // ── Agente JARVIS ─────────────────────────────────────────────────────────

  /**
   * Escucha un único comando de voz, lo envía al backend y ejecuta la acción
   * sobre el canvas BPMN. El agente confirma verbalmente el resultado.
   */
  onMicClick(): void {
    if (this.isAgentListening) return;
    this.isAgentListening = true;
    this.cdr.markForCheck();

    this.speechService.listen().subscribe({
      next: (text: string) => {
        this.isAgentListening = false;
        this.cdr.markForCheck();

        // Enviar el texto al backend para interpretación IA
        this.voiceService.parseCommand(text, this.processId ?? '').subscribe({
          next: (cmd: VoiceCommand) => {
            this.executeVoiceCommand(cmd);
            // El agente confirma verbalmente usando el mensaje generado por la IA
            this.speechService.speak(cmd.message ?? 'Comando ejecutado.');
          },
          error: () => {
            this.speechService.speak('No pude procesar ese comando. Intenta de nuevo.');
          },
        });
      },
      error: () => {
        this.isAgentListening = false;
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Analiza el diagrama en dos pasos:
   * 1. Comprobaciones locales instantáneas (sin red) → habla inmediatamente si hay problemas.
   * 2. Si no hay problemas locales, envía el XML al backend para sugerencias de IA.
   * Incluye un cooldown de 8s para evitar repeticiones inmediatas.
   */
  private analyzeDiagram(): void {
    if (!this.modeler) return;

    if (this.analyzeOnCooldown) {
      this.showVoiceResult(
        'ℹ El análisis acaba de ejecutarse. Espera unos segundos antes de volver a analizar.',
      );
      return;
    }

    this.analyzeOnCooldown = true;
    setTimeout(() => {
      this.analyzeOnCooldown = false;
    }, 8_000);

    const localIssues = this.checkDiagramIssuesLocally();
    if (localIssues.length > 0) {
      const speech = localIssues.slice(0, 2).join('. ');
      this.speechService.speak(speech);
      this.showVoiceResult(`⚠ ${localIssues[0]}`);
      return;
    }

    this.modeler
      .saveXML({ format: false })
      .then((result: { xml: string }) => {
        this.http
          .post<{
            suggestions: string[];
          }>(`${environment.apiUrl}/assistant/analyze-diagram`, {
            xml: result.xml,
            processId: this.processId,
          })
          .subscribe({
            next: (res) => {
              if (res.suggestions?.length) {
                const speech = res.suggestions.slice(0, 2).join('. ');
                this.speechService.speak(speech);
                this.showVoiceResult(`ℹ ${res.suggestions[0]}`);
              } else {
                const ok = 'El diagrama se ve bien. No se encontraron problemas.';
                this.speechService.speak(ok);
                this.showVoiceResult(`✓ ${ok}`);
              }
            },
            error: () => {
              /* fallo silencioso */
            },
          });
      })
      .catch(() => {});
  }

  /**
   * Detecta problemas comunes en el diagrama sin llamar al backend:
   * nodos sin conexión de entrada/salida, tareas sin departamento asignado.
   */
  private checkDiagramIssuesLocally(): string[] {
    const issues: string[] = [];
    const registry = this.modeler.get('elementRegistry');
    const elements: any[] = registry.getAll();

    for (const el of elements) {
      if (
        el.type === '__implicitroot' ||
        el.type === 'bpmn:Process' ||
        el.type === 'bpmn:SequenceFlow'
      )
        continue;

      const name = (el.businessObject?.name as string | undefined)?.trim() || el.id;

      if (el.type !== 'bpmn:StartEvent' && (!el.incoming || el.incoming.length === 0)) {
        issues.push(`El nodo "${name}" no tiene conexión de entrada`);
      }
      if (el.type !== 'bpmn:EndEvent' && (!el.outgoing || el.outgoing.length === 0)) {
        issues.push(`El nodo "${name}" no tiene conexión de salida`);
      }
      if (el.type?.includes('Task')) {
        const props = this.nodePropsMap[el.id];
        if (!props?.departmentId) {
          issues.push(`Al nodo "${name}" le falta asignar un departamento`);
        }
      }
    }
    return issues;
  }

  // ── Voz ──────────────────────────────────────────────────────────────────

  /**
   * Alterna el reconocimiento de voz (start / stop).
   * La primera llamada inicializa la instancia de SpeechRecognition.
   * Las siguientes simplemente arrancan o paran.
   */
  toggleVoice(): void {
    if (!this.speechSupported) {
      this.toastr.warning('Tu navegador no soporta reconocimiento de voz', 'Sin soporte');
      return;
    }

    if (this.isRecording) {
      this.recognition?.stop();
      return;
    }

    this.showVoicePanel = true;
    this.voiceError = '';
    this.cdr.markForCheck();

    if (!this.recognition) {
      this.initSpeechRecognition();
    }

    try {
      this.recognition!.start();
    } catch {
      // Si ya estaba iniciado (edge case), ignorar
    }
  }

  /**
   * Crea y configura la instancia de SpeechRecognition.
   * Solo se llama una vez; los handlers reutilizan la misma instancia.
   *
   * Manejo de acumulación de texto:
   *  – event.resultIndex marca desde dónde llegan resultados nuevos
   *  – isFinal === true → se agrega a this.transcript (texto permanente)
   *  – isFinal === false → se pone en this.interimTranscript (texto provisional)
   */
  private initSpeechRecognition(): void {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    this.recognition = new SR();

    this.recognition!.continuous = true;
    this.recognition!.interimResults = true;
    this.recognition!.lang = 'es-ES';

    this.recognition!.onstart = () => {
      this.zone.run(() => {
        this.isRecording = true;
        this.voiceError = '';
        this.cdr.markForCheck();
      });
    };

    this.recognition!.onresult = (event: SpeechRecognitionEvent) => {
      this.zone.run(() => {
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const phrase = text.trim();
            if (phrase) {
              this.voiceHistory = [...this.voiceHistory, { role: 'user', text: phrase }];
              this.scrollTranscriptToBottom();
              this.processVoicePhrase(phrase);
            }
          } else {
            interim = text;
          }
        }

        this.interimTranscript = interim;
        this.cdr.markForCheck();
        this.scrollTranscriptToBottom();
      });
    };

    // onend dispara cuando el browser para (timeout, error, o stop() manual)
    this.recognition!.onend = () => {
      this.zone.run(() => {
        this.isRecording = false;
        this.interimTranscript = '';
        this.cdr.markForCheck();
      });
    };

    this.recognition!.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.zone.run(() => {
        const messages: Record<string, string> = {
          'not-allowed':
            'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.',
          'no-speech': 'No se detectó voz. Intenta hablar más cerca del micrófono.',
          network: 'Error de red al procesar el audio.',
          'audio-capture': 'No se encontró ningún micrófono.',
          'service-not-allowed': 'Servicio de voz no disponible en este contexto.',
        };
        this.voiceError = messages[event.error] ?? `Error de voz: ${event.error}`;
        this.isRecording = false;
        this.cdr.markForCheck();
      });
    };
  }

  /** Borra el historial de conversación */
  clearTranscript(): void {
    this.voiceHistory = [];
    this.interimTranscript = '';
    this.voiceError = '';
    window.speechSynthesis?.cancel();
    this.cdr.markForCheck();
  }

  /** Hace scroll al final del panel de transcripción después de un tick */
  private scrollTranscriptToBottom(): void {
    setTimeout(() => {
      const el = this.transcriptBodyRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  // ── Ejecución de comandos de voz ──────────────────────────────────────────

  /**
   * Envía una frase final al backend, recibe el VoiceCommand interpretado
   * y lo ejecuta sobre el canvas de bpmn-js.
   * Se llama automáticamente desde onresult cada vez que SpeechRecognition
   * confirma una frase completa (isFinal === true).
   */
  private processVoicePhrase(phrase: string): void {
    if (!phrase.trim()) return;

    this.voiceIsExecuting = true;
    this.cdr.markForCheck();

    this.voiceService.parseCommand(phrase, this.processId ?? '').subscribe({
      next: (cmd: VoiceCommand) => {
        this.voiceIsExecuting = false;
        this.executeVoiceCommand(cmd);
        this.cdr.markForCheck();
      },
      error: () => {
        this.voiceIsExecuting = false;
        this.showVoiceResult('✗ Error al conectar con el servidor de comandos de voz');
      },
    });
  }

  /**
   * Despachador principal: recibe un VoiceCommand del backend y ejecuta
   * la operación correspondiente sobre el canvas de bpmn-js.
   *
   * Acciones sobre el canvas se ejecutan fuera de la zona Angular
   * (bpmn-js maneja su propio render) pero el feedback de UI corre dentro.
   */
  executeVoiceCommand(cmd: VoiceCommand): void {
    switch (cmd.action) {
      case 'ADD_NODE':
      case 'ADD_TASK':
      case 'ADD_START_EVENT':
      case 'ADD_END_EVENT':
      case 'ADD_GATEWAY':
        this.vcAddNode(cmd);
        break;

      case 'CONNECT_NODES':
        this.vcConnectNodes(cmd);
        break;

      case 'DELETE_NODE':
        this.vcDeleteNode(cmd);
        break;

      case 'RENAME_NODE':
        this.vcRenameNode(cmd);
        break;

      case 'SET_NODE_DEPARTMENT':
        this.vcSetDepartment(cmd);
        break;

      case 'SET_NODE_SLA':
        this.vcSetSla(cmd);
        break;

      case 'SAVE_PROCESS':
        this.save();
        this.showVoiceResult('💾 Guardando proceso…');
        break;

      case 'PUBLISH_PROCESS':
        this.publish();
        this.showVoiceResult('🚀 Publicando proceso…');
        break;

      case 'ZOOM_IN':
        this.zoomIn();
        this.showVoiceResult('🔍 Zoom acercado');
        break;

      case 'ZOOM_OUT':
        this.zoomOut();
        this.showVoiceResult('🔍 Zoom alejado');
        break;

      case 'FIT_SCREEN':
        this.fitScreen();
        this.showVoiceResult('📐 Vista ajustada a la pantalla');
        break;

      case 'UNDO':
        try {
          this.modeler.get('commandStack').undo();
          this.showVoiceResult('↩ Último cambio deshecho');
        } catch {
          this.showVoiceResult('✗ No hay cambios para deshacer');
        }
        break;

      case 'REDO':
        try {
          this.modeler.get('commandStack').redo();
          this.showVoiceResult('↪ Cambio rehecho');
        } catch {
          this.showVoiceResult('✗ No hay cambios para rehacer');
        }
        break;

      case 'ANALYZE':
      case 'ANALYZE_DIAGRAM':
        this.analyzeDiagram();
        this.showVoiceResult('🔍 Analizando el diagrama…');
        break;

      case 'SELECT_NODE':
        this.vcSelectNode(cmd);
        break;

      case 'CLEAR_SELECTION':
        this.clearSelection();
        this.showVoiceResult('✓ Selección limpiada');
        break;

      case 'EXPLAIN_TOOL': {
        const explanation = cmd.message ?? 'No tengo información sobre esa herramienta.';
        this.showVoiceResult(`ℹ ${explanation}`);
        // La voz ya la maneja speakResponse dentro de showVoiceResult
        break;
      }

      case 'UNKNOWN':
        this.showVoiceResult(
          '⚠ Comando no reconocido — prueba: "agrega tarea", "conecta X con Y", "deshacer", "analizar", "para qué sirve el inicio", "guarda"',
        );
        break;

      default:
        // Acciones válidas sin implementación en canvas (dept, user, tramite…)
        // El backend message ya describe qué haría
        this.showVoiceResult('ℹ ' + (cmd.message ?? cmd.action));
    }
  }

  // ── Implementaciones individuales ─────────────────────────────────────────

  /**
   * Crea un nuevo elemento en el canvas usando el tipo BPMN del comando.
   * Posición calculada automáticamente a la derecha del elemento más a la derecha.
   */
  private vcAddNode(cmd: VoiceCommand): void {
    try {
      const bpmnType = cmd.bpmnType ?? 'bpmn:Task';
      const factory = this.modeler.get('elementFactory');
      const modeling = this.modeler.get('modeling');
      const canvas = this.modeler.get('canvas');
      const root = canvas.getRootElement();
      const position = this.vcCalcNextPosition();

      const shape = factory.createShape({ type: bpmnType });
      const newElement = modeling.createShape(shape, position, root);

      if (cmd.nodeName) {
        modeling.updateLabel(newElement, cmd.nodeName);
      }

      this.showVoiceResult(`✓ '${cmd.nodeName ?? bpmnType}' agregado al diagrama`);
    } catch {
      this.showVoiceResult('✗ No se pudo agregar el elemento al canvas');
    }
  }

  /**
   * Busca dos elementos por nombre y los conecta con una SequenceFlow.
   * Falla con feedback si alguno no existe en el canvas.
   */
  private vcConnectNodes(cmd: VoiceCommand): void {
    const src = this.vcFindByName(cmd.sourceNode);
    const tgt = this.vcFindByName(cmd.targetNode);

    if (!src) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.sourceNode}'`);
      return;
    }
    if (!tgt) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.targetNode}'`);
      return;
    }

    try {
      this.modeler.get('modeling').connect(src, tgt);
      this.showVoiceResult(`✓ '${cmd.sourceNode}' → '${cmd.targetNode}' conectados`);
    } catch {
      this.showVoiceResult('✗ No se pudo crear la conexión (¿ya existe?)');
    }
  }

  /**
   * Elimina un elemento del canvas por nombre.
   * Protege el proceso raíz para no dejarlo vacío.
   */
  private vcDeleteNode(cmd: VoiceCommand): void {
    const el = this.vcFindByName(cmd.nodeName);
    if (!el) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.nodeName}'`);
      return;
    }
    if (el.type === 'bpmn:Process' || el.type === '__implicitroot') {
      this.showVoiceResult('✗ No se puede eliminar el proceso raíz');
      return;
    }
    try {
      this.modeler.get('modeling').removeElements([el]);
      this.showVoiceResult(`✓ Nodo '${cmd.nodeName}' eliminado`);
    } catch {
      this.showVoiceResult('✗ No se pudo eliminar el nodo');
    }
  }

  /** Cambia la etiqueta visible de un elemento en el canvas */
  private vcRenameNode(cmd: VoiceCommand): void {
    const el = this.vcFindByName(cmd.nodeName);
    if (!el) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.nodeName}'`);
      return;
    }
    try {
      this.modeler.get('modeling').updateLabel(el, cmd.newName ?? '');
      this.showVoiceResult(`✓ Renombrado a '${cmd.newName}'`);
    } catch {
      this.showVoiceResult('✗ No se pudo renombrar el nodo');
    }
  }

  /**
   * Asigna un departamento a un nodo actualizando nodePropsMap.
   * La asignación se persiste cuando el usuario guarda el proceso.
   */
  private vcSetDepartment(cmd: VoiceCommand): void {
    const el = this.vcFindByName(cmd.nodeName);
    if (!el) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.nodeName}'`);
      return;
    }

    const dept = this.departments.find(
      (d) => d.name.toLowerCase() === (cmd.departmentName ?? '').toLowerCase(),
    );
    if (!dept) {
      this.showVoiceResult(`✗ Departamento '${cmd.departmentName}' no existe en la lista cargada`);
      return;
    }

    const current = this.nodePropsMap[el.id] ?? {
      name: el.businessObject?.name ?? '',
      departmentId: '',
      slaHours: 0,
      formSchemaId: '',
    };
    this.nodePropsMap[el.id] = { ...current, departmentId: dept.id };
    this.showVoiceResult(`✓ Nodo '${cmd.nodeName}' asignado al departamento '${dept.name}'`);
  }

  /**
   * Actualiza las horas de SLA de un nodo en nodePropsMap.
   * Si no se especificó nombre, usa el elemento actualmente seleccionado.
   */
  private vcSetSla(cmd: VoiceCommand): void {
    const el = cmd.nodeName ? this.vcFindByName(cmd.nodeName) : this.selectedElement;

    if (!el) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.nodeName ?? '(seleccionado)'}'`);
      return;
    }

    const current = this.nodePropsMap[el.id] ?? {
      name: el.businessObject?.name ?? '',
      departmentId: '',
      slaHours: 0,
      formSchemaId: '',
    };
    this.nodePropsMap[el.id] = { ...current, slaHours: cmd.slaHours ?? 0 };
    this.showVoiceResult(`✓ SLA de '${el.businessObject?.name}' actualizado a ${cmd.slaHours}h`);
  }

  /** Selecciona un nodo por nombre y actualiza el panel de propiedades. */
  private vcSelectNode(cmd: VoiceCommand): void {
    const el = this.vcFindByName(cmd.nodeName);
    if (!el) {
      this.showVoiceResult(`✗ No se encontró el nodo '${cmd.nodeName}'`);
      return;
    }
    try {
      this.modeler.get('selection').select(el);
      this.zone.run(() => {
        this.selectedElement = el;
        this.nodeProps = this.nodePropsMap[el.id] ?? {
          name: el.businessObject?.name ?? '',
          departmentId: '',
          slaHours: 0,
          formSchemaId: '',
        };
        this.cdr.markForCheck();
      });
      this.showVoiceResult(`✓ Nodo '${cmd.nodeName}' seleccionado`);
    } catch {
      this.showVoiceResult('✗ No se pudo seleccionar el nodo');
    }
  }

  // ── Helpers de canvas ─────────────────────────────────────────────────────

  /**
   * Busca un elemento en el canvas por nombre (case-insensitive).
   * Compara businessObject.name con el texto recibido del comando.
   */
  private vcFindByName(name: string | undefined | null): any | null {
    if (!name?.trim()) return null;
    const registry = this.modeler.get('elementRegistry');
    const lowerName = name.toLowerCase().trim();

    return (
      registry.getAll().find((el: any) => {
        const elName = (el.businessObject?.name ?? '').toLowerCase().trim();
        return elName === lowerName;
      }) ?? null
    );
  }

  /**
   * Calcula la posición del próximo elemento a agregar.
   * Si hay elementos en el canvas, coloca el nuevo 150px a la derecha
   * del elemento más a la derecha. Si el canvas está vacío, usa (300, 200).
   *
   * La posición retornada es el CENTRO del nuevo shape, que es lo que
   * espera modeling.createShape() como segundo parámetro.
   */
  private vcCalcNextPosition(): { x: number; y: number } {
    const registry = this.modeler.get('elementRegistry');
    const shapes = registry
      .getAll()
      .filter(
        (el: any) =>
          el.width > 0 &&
          el.type !== '__implicitroot' &&
          el.type !== 'bpmn:Process' &&
          el.type !== 'bpmn:SequenceFlow',
      );

    if (shapes.length === 0) return { x: 300, y: 200 };

    const rightmost = shapes.reduce((max: any, el: any) =>
      el.x + el.width > max.x + max.width ? el : max,
    );

    return {
      x: rightmost.x + rightmost.width + 150,
      y: rightmost.y + Math.round(rightmost.height / 2),
    };
  }

  /**
   * Muestra el resultado de un comando, lo agrega al historial conversacional
   * y lo vocaliza vía Web Speech Synthesis.
   */
  private showVoiceResult(msg: string): void {
    if (this.voiceFeedbackTimer) clearTimeout(this.voiceFeedbackTimer);
    this.voiceCommandResult = msg;

    // Texto limpio para el historial (sin emojis de estado al inicio)
    const aiText = msg.replace(/^[✓✗⚠ℹ💾🚀🔍📐⏳]\s*/, '').trim();
    this.voiceHistory = [...this.voiceHistory, { role: 'ai', text: aiText }];
    this.speakResponse(aiText);
    this.cdr.markForCheck();
    this.scrollTranscriptToBottom();

    this.voiceFeedbackTimer = setTimeout(() => {
      this.voiceCommandResult = '';
      this.cdr.markForCheck();
    }, 6000);
  }

  /** Vocaliza la respuesta del agente y controla el estado isSpeaking. */
  private speakResponse(text: string): void {
    if (!('speechSynthesis' in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'es-ES';
    utt.rate = 1.05;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    utt.onstart = () => {
      this.isSpeaking = true;
      this.cdr.markForCheck();
    };
    utt.onend = () => {
      this.isSpeaking = false;
      this.cdr.markForCheck();
    };
    utt.onerror = () => {
      this.isSpeaking = false;
      this.cdr.markForCheck();
    };
    window.speechSynthesis.speak(utt);
  }

  /**
   * Configura el awareness de Yjs para cursores colaborativos.
   * Debe llamarse después de que wsProvider esté creado.
   *
   * Coordenadas en canvas space (bpmn-js world):
   *   canvasX = (mouseX_en_px / zoom) + viewbox.x
   * Así el cursor sigue siendo correcto aunque otro usuario tenga distinto zoom/pan.
   */
  private initAwareness(): void {
    this.injectCursorStyles(); // una sola vez: inyecta @keyframes en el <head>

    const awareness = this.wsProvider.awareness;
    const currentUser = this.authService.getCurrentUser();
    const clientId: number = this.ydoc.clientID;
    const color = this.generateCursorColor(clientId);

    awareness.setLocalState({
      user: { name: currentUser?.name ?? 'Admin', color },
      cursor: null,
    });

    // Mousemove → convertir a canvas coords y publicar en awareness (throttle 40ms ≈ 25fps)
    this.mousemoveHandler = (e: MouseEvent) => {
      const now = Date.now();
      if (now - this.lastAwarenessMs < 40) return;
      this.lastAwarenessMs = now;

      const bpmnCanvas = this.modeler.get('canvas');
      const viewbox = bpmnCanvas.viewbox();
      const rect = this.canvasWrapperRef.nativeElement.getBoundingClientRect();
      const x = (e.clientX - rect.left) / viewbox.scale + viewbox.x;
      const y = (e.clientY - rect.top) / viewbox.scale + viewbox.y;
      awareness.setLocalStateField('cursor', { x, y });
    };

    // Mouseleave → ocultar nuestro cursor a los demás
    this.mouseleaveHandler = () => {
      awareness.setLocalStateField('cursor', null);
      this.renderCursors(awareness);
    };

    // Usar canvas-wrapper como target: captura eventos aunque bpmn-js los detenga
    this.canvasWrapperRef.nativeElement.addEventListener('mousemove', this.mousemoveHandler);
    this.canvasWrapperRef.nativeElement.addEventListener('mouseleave', this.mouseleaveHandler);

    // Awareness cambia (otro usuario movió el mouse) → re-renderizar
    this.awarenessChangeHook = () => this.renderCursors(awareness);
    awareness.on('change', this.awarenessChangeHook);

    // Zoom/pan local → re-proyectar cursores remotos a nuevas coords de pantalla
    this.modeler.on('canvas.viewbox.changed', () => this.renderCursors(awareness));
  }

  /**
   * Lee todos los estados de awareness y sincroniza el DOM de cursores.
   * - Elimina elementos de usuarios desconectados.
   * - Crea o actualiza el div de cada usuario remoto.
   */
  private renderCursors(awareness: any): void {
    if (!this.cursorsLayerRef) return;

    const states: Map<number, any> = awareness.getStates();
    const localId: number = awareness.clientID;
    const layer = this.cursorsLayerRef.nativeElement;

    // Eliminar cursores de usuarios que ya no están
    const toRemove: number[] = [];
    for (const [id] of this.cursorElements) {
      if (!states.has(id) || id === localId) toRemove.push(id);
    }
    for (const id of toRemove) {
      layer.removeChild(this.cursorElements.get(id)!);
      this.cursorElements.delete(id);
    }

    const bpmnCanvas = this.modeler.get('canvas');
    const viewbox = bpmnCanvas.viewbox();

    // Construir lista de peers para la toolbar
    const peers: { clientId: number; name: string; color: string }[] = [];

    states.forEach((state: any, id: number) => {
      if (id === localId) return;

      // Peer conectado → agregar a la lista de avatares aunque no tenga cursor
      if (state?.user) {
        peers.push({ clientId: id, name: state.user.name, color: state.user.color });
      }

      if (!state?.cursor || !state?.user) {
        // Sin cursor visible → eliminar elemento si existía
        if (this.cursorElements.has(id)) {
          layer.removeChild(this.cursorElements.get(id)!);
          this.cursorElements.delete(id);
        }
        return;
      }

      // Canvas coords → screen coords relativas al canvas-wrapper
      const screenX = (state.cursor.x - viewbox.x) * viewbox.scale;
      const screenY = (state.cursor.y - viewbox.y) * viewbox.scale;

      let el = this.cursorElements.get(id);
      if (!el) {
        el = this.buildCursorElement(state.user.name, state.user.color);
        layer.appendChild(el);
        this.cursorElements.set(id, el);
      }

      el.style.transform = `translate(${screenX}px, ${screenY}px)`;
    });

    // Actualizar avatares de la toolbar (entra en zona Angular para OnPush)
    this.zone.run(() => {
      this.collabPeers = peers;
      this.cdr.markForCheck();
    });
  }

  /**
   * Inyecta una vez los @keyframes de animación del cursor en el <head>.
   * Se llama desde initAwareness() al iniciar la sesión colaborativa.
   */
  private injectCursorStyles(): void {
    if (document.getElementById('collab-cursor-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'collab-cursor-keyframes';
    style.textContent = `
      @keyframes collabRingPulse {
        0%   { transform: scale(1);   opacity: 0.6; }
        70%  { transform: scale(1.7); opacity: 0; }
        100% { transform: scale(1.7); opacity: 0; }
      }
      @keyframes collabBounceIn {
        0%   { transform: scale(0); opacity: 0; }
        60%  { transform: scale(1.15); }
        100% { transform: scale(1);   opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Crea el elemento DOM de un cursor colaborativo:
   * avatar circular con inicial + anillo pulsante + etiqueta de nombre.
   * Coordina como Google Docs / Figma.
   */
  private buildCursorElement(name: string, color: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'pointer-events:none',
      'transition:transform 60ms linear',
      'will-change:transform',
      'z-index:100',
      'animation:collabBounceIn 0.3s ease',
    ].join(';');

    const initial = name.charAt(0).toUpperCase();

    wrap.innerHTML = `
      <div style="position:relative;display:flex;align-items:flex-start;gap:0;">

        <!-- Avatar circular + anillo pulsante -->
        <div style="position:relative;width:30px;height:30px;flex-shrink:0;">

          <!-- Anillo de pulso animado -->
          <div style="
            position:absolute;inset:-3px;
            border-radius:50%;
            border:2.5px solid ${color};
            animation:collabRingPulse 1.8s ease-out infinite;
            pointer-events:none;
          "></div>

          <!-- Círculo del avatar -->
          <div style="
            width:30px;height:30px;
            border-radius:50%;
            background:${color};
            display:flex;align-items:center;justify-content:center;
            font-size:13px;font-weight:700;
            color:#fff;
            font-family:system-ui,-apple-system,sans-serif;
            box-shadow:0 3px 10px rgba(0,0,0,0.35);
            border:2px solid rgba(255,255,255,0.7);
          ">${initial}</div>
        </div>

        <!-- Pequeño triángulo apuntando como cursor -->
        <svg width="10" height="10" viewBox="0 0 10 10"
             style="margin-top:22px;margin-left:-3px;flex-shrink:0;
                    filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))">
          <polygon points="0,0 10,0 0,10" fill="${color}"/>
        </svg>

        <!-- Etiqueta con el nombre -->
        <span style="
          position:absolute;left:34px;top:4px;
          background:${color};color:#fff;
          font-size:11px;font-weight:600;
          padding:3px 8px;border-radius:6px;
          white-space:nowrap;
          font-family:system-ui,-apple-system,sans-serif;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          line-height:1.4;
          letter-spacing:0.02em;
        ">${name}</span>

      </div>`;

    return wrap;
  }

  /**
   * Genera un color HSL visualmente distinto para cada usuario.
   * El multiplicador 137.508° (ángulo áureo) distribuye los colores
   * uniformemente en el espectro sin importar cuántos usuarios haya.
   */
  private generateCursorColor(clientId: number): string {
    const hue = Math.round((clientId * 137.508) % 360);
    return `hsl(${hue},70%,45%)`;
  }

  ngOnDestroy(): void {
    // Limpiar listeners de cursores
    if (this.mousemoveHandler)
      this.canvasWrapperRef?.nativeElement.removeEventListener('mousemove', this.mousemoveHandler);
    if (this.mouseleaveHandler)
      this.canvasWrapperRef?.nativeElement.removeEventListener(
        'mouseleave',
        this.mouseleaveHandler,
      );
    if (this.awarenessChangeHook && this.wsProvider?.awareness)
      this.wsProvider.awareness.off('change', this.awarenessChangeHook);

    // Detener reconocimiento de voz si está activo
    if (this.recognition) {
      this.recognition.onend = null; // evitar que onend reactive el estado
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      try {
        this.recognition.abort();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
    if (this.voiceFeedbackTimer) clearTimeout(this.voiceFeedbackTimer);
    window.speechSynthesis?.cancel();

    if (this.collabDebounceTimer) clearTimeout(this.collabDebounceTimer);
    this.wsProvider?.destroy();
    this.ydoc?.destroy();
    this.modeler?.destroy();
  }
}
