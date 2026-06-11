import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ShareToken {
  id:          string;
  token:       string;
  shareUrl:    string;
  expiresAt:   string;
  accessCount: number;
  tramiteId:   string;
  tramiteCode: string;
  createdAt:   string;
}

@Injectable({ providedIn: 'root' })
export class ShareService {
  private http       = inject(HttpClient);
  private base       = environment.apiUrl;

  // Bypasa TODOS los interceptores — el endpoint validate es público, sin JWT
  private httpPublic = new HttpClient(inject(HttpBackend));

  generateToken(tramiteId: string, tramiteCode: string): Observable<ShareToken> {
    return this.http.post<ShareToken>(
      `${this.base}/share/generate`,
      { tramiteId, tramiteCode }
    );
  }

  /** Llamada pública — sin JWT, usando HttpBackend directo */
  validateToken(token: string): Observable<any> {
    return this.httpPublic.get<any>(`${this.base}/share/validate/${token}`);
  }

  getTokensByTramite(tramiteId: string): Observable<ShareToken[]> {
    return this.http.get<ShareToken[]>(`${this.base}/share/tokens/${tramiteId}`);
  }

  revokeToken(tokenId: string): Observable<any> {
    return this.http.delete(`${this.base}/share/revoke/${tokenId}`);
  }
}
