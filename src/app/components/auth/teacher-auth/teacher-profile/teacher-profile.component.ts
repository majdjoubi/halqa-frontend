import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FormArray, AbstractControl, ValidationErrors } from '@angular/forms';

import { SideMenuComponent } from '../../../../shared/shared-component/side-menu/side-menu.component';
import { FormValidationComponent } from '../../../../shared/shared-component/form-validation/form-validation.component';
import { LessonCalendarComponent, LessonEvent } from '../../../../shared/shared-component/lesson-calendar/lesson-calendar.component';
import { FacadeProfilesService } from '../../../../services/profiles/facade-profiles.service';
import { UploadFilesService } from '../../../../services/common/upload-files.service';
import { compressProfileImage } from '../../../../services/common/image-compression';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { FacadeAuthService } from '../../../../services/auth/facade-auth.service';
import { DateLocaleService } from '../../../../services/common/date-locale.service';
import {
  CreateTeacherProfile,
  Availability,
  LanguageProficiency,
} from '../../../../shared/modals/auth-modals';
import { RepoService } from '../../../../Repositories/repo.service';

@Component({
  selector: 'app-teacher-profile',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SideMenuComponent,
    ReactiveFormsModule,
    FormsModule,
    FormValidationComponent,
    LessonCalendarComponent,
  ],
  templateUrl: './teacher-profile.component.html',
  styleUrls: ['./teacher-profile.component.scss'],
})
export class TeacherProfileComponent implements OnInit, OnDestroy {
  // Data
  UserData: any = null;

  // Teacher Specializations
  TeacherSpecializations: any = [];

  // Teacher Languages from API
  teacherLanguagesData: LanguageProficiency[] = [];

  // UI State
  menuOpen = false;
  withdrawMenuOpen = false;
  certificationMenuOpen = false;
  isSubmitting = false;

  // Response Modal State
  showResponseModal = false;
  responseModalData: {
    type: 'success' | 'error';
    title: string;
    message: string;
    details?: any;
  } | null = null;
  private modalAutoCloseTimer: any = null;

  // Withdrawal Requests
  withdrawalRequests: any[] = [];
  showWithdrawalHistory = false;

  // Form
  profileForm!: FormGroup;
  withdrawForm!: FormGroup;
  certificationForm!: FormGroup;

  // Selected certification for editing
  selectedCertification: any = null;

  // Availability
  // Each slot: { day: number|null, fromTime: string, toTime: string }
  // Days of the week according to backend enum (0 = Sunday → 6 = Saturday)
  days: string[] = [
    'teacher_create_profile.sunday', // 0
    'teacher_create_profile.monday', // 1
    'teacher_create_profile.tuesday', // 2
    'teacher_create_profile.wednesday', // 3
    'teacher_create_profile.thursday', // 4
    'teacher_create_profile.friday', // 5
    'teacher_create_profile.saturday', // 6
  ];

  // Specializations
  selectedSpecializations: string[] = [];

  // Available Specializations (reuse same structure/keys as create-profile)
  availableSpecializations = [
    {
      value: 'quran-memorization',
      label: 'teacher_create_profile.specialization_quran_memorization',
      description:
        'teacher_create_profile.specialization_quran_memorization_desc',
      icon: 'fas fa-book-quran',
    },
    {
      value: 'tajweed',
      label: 'teacher_create_profile.specialization_tajweed',
      description: 'teacher_create_profile.specialization_tajweed_desc',
      icon: 'fas fa-volume-up',
    },
    {
      value: 'qiraat-seven',
      label: 'teacher_create_profile.specialization_qiraat_seven',
      description: 'teacher_create_profile.specialization_qiraat_seven_desc',
      icon: 'fas fa-scroll',
    },
    {
      value: 'qiraat-ten',
      label: 'teacher_create_profile.specialization_qiraat_ten',
      description: 'teacher_create_profile.specialization_qiraat_ten_desc',
      icon: 'fas fa-list-ol',
    },
    {
      value: 'tafseer',
      label: 'teacher_create_profile.specialization_tafseer',
      description: 'teacher_create_profile.specialization_tafseer_desc',
      icon: 'fas fa-lightbulb',
    },
    {
      value: 'hadith-explanation',
      label: 'teacher_create_profile.specialization_hadith_explanation',
      description:
        'teacher_create_profile.specialization_hadith_explanation_desc',
      icon: 'fas fa-quote-right',
    },
  ];

  // File upload
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  uploadingFile: boolean = false;
  uploadError: string | null = null;

  // Availability change tracking
  // Map of original availability keyed by id for change detection
  private originalAvailabilityMap: { [id: number]: any } = {};
  // IDs removed by the user (to be deleted on submit)
  deletedAvailabilityIds: number[] = [];

  // Flag to prevent repopulating form while editing
  private isEditingForm = false;
  // Flag to track if initial data load completed
  private initialDataLoaded = false;

