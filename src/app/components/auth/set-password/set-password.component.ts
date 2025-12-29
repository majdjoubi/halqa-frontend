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

  // Token من URL parameters
  resetToken: string | null = null;
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
    // الحصول على token من URL parameters
    this.resetToken = this.route.snapshot.queryParamMap.get('token');

    if (!this.resetToken) {
      console.warn('No reset token found in URL');
      // للاختبار، سنسمح بالوصول للصفحة بدون token
      this.tokenValidated = true;
      return;
    }

    // التحقق من صحة Token
    this.validateToken();
  }

  validateToken(): void {
    if (!this.resetToken) {
      // للاختبار، سنسمح بالوصول للصفحة بدون token
      this.tokenValidated = true;
      return;
    }

    this.authService.validateResetToken(this.resetToken).subscribe({
      next: (response) => {
        this.tokenValidated = true;
        console.log('Token is valid');
      },
      error: (error) => {
        console.error('Invalid token:', error);
        // للاختبار، سنسمح بالوصول للصفحة حتى لو كان token غير صحيح
        this.tokenValidated = true;
        console.warn(
          'Token validation failed, but allowing access for testing'
        );
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
    if (this.forgetPasswordForm.valid && this.tokenValidated) {
      this.isLoading = true;

      const setPasswordData: SetPasswordRequest = {
        password: this.forgetPasswordForm.get('password')?.value,
        confirmPassword: this.forgetPasswordForm.get('confirmPassword')?.value,
        token: this.resetToken,
      };

      console.log('Setting new password...');

      this.authService.setNewPassword(setPasswordData).subscribe({
        next: (response) => {
          this.isLoading = false;
          console.log('Password updated successfully:', response);

          // إعادة توجيه لصفحة تسجيل الدخول مع رسالة نجاح
          this.router.navigate(['/auth/login'], {
            queryParams: {
              message: 'password_reset_success',
            },
          });
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error updating password:', error);

          // عرض رسالة خطأ للمستخدم
          // يمكنك إضافة toast notification أو alert هنا
          alert('حدث خطأ أثناء تحديث كلمة المرور. حاول مرة أخرى.');
        },
      });
    } else if (!this.tokenValidated) {
      alert('Token غير صحيح. حاول مرة أخرى.');
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
