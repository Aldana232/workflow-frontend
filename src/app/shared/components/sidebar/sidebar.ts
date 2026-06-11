import { Component, Input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth';

interface NavItem {
  label: string;
  route: string;
  icon:  string;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  @Input() isOpen = false;

  private authService = inject(AuthService);

  get role(): string | null { return this.authService.getRole(); }

  adminItems: NavItem[] = [
    { label: 'Dashboard',     route: '/admin/dashboard',   icon: '📊' },
    { label: 'Procesos',      route: '/admin/processes',   icon: '📋' },
    { label: 'Diseñador',     route: '/admin/designer',    icon: '✏️' },
    { label: 'Departamentos', route: '/admin/departments', icon: '🏢' },
    { label: 'Funcionarios',  route: '/admin/users',       icon: '👥' },
    { label: 'Analítica',     route: '/admin/analytics',   icon: '📈' },
    { label: 'Configuración', route: '/admin/settings',    icon: '⚙️' },
  ];

  funcionarioItems: NavItem[] = [
    { label: 'Mis Tareas',       route: '/funcionario/dashboard',     icon: '✅' },
    { label: 'Nuevo Trámite',    route: '/funcionario/nuevo-tramite', icon: '➕' },
    { label: 'Mis Estadísticas', route: '/funcionario/stats',         icon: '📊' },
    { label: 'Configuración',    route: '/funcionario/settings',      icon: '⚙️' },
  ];

  get menuItems(): NavItem[] {
    if (this.role === 'ADMIN') return this.adminItems;
    if (this.role === 'FUNCIONARIO') {
      return this.authService.canInitiate
        ? this.funcionarioItems
        : this.funcionarioItems.filter(i => i.route !== '/funcionario/nuevo-tramite');
    }
    return [];
  }
}
