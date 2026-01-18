import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SideImageComponent } from '../../../../shared/shared-component/side-image/side-image.component';
import { FacadeProfilesService } from '../../../../services/profiles/facade-profiles.service';
import { UploadFilesService } from '../../../../services/common/upload-files.service';
import { RepoService } from '../../../../Repositories/repo.service';
import { CreateTeacherProfile } from '../../../../shared/modals/auth-modals';
import { compressProfileImage } from '../../../../services/common/image-compression';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

interface Language {
  value: string;
  name: string;
  nativeName: string;
  flag: string;
}

interface Specialization {
  value: string;
  label: string;
  description: string;
  icon: string;
}

interface Certification {
  title: string;
  description: string;
}

@Component({
  selector: 'app-teacher-create-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    SideImageComponent,
  ],
  templateUrl: './teacher-create-profile.component.html',
  styleUrls: ['./teacher-create-profile.component.scss'],
})
export class TeacherCreateProfileComponent implements OnInit {
  profileForm!: FormGroup;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  isSubmitting = false;
  selectedLanguages: string[] = [];
  selectedSpecializations: string[] = [];
  // Default avatar shown when user has no profile picture
  defaultAvatar: string =
  'assets/images/default-avatar.svg';

  // Available Languages
  availableLanguages: Language[] = [
    {
      value: 'arabic',
      name: 'teacher_create_profile.language_arabic',
      nativeName: 'العربية',
      flag: '🇸🇦',
    },
    {
      value: 'english',
      name: 'teacher_create_profile.language_english',
      nativeName: 'English',
      flag: '🇺🇸',
    },
    {
      value: 'german',
      name: 'teacher_create_profile.language_german',
      nativeName: 'Deutsch',
      flag: '🇩🇪',
    },
    {
      value: 'french',
      name: 'teacher_create_profile.language_french',
      nativeName: 'Français',
      flag: '🇫🇷',
    },
    {
      value: 'turkish',
      name: 'teacher_create_profile.language_turkish',
      nativeName: 'Türkçe',
      flag: '🇹🇷',
    },
    {
      value: 'other',
      name: 'teacher_create_profile.language_other',
      nativeName: 'Other',
      flag: '🌐',
    },
  ];

