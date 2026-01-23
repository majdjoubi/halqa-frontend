import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map } from 'rxjs';
import { environment } from '../../environment/environment';
import { HttpErrorResponse } from '@angular/common/http';

export type GiftPackageId = 'pkg_1' | 'pkg_3' | 'pkg_6' | 'pkg_10' | 'pkg_test';

export interface GiftPackage {
  id: GiftPackageId;
  lessons: number;
  priceUsd: number;
}

export interface GiftVoucherPublic {
  code: string;
  shortCode?: string | null;
  packageId: string;
  lessons: number;
  priceUsd: number;
  currency: string;
  provider: 'stripe' | 'paypal' | string;
  status: 'pending' | 'paid' | 'failed' | string;
  recipientName?: string | null;
  message?: string | null;
  createdAtUtc?: string;
  paidAtUtc?: string | null;
  expiresAtUtc?: string;
  redeemedAtUtc?: string | null;
  redeemUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class GiftService {
  private readonly baseUrl = (environment.apiUrl || '').replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getPackages(): Observable<{ packages: GiftPackage[] }> {
    const url = `${this.baseUrl}/api/gifts/packages`;
    return this.http.get<{ packages: GiftPackage[] }>(url);
  }

  getPayPalGiftStatus(): Observable<{ enabled: boolean }> {
    const url = `${this.baseUrl}/api/gifts/paypal/status`;
    // Be defensive: if the endpoint is not deployed/mis-routed, some hosts may
    // return the SPA index.html (200 text/html) which would otherwise cause a
    // JSON parse error in HttpClient.
    return this.http.get(url, { responseType: 'text' }).pipe(
      map((text) => {
        try {
          const data = JSON.parse(String(text || ''));
          return { enabled: !!data?.enabled };
        } catch {
          return { enabled: false };
        }
      })
    );
  }

  createStripeIntent(payload: {
    packageId: GiftPackageId;
    recipientName?: string;
    message?: string;
    purchaserEmail?: string;
  }): Observable<{ code: string; clientSecret: string | null }> {
    const url = `${this.baseUrl}/api/gifts/stripe/create-intent`;
    return this.http.post<{ code: string; clientSecret: string | null }>(url, payload);
  }

  createPayPalOrder(payload: {
    packageId: GiftPackageId;
    recipientName?: string;
    message?: string;
    purchaserEmail?: string;
  }): Observable<{ orderId: string; code: string }> {
    const url = `${this.baseUrl}/api/gifts/paypal/create-order`;
    return this.http.post<{ orderId: string; code: string }>(url, payload);
  }

  capturePayPalOrder(orderId: string): Observable<{ success: boolean; code: string; status?: string }> {
    const url = `${this.baseUrl}/api/gifts/paypal/capture-order`;
    return this.http.post<{ success: boolean; code: string; status?: string }>(url, { orderId });
  }

  getVoucher(code: string): Observable<{ voucher: GiftVoucherPublic }> {
    const primaryUrl = `${this.baseUrl}/api/gifts/vouchers/${encodeURIComponent(code)}`;
    const fallbackUrl = `${this.baseUrl}/api/gifts/vouchers/get?code=${encodeURIComponent(code)}`;

    const parse = (text: any) => {
      const data = JSON.parse(String(text || ''));
      if (!data?.voucher) throw new Error('Invalid voucher response');
      return data as { voucher: GiftVoucherPublic };
    };

    const shouldFallback = (err: any): boolean => {
      const status = Number((err as HttpErrorResponse)?.status ?? NaN);
      // Parse errors (no status) or network-ish failures may be due to routing/rewrites.
      if (!Number.isFinite(status)) return true;
      if (status === 0) return true;
      // If the primary route isn't deployed/mis-routed, some hosts return 404/405.
      if (status === 404 || status === 405) return true;
      // Transient gateway/proxy errors.
      if (status === 502 || status === 503 || status === 504) return true;
      // Do not fallback for normal auth/validation errors.
      return false;
    };

    return this.http.get(primaryUrl, { responseType: 'text' }).pipe(
      map(parse),
      catchError((err) => {
        if (!shouldFallback(err)) throw err;
        return this.http.get(fallbackUrl, { responseType: 'text' }).pipe(map(parse));
      })
    );
  }

  redeemVoucher(code: string): Observable<any> {
    const primaryUrl = `${this.baseUrl}/api/gifts/vouchers/${encodeURIComponent(code)}/redeem`;
    const fallbackUrl = `${this.baseUrl}/api/gifts/vouchers/redeem?code=${encodeURIComponent(code)}`;

    const parse = (text: any) => {
      // Most responses are JSON; if we ever get HTML/invalid, force an error.
      return JSON.parse(String(text || ''));
    };

    const shouldFallback = (err: any): boolean => {
      const status = Number((err as HttpErrorResponse)?.status ?? NaN);
      if (!Number.isFinite(status)) return true;
      if (status === 0) return true;
      if (status === 404 || status === 405) return true;
      if (status === 502 || status === 503 || status === 504) return true;
      return false;
    };

    return this.http.post(primaryUrl, {}, { responseType: 'text' }).pipe(
      map(parse),
      catchError((err) => {
        if (!shouldFallback(err)) throw err;
        return this.http.post(fallbackUrl, {}, { responseType: 'text' }).pipe(map(parse));
      })
    );
  }
}
