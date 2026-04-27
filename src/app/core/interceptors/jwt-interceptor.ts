import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = localStorage.getItem('token');

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo hacer logout si había un token y el servidor lo rechazó (expirado/inválido)
      // Si no había token, no tiene sentido hacer logout
      if (error.status === 401 && token) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
