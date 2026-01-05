import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { RepoService } from '../../../Repositories/repo.service';
import { LuxonDateService } from '../../../services/common/luxon-date.service';
import { LanguageService } from '../../../services/language.service';
import { Subscription, interval } from 'rxjs';
import { SimpleDatePickerComponent } from '../../../shared/shared-component/simple-date-picker/simple-date-picker.component';

// Booking item interface
interface BookingItem {
  id: number;
  studentId: string;
  studentName: string;
  studentAvatar?: string;
  lessonTitle: string;
  lessonType: 'Individual' | 'Group';
  scheduledDateTime: string;
  duration: number;
  status: string;
  amountPaid: number;
  meetingRoomUrl?: string;
  canStart: boolean;
  createdAt: string;
}

// Response interface
interface BookingsResponse {
  bookings: BookingItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  nextUpcoming?: BookingItem;
}

// Time slot for calendar
interface TimeSlot {
  time: string;
  endTime: string;
  isAvailable: boolean;
  isBooked: boolean;
  isPast: boolean;
  booking?: BookingItem;
}

@Component({
  selector: 'app-my-calendar',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, SimpleDatePickerComponent],
  templateUrl: './my-calendar.component.html',
  styleUrl: './my-calendar.component.scss',
})
export class MyCalendarComponent implements OnInit, OnDestroy {
  // ===== VIEW STATE =====
  view: 'calendar' | 'booked' = 'calendar';
  isLoading = true;
  isRtl = false;

  // ===== BOOKINGS DATA =====
  bookings: BookingItem[] = [];
  nextUpcoming: BookingItem | null = null;
  totalCount = 0;
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;

  // ===== COUNTDOWN =====
  countdownText = '';
  private countdownInterval?: Subscription;
  private alertPlayed = false;
  private alertAudio?: HTMLAudioElement;

  // ===== CALENDAR STATE =====
  selectedCalendarDate: string = '';
  allTimeSlots: TimeSlot[] = [];
  availableDates: string[] = [];

  // ===== AVAILABILITY DATA =====
  availabilitySlots: any[] = [];

  // ===== SUBSCRIPTIONS =====
  private langSubscription?: Subscription;

  constructor(
    private repo: RepoService,
    private luxonDate: LuxonDateService,
    private languageService: LanguageService,
    private translate: TranslateService
  ) {
    // Initialize alert audio
    this.alertAudio = new Audio('/assets/sounds/lesson-alert.mp3');
  }

  ngOnInit(): void {
    // Check RTL
    this.langSubscription = this.languageService.currentLanguage$.subscribe(lang => {
      this.isRtl = lang.code === 'ar';
    });

    // Load bookings
    this.loadBookings();

    // Start countdown timer
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
    this.countdownInterval?.unsubscribe();
  }

  // ===== DATA LOADING =====

  loadBookings(): void {
    this.isLoading = true;

    this.repo.getTeacherBookingsPaginated({
      page: this.currentPage,
      pageSize: this.pageSize,
      upcomingOnly: false
    }).subscribe({
      next: (response: BookingsResponse) => {
        this.bookings = response.bookings || [];
        this.totalCount = response.totalCount;
        this.totalPages = response.totalPages;
        this.nextUpcoming = response.nextUpcoming || null;

        // Build available dates for calendar
        this.buildAvailableDates();

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading bookings:', err);
        this.isLoading = false;
      }
    });

    // Also load availability
    this.loadAvailability();
  }

  loadAvailability(): void {
    this.repo.getTeacherProfile().subscribe({
      next: (response: any) => {
        const profile = response?.profile || response;
        if (profile?.availability) {
          this.availabilitySlots = profile.availability.map((slot: any) => {
            // Convert UTC to Mecca time for display
            let dateStr: string | undefined;
            let displayStartTime: string | undefined;

            if (slot.startDateTime) {
              const meccaStart = this.luxonDate.fromServerTimeToMecca(slot.startDateTime);
              if (meccaStart.isValid) {
                dateStr = meccaStart.toFormat('yyyy-MM-dd');
                displayStartTime = meccaStart.toFormat('HH:mm');
              }
            }

            return {
              ...slot,
              date: dateStr || slot.date,
              displayStartTime: displayStartTime || slot.startTime
            };
          });
        }
        this.buildAvailableDates();
      },
      error: (err) => console.error('Error loading availability:', err)
    });
  }

  buildAvailableDates(): void {
    const dates = new Set<string>();

    // Add dates from bookings
    this.bookings.forEach(b => {
      if (b.scheduledDateTime) {
        const meccaTime = this.luxonDate.fromServerTimeToMecca(b.scheduledDateTime);
        if (meccaTime.isValid) {
          dates.add(meccaTime.toFormat('yyyy-MM-dd'));
        }
      }
    });

    // Add dates from availability
    this.availabilitySlots.forEach(slot => {
      if (slot.date) {
        dates.add(slot.date);
      }
    });

    this.availableDates = Array.from(dates).sort();
  }

  // ===== COUNTDOWN TIMER =====

  startCountdown(): void {
    // Update every second
    this.countdownInterval = interval(1000).subscribe(() => {
      this.updateCountdown();
    });
    // Initial update
    this.updateCountdown();
  }