  // ===== NEW CALENDAR-BASED AVAILABILITY =====
  // Calendar events for availability display
  availabilityCalendarEvents: LessonEvent[] = [];
  isLoadingAvailability = false;

  // Add Availability Modal
  showAddAvailabilityModal = false;
  newAvailabilityForm!: FormGroup;
  isSavingAvailability = false;
  minDate: string = new Date().toISOString().split('T')[0];

  // Weekly Pattern Modal
  showWeeklyPatternModal = false;
  isSavingPattern = false;
  weekDays = [
    { key: 'sunday', label: 'teacher_profile.weekly_pattern.sunday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'monday', label: 'teacher_profile.weekly_pattern.monday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'tuesday', label: 'teacher_profile.weekly_pattern.tuesday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'wednesday', label: 'teacher_profile.weekly_pattern.wednesday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'thursday', label: 'teacher_profile.weekly_pattern.thursday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'friday', label: 'teacher_profile.weekly_pattern.friday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'saturday', label: 'teacher_profile.weekly_pattern.saturday', enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
  ];

  // Booking Details Modal
  showBookingDetailsModal = false;
  selectedBookingDetails: any = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private facadeProfilesService: FacadeProfilesService,
    private _uploadService: UploadFilesService,
    private _repo: RepoService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    // Fetch teacher profile data
    this.facadeProfilesService.getTeacherProfile().subscribe();
    this.getTeacherProfileData();
    // Fetch teacher specializations if needed
    this.getLanguageName();
    // Fetch withdrawal requests
    this.loadWithdrawalRequests();
  }

