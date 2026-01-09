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
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    TranslateModule,
    CommonModule,
    NavbarComponent,
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
