import {
  Component, inject, OnInit, OnDestroy,
  ChangeDetectorRef, ChangeDetectionStrategy,
  ViewChild, ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  LucideArrowLeft,
  LucideCircleX,
  LucideCircleCheck,
  LucideRefreshCw,
  LucidePencilLine,
  LucideExternalLink,
  LucidePaperclip,
  LucideMessageCircle,
  LucideBot,
  LucideX,
  LucideMic,
  LucideSend,
  LucideArrowRight,
} from '@lucide/angular';
import { TramiteService } from '../../core/services/tramite';
import { ProcessService } from '../../core/services/process';
import { AssistantService, ChatMessage } from '../../core/services/assistant';
import { SpeechService } from '../../core/services/speech';
import { DynamicForm, FormField } from '../../shared/components/dynamic-form/dynamic-form';
import { BpmnDiagram } from '../../shared/components/bpmn-diagram/bpmn-diagram';
import { DocumentManagerComponent } from '../../shared/components/document-manager/document-manager.component';

@Component({
  selector: 'app-task-detail',
  imports: [
    DynamicForm,
    BpmnDiagram,
    FormsModule,
    DocumentManagerComponent,
    LucideArrowLeft,
    LucideCircleX,
    LucideCircleCheck,
    LucideRefreshCw,
    LucidePencilLine,
    LucideExternalLink,
    LucidePaperclip,
    LucideMessageCircle,
    LucideBot,
    LucideX,
    LucideMic,
    LucideSend,
    LucideArrowRight,
  ],
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetail implements OnInit, OnDestroy {
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private tramiteService    = inject(TramiteService);
  private processService    = inject(ProcessService);
  private assistantService  = inject(AssistantService);
  private speechService     = inject(SpeechService);
  private toastr            = inject(ToastrService);
  private cdr               = inject(ChangeDetectorRef);

  // ── Chat flotante ───────────────────────────────────────────────────────────
  @ViewChild('chatBody') private chatBodyRef!: ElementRef<HTMLElement>;

  isChatOpen      = false;
  chatMessages: ChatMessage[] = [];
  chatInput       = '';
  chatLoading     = false;
  isMicListening  = false;
  isSpeaking      = false;   // true while speechSynthesis is active → avatar pulse

  /** True when the last chat input was captured via microphone — triggers TTS on response. */
  private lastInputWasMic    = false;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;

  taskId: string | null = null;
  task: any = null;
  tramite: any = null;

  // Modo procesamiento
  canProcess = false;
  formFields: FormField[] | null = null;

  // Modo read-only (tarea ya completada)
  submittedData: Record<string, any> | null = null;
  submittedObservations: string | null = null;

  bpmnXml       = '';
  currentNodeId: string | null = null;
  observations  = '';
  loading       = true;
  submitting    = false;

  ngOnInit(): void {
    const routeParam = this.route.snapshot.paramMap.get('id');
    if (!routeParam) { this.router.navigate(['/funcionario/dashboard']); return; }

    const stateTaskId: string | undefined = (window.history.state as any)?.taskId;

    this.tramiteService.getMyTasks().subscribe({
      next: (tasks: any[]) => {
        this.task = stateTaskId
          ? (tasks.find((t: any) => String(t.id) === String(stateTaskId))
              ?? tasks.find((t: any) => t.tramiteCode === routeParam)
              ?? null)
          : (tasks.find((t: any) => t.tramiteCode === routeParam) ?? null);

        this.taskId = this.task?.id ?? null;

        if (this.task) {
          this.canProcess = this.task.canProcess ?? false;
          const tramiteId = this.task.tramiteId ?? this.task.id;
          this.currentNodeId = this.task.nodeId ?? this.task.currentNodeId ?? null;

          this.loadTramite(tramiteId);

          if (this.task.processId) this.loadDiagram(this.task.processId);

          if (this.canProcess) {
            // Tarea activa: cargar formulario para completar
            this.loadForm(tramiteId);
          } else {
            // Tarea completada o en otro dept: cargar datos enviados
            const nodeId = this.task.nodeId ?? this.currentNodeId;
            if (tramiteId && nodeId) {
              this.loadSubmission(tramiteId, nodeId);
            } else {
              this.loading = false;
              this.cdr.markForCheck();
            }
          }
        } else {
          this.loading = false;
          this.cdr.markForCheck();
        }
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private loadTramite(tramiteId: string): void {
    this.tramiteService.getById(tramiteId).subscribe({
      next: (t: any) => { this.tramite = t; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private loadForm(tramiteId: string): void {
    const nodeId = this.task?.nodeId ?? this.currentNodeId;
    const form$ = nodeId
      ? this.tramiteService.getFormForNode(tramiteId, nodeId)
      : this.tramiteService.getCurrentForm(tramiteId);
    form$.subscribe({
      next: (schema: any) => {
        this.formFields = (schema?.fields ?? []).map((f: any, i: number) => {
          const rawName = f.name ?? f.id;
          const name = (rawName && String(rawName).trim())
            ? String(rawName).trim()
            : this.slugify(f.label ?? '') || `campo_${i}`;
          return {
            name,
            label:       f.label,
            type:        f.type,
            required:    f.required,
            placeholder: f.placeholder,
            value:       f.value,
            options:     Array.isArray(f.options)
              ? f.options.map((o: any) =>
                  typeof o === 'string' ? { label: o, value: o } : o)
              : undefined,
          };
        }) as FormField[];
        this.loading = false;
        this.cdr.markForCheck();
        this.speakOnLoad();   // saludo proactivo al cargar el formulario
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  /**
   * Construye el saludo inicial del asistente mencionando
   * exactamente los campos requeridos del nodo actual.
   * Se llama una sola vez al abrir el chat o al regenerar el panel.
   */
  private generateGreeting(): string {
    const nombre   = this.clienteInfo?.nombre ?? 'el cliente';
    const required = (this.formFields ?? [])
      .filter(f => f.required)
      .map(f => f.label)
      .slice(0, 4);

    let msg = `¡Hola! Soy el asistente de SAGUAPAC. Estoy aquí para ayudarte con el trámite ${this.displayCode} de ${nombre}.`;

    if (required.length > 0) {
      msg += ` Los campos obligatorios de este formulario son: ${required.join(', ')}.`;
      msg += ' ¿Tienes alguna duda sobre cómo completarlos?';
    } else {
      msg += ' ¿En qué necesitas ayuda?';
    }
    return msg;
  }

  /**
   * Dice en voz alta un saludo breve cuando el formulario termina de cargar.
   * Solo habla si el funcionario tiene que procesar la tarea (canProcess = true).
   */
  private speakOnLoad(): void {
    if (!this.canProcess || !this.formFields?.length) return;

    const required = this.formFields
      .filter(f => f.required)
      .map(f => f.label)
      .slice(0, 3);

    const camposStr = required.length
      ? ` Los campos requeridos son: ${required.join(', ')}.`
      : '';

    setTimeout(() =>
      this.speechService.speak(
        `Hola. Tienes una tarea pendiente.${camposStr} Abre el asistente si necesitas ayuda.`
      ), 900
    );
  }

  private loadSubmission(tramiteId: string, nodeId: string): void {
    this.tramiteService.getSubmission(tramiteId, nodeId).subscribe({
      next: (sub: any) => {
        this.submittedData = sub?.formData ?? null;
        this.submittedObservations = sub?.comments ?? null;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.submittedData = null;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadDiagram(processId: string): void {
    this.processService.getById(processId).subscribe({
      next: (p: any) => { this.bpmnXml = p.bpmnXml ?? ''; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  onSubmit(values: Record<string, any>): void {
    if (!this.taskId) return;
    this.submitting = true;

    const tramiteId = this.task?.tramiteId ?? this.task?.id ?? this.taskId;
    const nodeId    = this.task?.nodeId ?? this.currentNodeId;

    this.tramiteService.submitTask(tramiteId, {
      nodeId,
      formData:     values,
      observations: this.observations.trim() || null,
    }).subscribe({
      next: () => {
        this.toastr.success('Tarea completada. El trámite avanzó al siguiente paso.', 'Éxito');
        this.router.navigate(['/funcionario/dashboard']);
      },
      error: (err: any) => {
        const msg = err?.error?.message ?? 'Error al enviar la tarea';
        this.toastr.error(msg, 'Error');
        this.submitting = false;
        this.cdr.markForCheck();
      },
    });
  }

  completeWithoutForm(): void { this.onSubmit({}); }

  goBack(): void { this.router.navigate(['/funcionario/dashboard']); }

  ngOnDestroy(): void {
    this.stopSpeakTrack();
    this.speechService.stopSpeaking();
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      if (this.chatMessages.length === 0) {
        this.chatMessages.push({
          role: 'assistant',
          content: this.generateGreeting(),
        });
      }
      this.startSpeakTrack();   // poll speechSynthesis while panel is open → avatar pulse
    } else {
      this.stopSpeakTrack();
    }
    this.cdr.markForCheck();
    if (this.isChatOpen) this.scrollChatToBottom();
  }

  // ── Speaking-state tracker ────────────────────────────────────────────────

  /** Polls window.speechSynthesis.speaking every 150 ms → drives isSpeaking. */
  private startSpeakTrack(): void {
    if (this.speakingTimer) return;
    this.speakingTimer = setInterval(() => {
      const active = 'speechSynthesis' in window && window.speechSynthesis.speaking;
      if (active !== this.isSpeaking) {
        this.isSpeaking = active;
        this.cdr.markForCheck();
      }
    }, 150);
  }

  private stopSpeakTrack(): void {
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer);
      this.speakingTimer = null;
    }
    if (this.isSpeaking) { this.isSpeaking = false; this.cdr.markForCheck(); }
  }

  sendMessage(): void {
    const text = this.chatInput.trim();
    if (!text || this.chatLoading) return;

    const tramiteId = this.task?.tramiteId ?? this.task?.id ?? this.taskId;
    if (!tramiteId) return;

    // Capture before reset so the subscribe closure knows whether to speak
    const speakResponse = this.lastInputWasMic;
    this.lastInputWasMic = false;

    this.chatMessages.push({ role: 'user', content: text });
    this.chatInput   = '';
    this.chatLoading = true;
    this.cdr.markForCheck();
    this.scrollChatToBottom();

    this.assistantService.ask(text, tramiteId, this.currentNodeId).subscribe({
      next: (answer) => {
        this.chatMessages.push({ role: 'assistant', content: answer });
        if (speakResponse) {
          this.speechService.stopSpeaking();
          this.speechService.speak(answer);
        }
        this.chatLoading = false;
        this.cdr.markForCheck();
        this.scrollChatToBottom();
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.error?.error
          ?? 'Error al consultar el asistente. Intenta de nuevo.';
        this.chatMessages.push({ role: 'assistant', content: msg });
        this.chatLoading = false;
        this.cdr.markForCheck();
        this.scrollChatToBottom();
      },
    });
  }

  /** Activates the microphone, converts speech to text, then sends as a chat message. */
  listenForChat(): void {
    if (this.isMicListening || this.chatLoading) return;
    this.isMicListening = true;
    this.cdr.markForCheck();

    this.speechService.listen().subscribe({
      next: (text) => {
        this.isMicListening  = false;
        this.lastInputWasMic = true;
        this.chatInput       = text;
        this.cdr.markForCheck();
        this.sendMessage();
      },
      error: () => {
        this.isMicListening = false;
        this.cdr.markForCheck();
      },
    });
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = this.chatBodyRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private slugify(text: string): string {
    return (text ?? '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campo';
  }

  get displayCode(): string   { return this.tramite?.code ?? this.task?.tramiteCode ?? '—'; }
  get displayStatus(): string { return this.tramite?.status ?? this.task?.status ?? 'ACTIVE'; }
  get isCompleted(): boolean  { return this.displayStatus === 'COMPLETED'; }
  get isCancelled(): boolean  { return this.displayStatus === 'CANCELLED'; }
  get statusLabel(): string {
    const s = this.displayStatus;
    if (s === 'COMPLETED') return 'COMPLETADO';
    if (s === 'CANCELLED') return 'RECHAZADO';
    return s;
  }
  get clienteInfo(): any      { return this.tramite?.clienteInfo ?? null; }

  submittedEntries(): { key: string; value: any }[] {
    if (!this.submittedData) return [];
    return Object.entries(this.submittedData).map(([key, value]) => ({ key, value }));
  }
}
