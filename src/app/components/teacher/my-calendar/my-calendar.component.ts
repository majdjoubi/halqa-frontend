import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { RepoService } from '../../../Repositories/repo.service';
import { LuxonDateService } from '../../../services/common/luxon-date.service';
import { LanguageService } from '../../../services/language.service';
import { TimezoneService } from '../../../services/scheduling/timezone.service';
import { SlotsService } from '../../../services/scheduling/slots.service';
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
  styleUrls: ['./my-calendar.component.scss'],
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

  // ===== PENDING SELECTION =====
  pendingSlots: Set<number> = new Set(); // Hours pending to be added
  slotsToDelete: Set<number> = new Set(); // Availability IDs pending to be deleted

  // ===== HOURLY RATE =====
  hourlyRate: number = 0;
  showRateModal: boolean = false;
  newHourlyRate: number = 0;
  isSavingRate: boolean = false;
  isSavingSlot: boolean = false;

  // ===== SUBSCRIPTIONS =====
  private langSubscription?: Subscription;

  // ===== TIMEZONE =====
  userIanaTimezone: string = 'UTC';
  userTimezoneDisplay: string = '';

  constructor(
    private repo: RepoService,
    private luxonDate: LuxonDateService,
    private languageService: LanguageService,
    private translate: TranslateService,
    private timezoneService: TimezoneService,
    private slotsService: SlotsService
  ) {
    // Initialize alert audio
    this.alertAudio = new Audio('/assets/sounds/lesson-alert.mp3');
  }

  ngOnInit(): void {
    // Initialize timezone - auto-detect user's IANA timezone
    this.userIanaTimezone = this.timezoneService.detectClientTimezone();
    this.userTimezoneDisplay = this.formatTimezoneDisplay(this.userIanaTimezone);

    // Check RTL
    this.langSubscription = this.languageService.currentLanguage$.subscribe(lang => {
      this.isRtl = lang.code === 'ar';
    });

    // Load bookings
    this.loadBookings();

    // Start countdown timer
    this.startCountdown();
  }

  /**
   * Format IANA timezone to display string
   */
  private formatTimezoneDisplay(ianaZone: string): string {
    try {
      const now = this.luxonDate.fromObject({}).setZone(ianaZone);
      const offset = now.offset;
      const hours = Math.floor(Math.abs(offset) / 60);
      const minutes = Math.abs(offset) % 60;
      const sign = offset >= 0 ? '+' : '-';
      const offsetStr = minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
      const cityName = ianaZone.split('/').pop()?.replace(/_/g, ' ') || ianaZone;
      return `${cityName} (${offsetStr})`;
    } catch {
      return ianaZone;
    }
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
    this.countdownInterval?.unsubscribe();
  }

  // ===== DATA LOADING =====

  loadBookings(): void {
    this.isLoading = true;

    this.slotsService.getTeacherBookings({
      page: this.currentPage,
      pageSize: this.pageSize,
      upcomingOnly: false
    }).subscribe({
      next: (response: any) => {
        this.bookings = response.bookings || [];
        this.totalCount = response.totalCount;
        this.totalPages = response.totalPages || Math.ceil(response.totalCount / this.pageSize);
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
    // Load teacher profile for hourly rate (legacy API)
    this.repo.getTeacherProfile().subscribe({
      next: (response: any) => {
        const profile = response?.profile || response;
        
        // Load hourly rate
        if (profile?.hourlyRate !== undefined) {
          this.hourlyRate = profile.hourlyRate;
          this.newHourlyRate = profile.hourlyRate;
        }

        // Availability management on this page uses the legacy teacher availability endpoints,
        // which require a numeric availabilityId. Load legacy availability here.
        this.loadLegacyAvailability(profile);
      },
      error: (err) => console.error('Error loading teacher profile:', err)
    });
  }

  private normalizeDateOnly(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') {
      // API may return DateTime like "2026-01-09T00:00:00"; UI expects "2026-01-09"
      const idx = value.indexOf('T');
      const datePart = (idx >= 0 ? value.slice(0, idx) : value).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : datePart.slice(0, 10);
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    return undefined;
  }

  /**
   * Load availability slots from V1 API
   */
  private loadAvailabilityFromV1(): void {
    // Get teacher ID from current user context (assuming it's available)
    // For now, use the legacy API to get teacher ID, then fetch V1 slots
    this.repo.getTeacherProfile().subscribe({
      next: (response: any) => {
        const profile = response?.profile || response;
        const teacherId = profile?.teacherId || profile?.id;
        
        if (!teacherId) {
          console.warn('No teacher ID found, falling back to legacy availability');
          this.loadLegacyAvailability(profile);
          return;
        }

        // Calculate date range (next 30 days)
        const now = new Date();
        const fromDate = now.toISOString().split('T')[0];
        const toDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        this.slotsService.getTeacherSlots(teacherId, fromDate, toDate, 60).subscribe({
          next: (slotsResponse) => {
            this.availabilitySlots = slotsResponse.slots.map(slot => {
              const localStart = this.timezoneService.utcToLocal(slot.startAtUtc, this.userIanaTimezone);
              return {
                id: slot.slotId,
                date: localStart.toFormat('yyyy-MM-dd'),
                displayStartTime: localStart.toFormat('HH:mm'),
                displayHour: localStart.hour,
                startTimeUtc: slot.startAtUtc,
                endTimeUtc: slot.endAtUtc,
                status: slot.status
              };
            });
            this.buildAvailableDates();
          },
          error: (err) => {
            console.warn('V1 API not available, falling back to legacy:', err);
            this.loadLegacyAvailability(profile);
          }
        });
      },
      error: (err) => console.error('Error loading availability:', err)
    });
  }

  /**
   * Fallback to load availability from legacy profile API
   */
  private loadLegacyAvailability(profile: any): void {
    if (profile?.availability) {
      this.availabilitySlots = profile.availability.map((slot: any) => {
        // Display times in user's local timezone
        let dateStr: string | undefined;
        let displayStartTime: string | undefined;
        let displayHour: number | undefined;

        if (slot.startDateTime) {
          try {
            const localStart = this.timezoneService.utcToLocal(slot.startDateTime, this.userIanaTimezone);
            dateStr = localStart.toFormat('yyyy-MM-dd');
            displayStartTime = localStart.toFormat('HH:mm');
            displayHour = localStart.hour;
          } catch {
            // Fallback to legacy method
            const meccaStart = this.luxonDate.fromServerTimeToMecca(slot.startDateTime);
            if (meccaStart.isValid) {
              dateStr = meccaStart.toFormat('yyyy-MM-dd');
              displayStartTime = meccaStart.toFormat('HH:mm');
              displayHour = meccaStart.hour;
            }
          }
        }

        return {
          ...slot,
          date: dateStr || this.normalizeDateOnly(slot.date) || slot.date,
          displayStartTime: displayStartTime || slot.startTime,
          displayHour: displayHour
        };
      });
    }
    this.buildAvailableDates();
  }

  buildAvailableDates(): void {
    const dates = new Set<string>();

    // Add dates from bookings
    this.bookings.forEach(b => {
      if (b.scheduledDateTime) {
        try {
          const localTime = this.timezoneService.utcToLocal(b.scheduledDateTime, this.userIanaTimezone);
          dates.add(localTime.toFormat('yyyy-MM-dd'));
        } catch {
          // Fallback
          const meccaTime = this.luxonDate.fromServerTimeToMecca(b.scheduledDateTime);
          if (meccaTime.isValid) {
            dates.add(meccaTime.toFormat('yyyy-MM-dd'));
          }
        }
      }
    });

    // Add dates from availability
    this.availabilitySlots.forEach(slot => {
      const normalized = this.normalizeDateOnly(slot.date) || slot.date;
      if (normalized) {
        dates.add(normalized);
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
    
    // Use user's local timezone
    const nowLocal = this.timezoneService.nowUtc().setZone(this.userIanaTimezone);
    const todayStr = nowLocal.toFormat('yyyy-MM-dd');
    const currentHour = nowLocal.hour;
    const isToday = dateStr === todayStr;
    const isPastDate = dateStr < todayStr;

    // Get bookings for this date
    const bookingsForDate = this.bookings.filter(b => {
      if (!b.scheduledDateTime) return false;
      try {
        const localTime = this.timezoneService.utcToLocal(b.scheduledDateTime, this.userIanaTimezone);
        return localTime.toFormat('yyyy-MM-dd') === dateStr;
      } catch {
        return false;
      }
    });

    // Get availability for this date
    const availabilityForDate = this.availabilitySlots.filter(s => s.date === dateStr);

    // Generate 24 hourly slots
    for (let hour = 0; hour < 24; hour++) {
      const startTime24 = `${String(hour).padStart(2, '0')}:00`;
      const endTime24 = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
      
      // Convert to 12-hour format for display using TimezoneService
      const { hour12: startHour12, period: startPeriod } = this.timezoneService.formatHour24ToAmPm(hour);
      const { hour12: endHour12, period: endPeriod } = this.timezoneService.formatHour24ToAmPm((hour + 1) % 24);
      const startTime = `${startHour12}:00 ${startPeriod}`;
      const endTime = `${endHour12}:00 ${endPeriod}`;

      // Check if booked
      const booking = bookingsForDate.find(b => {
        try {
          const localTime = this.timezoneService.utcToLocal(b.scheduledDateTime, this.userIanaTimezone);
          return localTime.toFormat('HH:mm') === startTime24;
        } catch {
          return false;
        }
      });

      // Check if available and get availabilityId
      const availabilitySlot = availabilityForDate.find(s => {
        const slotTime = s.displayStartTime || s.startTime;
        return slotTime?.substring(0, 5) === startTime24;
      });
      const isAvailable = !!availabilitySlot;

      const rawAvailabilityId = availabilitySlot?.id;
      const availabilityId =
        typeof rawAvailabilityId === 'number'
          ? rawAvailabilityId
          : (typeof rawAvailabilityId === 'string' && /^\d+$/.test(rawAvailabilityId))
              ? Number(rawAvailabilityId)
              : undefined;

      const isPast = isPastDate || (isToday && hour <= currentHour);

      slots.push({
        time: startTime,
        endTime: endTime,
        hour: hour,
        isAvailable: isAvailable && !booking,
        isBooked: !!booking,
        isPast: isPast,
        booking: booking,
        availabilityId: availabilityId
      });
    }

    this.allTimeSlots = slots;
  }

  // Helper function to convert 24-hour to 12-hour format using TimezoneService
  formatTo12Hour(hour: number): string {
    const { hour12, period } = this.timezoneService.formatHour24ToAmPm(hour);
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
   * Handle click on a time slot - toggle selection
   * - If empty slot: toggle pending selection (green)
   * - If available slot: toggle for deletion (red)
   * - If booked: do nothing
   */
  onSlotClick(slot: TimeSlot): void {
    // Don't allow actions on past slots or booked slots
    if (slot.isPast || slot.isBooked) return;
    
    if (slot.isAvailable && slot.availabilityId) {
      // Toggle deletion for existing availability
      if (this.slotsToDelete.has(slot.availabilityId)) {
        this.slotsToDelete.delete(slot.availabilityId);
      } else {
        this.slotsToDelete.add(slot.availabilityId);
      }
    } else if (!slot.isAvailable) {
      // Toggle pending selection for new slot
      if (this.pendingSlots.has(slot.hour)) {
        this.pendingSlots.delete(slot.hour);
      } else {
        this.pendingSlots.add(slot.hour);
      }
    }
  }

  /**
   * Check if a slot is pending to be added
   */
  isSlotPending(slot: TimeSlot): boolean {
    return this.pendingSlots.has(slot.hour) && !slot.isAvailable;
  }

  /**
   * Check if a slot is pending to be deleted
   */
  isSlotPendingDelete(slot: TimeSlot): boolean {
    return slot.availabilityId ? this.slotsToDelete.has(slot.availabilityId) : false;
  }

  /**
   * Check if there are any pending changes
   */
  hasPendingChanges(): boolean {
    return this.pendingSlots.size > 0 || this.slotsToDelete.size > 0;
  }

  /**
   * Clear all pending selections
   */
  clearPendingChanges(): void {
    this.pendingSlots.clear();
    this.slotsToDelete.clear();
  }

  /**
   * Confirm and save all pending changes
   */
  confirmAvailabilityChanges(): void {
    if (this.isSavingSlot || !this.hasPendingChanges()) return;
    
    this.isSavingSlot = true;
    const dateStr = this.selectedCalendarDate;
    const dateParts = dateStr.split('-');
    const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dayOfWeek = dateObj.getDay();
    
    const operations: any[] = [];
    const results = {
      createFailed: 0,
      deleteFailed: 0,
      created: 0,
      deleted: 0
    };
    
    // Add creation operations
    this.pendingSlots.forEach(hour => {
      // IMPORTANT: Do not wrap 23:00 -> 00:00.
      // Backend slot generation requires EndTime > StartTime. Use 24:00:00 for the last hour.
      const endHour = hour + 1;
      operations.push({
        type: 'create',
        hour: hour,
        request: {
          dayOfWeek: dayOfWeek,
          startTime: `${String(hour).padStart(2, '0')}:00:00`,
          endTime: `${String(endHour).padStart(2, '0')}:00:00`,
          isRecurring: false,
          date: dateStr,
          isAvailable: true
        }
      });
    });
    
    // Add deletion operations
    this.slotsToDelete.forEach(availabilityId => {
      operations.push({ type: 'delete', availabilityId: availabilityId });
    });
    
    this.executeOperations(operations, 0, results);
  }

  /**
   * Execute operations one by one
   */
  private executeOperations(
    operations: any[],
    index: number,
    results: { createFailed: number; deleteFailed: number; created: number; deleted: number }
  ): void {
    if (index >= operations.length) {
      // All done: clear pending, then reload from backend so refresh matches persisted state.
      this.clearPendingChanges();
      this.reloadAvailabilityAfterSave(results);
      return;
    }
    
    const op = operations[index];
    
    if (op.type === 'create') {
      this.repo.createAvailability(op.request).subscribe({
        next: (response: any) => {
          if (response && response.id) {
            results.created++;
            this.availabilitySlots.push({
              id: response.id,
              date: this.selectedCalendarDate,
              displayStartTime: `${String(op.hour).padStart(2, '0')}:00`,
              displayHour: op.hour
            });
          }
          this.executeOperations(operations, index + 1, results);
        },
        error: () => {
          results.createFailed++;
          this.executeOperations(operations, index + 1, results);
        }
      });
    } else if (op.type === 'delete') {
      this.repo.deleteAvailability(op.availabilityId).subscribe({
        next: () => {
          results.deleted++;
          this.availabilitySlots = this.availabilitySlots.filter(s => s.id !== op.availabilityId);
          this.executeOperations(operations, index + 1, results);
        },
        error: () => {
          results.deleteFailed++;
          this.executeOperations(operations, index + 1, results);
        }
      });
    }
  }

  private reloadAvailabilityAfterSave(results: { createFailed: number; deleteFailed: number; created: number; deleted: number }): void {
    this.repo.getTeacherProfile().subscribe({
      next: (response: any) => {
        const profile = response?.profile || response;
        this.loadLegacyAvailability(profile);

        if (this.selectedCalendarDate) {
          this.generateTimeSlotsForDate(this.selectedCalendarDate);
        }
        this.buildAvailableDates();

        this.isSavingSlot = false;

        const hadFailures = results.createFailed > 0 || results.deleteFailed > 0;
        if (hadFailures) {
          alert(this.translate.instant('my_calendar_page.batch.error') || 'Failed to update some availability slots');
        } else {
          alert(this.translate.instant('my_calendar_page.batch.success') || 'Availability updated successfully');
        }
      },
      error: (err) => {
        console.error('Error reloading availability after save:', err);
        this.isSavingSlot = false;
        alert(this.translate.instant('my_calendar_page.batch.error') || 'Failed to update some availability slots');
      }
    });
  }

  /**
   * Create availability for a time slot (legacy)
   * @deprecated Use confirmAvailabilityChanges() instead
   */
  private createAvailability(slot: TimeSlot): void {
    if (this.isSavingSlot || !this.selectedCalendarDate) return;
    
    this.isSavingSlot = true;
    
    const dateStr = this.selectedCalendarDate;
    const startHour = slot.hour;
    const endHour = (slot.hour + 1) % 24;
    
    // Parse the date to get day of week
    const dateParts = dateStr.split('-');
    const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Build request matching backend CreateAvailabilityRequestDto
    const request = {
      dayOfWeek: dayOfWeek,
      startTime: `${String(startHour).padStart(2, '0')}:00:00`,
      endTime: `${String(endHour).padStart(2, '0')}:00:00`,
      isRecurring: false,  // Single date slot, not recurring
      date: dateStr,
      isAvailable: true
    };
    
    this.repo.createAvailability(request).subscribe({
      next: (response: any) => {
        // Update local state with created slot
        if (response && response.id) {
          this.availabilitySlots.push({
            id: response.id,
            date: dateStr,
            displayStartTime: `${String(startHour).padStart(2, '0')}:00`,
            displayHour: startHour,
            startTimeUtc: response.startTime || `${String(startHour).padStart(2, '0')}:00:00`,
            endTimeUtc: response.endTime || `${String(endHour).padStart(2, '0')}:00:00`,
            status: 'Available'
          });
        }
        
        // Regenerate time slots for current date
        this.generateTimeSlotsForDate(this.selectedCalendarDate);
        this.buildAvailableDates();
        
        this.isSavingSlot = false;
      },
      error: (err: any) => {
        console.error('Error creating availability:', err);
        this.isSavingSlot = false;
        alert(this.translate.instant('my_calendar_page.errors.create_availability') || 'Failed to create availability');
      }
    });
  }

  /**
   * Delete availability for a time slot
   * Uses Legacy API: DELETE /api/teacher/availability/{id}
   */
  deleteAvailability(slot: TimeSlot, event: Event): void {
    event.stopPropagation(); // Prevent slot click
    
    if (!slot.availabilityId || this.isSavingSlot) return;
    
    this.isSavingSlot = true;
    
    this.repo.deleteAvailability(slot.availabilityId).subscribe({
      next: (response: any) => {
        // Remove from local state
        this.availabilitySlots = this.availabilitySlots.filter(s => s.id !== slot.availabilityId);
          
        // Regenerate time slots for current date
        this.generateTimeSlotsForDate(this.selectedCalendarDate);
        this.buildAvailableDates();
        
        this.isSavingSlot = false;
      },
      error: (err: any) => {
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

    this.slotsService.getMeetingToken(booking.id).subscribe({
      next: (response: any) => {
        const joinUrl = response?.joinUrl || response?.meetingUrl || booking.meetingRoomUrl;
        if (joinUrl) {
          window.open(joinUrl, '_blank');
          return;
        }
        alert('تعذر فتح الغرفة الآن، حاول مرة أخرى لاحقًا.');
      },
      error: (err) => {
        console.error('Error getting meeting token:', err);
        const code = err?.error?.code;
        if (code === 'TIME_NOT_YET') {
          alert('الوقت لم يحن بعد. يمكنك الدخول قبل الموعد بـ 5 دقائق.');
          return;
        }
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
    try {
      return this.timezoneService.formatUtcAs12Hour(dateTimeStr, this.userIanaTimezone);
    } catch {
      const meccaTime = this.luxonDate.fromServerTimeToMecca(dateTimeStr);
      return meccaTime.isValid ? meccaTime.toFormat('h:mm a') : '';
    }
  }

  formatDate(dateTimeStr: string): string {
    try {
      const local = this.timezoneService.utcToLocal(dateTimeStr, this.userIanaTimezone);
      return local.toFormat('yyyy-MM-dd');
    } catch {
      const meccaTime = this.luxonDate.fromServerTimeToMecca(dateTimeStr);
      return meccaTime.isValid ? meccaTime.toFormat('yyyy-MM-dd') : '';
    }
  }

  formatDateTime(dateTimeStr: string): string {
    try {
      return this.timezoneService.formatUtcAs12Hour(dateTimeStr, this.userIanaTimezone, true);
    } catch {
      const meccaTime = this.luxonDate.fromServerTimeToMecca(dateTimeStr);
      return meccaTime.isValid ? meccaTime.toFormat('yyyy-MM-dd h:mm a') : '';
    }
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
