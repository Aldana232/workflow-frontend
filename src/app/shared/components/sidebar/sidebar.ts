import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth';

interface NavItem {
  label: string;
  route: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  private authService = inject(AuthService);

  get role(): string | null {
    return this.authService.getRole();
  }

  adminItems: NavItem[] = [
    { label: 'Dashboard',     route: '/admin/dashboard'   },
    { label: 'Procesos',      route: '/admin/processes'   },
    { label: 'Diseñador',     route: '/admin/designer'    },
    { label: 'Departamentos', route: '/admin/departments' },
    { label: 'Funcionarios',  route: '/admin/users'       },
    { label: 'Analítica',     route: '/admin/analytics'   },
    { label: 'Configuración', route: '/admin/settings'    },
  ];

  funcionarioItems: NavItem[] = [
    { label: 'Mis Tareas',       route: '/funcionario/dashboard'     },
    { label: 'Nuevo Trámite',    route: '/funcionario/nuevo-tramite' },
    { label: 'Mis Estadísticas', route: '/funcionario/stats'         },
    { label: 'Configuración',    route: '/funcionario/settings'      },
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
