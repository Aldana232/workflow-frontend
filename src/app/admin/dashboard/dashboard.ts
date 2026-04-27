import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnalyticsService, AnalyticsSummary, ActiveTramite } from '../../core/services/analytics';
import { AuthService } from '../../core/services/auth';
import { NotificationService } from '../../core/services/notification';

interface Metric {
  label: string;
  value: string | number;
  mod: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private analyticsService    = inject(AnalyticsService);
  private auth                = inject(AuthService);
  private cdr                 = inject(ChangeDetectorRef);
  private notificationService = inject(NotificationService);
  private destroyRef          = inject(DestroyRef);

  loading = true;
  tramitesLoading = true;

  metrics: Metric[] = [
    { label: 'Procesos activos',       value: '—', mod: 'indigo' },
    { label: 'Trámites activos',        value: '—', mod: 'blue'   },
    { label: 'Completados este mes',    value: '—', mod: 'green'  },
    { label: 'Promedio hrs / trámite',  value: '—', mod: 'amber'  },
  ];

  tramites: ActiveTramite[] = [];

  ngOnInit(): void {
    const companyId = this.auth.getCurrentUser()?.companyId || 'any';

    // Actualizar métricas Y tabla de trámites en tiempo real cuando avanza un trámite
    this.notificationService.companyEvent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadMetrics(companyId);
        this.loadTramites(companyId);
      });

    this.loadMetrics(companyId);
    this.loadTramites(companyId);
  }

  private loadMetrics(companyId: string): void {
    this.analyticsService.getSummary(companyId).subscribe({
      next: (data: AnalyticsSummary | null) => {
        if (data) {
          const avgHrs = data.avgDurationMinutes > 0
            ? (data.avgDurationMinutes / 60).toFixed(1)
            : '0';
          this.metrics = [
            { label: 'Procesos activos',       value: data.totalActiveProcesses,    mod: 'indigo' },
            { label: 'Trámites activos',        value: data.totalActiveTramites,     mod: 'blue'   },
            { label: 'Completados este mes',    value: data.totalCompletedThisMonth, mod: 'green'  },
            { label: 'Promedio hrs / trámite',  value: avgHrs,                       mod: 'amber'  },
          ];
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadTramites(companyId: string): void {
    this.analyticsService.getActiveTramites(companyId).subscribe({
      next: (data: ActiveTramite[]) => {
        this.tramites = data.slice(0, 10);
        this.tramitesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.tramitesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  formatWait(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
}
