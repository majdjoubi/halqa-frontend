import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

export type CookieConsentVersion = 1;

export interface CookieConsentState {
  version: CookieConsentVersion;
  necessary: true;
  marketing: boolean;
  updatedAt: number; // epoch ms
}

const STORAGE_KEY = 'cookie_consent_v1';

@Injectable({
  providedIn: 'root',
})
export class CookieConsentService {
  private readonly isBrowser: boolean;

  private readonly consentSubject = new BehaviorSubject<CookieConsentState | null>(null);
  readonly consent$ = this.consentSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      this.consentSubject.next(this.readFromStorage());
    }
  }

  get snapshot(): CookieConsentState | null {
    return this.consentSubject.value;
  }

  get hasDecision(): boolean {
    return !!this.snapshot;
  }

  get marketingAllowed(): boolean {
    return !!this.snapshot?.marketing;
  }

  acceptAll(): void {
    this.setConsent({ marketing: true });
  }

  rejectNonEssential(): void {
    this.setConsent({ marketing: false });
  }

  setMarketingAllowed(marketing: boolean): void {
    this.setConsent({ marketing });
  }

  private setConsent(partial: { marketing: boolean }): void {
    if (!this.isBrowser) return;

    const next: CookieConsentState = {
      version: 1,
      necessary: true,
      marketing: partial.marketing,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures (private mode, blocked storage, etc.)
    }

    this.consentSubject.next(next);
  }

  private readFromStorage(): CookieConsentState | null {
    if (!this.isBrowser) return null;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<CookieConsentState>;
      if (parsed.version !== 1) return null;
      if (parsed.necessary !== true) return null;
      if (typeof parsed.marketing !== 'boolean') return null;

      return {
        version: 1,
        necessary: true,
        marketing: parsed.marketing,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      };
    } catch {
      return null;
    }
  }
}
