import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { environment } from '../../environment/environment';
import { TimezoneService } from '../scheduling/timezone.service';

export type V2BookingMethod = 'credit' | 'trial' | 'wallet';

export interface V2BookingRequest {
  teacherId: string;
  slotId: string;
  method: V2BookingMethod;
  idempotencyKey?: string;
  studentIanaTimezone?: string;
}

export interface V2BookingResponse {
  bookingId: string;
  payment?: {
    method: V2BookingMethod;
    unitPriceUsd?: number;
  };
  balance?: {
    available: number;
    reserved?: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class V2BookingService {
  private readonly baseUrl = ((environment as any).v2ApiUrl || environment.apiUrl || '').replace(/\/$/, '');

  constructor(
    private http: HttpClient,
    private timezoneService: TimezoneService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  bookSlot(req: V2BookingRequest): Observable<V2BookingResponse | null> {
    if (!isPlatformBrowser(this.platformId)) {
      return of(null);
    }

    const payload: V2BookingRequest = {
      ...req,
      studentIanaTimezone: req.studentIanaTimezone || this.timezoneService.detectClientTimezone(),
    };

    return this.http.post<V2BookingResponse>(`${this.baseUrl}/v2/slots/book`, payload);
  }
}
