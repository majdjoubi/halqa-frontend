import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SideImageComponent } from '../../../../shared/shared-component/side-image/side-image.component';
import { FormValidationComponent } from '../../../../shared/shared-component/form-validation/form-validation.component';
import { FacadeAuthService } from '../../../../services/auth/facade-auth.service';
import { UploadFilesService } from '../../../../services/common/upload-files.service';
import { compressProfileImage } from '../../../../services/common/image-compression';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-student-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    SideImageComponent,
    FormValidationComponent,
  ],
  templateUrl: './student-register.component.html',
  styleUrl: './student-register.component.scss',
})
export class StudentRegisterComponent implements OnInit {
  currentStep: number = 1;
  step1Form!: FormGroup;
  step2Form!: FormGroup;
  errorMessage: string | null = null;
  isSubmitting: boolean = false;

  private returnUrl?: string;

  showPassword: boolean = false;
  showConfirmPassword: boolean = false;

  selectedFile: File | null = null;
  previewUrl: string | null = null;
  // UI state while uploading the selected file to the server
  uploadingFile: boolean = false;
  uploadError: string | null = null;

  ageOptions: number[] = [];
  yearOptions: number[] = [];

  constructor(
    private fb: FormBuilder,
    private _facadeAuth: FacadeAuthService,
    private _uploadService: UploadFilesService,
    private translate: TranslateService,
    private route: ActivatedRoute
  ) {
    this.generateAgeOptions();
    this.generateYearOptions();
  }

  private markEmailAlreadyRegistered(): void {
    const emailControl = this.step1Form?.get('email');
    if (!emailControl) return;
    const existing = emailControl.errors || {};
    emailControl.setErrors({ ...existing, emailTaken: true });
    emailControl.markAsTouched();
  }

  ngOnInit(): void {
    this.initializeForms();

    const qpReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Keep this validation simple and strict: only allow app-internal absolute paths
    if (qpReturnUrl && qpReturnUrl.trim().startsWith('/')) {
      this.returnUrl = qpReturnUrl.trim();
    }
  }

  initializeForms(): void {
    // Step 1 Form - Basic Information
    this.step1Form = this.fb.group(
      {
        firstName: ['', [Validators.required, Validators.minLength(2)]],
        lastName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
        phoneNumber: [''], // Optional
      },
      { validators: this.passwordMatchValidator }
    );

    // Step 2 Form - Additional Information
    this.step2Form = this.fb.group({
      profilePicture: [null],
    });
  }

