import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { LucideSettings, LucideInfo, LucideBell, LucideMonitor, LucideRotateCcw, LucideSave } from '@lucide/angular';

interface NotifPref {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, LucideSettings, LucideInfo, LucideBell, LucideMonitor, LucideRotateCcw, LucideSave],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings implements OnInit {
  private toastr = inject(ToastrService);
  private cdr    = inject(ChangeDetectorRef);

  // System info
  readonly systemVersion = '1.0.0';
  readonly environment   = 'Producción';
  readonly company       = 'SAGUAPAC';

  // Notification preferences
  notifPrefs: NotifPref[] = [
    { key: 'new_tramite',   label: 'Nuevo trámite creado',        description: 'Notificar cuando se crea un trámite nuevo',    enabled: true  },
    { key: 'task_complete', label: 'Tarea completada',            description: 'Notificar cuando un funcionario completa tarea', enabled: true  },
    { key: 'sla_breach',    label: 'Incumplimiento de SLA',       description: 'Alertar cuando se supera el tiempo límite',     enabled: true  },
    { key: 'proc_publish',  label: 'Proceso publicado',           description: 'Notificar cuando se publica un proceso',        enabled: false },
    { key: 'daily_report',  label: 'Reporte diario automático',   description: 'Enviar resumen por email cada día a las 8:00',  enabled: false },
  ];

  // Display preferences
  itemsPerPage = 10;
  dateFormat   = 'DD/MM/YYYY';

  ngOnInit(): void {
    const saved = localStorage.getItem('wf_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.notifPrefs) {
          for (const pref of this.notifPrefs) {
            const saved = parsed.notifPrefs[pref.key];
            if (saved !== undefined) pref.enabled = saved;
          }
        }
        if (parsed.itemsPerPage) this.itemsPerPage = parsed.itemsPerPage;
        if (parsed.dateFormat)   this.dateFormat   = parsed.dateFormat;
      } catch { /* ignore */ }
    }
  }

  saveSettings(): void {
    const prefsMap: Record<string, boolean> = {};
    for (const p of this.notifPrefs) prefsMap[p.key] = p.enabled;

    localStorage.setItem('wf_settings', JSON.stringify({
      notifPrefs: prefsMap,
      itemsPerPage: this.itemsPerPage,
      dateFormat: this.dateFormat,
    }));
    this.toastr.success('Configuración guardada correctamente', 'Guardado');
  }

  resetSettings(): void {
    if (!confirm('¿Restaurar configuración por defecto?')) return;
    localStorage.removeItem('wf_settings');
    for (const p of this.notifPrefs) {
      p.enabled = ['new_tramite', 'task_complete', 'sla_breach'].includes(p.key);
    }
    this.itemsPerPage = 10;
    this.dateFormat   = 'DD/MM/YYYY';
    this.cdr.markForCheck();
    this.toastr.info('Configuración restaurada', 'Listo');
  }
}
