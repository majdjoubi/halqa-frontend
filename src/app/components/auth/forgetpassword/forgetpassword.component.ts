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

  constructor(private fb: FormBuilder) {
    this.forgetPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit() {
    if (this.forgetPasswordForm.valid) {
      const email = this.forgetPasswordForm.value.email;
      console.log('Password reset requested for email:', email);
      // Here you would typically call a service to handle the password reset
    } else {
      // Mark all fields as touched to show validation errors
      this.forgetPasswordForm.markAllAsTouched();
    }
  }

  get email() {
    return this.forgetPasswordForm.get('email');
  }
}
