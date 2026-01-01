import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ForgetImgComponent } from '../../../shared/shared-component/forget-img/forget-img.component';
import { TranslateModule } from '@ngx-translate/core';
import {
  AuthService,
  SetPasswordRequest,
} from '../../../services/auth/auth.service';

@Component({
  selector: 'app-set-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ForgetImgComponent,
    TranslateModule,
  ],
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.scss',
})
export class SetPasswordComponent implements OnInit {
  forgetPasswordForm!: FormGroup;
  step1Form!: FormGroup; // للتوافق مع HTML الموجودة

  showPassword: boolean = false;
  showConfirmPassword: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  // Token and email from URL parameters
  resetToken: string | null = null;
  email: string | null = null;
  tokenValidated: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    console.log('SetPasswordComponent initialized');
    this.initializeForm();
    this.getResetToken();
  }

  initializeForm(): void {
    console.log('Initializing form...');
    this.forgetPasswordForm = this.fb.group(
      {
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            this.passwordStrengthValidator,
          ],
        ],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );

    // إنشاء reference لـ step1Form للتوافق مع HTML
    this.step1Form = this.forgetPasswordForm;
    console.log('Form initialized successfully');
  }

  getResetToken(): void {
    // الحصول على token و email من URL parameters
    this.resetToken = this.route.snapshot.queryParamMap.get('token');
    this.email = this.route.snapshot.queryParamMap.get('email');

    if (!this.resetToken || !this.email) {
      console.warn('Missing reset token or email in URL');
      this.errorMessage = 'رابط غير صالح. يرجى طلب إعادة تعيين كلمة المرور مرة أخرى.';
      return;
    }

    // التحقق من صحة Token
    this.validateToken();
  }

  validateToken(): void {
    if (!this.resetToken) {
      this.errorMessage = 'رابط غير صالح.';
      return;
    }

    this.authService.validateResetToken(this.resetToken).subscribe({
      next: (response) => {
        if (response.valid) {
          this.tokenValidated = true;
          console.log('Token is valid');
        } else {
          this.errorMessage = response.message || 'رابط منتهي الصلاحية أو غير صالح.';
        }
      },
      error: (error) => {
        console.error('Invalid token:', error);
        this.errorMessage = error.message || 'رابط منتهي الصلاحية أو غير صالح.';
      },
    });
  }

  // Custom validator لقوة كلمة المرور
  passwordStrengthValidator(
    control: AbstractControl
  ): { [key: string]: any } | null {
    const password = control.value;

    if (!password) {
      return null;
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasNoSpaces = !/\s/.test(password);
    const hasValidLength = password.length >= 8 && password.length <= 20;

    const isValid = hasUpperCase && hasNumber && hasNoSpaces && hasValidLength;

    if (!isValid) {
      return { passwordStrength: true };
    }

    return null;
  }

  // Custom validator للتأكد من تطابق كلمات المرور
  passwordMatchValidator(
    control: AbstractControl
  ): { [key: string]: any } | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (
      password &&
      confirmPassword &&
      password.value !== confirmPassword.value
    ) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    } else if (
      password &&
      confirmPassword &&
      password.value === confirmPassword.value &&
      confirmPassword.hasError('passwordMismatch')
    ) {
      // إزالة خطأ عدم التطابق إذا أصبحت كلمات المرور متطابقة
      const errors = { ...confirmPassword.errors };
      delete errors['passwordMismatch'];
      confirmPassword.setErrors(Object.keys(errors).length ? errors : null);
    }

    return null;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // Helper methods لفحص متطلبات كلمة المرور
  hasUpperCase(password: string): boolean {
    return password ? /[A-Z]/.test(password) : false;
  }

  hasNumber(password: string): boolean {
    return password ? /\d/.test(password) : false;
  }

  hasSpaces(password: string): boolean {
    return password ? /\s/.test(password) : false;
  }

  onSubmit(): void {
    if (this.forgetPasswordForm.valid && this.tokenValidated && this.email && this.resetToken) {
      this.isLoading = true;
      this.errorMessage = '';

      const setPasswordData: SetPasswordRequest = {
        password: this.forgetPasswordForm.get('password')?.value,
        confirmPassword: this.forgetPasswordForm.get('confirmPassword')?.value,
        token: this.resetToken,
        email: this.email,
      };

      console.log('Setting new password...');

      this.authService.setNewPassword(setPasswordData).subscribe({
        next: (response) => {
          this.isLoading = false;
          console.log('Password updated successfully:', response);
          this.successMessage = 'تم تغيير كلمة المرور بنجاح!';

          // إعادة توجيه لصفحة تسجيل الدخول بعد 2 ثانية
          setTimeout(() => {
            this.router.navigate(['/login'], {
              queryParams: {
                message: 'password_reset_success',
              },
            });
          }, 2000);
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error updating password:', error);
          this.errorMessage = error.message || 'حدث خطأ أثناء تحديث كلمة المرور. حاول مرة أخرى.';
        },
      });
    } else if (!this.tokenValidated) {
      this.errorMessage = 'رابط غير صالح أو منتهي الصلاحية.';
    } else if (!this.email) {
      this.errorMessage = 'البريد الإلكتروني مفقود.';
    } else {
      this.markFormGroupTouched(this.forgetPasswordForm);
      this.focusFirstInvalidField(this.forgetPasswordForm);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  private focusFirstInvalidField(formGroup: FormGroup): void {
    const firstInvalidControl = Object.keys(formGroup.controls).find((key) => {
      const control = formGroup.get(key);
      return control?.invalid;
    });

    if (firstInvalidControl) {
      setTimeout(() => {
        const element = document.querySelector(
          `[formControlName="${firstInvalidControl}"]`
        ) as HTMLElement;
        if (element) {
          element.focus();
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  // Method للتحقق من صحة النموذج للواجهة
  isFormValid(): boolean {
    return this.forgetPasswordForm.valid;
  }
}
