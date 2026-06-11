import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AnalyticsSummary {
  totalActiveTramites:      number;
  totalCompletedThisMonth:  number;
  avgDurationMinutes:       number;
  totalActiveProcesses:     number;
}

export interface NodeAnalytics {
  nodeId:             string;
  nodeName:           string;
  avgDurationMinutes: number;
  totalTasks:         number;
}

export interface ActiveTramite {
  code:           string;
  processName:    string;
  currentNode:    string;
  departmentName: string;
  waitingMinutes: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getSummary(companyId: string): Observable<AnalyticsSummary | null> {
    return this.http
      .get<any>(`${this.base}/analytics/summary/${companyId}`)
      .pipe(
        map((r: any) => r?.data ?? r),
        catchError(() => of(null))
      );
  }

  getNodesAnalytics(processId: string): Observable<NodeAnalytics[]> {
    return this.http
      .get<any>(`${this.base}/analytics/nodes/${processId}`)
      .pipe(
        map((r: any) => r?.data ?? r ?? []),
        catchError(() => of([]))
      );
  }

  getActiveTramites(companyId: string): Observable<ActiveTramite[]> {
    return this.http
      .get<any>(`${this.base}/analytics/active-tramites/${companyId}`)
      .pipe(
        map((r: any) => r?.data ?? r ?? []),
        catchError(() => of([]))
      );
  }

  // ── Analytics endpoints (empresa) ───────────────────────────────────────────

  /** GET /api/analytics/bottlenecks/{companyId} — cuellos de botella por empresa */
  getAnalyticsBottlenecks(companyId: string): Observable<any> {
    return this.http
      .get<any>(`${this.base}/analytics/bottlenecks/${companyId}`)
      .pipe(catchError(() => of([])));
  }

  /** GET /api/analytics/department-performance/{companyId} — rendimiento por departamento */
  getDepartmentPerformance(companyId: string): Observable<any> {
    return this.http
      .get<any>(`${this.base}/analytics/department-performance/${companyId}`)
      .pipe(
        map((r: any) => r?.data ?? r ?? []),
        catchError(() => of([]))
      );
  }

  // ── AI endpoints ────────────────────────────────────────────────────────────

  getAiBottlenecks(processId: string): Observable<any> {
    return this.http.get(`${this.base}/ai/bottlenecks/${processId}`);
  }

  getAiAnomalies(companyId: string): Observable<any> {
    return this.http.get(`${this.base}/ai/anomalies/${companyId}`);
  }

  getAiPriority(companyId: string): Observable<any> {
    return this.http.get(`${this.base}/ai/priority/${companyId}`);
  }

  recommendPolicy(description: string, companyId: string): Observable<any> {
    return this.http.post(`${this.base}/ai/recommend-policy`, { description, companyId });
  }

  getReportByDate(fromDate: string, toDate: string): Observable<any> {
    return this.http.get(`${this.base}/ai/report/by-date?fromDate=${fromDate}&toDate=${toDate}`);
  }

  getReportByClient(name: string): Observable<any> {
    return this.http.get(`${this.base}/ai/report/by-client?name=${name}`);
  }

  getSummaryByProcess(): Observable<any> {
    return this.http.get(`${this.base}/ai/report/by-process`);
  }
}
