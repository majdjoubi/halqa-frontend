import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { StorageService } from '../services/storage.service';
import { Router } from '@angular/router';
import { environment } from '../environment/environment';

@Injectable()
export class HttpInterceptorService implements HttpInterceptor {
  constructor(private storageService: StorageService, private router: Router) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Get token from storage - check both possible names
    // Prefer authToken if present (some login flows only set this), otherwise fall back.
    // Also check legacy 'token' key used by some older services (e.g. SignalR).
    let token = this.storageService.getItem('authToken');
    if (!token) token = this.storageService.getItem('access_token');
    if (!token) token = this.storageService.getItem('token');

    const isAuthLoginRequest = req.url.includes('/api/auth/login');
    if (!environment.production) {
      console.log('Interceptor - Token found:', !!token);
    }

    // Decide headers based on request body type. If body is FormData, do not set
    // 'Content-Type' because the browser will add the proper 'multipart/form-data'
    // boundary header. For JSON requests, set Content-Type to application/json.
    const isFormData = req.body instanceof FormData;

    const headers: { [key: string]: string } = {
      Accept: 'application/json',
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    // Add Authorization header if token exists (works for both JSON and FormData)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      if (!environment.production) {
        console.log('Interceptor - Adding Authorization header');
      }
    } else {
      if (!environment.production) {
        console.warn(
          'Interceptor - No token found, proceeding without Authorization header'
        );
      }
    }

    const modifiedReq = req.clone({ setHeaders: headers });

    return next.handle(modifiedReq).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('HTTP Error:', error);
        console.error('Error body:', JSON.stringify(error.error, null, 2));

        // Log detailed error information
        if (error.status === 401) {
          console.error(
            'Unauthorized access - Token might be invalid or expired'
          );

          // Do not clear tokens for gift serverless endpoints; a 401 there could be a
          // role mismatch (e.g. teacher token) and clearing breaks retry/fallback UX.
          const isGiftRequest = req.url.includes('/api/gifts/');

          // Do not clear tokens for V2 endpoints; these may be public or may return 401
          // due to backend-side policy changes, and wiping tokens creates logout loops.
          const isV2Request = req.url.includes('/v2/');

          // Only clear tokens for protected-resource 401s.
          // A 401 on /api/auth/login usually means invalid credentials and should not wipe existing sessions.
          if (!isAuthLoginRequest && !isGiftRequest && !isV2Request) {
            this.storageService.removeItem('authToken');
            this.storageService.removeItem('access_token');
            this.storageService.removeItem('token');
            this.storageService.removeItem('userData');
            if (!environment.production) {
              console.log('Interceptor - Tokens cleared due to 401 error');
            }
          }
          // Uncomment the line below if you want automatic redirect to login
          // this.router.navigate(['/auth/login']);
        } else if (error.status === 400) {
          console.error('Bad Request - Check request format');
        } else if (error.status === 500) {
          console.error('Server Error - Contact support');
        }

        return throwError(() => error);
      })
    );
  }
}
