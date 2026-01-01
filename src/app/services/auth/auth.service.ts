import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environment/environment';
import { StorageService } from '../storage.service';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: any;
  };
}

export interface SetPasswordRequest {
  password: string;
  confirmPassword: string;
  token: string | null;
  email: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

// Password Reset DTOs
export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  resetToken?: string;
  otpExpiryMinutes?: number;
}

export interface VerifyOtpRequest {
  email: string;
  otpCode: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  resetToken?: string;
}

export interface ResetPasswordRequest {
  email: string;
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

export interface ValidateResetTokenResponse {
  valid: boolean;
  email?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private storageService: StorageService
  ) {}

  /**
   * تسجيل الدخول
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, credentials).pipe(
      map((response) => {
        // حفظ التوكن في local storage
        if (response?.token) {
          this.storageService.setItem('authToken', response.token);
          this.storageService.setItem('userData', JSON.stringify(response.user));
        }
        return {
          success: true,
          message: 'Login successful',
          data: {
            token: response.token,
            user: response.user,
          },
        };
      }),
      catchError((error) => {
        return throwError(() => ({
          success: false,
          message: error.error?.message || 'Invalid email or password',
          error: 'INVALID_CREDENTIALS',
        }));
      })
    );
  }

  /**
   * تسجيل الخروج
   */
  logout(): void {
    this.storageService.removeItem('authToken');
    this.storageService.removeItem('userData');
  }

  /**
   * التحقق من وجود المستخدم مسجل الدخول
   */
  isLoggedIn(): boolean {
    const token = this.storageService.getItem('authToken');
    return !!token;
  }

  /**
   * الحصول على التوكن
   */
  getToken(): string | null {
    return this.storageService.getItem('authToken');
  }

  /**
   * الحصول على بيانات المستخدم
   */
  getUserData(): any | null {
    const userData = this.storageService.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  }

  /**
   * طلب استعادة كلمة المرور - يرسل OTP للإيميل
   */
  requestPasswordReset(email: string): Observable<ForgotPasswordResponse> {
    return this.http
      .post<ForgotPasswordResponse>(`${this.apiUrl}/auth/forgot-password`, { email })
      .pipe(
        catchError((error) => {
          return throwError(() => ({
            success: false,
            message: error.error?.message || 'Failed to send reset code. Please try again.',
          }));
        })
      );
  }

  /**
   * التحقق من رمز OTP
   */
  verifyOtp(request: VerifyOtpRequest): Observable<VerifyOtpResponse> {
    return this.http.post<VerifyOtpResponse>(`${this.apiUrl}/auth/verify-otp`, request).pipe(
      catchError((error) => {
        return throwError(() => ({
          success: false,
          message: error.error?.message || 'Invalid verification code.',
        }));
      })
    );
  }

  /**
   * إعادة تعيين كلمة المرور بعد التحقق من OTP
   */
  resetPassword(request: ResetPasswordRequest): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.apiUrl}/auth/reset-password`, request).pipe(
      catchError((error) => {
        return throwError(() => ({
          success: false,
          message: error.error?.message || 'Failed to reset password. Please try again.',
        }));
      })
    );
  }

  /**
   * إعادة تعيين كلمة المرور باستخدام token (للتوافق مع الكود القديم)
   */
  setNewPassword(data: SetPasswordRequest): Observable<ApiResponse> {
    const request: ResetPasswordRequest = {
      email: data.email,
      resetToken: data.token || '',
      newPassword: data.password,
      confirmPassword: data.confirmPassword,
    };
    return this.resetPassword(request).pipe(
      map((response) => ({
        success: response.success,
        message: response.message,
        data: response,
      }))
    );
  }

  /**
   * التحقق من صحة token إعادة تعيين كلمة المرور
   */
  validateResetToken(token: string): Observable<ValidateResetTokenResponse> {
    return this.http
      .get<ValidateResetTokenResponse>(`${this.apiUrl}/auth/validate-reset-token`, {
        params: { token },
      })
      .pipe(
        catchError((error) => {
          return throwError(() => ({
            valid: false,
            message: error.error?.message || 'Invalid or expired token',
          }));
        })
      );
  }
}
