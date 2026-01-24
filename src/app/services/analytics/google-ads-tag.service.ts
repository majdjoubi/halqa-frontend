import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environment/environment';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

@Injectable({
  providedIn: 'root',
})
export class GoogleAdsTagService {
  private readonly isBrowser: boolean;
  private loadPromise: Promise<void> | null = null;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ensureLoaded(): Promise<void> {
    if (!this.isBrowser) return Promise.resolve();

    if (typeof window.gtag === 'function') return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    const adsId = environment.googleAds?.adsId;
    if (!adsId) return Promise.resolve();

    this.loadPromise = new Promise<void>((resolve) => {
      // Define gtag stub before loading the script.
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function gtag() {
        window.dataLayer!.push(arguments);
      };

      window.gtag('js', new Date());
      window.gtag('config', adsId);

      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
      script.onload = () => resolve();
      script.onerror = () => resolve();

      document.head.appendChild(script);
    });

    return this.loadPromise;
  }
}