  ngOnDestroy(): void {
    // Clean up timer on component destroy
    if (this.modalAutoCloseTimer) {
      clearTimeout(this.modalAutoCloseTimer);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Enhanced form initialization - REMOVED ALL VALIDATORS
  private initializeForm(): void {
    this.profileForm = this.fb.group({
      firstName: [''],
      lastName: [''],
      phoneNumber: [''],
      bio: [''],
      profilePictureUrl: [''],
      specializations: [this.selectedSpecializations],
      availability: this.fb.array([this.createAvailabilitySlot()]),
    });

    this.withdrawForm = this.fb.group({
      paymentMethod: ['paypal', [Validators.required]], // default to paypal
      paymentAccount: ['', [Validators.required, Validators.email]], // email for paypal by default
      amount: [
        '',
        [
          Validators.required,
          Validators.min(1),
          Validators.max(this.UserData?.profile?.walletBalance || 999999),
        ],
      ],
      notes: [''], // optional notes
    });

    this.certificationForm = this.fb.group({
      title: ['', Validators.required],
      issuingAuthority: ['', Validators.required],
      issueDate: ['', Validators.required],
      expiryDate: [''],
      description: ['', Validators.required],
    });

    // New Availability Form for modal
    this.newAvailabilityForm = this.fb.group({
      date: ['', Validators.required],
      fromTime: ['09:00', Validators.required],
      toTime: ['10:00', Validators.required],
      isRecurring: [false],
    });
  }

  // FormArray getter for availability
  get availability(): FormArray {
    return this.profileForm.get('availability') as FormArray;
  }

  // Create availability slot form group - REMOVED VALIDATORS
  private createAvailabilitySlot(data?: {
    id?: number;
    day?: number | null;
    fromTime?: string;
    toTime?: string;
  }): FormGroup {
    return this.fb.group({
      id: [data?.id ?? null],
      day: [data?.day ?? null],
      fromTime: [data?.fromTime ?? ''],
      toTime: [data?.toTime ?? ''],
    });
  }

  // Add new availability slot (limit to 7)
  addAvailability(): void {
    if (this.availability.length < 7) {
      this.availability.push(this.createAvailabilitySlot());
      this.availability.markAsTouched();
    }
  }

  // Remove availability slot (keep at least one)
  removeAvailability(index: number): void {
    if (this.availability.length > 1) {
      const control = this.availability.at(index);
      const id = control.get('id')?.value;
      if (id && id > 0) {
        this.deletedAvailabilityIds.push(id);
      }
      this.availability.removeAt(index);
      this.availability.markAsTouched();
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private convertLocalTimeToUTC(localTime: string): string {
    // Return time in HH:mm:ss format as expected by API
    return `${localTime}:00`;
  }

  // Removed validators - keeping methods for potential future use
  private timeRangeValidator = (
    control: AbstractControl
  ): ValidationErrors | null => {
    return null; // Always return null (no validation)
  };

  private maxSlotsPerDayValidator = (
    formArray: AbstractControl
  ): ValidationErrors | null => {
    return null; // Always return null (no validation)
  };

  openProfileEdit(): void {
    this.isEditingForm = true;
    this.menuOpen = true;
  }

  closeProfileEdit(): void {
    this.isEditingForm = false;
    this.menuOpen = false;
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById(
      'profilePicture'
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewUrl = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Enhanced submit method with better error handling and proper data formatting
  onSubmitProfile(): void {
    // Build payload using form values and fallback to existing UserData
    const formValue = this.profileForm.value;

    // Build availability array - only include slots that have complete data
    const availabilityData: Availability[] = [];

    if (this.availability.controls && this.availability.controls.length > 0) {
      this.availability.controls.forEach((ctrl) => {
        const v: any = ctrl.value;

        // Only add availability if all required fields are present
        if (
          v.day !== null &&
          v.day !== undefined &&
          v.day !== '' &&
          v.fromTime &&
          v.toTime
        ) {
          const start = v.fromTime
            ? this.convertLocalTimeToUTC(v.fromTime)
            : '08:00:00';
          const end = v.toTime
            ? this.convertLocalTimeToUTC(v.toTime)
            : '17:00:00';

          availabilityData.push({
            dayOfWeek: Number(v.day),
            startTime: start,
            endTime: end,
            isAvailable: true,
          });
        }
      });
    }

    // If no valid availability data, don't add default - let API handle it
    if (availabilityData.length === 0) {
      // availabilityData remains empty
    }

    const payload: CreateTeacherProfile = {
      firstName:
        formValue.firstName || this.UserData?.profile?.firstName || 'Teacher',
      lastName:
        formValue.lastName || this.UserData?.profile?.lastName || 'Name',
      phoneNumber:
        formValue.phoneNumber ||
        this.UserData?.profile?.phoneNumber ||
        '+1234567890',
      profilePictureUrl:
        this.previewUrl || this.UserData?.profile?.profilePictureUrl || '',
      specializations:
        this.selectedSpecializations?.length > 0
          ? this.selectedSpecializations
          : this.UserData?.profile?.specializations || ['quran-memorization'],
      yearsOfExperience:
        (this.UserData?.profile?.yearsOfExperience as number) || 1,
      hourlyRate: (this.UserData?.profile?.hourlyRate as number) || 10,
      bio:
        formValue.bio ||
        this.UserData?.profile?.bio ||
        'Experienced Quran teacher',
      acceptsDonations:
        this.UserData?.profile?.acceptsDonations !== undefined
          ? !!this.UserData.profile.acceptsDonations
          : true,
      availability: availabilityData,
    };

    // set submitting state
    this.isSubmitting = true;

    const doProfileUpdate = (profilePictureUrl: string | null) => {
      if (profilePictureUrl) {
        payload.profilePictureUrl = profilePictureUrl;
      }

      console.log('Profile Payload:', payload);

      // Call facade to update profile (PUT)
      this.facadeProfilesService.EditTeacherProfile(payload).subscribe({
        next: (res) => {
          console.log('Profile updated successfully:', res);
          this.handleUpdateSuccess(res);
        },
        error: (err: any) => {
          console.error('Profile update failed:', err);
          this.handleUpdateError(err);
        },
      });
    };

    // If a new file was selected, upload it first
    if (this.selectedFile) {
      this.uploadingFile = true;
      this.uploadError = null;
      from(compressProfileImage(this.selectedFile))
        .pipe(switchMap((file) => this._uploadService.uploadFile(file, 'images')))
        .subscribe({
          next: (res) => {
            this.uploadingFile = false;
            const imageUrl = res?.url || res?.path || this.previewUrl || '';
            doProfileUpdate(imageUrl);
          },
          error: (err) => {
            this.uploadingFile = false;
            this.uploadError =
              'Failed to upload profile picture. Please try again.';
            this.handleUpdateError(err);
          },
        });
    } else {
      // No file selected: use existing preview or existing value from UserData
      const existingUrl =
        this.previewUrl || this.UserData?.profile?.profilePictureUrl || '';
      doProfileUpdate(existingUrl);
    }
  }

  onGoToMeeting(lessonId?: string): void {
    console.log('TeacherProfile - Go to meeting', lessonId);
  }

  onCancelLesson(lessonId?: string): void {
    console.log('TeacherProfile - Cancel lesson', lessonId);
  }

  // Enhanced function to get teacher profile data
  getTeacherProfileData(): void {
    this.facadeProfilesService.getTeacherProfileData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data) {
          // Skip repopulating if user is actively editing the form
          if (this.isEditingForm) {
            // Only update UserData for display purposes, don't touch form
            this.UserData = data;
            return;
          }

          this.UserData = data;

          // Populate basic profile fields
          this.profileForm.patchValue({
            firstName: this.UserData?.profile?.firstName || '',
            lastName: this.UserData?.profile?.lastName || '',
            phoneNumber: this.UserData?.profile?.phoneNumber || '',
            bio: this.UserData?.profile?.bio || '',
            profilePictureUrl: this.UserData?.profile?.profilePictureUrl || '',
          });

          // Set profile picture preview if exists
          if (this.UserData?.profile?.profilePictureUrl) {
            this.previewUrl = this.UserData.profile.profilePictureUrl;
          }

          // Populate specializations - accept array of strings or objects
          if (Array.isArray(this.UserData?.profile?.specializations)) {
            const rawSpecs = this.UserData.profile.specializations as any[];

            // Build lookup for available specializations: exact value and space-form
            const spaceFormLookup = new Map<string, string>();
            this.availableSpecializations.forEach((s) => {
              const value = s.value; // e.g. 'quran-memorization'
              spaceFormLookup.set(value.toLowerCase(), value);
              spaceFormLookup.set(
                value.toLowerCase().replace(/-/g, ' '),
                value
              );
            });

            const normalizeString = (v: any) =>
              String(v || '')
                .toLowerCase()
                .trim();

            this.selectedSpecializations = rawSpecs
              .map((item) => {
                if (!item) return '';
                // support object entries (e.g. { value: 'tajweed' } or { name: 'Tajweed' })
                let str =
                  typeof item === 'string'
                    ? item
                    : item.value ||
                      item.name ||
                      item.specialization ||
                      String(item);

                const norm = normalizeString(str);

                // Direct match to known value or space-form
                if (spaceFormLookup.has(norm))
                  return spaceFormLookup.get(norm)!;

                // Try partial match: if normalized string contains a known key
                for (const [key, val] of spaceFormLookup.entries()) {
                  if (key && norm.includes(key)) return val;
                }

                // Fallback: keep original string (as received)
                return str;
              })
              .filter((v) => v);

            this.profileForm
              .get('specializations')
              ?.setValue(this.selectedSpecializations);
          } else {
            this.selectedSpecializations = [];
          }

          // Populate availability using the new method
          if (Array.isArray(this.UserData?.profile?.availability)) {
            this.populateAvailabilityFromAPI(
              this.UserData.profile.availability
            );
          } else {
            // No availability data - create default empty slot
            this.populateAvailabilityFromAPI([]);
          }

          // Load calendar events for the new calendar UI
          this.loadAvailabilityCalendarEvents();

          console.log('Teacher Profile Data loaded:', {
            profile: this.UserData,
            specializations: this.selectedSpecializations,
            availability: this.availability.value,
            originalAvailabilityMap: this.originalAvailabilityMap,
          });
        }
      });
  }

  // Enhanced availability data population
  private populateAvailabilityFromAPI(availabilityData: any[]): void {
    // Clear existing availability slots
    while (this.availability.length) {
      this.availability.removeAt(0);
    }

    // Reset tracking variables
    this.originalAvailabilityMap = {};
    this.deletedAvailabilityIds = [];

    if (!availabilityData || availabilityData.length === 0) {
      // Add default empty slot if no data
      this.availability.push(this.createAvailabilitySlot());
      return;
    }

    // Populate with API data
    availabilityData.forEach((slot: any) => {
      // Store original for change detection
      if (slot.id != null) {
        this.originalAvailabilityMap[slot.id] = { ...slot };
      }

      // Convert backend time format (HH:MM:SS or HH:MM) to HH:MM for HTML time input
      const fromTime = slot.startTime
        ? this.formatTimeForInput(slot.startTime)
        : '';
      const toTime = slot.endTime ? this.formatTimeForInput(slot.endTime) : '';

      this.availability.push(
        this.createAvailabilitySlot({
          id: slot.id,
          day: slot.dayOfWeek,
          fromTime: fromTime,
          toTime: toTime,
        })
      );
    });

    // Mark as pristine after population
    this.availability.markAsPristine();
  }

  // Helper method to format time from API
  private formatTimeForInput(timeString: string): string {
    if (!timeString) return '';

    // Handle both HH:MM:SS and HH:MM formats
    const timeParts = timeString.split(':');
    if (timeParts.length >= 2) {
      return `${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(
        2,
        '0'
      )}`;
    }

    return timeString;
  }

  // Helper methods for form validation - REMOVED validation logic
  private markFormGroupTouched(formGroup: FormGroup | FormArray): void {
    // Keep method for compatibility but don't mark as touched to avoid validation errors
    return;
  }

  private getFormValidationErrors(): any {
    return {}; // Always return empty errors
  }

  // Success and error handlers
  private handleUpdateSuccess(response: any): void {
    console.log('Profile updated successfully:', response);
    this.isSubmitting = false;
    this.isEditingForm = false; // Allow data repopulation after successful save
    this.menuOpen = false;

    // Reset change tracking
    this.deletedAvailabilityIds = [];
    this.selectedFile = null;

    // Mark form as pristine
    this.profileForm.markAsPristine();

    // Refresh profile data AND languages
    this.facadeProfilesService.getTeacherProfile().subscribe();

    // Refresh languages data after update
    console.log('🔄 Refreshing languages after profile update...');
    this.getLanguageName();
  }

  private handleUpdateError(error: any): void {
    console.error('Profile update failed:', error);
    this.isSubmitting = false;
    // Keep isEditingForm true so user can continue editing

    // Handle specific error cases here
    // Show error messages to user
  }

  // Specialization selection methods
  toggleSpecialization(specializationValue: string): void {
    const index = this.selectedSpecializations.indexOf(specializationValue);

    if (index > -1) {
      this.selectedSpecializations.splice(index, 1);
    } else {
      this.selectedSpecializations.push(specializationValue);
    }

    this.profileForm
      .get('specializations')
      ?.setValue(this.selectedSpecializations);
    this.profileForm.get('specializations')?.markAsTouched();
  }

  isSpecializationSelected(specializationValue: string): boolean {
    return this.selectedSpecializations.includes(specializationValue);
  }

  getLanguageName() {
    console.log('🔍 Fetching teacher languages from API...');
    this._repo
      .getTeacherLanguages()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: LanguageProficiency[]) => {
          console.log('✅ Teacher Languages Data received:', data);
          console.log('📊 Number of languages:', data?.length || 0);
          this.teacherLanguagesData = data || [];

          if (data && data.length > 0) {
            console.log('🎉 Languages loaded successfully!');
            data.forEach((lang, index) => {
              console.log(
                `  ${index + 1}. ${lang.language} - ${
                  lang.proficiencyLevel || 'N/A'
                }`
              );
            });
          } else {
            console.warn('⚠️ No languages found for this teacher');
          }
        },
        error: (err) => {
          console.error('❌ Error fetching teacher languages:', err);
          console.error('Error details:', err?.error || err?.message || err);
          this.teacherLanguagesData = [];
        },
      });
  }

