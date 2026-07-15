import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AnalyticsService } from '../../../core/services/analytics';
import { ProcessService } from '../../../core/services/process';
import {
  LucideBot, LucideX, LucideLightbulb, LucideSend, LucideSparkles,
  LucideZap, LucideSearch, LucideTarget, LucideCircleCheck,
  LucideTriangleAlert, LucideCheck, LucideClipboardList, LucideClock,
} from '@lucide/angular';

@Component({
  selector: 'app-ai-analytics',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    LucideBot, LucideX, LucideLightbulb, LucideSend, LucideSparkles,
    LucideZap, LucideSearch, LucideTarget, LucideCircleCheck,
    LucideTriangleAlert, LucideCheck, LucideClipboardList, LucideClock,
  ],
  templateUrl: './ai-analytics.component.html',
  styleUrl: './ai-analytics.component.css',
})
export class AiAnalyticsComponent {
  private analyticsService = inject(AnalyticsService);
  private processService   = inject(ProcessService);

  // ── Backing fields ────────────────────────────────────────────────────────
  private _processId: string = '';
  private _companyId: string = '';

  @Input() set processId(value: string) {
    if (value && value !== this._processId) {
      this._processId = value;
      this.loadAllData();
    }
  }

  @Input() set companyId(value: string) {
    if (value && value !== this._companyId) {
      this._companyId = value;
      this.loadAllData();
    }
  }

  // ── Estado de datos ───────────────────────────────────────────────────────
  bottlenecks: any[]      = [];
  anomalies: any[]        = [];
  priorityTramites: any[] = [];
  isLoading: boolean      = false;
  activeTab: string       = 'bottlenecks';

  // ── Política ──────────────────────────────────────────────────────────────
  policyDescription: string = '';
  policyResult: any         = null;
  policyLoading: boolean    = false;
  showPolicyForm: boolean   = false;

  // ── Carga de datos ────────────────────────────────────────────────────────
  loadAllData(): void {
    if (!this._processId || !this._companyId) {
      console.log('AiAnalytics: esperando IDs', this._processId, this._companyId);
      return;
    }
    console.log('AiAnalytics: cargando datos para', this._processId, this._companyId);
    this.isLoading = true;

    forkJoin({
      bottlenecks:      this.analyticsService.getAiBottlenecks(this._processId)
                          .pipe(catchError(() => of({}))),
      anomalies:        this.analyticsService.getAiAnomalies(this._companyId)
                          .pipe(catchError(() => of({}))),
      priorityTramites: this.analyticsService.getAiPriority(this._companyId)
                          .pipe(catchError(() => of({}))),
    }).subscribe({
      next: (results) => {
        // Cada endpoint devuelve un objeto envoltorio — extraemos el array interno
        this.bottlenecks      = (results.bottlenecks      as any)?.bottlenecks || [];
        this.anomalies        = (results.anomalies         as any)?.anomalies   || [];
        this.priorityTramites = (results.priorityTramites  as any)?.tramites    || [];
        this.isLoading        = false;
        console.log('AiAnalytics: bottlenecks',      this.bottlenecks);
        console.log('AiAnalytics: anomalies',         this.anomalies);
        console.log('AiAnalytics: priorityTramites',  this.priorityTramites);
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  // ── Recomendación de política ─────────────────────────────────────────────
  recommendPolicy(): void {
    if (!this.policyDescription.trim() || !this._companyId) return;
    this.policyLoading = true;
    this.policyResult  = null;
    this.analyticsService.recommendPolicy(this.policyDescription, this._companyId).subscribe({
      next: (result: any) => {
        const processId = result?.recommendedProcess;
        // El campo es un ObjectId de 24 chars — resolvemos el nombre con una segunda llamada
        if (processId && typeof processId === 'string' && processId.length === 24) {
          this.processService.getById(processId).subscribe({
            next:  (proc: any) => {
              this.policyResult  = { ...result, processName: proc?.name ?? processId };
              this.policyLoading = false;
            },
            error: () => {
              this.policyResult  = { ...result, processName: processId };
              this.policyLoading = false;
            },
          });
        } else {
          this.policyResult  = { ...result, processName: processId ?? '—' };
          this.policyLoading = false;
        }
      },
      error: () => {
        this.policyResult  = { processName: '—', confidence: 0, reason: 'Error al obtener la recomendación. Intente nuevamente.' };
        this.policyLoading = false;
      },
    });
  }

  // ── Helper nodos BPMN ─────────────────────────────────────────────────────
  getNodeDisplayName(nodeId: string, index: number): string {
    if (!nodeId) return `Nodo ${index + 1}`;
    if (nodeId.startsWith('Activity_')) return `Actividad ${index + 1}`;
    return nodeId;
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  // priorityScore es 0–1; score de anomalías puede ser negativo (Isolation Forest)
  priorityColor(score: number): string {
    if (score >= 0.7) return '#ef4444';
    if (score >= 0.4) return '#f59e0b';
    return '#10b981';
  }

  priorityPct(score: number): number {
    return Math.round((score ?? 0) * 100);
  }

  priorityLevelColor(level: string): string {
    switch ((level ?? '').toUpperCase()) {
      case 'ALTA':   return '#ef4444';
      case 'MEDIA':  return '#f59e0b';
      case 'BAJA':   return '#10b981';
      default:       return '#94a3b8';
    }
  }

  maxDuration(): number {
    return Math.max(...this.bottlenecks.map((b: any) => b.avgDuration ?? 0), 1);
  }

  durationPct(node: any): number {
    const val = node.avgDuration ?? 0;
    return Math.min(Math.round((val / this.maxDuration()) * 100), 100);
  }

  formatDuration(minutes: number): string {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  }

  formatWaiting(minutes: number): string {
    if (!minutes && minutes !== 0) return '—';
    const days  = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins  = minutes % 60;
    if (days > 0)  return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}min`;
    return `${mins} min`;
  }

  // Score de Isolation Forest: más negativo = más anómalo.
  // Convertimos a 0–100 para mostrar, invirtiendo el signo.
  anomalyScorePct(score: number): number {
    return Math.min(Math.round(Math.abs(score ?? 0) * 100), 100);
  }

  anomalyScoreColor(score: number): string {
    const abs = Math.abs(score ?? 0);
    if (abs >= 0.3) return '#ef4444';
    if (abs >= 0.1) return '#f59e0b';
    return '#10b981';
  }
}
