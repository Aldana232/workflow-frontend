import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TramiteService } from '../../core/services/tramite';
import { ProcessService } from '../../core/services/process';
import { BpmnDiagram } from '../../shared/components/bpmn-diagram/bpmn-diagram';

interface NodeStep {
  id: string;
  label: string;
  type: string;
  state: 'completed' | 'current' | 'pending';
}

@Component({
  selector: 'app-flow-view',
  imports: [BpmnDiagram],
  templateUrl: './flow-view.html',
  styleUrl: './flow-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowView implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private tramiteService = inject(TramiteService);
  private processService = inject(ProcessService);
  private cdr            = inject(ChangeDetectorRef);

  loading = true;
  tramite: any = null;
  process: any = null;
  bpmnXml = '';
  currentNodeId: string | null = null;
  steps: NodeStep[] = [];

  ngOnInit(): void {
    const routeParam = this.route.snapshot.paramMap.get('tramiteId');
    if (!routeParam) { this.goBack(); return; }

    const stateId: string | undefined = (window.history.state as any)?.tramiteId;
    const fetch$ = stateId
      ? this.tramiteService.getById(stateId)
      : this.tramiteService.getByCode(routeParam);

    fetch$.subscribe({
      next: (t: any) => {
        this.tramite = t;
        this.currentNodeId = t.currentNodeId ?? null;
        if (t.processId) this.loadProcess(t.processId);
        else { this.loading = false; this.cdr.markForCheck(); }
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private loadProcess(processId: string): void {
    this.processService.getById(processId).subscribe({
      next: (p: any) => {
        this.process  = p;
        this.bpmnXml  = p.bpmnXml ?? '';
        this.steps    = this.buildSteps(p);
        this.loading  = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private buildSteps(process: any): NodeStep[] {
    const nodes: any[] = process.nodes ?? [];
    const edges: any[] = process.edges ?? [];

    // Sólo nodos visibles (no START/END internos)
    const visibleTypes = ['USER_TASK', 'EXCLUSIVE_GW', 'PARALLEL_GW', 'LOOP_GW'];

    // Ordenar nodos siguiendo las conexiones desde START
    const ordered = this.topoSort(nodes, edges);

    // Historial de nodos ya procesados
    const history: string[] = (this.tramite?.history ?? [])
      .map((h: any) => {
        const m = (h.action ?? '').match(/nodo[:\s]+(\S+)/i);
        return m ? m[1] : null;
      })
      .filter(Boolean);

    return ordered
      .filter((n: any) => visibleTypes.includes(n.type))
      .map((n: any): NodeStep => {
        let state: 'completed' | 'current' | 'pending' = 'pending';
        if (n.id === this.currentNodeId) state = 'current';
        else if (history.includes(n.id)) state = 'completed';
        return { id: n.id, label: n.label ?? n.id, type: n.type, state };
      });
  }

  private topoSort(nodes: any[], edges: any[]): any[] {
    if (!nodes.length) return [];
    const map = new Map(nodes.map(n => [n.id, n]));
    const visited = new Set<string>();
    const result: any[] = [];

    const start = nodes.find(n => n.type === 'START') ?? nodes[0];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      result.push(map.get(id));
      edges.filter(e => e.source === id).forEach(e => visit(e.target));
    };
    visit(start.id);
    // Agregar nodos no alcanzados
    nodes.forEach(n => { if (!visited.has(n.id)) result.push(n); });
    return result;
  }

  stateIcon(state: string): string {
    if (state === 'completed') return '✅';
    if (state === 'current')   return '🔵';
    return '⏳';
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      USER_TASK:    'Tarea',
      EXCLUSIVE_GW: 'Decisión',
      PARALLEL_GW:  'Paralelo',
      LOOP_GW:      'Bucle',
    };
    return map[type] ?? type;
  }

  get currentNodeLabel(): string {
    const node = (this.process?.nodes ?? []).find((n: any) => n.id === this.currentNodeId);
    return node?.label ?? this.currentNodeId ?? '—';
  }

  get completedCount(): number {
    return this.steps.filter(s => s.state === 'completed').length;
  }

  get progressPct(): number {
    if (!this.steps.length) return 0;
    const done = this.steps.filter(s => s.state !== 'pending').length;
    return Math.round((done / this.steps.length) * 100);
  }

  goBack(): void {
    this.router.navigate(['/funcionario/dashboard']);
  }

  formatTs(ts: string): string {
    if (!ts) return '';
    return ts.toString().replace('T', ' ').slice(0, 16);
  }

  goProcess(): void {
    if (this.tramite?.id) {
      const slug = this.tramite.code || this.tramite.id;
      this.router.navigate(['/funcionario/task', slug], { state: { taskId: this.tramite.id } });
    }
  }
}
