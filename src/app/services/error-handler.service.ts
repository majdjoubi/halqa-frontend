import { Injectable } from '@angular/core';
import { Observable, throwError, EMPTY } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError } from 'rxjs/operators';

export interface ErrorConfig {
  showErrorMessage?: boolean;
  logError?: boolean;
  returnEmpty?: boolean;
  customErrorMessages?: { [key: number]: string };
  errorSubject?: any; // BehaviorSubject to emit error messages
  loadingSubject?: any; // BehaviorSubject to manage loading state
}

@Injectable({
  providedIn: 'root',
})
export class ErrorHandlerService {
  constructor() {}

  /**
   * Handle HTTP errors in a centralized way
   * @param error - The HTTP error response
   * @param config - Configuration for error handling
   * @returns Observable that emits error or EMPTY
   */
  handleError(error: any, config: ErrorConfig = {}): Observable<never> {
    const {
      showErrorMessage = true,
      logError = true,
      returnEmpty = true,
      customErrorMessages = {},
      errorSubject,
      loadingSubject,
    } = config;

    let errorMessage = this.getErrorMessage(error, customErrorMessages);

    if (logError) {
      console.error('Error occurred:', error);
    }

    // Emit error message to subject if provided
    if (errorSubject) {
      errorSubject.next(errorMessage);
    }

    // Set loading to false if subject provided
    if (loadingSubject) {
      loadingSubject.next(false);
    }

    if (returnEmpty) {
      return EMPTY;
    } else {
      return throwError(() => errorMessage);
    }
  }

  /**
   * Create a reusable error handler operator
   * @param config - Configuration for error handling
   * @returns RxJS operator function
   */
  createErrorHandler(config: ErrorConfig = {}) {
    return catchError((error: any) => this.handleError(error, config));
  }

  /**
   * Get user-friendly error message based on error status
   * @param error - The error object
   * @param customMessages - Custom error messages for specific status codes
   * @returns User-friendly error message
   */
  private getErrorMessage(
    error: any,
    customMessages: { [key: number]: string } = {}
  ): string {
    // If backend provides a message, allow specific known cases to override generic status messages.
    // This is especially important for login, where a correct password can still be blocked.
    const backendMsgRaw =
      error?.error && typeof error.error?.message === 'string'
        ? (error.error.message as string)
        : '';
    const backendMsg = backendMsgRaw.trim();
    const backendMsgLower = backendMsg.toLowerCase();

    if (backendMsgLower.includes('deactivat') || backendMsgLower.includes('inactive')) {
      return 'تم تعطيل الحساب. الرجاء التواصل مع الإدارة لإعادة تفعيله.';
    }

    // Check if there's a custom message for this status code
    if (error.status && customMessages[error.status]) {
      return customMessages[error.status];
    }

    // Default error messages based on status codes
    switch (error.status) {
      case 400:
        return 'Bad request. Please check your input and try again.';
      case 401:
        return 'Invalid credentials. Please check your email and password.';
      case 403:
        return "Access denied. You don't have permission to perform this action.";
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'Conflict. The resource already exists.';
      case 422:
        return 'Validation error. Please check your input.';
      case 429:
        return 'Too many requests. Please try again later.';
      case 500:
        return 'Internal server error. Please try again later.';
      case 502:
        return 'Bad gateway. Please try again later.';
      case 503:
        return 'Service unavailable. Please try again later.';
      case 504:
        return 'Gateway timeout. Please try again later.';
      case 0:
        return 'Network error. Please check your internet connection.';
      default:
        // Try to extract message from error response
        if (backendMsg) {
          return backendMsg;
        }
        if (error.message) {
          return error.message;
        }
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Get specific error message for authentication operations
   * @param error - The error object
   * @returns Authentication-specific error message
   */
  getAuthErrorMessage(error: any): string {
    const authErrorMessages = {
      400: 'Please check your input and try again.',
      401: 'Invalid email or password. Please check your credentials.',
      409: 'User already exists. Please use a different email.',
      422: 'Please fill in all required fields correctly.',
      429: 'Too many login attempts. Please try again later.',
    };

    return this.getErrorMessage(error, authErrorMessages);
  }

  /**
   * Get specific error message for registration operations
   * @param error - The error object
   * @returns Registration-specific error message
   */
  getRegistrationErrorMessage(error: any): string {
    const registrationErrorMessages = {
      400: 'Invalid input. Please check your data and try again.',
      409: 'User already exists. Please use a different email.',
      422: 'Please fill in all required fields correctly.',
      429: 'Too many registration attempts. Please try again later.',
    };

    return this.getErrorMessage(error, registrationErrorMessages);
  }
}
