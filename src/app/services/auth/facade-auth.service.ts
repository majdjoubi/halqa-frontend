import { inject, Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, catchError, EMPTY, finalize, tap } from 'rxjs';
import { AuthLoginService } from './login/auth-login.service';
import { Router } from '@angular/router';
import {
  LoginRequest,
  StudentRegisterRequest,
} from '../../shared/modals/auth-modals';
import { ErrorHandlerService } from '../error-handler.service';

@Injectable({
  providedIn: 'root',
})
export class FacadeAuthService {
  // store and state for login
  private _loginLoading = new BehaviorSubject<boolean>(false);
  loginLoading$ = this._loginLoading.asObservable();

  private _loginError = new BehaviorSubject<string | null>(null);
  loginError$ = this._loginError.asObservable();

  public _loginResponse = new BehaviorSubject<any | null>(null);
  loginResponse$ = this._loginResponse.asObservable();

  private _userRole = new BehaviorSubject<number>(0);
  userRole$ = this._userRole.asObservable();

  // store and state for student  registration

  private _registerLoading = new BehaviorSubject<boolean>(false);
  registerLoading$ = this._registerLoading.asObservable();

  private _registerError = new BehaviorSubject<string | null>(null);
  registerError$ = this._registerError.asObservable();

  private _registerResponse = new BehaviorSubject<any | null>(null);
  registerResponse$ = this._registerResponse.asObservable();

  // Authentication state management
  private _isAuthenticated = new BehaviorSubject<boolean>(false);
  isAuthenticated$ = this._isAuthenticated.asObservable();

  _authLogin = inject(AuthLoginService);
  _errorHandler = inject(ErrorHandlerService);
  _token: string | null = null;
  _router = inject(Router);

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      this._token = localStorage.getItem('access_token') || null;
      this._isAuthenticated.next(!!this._token);

      // If token exists, try to extract user role from it
      if (this._token) {
        // First try to get role from localStorage
        const savedRole = localStorage.getItem('user_role');
        if (savedRole) {
          this._userRole.next(parseInt(savedRole, 10));
        } else {
          // Fallback to extracting from token
          this.extractUserDataFromToken(this._token);
        }
      }
    }
  }

  // login
  sendLoginRequest(data: LoginRequest, returnUrl?: string) {
    this._loginLoading.next(true);
    this._loginError.next(null); // Clear previous errors

    return this._authLogin.login(data).pipe(
      tap((res) => {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('access_token', res.token);
          localStorage.setItem('user_role', res.user.role.toString());
          this._token = res.token;
          this._isAuthenticated.next(true);
        }
        this._loginResponse.next(res);
        this._userRole.next(res.user.role);
        const safeReturnUrl = (returnUrl || '').trim();
        const shouldUseReturnUrl =
          !!safeReturnUrl &&
          safeReturnUrl.startsWith('/') &&
          // Only auto-redirect students to student-only routes like /all-teachers
          res?.user?.role === 1;

        if (shouldUseReturnUrl) {
          this._router.navigateByUrl(safeReturnUrl);
        } else {
          this._router.navigate(['/home']);
        }
      }),
      this._errorHandler.createErrorHandler({
        customErrorMessages: {
          401: 'Invalid email or password. Please check your credentials.',
          400: 'Please check your input and try again.',
          500: 'Server error. Please try again later.',
          0: 'Network error. Please check your internet connection.',
        },
        errorSubject: this._loginError,
        loadingSubject: this._loginLoading,
      }),
      finalize(() => this._loginLoading.next(false))
    );
  }

  // student registration
  sendStudentRegisterRequest(data: any) {
    this._registerLoading.next(true);
    this._registerError.next(null); // Clear previous errors

    return this._authLogin.studentRegister(data).pipe(
      tap((res) => {
        if (isPlatformBrowser(this.platformId)) {
          const userRole = 1;
          // Store access token when provided by the register response (mirrors login behavior)
          const _resAny = res as any;
          if (_resAny && (_resAny.token || _resAny.access_token)) {
            const token = _resAny.token ?? _resAny.access_token;
            localStorage.setItem('access_token', token);
            this._token = token;
            this._isAuthenticated.next(true);
          } else {
            // preserve original behavior: mark authenticated true even if token not present
            this._isAuthenticated.next(true);
          }

          localStorage.setItem('user_role', userRole.toString());
          localStorage.setItem('user_name', res.user?.firstName || '');
          localStorage.setItem(
            'user_avatar',
            res.user?.profilePictureUrl || ''
          );
        }
        // Emit both registerResponse and loginResponse to avoid breaking existing consumers
        this._registerResponse.next(res);
        this._loginResponse.next(res);
        // Use role from response if available, otherwise fallback to student role
        const userRole = res?.user?.role ?? 1;
        this._userRole.next(userRole);
        this._router.navigate(['/login']);
      }),
      this._errorHandler.createErrorHandler({
        customErrorMessages: {
          400: 'Invalid input. Please check your data and try again.',
          409: 'User already exists. Please use a different email.',
          422: 'Please fill in all required fields correctly.',
        },
        errorSubject: this._registerError,
        loadingSubject: this._registerLoading,
      }),
      finalize(() => this._registerLoading.next(false))
    );
  }

  sendTeacherRegisterRequest(data: any) {
    this._registerLoading.next(true);
    this._registerError.next(null); // Clear previous errors

    return this._authLogin.teacherRegister(data).pipe(
      tap((res) => {
        if (isPlatformBrowser(this.platformId)) {
          const userRole = 2;
          // Store access token when provided by the register response
          const _resAny = res as any;
          if (_resAny && (_resAny.token || _resAny.access_token)) {
            const token = _resAny.token ?? _resAny.access_token;
            localStorage.setItem('access_token', token);
            this._token = token;
            this._isAuthenticated.next(true);
          } else {
            this._isAuthenticated.next(true);
          }

          localStorage.setItem('user_role', userRole.toString());
          localStorage.setItem('user_name', res.user?.firstName || '');
          localStorage.setItem(
            'user_avatar',
            res.user?.profilePictureUrl || ''
          );
        }
        this._registerResponse.next(res);
        this._loginResponse.next(res);
        const userRole = res?.user?.role ?? 2;
        this._userRole.next(userRole);
        this._router.navigate(['/teacher-create-profile']);
      }),
      this._errorHandler.createErrorHandler({
        customErrorMessages: {
          400: 'Invalid input. Please check your data and try again.',
          409: 'User already exists. Please use a different email.',
          422: 'Please fill in all required fields correctly.',
        },
        errorSubject: this._registerError,
        loadingSubject: this._registerLoading,
      }),
      finalize(() => this._registerLoading.next(false))
    );
  }

  // logout method
  logout() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      localStorage.removeItem('user_avatar');
      this._token = null;
      this._isAuthenticated.next(false);
      this._userRole.next(0);
      this._router.navigate(['/']);
    }
  }

  // check if user is authenticated
  isAuthenticated(): boolean {
    return !!this._token;
  }

  // Update user role manually
  updateUserRole(role: number): void {
    this._userRole.next(role);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('user_role', role.toString());
    }
  }

  // Extract user data from JWT token
  private extractUserDataFromToken(token: string): void {
    try {
      // Decode JWT token (assuming it's a standard JWT)
      const payload = JSON.parse(atob(token.split('.')[1]));

      // Update user role if it exists in the token
      if (payload.role !== undefined) {
        this._userRole.next(payload.role);
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('user_role', payload.role.toString());
        }
      }
    } catch (error) {
      console.error('Error extracting user data from token:', error);
      // If token is invalid, clear authentication
      this.logout();
    }
  }
}
