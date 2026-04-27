import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, tap } from 'rxjs';
import { User } from '../models/user.model';
import { NotificationService } from './notification';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private notificationService = inject(NotificationService);

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    // Restaurar sesión y WebSocket si ya hay un token guardado (recarga de página)
    const token = localStorage.getItem('token');
    if (token) {
      const user = this.decodeToken(token);
      if (user) {
        this.currentUserSubject.next(user);
        // Diferir hasta que todos los servicios estén listos
        queueMicrotask(() => this.notificationService.connect(user));
      }
    }
  }

  // Flag compartido: el dashboard lo carga, el sidebar lo lee
  private _canInitiate = false;
  setCanInitiate(val: boolean): void { this._canInitiate = val; }
  get canInitiate(): boolean { return this._canInitiate; }

  login(email: string, password: string) {
    return this.http.post<any>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap((res: any) => {
        const token = res.token ?? res.jwt ?? res.accessToken ?? res;
        localStorage.setItem('token', token);
        const user = this.decodeToken(token);
        this.currentUserSubject.next(user);
        if (user) {
          this.notificationService.connect(user);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    this.currentUserSubject.next(null);
    this.notificationService.disconnect();
    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return this.decodeToken(token);
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  getRole(): string | null {
    const user = this.getCurrentUser();
    return user ? user.role : null;
  }

  private decodeToken(token: string): User | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));

      // Soporta: "ADMIN", "ROLE_ADMIN", [{authority:"ROLE_ADMIN"}]
      const rawRole = payload.role ?? payload.roles ?? payload.authorities ?? '';
      let role: string;
      if (Array.isArray(rawRole)) {
        const first = rawRole[0];
        role = (typeof first === 'string' ? first : first?.authority ?? '')
          .replace('ROLE_', '');
      } else {
        role = String(rawRole).replace('ROLE_', '');
      }

      return {
        id:           payload.id ?? payload.sub,
        name:         payload.name ?? payload.sub,
        email:        payload.email ?? payload.sub,
        role:         role as User['role'],
        companyId:    payload.companyId ?? '',
        departmentId: payload.departmentId ?? '',
      };
    } catch {
      return null;
    }
  }
}
