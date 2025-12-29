import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { LanguageService, Language } from './services/language.service';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { StripeService } from './services/stripe.service';
import { inject as injectAnalytics } from '@vercel/analytics';
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
    private stripeService: StripeService
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
