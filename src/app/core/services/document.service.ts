import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  uploadDocument(
    file: File,
    metadata: {
      tramiteId: string;
      tramiteCode: string;
      companyId: string;
      nodeId: string;
      nodeName: string;
      category: string;
      description: string;
    }
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tramiteId', metadata.tramiteId);
    fd.append('tramiteCode', metadata.tramiteCode);
    fd.append('companyId', metadata.companyId);
    fd.append('nodeId', metadata.nodeId);
    fd.append('nodeName', metadata.nodeName);
    fd.append('category', metadata.category);
    fd.append('description', metadata.description);
    return this.http.post(`${this.base}/documents/upload`, fd);
  }

  getDocumentsByTramite(tramiteId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/documents/tramite/${tramiteId}`);
  }

  getDocumentsByNode(tramiteId: string, nodeId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/documents/tramite/${tramiteId}/node/${nodeId}`);
  }

  addEvent(documentId: string, eventType: string, description: string): Observable<any> {
    return this.http.post(`${this.base}/documents/${documentId}/event`, {
      documentId,
      eventType,
      description,
    });
  }

  downloadDocument(documentId: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents/${documentId}/download`, {
      responseType: 'blob' as 'json',
    }) as Observable<Blob>;
  }

  deleteDocument(documentId: string): Observable<any> {
    return this.http.delete(`${this.base}/documents/${documentId}`);
  }

  getStats(companyId: string): Observable<any> {
    return this.http.get(`${this.base}/documents/stats/${companyId}`);
  }

  getDocumentVersions(documentId: string): Observable<DocumentVersion[]> {
    return this.http.get<DocumentVersion[]>(`${this.base}/documents/${documentId}/versions`);
  }

  downloadDocumentVersion(documentId: string, versionId: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/documents/${documentId}/versions/${encodeURIComponent(versionId)}/download`,
      { responseType: 'blob' as 'json' }
    ) as Observable<Blob>;
  }
}

export interface DocumentVersion {
  versionId: string;
  lastModified: string;
  sizeBytes: number;
  latest: boolean;
}