  // Custom validator for password matching
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
      // Remove password mismatch error if passwords now match
      const errors = { ...confirmPassword.errors };
      delete errors['passwordMismatch'];
      confirmPassword.setErrors(Object.keys(errors).length ? errors : null);
    }

    return null;
  }

  generateAgeOptions(): void {
    for (let i = 8; i <= 80; i++) {
      this.ageOptions.push(i);
    }
  }

  generateYearOptions(): void {
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 80; i <= currentYear - 8; i++) {
      this.yearOptions.push(i);
    }
    this.yearOptions.reverse(); // Show newest years first
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  goToStep2(): void {
    if (this.step1Form.valid) {
      this.currentStep = 2;
      // Scroll to top when changing steps
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.markFormGroupTouched(this.step1Form);
      // Focus on first invalid field
      this.focusFirstInvalidField(this.step1Form);
    }
  }

  goToStep1(): void {
    this.currentStep = 1;
    // Scroll to top when changing steps
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.previewUrl = e.target.result;
      };
      reader.readAsDataURL(file);

      // Update form control
      this.step2Form.patchValue({
        profilePicture: file,
      });
    }
  }

  removeFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.previewUrl = null;
    this.step2Form.patchValue({
      profilePicture: null,
    });
  }

  onSubmit(): void {
    // Main submit handler: validate forms, upload selected file (if any),
    // then send registration payload including the returned image URL.
    if (this.step1Form.valid && this.step2Form.valid) {
      this.errorMessage = null;
      this.isSubmitting = true;

      // Helper to actually call registration after we have the image URL (or null)
      const callRegister = (imageUrl: string | null) => {
        const rawPhone = String(this.step1Form.value.phoneNumber ?? '').trim();
        const payload = {
          firstName: this.step1Form.value.firstName,
          lastName: this.step1Form.value.lastName,
          email: this.step1Form.value.email,
          password: this.step1Form.value.password,
          confirmPassword: this.step1Form.value.confirmPassword,
          role: 1, // Role 1 for students
          phoneNumber: rawPhone.length > 0 ? rawPhone : undefined,
          profilePictureUrl: imageUrl, // URL returned from upload endpoint or null
          timeZoneOffsetMinutes: this.getTimeZoneOffsetMinutes(), // Auto-detect timezone
        };

        this._facadeAuth.sendStudentRegisterRequest(payload, this.returnUrl).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            // Navigation is handled by facade service
          },
          error: (error) => {
            this.isSubmitting = false;
            this.handleRegistrationError(error);
          },
          complete: () => {
            this.isSubmitting = false;
          }
        });
      };

      // If user selected a file, upload it first
      if (this.selectedFile) {
        this.uploadingFile = true;
        this.uploadError = null;
        // Use category 'images' for profile pictures
        from(compressProfileImage(this.selectedFile))
          .pipe(switchMap((file) => this._uploadService.uploadFile(file, 'images')))
          .subscribe({
            next: (res) => {
              const imageUrl = res?.url || res?.path || this.previewUrl || null;
              this.uploadingFile = false;
              callRegister(imageUrl);
            },
            error: (err) => {
              this.uploadingFile = false;
              this.isSubmitting = false;
              this.uploadError =
                'Failed to upload profile picture. Please try again.';
              this.errorMessage = this.uploadError;
            },
          });
      } else {
        // No file selected, proceed with registration using null image
        callRegister(null);
      }
    } else {
      this.markFormGroupTouched(this.step1Form);
      this.markFormGroupTouched(this.step2Form);
      this.errorMessage = 'Please fill in all required fields correctly.';
    }
  }

  // Parse backend error and return user-friendly message
  private handleRegistrationError(error: any): void {
    const errorMsg = error.error?.message || error.error?.error || '';
    const errorMsgLower = errorMsg.toLowerCase();
    
    // Password-related errors
    if (errorMsgLower.includes('password')) {
      if (errorMsgLower.includes('uppercase') || errorMsgLower.includes('capital')) {
        this.errorMessage = 'Password must contain at least one uppercase letter (A-Z).';
      } else if (errorMsgLower.includes('number') || errorMsgLower.includes('digit')) {
        this.errorMessage = 'Password must contain at least one number (0-9).';
      } else if (errorMsgLower.includes('special')) {
        this.errorMessage = 'Password must contain at least one special character (!@#$%^&*).';
      } else if (errorMsgLower.includes('length') || errorMsgLower.includes('short')) {
        this.errorMessage = 'Password must be at least 8 characters long.';
      } else {
        this.errorMessage = 'Password does not meet requirements. Please check: 8+ characters, uppercase, number, and special character.';
      }
      // Go back to step 1 to show password error
      this.currentStep = 1;
      return;
    }
    
    // Email already registered
    if (
      errorMsgLower.includes('already registered') ||
      errorMsgLower.includes('email is already registered')
    ) {
      this.markEmailAlreadyRegistered();
      this.errorMessage = this.translate.instant(
        'student_register.email_already_registered'
      );
      this.currentStep = 1;
      return;
    }

    // Other email-related errors
    if (errorMsgLower.includes('email') || error.status === 409) {
      this.currentStep = 1;
      return;
    }
    
    // Validation errors
    if (error.status === 400) {
      if (error.error?.errors) {
        const errors = error.error.errors;
        const firstError = Object.values(errors)[0];
        this.errorMessage = Array.isArray(firstError) ? firstError[0] : String(firstError);
      } else {
        this.errorMessage = errorMsg || 'Invalid data provided. Please check all fields.';
      }
      return;
    }
    
    // Server errors
    if (error.status === 500) {
      this.errorMessage = 'Server error occurred. Please try again later.';
      return;
    }
    
    // Network errors
    if (error.status === 0) {
      this.errorMessage = 'Network error. Please check your internet connection.';
      return;
    }
    
    // Default error
    this.errorMessage = errorMsg || 'Registration failed. Please try again.';
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

  // Method to check if form step is valid for UI feedback
  isStep1Valid(): boolean {
    return this.step1Form.valid;
  }

  isStep2Valid(): boolean {
    return this.step2Form.valid;
  }

  // Helper methods for password validation (kept for backward compatibility)
  hasUpperCase(password: string): boolean {
    return password ? /[A-Z]/.test(password) : false;
  }

  hasNumber(password: string): boolean {
    return password ? /\d/.test(password) : false;
  }

  hasSpaces(password: string): boolean {
    return password ? /\s/.test(password) : false;
  }

  // Get validation config for different field types
  getValidationConfig(fieldType: string): any {
    switch (fieldType) {
      case 'password':
        return {
          showRequirements: true,
          showSuccessMessage: false,
        };
      case 'confirmPassword':
        return {
          showSuccessMessage: true,
          successMessageKey: 'student_register.password_match',
        };
      case 'firstName':
        return {
          showSuccessMessage: true,
          successMessageKey: 'student_register.first_name_valid',
        };
      case 'lastName':
        return {
          showSuccessMessage: true,
          successMessageKey: 'student_register.last_name_valid',
        };
      case 'email':
        return {
          showSuccessMessage: true,
          successMessageKey: 'student_register.email_valid',
        };
      case 'level':
        return {
          showSuccessMessage: true,
          successMessageKey: 'student_register.level_selected',
        };
      default:
        return {
          showSuccessMessage: true,
          successMessageKey: 'validation.field_valid',
        };
    }
  }

  /**
   * Get user's timezone offset in minutes from UTC
   * Returns negative values for timezones behind UTC (e.g., -300 for UTC-5)
   * Returns positive values for timezones ahead of UTC (e.g., +180 for UTC+3)
   */
  private getTimeZoneOffsetMinutes(): number {
    // JavaScript's getTimezoneOffset returns the opposite sign
    // (positive for behind UTC, negative for ahead)
    // We invert it to match our convention
    return -new Date().getTimezoneOffset();
  }
}
