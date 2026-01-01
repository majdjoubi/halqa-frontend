import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ForgetImgComponent } from '../../../shared/shared-component/forget-img/forget-img.component';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-forgetpassword',
  standalone: true,
  imports: [
    TranslateModule,
    ForgetImgComponent,
    ReactiveFormsModule,
    CommonModule,
  ],
  templateUrl: './forgetpassword.component.html',
  styleUrls: ['./forgetpassword.component.scss'],
})
export class ForgetpasswordComponent {
  forgetPasswordForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.forgetPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit() {
    if (this.forgetPasswordForm.valid) {
      const email = this.forgetPasswordForm.value.email;
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      this.authService.requestPasswordReset(email).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            this.successMessage = response.message;
            // Navigate to OTP verification page with email
            this.router.navigate(['/verify-otp'], {
              queryParams: { email: email }
            });
          } else {
            this.errorMessage = response.message;
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error.message || 'Failed to send reset code. Please try again.';
        }
      });
    } else {
      // Mark all fields as touched to show validation errors
      this.forgetPasswordForm.markAllAsTouched();
    }
  }

  get email() {
    return this.forgetPasswordForm.get('email');
  }
}
