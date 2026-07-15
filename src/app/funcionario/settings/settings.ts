import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastrService } from 'ngx-toastr';
import { LucideUser, LucideLock, LucideSettings, LucideInfo, LucideSave } from '@lucide/angular';

@Component({
  selector: 'app-funcionario-settings',
  imports: [FormsModule, LucideUser, LucideLock, LucideSettings, LucideInfo, LucideSave],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuncionarioSettings implements OnInit {
  private auth   = inject(AuthService);
  private http   = inject(HttpClient);
  private toastr = inject(ToastrService);
  private cdr    = inject(ChangeDetectorRef);

  user: any = null;
  activeTab: 'profile' | 'security' | 'preferences' = 'profile';

  // Seguridad
  pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  pwLoading = false;

  // Preferencias
  prefs = {
    emailNotifications: true,
    slaAlerts: true,
    language: 'es',
  };

  ngOnInit(): void {
    this.user = this.auth.getCurrentUser();
    this.cdr.markForCheck();
  }

  setTab(tab: 'profile' | 'security' | 'preferences'): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      FUNCIONARIO: 'Funcionario',
      ADMIN: 'Administrador',
      SUPERADMIN: 'Super Administrador',
    };
    return map[this.user?.role ?? ''] ?? this.user?.role ?? '—';
  }

  get userInitial(): string {
    return (this.user?.name ?? this.user?.email ?? 'U')[0].toUpperCase();
  }

  changePassword(): void {
    if (!this.pwForm.newPassword || this.pwForm.newPassword.length < 6) {
      this.toastr.warning('La nueva contraseña debe tener al menos 6 caracteres', 'Atención');
      return;
    }
    if (this.pwForm.newPassword !== this.pwForm.confirmPassword) {
      this.toastr.error('Las contraseñas no coinciden', 'Error');
      return;
    }
    this.pwLoading = true;
    this.http.post(`${environment.apiUrl}/auth/change-password`, {
      currentPassword: this.pwForm.currentPassword,
      newPassword:     this.pwForm.newPassword,
    }).subscribe({
      next: () => {
        this.toastr.success('Contraseña actualizada', 'Éxito');
        this.pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.pwLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = err?.error?.message ?? 'No se pudo cambiar la contraseña';
        this.toastr.error(msg, 'Error');
        this.pwLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  savePreferences(): void {
    // Preferencias almacenadas localmente
    localStorage.setItem('wf_prefs', JSON.stringify(this.prefs));
    this.toastr.success('Preferencias guardadas', 'Listo');
  }
}
