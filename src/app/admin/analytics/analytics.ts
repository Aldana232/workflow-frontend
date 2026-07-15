import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import {
  LucideLoaderCircle, LucideDownload, LucideTriangleAlert, LucideClock,
  LucideChartBar, LucideClipboardList, LucideSearch, LucideX, LucideInbox,
  LucideCheck,
} from '@lucide/angular';

import {
  AnalyticsService, AnalyticsSummary,
  NodeAnalytics, ActiveTramite,
} from '../../core/services/analytics';
import { AuthService } from '../../core/services/auth';
import { ProcessService } from '../../core/services/process';
import { AiAnalyticsComponent } from '../../shared/components/ai-analytics/ai-analytics.component';
import { VoiceReportComponent } from '../../shared/components/voice-report/voice-report.component';

interface StatCard {
  label: string;
  value: string;
  mod:   string;
}

interface BarItem {
  label: string;
  value: number;
  pct:   number;
  color: string;
}

const DEFAULT_SLA_HOURS   = 8;
const DEFAULT_SLA_MINUTES = DEFAULT_SLA_HOURS * 60;

@Component({
  selector: 'app-analytics',
  imports: [
    FormsModule, NgxEchartsDirective, AiAnalyticsComponent, VoiceReportComponent,
    LucideLoaderCircle, LucideDownload, LucideTriangleAlert, LucideClock,
    LucideChartBar, LucideClipboardList, LucideSearch, LucideX, LucideInbox,
    LucideCheck,
  ],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Analytics implements OnInit {
  private analyticsService = inject(AnalyticsService);
  private processService   = inject(ProcessService);
  private auth             = inject(AuthService);
  private cdr              = inject(ChangeDetectorRef);

  // ── Summary cards ────────────────────────────────────────────────────────
  summaryLoading = true;
  summaryError   = false;

  stats: StatCard[] = [
    { label: 'Trámites activos',      value: '—', mod: 'blue'   },
    { label: 'Completados este mes',  value: '—', mod: 'green'  },
    { label: 'Tiempo promedio (hrs)', value: '—', mod: 'purple' },
    { label: 'Procesos activos',      value: '—', mod: 'gray'   },
  ];

  // ── Static mock charts ───────────────────────────────────────────────────
  processLoad: BarItem[] = [
    { label: 'Onboarding',          value: 42, pct: 84, color: '#4f46e5' },
    { label: 'Instalación de agua', value: 35, pct: 70, color: '#0ea5e9' },
    { label: 'Reclamos',            value: 28, pct: 56, color: '#059669' },
    { label: 'Inspecciones',        value: 15, pct: 30, color: '#f59e0b' },
    { label: 'Reconexiones',        value: 7,  pct: 14, color: '#ef4444' },
  ];

  deptLoad: BarItem[] = [
    { label: 'Atención al Cliente', value: 51, pct: 100, color: '#4f46e5' },
    { label: 'TI',                  value: 38, pct: 75,  color: '#0ea5e9' },
    { label: 'Operaciones',         value: 44, pct: 86,  color: '#f59e0b' },
    { label: 'Finanzas',            value: 22, pct: 43,  color: '#059669' },
    { label: 'RRHH',                value: 12, pct: 24,  color: '#8b5cf6' },
  ];

  // ── Node performance chart ────────────────────────────────────────────────
  processes: any[]                   = [];
  selectedProcessId                  = '';
  chartOptions: EChartsOption | null = null;
  chartLoading                       = false;
  chartError                         = false;
  readonly slaHours                  = DEFAULT_SLA_HOURS;

  // ── Active tramites table ─────────────────────────────────────────────────
  activeTramites:   ActiveTramite[] = [];
  filteredTramites: ActiveTramite[] = [];
  tramiteSearch                     = '';
  tramitesLoading                   = false;
  tramitesError                     = false;

  exporting = false;

  // ────────────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    console.log('Usuario actual completo:', this.auth.getCurrentUser());
    this.loadSummary();
    this.loadProcesses();
    this.loadActiveTramites();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  private loadSummary(): void {
    const companyId = this.auth.getCurrentUser()?.companyId || 'any';

    this.analyticsService.getSummary(companyId).subscribe({
      next: (data: AnalyticsSummary | null) => {
        this.summaryLoading = false;
        if (!data) { this.summaryError = true; } else { this.applySummary(data); }
        this.cdr.markForCheck();
      },
      error: () => {
        this.summaryLoading = false;
        this.summaryError   = true;
        this.cdr.markForCheck();
      },
    });
  }

  private applySummary(data: AnalyticsSummary): void {
    const avgHrs = data.avgDurationMinutes > 0
      ? (data.avgDurationMinutes / 60).toFixed(1)
      : '0';

    this.stats = [
      { label: 'Trámites activos',      value: String(data.totalActiveTramites),     mod: 'blue'   },
      { label: 'Completados este mes',  value: String(data.totalCompletedThisMonth), mod: 'green'  },
      { label: 'Tiempo promedio (hrs)', value: avgHrs,                               mod: 'purple' },
      { label: 'Procesos activos',      value: String(data.totalActiveProcesses),    mod: 'gray'   },
    ];
  }

  // ── Process list ─────────────────────────────────────────────────────────
  private loadProcesses(): void {
    this.processService.getAll().subscribe({
      next: (list: any[]) => {
        this.processes = list.filter((p: any) =>
          p.status === 'PUBLISHED' || p.status === 'ACTIVE'
        );
        this.cdr.markForCheck();
      },
      error: () => { this.cdr.markForCheck(); },
    });
  }

  onProcessChange(): void {
    if (!this.selectedProcessId) {
      this.chartOptions = null;
      this.chartError   = false;
      this.cdr.markForCheck();
      return;
    }
    this.loadNodeChart(this.selectedProcessId);
  }

  // ── Node chart ────────────────────────────────────────────────────────────
  private loadNodeChart(processId: string): void {
    this.chartLoading = true;
    this.chartError   = false;
    this.chartOptions = null;
    this.cdr.markForCheck();

    this.analyticsService.getNodesAnalytics(processId).subscribe({
      next: (nodes: NodeAnalytics[]) => {
        this.chartLoading = false;
        if (nodes.length === 0) { this.chartError = true; }
        else { this.buildChartOptions(nodes); }
        this.cdr.markForCheck();
      },
      error: () => {
        this.chartLoading = false;
        this.chartError   = true;
        this.cdr.markForCheck();
      },
    });
  }

  private buildChartOptions(nodes: NodeAnalytics[]): void {
    const names = nodes.map(n => n.nodeName || n.nodeId);

    const seriesData = nodes.map(n => {
      const hrs     = parseFloat((n.avgDurationMinutes / 60).toFixed(2));
      const overSla = hrs > DEFAULT_SLA_HOURS;
      return {
        value: hrs,
        itemStyle: {
          color: overSla ? '#ef4444' : '#0ea5e9',
          borderRadius: [4, 4, 0, 0] as [number, number, number, number],
        },
      };
    });

    this.chartOptions = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const p       = Array.isArray(params) ? params[0] : params;
          const node    = nodes[p.dataIndex];
          const overSla = p.value > DEFAULT_SLA_HOURS;
          return [
            `<b>${p.name}</b>`,
            `Tiempo prom.: <b>${p.value} hrs</b>`,
            `Total tareas: <b>${node?.totalTasks ?? '—'}</b>`,
            `SLA: ${DEFAULT_SLA_HOURS} hrs`,
            overSla
              ? `<span style="color:#ef4444">⬤ Excede SLA</span>`
              : `<span style="color:#059669">⬤ Dentro del SLA</span>`,
          ].join('<br/>');
        },
      },
      legend: {
        data: [
          { name: 'Dentro del SLA', icon: 'rect', itemStyle: { color: '#0ea5e9' } },
          { name: 'Excede SLA',     icon: 'rect', itemStyle: { color: '#ef4444' } },
        ],
        bottom: 0,
        textStyle: { fontSize: 11, color: '#64748b' },
      },
      grid: { left: '3%', right: '4%', bottom: '14%', top: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          rotate: names.some(n => n.length > 12) ? 30 : 0,
          fontSize: 11,
          color: '#475569',
          interval: 0,
        },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Horas',
        nameLocation: 'end',
        nameTextStyle: { color: '#64748b', fontSize: 11 },
        axisLabel: { formatter: '{value}h', color: '#64748b', fontSize: 11 },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'bar',
          data: seriesData,
          barMaxWidth: 56,
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => `${params.value}h`,
            fontSize: 11,
            color: '#475569',
          },
          markLine: {
            symbol: ['none', 'none'],
            data: [{ yAxis: DEFAULT_SLA_HOURS, name: `SLA ${DEFAULT_SLA_HOURS}h` }],
            lineStyle: { color: '#f59e0b', type: 'dashed', width: 2 },
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: `SLA: ${DEFAULT_SLA_HOURS}h`,
              color: '#b45309',
              fontSize: 11,
              fontWeight: 'bold',
            },
          },
        },
      ],
    };
  }

  // ── Active tramites table ─────────────────────────────────────────────────
  private loadActiveTramites(): void {
    const companyId = this.auth.getCurrentUser()?.companyId || 'any';

    this.tramitesLoading = true;
    this.analyticsService.getActiveTramites(companyId).subscribe({
      next: (list: ActiveTramite[]) => {
        this.tramitesLoading  = false;
        this.activeTramites   = list;
        this.filteredTramites = list;
        this.cdr.markForCheck();
      },
      error: () => {
        this.tramitesLoading = false;
        this.tramitesError   = true;
        this.cdr.markForCheck();
      },
    });
  }

  onSearchChange(): void {
    const q = this.tramiteSearch.toLowerCase().trim();
    this.filteredTramites = !q
      ? this.activeTramites
      : this.activeTramites.filter(t =>
          t.code.toLowerCase().includes(q) ||
          t.departmentName.toLowerCase().includes(q)
        );
    this.cdr.markForCheck();
  }

  formatWaitTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  isOverSla(minutes: number): boolean {
    return minutes > DEFAULT_SLA_MINUTES;
  }

  // ── AI helpers ───────────────────────────────────────────────────────────
  get currentCompanyId(): string {
    if (this.processes && this.processes.length > 0) {
      return this.processes[0].companyId || '';
    }
    return '';
  }
  get firstProcessId(): string { return this.processes[0]?.id ?? ''; }

  // ── Export ────────────────────────────────────────────────────────────────
  exportToExcel(): void {
    this.exporting = true;

    const now   = new Date();
    const fecha = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
    const hora  = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    const rows: string[][] = [
      ['REPORTE DE ANALÍTICA - WORKFLOW PLATFORM'],
      [`Generado el: ${fecha} ${hora}`],
      [''],
      ['=== RESUMEN GENERAL ==='],
      ['Métrica', 'Valor'],
      ...this.stats.map(s => [s.label, s.value]),
      [''],
      ['=== TRÁMITES ACTIVOS ==='],
      ['Código', 'Proceso', 'Nodo actual', 'Departamento', 'Esperando', 'Estado'],
      ...this.activeTramites.map(t => [
        t.code, t.processName, t.currentNode, t.departmentName,
        this.formatWaitTime(t.waitingMinutes),
        this.isOverSla(t.waitingMinutes) ? 'Retrasado' : 'En tiempo',
      ]),
      [''],
      ['=== TRÁMITES POR PROCESO ==='],
      ['Proceso', 'Cantidad', '% del máximo'],
      ...this.processLoad.map(p => [p.label, String(p.value), `${p.pct}%`]),
      [''],
      ['=== CARGA POR DEPARTAMENTO ==='],
      ['Departamento', 'Tareas activas', '% del máximo'],
      ...this.deptLoad.map(d => [d.label, String(d.value), `${d.pct}%`]),
    ];

    const csvContent = rows
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM  = '﻿';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reporte-workflow-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this.exporting = false;
    this.cdr.markForCheck();
  }
}
