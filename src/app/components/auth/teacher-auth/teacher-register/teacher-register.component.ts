import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
} from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';
import { SideImageComponent } from '../../../../shared/shared-component/side-image/side-image.component';
import { FormValidationComponent } from '../../../../shared/shared-component/form-validation/form-validation.component';
import { FacadeAuthService } from '../../../../services/auth/facade-auth.service';
import { UploadFilesService } from '../../../../services/common/upload-files.service';

@Component({
  selector: 'app-teacher-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    SideImageComponent,
    FormValidationComponent,
  ],
  templateUrl: './teacher-register.component.html',
  styleUrl: './teacher-register.component.scss',
})
export class TeacherRegisterComponent {
  currentStep: number = 1;
  step1Form!: FormGroup;
  step2Form!: FormGroup;
  errorMessage: string | null = null;
  isSubmitting: boolean = false;

  showPassword: boolean = false;
  showConfirmPassword: boolean = false;

  selectedFile: File | null = null;
  previewUrl: string | null = null;
  uploadingFile: boolean = false;
  uploadError: string | null = null;

  // Default avatar to use when user doesn't provide one
  defaultAvatar: string =
    'https://halqa-api.onrender.com/uploads/documents/20250927181822247-dd1a5cd8d8fd426d86e000010e6a9271-blank-avatar.webp';

  ageOptions: number[] = [];
  yearOptions: number[] = [];

  constructor(
    private fb: FormBuilder,
    private _facadeAuth: FacadeAuthService,
    private uploadService: UploadFilesService
  ) {
    this.generateAgeOptions();
    this.generateYearOptions();
  }

  ngOnInit(): void {
    this.initializeForms();
  }

  initializeForms(): void {
    // Step 1 Form - Basic Information
    this.step1Form = this.fb.group(
      {
        firstName: ['', [Validators.required, Validators.minLength(2)]],
        lastName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
          ],
        ],
        confirmPassword: ['', [Validators.required]],
        phoneNumber: ['', [Validators.required]], // Phone number without pattern validation
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

  // Custom validator to prevent specific special characters (- and .) and require at least one allowed special character
  noSpecialCharsValidator(
    control: AbstractControl
  ): { [key: string]: any } | null {
    if (!control.value) {
      return null;
    }

    const hasInvalidChars = /[-.]/.test(control.value);
    if (hasInvalidChars) {
      return { invalidSpecialChars: true };
    }

    // Check for at least one allowed special character
    // Allowed: !@#$%^&*()_+={}[]|:;"'<>?,/~`
    const hasAllowedSpecialChar = /[!@#$%^&*()_+={}[\]|:;"'<>?,/~`]/.test(
      control.value
    );
    if (!hasAllowedSpecialChar) {
      return { noSpecialChar: true };
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
    if (this.step1Form.valid && this.step2Form.valid) {
      this.errorMessage = null;
      this.isSubmitting = true;

      const callRegister = (imageUrl: string | null) => {
        const payload = {
          firstName: this.step1Form.value.firstName,
          lastName: this.step1Form.value.lastName,
          email: this.step1Form.value.email,
          password: this.step1Form.value.password,
          confirmPassword: this.step1Form.value.confirmPassword,
          role: 2, // Role 2 for teachers
          phoneNumber: this.step1Form.value.phoneNumber,
          // Use default avatar when no image URL provided
          profilePictureUrl: imageUrl || this.defaultAvatar,
        };

        this._facadeAuth.sendTeacherRegisterRequest(payload).subscribe({
          next: (response) => {
            console.log('Registration success:', response);
            this.isSubmitting = false;
            // Navigation is handled by facade service
          },
          error: (error) => {
            console.error('Registration error:', error);
            this.isSubmitting = false;
            this.handleRegistrationError(error);
          },
          complete: () => {
            console.log('Registration complete');
            this.isSubmitting = false;
          }
        });
      };

      if (this.selectedFile) {
        this.uploadingFile = true;
        this.uploadError = null;
        // Use category 'images' for profile pictures
        this.uploadService.uploadFile(this.selectedFile, 'images').subscribe({
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
    // Debug: log full error for troubleshooting
    console.log('Full error object:', JSON.stringify(error, null, 2));
    console.log('Error status:', error.status);
    console.log('Error body:', error.error);
    
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
    
    // Email-related errors
    if (errorMsgLower.includes('email') || error.status === 409) {
      this.errorMessage = 'This email is already registered. Please use a different email or login.';
      this.currentStep = 1;
      return;
    }
    
    // Validation errors
    if (error.status === 400) {
      if (error.error?.errors) {
        // Handle validation errors object
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

  hasInvalidSpecialChars(password: string): boolean {
    return password ? /[-.]/.test(password) : false;
  }

  hasAllowedSpecialChar(password: string): boolean {
    return password ? /[!@#$%^&*()_+={}[\]|:;"'<>?,/~`]/.test(password) : false;
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
}