  // Get current payment method
  get selectedPaymentMethod(): string {
    return this.withdrawForm.get('paymentMethod')?.value || 'paypal';
  }

  // Called when payment method changes
  onPaymentMethodChange(): void {
    // Clear the payment account field when method changes
    this.withdrawForm.patchValue({ paymentAccount: '' });

    // Update validators based on payment method
    const paymentAccountControl = this.withdrawForm.get('paymentAccount');
    if (this.selectedPaymentMethod === 'paypal') {
      paymentAccountControl?.setValidators([
        Validators.required,
        Validators.email,
      ]);
    } else {
      paymentAccountControl?.setValidators([Validators.required]);
    }
    paymentAccountControl?.updateValueAndValidity();
  }

  SendWithdrawRequest() {
    this.openWithdrawModal();
    const data = {
      amount: parseFloat(this.withdrawForm.value.amount),
      paymentMethod: this.withdrawForm.value.paymentMethod,
      paymentAccount: this.withdrawForm.value.paymentAccount,
      notes:
        this.withdrawForm.value.notes ||
        'Withdraw request from teacher profile',
    };
    this._repo.makeWithdrawRequest(data).subscribe({
      next: (response) => {
        console.log('Withdraw response:', response);
        this.closeWithdrawModal();
      },
      error: (error) => {
        console.error('Withdraw error:', error);
      },
    });
  }

