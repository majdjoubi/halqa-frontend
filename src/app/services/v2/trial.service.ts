import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { environment } from '../../environment/environment';

export interface TrialEligibilityResponse {
  eligible: boolean;
  verificationFeeUsd?: number;
  reason?: string | null;
  verificationStatus?: 'unpaid' | 'paid' | 'not_required' | string;
}

@Injectable({
  providedIn: 'root',
})
export class TrialService {
  private readonly baseUrl = ((environment as any).v2ApiUrl || environment.apiUrl || '').replace(/\/$/, '');

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  isEnabled(): boolean {
    return !!(environment as any)?.features?.v2Trial;
  }

  getEligibility(teacherId: string): Observable<TrialEligibilityResponse> {
    if (!this.isEnabled() || !isPlatformBrowser(this.platformId) || !teacherId) {
      return of({ eligible: false, verificationFeeUsd: 0, reason: null, verificationStatus: 'unpaid' });
    }

    return this.http.get<TrialEligibilityResponse>(
      `${this.baseUrl}/v2/trial/eligibility?teacherId=${encodeURIComponent(teacherId)}`
    );
  }

  verify(method: 'wallet' | 'stripe' = 'wallet', idempotencyKey?: string): Observable<any> {
    if (!this.isEnabled() || !isPlatformBrowser(this.platformId)) {
      return of(null);
    }

    return this.http.post<any>(`${this.baseUrl}/v2/trial/verify`, { method, idempotencyKey });
  }
}
