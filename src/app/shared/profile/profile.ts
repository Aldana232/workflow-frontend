import {
  Component, inject, OnInit,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../core/services/auth';
import { UserService } from '../../core/services/user';
import { LucideArrowLeft, LucideCamera, LucideTrash2 } from '@lucide/angular';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, LucideArrowLeft, LucideCamera, LucideTrash2],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile implements OnInit {
  private auth    = inject(AuthService);
  private userSvc = inject(UserService);
  private toastr  = inject(ToastrService);
  private router  = inject(Router);
  private cdr     = inject(ChangeDetectorRef);

  user: any = null;
  editName = '';
  avatarUrl: string | null = null;
  saving = false;

  get initials(): string {
    return (this.user?.name ?? 'U')
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      ADMIN: 'Administrador',
      FUNCIONARIO: 'Funcionario',
      SUPERADMIN: 'Super Administrador',
    };
    return map[this.user?.role ?? ''] ?? (this.user?.role ?? '—');
  }

  ngOnInit(): void {
    this.user     = this.auth.getCurrentUser();
    this.editName = this.user?.name ?? '';
    this.avatarUrl = localStorage.getItem(`avatar_${this.user?.id}`) ?? null;
  }

  onAvatarChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.toastr.warning('La imagen no debe superar 2 MB', 'Atención');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.avatarUrl = e.target.result as string;
      localStorage.setItem(`avatar_${this.user?.id}`, this.avatarUrl!);
      this.cdr.markForCheck();
      this.toastr.success('Foto de perfil actualizada', 'Éxito');
    };
    reader.readAsDataURL(file);
  }

  saveName(): void {
    if (!this.editName.trim()) {
      this.toastr.warning('El nombre no puede estar vacío', 'Atención');
      return;
    }
    this.saving = true;
    this.userSvc.updateById(this.user.id, { name: this.editName.trim() }).subscribe({
      next: () => {
        localStorage.setItem(`displayName_${this.user.id}`, this.editName.trim());
        this.toastr.success('Nombre actualizado correctamente', 'Guardado');
        this.saving = false;
        this.cdr.markForCheck();
      },
      error: () => {
        // Store locally if API not available
        localStorage.setItem(`displayName_${this.user.id}`, this.editName.trim());
        this.toastr.success('Nombre guardado localmente', 'Guardado');
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  removeAvatar(): void {
    localStorage.removeItem(`avatar_${this.user?.id}`);
    this.avatarUrl = null;
    this.cdr.markForCheck();
    this.toastr.info('Foto de perfil eliminada', 'Info');
  }

  goBack(): void {
    const role = this.auth.getRole();
    this.router.navigate([role === 'ADMIN' ? '/admin/dashboard' : '/funcionario/dashboard']);
  }
}
