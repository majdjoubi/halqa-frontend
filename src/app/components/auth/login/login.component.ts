import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SideImageComponent } from '../../../shared/shared-component/side-image/side-image.component';
import { FormValidationComponent } from '../../../shared/shared-component/form-validation/form-validation.component';
import { RouterModule } from '@angular/router';
import { LoginRequest } from '../../../shared/modals/auth-modals';
import { FacadeAuthService } from '../../../services/auth/facade-auth.service';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterLink,
    SideImageComponent,
    FormValidationComponent,
    RouterModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private facadeAuthService: FacadeAuthService
  ) {}

  ngOnInit(): void {
    this.initializeForm();

    // Subscribe to loading state
    this.facadeAuthService.loginLoading$.subscribe((loading) => {
      this.isLoading = loading;
    });

    // Subscribe to error messages
    this.facadeAuthService.loginError$.subscribe((error) => {
      this.errorMessage = error || '';
    });
  }

  private initializeForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      rememberMe: [false],
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  isFieldValid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.valid && (field.dirty || field.touched));
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.errorMessage = ''; // Clear previous error messages
      const formData = this.loginForm.value as LoginRequest;

      console.log('Sending login request with data:', formData);

      this.facadeAuthService.sendLoginRequest(formData).subscribe({
        next: (response) => {
          console.log('Login successful:', response);
        },
        error: (error) => {
          console.error('Login failed:', error);
        },
      });
    } else {
      this.markFormGroupTouched();
      this.errorMessage = 'Please fill in all required fields correctly.';
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach((field) => {
      const control = this.loginForm.get(field);
      if (control) {
        control.markAsTouched({ onlySelf: true });
      }
    });
  }
}
