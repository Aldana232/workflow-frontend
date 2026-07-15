import { Component, inject, HostListener, Output, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { LucideZap, LucideUser, LucideLogOut } from '@lucide/angular';

@Component({
  selector: 'app-navbar',
  imports: [LucideZap, LucideUser, LucideLogOut],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  private authService = inject(AuthService);
  private router      = inject(Router);

  @Output() hamburgerClick = new EventEmitter<void>();

  showMenu = false;

  onHamburger(): void { this.hamburgerClick.emit(); }

  get user() { return this.authService.getCurrentUser(); }
  get userName(): string { return this.user?.name ?? 'Usuario'; }
  get role(): string { return this.user?.role ?? ''; }

  get initials(): string {
    return (this.user?.name ?? 'U')
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  get avatarUrl(): string | null {
    const id = this.user?.id;
    return id ? (localStorage.getItem(`avatar_${id}`) ?? null) : null;
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      ADMIN: 'Administrador',
      FUNCIONARIO: 'Funcionario',
      SUPERADMIN: 'Super Admin',
    };
    return map[this.role] ?? this.role;
  }

  toggleMenu(): void { this.showMenu = !this.showMenu; }

  goProfile(): void {
    this.showMenu = false;
    const path = this.role === 'ADMIN' ? '/admin/profile' : '/funcionario/profile';
    this.router.navigate([path]);
  }

  logout(): void {
    this.showMenu = false;
    this.authService.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.avatar-wrapper')) this.showMenu = false;
  }
}
