import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { environment } from '../../environment/environment';

export interface TrialEligibilityResponse {
  eligible: boolean;
  verificationFeeUsd?: number;
  verificationStatus?: 'unpaid' | 'paid' | 'not_required' | string;
  reason?: string | null;
  lockedTeacherId?: string | null;
  constraints?: {
    onePerStudent?: boolean;
    oneTeacherOnly?: boolean;
  };
}

export interface TrialVerifyResponse {
  verificationStatus?: 'unpaid' | 'paid' | 'not_required' | string;
  verificationFeeUsd?: number;
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
      return of({
        eligible: false,
        verificationFeeUsd: 0,
        verificationStatus: 'unpaid',
        reason: null,
        lockedTeacherId: null,
      });
    }

    return this.http.get<TrialEligibilityResponse>(
      `${this.baseUrl}/v2/trial/eligibility?teacherId=${encodeURIComponent(teacherId)}`
    );
  }

  verify(method: 'wallet' | 'stripe' = 'wallet', idempotencyKey?: string): Observable<TrialVerifyResponse | null> {
    if (!this.isEnabled() || !isPlatformBrowser(this.platformId)) {
      return of(null);
    }

    return this.http.post<TrialVerifyResponse>(`${this.baseUrl}/v2/trial/verify`, { method, idempotencyKey });
  }
}