  openWithdrawModal(): void {
    this.withdrawMenuOpen = true;
  }

  closeWithdrawModal(): void {
    this.withdrawMenuOpen = false;
    this.withdrawForm.reset({ paymentMethod: 'paypal' }); // reset with default value
  }

  onSubmitWithdraw(): void {
    if (this.withdrawForm.valid) {
      const { amount, paymentMethod, paymentAccount, notes } =
        this.withdrawForm.value;

      const data = {
        amount: parseFloat(amount),
        paymentMethod,
        paymentAccount,
        notes: notes || 'Urgent withdrawal request',
      };

      this.isSubmitting = true;

      this._repo.makeWithdrawRequest(data).subscribe({
        next: (response) => {
          console.log('Withdraw response:', response);
          this.isSubmitting = false;
          this.closeWithdrawModal();

          // Show success modal
          this.showResponseModal = true;
          this.responseModalData = {
            type: 'success',
            title: 'Withdrawal Request Submitted!',
            message:
              response.message ||
              'Your withdrawal request has been submitted successfully and is now pending admin approval.',
            details: response,
          };

          // Auto-close success modal after 5 seconds
          this.modalAutoCloseTimer = setTimeout(() => {
            this.closeResponseModal();
          }, 5000);
        },
        error: (error) => {
          console.error('Withdraw error:', error);
          this.isSubmitting = false;

          // Show error modal
          this.showResponseModal = true;
          this.responseModalData = {
            type: 'error',
            title: 'Withdrawal Request Failed',
            message:
              error.error?.message ||
              error.message ||
              'An error occurred while submitting your withdrawal request. Please try again.',
            details: error,
          };
        },
      });
    }
  }

  closeResponseModal(): void {
    // Clear auto-close timer if exists
    if (this.modalAutoCloseTimer) {
      clearTimeout(this.modalAutoCloseTimer);
      this.modalAutoCloseTimer = null;
    }

    this.showResponseModal = false;
    this.responseModalData = null;
  }

  // Certification Modal Methods
  openCertificationModal(cert?: any): void {
    this.selectedCertification = cert;
    if (cert) {
      this.certificationForm.patchValue({
        title: cert.title || '',
        issuingAuthority: cert.issuingAuthority || '',
        issueDate: cert.issueDate
          ? new Date(cert.issueDate).toISOString().split('T')[0]
          : '',
        expiryDate: cert.expiryDate
          ? new Date(cert.expiryDate).toISOString().split('T')[0]
          : '',
        description: cert.description || '',
      });
    } else {
      this.certificationForm.reset();
    }
    this.certificationMenuOpen = true;
  }

