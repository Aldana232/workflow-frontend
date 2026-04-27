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
}
