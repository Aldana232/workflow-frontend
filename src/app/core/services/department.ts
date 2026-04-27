import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/departments`;

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.base);
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(`${this.base}/${id}`);
  }

  create(data: { name: string; description?: string }): Observable<any> {
    return this.http.post<any>(this.base, data);
  }

  update(id: string, data: Partial<{ name: string; description: string; active: boolean }>): Observable<any> {
    return this.http.put<any>(`${this.base}/${id}`, data);
  }

  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
