import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OnlyOfficeService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/documents`;

  // Obtiene config del editor para un documento
  getEditorConfig(documentId: string): Observable<any> {
    return this.http.get(`${this.base}/${documentId}/collab/config`);
  }

  // Admin habilita modo colaborativo y asigna permisos
  enableCollaborativeMode(documentId: string, editorIds: string[], viewerIds: string[]): Observable<any> {
    return this.http.put(`${this.base}/${documentId}/collab/enable`, { editorIds, viewerIds });
  }

  // Lista documentos colaborativos de un trámite
  getCollaborativeDocuments(tramiteId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/tramite/${tramiteId}/collab`);
  }
}
