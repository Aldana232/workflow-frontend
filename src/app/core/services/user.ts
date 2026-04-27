import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/users`;

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.base);
  }

  getByDepartment(deptId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/department/${deptId}`);
  }

  create(data: any): Observable<any> {
    return this.http.post<any>(this.base, data);
  }

  updateById(id: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.base}/${id}`, data);
  }

  assignDepartment(userId: string, departmentId: string | null): Observable<any> {
    return this.http.patch<any>(`${this.base}/${userId}/department`, { departmentId });
  }

  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
