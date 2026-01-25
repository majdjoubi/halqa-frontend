import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CookieConsentService } from '../consent/cookie-consent.service';
import { environment } from '../../environment/environment';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

@Injectable({
  providedIn: 'root',
})
export class GoogleAdsService {
  private readonly PURCHASE_SEEN_KEY = 'ads_purchase_seen';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private consent: CookieConsentService
  ) {}

  /**
   * Fire a raw Google tag event.
   * This is gated behind marketing consent.
   */
  trackEvent(eventName: string, params?: Record<string, any>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.consent.marketingAllowed) return;

    const gtag = window.gtag;
    if (typeof gtag !== 'function') return;

    gtag('event', eventName, params || {});
  }

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

  /**
   * Convenience wrapper for your main Purchase conversion.
   * Fires both:
   * - Google Ads conversion (send_to)
   * - Optional goal event name (e.g. ads_conversion_Purchase_1)
   */
  trackPurchase(transactionId?: string): void {
    const sendTo = environment.googleAds?.conversionSendTo;
    if (sendTo) this.trackConversion(sendTo, transactionId);

    const purchaseEventName = environment.googleAds?.purchaseEventName;
    if (purchaseEventName) {
      const params: Record<string, any> = {};
      if (transactionId) params['transaction_id'] = transactionId;

      const newCustomer = this.getAndPersistNewCustomerFlag();
      if (typeof newCustomer === 'boolean') params['new_customer'] = newCustomer;

      this.trackEvent(purchaseEventName, params);
    }
  }

  private getAndPersistNewCustomerFlag(): boolean | undefined {
    if (!isPlatformBrowser(this.platformId)) return undefined;

    try {
      const seen = localStorage.getItem(this.PURCHASE_SEEN_KEY);
      if (seen === '1') return false;

      localStorage.setItem(this.PURCHASE_SEEN_KEY, '1');
      return true;
    } catch {
      return undefined;
    }
  }
}
