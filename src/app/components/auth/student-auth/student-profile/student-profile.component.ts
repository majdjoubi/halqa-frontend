import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  Subject,
  takeUntil,
  finalize,
  debounceTime,
  distinctUntilChanged,
} from 'rxjs';

import { FacadeProfilesService } from '../../../../services/profiles/facade-profiles.service';
import { UploadFilesService } from '../../../../services/common/upload-files.service';
import {
  UpdateStudentProfileResponse,
  UserProfileResponse,
} from '../../../../shared/modals/auth-modals';
import { SideMenuComponent } from '../../../../shared/shared-component/side-menu/side-menu.component';
import { FormValidationComponent } from '../../../../shared/shared-component/form-validation/form-validation.component';
import { StripeService } from '../../../../services/stripe.service';
import { RepoService } from '../../../../Repositories/repo.service';
import { FacadeAuthService } from '../../../../services/auth/facade-auth.service';

@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SideMenuComponent,
    ReactiveFormsModule,
    FormValidationComponent,
  ],
  templateUrl: './student-profile.component.html',
  styleUrls: ['./student-profile.component.scss'],
})
export class StudentProfileComponent implements OnInit, OnDestroy {
  // Data properties
  UserData: UserProfileResponse | null = null;
  updateStudentProfileData: UpdateStudentProfileResponse | null = null;

  // UI State
  menuOpen = false;
  isSubmitting = false;
  isLoading = true;

  // ===== Account actions (self-service) =====
  isDeactivatingAccount = false;
  isDeletingAccount = false;
  showDeleteAccountConfirm = false;
  accountActionError: string | null = null;

  // Form
  profileForm!: FormGroup;

  // File upload
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  uploadingFile: boolean = false;
  uploadError: string | null = null;

  // Subscription management
  private destroy$ = new Subject<void>();

