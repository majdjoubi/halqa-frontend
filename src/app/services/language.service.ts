import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly STORAGE_KEY = 'selected-language';
  private readonly DEFAULT_LANGUAGE = 'ar';

  // Available languages
  public readonly languages: Language[] = [
    {
      code: 'ar',
      name: 'Arabic',
      nativeName: 'العربية',
      direction: 'rtl',
    },
    {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      direction: 'ltr',
    },
  ];

  private currentLanguageSubject = new BehaviorSubject<Language>(
    this.languages.find((lang) => lang.code === this.DEFAULT_LANGUAGE)!
  );

  constructor(
    private translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.initializeLanguage();
  }

  /**
   * Get current language as Observable
   */
  get currentLanguage$(): Observable<Language> {
    return this.currentLanguageSubject.asObservable();
  }

  /**
   * Get current language value
   */
  get currentLanguage(): Language {
    return this.currentLanguageSubject.value;
  }

  /**
   * Initialize language service
   */
  private initializeLanguage(): void {
    // Set available languages in translate service
    const languageCodes = this.languages.map((lang) => lang.code);
    this.translate.addLangs(languageCodes);

    // Set default language
    this.translate.setDefaultLang(this.DEFAULT_LANGUAGE);

    // Load saved language or detect browser language
    const savedLanguage = this.getSavedLanguage();
    const browserLanguage = this.getBrowserLanguage();
    const languageToUse =
      savedLanguage || browserLanguage || this.DEFAULT_LANGUAGE;

    this.setLanguage(languageToUse);
  }

  /**
   * Set current language
   */
  setLanguage(languageCode: string): void {
    const language = this.languages.find((lang) => lang.code === languageCode);

    if (!language) {
      console.warn(
        `Language '${languageCode}' not found. Using default language.`
      );
      languageCode = this.DEFAULT_LANGUAGE;
    }

    // Update translate service
    this.translate.use(languageCode);

    // Update document direction and language
    this.updateDocumentAttributes(
      language || this.getLanguage(this.DEFAULT_LANGUAGE)!
    );

    // Save to localStorage
    this.saveLanguage(languageCode);

    // Update current language subject
    this.currentLanguageSubject.next(
      language || this.getLanguage(this.DEFAULT_LANGUAGE)!
    );
  }

  /**
   * Get language by code
   */
  getLanguage(code: string): Language | undefined {
    return this.languages.find((lang) => lang.code === code);
  }

  /**
   * Toggle between available languages
   */
  toggleLanguage(): void {
    const currentCode = this.currentLanguage.code;
    const nextLanguage = this.languages.find(
      (lang) => lang.code !== currentCode
    );

    if (nextLanguage) {
      this.setLanguage(nextLanguage.code);
    }
  }

  /**
   * Check if current language is RTL
   */
  isRTL(): boolean {
    return this.currentLanguage.direction === 'rtl';
  }

  /**
   * Get translated text (returns Promise)
   */
  getTranslation(key: string, params?: any): Promise<string> {
    return new Promise((resolve) => {
      this.translate.get(key, params).subscribe(resolve);
    });
  }

  /**
   * Get translated text (returns Observable)
   */
  getTranslation$(key: string, params?: any): Observable<string> {
    return this.translate.get(key, params);
  }

  /**
   * Get instant translation (use carefully, make sure translations are loaded)
   */
  getInstantTranslation(key: string, params?: any): string {
    return this.translate.instant(key, params);
  }

  /**
   * Update document attributes
   */
  private updateDocumentAttributes(language: Language): void {
    if (isPlatformBrowser(this.platformId)) {
      const html = document.documentElement;

      // Set direction
      html.dir = language.direction;

      // Set language attribute
      html.lang = language.code;

      // Add CSS class for styling
      html.classList.remove('rtl', 'ltr');
      html.classList.add(language.direction);
    }
  }

  /**
   * Get saved language from localStorage
   */
  private getSavedLanguage(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      try {
        return localStorage.getItem(this.STORAGE_KEY);
      } catch (error) {
        console.warn('Could not access localStorage:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Save language to localStorage
   */
  private saveLanguage(languageCode: string): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(this.STORAGE_KEY, languageCode);
      } catch (error) {
        console.warn('Could not save to localStorage:', error);
      }
    }
  }

  /**
   * Get browser language
   */
  private getBrowserLanguage(): string | null {
    const browserLang = this.translate.getBrowserLang();

    if (
      browserLang &&
      this.languages.some((lang) => lang.code === browserLang)
    ) {
      return browserLang;
    }

    return null;
  }
}