  // Available Specializations
  availableSpecializations: Specialization[] = [
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
    {
      value: 'arabic-language',
      label: 'teacher_create_profile.specialization_arabic_language',
      description: 'teacher_create_profile.specialization_arabic_language_desc',
      icon: 'fas fa-language',
    },
  ];


  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private _facadeProfilesService: FacadeProfilesService,
    private _uploadService: UploadFilesService,
    private _repoService: RepoService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.profileForm = this.formBuilder.group({
      yearsOfExperience: [
        '',
        [
          Validators.required,
          Validators.min(0),
          Validators.max(50),
          Validators.pattern('^[0-9]+$'),
        ],
      ],
      hourlyRate: [
        '',
        [
          Validators.required,
          Validators.min(0),
          Validators.max(200),
          Validators.pattern('^[0-9]+(\\.[0-9]{1,2})?$'),
        ],
      ],
      languages: [
        this.selectedLanguages,
        [Validators.required, this.minArrayLengthValidator(1)],
      ],
      bio: [
        '',
        [
          Validators.required,
          Validators.minLength(50),
          Validators.maxLength(500),
        ],
      ],
      specializations: [
        this.selectedSpecializations,
        [Validators.required, this.minArrayLengthValidator(1)],
      ],
      certifications: this.formBuilder.array([]),
    });
  }

  // FormArray getter for certifications
  get certifications(): FormArray {
    return this.profileForm.get('certifications') as FormArray;
  }


  // Create certification form group
  private createCertificationGroup(): FormGroup {
    return this.formBuilder.group({
      title: ['', Validators.maxLength(100)],
      description: ['', Validators.maxLength(300)],
    });
  }

  // Add new certification
  addCertification(): void {
    if (this.certifications.length < 5) {
      this.certifications.push(this.createCertificationGroup());
      this.certifications.markAsTouched();
    }
  }

  // Remove certification
  removeCertification(index: number): void {
    this.certifications.removeAt(index);
    this.certifications.markAsTouched();
  }

  // File upload handling
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validate file type
      const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      if (!allowedTypes.includes(file.type)) {
        return;
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        return;
      }

      this.selectedFile = file;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewUrl = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  // Remove uploaded image
  removeImage(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.selectedFile = null;
    this.previewUrl = null;

    // Reset file input
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  // Language selection methods
  toggleLanguage(languageValue: string): void {
    const index = this.selectedLanguages.indexOf(languageValue);

    if (index > -1) {
      this.selectedLanguages.splice(index, 1);
    } else {
      this.selectedLanguages.push(languageValue);
    }

    this.profileForm.get('languages')?.setValue(this.selectedLanguages);
    this.profileForm.get('languages')?.markAsTouched();
  }

  isLanguageSelected(languageValue: string): boolean {
    return this.selectedLanguages.includes(languageValue);
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

  // Form validation helpers
  isFieldValid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return !!(field?.valid && field?.touched);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return !!(field?.invalid && field?.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.profileForm.get(fieldName);

    if (field?.errors && field?.touched) {
      const errors = field.errors;

      if (errors['required']) {
        return 'teacher_create_profile.validation.field_required';
      }

      if (errors['min']) {
        return 'teacher_create_profile.validation.min_value';
      }

      if (errors['max']) {
        return 'teacher_create_profile.validation.max_value';
      }

      if (errors['minlength']) {
        return 'teacher_create_profile.validation.min_length';
      }

      if (errors['maxlength']) {
        return 'teacher_create_profile.validation.max_length';
      }

      if (errors['pattern']) {
        return 'teacher_create_profile.validation.invalid_format';
      }

      if (errors['minArrayLength']) {
        return 'teacher_create_profile.validation.select_at_least_one';
      }
    }

    return '';
  }

  // Bio character count
  getBioLength(): number {
    const bioValue = this.profileForm.get('bio')?.value || '';
    return bioValue.length;
  }

  // Custom Validators
  private minArrayLengthValidator(minLength: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!Array.isArray(value) || value.length < minLength) {
        return {
          minArrayLength: {
            actualLength: value?.length || 0,
            requiredLength: minLength,
          },
        };
      }
      return null;
    };
  }


  private prepareFormData(profilePictureUrl?: string): any {
    const formValue = this.profileForm.value;

    const data: any = {
      specializations: this.selectedSpecializations,
      yearsOfExperience: parseInt(formValue.yearsOfExperience),
      hourlyRate: parseFloat(formValue.hourlyRate),
      bio: formValue.bio.trim(),
    };

    // Add profile picture URL only if we have one
    if (profilePictureUrl) {
      data.profilePictureUrl = profilePictureUrl;
    }

    // Log for debugging
    console.log('Prepared form data:', data);

    return data;
  }

  // Form submission
  onSubmit(): void {
    if (this.profileForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;

      // Additional validation
      if (this.selectedSpecializations.length === 0) {
        console.error('No specializations selected');
        this.isSubmitting = false;
        return;
      }

      // If user selected a new image, upload it first
      if (this.selectedFile) {
        console.log('Uploading image first...');
        from(compressProfileImage(this.selectedFile))
          .pipe(switchMap((file) => this._uploadService.uploadFile(file, 'images')))
          .subscribe({
            next: (uploadResponse) => {
              console.log('Image upload response:', uploadResponse);
              // Get the uploaded image URL
              const uploadedImageUrl =
                uploadResponse.data?.url || uploadResponse.url;

              // Prepare form data with the uploaded image URL
              const formData = this.prepareFormData(uploadedImageUrl);

              // Submit profile data
              this.submitProfile(formData);
            },
            error: (error) => {
              console.error('Error uploading image:', error);
              this.isSubmitting = false;
              // You can add error handling here (show toast message, etc.)
            },
          });
      } else {
        console.log('No image to upload, submitting form data directly...');
        // No new image selected, submit without profile picture update
        const formData = this.prepareFormData();
        this.submitProfile(formData);
      }
    } else {
      console.log('Form is invalid:', this.profileForm.errors);
      console.log('Form value:', this.profileForm.value);
      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched(this.profileForm);
    }
  }

  private submitProfile(formData: any): void {
    // Log the data being sent for debugging
    console.log('Sending profile data:', JSON.stringify(formData, null, 2));

    this._repoService.createTeacherProfile(formData).subscribe({
      next: (response) => {
        console.log('Profile created successfully:', response);

        // Submit languages after profile creation
        this.submitLanguages();

        // Check if there are certifications to submit
        const certificationsData = this.prepareCertificationsData();
        if (certificationsData.length > 0) {
          this.submitCertifications(certificationsData);
        } else {
          this.isSubmitting = false;
          // Navigate to success page or dashboard
          this.router.navigate(['/teacher-profile']);
        }
      },
      error: (error) => {
        console.error('Error creating profile:', error);
        console.error('Error details:', error.error);
        this.isSubmitting = false;
        // You can add error handling here (show toast message, etc.)
      },
    });
  }

  private submitLanguages(): void {
    // Map language values to their corresponding IDs
    const languageMap: { [key: string]: number } = {
      arabic: 1,
      english: 2,
      german: 3,
      french: 4,
      turkish: 5,
      other: 6,
    };

    // Convert selected languages to array of numbers
    const languageIds = this.selectedLanguages
      .map((lang) => languageMap[lang])
      .filter((id) => id !== undefined);

    if (languageIds.length === 0) {
      console.log('No languages selected to submit');
      return;
    }

    // Prepare the data in the correct format for the API
    const languagesData = {
      languages: languageIds,
    };

    console.log('Submitting languages:', languagesData);

    this._repoService.setLanguage(languagesData).subscribe({
      next: (response) => {
        console.log('Languages submitted successfully:', response);
      },
      error: (error) => {
        console.error('Error submitting languages:', error);
        console.error('Language error details:', error.error);
      },
    });
  }

  private prepareCertificationsData(): any[] {
    const formValue = this.profileForm.value;

    // Filter out empty certifications and format according to API requirements
    const validCertifications = formValue.certifications
      .filter((cert: Certification) => cert.title && cert.title.trim())
      .map((cert: Certification) => ({
        title: cert.title.trim(),
        issuingAuthority: 'International Quran Academy', // Fixed value
        issueDate: new Date().toISOString(), // Current date in ISO format
        expiryDate: null, // Fixed value
        description: cert.description ? cert.description.trim() : '',
      }));

    console.log(
      'Filtered certifications with API format:',
      validCertifications
    );
    return validCertifications;
  }

  private submitCertifications(certificationsData: any[]): void {
    console.log('Starting certification submission process...');
    console.log(
      'Certifications to submit:',
      JSON.stringify(certificationsData, null, 2)
    );

    // Validate data before sending
    if (!certificationsData || certificationsData.length === 0) {
      console.log('No certifications to submit, navigating to dashboard');
      this.isSubmitting = false;
      this.router.navigate(['/teacher/dashboard']);
      return;
    }

    // Submit certifications one by one
    this.submitCertificationsSequentially(certificationsData, 0);
  }

  private submitCertificationsSequentially(
    certificationsData: any[],
    index: number
  ): void {
    if (index >= certificationsData.length) {
      // All certifications submitted successfully
      console.log('All certifications submitted successfully');
      this.isSubmitting = false;
      this.router.navigate(['/teacher-profile']);
      return;
    }

    const currentCert = certificationsData[index];
    console.log(
      `Submitting certification ${index + 1}/${certificationsData.length}:`,
      currentCert
    );

    this._repoService.createTeacherCertifications(currentCert).subscribe({
      next: (response) => {
        console.log(
          `Certification ${index + 1} created successfully:`,
          response
        );
        // Submit next certification
        this.submitCertificationsSequentially(certificationsData, index + 1);
      },
      error: (error) => {
        console.error(`Error creating certification ${index + 1}:`, error);
        console.error('Certification error details:', error.error);

        // Continue with next certification even if current one failed
        console.log(
          `Continuing with next certification despite error in certification ${
            index + 1
          }`
        );
        this.submitCertificationsSequentially(certificationsData, index + 1);
      },
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((field) => {
      const control = formGroup.get(field);
      control?.markAsTouched({ onlySelf: true });

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach((arrayControl) => {
          if (arrayControl instanceof FormGroup) {
            this.markFormGroupTouched(arrayControl);
          }
        });
      }
    });
  }
}