  // Constants
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
  ];

  constructor(
    private _facadeProfile: FacadeProfilesService,
    private fb: FormBuilder,
    private _uploadService: UploadFilesService,
    private stripeService: StripeService,
    private _repo: RepoService,
    private _facadeAuth: FacadeAuthService,
    private router: Router
  ) {
    this.initializeForm();
  }

  // ===== Self-service account actions =====
  deactivateAccount(): void {
    if (this.isDeactivatingAccount || this.isDeletingAccount) return;

    this.accountActionError = null;
    this.isDeactivatingAccount = true;

    this._repo.deactivateCurrentAccount().subscribe({
      next: () => {
        this.isDeactivatingAccount = false;
        this._facadeAuth.logout();
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Error deactivating account:', err);
        this.isDeactivatingAccount = false;
        this.accountActionError = 'teacher_profile.account_action_failed';
      },
    });
  }

  openDeleteAccountConfirm(): void {
    this.accountActionError = null;
    this.showDeleteAccountConfirm = true;
  }

  cancelDeleteAccount(): void {
    if (this.isDeletingAccount) return;
    this.showDeleteAccountConfirm = false;
  }

  confirmDeleteAccount(): void {
    if (this.isDeletingAccount || this.isDeactivatingAccount) return;

    this.accountActionError = null;
    this.isDeletingAccount = true;

    this._repo.deleteCurrentAccount().subscribe({
      next: () => {
        this.isDeletingAccount = false;
        this._facadeAuth.logout();
        this.router.navigate(['/']);
      },
      error: (err) => {
        console.error('Error deleting account:', err);
        this.isDeletingAccount = false;
        this.accountActionError = 'teacher_profile.account_action_failed';
      },
    });
  }

  ngOnInit(): void {
    this.loadStudentProfile();
    this.subscribeToProfileData();
    this.setupFormValidation();
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize the reactive form
   */
  private initializeForm(): void {
    this.profileForm = this.fb.group({
      firstName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
          Validators.pattern(/^[a-zA-Z\u0600-\u06FF\s]+$/), // Allow Arabic and English names
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
          Validators.pattern(/^[a-zA-Z\u0600-\u06FF\s]+$/),
        ],
      ],
      phoneNumber: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[\+]?[0-9\-\(\)\s]+$/), // More flexible phone pattern
        ],
      ],
      profilePictureUrl: [''],
    });
  }

  /**
   * Load student profile data
   */
  private loadStudentProfile(): void {
    const token = localStorage.getItem('access_token');

    if (!token) {
      console.error('StudentProfileComponent - No access token found');
      this.isLoading = false;
      return;
    }

    console.log('StudentProfileComponent - Loading profile data...');

    this._facadeProfile
      .studentProgileRequst()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (response) => {
          console.log(
            'StudentProfileComponent - Profile loaded successfully:',
            response
          );
        },
        error: (error) => {
          console.error(
            'StudentProfileComponent - Failed to load profile:',
            error
          );
          this.handleError('Failed to load profile data');
        },
      });
  }

  /**
   * Subscribe to profile data changes
   */
  private subscribeToProfileData(): void {
    this._facadeProfile.studentProfileData$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          console.log('StudentProfileComponent - Profile data updated:', data);
          this.UserData = data;

          if (data?.profile) {
            this.updateFormWithProfileData(data.profile);
          }
        },
        error: (error) => {
          console.error(
            'StudentProfileComponent - Profile data subscription error:',
            error
          );
        },
      });
  }

  /**
   * Update form with profile data
   */
  private updateFormWithProfileData(profile: any): void {
    if (this.profileForm) {
      this.profileForm.patchValue({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        phoneNumber: profile.phoneNumber || '',
        profilePictureUrl: profile.profilePictureUrl || '',
      });

      // Set preview URL if profile picture exists
      if (profile.profilePictureUrl) {
        this.previewUrl = profile.profilePictureUrl;
      }
    }
  }

  /**
   * Open profile edit side menu
   */
  openProfileEdit(): void {
    this.menuOpen = true;
    this.resetFormState();
  }

  /**
   * Close profile edit side menu
   */
  closeProfileEdit(): void {
    this.menuOpen = false;
    this.resetFormState();
  }

  /**
   * Reset form state
   */
  private resetFormState(): void {
    if (this.UserData?.profile) {
      this.updateFormWithProfileData(this.UserData.profile);
    }

    this.selectedFile = null;
    this.isSubmitting = false;

    // Reset form validation state
    Object.keys(this.profileForm.controls).forEach((key) => {
      const control = this.profileForm.get(key);
      if (control) {
        control.markAsUntouched();
        control.markAsPristine();
      }
    });
  }

  /**
   * Handle file selection for profile picture
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    // Validate file
    const validation = this.validateFile(file);
    if (!validation.isValid) {
      this.handleError(validation.message || 'Invalid file selected');
      return;
    }

    this.selectedFile = file;
    this.generatePreviewUrl(file);

    // Update form control
    this.profileForm.patchValue({
      profilePictureUrl: file.name,
    });

    console.log('StudentProfileComponent - File selected:', {
      name: file.name,
      size: file.size,
      type: file.type,
    });
  }

  /**
   * Validate selected file
   */
  private validateFile(file: File): { isValid: boolean; message?: string } {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        isValid: false,
        message: 'File size must be less than 5MB',
      };
    }

    // Check file type
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      return {
        isValid: false,
        message: 'Please select a valid image file (JPEG, PNG, or GIF)',
      };
    }

    return { isValid: true };
  }

  /**
   * Generate preview URL for selected file
   */
  private generatePreviewUrl(file: File): void {
    const reader = new FileReader();

    reader.onload = (e) => {
      this.previewUrl = e.target?.result as string;
    };

    reader.onerror = () => {
      console.error('StudentProfileComponent - Error reading file');
      this.handleError('Error reading selected file');
    };

    reader.readAsDataURL(file);
  }

  /**
   * Trigger file input click
   */
  triggerFileInput(): void {
    const fileInput = document.getElementById(
      'profilePicture'
    ) as HTMLInputElement;

    if (fileInput) {
      fileInput.click();
    }
  }

  /**
   * Handle form submission
   */
  onSubmitProfile(): void {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    // Helper to call update with a prepared JSON payload (profilePictureUrl may be null)
    const callUpdate = (profilePictureUrl: string | null) => {
      const payload = this.prepareFormData();
      payload.profilePictureUrl = profilePictureUrl;

      console.log(
        'StudentProfileComponent - Submitting profile update:',
        payload
      );

      this._facadeProfile
        .updateStudentProfileRequst(payload)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => {
            this.isSubmitting = false;
          })
        )
        .subscribe({
          next: (response) => {
            console.log(
              'StudentProfileComponent - Profile updated successfully:',
              response
            );
            this.updateStudentProfileData = response;
            this.handleSuccess('Profile updated successfully');
            this.closeProfileEdit();

            // Refresh profile data
            this.loadStudentProfile();
          },
          error: (error) => {
            console.error(
              'StudentProfileComponent - Failed to update profile:',
              error
            );
            this.handleError('Failed to update profile. Please try again.');
          },
        });
    };

    // If user selected a new file, upload it first and then update with returned URL
    if (this.selectedFile) {
      // Validate file again just in case
      const validation = this.validateFile(this.selectedFile);
      if (!validation.isValid) {
        this.handleError(validation.message || 'Invalid file selected');
        this.isSubmitting = false;
        return;
      }

      this.uploadingFile = true;
      this.uploadError = null;

      // Use same category 'images' as for registration profile pictures
      this._uploadService
        .uploadFile(this.selectedFile, 'images')
        .pipe(finalize(() => (this.uploadingFile = false)))
        .subscribe({
          next: (res) => {
            const imageUrl = res?.url || res?.path || this.previewUrl || null;
            callUpdate(imageUrl);
          },
          error: (err) => {
            console.error('StudentProfileComponent - File upload error:', err);
            this.uploadError =
              'Failed to upload profile picture. Please try again.';
            this.handleError(this.uploadError);
            this.isSubmitting = false;
          },
        });
    } else {
      // No new file selected: keep existing profilePictureUrl (or null)
      const existingUrl = this.UserData?.profile?.profilePictureUrl || null;
      callUpdate(existingUrl);
    }
  }

  /**
   * Prepare form data for submission
   */
  private prepareFormData(): any {
    const formValue = this.profileForm.value;

    const payload = {
      firstName: formValue.firstName?.trim(),
      lastName: formValue.lastName?.trim(),
      phoneNumber: formValue.phoneNumber?.trim(),
    };

    // Add profile picture if selected

    // We return a JSON payload; if a file was selected, the upload step above
    // will provide the `profilePictureUrl` which we attach to this payload.
    return payload;
  }

  /**
   * Mark all form controls as touched to show validation errors
   */
  private markFormGroupTouched(): void {
    Object.keys(this.profileForm.controls).forEach((key) => {
      const control = this.profileForm.get(key);
      if (control) {
        control.markAsTouched();
      }
    });
  }

  /**
   * Handle success messages
   */
  private handleSuccess(message: string): void {
    console.log('StudentProfileComponent - Success:', message);
    // In a real app, you might show a toast notification or snackbar
    // this.toastr.success(message);
  }

  /**
   * Handle error messages
   */
  private handleError(message: string): void {
    console.error('StudentProfileComponent - Error:', message);
    // In a real app, you might show a toast notification or snackbar
    // this.toastr.error(message);
  }

  /**
   * Get user's full name
   */
  get userFullName(): string {
    if (!this.UserData?.profile) {
      return 'Loading...';
    }

    const { firstName, lastName } = this.UserData.profile;
    return `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown User';
  }

  /**
   * Get formatted wallet balance
   */
  get formattedWalletBalance(): string {
    const balance = this.UserData?.profile?.walletBalance;

    if (typeof balance === 'number') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(balance);
    }

    return '$0.00';
  }

  /**
   * Check if form has unsaved changes
   */
  get hasUnsavedChanges(): boolean {
    return this.profileForm.dirty && !this.isSubmitting;
  }

  /**
   * Get profile picture URL with fallback
   */
  get profilePictureUrl(): string {
    if (this.previewUrl) {
      return this.previewUrl;
    }

    return (
      this.UserData?.profile?.profilePictureUrl ||
      '../../../../../assets/images/student-Avatar.svg'
    );
  }

  /**
   * Handle lesson actions
   */
  onGoToMeeting(lessonId?: string): void {
    console.log('StudentProfileComponent - Going to meeting:', lessonId);
    // Implement meeting navigation logic
    // this.router.navigate(['/meeting', lessonId]);
  }

  onCancelLesson(lessonId?: string): void {
    console.log('StudentProfileComponent - Canceling lesson:', lessonId);
    // Implement lesson cancellation logic
    // Show confirmation dialog first
    // if (confirmed) {
    //   this._facadeProfile.cancelLesson(lessonId).subscribe(...);
    // }
  }

  /**
   * Refresh profile data
   */
  onRefreshProfile(): void {
    this.isLoading = true;
    this.loadStudentProfile();
  }

  /**
   * Handle form field changes for real-time validation feedback
   */
  private setupFormValidation(): void {
    // Real-time validation for firstName
    this.profileForm
      .get('firstName')
      ?.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => {
        if (value && value.trim().length > 0) {
          const control = this.profileForm.get('firstName');
          if (control?.errors?.['pattern']) {
            console.log('FirstName validation: Invalid characters detected');
          }
        }
      });

    // Real-time validation for lastName
    this.profileForm
      .get('lastName')
      ?.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => {
        if (value && value.trim().length > 0) {
          const control = this.profileForm.get('lastName');
          if (control?.errors?.['pattern']) {
            console.log('LastName validation: Invalid characters detected');
          }
        }
      });

    // Real-time validation for phoneNumber
    this.profileForm
      .get('phoneNumber')
      ?.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => {
        if (value && value.trim().length > 0) {
          const control = this.profileForm.get('phoneNumber');
          if (control?.errors?.['pattern']) {
            console.log('Phone validation: Invalid phone format');
          }
        }
      });
  }

  /**
   * Check if a stat card should be highlighted (for animations)
   */
  isStatHighlighted(statType: string): boolean {
    // Add logic for highlighting important stats
    switch (statType) {
      case 'upcoming':
        return (this.UserData?.stats?.upcomingLessons || 0) > 0;
      case 'total':
        return (this.UserData?.stats?.totalBookings || 0) > 100;
      default:
        return false;
    }
  }

  /**
   * Get stat card class based on value
   */
  getStatCardClass(statType: string, value: number): string {
    const baseClass = 'stat-card';

    switch (statType) {
      case 'total':
        return `${baseClass} stat-card-primary`;
      case 'completed':
        return `${baseClass} stat-card-success`;
      case 'upcoming':
        return `${baseClass} stat-card-warning`;
      case 'favorites':
        return `${baseClass} stat-card-info`;
      case 'reviews':
        return `${baseClass} stat-card-secondary`;
      default:
        return baseClass;
    }
  }

  /**
   * Format numbers for display
   */
  formatStatValue(value: number | undefined): string {
    if (typeof value !== 'number') {
      return '0';
    }

    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'k';
    }

    return value.toString();
  }

  /**
   * Handle keyboard navigation in the form
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.menuOpen) {
      this.closeProfileEdit();
    }
  }

  /**
   * Cleanup method
   */
  private cleanup(): void {
    // Reset file input
    const fileInput = document.getElementById(
      'profilePicture'
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }

    // Clear preview URL
    if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewUrl);
    }
  }

  /**
   * Navigate to wallet topup page
   */
  navigateToWalletTopup(): void {
    this.router.navigate(['/wallet/topup']);
  }

  // the pay is here
  data = {
    amount: 1,
    currency: 'usd',
  };

  onImageError(event: any): void {
    event.target.src = '/assets/images/blank-avatar.webp';
  }
}
