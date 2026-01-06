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
  hour: number; // 0-23 for creating availability
  isAvailable: boolean;
  isBooked: boolean;
  isPast: boolean;
  booking?: BookingItem;
  availabilityId?: number; // For deleting availability
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

  // ===== HOURLY RATE =====
  hourlyRate: number = 0;
  showRateModal: boolean = false;
  newHourlyRate: number = 0;
  isSavingRate: boolean = false;
  isSavingSlot: boolean = false;

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
        
        // Load hourly rate
        if (profile?.hourlyRate !== undefined) {
          this.hourlyRate = profile.hourlyRate;
          this.newHourlyRate = profile.hourlyRate;
        }
        
        if (profile?.availability) {
          this.availabilitySlots = profile.availability.map((slot: any) => {
            // Convert UTC to Mecca time for display
            let dateStr: string | undefined;
            let displayStartTime: string | undefined;
            let displayHour: number | undefined;

            if (slot.startDateTime) {
              const meccaStart = this.luxonDate.fromServerTimeToMecca(slot.startDateTime);
              if (meccaStart.isValid) {
                dateStr = meccaStart.toFormat('yyyy-MM-dd');
                displayStartTime = meccaStart.toFormat('HH:mm');
                displayHour = meccaStart.hour;
              }
            }

            return {
              ...slot,
              date: dateStr || slot.date,
              displayStartTime: displayStartTime || slot.startTime,
              displayHour: displayHour
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
    
    // Use Mecca time instead of local browser time
    const nowMecca = this.luxonDate.nowMecca();
    const todayStr = nowMecca.toFormat('yyyy-MM-dd');
    const currentHour = nowMecca.hour;
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
      const startTime24 = `${String(hour).padStart(2, '0')}:00`;
      const endTime24 = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
      
      // Convert to 12-hour format for display
      const startTime = this.formatTo12Hour(hour);
      const endTime = this.formatTo12Hour((hour + 1) % 24);

      // Check if booked
      const booking = bookingsForDate.find(b => {
        const meccaTime = this.luxonDate.fromServerTimeToMecca(b.scheduledDateTime);
        return meccaTime.isValid && meccaTime.toFormat('HH:mm') === startTime24;
      });

      // Check if available and get availabilityId
      const availabilitySlot = availabilityForDate.find(s => {
        const slotTime = s.displayStartTime || s.startTime;
        return slotTime?.substring(0, 5) === startTime24;
      });
      const isAvailable = !!availabilitySlot;

      const isPast = isPastDate || (isToday && hour <= currentHour);

      slots.push({
        time: startTime,
        endTime: endTime,
        hour: hour,
        isAvailable: isAvailable && !booking,
        isBooked: !!booking,
        isPast: isPast,
        booking: booking,
        availabilityId: availabilitySlot?.id
      });
    }

    this.allTimeSlots = slots;
  }

  // Helper function to convert 24-hour to 12-hour format
  formatTo12Hour(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    return `${hour12}:00 ${period}`;
  }

  getSelectedDayName(): string {
    if (!this.selectedCalendarDate) return '';
    const date = new Date(this.selectedCalendarDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  }

  // ===== AVAILABILITY ACTIONS =====

  /**
   * Handle click on a time slot
   * - If empty slot (not booked, not available): create availability
   * - If available slot: handled by delete button (x)
   * - If booked: do nothing (just show info)
   */
  onSlotClick(slot: TimeSlot): void {
    // Don't allow actions on past slots
    if (slot.isPast) return;
    
    // Don't allow actions on booked slots
    if (slot.isBooked) return;
    
    // If slot is already available, don't do anything (use delete button)
    if (slot.isAvailable) return;
    
    // Create availability for this empty slot
    this.createAvailability(slot);
  }

  /**
   * Create availability for a time slot
   */
  createAvailability(slot: TimeSlot): void {
    if (this.isSavingSlot || !this.selectedCalendarDate) return;
    
    this.isSavingSlot = true;
    
    // Build the start and end datetime in Mecca timezone, then convert to UTC
    const dateStr = this.selectedCalendarDate;
    const startHour = slot.hour;
    const endHour = (slot.hour + 1) % 24;
    
    // Create Mecca datetime and convert to UTC for server
    const startMecca = this.luxonDate.createMeccaDateTime(dateStr, startHour, 0);
    const endMecca = this.luxonDate.createMeccaDateTime(dateStr, endHour, 0);
    
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    
    const startISO = startMecca.toUTC().toISO();
    const endISO = endMecca.toUTC().toISO();
    
    const data = {
      dayOfWeek: dayOfWeek,
      startTime: `${String(startHour).padStart(2, '0')}:00:00`,
      endTime: `${String(endHour).padStart(2, '0')}:00:00`,
      isRecurring: false,
      date: dateStr,
      startDateTime: startISO || undefined,
      endDateTime: endISO || undefined,
      isAvailable: true
    };
    
    this.repo.createAvailability(data).subscribe({
      next: (response: any) => {
        // Update local state immediately
        this.availabilitySlots.push({
          id: response.id || response.availabilityId,
          date: dateStr,
          displayStartTime: `${String(startHour).padStart(2, '0')}:00`,
          displayHour: startHour,
          ...response
        });
        
        // Regenerate time slots for current date
        this.generateTimeSlotsForDate(this.selectedCalendarDate);
        this.buildAvailableDates();
        
        this.isSavingSlot = false;
      },
      error: (err) => {
        console.error('Error creating availability:', err);
        this.isSavingSlot = false;
        alert(this.translate.instant('my_calendar_page.errors.create_availability') || 'Failed to create availability');
      }
    });
  }

  /**
   * Delete availability for a time slot
   */
  deleteAvailability(slot: TimeSlot, event: Event): void {
    event.stopPropagation(); // Prevent slot click
    
    if (!slot.availabilityId || this.isSavingSlot) return;
    
    this.isSavingSlot = true;
    
    this.repo.deleteAvailability(slot.availabilityId).subscribe({
      next: () => {
        // Remove from local state
        this.availabilitySlots = this.availabilitySlots.filter(s => s.id !== slot.availabilityId);
        
        // Regenerate time slots for current date
        this.generateTimeSlotsForDate(this.selectedCalendarDate);
        this.buildAvailableDates();
        
        this.isSavingSlot = false;
      },
      error: (err) => {
        console.error('Error deleting availability:', err);
        this.isSavingSlot = false;
        alert(this.translate.instant('my_calendar_page.errors.delete_availability') || 'Failed to delete availability');
      }
    });
  }

  // ===== HOURLY RATE ACTIONS =====

  openRateModal(): void {
    this.newHourlyRate = this.hourlyRate;
    this.showRateModal = true;
  }

  closeRateModal(): void {
    this.showRateModal = false;
  }

  saveHourlyRate(): void {
    if (this.isSavingRate || this.newHourlyRate < 0) return;
    
    this.isSavingRate = true;
    
    this.repo.updateTeacherHourlyRate(this.newHourlyRate).subscribe({
      next: () => {
        this.hourlyRate = this.newHourlyRate;
        this.showRateModal = false;
        this.isSavingRate = false;
      },
      error: (err) => {
        console.error('Error updating hourly rate:', err);
        this.isSavingRate = false;
        alert(this.translate.instant('my_calendar_page.errors.update_rate') || 'Failed to update hourly rate');
      }
    });
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
