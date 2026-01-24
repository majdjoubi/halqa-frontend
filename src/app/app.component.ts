import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { LanguageService, Language } from './services/language.service';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { StripeService } from './services/stripe.service';
import { inject as injectAnalytics } from '@vercel/analytics';
import { TimezoneService } from './services/scheduling/timezone.service';
import { CookieConsentBannerComponent } from './components/cookie-consent-banner/cookie-consent-banner.component';
import { CookieConsentService } from './services/consent/cookie-consent.service';
import { GoogleAdsTagService } from './services/analytics/google-ads-tag.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    TranslateModule,
    CommonModule,
    NavbarComponent,
    CookieConsentBannerComponent,
    FooterComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'halqa';
  currentLanguage!: Language;
  availableLanguages: Language[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private languageService: LanguageService,
    private stripeService: StripeService,
    private timezoneService: TimezoneService,
    private cookieConsent: CookieConsentService,
    private googleAdsTag: GoogleAdsTagService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.availableLanguages = this.languageService.languages;
    injectAnalytics();
  }

  async ngOnInit() {
    // Subscribe to language changes
    this.languageService.currentLanguage$
      .pipe(takeUntil(this.destroy$))
      .subscribe((language) => {
        this.currentLanguage = language;
      });

    // Ensure backend timezone is up-to-date for any already-authenticated session.
    // This prevents slot times drifting (e.g., Asia/Riyadh fallback causing a -2h shift in Germany).
    if (isPlatformBrowser(this.platformId)) {
      const hasToken = !!localStorage.getItem('access_token') || !!localStorage.getItem('authToken');
      if (hasToken) {
        this.timezoneService.syncTimezoneToBackend().subscribe();
      }

      // Load Google Ads tag only after explicit marketing consent.
      this.cookieConsent.consent$
        .pipe(takeUntil(this.destroy$))
        .subscribe((consent) => {
          if (consent?.marketing) {
            void this.googleAdsTag.ensureLoaded();
          }
        });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchLanguage(languageCode: string) {
    this.languageService.setLanguage(languageCode);
  }

  isCurrentLanguage(languageCode: string): boolean {
    return this.currentLanguage?.code === languageCode;
  }

  get isRTL(): boolean {
    return this.languageService.isRTL();
  }
}
