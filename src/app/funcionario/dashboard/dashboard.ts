import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TramiteService } from '../../core/services/tramite';
import { AuthService } from '../../core/services/auth';
import { DepartmentService } from '../../core/services/department';
import { NotificationService, WorkflowEvent } from '../../core/services/notification';
import {
  LucideCalendar, LucideBuilding2, LucidePencil, LucideCircleCheck,
  LucideEye, LucideSearch,
} from '@lucide/angular';

interface TaskRow {
  id: string;
  tramiteId: string;
  tramiteCode: string;
  processName: string;
  nodeName: string;
  arrivedAt: string;
  slaHours: number;
  status: string;
  departmentId: string;
  canProcess: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    LucideCalendar, LucideBuilding2, LucidePencil, LucideCircleCheck,
    LucideEye, LucideSearch,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private tramiteService       = inject(TramiteService);
  public  authService          = inject(AuthService);
  private router               = inject(Router);
  private cdr                  = inject(ChangeDetectorRef);
  private departmentService    = inject(DepartmentService);
  private notificationService  = inject(NotificationService);
  private destroyRef           = inject(DestroyRef);

  tasks: TaskRow[] = [];
  loading = true;
  canInitiate = false;
  private deptMap = new Map<string, string>();

  get userName(): string {
    return this.authService.getCurrentUser()?.name ?? 'Funcionario';
  }

  ngOnInit(): void {
    // Insertar la nueva tarea directamente en memoria, sin llamada HTTP adicional
    this.notificationService.deptEvent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: WorkflowEvent) => {
        // Deduplicar: ignorar si ya existe la misma tarea (tramite + nodo)
        const alreadyExists = this.tasks.some(
          t => t.tramiteId === event.tramiteId && t.nodeName === (event.nodeName ?? '')
        );
        if (alreadyExists) return;

        const newTask: TaskRow = {
          id:           event.tramiteId,
          tramiteId:    event.tramiteId,
          tramiteCode:  event.tramiteCode,
          processName:  event.processName,
          nodeName:     event.nodeName     ?? '—',
          arrivedAt:    event.timestamp,
          slaHours:     0,   // no disponible en el evento
          status:       event.status       ?? 'ACTIVE',
          departmentId: event.departmentId ?? '—',
          canProcess:   true, // TASK_ASSIGNED siempre es procesable
        };

        this.tasks = [newTask, ...this.tasks]; // al inicio — visibilidad inmediata
        this.cdr.markForCheck();
      });

    this.departmentService.getAll().subscribe({
      next: (depts: any[]) => {
        depts.forEach((d: any) => this.deptMap.set(d.id, d.name));
        this.cdr.markForCheck();
      },
      error: () => {},
    });

    // Saber si este usuario puede iniciar tramites (es el dpto de entrada)
    this.tramiteService.canInitiate().subscribe({
      next: (val: boolean) => {
        this.canInitiate = val;
        this.authService.setCanInitiate(val); // compartir con sidebar
        this.cdr.markForCheck();
      },
      error: () => {}, // sin bloquear la carga de tareas
    });

    this.loadTasks();
  }

  private loadTasks(): void {
    this.tramiteService.getMyTasks().subscribe({
      next: (data: any[]) => {
        this.tasks = data.map((t: any) => ({
          id:           t.id,
          tramiteId:    t.tramiteId   ?? t.id,
          tramiteCode:  t.tramiteCode ?? '—',
          processName:  t.processName ?? '—',
          nodeName:     t.nodeName    ?? t.nodeId ?? '—',
          arrivedAt:    t.arrivedAt   ?? t.startedAt ?? '',
          slaHours:     t.slaHours    ?? 0,
          status:       t.status      ?? 'ACTIVE',
          departmentId: t.departmentId ?? '—',
          canProcess:   t.canProcess   ?? false,
        }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  getDeptName(id: string): string {
    return this.deptMap.get(id) ?? id ?? '—';
  }

  openTask(task: TaskRow): void {
    const slug = task.tramiteCode || task.id;
    this.router.navigate(['/funcionario/task', slug], { state: { taskId: task.id } });
  }

  openFlow(task: TaskRow): void {
    const slug = task.tramiteCode || task.tramiteId;
    this.router.navigate(['/funcionario/flow', slug], { state: { tramiteId: task.tramiteId } });
  }

  slaClass(task: TaskRow): string {
    if (!task.arrivedAt || !task.slaHours) return 'sla-ok';
    const hoursElapsed = (Date.now() - new Date(task.arrivedAt).getTime()) / 3_600_000;
    const pct = hoursElapsed / task.slaHours;
    if (pct >= 1)   return 'sla-overdue';
    if (pct >= 0.7) return 'sla-warning';
    return 'sla-ok';
  }

  slaLabel(task: TaskRow): string {
    if (!task.arrivedAt || !task.slaHours) return `SLA: ${task.slaHours}h`;
    const hoursElapsed = (Date.now() - new Date(task.arrivedAt).getTime()) / 3_600_000;
    const remaining = task.slaHours - hoursElapsed;
    if (remaining <= 0) return 'Vencido';
    if (remaining < 1)  return `${Math.round(remaining * 60)} min restantes`;
    return `${Math.round(remaining)}h restantes`;
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-BO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
