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

@Injectable()
export class HttpInterceptorService implements HttpInterceptor {
  constructor(private storageService: StorageService, private router: Router) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Get token from storage - check both possible names
    let token = this.storageService.getItem('access_token');
    if (!token) {
      token = this.storageService.getItem('authToken');
    }

    console.log('Interceptor - Token found:', !!token);
    if (token) {
      console.log(
        'Interceptor - Token preview:',
        token.substring(0, 20) + '...'
      );
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
      console.log('Interceptor - Adding Authorization header');
    } else {
      console.warn(
        'Interceptor - No token found, proceeding without Authorization header'
      );
    }

    const modifiedReq = req.clone({ setHeaders: headers });

    return next.handle(modifiedReq).pipe(
      catchError((error: HttpErrorResponse) => {
        const url = req.url || '';
        const isMissingSchedulingAvailabilityV1 =
          error.status === 404 && url.includes('/v1/teacher/availability');

        // Some deployments/backends may not expose the scheduling V1 availability read endpoint.
        // The UI has a fallback path, so avoid flooding the console with expected 404s.
        if (!isMissingSchedulingAvailabilityV1) {
          console.error('HTTP Error:', error);
          console.error('Error body:', JSON.stringify(error.error, null, 2));
        }

        // Log detailed error information
        if (error.status === 401) {
          console.error(
            'Unauthorized access - Token might be invalid or expired'
          );
          // Clear invalid tokens and redirect to login
          this.storageService.removeItem('authToken');
          this.storageService.removeItem('access_token');
          this.storageService.removeItem('userData');
          console.log('Interceptor - Tokens cleared due to 401 error');
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
