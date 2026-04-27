import { Injectable, inject } from '@angular/core';
import { RxStompService } from '@stomp/ng2-stompjs';
import { ToastrService } from 'ngx-toastr';
import { Subject, Subscription } from 'rxjs';
import { User } from '../models/user.model';
import { environment } from '../../../environments/environment';

/** Espejo exacto del WorkflowEventDTO.java del backend */
export interface WorkflowEvent {
  type: 'TASK_ASSIGNED' | 'TRAMITE_COMPLETED' | 'TRAMITE_CANCELLED';
  tramiteId: string;
  tramiteCode: string;
  processId: string;
  processName: string;
  nodeId: string | null;
  nodeName: string | null;
  departmentId: string | null;
  companyId: string | null;
  status: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private stomp  = inject(RxStompService);
  private toastr = inject(ToastrService);

  // ─── Streams públicos ─────────────────────────────────────────────────────
  //
  //  Cada componente se suscribe solo al stream que le corresponde.
  //  Los Subjects son privados; el exterior solo recibe el Observable.

  private _deptEvent    = new Subject<WorkflowEvent>();
  private _companyEvent = new Subject<WorkflowEvent>();
  private _tramiteEvent = new Subject<WorkflowEvent>();

  /** FUNCIONARIO: evento de nueva tarea en su departamento */
  readonly deptEvent$ = this._deptEvent.asObservable();

  /** ADMIN: cualquier cambio de trámite en su empresa */
  readonly companyEvent$ = this._companyEvent.asObservable();

  /** Cualquier rol: cambio de estado del trámite que se está viendo */
  readonly tramiteEvent$ = this._tramiteEvent.asObservable();

  // ─── Registro de suscripciones activas ───────────────────────────────────
  //
  //  Clave: string compuesta ("dept:id", "company:id", "tramite:id").
  //  Evita duplicados y permite cancelar individualmente.

  private subs = new Map<string, Subscription>();

  // ─── API de conexión ──────────────────────────────────────────────────────

  /**
   * Llamar justo después del login.
   * Configura STOMP con el JWT actual y se suscribe al canal correcto según rol.
   */
  connect(user: User): void {
    if (this.stomp.active) return;

    const token = localStorage.getItem('token') ?? '';

    this.stomp.configure({
      // Spring SockJS acepta WebSocket nativo en la misma URL del endpoint
      brokerURL: environment.wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5_000,    // reintentar cada 5 s si cae la conexión
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
    });

    this.stomp.activate();

    switch (user.role) {
      case 'FUNCIONARIO':
        if (user.departmentId) this.subscribeDept(user.departmentId);
        break;
      case 'ADMIN':
        // Fallback a 'saguapac' para cuentas creadas antes de que se fijara companyId
        this.subscribeCompany(user.companyId || 'saguapac');
        break;
      // CLIENTE no recibe canal fijo; usa subscribeTramite() bajo demanda
    }
  }

  // ─── Suscripción dinámica (vista de detalle de un trámite) ────────────────

  /**
   * Llamar en ngOnInit de cualquier componente que muestre un trámite.
   * Emite en tramiteEvent$ mientras dure la suscripción.
   */
  subscribeTramite(tramiteId: string): void {
    const key = `tramite:${tramiteId}`;
    if (this.subs.has(key)) return;

    const sub = this.stomp.watch(`/topic/tramite/${tramiteId}`).subscribe({
      next: (msg) => {
        const event = this.parse(msg.body);
        if (event) this._tramiteEvent.next(event);
      },
      error: () => {},
    });

    this.subs.set(key, sub);
  }

  /** Llamar en ngOnDestroy del componente que abrió la suscripción. */
  unsubscribeTramite(tramiteId: string): void {
    this.cancel(`tramite:${tramiteId}`);
  }

  // ─── Limpieza al hacer logout ─────────────────────────────────────────────

  disconnect(): void {
    this.subs.forEach((sub) => sub.unsubscribe());
    this.subs.clear();
    this.stomp.deactivate();
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private subscribeDept(departmentId: string): void {
    const key = `dept:${departmentId}`;
    if (this.subs.has(key)) return;

    const sub = this.stomp.watch(`/topic/dept/${departmentId}`).subscribe({
      next: (msg) => {
        const event = this.parse(msg.body);
        if (!event) return;
        this._deptEvent.next(event);
        this.toastr.info(
          `${event.nodeName ?? 'Nueva tarea'} · ${event.tramiteCode}`,
          'Nueva tarea asignada',
          { timeOut: 5_000, progressBar: true }
        );
      },
      error: () => {},
    });

    this.subs.set(key, sub);
  }

  private subscribeCompany(companyId: string): void {
    const key = `company:${companyId}`;
    if (this.subs.has(key)) return;

    const sub = this.stomp.watch(`/topic/company/${companyId}`).subscribe({
      next: (msg) => {
        const event = this.parse(msg.body);
        if (!event) return;
        this._companyEvent.next(event);
        this.showCompanyToast(event);
      },
      error: () => {},
    });

    this.subs.set(key, sub);
  }

  private showCompanyToast(event: WorkflowEvent): void {
    switch (event.type) {
      case 'TASK_ASSIGNED': {
        const node = event.nodeName ?? 'nueva etapa';
        const code = event.tramiteCode;
        const proc = event.processName ?? '';
        this.toastr.info(
          `${code} · ${proc} avanzó a <strong>${node}</strong>`,
          'Trámite actualizado',
          { timeOut: 6_000, progressBar: true, enableHtml: true }
        );
        break;
      }
      case 'TRAMITE_COMPLETED':
        this.toastr.success(
          `${event.tramiteCode} · ${event.processName ?? ''} completado`,
          'Trámite completado',
          { timeOut: 6_000, progressBar: true }
        );
        break;
      case 'TRAMITE_CANCELLED':
        this.toastr.warning(
          `${event.tramiteCode} · ${event.processName ?? ''} cancelado/rechazado`,
          'Trámite cancelado',
          { timeOut: 6_000, progressBar: true }
        );
        break;
    }
  }

  private cancel(key: string): void {
    this.subs.get(key)?.unsubscribe();
    this.subs.delete(key);
  }

  private parse(body: string): WorkflowEvent | null {
    try {
      return JSON.parse(body) as WorkflowEvent;
    } catch {
      return null;
    }
  }
}
