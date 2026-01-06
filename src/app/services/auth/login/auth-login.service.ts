import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RepoService } from '../../../Repositories/repo.service';
import {
  LoginRequest,
  StudentRegisterRequest,
} from '../../../shared/modals/auth-modals';
import { BehaviorSubject, catchError, map, Observable, throwError, switchMap, of } from 'rxjs';
import { TimezoneService } from '../../scheduling/timezone.service';

@Injectable({
  providedIn: 'root',
})
export class AuthLoginService {
  private loggedIn = new BehaviorSubject<boolean>(this.hasToken());
  loggedIn$ = this.loggedIn.asObservable();

  constructor(
    private _repo: RepoService,
    private timezoneService: TimezoneService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  private hasToken(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return !!localStorage.getItem('access_token');
    }
    return false;
  }

  // perform login
  login(data: LoginRequest) {
    // Auto-add timezone offset to login request
    const requestWithTimezone = {
      ...data,
      timeZoneOffsetMinutes: this.getTimeZoneOffsetMinutes()
    };
    return this._repo.login(requestWithTimezone).pipe(
      map((res) => {
        const token = res.token;
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('access_token', token);
        }
        this.loggedIn.next(true);
        return res;
      }),
      // After successful login, sync timezone to backend
      switchMap((res) => {
        return this.timezoneService.syncTimezoneToBackend().pipe(
          map(() => res) // Return original login response
        );
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get user's timezone offset in minutes from UTC
   */
  private getTimeZoneOffsetMinutes(): number {
    return -new Date().getTimezoneOffset();
  }

  // perform student  registration

  studentRegister(data: StudentRegisterRequest) {
    return this._repo.studentRegister(data).pipe(catchError(this.handleError));
  }

  // perform teacher registration

  teacherRegister(data: StudentRegisterRequest) {
    return this._repo.teacherRegister(data).pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    return throwError(() => error);
  }
}
