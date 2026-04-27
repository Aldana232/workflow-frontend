import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { TramiteService } from '../../core/services/tramite';
import { Tramite, HistoryEntry } from '../../core/models/tramite.model';

/** Intervalo de refresco automático en ms (12 segundos) */
const POLL_MS = 12_000;

@Component({
  selector: 'app-consulta-publica',
  imports: [FormsModule, RouterLink, SlicePipe],
  templateUrl: './consulta-publica.html',
  styleUrl: './consulta-publica.css',
})
export class ConsultaPublica implements OnInit, OnDestroy {
  private route          = inject(ActivatedRoute);
  private tramiteService = inject(TramiteService);

  code        = '';
  tramite: Tramite | null = null;
  loading     = false;
  notFound    = false;
  searched    = false;
  /** true mientras el polling automático está activo */
  autoRefreshing = false;

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const paramCode = this.route.snapshot.paramMap.get('code');
    if (paramCode) {
      this.code = paramCode;
      this.search();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  search(): void {
    if (!this.code.trim()) return;
    this.stopPolling();
    this.loading  = true;
    this.notFound = false;
    this.searched = false;
    this.tramite  = null;

    this.tramiteService.getByCode(this.code.trim()).subscribe({
      next: (t: Tramite) => {
        this.tramite  = t;
        this.loading  = false;
        this.searched = true;
        // Activar refresco automático si el trámite todavía está en curso
        if (t.status !== 'COMPLETED' && t.status !== 'CANCELLED') {
          this.startPolling();
        }
      },
      error: () => {
        this.notFound = true;
        this.loading  = false;
        this.searched = true;
      },
    });
  }

  /** Recarga silenciosa del trámite cada POLL_MS milisegundos. */
  private startPolling(): void {
    this.autoRefreshing = true;
    this.pollTimer = setInterval(() => {
      if (!this.tramite?.code) return;
      this.tramiteService.getByCode(this.tramite.code).subscribe({
        next: (t: Tramite) => {
          this.tramite = t;
          // Detener polling cuando el trámite llega a estado final
          if (t.status === 'COMPLETED' || t.status === 'CANCELLED') {
            this.stopPolling();
          }
        },
        error: () => {},
      });
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.autoRefreshing = false;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      PENDING:     'Pendiente',
      IN_PROGRESS: 'En proceso',
      COMPLETED:   'Completado',
      REJECTED:    'Rechazado',
    };
    return map[status] ?? status;
  }

  statusMod(status: string): string {
    const map: Record<string, string> = {
      PENDING:     'pending',
      IN_PROGRESS: 'progress',
      COMPLETED:   'completed',
      REJECTED:    'rejected',
    };
    return map[status] ?? 'pending';
  }

  trackHistory(_: number, entry: HistoryEntry): string {
    return entry.nodeId;
  }
}
