import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { roleGuard } from './core/guards/role-guard';

export const routes: Routes = [

  // ── Default ──────────────────────────────────────────────────────────────
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // ── Públicas ─────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then(m => m.Login),
  },
  {
    path: 'tramite/:code',
    loadComponent: () =>
      import('./public/consulta-publica/consulta-publica').then(m => m.ConsultaPublica),
  },

  // ── Admin (rol: ADMIN) ────────────────────────────────────────────────────
  {
    path: 'admin',
    loadComponent: () =>
      import('./shared/components/layout/layout').then(m => m.Layout),
    canActivate: [authGuard, roleGuard],
    data: { role: 'ADMIN' },
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./admin/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'processes',
        loadComponent: () =>
          import('./admin/processes/processes').then(m => m.Processes),
      },
      {
        path: 'designer',
        loadComponent: () =>
          import('./admin/designer/designer').then(m => m.Designer),
      },
      {
        path: 'designer/:id',
        loadComponent: () =>
          import('./admin/designer/designer').then(m => m.Designer),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./admin/users/users').then(m => m.Users),
      },
      {
        path: 'departments',
        loadComponent: () =>
          import('./admin/departments/departments').then(m => m.Departments),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./admin/analytics/analytics').then(m => m.Analytics),
      },
      {
        path: 'process/:id',
        loadComponent: () =>
          import('./admin/process-view/process-view').then(m => m.ProcessView),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./admin/settings/settings').then(m => m.Settings),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./shared/profile/profile').then(m => m.Profile),
      },
    ],
  },

  // ── Funcionario (rol: FUNCIONARIO) ────────────────────────────────────────
  {
    path: 'funcionario',
    loadComponent: () =>
      import('./shared/components/layout/layout').then(m => m.Layout),
    canActivate: [authGuard, roleGuard],
    data: { role: 'FUNCIONARIO' },
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./funcionario/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'task/:id',
        loadComponent: () =>
          import('./funcionario/task-detail/task-detail').then(m => m.TaskDetail),
      },
      {
        path: 'flow/:tramiteId',
        loadComponent: () =>
          import('./funcionario/flow-view/flow-view').then(m => m.FlowView),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./funcionario/settings/settings').then(m => m.FuncionarioSettings),
      },
      {
        path: 'nuevo-tramite',
        loadComponent: () =>
          import('./funcionario/nuevo-tramite/nuevo-tramite').then(m => m.NuevoTramite),
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('./funcionario/stats/stats').then(m => m.Stats),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./shared/profile/profile').then(m => m.Profile),
      },
    ],
  },

  // ── Fallback ──────────────────────────────────────────────────────────────
  { path: '**', redirectTo: 'login' },
];
