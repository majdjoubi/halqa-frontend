import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
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
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl || 'http://localhost:3000/api';

  constructor(
    private http: HttpClient,
    private storageService: StorageService
  ) {}

  /**
   * تسجيل الدخول
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    // TODO: استبدال هذا بـ HTTP request حقيقي
    // return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, credentials);

    // محاكاة API response للاختبار
    return new Observable((observer) => {
      setTimeout(() => {
        if (credentials.email && credentials.password) {
          const mockResponse: LoginResponse = {
            success: true,
            message: 'Login successful',
            data: {
              token: 'mock-jwt-token-12345',
              user: {
                id: 1,
                email: credentials.email,
                name: 'Test User',
              },
            },
          };

          // حفظ التوكن في local storage
          if (mockResponse.data?.token) {
            this.storageService.setItem('authToken', mockResponse.data.token);
            this.storageService.setItem(
              'userData',
              JSON.stringify(mockResponse.data.user)
            );
          }

          observer.next(mockResponse);
        } else {
          observer.error({
            success: false,
            message: 'Invalid email or password',
            error: 'INVALID_CREDENTIALS',
          });
        }
        observer.complete();
      }, 1500);
    });
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
   * إعادة تعيين كلمة المرور باستخدام token
   */
  setNewPassword(data: SetPasswordRequest): Observable<ApiResponse> {
    // TODO: استبدال هذا بـ HTTP request حقيقي
    // return this.http.post<ApiResponse>(`${this.apiUrl}/auth/set-password`, data);

    // محاكاة API response للاختبار
    return new Observable((observer) => {
      setTimeout(() => {
        if (data.token && data.password === data.confirmPassword) {
          observer.next({
            success: true,
            message: 'Password has been reset successfully',
            data: { message: 'Password updated' },
          });
        } else {
          observer.error({
            success: false,
            message: 'Invalid token or password mismatch',
            error: 'INVALID_TOKEN_OR_PASSWORD',
          });
        }
        observer.complete();
      }, 1500);
    });
  }

  /**
   * طلب إعادة تعيين كلمة المرور
   */
  requestPasswordReset(email: string): Observable<ApiResponse> {
    // TODO: استبدال هذا بـ HTTP request حقيقي
    // return this.http.post<ApiResponse>(`${this.apiUrl}/auth/forget-password`, { email });

    // محاكاة API response للاختبار
    return new Observable((observer) => {
      setTimeout(() => {
        observer.next({
          success: true,
          message: 'Password reset email has been sent',
          data: { email },
        });
        observer.complete();
      }, 1000);
    });
  }

  /**
   * التحقق من صحة token إعادة تعيين كلمة المرور
   */
  validateResetToken(token: string): Observable<ApiResponse> {
    // TODO: استبدال هذا بـ HTTP request حقيقي
    // return this.http.get<ApiResponse>(`${this.apiUrl}/auth/validate-reset-token/${token}`);

    // محاكاة API response للاختبار
    return new Observable((observer) => {
      setTimeout(() => {
        if (token && token.length > 10) {
          observer.next({
            success: true,
            message: 'Token is valid',
            data: { valid: true },
          });
        } else {
          observer.error({
            success: false,
            message: 'Invalid or expired token',
            error: 'INVALID_TOKEN',
          });
        }
        observer.complete();
      }, 500);
    });
  }
}
