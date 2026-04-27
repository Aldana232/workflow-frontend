import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class ProcessService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = environment.apiUrl;

  getAll(): Observable<any[]> {
    const companyId = this.auth.getCurrentUser()?.companyId;
    const params = companyId ? new HttpParams().set('companyId', companyId) : new HttpParams();
    return this.http.get<any[]>(`${this.base}/processes`, { params });
  }

  // Devuelve todos los procesos ACTIVE sin filtrar por companyId
  // Usado por FUNCIONARIO para crear trámites
  getAllActive(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/processes`);
  }

  getById(id: string): Observable<any> {
    return this.http.get(`${this.base}/processes/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(`${this.base}/processes`, data);
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(`${this.base}/processes/${id}`, data);
  }

  publish(id: string): Observable<any> {
    return this.http.put(`${this.base}/processes/${id}/publish`, {});
  }

  deactivate(id: string): Observable<any> {
    return this.http.put(`${this.base}/processes/${id}/deactivate`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/processes/${id}`);
  }

  saveSchema(data: any): Observable<any> {
    return this.http.post(`${this.base}/form-schemas`, data);
  }
}
