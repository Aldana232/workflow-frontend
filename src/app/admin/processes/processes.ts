import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ProcessService } from '../../core/services/process';
import { TramiteService } from '../../core/services/tramite';

interface ProcessCard {
  id: string;
  name: string;
  version: string;
  status: string;
  activeTramites: number;
}

@Component({
  selector: 'app-processes',
  imports: [SlicePipe],
  templateUrl: './processes.html',
  styleUrl: './processes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Processes implements OnInit {
  private router         = inject(Router);
  private processService = inject(ProcessService);
  private tramiteService = inject(TramiteService);
  private toastr         = inject(ToastrService);
  private cdr            = inject(ChangeDetectorRef);

  processes: ProcessCard[] = [];
  loading = true;

  // Panel de trámites del proceso seleccionado
  selectedProcess: ProcessCard | null = null;
  tramites: any[] = [];
  loadingTramites = false;

  // Panel de detalle de un trámite
  detailTramite: any = null;
  detailNodeLabel: string | null = null;
  loadingDetail = false;

  ngOnInit(): void {
    this.processService.getAll().subscribe({
      next: (data: any[]) => {
        this.processes = data.map((p: any) => ({
          id:             p.id,
          name:           p.name,
          version:        p.version ? `v${p.version}` : 'v1',
          status:         p.status ?? 'DRAFT',
          activeTramites: p.activeTramites ?? 0,
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

  newProcess(): void { this.router.navigate(['/admin/designer']); }
  design(p: ProcessCard): void {
    this.router.navigate(['/admin/designer', this.toSlug(p.name)], { state: { processId: p.id } });
  }

  private toSlug(text: string): string {
    return (text ?? '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'proceso';
  }

  viewTramites(p: ProcessCard): void {
    this.selectedProcess = p;
    this.detailTramite = null;
    this.tramites = [];
    this.loadingTramites = true;
    this.cdr.markForCheck();

    this.tramiteService.getAllTramitesByProcess(p.id).subscribe({
      next: (data: any[]) => {
        this.tramites = data;
        this.loadingTramites = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingTramites = false;
        this.cdr.markForCheck();
      },
    });
  }

  closeTramites(): void {
    this.selectedProcess = null;
    this.detailTramite = null;
    this.tramites = [];
    this.cdr.markForCheck();
  }

  viewDetail(t: any): void {
    this.loadingDetail = true;
    this.detailTramite = null;
    this.detailNodeLabel = t.currentNodeLabel ?? null;
    this.cdr.markForCheck();

    this.tramiteService.getById(t.tramiteId).subscribe({
      next: (data: any) => {
        this.detailTramite = data;
        this.loadingDetail = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingDetail = false;
        this.cdr.markForCheck();
      },
    });
  }

  closeDetail(): void {
    this.detailTramite = null;
    this.detailNodeLabel = null;
    this.cdr.markForCheck();
  }

  publish(p: ProcessCard): void {
    if (!confirm(`¿Publicar el proceso "${p.name}"?`)) return;
    this.processService.publish(p.id).subscribe({
      next: () => {
        this.toastr.success('Proceso publicado', 'Éxito');
        p.status = 'ACTIVE';
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = err?.error?.message ?? '';
        if (msg.includes('trámites activos')) {
          this.toastr.warning('No se puede publicar: hay trámites en proceso. Desactívalo primero o espera a que finalicen.', 'Atención');
        } else {
          this.toastr.error('Error al publicar', 'Error');
        }
      },
    });
  }

  deactivate(p: ProcessCard): void {
    if (!confirm(`¿Desactivar el proceso "${p.name}"? Pasará a DRAFT y no aceptará nuevos trámites. Los trámites en curso continúan.`)) return;
    this.processService.deactivate(p.id).subscribe({
      next: () => {
        this.toastr.success('Proceso desactivado — ahora puedes editarlo y republicarlo', 'Desactivado');
        p.status = 'DRAFT';
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('Error al desactivar el proceso', 'Error'),
    });
  }

  deleteProcess(p: ProcessCard): void {
    if (p.activeTramites > 0) {
      this.toastr.warning(`No se puede eliminar: tiene ${p.activeTramites} trámites activos`, 'Atención');
      return;
    }
    if (!confirm(`¿Eliminar el proceso "${p.name}"? Esta acción no se puede deshacer.`)) return;
    this.processService.delete(p.id).subscribe({
      next: () => {
        this.processes = this.processes.filter(x => x.id !== p.id);
        if (this.selectedProcess?.id === p.id) this.closeTramites();
        this.toastr.success('Proceso eliminado', 'Eliminado');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('Error al eliminar el proceso', 'Error'),
    });
  }

  deleteTramite(t: any): void {
    if (!confirm(`¿Eliminar el trámite ${t.code ?? t.tramiteId}? Esta acción no se puede deshacer.`)) return;
    this.tramiteService.delete(t.tramiteId).subscribe({
      next: () => {
        this.tramites = this.tramites.filter(x => x.tramiteId !== t.tramiteId);
        if (this.selectedProcess) {
          this.selectedProcess.activeTramites = Math.max(0, (this.selectedProcess.activeTramites ?? 1) - 1);
        }
        if (this.detailTramite?.id === t.tramiteId) this.detailTramite = null;
        this.toastr.success('Trámite eliminado', 'Eliminado');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('Error al eliminar el trámite', 'Error'),
    });
  }

  statusMod(status: string): string {
    const s = status?.toUpperCase();
    if (s === 'ACTIVE' || s === 'PUBLISHED' || s === 'ACTIVO') return 'ACTIVO';
    if (s === 'DEPRECATED') return 'DEPRECATED';
    return 'DRAFT';
  }

  tramiteStatusClass(status: string): string {
    const s = status?.toUpperCase();
    if (s === 'COMPLETED') return 'tram-completed';
    if (s === 'CANCELLED') return 'tram-cancelled';
    if (s === 'ACTIVE')    return 'tram-active';
    return 'tram-draft';
  }

  tramiteStatusLabel(status: string): string {
    const s = status?.toUpperCase();
    if (s === 'COMPLETED') return 'Completado';
    if (s === 'CANCELLED') return 'Rechazado';
    if (s === 'ACTIVE')    return 'En proceso';
    return status ?? '—';
  }

  detailHistoryEntries(): any[] {
    return this.detailTramite?.history ?? [];
  }
}
