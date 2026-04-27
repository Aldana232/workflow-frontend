import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { TramiteService } from '../../core/services/tramite';
import { AuthService } from '../../core/services/auth';

interface MonthBar  { month: string; completed: number; pct: number; }
interface StatCard  { label: string; value: string | number; mod: string; sub: string; }
interface Activity  { code: string; process: string; node: string; completedAt: string; result: string; }

@Component({
  selector: 'app-stats',
  imports: [],
  templateUrl: './stats.html',
  styleUrl: './stats.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stats implements OnInit {
  private tramiteService = inject(TramiteService);
  private authService    = inject(AuthService);
  private cdr            = inject(ChangeDetectorRef);

  loading = true;
  error   = false;

  get userName():   string { return this.authService.getCurrentUser()?.name         ?? 'Funcionario'; }
  get department(): string { return this.authService.getCurrentUser()?.departmentId ?? '—'; }

  cards: StatCard[] = [
    { label: 'Tareas pendientes',     value: '—', mod: 'amber',  sub: 'En mi bandeja ahora'     },
    { label: 'Completadas este mes',  value: '—', mod: 'green',  sub: 'Mes actual'               },
    { label: 'Promedio resolución',   value: '—', mod: 'blue',   sub: 'Horas por tarea'          },
    { label: 'Total acumulado (año)', value: '—', mod: 'indigo', sub: 'Este año'                 },
  ];

  monthlyBars: MonthBar[] = [];
  recentActivity: Activity[] = [];

  ngOnInit(): void {
    const deptId = this.authService.getCurrentUser()?.departmentId;
    this.tramiteService.getMyStats(deptId).subscribe({
      next: (data: any) => {
        const now = new Date();
        const monthName = now.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
        const yearLabel = `Enero – ${now.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })}`;

        this.cards = [
          { label: 'Tareas pendientes',     value: data.pendingCount,          mod: 'amber',  sub: `${data.pendingCount} tarea(s) en tu bandeja` },
          { label: 'Completadas este mes',  value: data.completedThisMonth,    mod: 'green',  sub: monthName                                      },
          { label: 'Promedio resolución',   value: `${data.avgDurationHours} h`, mod: 'blue', sub: 'Horas por tarea'                             },
          { label: 'Total acumulado (año)', value: data.totalThisYear,         mod: 'indigo', sub: yearLabel                                      },
        ];

        this.monthlyBars = (data.monthlyBars ?? []).map((b: any) => ({
          month:     b.month,
          completed: b.completed,
          pct:       b.pct,
        }));

        this.recentActivity = (data.recentActivity ?? []).map((a: any) => ({
          code:        a.code,
          process:     a.processName,
          node:        a.nodeName,
          completedAt: a.completedAt,
          result:      a.result,
        }));

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error   = true;
        this.cdr.markForCheck();
      },
    });
  }

  resultClass(result: string): string {
    if (result === 'Aprobado')  return 'result-ok';
    if (result === 'Rechazado') return 'result-no';
    return 'result-neutral';
  }

  exportPdf(): void { window.print(); }

  exportExcel(): void {
    const all = [
      ['Reporte de Estadísticas - Workflow Platform'],
      ['Funcionario', this.userName],
      ['Departamento', this.department],
      ['Fecha', new Date().toLocaleDateString('es-BO')],
      [],
      ['RESUMEN'],
      ...this.cards.map(c => [c.label, String(c.value), c.sub]),
      [],
      ['ACTIVIDAD RECIENTE'],
      ['Código', 'Proceso', 'Nodo', 'Completado', 'Resultado'],
      ...this.recentActivity.map(r => [r.code, r.process, r.node, r.completedAt, r.result]),
    ];

    const csv  = all
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `estadisticas_${this.userName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
