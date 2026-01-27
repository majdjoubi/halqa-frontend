import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environment/environment';

export interface PublicStatisticsResponse {
  totalStudents?: number;
  timestampUtc?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PublicStatisticsService {
  private readonly baseUrl = (environment.apiUrl || '').replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getPublicStatistics(): Observable<PublicStatisticsResponse> {
    return this.http.get<PublicStatisticsResponse>(`${this.baseUrl}/api/public/statistics`);
  }

  getTotalStudentsCount(): Observable<number | null> {
    return this.getPublicStatistics().pipe(
      map((res) => {
        const value = Number((res as any)?.totalStudents);
        return Number.isFinite(value) ? value : null;
      })
    );
  }
}
