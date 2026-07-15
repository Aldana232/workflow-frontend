import { Component, Input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import {
  LucideLayoutDashboard,
  LucideClipboardList,
  LucidePencil,
  LucideBuilding2,
  LucideUsers,
  LucideTrendingUp,
  LucideSettings,
  LucideCircleCheck,
  LucidePlus,
  LucideChartBar,
} from '@lucide/angular';

interface NavItem {
  label: string;
  route: string;
  icon:  string;
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink, RouterLinkActive,
    LucideLayoutDashboard,
    LucideClipboardList,
    LucidePencil,
    LucideBuilding2,
    LucideUsers,
    LucideTrendingUp,
    LucideSettings,
    LucideCircleCheck,
    LucidePlus,
    LucideChartBar,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  @Input() isOpen = false;

  private authService = inject(AuthService);

  get role(): string | null { return this.authService.getRole(); }

  adminItems: NavItem[] = [
    { label: 'Dashboard',     route: '/admin/dashboard',   icon: 'dashboard' },
    { label: 'Procesos',      route: '/admin/processes',   icon: 'procesos' },
    { label: 'Diseñador',     route: '/admin/designer',    icon: 'disenador' },
    { label: 'Departamentos', route: '/admin/departments', icon: 'departamentos' },
    { label: 'Funcionarios',  route: '/admin/users',       icon: 'funcionarios' },
    { label: 'Analítica',     route: '/admin/analytics',   icon: 'analitica' },
    { label: 'Configuración', route: '/admin/settings',    icon: 'configuracion' },
  ];

  funcionarioItems: NavItem[] = [
    { label: 'Mis Tareas',       route: '/funcionario/dashboard',     icon: 'mis-tareas' },
    { label: 'Nuevo Trámite',    route: '/funcionario/nuevo-tramite', icon: 'nuevo-tramite' },
    { label: 'Mis Estadísticas', route: '/funcionario/stats',         icon: 'mis-estadisticas' },
    { label: 'Configuración',    route: '/funcionario/settings',      icon: 'configuracion' },
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
