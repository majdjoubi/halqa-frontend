import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import {
  TranslateLoader,
  TranslateModule,
  TranslateService,
} from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { APP_INITIALIZER, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { lastValueFrom } from 'rxjs';
import { HttpInterceptorService } from './interceptors/http.interceptor';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';

// Factory function for TranslateHttpLoader
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

/**
 * Ensure translations are loaded before the app renders to avoid flashing keys.
 * - Uses localStorage when available to restore the selected language.
 * - Falls back to browser language or default language.
 */
export function appTranslateInitializerFactory(
  translate: TranslateService,
  platformId: Object
) {
  return () => {
    const DEFAULT = 'ar';
    const supported = ['ar', 'en', 'de', 'tr', 'fr'];

    translate.addLangs(supported);
    translate.setDefaultLang(DEFAULT);

    let lang = DEFAULT;

    if (isPlatformBrowser(platformId)) {
      try {
        const saved = localStorage.getItem('selected-language');
        if (saved && supported.includes(saved)) {
          lang = saved;
        } else {
          const browserLang = translate.getBrowserLang();
          if (browserLang && supported.includes(browserLang)) {
            lang = browserLang;
          }
        }
      } catch (e) {}
    }

    // translate.use returns an Observable - convert to Promise so APP_INITIALIZER waits
    return lastValueFrom(translate.use(lang));
  };
}
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpInterceptorService,
      multi: true,
    },
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: HttpLoaderFactory,
          deps: [HttpClient],
        },
        defaultLanguage: 'ar',
      })
    ),
    // Load translations before application bootstrap to prevent key flash
    {
      provide: APP_INITIALIZER,
      useFactory: appTranslateInitializerFactory,
      deps: [TranslateService, PLATFORM_ID],
      multi: true,
    },
  ],
};
