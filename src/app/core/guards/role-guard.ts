import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth';

type AppRole = 'ADMIN' | 'FUNCIONARIO';

const roleRedirect: Record<AppRole, string> = {
  ADMIN:       '/admin/dashboard',
  FUNCIONARIO: '/funcionario/dashboard',
};

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean | UrlTree => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const required = route.data['role'] as AppRole | undefined;
  const current  = auth.getRole() as AppRole | null;

  if (!required || current === required) return true;

  const fallback = (current && roleRedirect[current]) ?? '/login';
  return router.createUrlTree([fallback]);
};
