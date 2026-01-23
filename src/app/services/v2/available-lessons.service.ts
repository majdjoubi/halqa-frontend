import { HttpClient } from '@angular/common/http';
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { environment } from '../../environment/environment';
import { StorageService } from '../storage.service';

export interface AvailableLessonsBalance {
  available: number;
  reserved?: number;
}

export interface AvailableLessonsPackage {
  id: string;
  lessons: number;
  priceUsd: number;
  unitPriceUsd?: number;
  active?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AvailableLessonsService {
  private readonly baseUrl = ((environment as any).v2ApiUrl || environment.apiUrl || '').replace(/\/$/, '');

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object,
    private storageService: StorageService
  ) {}

  private getToken(): string {
    return (
      this.storageService.getItem('authToken') ||
      this.storageService.getItem('access_token') ||
      this.storageService.getItem('token') ||
      ''
    ).trim();
  }

  private isStudent(): boolean {
    const role = (this.storageService.getItem('user_role') || '').trim();
    return role === '1' || role.toLowerCase() === 'student';
  }

  isEnabled(): boolean {
    return !!(environment as any)?.features?.v2AvailableLessons;
  }

  getBalance(): Observable<AvailableLessonsBalance> {
    if (!this.isEnabled() || !isPlatformBrowser(this.platformId) || !this.getToken() || !this.isStudent()) {
      return of({ available: 0, reserved: 0 });
    }

    return this.http.get<AvailableLessonsBalance>(`${this.baseUrl}/v2/available-lessons/balance`);
  }

  getPackages(): Observable<AvailableLessonsPackage[]> {
    if (!this.isEnabled() || !isPlatformBrowser(this.platformId) || !this.getToken() || !this.isStudent()) {
      return of([]);
    }

    return this.http.get<AvailableLessonsPackage[]>(`${this.baseUrl}/v2/available-lessons/packages`);
  }

  buyWithWallet(packageId: string): Observable<any> {
    if (!this.isEnabled() || !isPlatformBrowser(this.platformId) || !this.getToken() || !this.isStudent()) {
      return of(null);
    }

    return this.http.post<any>(`${this.baseUrl}/v2/available-lessons/buy-with-wallet`, { packageId });
  }
}
