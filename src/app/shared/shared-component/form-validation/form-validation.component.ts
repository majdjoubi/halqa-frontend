import { Component, Input, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AbstractControl } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService } from '../../../services/language.service';

export interface ValidationConfig {
  showRequirements?: boolean;
  showSuccessMessage?: boolean;
  successMessageKey?: string;
  customValidations?: CustomValidation[];
}

export interface CustomValidation {
  key: string;
  messageKey: string;
  checkFunction?: (value: any) => boolean;
}

@Component({
  selector: 'app-form-validation',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './form-validation.component.html',
  styleUrl: './form-validation.component.scss',
})
export class FormValidationComponent {
  @Input() control!: AbstractControl | null;
  @Input() fieldType: 'text' | 'email' | 'password' | 'select' | 'file' =
    'text';
  @Input() config: ValidationConfig = {};

  constructor(
    private languageService: LanguageService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  get isRTL(): boolean {
    return this.languageService.isRTL();
  }

  get isValid(): boolean {
    return !!(this.control?.valid && this.control?.touched);
  }

  get isInvalid(): boolean {
    return !!(this.control?.invalid && this.control?.touched);
  }

  get showValidation(): boolean {
    return !!this.control?.touched;
  }

  get errors(): any {
    return this.control?.errors || {};
  }

  get value(): any {
    return this.control?.value || '';
  }

  // Password validation methods
  hasMinLength(value: string, minLength: number = 8): boolean {
    return value ? value.length >= minLength : false;
  }

  hasMaxLength(value: string, maxLength: number = 20): boolean {
    return value ? value.length <= maxLength : true;
  }

  hasUpperCase(value: string): boolean {
    return value ? /[A-Z]/.test(value) : false;
  }

  hasLowerCase(value: string): boolean {
    return value ? /[a-z]/.test(value) : false;
  }

  hasNumber(value: string): boolean {
    return value ? /\d/.test(value) : false;
  }

  hasSpecialChar(value: string): boolean {
    return value ? /[!@#$%^&*(),.?":{}|<>]/.test(value) : false;
  }

  hasNoSpaces(value: string): boolean {
    return value ? !/\s/.test(value) : true;
  }

  // Email validation
  isValidEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return value ? emailRegex.test(value) : false;
  }

  // Custom validation checker
  checkCustomValidation(validation: CustomValidation): boolean {
    if (validation.checkFunction) {
      return validation.checkFunction(this.value);
    }
    return true;
  }

  // Get validation icon - with fallback to Unicode symbols
  getValidationIcon(isValid: boolean): string {
    // First try Font Awesome icons
    const fontAwesome = isValid ? 'fas fa-check' : 'fas fa-times';

    // Check if Font Awesome is loaded
    if (isPlatformBrowser(this.platformId)) {
      const testElement = document.createElement('i');
      testElement.className = 'fas fa-check';
      document.body.appendChild(testElement);
      const computedStyle = window.getComputedStyle(testElement);
      const isFontAwesome = computedStyle.fontFamily.includes('Font Awesome');
      document.body.removeChild(testElement);

      if (isFontAwesome) {
        return fontAwesome;
      }
    }

    // Fallback to Unicode symbols
    return isValid ? 'unicode-check' : 'unicode-times';
  }

  // Get validation class
  getValidationClass(isValid: boolean): string {
    if (!this.showValidation) return '';
    return isValid ? 'valid' : 'invalid';
  }
}
