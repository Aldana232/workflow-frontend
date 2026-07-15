import {
  Component, Input, inject, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  LucideMic, LucideTriangleAlert, LucideFileText, LucidePencilLine,
  LucideCircleCheck, LucideInbox, LucideMapPin, LucideBuilding2, LucideClock,
} from '@lucide/angular';

// Imports estáticos — ESBuild (Angular 17) no soporta require() dinámico
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

import { AnalyticsService } from '../../../core/services/analytics';
import { SpeechService } from '../../../core/services/speech';

type ReportType = 'summary' | 'bottlenecks' | 'anomalies' | 'priority' | 'department' | 'active'
                | 'bydate' | 'byclient' | 'byprocess' | '';
type ExportFmt  = 'pdf' | 'word' | null;

const TYPE_LABELS: Record<string, string> = {
  summary:     'Resumen General',
  bottlenecks: 'Cuellos de Botella',
  anomalies:   'Anomalías Detectadas',
  priority:    'Trámites Prioritarios',
  department:  'Rendimiento por Departamento',
  active:      'Trámites Activos',
  bydate:      'Reporte por Fecha',
  byclient:    'Reporte por Cliente',
  byprocess:   'Estadísticas por Proceso',
};

@Component({
  selector: 'app-voice-report',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    LucideMic, LucideTriangleAlert, LucideFileText, LucidePencilLine,
    LucideCircleCheck, LucideInbox, LucideMapPin, LucideBuilding2, LucideClock,
  ],
  templateUrl: './voice-report.component.html',
  styleUrl: './voice-report.component.css',
})
export class VoiceReportComponent {
  private analytics = inject(AnalyticsService);
  private speech    = inject(SpeechService);
  private cdr       = inject(ChangeDetectorRef);

  @Input() companyId: string = 'saguapac';
  @Input() processId: string = '';

  reportData:   any        = null;
  reportType:   ReportType = '';
  isGenerating: boolean    = false;
  isListening:  boolean    = false;
  voiceInput:   string     = '';
  errorMessage: string     = '';

  // Cuando el comando viene por voz, guarda el formato a exportar automáticamente
  private pendingExport: ExportFmt = null;

  // ── Getters de datos por tipo ────────────────────────────────────────────

  get reportTypeLabel(): string    { return TYPE_LABELS[this.reportType] ?? 'Reporte'; }
  get summaryData(): any           { return this.reportData?.data ?? this.reportData; }
  get bottleneckItems(): any[]     { return this.reportData?.bottlenecks ?? []; }
  get anomalyItems(): any[]        { return this.reportData?.anomalies ?? []; }
  get priorityItems(): any[]       { return this.reportData?.tramites ?? []; }
  get activeItems(): any[]         {
    return Array.isArray(this.reportData) ? this.reportData : (this.reportData?.data ?? []);
  }
  get departmentItems(): any[]     {
    return Array.isArray(this.reportData) ? this.reportData : (this.reportData?.data ?? []);
  }

  // ── Clasificación inteligente por puntuación ─────────────────────────────