  closeCertificationModal(): void {
    this.certificationMenuOpen = false;
    this.selectedCertification = null;
    this.certificationForm.reset();
  }

  onSubmitCertification(): void {
    if (this.certificationForm.invalid) return;

    const formValue = this.certificationForm.value;
    const payload = {
      title: formValue.title,
      issuingAuthority: formValue.issuingAuthority,
      issueDate: formValue.issueDate
        ? new Date(formValue.issueDate).toISOString()
        : null,
      expiryDate: formValue.expiryDate
        ? new Date(formValue.expiryDate).toISOString()
        : null,
      description: formValue.description,
    };

    this.isSubmitting = true;

    if (this.selectedCertification) {
      // Edit existing certification
      this._repo
        .editTeacherCertification(this.selectedCertification.id, payload)
        .subscribe({
          next: (res) => {
            this.isSubmitting = false;
            this.handleUpdateSuccess(res);
            this.closeCertificationModal();
            this.getTeacherProfileData(); // Refresh data
          },
          error: (err) => {
            this.isSubmitting = false;
            this.handleUpdateError(err);
          },
        });
    } else {
      // Add new certification
      this._repo.createTeacherCertifications(payload).subscribe({
        next: (res) => {
          this.isSubmitting = false;
          this.handleUpdateSuccess(res);
          this.closeCertificationModal();
          this.getTeacherProfileData(); // Refresh data
        },
        error: (err) => {
          this.isSubmitting = false;
          this.handleUpdateError(err);
        },
      });
    }
  }

  // Load withdrawal requests
  loadWithdrawalRequests(): void {
    this._repo.getTeacherWithdrawalRequests().subscribe({
      next: (requests) => {
        this.withdrawalRequests = requests || [];
        console.log('Withdrawal requests:', this.withdrawalRequests);
      },
      error: (error) => {
        console.error('Error loading withdrawal requests:', error);
      },
    });
  }

  // Toggle withdrawal history visibility
  toggleWithdrawalHistory(): void {
    this.showWithdrawalHistory = !this.showWithdrawalHistory;
  }

  // Cancel withdrawal request
  cancelWithdrawalRequest(requestId: number): void {
    if (confirm('Are you sure you want to cancel this withdrawal request?')) {
      this._repo.cancelWithdrawalRequest(requestId).subscribe({
        next: (response) => {
          console.log('Request cancelled:', response);

          // Show success modal
          this.showResponseModal = true;
          this.responseModalData = {
            type: 'success',
            title: 'Request Cancelled',
            message:
              response.message ||
              'Your withdrawal request has been cancelled successfully.',
            details: response,
          };

          // Reload requests
          this.loadWithdrawalRequests();

          // Auto-close success modal after 3 seconds
          this.modalAutoCloseTimer = setTimeout(() => {
            this.closeResponseModal();
          }, 3000);
        },
        error: (error) => {
          console.error('Cancel error:', error);

          // Show error modal
          this.showResponseModal = true;
          this.responseModalData = {
            type: 'error',
            title: 'Cancellation Failed',
            message:
              error.error?.message ||
              error.message ||
              'Failed to cancel withdrawal request. Please try again.',
            details: error,
          };
        },
      });
    }
  }

