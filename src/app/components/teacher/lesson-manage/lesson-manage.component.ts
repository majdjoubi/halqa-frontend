import { Component, OnInit, HostListener, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SideMenuComponent } from '../../../shared/shared-component/side-menu/side-menu.component';
import { RepoService } from '../../../Repositories/repo.service';
import { LESSON_DURATION_OPTIONS } from '../../../shared/enums';
import { DateLocaleService } from '../../../services/common/date-locale.service';

@Component({
  selector: 'app-lesson-manage',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './lesson-manage.component.html',
  styleUrl: './lesson-manage.component.scss',
})
export class LessonManageComponent implements OnInit, AfterViewInit {
  // Form Group for lesson creation
  lessonForm!: FormGroup;

  // Form Group for lesson editing
  editLessonForm!: FormGroup;

  // data for lesson cards
  lessonCards: Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    duration: number;
    maxStudents: number;
    isActive?: boolean;
    totalBookings?: number;
  }> = [];

  // error message from API
  apiErrorMessage: string | null = null;

  // Pop-up message state
  showPopup = false;
  popupMessage = '';
  popupType: 'success' | 'error' = 'success';

  // Loading state for create action
  isCreatingLesson = false;

  // Edit modal state
  showEditModal = false;
  currentEditingLesson: any = null;
  isLoadingLessonData = false;
  isUpdatingLesson = false;

  // id of the lesson currently being deleted (used to show per-item spinner)
  deletingId: string | null = null;
  // controls the reusable side menu
  sidebarOpen = false;
  // which card was selected: 'active' | 'previous' | null
  selectedCard: 'active' | 'previous' | null = null;

  // Minimum date for scheduledAt (current date and time) in local 'datetime-local' format
  minDate!: string;

  // Duration options for group sessions
  durationOptions = LESSON_DURATION_OPTIONS;

  get sideMenuWidth(): string {
    if (typeof window !== 'undefined') {
      const screenWidth = window.innerWidth;
      if (screenWidth <= 480) {
        return '95vw'; // Almost full width on very small screens
      } else if (screenWidth <= 768) {
        return '85vw'; // Most of the screen on mobile
      } else if (screenWidth <= 992) {
        return '60vw'; // Tablet size
      }
    }
    return '420px'; // Desktop default
  }

  // Getters for active and previous lessons
  // These will be recalculated every time they're accessed
  get activeLessons(): Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    duration: number;
    maxStudents: number;
    active: boolean;
  }> {
    return this.lessonCards
      .filter((lesson) => lesson.isActive === true)
      .map((lesson) => ({
        ...lesson,
        active: true,
      }));
  }

  get previousLessons(): Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    duration: number;
    maxStudents: number;
    expired: boolean;
  }> {
    return this.lessonCards
      .filter((lesson) => lesson.isActive === false)
      .map((lesson) => ({
        ...lesson,
        expired: true,
      }));
  }

  constructor(
    private fb: FormBuilder,
    private _repo: RepoService,
    private translate: TranslateService,
    public dateLocaleService: DateLocaleService
  ) {}

  // Custom validator for future dates. Parses the 'datetime-local' input as local time
  futureDateValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      try {
        const selectedDate = this.parseLocalDatetimeToDate(control.value);
        const now = new Date();
        return selectedDate > now ? null : { futureDate: true };
      } catch (e) {
        return { futureDate: true };
      }
    };
  }

  // Helper: parse a 'datetime-local' string (YYYY-MM-DDTHH:mm) as a local Date
  private parseLocalDatetimeToDate(localDatetime: string): Date {
    // Expect format 'YYYY-MM-DDTHH:mm' (seconds may be absent)
    if (!localDatetime) throw new Error('Invalid datetime');
    const parts = localDatetime.split('T');
    if (parts.length !== 2) throw new Error('Invalid datetime');
    const [datePart, timePart] = parts;
    const [year, month, day] = datePart.split('-').map((v) => Number(v));
    const [hour, minute] = timePart.split(':').map((v) => Number(v));
    return new Date(year, month - 1, day, hour || 0, minute || 0);
  }

  // Helper: convert a local 'datetime-local' input string to a UTC ISO string
  private localDatetimeToUTC(localDatetime: string | null): string | null {
    if (!localDatetime) return null;
    const d = this.parseLocalDatetimeToDate(localDatetime);
    return d.toISOString();
  }

  // Helper: convert a UTC date/string to a local 'datetime-local' value (YYYY-MM-DDTHH:mm)
  private utcToLocalDatetimeInput(utc: string | Date | null): string {
    if (!utc) return '';
    const d = new Date(utc);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  ngOnInit(): void {
    // Set minimum date to current date and time
    const now = new Date();
    // Use local datetime format so the datetime-local input shows the correct local min
    this.minDate = this.utcToLocalDatetimeInput(now);

    this.initForm();
    this.initEditForm();
    this.loadLessons();
  }

  ngAfterViewInit(): void {
    // Ensure side menu is closed when component loads on small screens
    this.closeSidebarIfMobileView();
  }

  initForm(): void {
    this.lessonForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      price: ['', [Validators.required, Validators.min(0)]],
      duration: [60, [Validators.required]], // Duration in minutes, default 1 hour
      maxStudents: [
        '',
        [Validators.required, Validators.min(1), Validators.max(20)],
      ], // Max 20 students as per API requirement
      scheduledAt: ['', [Validators.required, this.futureDateValidator()]],
    });
  }

  initEditForm(): void {
    this.editLessonForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      price: ['', [Validators.required, Validators.min(0)]],
      duration: [60, [Validators.required]], // Duration in minutes
      maxStudents: [
        '',
        [Validators.required, Validators.min(1), Validators.max(20)],
      ],
      scheduledAt: ['', [Validators.required, this.futureDateValidator()]],
    });
  }

  onSubmit(): void {
    if (this.lessonForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.lessonForm.controls).forEach((key) => {
        this.lessonForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (this.lessonForm.valid) {
      // Convert scheduledAt to UTC ISO string
      const scheduledAtValue = this.lessonForm.value.scheduledAt;
      const scheduledAtUTC = this.localDatetimeToUTC(scheduledAtValue);

      const payload = {
        title: this.lessonForm.value.title?.trim(),
        description: this.lessonForm.value.description?.trim(),
        price: Number(this.lessonForm.value.price),
        maxParticipants: Number(this.lessonForm.value.maxStudents),
        scheduledDateTime: scheduledAtUTC,
        duration: Number(this.lessonForm.value.duration) / 60, // Convert minutes to hours for API
        createMeetingRoomImmediately: true,
      };

      this.isCreatingLesson = true;
      this.apiErrorMessage = null;

      this._repo.CreateGroupSession(payload).subscribe({
        next: (res) => {
          console.log('✅ Lesson created successfully!', res);
          this.isCreatingLesson = false;
          this.showSuccessPopup(
            this.translate.instant('lesson_manage_page.popup.lesson_created')
          );
          this.lessonForm.reset();
          // Reload lessons list to show the new lesson
          this.loadLessons();
        },
        error: (err) => {
          console.error('❌ Error creating lesson:', err);
          this.isCreatingLesson = false;

          // Extract error message from API response
          let errorMessage = 'An error occurred while creating the lesson.';

          if (err.error?.errors) {
            // Handle validation errors object
            const errors = err.error.errors;
            if (errors.MaxStudents || errors.MaxParticipants) {
              errorMessage = (errors.MaxStudents || errors.MaxParticipants)[0]; // "Max students/participants must be between 1 and 20"
            } else {
              // Combine all error messages
              errorMessage = Object.values(errors).flat().join(', ');
            }
          } else if (err.error?.message) {
            errorMessage = err.error.message;
          } else if (err.error?.title) {
            errorMessage = err.error.title;
          } else if (typeof err.error === 'string') {
            errorMessage = err.error;
          }

          // Map some known server messages to localized keys
          if (
            errorMessage === 'Max students must be between 1 and 20' ||
            errorMessage === 'Max participants must be between 1 and 20'
          ) {
            const localized = this.translate.instant(
              'lesson_manage_page.validation.max_students_max'
            );
            this.showErrorPopup(localized);
            this.apiErrorMessage = localized;
          } else {
            this.showErrorPopup(errorMessage);
            this.apiErrorMessage = errorMessage;
          }
        },
      });
    }
  }

  // get all lessons (active and previous)
  loadLessons(): void {
    this._repo.getLessonsByTeacher().subscribe({
      next: (res) => {
        console.log('✅ Lessons loaded:', res);
        this.lessonCards = res || [];
        console.log('Active lessons count:', this.activeLessons.length);
        console.log('Previous lessons count:', this.previousLessons.length);
      },
      error: (err) => {
        console.error('❌ Error loading lessons:', err);
        this.lessonCards = [];
      },
    });
  }

  // Delete lesson by ID
  deleteLessonById(lessonId: string): void {
    // mark this lesson as being deleted so we can show a per-item spinner
    this.deletingId = lessonId;

    this._repo.deleteLesson(lessonId).subscribe({
      next: () => {
        console.log('✅ Lesson deleted successfully!');
        this.showSuccessPopup(
          this.translate.instant('lesson_manage_page.popup.lesson_deleted')
        );
        this.loadLessons(); // Reload lessons after deletion
        this.deletingId = null; // clear deleting id
      },
      error: (err) => {
        console.error('❌ Error deleting lesson:', err);
        this.deletingId = null; // clear deleting id
        this.showErrorPopup(
          this.translate.instant('lesson_manage_page.popup.failed_delete')
        );
      },
    });
  }
  // Show success popup
  showSuccessPopup(message: string): void {
    this.popupMessage = message;
    this.popupType = 'success';
    this.showPopup = true;
    this.apiErrorMessage = null;

    // Auto hide after 3 seconds
    setTimeout(() => {
      this.closePopup();
    }, 3000);
  }

  // Show error popup
  showErrorPopup(message: string): void {
    this.popupMessage = message;
    this.popupType = 'error';
    this.showPopup = true;

    // Auto hide after 5 seconds for errors
    setTimeout(() => {
      this.closePopup();
    }, 5000);
  }

  // Close popup manually
  closePopup(): void {
    this.showPopup = false;
    this.popupMessage = '';
  }

  openSidebar(kind: 'active' | 'previous') {
    this.selectedCard = kind;
    // Determine if viewport matches the mobile breakpoint used in SCSS
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
      // Ensure the reusable side menu is closed on mobile so the inline
      // `.mobile-only` section can display unobstructed.
      this.closeSidebar();
    } else {
      // On larger viewports show the side menu overlay
      this.sidebarOpen = true;
    }
  }

  closeSidebar() {
    this.sidebarOpen = false;
    // keep selectedCard for possible reuse or clear it
    // this.selectedCard = null;
  }

  editLesson(lesson: any) {
    this.currentEditingLesson = lesson;
    this.showEditModal = true;
    this.isLoadingLessonData = true;

    // Get lesson details by ID
    this._repo.getTeacherLessonById(lesson.id).subscribe({
      next: (res) => {
        console.log('✅ Lesson data loaded:', res);
        this.isLoadingLessonData = false;

        // Populate the edit form with lesson data
        // Convert stored UTC (or whatever the API returned) to local datetime-local value
        const scheduledAtLocal = res.scheduledAt
          ? this.utcToLocalDatetimeInput(res.scheduledAt)
          : '';
        this.editLessonForm.patchValue({
          title: res.title || '',
          description: res.description || '',
          price: res.price || 0,
          maxStudents: res.maxStudents || 1,
          scheduledAt: scheduledAtLocal,
        });
      },
      error: (err) => {
        console.error('❌ Error loading lesson data:', err);
        this.isLoadingLessonData = false;
        this.showErrorPopup(
          this.translate.instant('lesson_manage_page.popup.failed_load')
        );
        this.closeEditModal();
      },
    });
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.currentEditingLesson = null;
    this.editLessonForm.reset();
    this.isLoadingLessonData = false;
    this.isUpdatingLesson = false;
  }

  onUpdateSubmit(): void {
    if (this.editLessonForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.editLessonForm.controls).forEach((key) => {
        this.editLessonForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (this.editLessonForm.valid && this.currentEditingLesson) {
      this.isUpdatingLesson = true;

      // Convert scheduledAt to UTC ISO string
      const scheduledAtValue = this.editLessonForm.value.scheduledAt;
      const scheduledAtUTC = this.localDatetimeToUTC(scheduledAtValue);

      const payload = {
        title: this.editLessonForm.value.title?.trim(),
        description: this.editLessonForm.value.description?.trim(),
        price: Number(this.editLessonForm.value.price),
        maxStudents: Number(this.editLessonForm.value.maxStudents),
        scheduledAt: scheduledAtUTC,
        isActive: this.currentEditingLesson.isActive,
        type: 1,
        duration: 1,
      };

      this._repo.updateLesson(this.currentEditingLesson.id, payload).subscribe({
        next: (res) => {
          console.log('✅ Lesson updated successfully!', res);
          this.isUpdatingLesson = false;
          this.showSuccessPopup(
            this.translate.instant('lesson_manage_page.popup.lesson_updated')
          );
          this.closeEditModal();
          // Reload lessons list to show the updated lesson
          this.loadLessons();
        },
        error: (err) => {
          console.error('❌ Error updating lesson:', err);
          this.isUpdatingLesson = false;

          // Extract error message from API response
          let errorMessage = 'An error occurred while updating the lesson.';

          if (err.error?.errors) {
            const errors = err.error.errors;
            if (errors.MaxStudents) {
              errorMessage = errors.MaxStudents[0];
            } else {
              errorMessage = Object.values(errors).flat().join(', ');
            }
          } else if (err.error?.message) {
            errorMessage = err.error.message;
          } else if (err.error?.title) {
            errorMessage = err.error.title;
          } else if (typeof err.error === 'string') {
            errorMessage = err.error;
          }

          if (errorMessage === 'Max students must be between 1 and 20') {
            this.showErrorPopup(
              this.translate.instant(
                'lesson_manage_page.validation.max_students_max'
              )
            );
          } else {
            this.showErrorPopup(errorMessage);
          }
        },
      });
    }
  }

  deleteLesson(lesson: any) {
    if (
      !confirm(
        this.translate.instant('lesson_manage_page.popup.delete_confirm')
      )
    )
      return;

    // Remove from lessonCards array instead of activeLessons (which is now a getter)
    this.lessonCards = this.lessonCards.filter((l) => l.id !== lesson.id);

    // Optionally call API to delete from backend
    // this._repo.deleteLesson(lesson.id).subscribe({
    //   next: () => {
    //     this.showSuccessPopup(this.translate.instant('lesson_manage_page.popup.lesson_deleted'));
    //   },
    //   error: (err) => {
    //     this.showErrorPopup(this.translate.instant('lesson_manage_page.popup.failed_delete'));
    //   }
    // });
  }

  // Handle ESC key to close modal
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showEditModal) {
      this.closeEditModal();
    }
  }

  // Handle window resize to update side menu width
  @HostListener('window:resize', ['$event'])
  onWindowResize(event: Event) {
    // This will trigger the getter to recalculate the width
    // The change detection will handle the update automatically
    // When switching to mobile viewport, close side menu so mobile-only blocks show properly
    this.closeSidebarIfMobileView();
  }

  /**
   * If the viewport is small (mobile) and the side menu is open,
   * close it so any inline/mobile-only content can display unobstructed.
   */
  private closeSidebarIfMobileView(): void {
    if (typeof window !== 'undefined') {
      const screenWidth = window.innerWidth;
      if (screenWidth <= 768 && this.sidebarOpen) {
        this.sidebarOpen = false;
      }
    }
  }

  // Prevent body scroll when modal is open
  @HostListener('document:touchmove', ['$event'])
  onTouchMove(event: TouchEvent) {
    if (this.showEditModal) {
      // Allow scrolling only within the modal
      const target = event.target as Element;
      const modalContainer = document.querySelector('.modal-container');
      if (modalContainer && !modalContainer.contains(target)) {
        event.preventDefault();
      }
    }
  }
}
