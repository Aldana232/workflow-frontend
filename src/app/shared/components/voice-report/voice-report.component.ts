import {
  Component, Input, inject, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

// Imports estáticos — ESBuild (Angular 17) no soporta require() dinámico
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

import { AnalyticsService } from '../../../core/services/analytics';
import { SpeechService } from '../../../core/services/speech';

type ReportType = 'summary' | 'bottlenecks' | 'anomalies' | 'priority' | 'department' | 'active' | '';
type ExportFmt  = 'pdf' | 'word' | null;

const TYPE_LABELS: Record<string, string> = {
  summary:     '📊 Resumen General',
  bottlenecks: '🔴 Cuellos de Botella',
  anomalies:   '⚠ Anomalías Detectadas',
  priority:    '🔥 Trámites Prioritarios',
  department:  '🏢 Rendimiento por Departamento',
  active:      '📋 Trámites Activos',
};

@Component({
  selector: 'app-voice-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  get reportTypeLabel(): string    { return TYPE_LABELS[this.reportType] ?? '📄 Reporte'; }
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
  // Cada categoría tiene su propio vocabulario con peso. Gana la de mayor puntaje.

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
          scores[category] += kw.includes(' ') ? 2 : 1; // frases valen doble
        }
      }
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return (best[1] > 0 ? best[0] : 'summary') as ReportType;
  }

  // ── Lógica de comandos ───────────────────────────────────────────────────

  parseVoiceCommand(text: string, autoExport: ExportFmt = null): void {
    const type = this.classifyIntent(text);
    this.errorMessage  = '';
    this.reportData    = null;
    this.pendingExport = autoExport;
    this.isGenerating  = true;
    this.cdr.detectChanges();

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

    this.reportType = type;

    obs$.subscribe({
      next: (data: any) => {
        this.reportData   = data;
        this.isGenerating = false;
        this.cdr.detectChanges();

        // Primero hablar el resumen, luego exportar automáticamente si venía por voz
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
    this.parseVoiceCommand(text, null); // botón manual → sin auto-export
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
          // Detectar formato pedido por voz; default → PDF
          const lower = this.voiceInput.toLowerCase();
          const fmt: ExportFmt = /word|docx|documento/.test(lower) ? 'word' : 'pdf';
          this.parseVoiceCommand(this.voiceInput, fmt);
        }
        this.cdr.detectChanges();
      },
    });
  }

  // ── TTS resumen (cuando NO hay auto-export) ───────────────────────────────

  private speakSummary(type: ReportType, data: any): void {
    let text = '';
    switch (type) {
      case 'summary': {
        const d = data?.data ?? data;
        if (d) {
          text = `Resumen general: hay ${d.totalActiveTramites ?? 0} trámites activos, `
               + `${d.totalCompletedThisMonth ?? 0} completados este mes, `
               + `con un tiempo promedio de ${Math.round((d.avgDurationMinutes ?? 0) / 60)} horas.`;
        }
        break;
      }
      case 'bottlenecks': {
        const items    = data?.bottlenecks ?? [];
        const critical = items.filter((b: any) => b.isBottleneck);
        text = critical.length > 0
          ? `Se detectaron ${critical.length} cuellos de botella. El más crítico tiene un promedio de ${Math.round(critical[0]?.avgDuration ?? 0)} minutos.`
          : 'No se detectaron cuellos de botella en este proceso.';
        break;
      }
      case 'anomalies': {
        const items = data?.anomalies ?? [];
        const anom  = items.filter((a: any) => a.isAnomalous);
        text = anom.length > 0
          ? `Se detectaron ${anom.length} trámites con comportamiento anómalo que requieren revisión.`
          : 'No se detectaron anomalías en los trámites activos.';
        break;
      }
      case 'priority': {
        const items = data?.tramites ?? [];
        const high  = items.filter((t: any) => t.priorityLevel === 'ALTA');
        text = high.length > 0
          ? `Hay ${high.length} trámites de alta prioridad que requieren atención urgente de un total de ${items.length}.`
          : `Se analizaron ${items.length} trámites sin prioridad crítica.`;
        break;
      }
      case 'department': {
        const items = Array.isArray(data) ? data : (data?.data ?? []);
        text = items.length > 0
          ? `El departamento con mayor actividad es ${items[0].departmentName ?? items[0].name ?? 'desconocido'}.`
          : 'No hay datos de departamentos disponibles.';
        break;
      }
      case 'active': {
        const items = Array.isArray(data) ? data : (data?.data ?? []);
        text = items.length > 0
          ? `Hay ${items.length} trámites activos en el sistema.`
          : 'No hay trámites activos en el sistema.';
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
    };
    return titles[this.reportType] || 'Reporte General';
  }

  exportToPDF(): void {
    const doc   = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-ES');

    // Header
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
    } else {
      doc.setFontSize(12);
      doc.text('No hay datos disponibles para este reporte.', 15, startY);
    }

    // Footer en cada página
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
        new TableCell({ children: [new Paragraph(text)] });

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
