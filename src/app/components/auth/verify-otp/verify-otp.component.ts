import {
  Component,
  AfterViewInit,
  ViewChildren,
  QueryList,
  ElementRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ForgetImgComponent } from '../../../shared/shared-component/forget-img/forget-img.component';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [ForgetImgComponent, FormsModule, CommonModule, TranslateModule],
  templateUrl: './verify-otp.component.html',
  styleUrl: './verify-otp.component.scss',
})
export class VerifyOtpComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef>;

  otpValues: string[] = ['', '', '', '', '', ''];
  email: string = '';
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Timer properties
  countdown: number = 50;
  canResend: boolean = false;
  private timeoutId?: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Get email from query params
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      if (!this.email) {
        // Redirect to forgot password if no email
        this.router.navigate(['/forgot-password']);
      }
    });
  }

  ngOnDestroy() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  ngAfterViewInit() {
    // Auto focus on first input when component loads
    if (this.otpInputs && this.otpInputs.first) {
      this.otpInputs.first.nativeElement.focus();
    }

    // Start the countdown timer
    this.startCountdown();
  }

  startCountdown() {
    this.countdown = 50;
    this.canResend = false;

    // Simple countdown using setTimeout
    const countdownFunction = () => {
      if (this.countdown > 0) {
        this.countdown--;
        this.timeoutId = window.setTimeout(countdownFunction, 1000);
      } else {
        this.canResend = true;
      }
    };

    this.timeoutId = window.setTimeout(countdownFunction, 1000);
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  onResendCode() {
    if (this.canResend && this.email) {
      // Clear any existing timeout
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      this.isLoading = true;
      this.errorMessage = '';

      this.authService.requestPasswordReset(this.email).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            this.successMessage = 'تم إرسال رمز جديد إلى بريدك الإلكتروني';
            // Restart the countdown
            this.startCountdown();
            // Clear current OTP inputs
            this.clearOtpInputs();
            // Focus on first input again
            if (this.otpInputs && this.otpInputs.first) {
              this.otpInputs.first.nativeElement.focus();
            }
          } else {
            this.errorMessage = response.message;
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error.message || 'فشل إرسال الرمز. حاول مرة أخرى.';
        }
      });
    }
  }

  clearOtpInputs() {
    this.otpValues = ['', '', '', '', '', ''];
    this.otpInputs.forEach((input) => {
      input.nativeElement.value = '';
    });
  }

  verifyOtp() {
    const otpCode = this.getOtpValue();
    if (otpCode.length !== 6) {
      this.errorMessage = 'الرجاء إدخال رمز التحقق كاملاً';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.verifyOtp({ email: this.email, otpCode }).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          // Navigate to set password page with reset token
          this.router.navigate(['/set-password'], {
            queryParams: { 
              token: response.resetToken,
              email: this.email 
            }
          });
        } else {
          this.errorMessage = response.message;
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.message || 'رمز التحقق غير صحيح';
      }
    });
  }

  onOtpInput(event: any, index: number) {
    const value = event.target.value;

    // Allow only numbers
    if (!/^\d$/.test(value) && value !== '') {
      event.target.value = '';
      return;
    }

    this.otpValues[index] = value;

    // Move to next input if current input has value and not the last input
    if (value && index < 5) {
      const nextInput = this.otpInputs.toArray()[index + 1];
      if (nextInput) {
        nextInput.nativeElement.focus();
      }
    }

    // Auto-submit when all 6 digits are entered
    if (this.getOtpValue().length === 6) {
      this.verifyOtp();
    }
  }

  onOtpKeyDown(event: KeyboardEvent, index: number) {
    // Handle backspace
    if (event.key === 'Backspace') {
      const currentInput = event.target as HTMLInputElement;

      // If current input is empty and not the first input, move to previous input
      if (!currentInput.value && index > 0) {
        const prevInput = this.otpInputs.toArray()[index - 1];
        if (prevInput) {
          prevInput.nativeElement.focus();
          prevInput.nativeElement.value = '';
          this.otpValues[index - 1] = '';
        }
      } else if (currentInput.value) {
        // Clear current input
        currentInput.value = '';
        this.otpValues[index] = '';
      }
    }

    // Handle arrow keys for navigation
    if (event.key === 'ArrowLeft' && index > 0) {
      const prevInput = this.otpInputs.toArray()[index - 1];
      if (prevInput) {
        prevInput.nativeElement.focus();
      }
    }

    if (event.key === 'ArrowRight' && index < 5) {
      const nextInput = this.otpInputs.toArray()[index + 1];
      if (nextInput) {
        nextInput.nativeElement.focus();
      }
    }

    // Handle Enter key
    if (event.key === 'Enter') {
      this.verifyOtp();
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';

    // Extract only numbers from pasted data
    const numbers = pastedData.replace(/\D/g, '').slice(0, 6);

    // Fill inputs with pasted numbers
    for (let i = 0; i < 6; i++) {
      const input = this.otpInputs.toArray()[i];
      if (input && numbers[i]) {
        input.nativeElement.value = numbers[i];
        this.otpValues[i] = numbers[i];
      }
    }

    // Focus on the next empty input or last input
    const nextEmptyIndex = this.otpValues.findIndex((val) => !val);
    const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : 5;
    const targetInput = this.otpInputs.toArray()[focusIndex];
    if (targetInput) {
      targetInput.nativeElement.focus();
    }

    // Auto-submit if complete
    if (this.getOtpValue().length === 6) {
      this.verifyOtp();
    }
  }

  getOtpValue(): string {
    return this.otpValues.join('');
  }
}
