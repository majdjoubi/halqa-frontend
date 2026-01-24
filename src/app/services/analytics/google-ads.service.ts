import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

@Injectable({
  providedIn: 'root',
})
export class GoogleAdsService {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  trackConversion(sendTo: string, transactionId?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

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