  private static readonly INTENT_MAP: Record<string, string[]> = {
    bottlenecks: [
      'cuello', 'botella', 'lento', 'lenta', 'lentitud', 'tarda', 'tardando',
      'tardado', 'tardo', 'demora', 'demoras', 'demorado', 'retraso', 'retrasos',
      'retrasado', 'atascado', 'atasco', 'bloqueado', 'bloqueo', 'congestionado',
      'despacio', 'tarda más', 'más tiempo', 'cuales tardan', 'proceso lento',
      'etapa lenta', 'nodo lento', 'tiempo alto', 'tiempo largo', 'cuáles tardan',
      'qué tarda', 'actividad lenta', 'paso lento', 'demoran', 'se demora',
    ],
    anomalies: [
      'anomal', 'anomalía', 'anomalías', 'irregular', 'irregulares', 'raro',
      'raros', 'extraño', 'extraños', 'inusual', 'inusuales', 'sospechoso',
      'problema', 'problemas', 'problemático', 'falla', 'fallas', 'fallo',
      'fallos', 'incidente', 'incidentes', 'alerta', 'alertas', 'detectado',
      'detectar', 'error', 'errores', 'fuera de lo normal', 'comportamiento',
      'últimas anomalías', 'hay algo mal', 'qué está mal', 'falló',
      'detectados', 'reportados', 'comportamiento anómalo', 'están fallando',
    ],
    priority: [
      'prioridad', 'prioritario', 'prioritarios', 'urgente', 'urgentes',
      'urgencia', 'importante', 'importantes', 'crítico', 'critico', 'críticos',
      'criticos', 'inmediato', 'inmediata', 'atención', 'primero', 'primeros',
      'alta prioridad', 'máxima prioridad', 'necesitan atención', 'primero',
      'más urgente', 'hay que atender', 'atender primero', 'más importantes',
      'qué atender', 'debo atender', 'revisar primero',
    ],
    department: [
      'departamento', 'departamentos', 'área', 'areas', 'área', 'áreas',
      'rendimiento', 'sección', 'seccion', 'secciones', 'equipo', 'equipos',
      'división', 'divison', 'oficina', 'oficinas', 'grupo', 'grupos',
      'por equipo', 'por área', 'por sección', 'por departamento', 'cada área',
      'desempeño', 'performance', 'qué departamento', 'cuál departamento',
      'quién tiene más', 'quién atiende', 'carga por departamento',
    ],
    active: [
      'activo', 'activos', 'activa', 'activas', 'pendiente', 'pendientes',
      'espera', 'esperar', 'esperando', 'curso', 'en curso', 'abierto',
      'abiertos', 'sin resolver', 'en proceso', 'en trámite', 'vigente',
      'vigentes', 'cuántos hay', 'que hay', 'hay ahora', 'actualmente',
      'en este momento', 'trámites abiertos', 'sin terminar', 'sin completar',
      'incompleto', 'incompletos', 'no terminados', 'cuáles hay', 'qué hay',
    ],
    summary: [
      'resumen', 'general', 'reporte general', 'estadísticas', 'estadistica',
      'estadisticas', 'overview', 'todo', 'global', 'completo', 'panorama',
      'visión general', 'estado general', 'cómo está', 'como esta', 'qué pasa',
      'que pasa', 'situación', 'situacion', 'cómo va', 'como va', 'métricas',
      'metricas', 'números', 'numeros', 'cifras', 'datos', 'totales',
    ],
  };

