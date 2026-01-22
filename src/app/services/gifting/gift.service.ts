import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map } from 'rxjs';
import { environment } from '../../environment/environment';

export type GiftPackageId = 'pkg_1' | 'pkg_3' | 'pkg_6' | 'pkg_10' | 'pkg_test';

export interface GiftPackage {
  id: GiftPackageId;
  lessons: number;
  priceUsd: number;
}

export interface GiftVoucherPublic {
  code: string;
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

    return this.http.get(primaryUrl, { responseType: 'text' }).pipe(
      map(parse),
      catchError(() => this.http.get(fallbackUrl, { responseType: 'text' }).pipe(map(parse)))
    );
  }

  redeemVoucher(code: string): Observable<any> {
    const token = localStorage.getItem('access_token') || '';
    const headers = new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});

    const primaryUrl = `${this.baseUrl}/api/gifts/vouchers/${encodeURIComponent(code)}/redeem`;
    const fallbackUrl = `${this.baseUrl}/api/gifts/vouchers/redeem?code=${encodeURIComponent(code)}`;

    const parse = (text: any) => {
      // Most responses are JSON; if we ever get HTML/invalid, force an error.
      return JSON.parse(String(text || ''));
    };

    return this.http.post(primaryUrl, {}, { headers, responseType: 'text' }).pipe(
      map(parse),
      catchError(() => this.http.post(fallbackUrl, {}, { headers, responseType: 'text' }).pipe(map(parse)))
    );
  }
}
