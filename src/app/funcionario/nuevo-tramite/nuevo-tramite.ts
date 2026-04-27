import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { TramiteService } from '../../core/services/tramite';
import { ProcessService } from '../../core/services/process';

@Component({
  selector: 'app-nuevo-tramite',
  imports: [ReactiveFormsModule],
  templateUrl: './nuevo-tramite.html',
  styleUrl: './nuevo-tramite.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuevoTramite implements OnInit {
  private fb             = inject(FormBuilder);
  private tramiteService = inject(TramiteService);
  private processService = inject(ProcessService);
  private toastr         = inject(ToastrService);
  private router         = inject(Router);
  private cdr            = inject(ChangeDetectorRef);

  form!: FormGroup;
  processes: any[]  = [];
  submitting        = false;
  codigoGenerado    = '';

  ngOnInit(): void {
    this.form = this.fb.group({
      processId: ['', Validators.required],
      nombre:    ['', [Validators.required, Validators.minLength(3)]],
      ci:        ['', [Validators.required, Validators.minLength(5)]],
      telefono:  ['', [Validators.required, Validators.minLength(7)]],
      email:     ['', [Validators.required, Validators.email]],
      direccion: ['', [Validators.required, Validators.minLength(5)]],
    });

    this.processService.getAllActive().subscribe({
      next: (list: any[]) => {
        this.processes = list.filter((p: any) => {
          const s = (p.status ?? '').toUpperCase();
          return s === 'ACTIVE';
        });
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastr.error('No se pudieron cargar los procesos', 'Error');
      },
    });
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting = true;
    const { processId, nombre, ci, telefono, email, direccion } = this.form.getRawValue();

    const payload = {
      processId,
      clienteInfo: { nombre, ci, telefono, email, direccion },
    };

    this.tramiteService.createTramite(payload).subscribe({
      next: (res: any) => {
        this.codigoGenerado = res?.code ?? res?.tramiteCode ?? '—';
        this.submitting     = false;
        this.toastr.success(`Trámite creado: ${this.codigoGenerado}`, '¡Éxito!');
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = err?.error?.message ?? 'Error al crear el trámite';
        this.toastr.error(msg, 'Error');
        this.submitting = false;
        this.cdr.markForCheck();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/funcionario/dashboard']);
  }

  err(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }
}