  private classifyIntent(text: string): ReportType {
    const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const scores: Record<string, number> = {
      bottlenecks: 0, anomalies: 0, priority: 0,
      department: 0,  active: 0,    summary: 0,
    };

    for (const [category, keywords] of Object.entries(VoiceReportComponent.INTENT_MAP)) {
      for (const kw of keywords) {
        if (lower.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, ''))) {
          scores[category] += kw.includes(' ') ? 2 : 1;
        }
      }
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return (best[1] > 0 ? best[0] : 'summary') as ReportType;
  }

  // ── Lógica de comandos ───────────────────────────────────────────────────

  parseVoiceCommand(text: string, autoExport: ExportFmt = null): void {
    this.errorMessage  = '';
    this.reportData    = null;
    this.pendingExport = autoExport;
    this.isGenerating  = true;
    this.cdr.detectChanges();

    // ── Reporte por fecha ──────────────────────────────────────────────────
    if (/fecha|mes|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|semana|hoy|ayer/i.test(text)) {
      this.reportType = 'bydate';
      const dates = this.extractDates(text);
      this.analytics.getReportByDate(dates.from, dates.to).subscribe({
        next: (data) => {
          this.reportData   = data;
          this.isGenerating = false;
          this.cdr.detectChanges();
          this.speakSummary();
        },
        error: () => {
          this.errorMessage  = 'No se pudo generar el reporte por fecha.';
          this.isGenerating  = false;
          this.pendingExport = null;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // ── Reporte por cliente ────────────────────────────────────────────────
    if (/cliente|persona|nombre|solicitante|quien/i.test(text)) {
      this.reportType = 'byclient';
      const name = this.extractClientName(text);
      this.analytics.getReportByClient(name).subscribe({
        next: (data) => {
          this.reportData   = data;
          this.isGenerating = false;
          this.cdr.detectChanges();
          this.speakSummary();
        },
        error: () => {
          this.errorMessage  = 'No se pudo generar el reporte por cliente.';
          this.isGenerating  = false;
          this.pendingExport = null;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // ── Reporte por proceso ────────────────────────────────────────────────
    if (/proceso|instalacion|reclamo|servicio|estadistica/i.test(text)) {
      this.reportType = 'byprocess';
      this.analytics.getSummaryByProcess().subscribe({
        next: (data) => {
          this.reportData   = data;
          this.isGenerating = false;
          this.cdr.detectChanges();
          this.speakSummary();
        },
        error: () => {
          this.errorMessage  = 'No se pudo generar el reporte por proceso.';
          this.isGenerating  = false;
          this.pendingExport = null;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // ── Tipos existentes — clasificación por scoring ───────────────────────
    const type = this.classifyIntent(text);
    this.reportType = type;

    let obs$: Observable<any>;

    switch (type) {
      case 'bottlenecks':
        obs$ = this.processId
          ? this.analytics.getAiBottlenecks(this.processId)
          : this.analytics.getAnalyticsBottlenecks(this.companyId);
        break;
      case 'anomalies':
        obs$ = this.analytics.getAiAnomalies(this.companyId);
        break;
      case 'priority':
        obs$ = this.analytics.getAiPriority(this.companyId);
        break;
      case 'department':
        obs$ = this.analytics.getDepartmentPerformance(this.companyId);
        break;
      case 'active':
        obs$ = this.analytics.getActiveTramites(this.companyId);
        break;
      default:
        obs$ = this.analytics.getSummary(this.companyId);
    }

    obs$.subscribe({
      next: (data: any) => {
        this.reportData   = data;
        this.isGenerating = false;
        this.cdr.detectChanges();

        const fmt = this.pendingExport;
        this.pendingExport = null;

        if (fmt) {
          const title = this.getReportTitle();
          this.speech.speak(
            `Reporte de ${title} generado. Descargando documento ${fmt === 'word' ? 'Word' : 'PDF'}.`,
            () => { if (fmt === 'word') this.exportToWord(); else this.exportToPDF(); }
          );
        } else {
          this.speakSummary(type, data);
        }
      },
      error: () => {
        this.errorMessage  = 'No se pudo generar el reporte. Verifica que los servicios estén activos e intenta nuevamente.';
        this.pendingExport = null;
        this.isGenerating  = false;
        this.cdr.detectChanges();
      },
    });
  }

  generateReport(): void {
    const text = this.voiceInput.trim();
    if (!text || this.isGenerating) return;
    this.parseVoiceCommand(text, null);
  }

  // ── Helpers de extracción ────────────────────────────────────────────────

  extractDates(text: string): { from: string; to: string } {
    const now = new Date();
    const monthNames: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    };
    for (const [name, month] of Object.entries(monthNames)) {
      if (text.toLowerCase().includes(name)) {
        const year = now.getFullYear();
        const from = new Date(year, month, 1).toISOString().split('T')[0];
        const to   = new Date(year, month + 1, 0).toISOString().split('T')[0];
        return { from, to };
      }
    }
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to   = now.toISOString().split('T')[0];
    return { from, to };
  }

  extractClientName(text: string): string {
    const match = text.match(/(?:cliente|persona|nombre|de)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i);
    return match ? match[1] : '';
  }

  // ── Voz ──────────────────────────────────────────────────────────────────

  startListening(): void {
    if (this.isListening) return;
    this.speech.stopSpeaking();
    this.isListening  = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.speech.listen().subscribe({
      next: (text: string) => {
        this.voiceInput = text;
        this.cdr.detectChanges();
      },
      error: (err: Error) => {
        this.errorMessage = err.message;
        this.isListening  = false;
        this.cdr.detectChanges();
      },
      complete: () => {
        this.isListening = false;
        if (this.voiceInput.trim()) {
          const lower = this.voiceInput.toLowerCase();
          const fmt: ExportFmt = /word|docx|documento/.test(lower) ? 'word' : 'pdf';
          this.parseVoiceCommand(this.voiceInput, fmt);
        }
        this.cdr.detectChanges();
      },
    });
  }

  // ── TTS resumen ───────────────────────────────────────────────────────────

  private speakSummary(type?: ReportType, data?: any): void {
    const t = type ?? this.reportType;
    const d = data ?? this.reportData;
    let text = '';

    switch (t) {
      case 'summary': {
        const s = d?.data ?? d;
        if (s) {
          text = `Resumen general: hay ${s.totalActiveTramites ?? 0} trámites activos, `
               + `${s.totalCompletedThisMonth ?? 0} completados este mes, `
               + `con un tiempo promedio de ${Math.round((s.avgDurationMinutes ?? 0) / 60)} horas.`;
        }
        break;
      }
      case 'bottlenecks': {
        const items    = d?.bottlenecks ?? [];
        const critical = items.filter((b: any) => b.isBottleneck);
        text = critical.length > 0
          ? `Se detectaron ${critical.length} cuellos de botella. El más crítico tiene un promedio de ${Math.round(critical[0]?.avgDuration ?? 0)} minutos.`
          : 'No se detectaron cuellos de botella en este proceso.';
        break;
      }
      case 'anomalies': {
        const items = d?.anomalies ?? [];
        const anom  = items.filter((a: any) => a.isAnomalous);
        text = anom.length > 0
          ? `Se detectaron ${anom.length} trámites con comportamiento anómalo que requieren revisión.`
          : 'No se detectaron anomalías en los trámites activos.';
        break;
      }
      case 'priority': {
        const items = d?.tramites ?? [];
        const high  = items.filter((t: any) => t.priorityLevel === 'ALTA');
        text = high.length > 0
          ? `Hay ${high.length} trámites de alta prioridad que requieren atención urgente de un total de ${items.length}.`
          : `Se analizaron ${items.length} trámites sin prioridad crítica.`;
        break;
      }
      case 'department': {
        const items = Array.isArray(d) ? d : (d?.data ?? []);
        text = items.length > 0
          ? `El departamento con mayor actividad es ${items[0].departmentName ?? items[0].name ?? 'desconocido'}.`
          : 'No hay datos de departamentos disponibles.';
        break;
      }
      case 'active': {
        const items = Array.isArray(d) ? d : (d?.data ?? []);
        text = items.length > 0
          ? `Hay ${items.length} trámites activos en el sistema.`
          : 'No hay trámites activos en el sistema.';
        break;
      }
      case 'bydate': {
        const total = d?.total ?? 0;
        text = total > 0
          ? `Se encontraron ${total} trámites en el período seleccionado. ${d?.completed ?? 0} completados y ${d?.active ?? 0} activos.`
          : 'No se encontraron trámites en ese período.';
        break;
      }
      case 'byclient': {
        const total = d?.total ?? 0;
        text = total > 0
          ? `Se encontraron ${total} trámites para el cliente ${d?.name ?? 'indicado'}.`
          : 'No se encontraron trámites para ese cliente.';
        break;
      }
      case 'byprocess': {
        const list = Array.isArray(d) ? d : [];
        text = list.length > 0
          ? `Se generó el resumen de ${list.length} procesos. El más activo tiene ${list[0]?.total ?? 0} trámites.`
          : 'No hay datos de procesos disponibles.';
        break;
      }
    }
    if (text) this.speech.speak(text);
  }

  // ── Exportación ──────────────────────────────────────────────────────────

  getReportTitle(): string {
    const titles: Record<string, string> = {
      bottlenecks: 'Cuellos de Botella',
      anomalies:   'Anomalías Detectadas',
      priority:    'Trámites por Prioridad',
      active:      'Trámites Activos',
      department:  'Rendimiento por Departamento',
      summary:     'Resumen General',
      bydate:      'Reporte por Fecha',
      byclient:    'Reporte por Cliente',
      byprocess:   'Estadísticas por Proceso',
    };
    return titles[this.reportType] || 'Reporte General';
  }

  exportToPDF(): void {
    const doc   = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-ES');

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Workflow Platform - Saguapac', 15, 20);
    doc.setFontSize(12);
    doc.text(`Reporte: ${this.getReportTitle()}`, 15, 30);
    doc.text(`Fecha: ${fecha}`, 150, 30);

    doc.setTextColor(0, 0, 0);
    const startY = 50;

    if (this.reportType === 'bottlenecks' && this.reportData?.bottlenecks) {
      autoTable(doc, {
        startY,
        head: [['Nodo', 'Duración Promedio', 'Estado', 'Recomendación']],
        body: this.reportData.bottlenecks.map((b: any, i: number) => [
          `Actividad ${i + 1}`,
          `${b.avgDuration?.toFixed(1) || 0} min`,
          b.isBottleneck ? 'Cuello de botella' : 'Normal',
          b.recommendation || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else if (this.reportType === 'anomalies' && this.reportData?.anomalies) {
      autoTable(doc, {
        startY,
        head: [['Código', 'Tiempo de Espera', 'Estado', 'Razón']],
        body: this.reportData.anomalies.map((a: any) => [
          a.code || '',
          `${Math.round(a.minutesWaiting || 0)} min`,
          a.isAnomalous ? 'Anómalo' : 'Normal',
          a.reason || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else if (this.reportType === 'priority' && this.reportData?.tramites) {
      autoTable(doc, {
        startY,
        head: [['Código', 'Prioridad', 'Tiempo de Espera', 'Razón']],
        body: this.reportData.tramites.map((t: any) => [
          t.code || '',
          t.priorityLevel || '',
          `${Math.round(t.minutesWaiting || 0)} min`,
          t.priorityReason || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else if (this.reportType === 'active' && this.reportData) {
      const tramites = Array.isArray(this.reportData)
        ? this.reportData
        : (this.reportData.data || []);
      autoTable(doc, {
        startY,
        head: [['Código', 'Proceso', 'Nodo Actual', 'Tiempo Espera']],
        body: tramites.map((t: any) => [
          t.code || '',
          t.processName || '',
          t.currentNode || '',
          `${Math.round(t.waitingMinutes || 0)} min`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else if (this.reportType === 'bydate' && this.reportData) {
      autoTable(doc, {
        startY,
        head: [['Código', 'Estado', 'Cliente']],
        body: (this.reportData.tramites ?? []).map((t: any) => [
          t.code || '',
          t.status || '',
          t.nombre || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else if (this.reportType === 'byclient' && this.reportData) {
      autoTable(doc, {
        startY,
        head: [['Código', 'Estado', 'Cliente']],
        body: (this.reportData.tramites ?? []).map((t: any) => [
          t.code || '',
          t.status || '',
          t.clienteInfo?.nombre || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else if (this.reportType === 'byprocess' && this.reportData) {
      autoTable(doc, {
        startY,
        head: [['Proceso', 'Total', 'Completados', 'Activos', 'Duración Prom.']],
        body: (Array.isArray(this.reportData) ? this.reportData : []).map((p: any) => [
          p.processId || '',
          p.total ?? 0,
          p.completed ?? 0,
          p.active ?? 0,
          `${p.avgDurationMinutes?.toFixed(0) ?? 0} min`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    } else {
      doc.setFontSize(12);
      doc.text('No hay datos disponibles para este reporte.', 15, startY);
    }

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`Página ${i} de ${pageCount} - Generado por Workflow Platform`, 15, 290);
    }

    doc.save(`reporte-${this.reportType}-${fecha.replace(/\//g, '-')}.pdf`);
  }

  exportToWord(): void {
    import('docx').then(({
      Document, Packer, Paragraph, TextRun,
      Table, TableRow, TableCell,
      HeadingLevel, WidthType,
    }) => {
      const fecha    = new Date().toLocaleDateString('es-ES');
      const dataRows: any[] = [];

      const cell = (text: string) =>
        new TableCell({ children: [new Paragraph(String(text))] });

      const boldCell = (text: string) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] });

      if (this.reportType === 'bottlenecks' && this.reportData?.bottlenecks) {
        dataRows.push(new TableRow({ children: ['Nodo', 'Duración', 'Estado', 'Recomendación'].map(boldCell) }));
        this.reportData.bottlenecks.forEach((b: any, i: number) => {
          dataRows.push(new TableRow({ children: [
            cell(`Actividad ${i + 1}`),
            cell(`${b.avgDuration?.toFixed(1) || 0} min`),
            cell(b.isBottleneck ? 'Cuello de botella' : 'Normal'),
            cell(b.recommendation || ''),
          ]}));
        });
      } else if (this.reportType === 'anomalies' && this.reportData?.anomalies) {
        dataRows.push(new TableRow({ children: ['Código', 'Tiempo Espera', 'Estado', 'Razón'].map(boldCell) }));
        this.reportData.anomalies.forEach((a: any) => {
          dataRows.push(new TableRow({ children: [
            cell(a.code || ''),
            cell(`${Math.round(a.minutesWaiting || 0)} min`),
            cell(a.isAnomalous ? 'Anómalo' : 'Normal'),
            cell(a.reason || ''),
          ]}));
        });
      } else if (this.reportType === 'priority' && this.reportData?.tramites) {
        dataRows.push(new TableRow({ children: ['Código', 'Prioridad', 'Tiempo Espera', 'Razón'].map(boldCell) }));
        this.reportData.tramites.forEach((t: any) => {
          dataRows.push(new TableRow({ children: [
            cell(t.code || ''),
            cell(t.priorityLevel || ''),
            cell(`${Math.round(t.minutesWaiting || 0)} min`),
            cell(t.priorityReason || ''),
          ]}));
        });
      } else if (this.reportType === 'active' && this.reportData) {
        const tramites = Array.isArray(this.reportData) ? this.reportData : (this.reportData.data || []);
        dataRows.push(new TableRow({ children: ['Código', 'Proceso', 'Nodo Actual', 'Tiempo Espera'].map(boldCell) }));
        tramites.forEach((t: any) => {
          dataRows.push(new TableRow({ children: [
            cell(t.code || ''),
            cell(t.processName || ''),
            cell(t.currentNode || ''),
            cell(`${Math.round(t.waitingMinutes || 0)} min`),
          ]}));
        });
      } else if (this.reportType === 'bydate' && this.reportData) {
        dataRows.push(new TableRow({ children: ['Código', 'Estado', 'Cliente'].map(boldCell) }));
        (this.reportData.tramites ?? []).forEach((t: any) => {
          dataRows.push(new TableRow({ children: [
            cell(t.code || ''),
            cell(t.status || ''),
            cell(t.nombre || ''),
          ]}));
        });
      } else if (this.reportType === 'byclient' && this.reportData) {
        dataRows.push(new TableRow({ children: ['Código', 'Estado', 'Cliente'].map(boldCell) }));
        (this.reportData.tramites ?? []).forEach((t: any) => {
          dataRows.push(new TableRow({ children: [
            cell(t.code || ''),
            cell(t.status || ''),
            cell(t.clienteInfo?.nombre || ''),
          ]}));
        });
      } else if (this.reportType === 'byprocess' && this.reportData) {
        dataRows.push(new TableRow({ children: ['Proceso', 'Total', 'Completados', 'Activos', 'Duración Prom.'].map(boldCell) }));
        (Array.isArray(this.reportData) ? this.reportData : []).forEach((p: any) => {
          dataRows.push(new TableRow({ children: [
            cell(p.processId || ''),
            cell(String(p.total ?? 0)),
            cell(String(p.completed ?? 0)),
            cell(String(p.active ?? 0)),
            cell(`${p.avgDurationMinutes?.toFixed(0) ?? 0} min`),
          ]}));
        });
      }

      const docx = new Document({
        sections: [{
          children: [
            new Paragraph({ text: 'Workflow Platform - Saguapac', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({
              text: `Reporte: ${this.getReportTitle()} | Fecha: ${fecha}`,
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({ text: '' }),
            ...(dataRows.length > 0
              ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: dataRows })]
              : [new Paragraph('No hay datos disponibles para este reporte.')]),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [new TextRun({
                text: `Generado automáticamente por Workflow Platform el ${fecha}`,
                italics: true,
                size: 18,
              })],
            }),
          ],
        }],
      });

      Packer.toBlob(docx).then((blob: Blob) => {
        saveAs(blob, `reporte-${this.reportType}-${fecha.replace(/\//g, '-')}.docx`);
      });
    });
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  useExample(cmd: string): void {
    this.voiceInput = cmd;
    this.parseVoiceCommand(cmd, null);
  }

  maxDuration(items: any[]): number {
    return Math.max(...items.map((i: any) => i.avgDuration ?? 0), 1);
  }

  durationPct(item: any, items: any[]): number {
    return Math.min(Math.round(((item.avgDuration ?? 0) / this.maxDuration(items)) * 100), 100);
  }

  priorityColor(level: string): string {
    switch ((level ?? '').toUpperCase()) {
      case 'ALTA':  return '#fca5a5';
      case 'MEDIA': return '#fcd34d';
      case 'BAJA':  return '#6ee7b7';
      default:      return '#94a3b8';
    }
  }

  priorityBg(level: string): string {
    switch ((level ?? '').toUpperCase()) {
      case 'ALTA':  return 'rgba(239,68,68,.2)';
      case 'MEDIA': return 'rgba(245,158,11,.15)';
      case 'BAJA':  return 'rgba(16,185,109,.15)';
      default:      return 'rgba(148,163,184,.15)';
    }
  }

  formatWait(minutes: number): string {
    if (!minutes && minutes !== 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
}