  updateCountdown(): void {
    if (!this.nextUpcoming) {
      this.countdownText = '';
      return;
    }

    const now = new Date();
    const scheduledTime = new Date(this.nextUpcoming.scheduledDateTime);
    const diff = scheduledTime.getTime() - now.getTime();

    if (diff <= 0) {
      this.countdownText = this.translate.instant('my_calendar.countdown.started');
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // Build countdown text
    let parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    this.countdownText = parts.join(' ');

    // Play alert sound when 5 minutes remaining
    if (diff <= 5 * 60 * 1000 && diff > 4 * 60 * 1000 && !this.alertPlayed) {
      this.playAlertSound();
      this.alertPlayed = true;
    }

    // Reset alert flag when more than 10 minutes
    if (diff > 10 * 60 * 1000) {
      this.alertPlayed = false;
    }
  }

  playAlertSound(): void {
    if (this.alertAudio) {
      this.alertAudio.play().catch(err => {
        console.log('Could not play alert sound:', err);
      });
    }
  }

  // ===== CALENDAR METHODS =====

  onCalendarDateSelected(dateStr: string): void {
    this.selectedCalendarDate = dateStr;
    this.generateTimeSlotsForDate(dateStr);
  }

  generateTimeSlotsForDate(dateStr: string): void {
    const slots: TimeSlot[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const isToday = dateStr === todayStr;
    const isPastDate = dateStr < todayStr;

    // Get bookings for this date
    const bookingsForDate = this.bookings.filter(b => {
      if (!b.scheduledDateTime) return false;
      const meccaTime = this.luxonDate.fromServerTimeToMecca(b.scheduledDateTime);
      return meccaTime.isValid && meccaTime.toFormat('yyyy-MM-dd') === dateStr;
    });

    // Get availability for this date
    const availabilityForDate = this.availabilitySlots.filter(s => s.date === dateStr);

    // Generate 24 hourly slots
    for (let hour = 0; hour < 24; hour++) {
      const startTime = `${String(hour).padStart(2, '0')}:00`;
      const endTime = `${String((hour + 1) % 24).padStart(2, '0')}:00`;

      // Check if booked
      const booking = bookingsForDate.find(b => {
        const meccaTime = this.luxonDate.fromServerTimeToMecca(b.scheduledDateTime);
        return meccaTime.isValid && meccaTime.toFormat('HH:mm') === startTime;
      });

      // Check if available
      const isAvailable = availabilityForDate.some(s => {
        const slotTime = s.displayStartTime || s.startTime;
        return slotTime?.substring(0, 5) === startTime;
      });

      const isPast = isPastDate || (isToday && hour <= currentHour);

      slots.push({
        time: startTime,
        endTime: endTime,
        isAvailable: isAvailable && !booking,
        isBooked: !!booking,
        isPast: isPast,
        booking: booking
      });
    }

    this.allTimeSlots = slots;
  }

  getSelectedDayName(): string {
    if (!this.selectedCalendarDate) return '';
    const date = new Date(this.selectedCalendarDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  }

  // ===== BOOKING ACTIONS =====

  startSession(booking: BookingItem): void {
    if (!booking.canStart) return;

    this.repo.startTeacherSession(booking.id).subscribe({
      next: (response: any) => {
        if (response.meetingRoomUrl) {
          window.open(response.meetingRoomUrl, '_blank');
        }
      },
      error: (err) => {
        console.error('Error starting session:', err);
        alert(this.translate.instant('my_calendar.errors.start_session'));
      }
    });
  }

  // ===== HELPERS =====

  getBookingTypeClass(booking: BookingItem): string {
    return booking.lessonType === 'Group' ? 'group-session' : 'individual-session';
  }

  getBookingTypeIcon(booking: BookingItem): string {
    return booking.lessonType === 'Group' ? 'fas fa-users' : 'fas fa-user';
  }

  formatTime(dateTimeStr: string): string {
    const meccaTime = this.luxonDate.fromServerTimeToMecca(dateTimeStr);
    return meccaTime.isValid ? meccaTime.toFormat('HH:mm') : '';
  }

  formatDate(dateTimeStr: string): string {
    const meccaTime = this.luxonDate.fromServerTimeToMecca(dateTimeStr);
    return meccaTime.isValid ? meccaTime.toFormat('yyyy-MM-dd') : '';
  }

  formatDateTime(dateTimeStr: string): string {
    const meccaTime = this.luxonDate.fromServerTimeToMecca(dateTimeStr);
    return meccaTime.isValid ? meccaTime.toFormat('yyyy-MM-dd HH:mm') : '';
  }

  // ===== PAGINATION =====

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBookings();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBookings();
    }
  }

  // ===== BOOKED SESSIONS GETTERS =====

  get upcomingBookings(): BookingItem[] {
    const now = new Date();
    return this.bookings.filter(b => 
      new Date(b.scheduledDateTime) > now && 
      (b.status === 'Confirmed' || b.status === 'confirmed')
    ).sort((a, b) => 
      new Date(a.scheduledDateTime).getTime() - new Date(b.scheduledDateTime).getTime()
    );
  }

  get pastBookings(): BookingItem[] {
    const now = new Date();
    return this.bookings.filter(b => 
      new Date(b.scheduledDateTime) <= now || 
      b.status === 'Completed' || 
      b.status === 'completed'
    ).sort((a, b) => 
      new Date(b.scheduledDateTime).getTime() - new Date(a.scheduledDateTime).getTime()
    );
  }
}
