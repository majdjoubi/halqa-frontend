import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SchedulingService } from '../../../services/scheduling/scheduling.service';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LanguageService } from '../../../services/language.service';
import {
  AvailabilitySlot,
  BookingResponse,
  BookingStatus,
  CalendarEvent,
  CreateGroupSessionRequest,
  TeacherCalendarResponse,
  TeacherEarnings,
  UpdateRatesRequest
} from '../../../shared/modals/scheduling-modals';
import { LessonCalendarComponent, LessonEvent } from '../../../shared/shared-component/lesson-calendar/lesson-calendar.component';

@Component({
  selector: 'app-teacher-scheduling',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    LessonCalendarComponent
  ],
  templateUrl: './teacher-scheduling.component.html',
  styleUrl: './teacher-scheduling.component.scss'
})
export class TeacherSchedulingComponent implements OnInit, OnDestroy {
  // View state
  view: 'calendar' | 'earnings' | 'availability' | 'rates' = 'calendar';
  isLoading = true;

  // Calendar data
  calendarEvents: LessonEvent[] = [];
  availability: AvailabilitySlot[] = [];

  // Earnings data
  earnings: TeacherEarnings | null = null;

  // Selected booking for details modal
  selectedBooking: CalendarEvent | null = null;
  showBookingModal = false;

  // Create group session form
  showCreateGroupModal = false;
  createGroupForm: FormGroup;

  // One-Time Availability Modal
  showOneTimeModal = false;
  oneTimeForm: FormGroup;

  // Recurring Availability Modal
  showRecurringModal = false;
  recurringForm: FormGroup;

  // Minimum date for one-time availability (today)
  minDate: string = new Date().toISOString().split('T')[0];

  // Rates form
  ratesForm: FormGroup;

  // Availability form
  availabilitySlots: AvailabilitySlot[] = [];
  dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  private langSubscription?: Subscription;

  constructor(
    private schedulingService: SchedulingService,
    private dateLocale: DateLocaleService,
    private languageService: LanguageService,
    private translate: TranslateService,
    private fb: FormBuilder
  ) {
    // Initialize create group form
    this.createGroupForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      scheduledDateTime: ['', Validators.required],
      duration: [60, Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      maxStudents: [10, [Validators.required, Validators.min(1), Validators.max(20)]]
    });

    // Initialize one-time availability form
    this.oneTimeForm = this.fb.group({
      date: ['', Validators.required],
      startTime: ['09:00', Validators.required],
      endTime: ['17:00', Validators.required],
      slotDuration: [60, Validators.required]
    });

    // Initialize recurring availability form
    this.recurringForm = this.fb.group({
      dayOfWeek: [0, Validators.required],
      startTime: ['09:00', Validators.required],
      endTime: ['17:00', Validators.required],
      slotDuration: [60, Validators.required]
    });

