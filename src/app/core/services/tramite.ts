import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class TramiteService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = environment.apiUrl;

  createTramite(data: any): Observable<any> {
    return this.http.post(`${this.base}/tramites`, data);
  }

  // POST /api/tramites/{tramiteId}/submit  — completar tarea
  submitTask(tramiteId: string, data: any): Observable<any> {
    return this.http.post(`${this.base}/tramites/${tramiteId}/submit`, data);
  }

  getByCode(code: string): Observable<any> {
    return this.http.get(`${this.base}/tramites/code/${code}`);
  }

  // GET /api/tramites/my-tasks  — tareas del funcionario
  getMyTasks(): Observable<any[]> {
    const departmentId = this.auth.getCurrentUser()?.departmentId ?? '';
    const params = departmentId ? `?departmentId=${departmentId}` : '';
    return this.http.get<any[]>(`${this.base}/tramites/my-tasks${params}`);
  }

  // GET /api/tramites/{id}  — detalle de un trámite
  getById(tramiteId: string): Observable<any> {
    return this.http.get(`${this.base}/tramites/${tramiteId}`);
  }

  // GET /api/tramites/{tramiteId}/current-form  — formulario del nodo actual
  getCurrentForm(tramiteId: string): Observable<any> {
    return this.http.get(`${this.base}/tramites/${tramiteId}/current-form`);
  }

  // GET /api/tramites/{tramiteId}/form/{nodeId}  — formulario de un nodo específico
  getFormForNode(tramiteId: string, nodeId: string): Observable<any> {
    return this.http.get(`${this.base}/tramites/${tramiteId}/form/${nodeId}`);
  }

  // GET /api/tramites/can-initiate — puede este usuario iniciar trámites?
  canInitiate(): Observable<boolean> {
    return this.http.get<boolean>(`${this.base}/tramites/can-initiate`);
  }

  // GET /api/tramites/by-process/{processId} — trámites activos de un proceso
  getTramitesByProcess(processId: string): Observable<TramiteNodeInfo[]> {
    return this.http.get<TramiteNodeInfo[]>(`${this.base}/tramites/by-process/${processId}`);
  }

  // GET /api/tramites/by-process/{processId}/all — todos (admin)
  getAllTramitesByProcess(processId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/tramites/by-process/${processId}/all`);
  }

  // GET /api/tramites/{tramiteId}/submission/{nodeId} — datos enviados (read-only)
  getSubmission(tramiteId: string, nodeId: string): Observable<any> {
    return this.http.get<any>(`${this.base}/tramites/${tramiteId}/submission/${nodeId}`);
  }

  // DELETE /api/tramites/{id} — eliminar trámite (solo admin)
  delete(tramiteId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tramites/${tramiteId}`);
  }

  // GET /api/tramites/my-stats — estadísticas reales del departamento
  getMyStats(departmentId?: string): Observable<any> {
    const params = departmentId ? `?departmentId=${departmentId}` : '';
    return this.http.get<any>(`${this.base}/tramites/my-stats${params}`);
  }
}

export interface TramiteNodeInfo {
  tramiteId:    string;
  code:         string;
  currentNodeId: string;
  clienteNombre: string | null;
  startedAt:    string;
}
