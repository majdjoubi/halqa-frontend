import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CookieConsentService } from '../consent/cookie-consent.service';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

@Injectable({
  providedIn: 'root',
})
export class GoogleAdsService {
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private consent: CookieConsentService
  ) {}

  trackConversion(sendTo: string, transactionId?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.consent.marketingAllowed) return;

    const gtag = window.gtag;
    if (typeof gtag !== 'function') return;

    const payload: Record<string, any> = {
      ['send_to']: sendTo,
    };

    if (transactionId) {
      payload['transaction_id'] = transactionId;
    }

    gtag('event', 'conversion', payload);
  }
}