    // Initialize rates form
    this.ratesForm = this.fb.group({
      hourlyRate: [0, [Validators.required, Validators.min(0)]],
      halfHourRate: [0, [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    this.loadCalendar();
    this.loadEarnings();

    // Subscribe to language changes
    this.langSubscription = this.languageService.currentLanguage$.subscribe(() => {
      // Refresh calendar on language change
      if (this.view === 'calendar') {
        this.loadCalendar();
      }
    });
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }

  // ============ View Switching ============

  switchView(newView: 'calendar' | 'earnings' | 'availability' | 'rates'): void {
    this.view = newView;
    if (newView === 'calendar') {
      this.loadCalendar();
    } else if (newView === 'earnings') {
      this.loadEarnings();
    }
  }

  // ============ Calendar ============

  loadCalendar(): void {
    this.isLoading = true;
    const now = new Date();
    const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    this.schedulingService.getTeacherCalendar(fromDate, toDate).subscribe({
      next: (response: TeacherCalendarResponse) => {
        this.calendarEvents = this.mapEventsToCalendar(response.events);
        this.availability = response.availability;
        this.availabilitySlots = [...response.availability];
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading calendar:', err);
        this.isLoading = false;
      }
    });
  }

  private mapEventsToCalendar(events: CalendarEvent[]): LessonEvent[] {
    return events.map(event => ({
      id: event.id.toString(),
      title: event.title,
      start: event.start,
      end: event.end,
      type: (event.type === 'group' ? 'group' : 'individual') as 'individual' | 'group',
      status: this.mapStatus(event.status),
      studentName: event.studentName,
      currentStudents: event.currentEnrollment,
      maxStudents: event.maxStudents
    }));
  }

  private mapStatus(status: string): 'available' | 'booked' | 'completed' | 'cancelled' {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'inprogress':
        return 'booked';
      case 'completed':
        return 'completed';
      case 'cancelled':
      case 'cancelledbyteacher':
        return 'cancelled';
      default:
        return 'available';
    }
  }

  onEventClick(event: LessonEvent): void {
    this.selectedBooking = {
      id: parseInt(event.id),
      title: event.title,
      start: event.start as string,
      end: (event.end || event.start) as string,
      type: event.type || 'individual',
      status: event.status || '',
      studentName: event.studentName,
      currentEnrollment: event.currentStudents,
      maxStudents: event.maxStudents,
      meetingRoomUrl: undefined,
      color: '#17a2b8'
    };
    this.showBookingModal = true;
  }

  closeBookingModal(): void {
    this.showBookingModal = false;
    this.selectedBooking = null;
  }

  // ============ Session Actions ============

  startSession(bookingId: number): void {
    this.schedulingService.startSession(bookingId).subscribe({
      next: (response) => {
        alert(this.translate.instant('SCHEDULING.SESSION_STARTED'));
        this.loadCalendar();
        this.closeBookingModal();
        // Open meeting URL if available
        if (response.meetingRoomUrl) {
          window.open(response.meetingRoomUrl, '_blank');
        }
      },
      error: (err) => {
        alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_STARTING'));
      }
    });
  }

  endSession(bookingId: number): void {
    if (confirm(this.translate.instant('SCHEDULING.CONFIRM_END'))) {
      this.schedulingService.endSession(bookingId).subscribe({
        next: () => {
          alert(this.translate.instant('SCHEDULING.SESSION_ENDED'));
          this.loadCalendar();
          this.loadEarnings();
          this.closeBookingModal();
        },
        error: (err) => {
          alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_ENDING'));
        }
      });
    }
  }

  markNoShow(bookingId: number): void {
    if (confirm(this.translate.instant('SCHEDULING.CONFIRM_NO_SHOW'))) {
      this.schedulingService.markStudentNoShow(bookingId).subscribe({
        next: () => {
          alert(this.translate.instant('SCHEDULING.NO_SHOW_MARKED'));
          this.loadCalendar();
          this.loadEarnings();
          this.closeBookingModal();
        },
        error: (err) => {
          alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_NO_SHOW'));
        }
      });
    }
  }

  joinMeeting(): void {
    if (this.selectedBooking?.meetingRoomUrl) {
      window.open(this.selectedBooking.meetingRoomUrl, '_blank');
    }
  }

  // ============ Create Group Session ============

  openCreateGroupModal(): void {
    this.createGroupForm.reset({
      title: '',
      description: '',
      scheduledDateTime: '',
      duration: 60,
      price: 0,
      maxStudents: 10
    });
    this.showCreateGroupModal = true;
  }

  closeCreateGroupModal(): void {
    this.showCreateGroupModal = false;
  }

  submitGroupSession(): void {
    if (this.createGroupForm.valid) {
      const formValue = this.createGroupForm.value;
      const request: CreateGroupSessionRequest = {
        title: formValue.title,
        description: formValue.description,
        scheduledDateTime: new Date(formValue.scheduledDateTime).toISOString(),
        duration: formValue.duration,
        price: formValue.price,
        maxStudents: formValue.maxStudents
      };

      this.schedulingService.createGroupSession(request).subscribe({
        next: () => {
          alert(this.translate.instant('SCHEDULING.GROUP_CREATED'));
          this.closeCreateGroupModal();
          this.loadCalendar();
        },
        error: (err) => {
          alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_CREATE_GROUP'));
        }
      });
    }
  }

  // ============ Earnings ============

  loadEarnings(): void {
    this.schedulingService.getTeacherEarnings().subscribe({
      next: (earnings) => {
        this.earnings = earnings;
        // Update rates form with current values if available
        // This would typically come from a separate API call
      },
      error: (err) => {
        console.error('Error loading earnings:', err);
      }
    });
  }

  // ============ Rates ============

  saveRates(): void {
    if (this.ratesForm.valid) {
      const request: UpdateRatesRequest = this.ratesForm.value;
      this.schedulingService.updateRates(request).subscribe({
        next: () => {
          alert(this.translate.instant('SCHEDULING.RATES_UPDATED'));
        },
        error: (err) => {
          alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_UPDATE_RATES'));
        }
      });
    }
  }

  // ============ Availability ============

  addAvailabilitySlot(): void {
    this.availabilitySlots.push({
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 60,
      isRecurring: true
    });
  }

  removeAvailabilitySlot(index: number): void {
    this.availabilitySlots.splice(index, 1);
  }

  saveAvailability(): void {
    this.schedulingService.updateAvailability({ slots: this.availabilitySlots }).subscribe({
      next: () => {
        alert(this.translate.instant('SCHEDULING.AVAILABILITY_UPDATED'));
        this.loadCalendar();
      },
      error: (err) => {
        alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_UPDATE_AVAILABILITY'));
      }
    });
  }

  // ============ One-Time Availability ============

  openOneTimeAvailabilityModal(): void {
    this.minDate = new Date().toISOString().split('T')[0];
    this.oneTimeForm.reset({
      date: '',
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 60
    });
    this.showOneTimeModal = true;
  }

  closeOneTimeModal(): void {
    this.showOneTimeModal = false;
  }

  submitOneTimeAvailability(): void {
    if (this.oneTimeForm.valid) {
      const formValue = this.oneTimeForm.value;
      
      // Create a one-time availability slot
      const slot: AvailabilitySlot = {
        dayOfWeek: new Date(formValue.date).getDay(),
        startTime: formValue.startTime,
        endTime: formValue.endTime,
        slotDuration: parseInt(formValue.slotDuration),
        isRecurring: false,
        date: formValue.date
      };

      // Add to existing slots and save
      this.availabilitySlots.push(slot);
      this.schedulingService.updateAvailability({ slots: this.availabilitySlots }).subscribe({
        next: () => {
          alert(this.translate.instant('SCHEDULING.ONE_TIME_ADDED'));
          this.closeOneTimeModal();
          this.loadCalendar();
        },
        error: (err) => {
          // Remove the slot if save failed
          this.availabilitySlots.pop();
          alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_UPDATE_AVAILABILITY'));
        }
      });
    }
  }

  // ============ Recurring Availability ============

  openRecurringAvailabilityModal(): void {
    this.recurringForm.reset({
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 60
    });
    this.showRecurringModal = true;
  }

  closeRecurringModal(): void {
    this.showRecurringModal = false;
  }

  submitRecurringAvailability(): void {
    if (this.recurringForm.valid) {
      const formValue = this.recurringForm.value;
      
      // Create a recurring availability slot
      const slot: AvailabilitySlot = {
        dayOfWeek: parseInt(formValue.dayOfWeek),
        startTime: formValue.startTime,
        endTime: formValue.endTime,
        slotDuration: parseInt(formValue.slotDuration),
        isRecurring: true
      };

      // Add to existing slots and save
      this.availabilitySlots.push(slot);
      this.schedulingService.updateAvailability({ slots: this.availabilitySlots }).subscribe({
        next: () => {
          alert(this.translate.instant('SCHEDULING.RECURRING_ADDED'));
          this.closeRecurringModal();
          this.loadCalendar();
        },
        error: (err) => {
          // Remove the slot if save failed
          this.availabilitySlots.pop();
          alert(err.error?.message || this.translate.instant('SCHEDULING.ERROR_UPDATE_AVAILABILITY'));
        }
      });
    }
  }

  // ============ Utility ============

  getStatusClass(status: string): string {
    return this.schedulingService.getStatusColor(status);
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  canStartSession(): boolean {
    if (!this.selectedBooking) return false;
    const status = this.selectedBooking.status.toLowerCase();
    return status === 'confirmed';
  }

  canEndSession(): boolean {
    if (!this.selectedBooking) return false;
    const status = this.selectedBooking.status.toLowerCase();
    return status === 'inprogress';
  }

  isSessionActive(): boolean {
    if (!this.selectedBooking) return false;
    const status = this.selectedBooking.status.toLowerCase();
    return status === 'inprogress';
  }
}