  // Get status class for styling
  getRequestStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'status-approved';
      case 'pending':
        return 'status-pending';
      case 'rejected':
        return 'status-rejected';
      default:
        return '';
    }
  }

  // Format date
  formatRequestDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Get pending requests count
  get pendingRequestsCount(): number {
    return this.withdrawalRequests.filter(
      (r) => r.status?.toLowerCase() === 'pending'
    ).length;
  }

  // ===== NEW CALENDAR-BASED AVAILABILITY METHODS =====

  // Load availability as calendar events
  loadAvailabilityCalendarEvents(): void {
    this.isLoadingAvailability = true;
    const availabilityData = this.UserData?.profile?.availability || [];
    
    this.availabilityCalendarEvents = availabilityData.map((slot: any, index: number) => {
      const isBooked = slot.studentId || slot.bookedBy;
      const dayOfWeek = slot.dayOfWeek ?? slot.day; // Support both field names
      
      // Create a date for this week's occurrence of the day
      const today = new Date();
      const currentDayOfWeek = today.getDay();
      const daysUntilSlot = (dayOfWeek - currentDayOfWeek + 7) % 7;
      const slotDate = new Date(today);
      slotDate.setDate(today.getDate() + daysUntilSlot);
      
      const dateStr = slotDate.toISOString().split('T')[0];
      const fromTime = slot.startTime || slot.fromTime || '09:00';
      const toTime = slot.endTime || slot.toTime || '10:00';
      
      return {
        id: slot.id?.toString() || `slot-${index}`,
        title: isBooked ? (slot.studentName || 'محجوز') : 'متاح',
        start: `${dateStr}T${fromTime}`,
        end: `${dateStr}T${toTime}`,
        type: 'individual' as const,
        status: isBooked ? 'booked' as const : 'available' as const,
        studentName: slot.studentName || undefined,
        teacherName: this.UserData?.firstName + ' ' + this.UserData?.lastName,
        price: slot.price || 0,
        description: slot.notes || '',
        // Store extra data for our use
        slotId: slot.id,
        dayOfWeek: dayOfWeek,
        fromTime: fromTime,
        toTime: toTime,
        isRecurring: slot.isRecurring || false,
        studentId: slot.studentId || null,
      } as any;
    });
    
    this.isLoadingAvailability = false;
  }

  // Calculate duration between two time strings
  calculateDuration(fromTime: string, toTime: string): number {
    if (!fromTime || !toTime) return 0;
    const [fromHour, fromMin] = fromTime.split(':').map(Number);
    const [toHour, toMin] = toTime.split(':').map(Number);
    return (toHour * 60 + toMin) - (fromHour * 60 + fromMin);
  }

  // Open Add Availability Modal
  openAddAvailabilityModal(): void {
    this.newAvailabilityForm.reset({
      date: '',
      fromTime: '09:00',
      toTime: '10:00',
      isRecurring: false,
    });
    this.showAddAvailabilityModal = true;
  }

  // Close Add Availability Modal
  closeAddAvailabilityModal(): void {
    this.showAddAvailabilityModal = false;
    this.newAvailabilityForm.reset();
  }

  // Save New Availability Slot
  saveNewAvailability(): void {
    if (this.newAvailabilityForm.invalid) return;
    
    this.isSavingAvailability = true;
    const formValue = this.newAvailabilityForm.value;
    
    // Convert date to day of week
    const selectedDate = new Date(formValue.date);
    const dayOfWeek = selectedDate.getDay();
    
    const newSlot = {
      day: dayOfWeek,
      fromTime: formValue.fromTime,
      toTime: formValue.toTime,
      isRecurring: formValue.isRecurring,
    };
    
    // Add to existing availability
    const currentAvailability = this.UserData?.profile?.availability || [];
    const updatedAvailability = [...currentAvailability, newSlot];
    
    // Call API to update availability
    const updateData = {
      availability: updatedAvailability,
    };
    
    this._repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: (response: any) => {
        this.isSavingAvailability = false;
        this.showAddAvailabilityModal = false;
        
        // Update local data
        if (this.UserData?.profile) {
          this.UserData.profile.availability = updatedAvailability;
        }
        this.loadAvailabilityCalendarEvents();
        
        // Show success message
        this.showResponseModal = true;
        this.responseModalData = {
          type: 'success',
          title: 'تم الحفظ',
          message: 'تم إضافة الموعد بنجاح',
        };
        this.modalAutoCloseTimer = setTimeout(() => {
          this.showResponseModal = false;
        }, 3000);
      },
      error: (error: any) => {
        this.isSavingAvailability = false;
        console.error('Error saving availability:', error);
        
        this.showResponseModal = true;
        this.responseModalData = {
          type: 'error',
          title: 'خطأ',
          message: 'فشل في حفظ الموعد. يرجى المحاولة مرة أخرى.',
        };
      },
    });
  }

  // Open Weekly Pattern Modal
  openWeeklyPatternModal(): void {
    // Reset to default state
    this.weekDays.forEach(day => {
      day.enabled = false;
      day.slots = [{ fromTime: '09:00', toTime: '10:00' }];
    });
    
    // Load existing pattern if available
    const existingAvailability = this.UserData?.profile?.availability || [];
    existingAvailability.forEach((slot: any) => {
      const dayIndex = slot.day;
      if (dayIndex >= 0 && dayIndex < 7) {
        this.weekDays[dayIndex].enabled = true;
        // Check if slot already exists
        const existingSlot = this.weekDays[dayIndex].slots.find(
          s => s.fromTime === slot.fromTime && s.toTime === slot.toTime
        );
        if (!existingSlot) {
          this.weekDays[dayIndex].slots.push({
            fromTime: slot.fromTime,
            toTime: slot.toTime,
          });
        }
      }
    });
    
    this.showWeeklyPatternModal = true;
  }

  // Close Weekly Pattern Modal
  closeWeeklyPatternModal(): void {
    this.showWeeklyPatternModal = false;
  }

  // Toggle day in weekly pattern
  onWeeklyDayToggle(dayIndex: number): void {
    this.weekDays[dayIndex].enabled = !this.weekDays[dayIndex].enabled;
    if (this.weekDays[dayIndex].enabled && this.weekDays[dayIndex].slots.length === 0) {
      this.weekDays[dayIndex].slots = [{ fromTime: '09:00', toTime: '10:00' }];
    }
  }

  // Add time slot to a day
  addWeeklySlot(dayIndex: number): void {
    if (this.weekDays[dayIndex].slots.length < 3) {
      this.weekDays[dayIndex].slots.push({ fromTime: '09:00', toTime: '10:00' });
    }
  }

  // Remove time slot from a day
  removeWeeklySlot(dayIndex: number, slotIndex: number): void {
    if (this.weekDays[dayIndex].slots.length > 1) {
      this.weekDays[dayIndex].slots.splice(slotIndex, 1);
    }
  }

  // Save Weekly Pattern
  saveWeeklyPattern(): void {
    this.isSavingPattern = true;
    
    // Build availability array from weekly pattern
    const newAvailability: any[] = [];
    
    this.weekDays.forEach((day, dayIndex) => {
      if (day.enabled) {
        day.slots.forEach(slot => {
          newAvailability.push({
            day: dayIndex,
            fromTime: slot.fromTime,
            toTime: slot.toTime,
            isRecurring: true,
          });
        });
      }
    });
    
    // Call API to update availability
    const updateData = {
      availability: newAvailability,
    };
    
    this._repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: (response: any) => {
        this.isSavingPattern = false;
        this.showWeeklyPatternModal = false;
        
        // Update local data
        if (this.UserData?.profile) {
          this.UserData.profile.availability = newAvailability;
        }
        this.loadAvailabilityCalendarEvents();
        
        // Show success message
        this.showResponseModal = true;
        this.responseModalData = {
          type: 'success',
          title: 'تم الحفظ',
          message: 'تم حفظ النمط الأسبوعي بنجاح',
        };
        this.modalAutoCloseTimer = setTimeout(() => {
          this.showResponseModal = false;
        }, 3000);
      },
      error: (error: any) => {
        this.isSavingPattern = false;
        console.error('Error saving weekly pattern:', error);
        
        this.showResponseModal = true;
        this.responseModalData = {
          type: 'error',
          title: 'خطأ',
          message: 'فشل في حفظ النمط الأسبوعي. يرجى المحاولة مرة أخرى.',
        };
      },
    });
  }

  // Handle calendar event click
  onAvailabilityEventClick(event: any): void {
    this.selectedBookingDetails = {
      id: event.slotId || event.id,
      status: event.status,
      date: event.start,
      time: `${event.fromTime || ''} - ${event.toTime || ''}`,
      studentName: event.studentName,
      studentId: event.studentId,
      lessonTitle: event.title,
      duration: this.calculateDuration(event.fromTime || '', event.toTime || ''),
      price: event.price,
      notes: event.description,
      isRecurring: event.isRecurring,
      day: event.dayOfWeek,
    };
    this.showBookingDetailsModal = true;
  }

  // Handle calendar date click
  onAvailabilityDateClick(dateInfo: any): void {
    this.newAvailabilityForm.patchValue({
      date: dateInfo.dateStr || dateInfo.date,
    });
    this.showAddAvailabilityModal = true;
  }

  // Close Booking Details Modal
  closeBookingDetailsModal(): void {
    this.showBookingDetailsModal = false;
    this.selectedBookingDetails = null;
  }

  // Join booked lesson (redirect to session)
  joinBookedLesson(): void {
    if (this.selectedBookingDetails?.id) {
      // TODO: Implement session joining logic
      console.log('Joining lesson:', this.selectedBookingDetails.id);
    }
    this.closeBookingDetailsModal();
  }

  // Delete availability slot
  deleteAvailabilitySlot(): void {
    if (!this.selectedBookingDetails?.id) return;
    
    const slotId = this.selectedBookingDetails.id;
    const currentAvailability = this.UserData?.profile?.availability || [];
    const updatedAvailability = currentAvailability.filter((slot: any) => slot.id !== slotId);
    
    // Also remove by matching day/time if id doesn't exist
    const finalAvailability = updatedAvailability.filter((slot: any) => {
      return !(
        slot.day === this.selectedBookingDetails.day &&
        slot.fromTime === this.selectedBookingDetails.time?.split(' - ')[0]
      );
    });
    
    const updateData = {
      availability: finalAvailability,
    };
    
    this._repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: (response: any) => {
        this.closeBookingDetailsModal();
        
        // Update local data
        if (this.UserData?.profile) {
          this.UserData.profile.availability = finalAvailability;
        }
        this.loadAvailabilityCalendarEvents();
        
        // Show success message
        this.showResponseModal = true;
        this.responseModalData = {
          type: 'success',
          title: 'تم الحذف',
          message: 'تم حذف الموعد بنجاح',
        };
        this.modalAutoCloseTimer = setTimeout(() => {
          this.showResponseModal = false;
        }, 3000);
      },
      error: (error: any) => {
        console.error('Error deleting slot:', error);
        
        this.showResponseModal = true;
        this.responseModalData = {
          type: 'error',
          title: 'خطأ',
          message: 'فشل في حذف الموعد. يرجى المحاولة مرة أخرى.',
        };
      },
    });
  }
}
