import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ── Tipos públicos exportados ────────────────────────────────────────────────

export type FormFieldType = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'CHECKBOX' | 'FILE';

export interface FormField {
  id?:          string;
  name?:        string;
  label:        string;
  type:         FormFieldType;
  required:     boolean;
  placeholder?: string;
  options?:     string[];   // solo para type === 'SELECT'
}

export interface NodeFormSchema {
  id?:       string;
  processId: string;
  nodeId:    string;
  fields:    FormField[];
}

// ── Servicio ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FormSchemaService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * GET /api/form-schemas/node?processId=X&nodeId=Y
   * Devuelve null si no existe aún (404 → of(null))
   */
  getByNode(processId: string, nodeId: string): Observable<NodeFormSchema | null> {
    const params = new HttpParams()
      .set('processId', processId)
      .set('nodeId',    nodeId);
    return this.http
      .get<NodeFormSchema>(`${this.base}/form-schemas/node`, { params })
      .pipe(catchError(() => of(null)));
  }

  /**
   * POST /api/form-schemas
   * Crea o actualiza el esquema completo del nodo.
   *
   * Payload ejemplo:
   * {
   *   "processId": "proc-abc123",
   *   "nodeId":    "Activity_1a2b3c",
   *   "fields": [
   *     { "label": "Nombre",          "type": "TEXT",     "required": true  },
   *     { "label": "Tipo conexión",   "type": "SELECT",   "required": true,
   *       "options": ["Domiciliaria","Comercial","Industrial"] },
   *     { "label": "Requiere visita", "type": "CHECKBOX", "required": false }
   *   ]
   * }
   */
  save(schema: NodeFormSchema): Observable<NodeFormSchema> {
    return this.http.post<NodeFormSchema>(`${this.base}/form-schemas`, schema);
  }
}
