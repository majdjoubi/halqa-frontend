import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { take, filter } from 'rxjs/operators';
import { DateTime } from 'luxon';
import { RepoService } from '../../../Repositories/repo.service';
import { LessonCalendarComponent, LessonEvent } from '../../../shared/shared-component/lesson-calendar/lesson-calendar.component';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LuxonDateService } from '../../../services/common/luxon-date.service';
import { LanguageService } from '../../../services/language.service';
import { FacadeProfilesService } from '../../../services/profiles/facade-profiles.service';
import {
  GroupSessionStatus,
  IndividualSessionStatus,
  getGroupStatusLabel,
  getIndividualStatusLabel
} from '../../../shared/enums/session-status.enum';
import { SimpleDatePickerComponent } from '../../../shared/shared-component/simple-date-picker/simple-date-picker.component';

// Time slot interface for simplified calendar
interface TimeSlotDisplay {
  time: string;       // e.g., "00:00"
  endTime: string;    // e.g., "01:00"
  isAvailable: boolean;
  isBooked: boolean;
  isPast: boolean;
  slotId?: number;
  isSaving?: boolean;
  studentName?: string;
  // Group session properties
  isGroupSession?: boolean;
  groupSessionId?: number;
  groupSessionTitle?: string;
  participantsCount?: number;
  maxParticipants?: number;
}

// Availability slot interface
interface AvailabilitySlot {
  id?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isRecurring?: boolean;
  isBooked?: boolean;
  studentId?: string;
  studentName?: string;
  bookingId?: number;
  price?: number;
  // For non-recurring slots - specific date
  date?: string; // YYYY-MM-DD format
  startDateTime?: string; // Full ISO datetime
  endDateTime?: string; // Full ISO datetime
  // For group sessions
  type?: 'individual' | 'group';
  title?: string;
  currentParticipants?: number;
  maxParticipants?: number;
  rawDateTime?: string;
}

interface Booking {
  id: string | number;
  avatar?: string;
  name: string;
  email: string;
  title: string;
  datetime: string;
  rawDateTime?: string | null; // ISO date string for calendar
  amount: string;
  status: 'confirmed' | 'completed' | 'cancelled' | string;
  // type: 'individual' | 'group' helps split bookings into tabs
  type?: 'individual' | 'group' | 'availability' | string;
  meetingUrl?: string | null;
  // raw numeric status for group sessions (1..5)
  rawStatus?: number | null;
  // participant counts (for group sessions)
  currentParticipants?: number | null;
  maxParticipants?: number | null;
  notes?: string | null;
  // For availability slots
  slotData?: AvailabilitySlot;
}

@Component({
  selector: 'app-my-booked',
  standalone: true,
  imports: [CommonModule, TranslateModule, LessonCalendarComponent, FormsModule, ReactiveFormsModule, SimpleDatePickerComponent],
  templateUrl: './my-booked.component.html',
  styleUrl: './my-booked.component.scss',
})
export class MyBookedComponent implements OnInit, OnDestroy {
  bookings: Booking[] = [];
  view: 'calendar' | 'individual' | 'group' | 'availability' = 'calendar';

  // Loading state for bookings requests
  isLoading = true;
  private pendingRequests = 0;
  hasLoaded = false;

  // Language subscription for refreshing dates on language change
  private langSubscription?: Subscription;
  // Profile data subscription
  private profileSubscription?: Subscription;

  // Cached counts to avoid recalculating on every change detection
  private _individualCount = 0;
  private _groupCount = 0;

  get individualCount(): number {
    return this._individualCount;
  }

  get groupCount(): number {
    return this._groupCount;
  }

  // Update cached counts when bookings change
  private updateCounts(): void {
    this._individualCount = this.bookings.filter(
      (b) => (b.type || 'individual') === 'individual'
    ).length;
    this._groupCount = this.bookings.filter(
      (b) => (b.type || 'individual') === 'group'
    ).length;
    this._availabilityCount = this.availabilitySlots.length;
  }

  // ===== AVAILABILITY MANAGEMENT =====
  availabilitySlots: AvailabilitySlot[] = [];
  private _availabilityCount = 0;
  
  get availabilityCount(): number {
    return this._availabilityCount;
  }

  // Add Availability Modal
  showAddAvailabilityModal = false;
  addAvailabilityForm!: FormGroup;
  isSavingAvailability = false;
  minDate: string = DateTime.now().toFormat('yyyy-MM-dd');
  defaultHourlyRate: number = 10; // Default price from teacher profile
  isSavingDefaultRate: boolean = false; // Loading state for saving default rate

  // Weekly Pattern Modal
  showWeeklyPatternModal = false;
  isSavingPattern = false;
  weekDays = [
    { key: 'sunday', label: 'teacher_profile.weekly_pattern.sunday', dayIndex: 0, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'monday', label: 'teacher_profile.weekly_pattern.monday', dayIndex: 1, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'tuesday', label: 'teacher_profile.weekly_pattern.tuesday', dayIndex: 2, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'wednesday', label: 'teacher_profile.weekly_pattern.wednesday', dayIndex: 3, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'thursday', label: 'teacher_profile.weekly_pattern.thursday', dayIndex: 4, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'friday', label: 'teacher_profile.weekly_pattern.friday', dayIndex: 5, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
    { key: 'saturday', label: 'teacher_profile.weekly_pattern.saturday', dayIndex: 6, enabled: false, slots: [{ fromTime: '09:00', toTime: '10:00' }] },
  ];

  // Booking/Slot Details Modal
  showDetailsModal = false;
  selectedSlotDetails: any = null;
  isDeletingSlot = false;

  // Delete Confirmation Modal
  showDeleteConfirmModal = false;
  slotToDelete: AvailabilitySlot | null = null;
  deleteMode: 'single' | 'all-recurring' = 'single'; // For recurring slots

  // Recurring Confirmation Modal (when adding)
  showRecurringConfirmModal = false;
  pendingRecurringSlot: any = null;

  // Response Modal
  showResponseModal = false;
  responseModalData: { type: 'success' | 'error'; title: string; message: string } | null = null;
  private modalAutoCloseTimer: any = null;

  // Approve/Reject Modal
  showApproveRejectModal = false;
  selectedBookingForAction: Booking | null = null;
  rejectReason = '';
  isProcessingAction = false;

  // Filter state
  availabilityFilter: 'all' | 'available' | 'booked' = 'all';
  dateRangeFilter: 'week' | 'month' | 'all' = 'week';

  // ===== SIMPLIFIED CALENDAR =====
  selectedCalendarDate: string | null = null;
  allTimeSlots: TimeSlotDisplay[] = [];
  isRtl: boolean = false;
  savingSlots: Set<string> = new Set(); // Track which slots are being saved

  // ===== GROUP SESSION MODE =====
  isGroupSessionMode: boolean = false;
  showGroupSessionModal: boolean = false;
  selectedGroupSessionTime: string = '';
  groupSessionForm!: FormGroup;
  isSavingGroupSession: boolean = false;


  // Timezone - Fixed to Mecca time (GMT+3)
  userTimezoneDisplay: string = 'GMT+3';
  selectedGmtOffset: number = 180; // Fixed to GMT+3 (Mecca time)
  gmtOptions: { label: string; value: number }[] = [
    { label: 'GMT+3 (توقيت مكة)', value: 180 },
  ];

  constructor(
    private repo: RepoService,
    private dateLocale: DateLocaleService,
    private luxonDate: LuxonDateService,
    private languageService: LanguageService,
    private fb: FormBuilder,
    private facadeProfilesService: FacadeProfilesService,
    private translate: TranslateService
  ) {
    this.initializeForms();
  }

  private initializeForms(): void {
    this.addAvailabilityForm = this.fb.group({
      date: ['', Validators.required],
      fromTime: ['09:00', Validators.required],
      toTime: ['10:00', Validators.required],
      price: [this.defaultHourlyRate, [Validators.required, Validators.min(0)]],
      isRecurring: [false],
    });

    // Group session form
    this.groupSessionForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      price: [this.defaultHourlyRate, [Validators.required, Validators.min(0), Validators.max(10000)]],
      maxParticipants: [10, [Validators.required, Validators.min(2), Validators.max(50)]],
      description: ['', Validators.maxLength(1000)],
    });
  }

  ngOnInit(): void {
    // Initialize timezone display based on selected GMT offset
    this.userTimezoneDisplay = this.formatTimezoneDisplayFromOffset(this.selectedGmtOffset);

    // Subscribe to language changes to refresh date formatting
    this.langSubscription = this.languageService.currentLanguage$.subscribe(() => {
      this.refreshDateFormatting();
    });

    // reset request counter
    this.pendingRequests = 0;
    // Fetch teacher bookings from API and map to local Booking shape
    this.startRequest();
    this.repo.getTeacherBookings().subscribe({
      next: (resp: any) => {
        const dataArray: any[] | null = Array.isArray(resp)
          ? resp
          : resp && Array.isArray((resp as any).data)
          ? (resp as any).data
          : null;

        if (dataArray) {
          this.bookings = dataArray.map((b: any) => this.mapApiToBooking(b));
        } else {
          // fallback: keep current seeded bookings
          console.warn('Unexpected bookings response', resp);
        }
        this.finishRequest();
      },
      error: (err) => {
        console.error('Failed to load bookings', err);
        this.finishRequest();
      },
    });

    // Fetch group sessions specifically and append as group bookings
    this.startRequest();
    this.repo.getGroupSessionsByTeacher().subscribe({
      next: (resp: any) => {
        const sessions: any[] | null = Array.isArray(resp)
          ? resp
          : resp && Array.isArray((resp as any).data)
          ? (resp as any).data
          : null;
        if (sessions) {
          const mapped = sessions.map((s: any) =>
            this.mapGroupSessionToBooking(s)
          );
          // merge: remove any existing group entries with same id, then append mapped
          const others = this.bookings.filter((b) => b.type !== 'group');
          this.bookings = [...others, ...mapped];
        }
        this.finishRequest();
      },
      error: (err) => {
        console.error('Failed to load group sessions', err);
        this.finishRequest();
      },
    });

    // Fetch individual bookings specifically and merge into individual tab
    if (this.repo.getIndividualBookingsByTeacher) {
      this.startRequest();
      this.repo.getIndividualBookingsByTeacher().subscribe({
        next: (resp: any) => {
          const items: any[] | null = Array.isArray(resp)
            ? resp
            : resp && Array.isArray((resp as any).data)
            ? (resp as any).data
            : null;
          if (items) {
            const mapped = items.map((b: any) => this.mapApiToBooking(b));
            // merge: remove any existing individual entries, then append mapped
            const others = this.bookings.filter((b) => b.type !== 'individual');
            this.bookings = [...others, ...mapped];
          }
          this.finishRequest();
        },
        error: (err) => {
          console.error('Failed to load individual bookings', err);
          this.finishRequest();
        },
      });
    }

    // Fetch teacher availability slots
    this.loadAvailabilitySlots();
  }

  // Load availability slots from teacher profile
  private loadAvailabilitySlots(): void {
    this.startRequest();
    this.facadeProfilesService.getTeacherProfile().subscribe({
      next: () => {
        // Data will come through the observable
      },
      error: (err) => {
        console.error('Failed to load teacher profile for availability', err);
        this.finishRequest();
      },
    });

    // Use take(1) and filter to get only one emission with valid data
    this.profileSubscription = this.facadeProfilesService.getTeacherProfileData$.pipe(
      filter((data) => !!data?.profile),
      take(1)
    ).subscribe((data) => {
      // Get default hourly rate from teacher profile
      if (data.profile.hourlyRate) {
        this.defaultHourlyRate = data.profile.hourlyRate;
        // Update form with new default price
        this.addAvailabilityForm.patchValue({ price: this.defaultHourlyRate });
      }

      if (data.profile.availability) {
        this.availabilitySlots = data.profile.availability.map((slot: any) => {
            // Convert UTC times to Mecca timezone for display
            let dateStr: string | undefined;
            let displayStartTime: string | undefined;
            let displayEndTime: string | undefined;
            
            // If we have startDateTime (full ISO), use it to calculate Mecca time
            if (slot.startDateTime) {
              const meccaStart = this.luxonDate.fromServerTimeToMecca(slot.startDateTime);
              const meccaEnd = slot.endDateTime 
                ? this.luxonDate.fromServerTimeToMecca(slot.endDateTime)
                : meccaStart.plus({ hours: 1 });
              
              if (meccaStart.isValid) {
                dateStr = meccaStart.toFormat('yyyy-MM-dd');
                displayStartTime = meccaStart.toFormat('HH:mm');
                displayEndTime = meccaEnd.toFormat('HH:mm');
              }
            } else if (slot.date) {
              // Legacy: date + time without timezone info
              // Assume the stored time is UTC and convert to Mecca
              const startTimeStr = slot.startTime || slot.fromTime || '09:00';
              const endTimeStr = slot.endTime || slot.toTime || '10:00';
              
              // Create full datetime from date + time (assume UTC)
              const isoStart = `${slot.date}T${startTimeStr.substring(0, 5)}:00Z`;
              const isoEnd = `${slot.date}T${endTimeStr.substring(0, 5)}:00Z`;
              
              const meccaStart = this.luxonDate.fromServerTimeToMecca(isoStart);
              const meccaEnd = this.luxonDate.fromServerTimeToMecca(isoEnd);
              
              if (meccaStart.isValid) {
                dateStr = meccaStart.toFormat('yyyy-MM-dd');
                displayStartTime = meccaStart.toFormat('HH:mm');
                displayEndTime = meccaEnd.toFormat('HH:mm');
              } else {
                // Fallback: use as-is
                dateStr = slot.date;
                displayStartTime = startTimeStr;
                displayEndTime = endTimeStr;
              }
            }
            
            return {
              id: slot.id,
              dayOfWeek: slot.dayOfWeek ?? slot.day,
              startTime: displayStartTime || slot.startTime || slot.fromTime,
              endTime: displayEndTime || slot.endTime || slot.toTime,
              isRecurring: slot.isRecurring ?? false,
              isBooked: !!slot.studentId || !!slot.bookedBy,
              studentId: slot.studentId,
              studentName: slot.studentName,
              bookingId: slot.bookingId,
              price: slot.price || this.defaultHourlyRate,
              // Store both display date and original UTC data
              date: dateStr,
              startDateTime: slot.startDateTime,
              endDateTime: slot.endDateTime,
            };
          });
          
        // Debug: Log loaded availability slots
        console.log('Loaded availability slots from backend:', this.availabilitySlots);
        this.availabilitySlots.forEach((slot, index) => {
          console.log(`Loaded slot ${index}: day=${slot.dayOfWeek}, start=${slot.startTime}, end=${slot.endTime}, recurring=${slot.isRecurring}, date=${slot.date}`);
        });
      }
      // Note: updateCounts and updateCalendarLessons are called in finishRequest()
      this.finishRequest();
    });
  }

  private startRequest(): void {
    this.pendingRequests++;
    this.isLoading = true;
  }

  private finishRequest(): void {
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    if (this.pendingRequests === 0) {
      this.isLoading = false;
      this.hasLoaded = true;
      
      // Deduplicate bookings by id to prevent duplicate display
      this.bookings = this.bookings.filter((booking, index, self) =>
        index === self.findIndex((b) => b.id === booking.id)
      );
      
      // Update cached counts and calendar lessons when all requests complete
      this.updateCounts();
      this.updateCalendarLessons();
      
      // Initialize simplified calendar if date selected
      if (this.selectedCalendarDate) {
        this.generateTimeSlotsForDate(this.selectedCalendarDate);
      }
    }
  }

  // ===== SIMPLIFIED CALENDAR METHODS =====

  /**
   * Get all dates that have availability (for SimpleDatePicker highlighting)
   * Only returns dates with actual availability slots - not all future dates
   */
  get availableDates(): string[] {
    const dates = new Set<string>();
    
    // Add dates from existing availability slots only
    for (const slot of this.availabilitySlots) {
      if (slot.date) {
        dates.add(slot.date);
      }
    }
    
    // Also add dates that have group sessions
    for (const booking of this.bookings) {
      if (booking.type === 'group' && booking.rawDateTime) {
        const dateStr = booking.rawDateTime.split('T')[0];
        dates.add(dateStr);
      }
    }
    
    return Array.from(dates).sort();
  }

  /**
   * Called when a date is selected from the SimpleDatePicker
   */
  onCalendarDateSelected(dateStr: string): void {
    this.selectedCalendarDate = dateStr;
    this.generateTimeSlotsForDate(dateStr);
  }

  /**
   * Generate 24 hourly time slots for a selected date
   */
  generateTimeSlotsForDate(dateStr: string): void {
    const slots: TimeSlotDisplay[] = [];
    
    // Get existing availability for this date
    const existingSlots = this.availabilitySlots.filter(s => s.date === dateStr);
    
    // Get booked slots for this date (individual)
    const bookedSlots = this.bookings.filter(b => {
      if (!b.rawDateTime) return false;
      const bookingDate = b.rawDateTime.split('T')[0];
      return bookingDate === dateStr && b.type === 'individual';
    });

    // Get group sessions for this date
    const groupSessionsForDate = this.bookings.filter(b => {
      if (!b.rawDateTime || b.type !== 'group') return false;
      const sessionDate = b.rawDateTime.split('T')[0];
      return sessionDate === dateStr;
    });

    // Check if date is today to determine past hours
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isPastDate = dateStr < todayStr;

    // Generate 24 hourly slots (00:00 to 23:00)
    for (let hour = 0; hour < 24; hour++) {
      const startTime = `${String(hour).padStart(2, '0')}:00`;
      const endHour = (hour + 1) % 24;
      const endTime = `${String(endHour).padStart(2, '0')}:00`;

      // Check if this slot is already available
      const existingSlot = existingSlots.find(s => {
        const slotStart = s.startTime.includes('T') ? s.startTime.split('T')[1].substring(0, 5) : s.startTime.substring(0, 5);
        return slotStart === startTime;
      });

      // Check if this slot is booked and get student name (individual)
      const bookedSlot = bookedSlots.find(b => {
        if (!b.rawDateTime) return false;
        const bookingTime = b.rawDateTime.split('T')[1]?.substring(0, 5);
        return bookingTime === startTime;
      });
      const isBooked = !!bookedSlot || (existingSlot?.isBooked ?? false);
      const studentName = bookedSlot?.name || existingSlot?.studentName || '';

      // Check if this slot has a group session
      const groupSession = groupSessionsForDate.find(g => {
        if (!g.rawDateTime) return false;
        const sessionTime = g.rawDateTime.split('T')[1]?.substring(0, 5);
        return sessionTime === startTime;
      });

      // Check if hour is in the past
      const isPast = isPastDate || (isToday && hour <= currentHour);

      slots.push({
        time: startTime,
        endTime: endTime,
        isAvailable: !!existingSlot && !groupSession,
        isBooked: isBooked && !groupSession,
        isPast: isPast,
        slotId: existingSlot?.id,
        isSaving: this.savingSlots.has(`${dateStr}-${startTime}`),
        studentName: studentName,
        // Group session properties
        isGroupSession: !!groupSession,
        groupSessionId: groupSession ? Number(groupSession.id) : undefined,
        groupSessionTitle: groupSession?.title || '',
        participantsCount: groupSession?.currentParticipants || 0,
        maxParticipants: groupSession?.maxParticipants || 0,
      });
    }

    this.allTimeSlots = slots;
  }

  /**
   * Toggle slot availability (click to add, already handled removal separately)
   */
  toggleSlot(slot: TimeSlotDisplay): void {
    if (slot.isPast || slot.isSaving || slot.isBooked || slot.isGroupSession) return;
    
    // Check if group session mode is active
    if (this.isGroupSessionMode) {
      // Open group session modal for this time
      this.selectedGroupSessionTime = slot.time;
      this.showGroupSessionModal = true;
      // Reset form with defaults
      this.groupSessionForm.patchValue({
        title: '',
        price: this.defaultHourlyRate,
        maxParticipants: 10,
        description: '',
      });
      return;
    }

    if (!slot.isAvailable) {
      this.addSlot(slot);
    }
    // Removal is handled by the X button
  }

  /**
   * Add a 1-hour availability slot
   */
  addSlot(slot: TimeSlotDisplay): void {
    if (!this.selectedCalendarDate || slot.isAvailable || slot.isSaving || slot.isPast) return;
    
    // Check for conflicts with group sessions
    const conflictingGroupSession = this.allTimeSlots.find(s => 
      s.time === slot.time && s.isGroupSession
    );
    if (conflictingGroupSession) {
      this.showErrorModal(
        this.translate.instant('common.error'),
        this.translate.instant('my_booked_page.messages.conflict_error')
      );
      return;
    }

    const slotKey = `${this.selectedCalendarDate}-${slot.time}`;
    this.savingSlots.add(slotKey);
    slot.isSaving = true;

    const [hours] = slot.time.split(':').map(Number);
    
    // Subtract 3 hours for Mecca timezone (GMT+3) conversion to UTC
    let utcStartHour = hours - 3;
    let utcEndHour = (hours + 1) - 3;
    let startDate = this.selectedCalendarDate;
    let endDate = this.selectedCalendarDate;
    
    // Handle day rollback for start time
    if (utcStartHour < 0) {
      utcStartHour += 24;
      const dateParts = this.selectedCalendarDate.split('-');
      const prevDay = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]) - 1);
      startDate = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
    }
    
    // Handle day rollback for end time
    if (utcEndHour < 0) {
      utcEndHour += 24;
      const dateParts = this.selectedCalendarDate.split('-');
      const prevDay = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]) - 1);
      endDate = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
    } else if (utcEndHour >= 24) {
      utcEndHour -= 24;
      const dateParts = this.selectedCalendarDate.split('-');
      const nextDay = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]) + 1);
      endDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    }

    // Build ISO strings with Z suffix (UTC time)
    const startTimeISO = `${startDate}T${String(utcStartHour).padStart(2, '0')}:00:00.000Z`;
    const endTimeISO = `${endDate}T${String(utcEndHour).padStart(2, '0')}:00:00.000Z`;

    const date = new Date(this.selectedCalendarDate + 'T00:00:00');

    const newSlot: any = {
      dayOfWeek: date.getDay(),
      startTime: startTimeISO,
      endTime: endTimeISO,
      isRecurring: false,
      price: this.defaultHourlyRate,
      date: this.selectedCalendarDate,
      startDateTime: startTimeISO,
      endDateTime: endTimeISO,
    };

    this.saveSlotToServerQuick(newSlot, slotKey);
  }

  /**
   * Quick save slot to server without modal
   */
  private saveSlotToServerQuick(newSlot: any, ...slotKeys: string[]): void {
    const currentAvailability = [...this.availabilitySlots];
    currentAvailability.push(newSlot as AvailabilitySlot);

    const extractTimeHHMM = (time: string): string => {
      if (!time) return '00:00';
      if (time.includes('T')) {
        const timePart = time.split('T')[1];
        if (timePart) return timePart.substring(0, 5);
      }
      if (time.length >= 5 && time[2] === ':') return time.substring(0, 5);
      return time;
    };

    const updateData = {
      availability: currentAvailability.map(slot => {
        const startTime = extractTimeHHMM(slot.startTime);
        const endTime = extractTimeHHMM(slot.endTime);
        
        const slotData: any = {
          dayOfWeek: slot.dayOfWeek,
          startTime: startTime,
          endTime: endTime,
          isRecurring: false,
          isAvailable: true,
        };
        
        if (slot.date) {
          slotData.specificDate = slot.date;
          slotData.date = slot.date;
        }
        if (slot.startDateTime) {
          slotData.startDateTime = slot.startDateTime;
        }
        
        return slotData;
      })
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        // Reload availability from backend to get proper IDs
        this.reloadAvailabilityAndRefresh(slotKeys);
      },
      error: (err) => {
        console.error('Error saving slot:', err);
        slotKeys.forEach(key => this.savingSlots.delete(key));
        
        // Refresh to show correct state
        if (this.selectedCalendarDate) {
          this.generateTimeSlotsForDate(this.selectedCalendarDate);
        }
        
        this.showErrorModal(
          this.translate.instant('common.error'),
          this.translate.instant('my_booked_page.messages.save_error')
        );
      }
    });
  }

  /**
   * Reload availability slots from backend and refresh the display
   */
  private reloadAvailabilityAndRefresh(slotKeys: string[]): void {
    this.facadeProfilesService.getTeacherProfile().subscribe({
      next: () => {
        // Data will come through the observable
      },
      error: (err) => {
        console.error('Failed to reload availability', err);
        slotKeys.forEach(key => this.savingSlots.delete(key));
        if (this.selectedCalendarDate) {
          this.generateTimeSlotsForDate(this.selectedCalendarDate);
        }
      },
    });

    this.facadeProfilesService.getTeacherProfileData$.pipe(
      filter((data) => !!data?.profile),
      take(1)
    ).subscribe((data) => {
      if (data.profile.availability) {
        this.availabilitySlots = data.profile.availability.map((slot: any) => {
          let dateStr: string | undefined;
          let displayStartTime: string | undefined;
          let displayEndTime: string | undefined;
          
          if (slot.startDateTime) {
            const meccaStart = this.luxonDate.fromServerTimeToMecca(slot.startDateTime);
            const meccaEnd = slot.endDateTime 
              ? this.luxonDate.fromServerTimeToMecca(slot.endDateTime)
              : meccaStart.plus({ hours: 1 });
            
            if (meccaStart.isValid) {
              dateStr = meccaStart.toFormat('yyyy-MM-dd');
              displayStartTime = meccaStart.toFormat('HH:mm');
              displayEndTime = meccaEnd.toFormat('HH:mm');
            }
          } else if (slot.date) {
            const startTimeStr = slot.startTime || slot.fromTime || '09:00';
            const endTimeStr = slot.endTime || slot.toTime || '10:00';
            dateStr = slot.date;
            displayStartTime = startTimeStr.substring(0, 5);
            displayEndTime = endTimeStr.substring(0, 5);
          }
          
          return {
            id: slot.id,
            dayOfWeek: slot.dayOfWeek ?? slot.day,
            startTime: displayStartTime || slot.startTime || slot.fromTime,
            endTime: displayEndTime || slot.endTime || slot.toTime,
            isRecurring: slot.isRecurring ?? false,
            isBooked: slot.isBooked ?? false,
            studentId: slot.studentId,
            studentName: slot.studentName,
            bookingId: slot.bookingId,
            price: slot.price,
            date: dateStr,
            startDateTime: slot.startDateTime,
            endDateTime: slot.endDateTime,
          };
        });
        
        console.log('Reloaded availability slots:', this.availabilitySlots.length);
      }
      
      this.updateCounts();
      this.updateCalendarLessons();
      
      // Refresh the time slots display
      if (this.selectedCalendarDate) {
        this.generateTimeSlotsForDate(this.selectedCalendarDate);
      }
      
      // Clear saving state
      slotKeys.forEach(key => this.savingSlots.delete(key));
    });
  }

  /**
   * Remove an availability slot
   */
  removeSlot(slot: TimeSlotDisplay): void {
    if (!this.selectedCalendarDate || !slot.isAvailable || slot.isBooked || !slot.slotId) return;
    
    const slotKey = `${this.selectedCalendarDate}-${slot.time}`;
    this.savingSlots.add(slotKey);
    slot.isSaving = true;

    // Remove from local list
    const updatedSlots = this.availabilitySlots.filter(s => s.id !== slot.slotId);

    const extractTimeHHMM = (time: string): string => {
      if (!time) return '00:00';
      if (time.includes('T')) {
        const timePart = time.split('T')[1];
        if (timePart) return timePart.substring(0, 5);
      }
      if (time.length >= 5 && time[2] === ':') return time.substring(0, 5);
      return time;
    };

    const updateData = {
      availability: updatedSlots.map(s => ({
        dayOfWeek: s.dayOfWeek,
        startTime: extractTimeHHMM(s.startTime),
        endTime: extractTimeHHMM(s.endTime),
        isRecurring: false,
        isAvailable: true,
        specificDate: s.date,
        date: s.date,
        startDateTime: s.startDateTime,
      }))
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.availabilitySlots = updatedSlots;
        this.updateCounts();
        this.updateCalendarLessons();
        
        if (this.selectedCalendarDate) {
          this.generateTimeSlotsForDate(this.selectedCalendarDate);
        }
        
        this.savingSlots.delete(slotKey);
      },
      error: (err) => {
        console.error('Error removing slot:', err);
        this.savingSlots.delete(slotKey);
        
        if (this.selectedCalendarDate) {
          this.generateTimeSlotsForDate(this.selectedCalendarDate);
        }
        
        this.showErrorModal(
          this.translate.instant('common.error'),
          this.translate.instant('my_booked_page.messages.delete_error')
        );
      }
    });
  }

  /**
   * Get selected day name for display
   */
  getSelectedDayName(): string {
    if (!this.selectedCalendarDate) return '';
    const date = new Date(this.selectedCalendarDate + 'T00:00:00');
    const dayIndex = date.getDay();
    return this.getDayName(dayIndex);
  }

  // ===== GROUP SESSION MODE METHODS =====

  /**
   * Toggle group session mode on/off
   */
  toggleGroupSessionMode(): void {
    this.isGroupSessionMode = !this.isGroupSessionMode;
  }

  /**
   * Close group session modal
   */
  closeGroupSessionModal(): void {
    this.showGroupSessionModal = false;
    this.selectedGroupSessionTime = '';
    this.groupSessionForm.reset({
      title: '',
      price: this.defaultHourlyRate,
      maxParticipants: 10,
      description: '',
    });
  }

  /**
   * Create group session from modal
   */
  createGroupSession(): void {
    if (this.groupSessionForm.invalid || !this.selectedCalendarDate || !this.selectedGroupSessionTime) {
      return;
    }

    this.isSavingGroupSession = true;

    const [hours] = this.selectedGroupSessionTime.split(':').map(Number);

    // Check for conflicts with existing availability or booked slots
    const conflictingSlot = this.allTimeSlots.find(s => 
      s.time === this.selectedGroupSessionTime && (s.isAvailable || s.isBooked)
    );
    if (conflictingSlot) {
      this.isSavingGroupSession = false;
      this.showErrorModal(
        this.translate.instant('common.error'),
        this.translate.instant('my_booked_page.messages.conflict_error')
      );
      return;
    }

    // Build ISO string with Z suffix to prevent timezone conversion by JSON parser
    const scheduledDateTimeISO = `${this.selectedCalendarDate}T${String(hours).padStart(2, '0')}:00:00.000Z`;

    const formValue = this.groupSessionForm.value;
    const groupSessionData = {
      title: formValue.title,
      price: formValue.price,
      duration: 1, // Fixed 1 hour
      scheduledDateTime: scheduledDateTimeISO,
      description: formValue.description || '',
      maxParticipants: formValue.maxParticipants,
      createMeetingRoomImmediately: true,
    };

    this.repo.CreateGroupSession(groupSessionData).subscribe({
      next: (response) => {
        this.isSavingGroupSession = false;
        this.closeGroupSessionModal();
        
        // Refresh group sessions list
        this.fetchGroupSessions();
        
        // Update calendar
        this.updateCalendarLessons();
        
        // Refresh time slots
        if (this.selectedCalendarDate) {
          this.generateTimeSlotsForDate(this.selectedCalendarDate);
        }

        this.showSuccessModal(
          this.translate.instant('common.success'),
          this.translate.instant('my_booked_page.messages.group_session_created')
        );
      },
      error: (err) => {
        console.error('Error creating group session:', err);
        this.isSavingGroupSession = false;
        this.showErrorModal(
          this.translate.instant('common.error'),
          err.error?.message || this.translate.instant('my_booked_page.messages.group_session_error')
        );
      }
    });
  }

  /**
   * Fetch group sessions from API and update bookings list
   */
  private fetchGroupSessions(): void {
    this.repo.getGroupSessionsByTeacher().subscribe({
      next: (resp: any) => {
        const sessions: any[] | null = Array.isArray(resp)
          ? resp
          : resp && Array.isArray((resp as any).data)
          ? (resp as any).data
          : null;
        if (sessions) {
          const mapped = sessions.map((s: any) =>
            this.mapGroupSessionToBooking(s)
          );
          // merge: remove any existing group entries, then append mapped
          const others = this.bookings.filter((b) => b.type !== 'group');
          this.bookings = [...others, ...mapped];
          this.updateCounts();
        }
      },
      error: (err) => {
        console.error('Failed to load group sessions', err);
      },
    });
  }

  private mapApiToBooking(a: any): Booking {
    const rawDt = a.scheduledDateTime || a.scheduled_date_time || a.scheduledAt;
    return {
      id: a.id,
      avatar: '/assets/images/blank-avatar.webp',
      name: a.studentName || a.student_name || a.student || 'Student',
      email: a.studentEmail || a.student_email || a.studentEmail || '',
      title: a.lessonTitle || a.lesson_title || a.lessonTitle || 'Lesson',
      datetime: this.formatDate(rawDt),
      rawDateTime: rawDt || null,
      amount: `$${Number(a.amountPaid ?? a.amount ?? 0).toFixed(2)}`,
      status: this.statusLabel(a.status),
      // attempt to detect lesson type from api fields
      type:
        a.isGroupSession || a.type === 'group' || a.lessonType === 'group'
          ? 'group'
          : 'individual',
      meetingUrl: a.meetingRoomUrl ?? a.meeting_url ?? null,
      notes: a.notes ?? null,
    };
  }

  // returns bookings filtered by current view
  get filteredBookings(): Booking[] {
    return this.bookings.filter((b) => (b.type || 'individual') === this.view);
  }

  get individualBookings(): Booking[] {
    return this.bookings.filter(
      (b) => (b.type || 'individual') === 'individual'
    );
  }

  get groupBookings(): Booking[] {
    return this.bookings.filter((b) => (b.type || 'individual') === 'group');
  }

  get emptyMessage(): string {
    return this.view === 'individual'
      ? 'my_booked_page.empty.individual_title'
      : 'my_booked_page.empty.group_title';
  }

  private formatDate(dt?: string): string {
    if (!dt) return '';
    const parsed = this.luxonDate.fromServerTimeToMecca(dt);
    if (!parsed.isValid) return dt;
    
    return parsed.toFormat('dd/MM HH:mm');
  }

  // Refresh date formatting for all bookings when language/timezone changes
  private refreshDateFormatting(): void {
    this.bookings = this.bookings.map((b) => ({
      ...b,
      datetime: b.rawDateTime ? this.formatDate(b.rawDateTime) : b.datetime,
    }));
    
    // Update counts
    this.updateCounts();
    
    // Refresh calendar lessons to apply GMT offset to all events
    this.updateCalendarLessons();
  }

  /**
   * Format datetime string for calendar display.
   * Since times are now stored as Mecca timezone directly, no conversion needed.
   */
  private applyGmtOffsetToDatetime(dateStr: string): string {
    if (!dateStr) return dateStr;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      // Use UTC methods since server stores Mecca time as UTC representation
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    } catch {
      return dateStr;
    }
  }

  /**
   * Parse a date coming from the API which is expected to be UTC+0.
   * Returns a Luxon DateTime in Mecca timezone.
   */
  private parseApiDateAsUTC(value: any): Date | null {
    if (!value) return null;
    const parsed = this.luxonDate.parseAny(value);
    return parsed.isValid ? parsed.toJSDate() : null;
  }

  private statusLabel(code: any): string {
    return getIndividualStatusLabel(Number(code));
  }

  private mapGroupSessionToBooking(s: any): Booking {
    return {
      id: s.id,
      avatar: '/assets/images/blank-avatar.webp',
      name: s.teacherName || 'Group Session',
      email: '',
      title: s.title || 'Group Session',
      datetime: this.formatDate(s.scheduledDateTime),
      rawDateTime: s.scheduledDateTime || null,
      amount: `$${Number(s.price ?? 0).toFixed(2)}`,
      rawStatus: Number(s.status ?? 0),
      status: this.mapGroupStatus(Number(s.status ?? 0)),
      type: 'group',
      meetingUrl: s.meetingUrls?.broadcaster ?? s.meetingUrls?.viewer ?? null,
      currentParticipants: Number(
        s.currentParticipants ?? s.current_participants ?? 0
      ),
      maxParticipants: Number(
        s.maxParticipants ?? s.max_participants ?? s.maxParticipants ?? 0
      ),
      notes: s.description ?? null,
    };
  }

  private mapGroupStatus(n: number): string {
    return getGroupStatusLabel(n);
  }

  // Cached calendar lessons to avoid recalculating on every change detection
  private _calendarLessons: LessonEvent[] = [];

  // Convert bookings AND availability to calendar events
  private updateCalendarLessons(): void {
    // First, map bookings - only include those with valid rawDateTime
    const bookingEvents: LessonEvent[] = this.bookings
      .filter((b) => {
        // Only include bookings with valid date for calendar
        if (!b.rawDateTime) {
          console.warn('Booking missing rawDateTime, skipping from calendar:', b.id, b.title);
          return false;
        }
        return true;
      })
      .map((b) => ({
        id: b.id.toString(),
        title: b.title,
        start: this.applyGmtOffsetToDatetime(b.rawDateTime!), // Apply GMT offset
        type: (b.type as 'individual' | 'group') || 'individual',
        status: this.mapStatusToCalendar(b.status),
        studentName: b.name,
        price: parseFloat(b.amount.replace('$', '')),
        maxStudents: b.maxParticipants || undefined,
        currentStudents: b.currentParticipants || undefined,
        description: b.notes || undefined,
      }));
    
    console.log('Calendar - Total bookings:', this.bookings.length, 'Valid for calendar:', bookingEvents.length);

    // Create a set of booked time slots for quick lookup (to filter out overlapping availability)
    // Only include confirmed/scheduled bookings, not cancelled ones
    const bookedTimeSlots = new Set<string>();
    this.bookings
      .filter(b => b.rawDateTime && b.status.toLowerCase() !== 'cancelled')
      .forEach(b => {
        const startStr = this.applyGmtOffsetToDatetime(b.rawDateTime!);
        if (startStr) {
          // Store just the date and time portion (YYYY-MM-DDTHH:mm)
          const key = startStr.substring(0, 16);
          bookedTimeSlots.add(key);
        }
      });
    console.log('Booked time slots:', Array.from(bookedTimeSlots));

    // Then, map availability slots to events
    // For recurring slots, generate events for multiple weeks
    const availabilityEvents: LessonEvent[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    this.availabilitySlots.forEach((slot, index) => {
      if (slot.isRecurring) {
        // For recurring slots, startTime/endTime from API are full ISO datetime
        // We need to extract the time part and apply GMT offset
        
        let startTimeStr: string;
        let endTimeStr: string;
        
        // Check if startTime is a full ISO datetime (contains 'T')
        if (slot.startTime && slot.startTime.includes('T')) {
          // Apply GMT offset to get the display time
          const adjustedStart = this.applyGmtOffsetToDatetime(slot.startTime);
          const adjustedEnd = this.applyGmtOffsetToDatetime(slot.endTime);
          
          // Extract just the time part (HH:mm)
          startTimeStr = adjustedStart.split('T')[1]?.substring(0, 5) || '00:00';
          endTimeStr = adjustedEnd.split('T')[1]?.substring(0, 5) || '00:00';
        } else {
          // Legacy format - time strings like "16:00"
          startTimeStr = slot.startTime || '00:00';
          endTimeStr = slot.endTime || '00:00';
        }
        
        // Generate events for the next 8 weeks for recurring slots
        for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
          const slotDate = this.getNextDateForDay(slot.dayOfWeek, weekOffset);
          // Skip if the date is in the past
          if (slotDate < today) continue;
          
          // Use local date string
          const year = slotDate.getFullYear();
          const month = (slotDate.getMonth() + 1).toString().padStart(2, '0');
          const day = slotDate.getDate().toString().padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          
          // Handle end time at midnight (00:00) - treat as next day
          let endDateStr = dateStr;
          if (endTimeStr === '00:00' || endTimeStr === '00:00:00') {
            const nextDay = new Date(slotDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextYear = nextDay.getFullYear();
            const nextMonth = (nextDay.getMonth() + 1).toString().padStart(2, '0');
            const nextDayNum = nextDay.getDate().toString().padStart(2, '0');
            endDateStr = `${nextYear}-${nextMonth}-${nextDayNum}`;
          }

          // Skip if this time slot is already booked
          const slotKey = `${dateStr}T${startTimeStr}`;
          if (bookedTimeSlots.has(slotKey)) {
            console.log(`Skipping recurring availability - already booked: ${slotKey}`);
            continue;
          }

          availabilityEvents.push({
            id: `avail-${slot.id || index}-week${weekOffset}`,
            title: slot.isBooked ? (slot.studentName || this.translate.instant('my_booked_page.booked')) : this.translate.instant('my_booked_page.available'),
            start: `${dateStr}T${startTimeStr}`,
            end: `${endDateStr}T${endTimeStr}`,
            type: 'individual' as const,
            status: slot.isBooked ? 'booked' as const : 'available' as const,
            studentName: slot.studentName,
            price: slot.price,
            description: this.translate.instant('my_booked_page.recurring'),
          });
        }
      } else {
        // Non-recurring: use startTime/endTime from API (they contain full ISO datetime)
        console.log(`Processing non-recurring slot: id=${slot.id}, startTime=${slot.startTime}, endTime=${slot.endTime}, isRecurring=${slot.isRecurring}`);
        
        // Check if startTime is a full ISO datetime (contains 'T')
        if (slot.startTime && slot.startTime.includes('T')) {
          // startTime is a full ISO datetime like "2026-01-06T16:00:00Z"
          // Apply GMT offset for display
          const startStr = this.applyGmtOffsetToDatetime(slot.startTime);
          const endStr = this.applyGmtOffsetToDatetime(slot.endTime);
          
          if (startStr && endStr) {
            // Check if it's in the past
            const startDate = new Date(startStr);
            if (startDate < today) {
              console.log(`Skipping past slot: ${startStr}`);
              return;
            }
            
            // Skip if this time slot is already booked
            const slotKey = startStr.substring(0, 16);
            if (bookedTimeSlots.has(slotKey)) {
              console.log(`Skipping availability - already booked: ${slotKey}`);
              return;
            }
            
            availabilityEvents.push({
              id: `avail-${slot.id || index}`,
              title: slot.isBooked ? (slot.studentName || this.translate.instant('my_booked_page.booked')) : this.translate.instant('my_booked_page.available'),
              start: startStr,
              end: endStr,
              type: 'individual' as const,
              status: slot.isBooked ? 'booked' as const : 'available' as const,
              studentName: slot.studentName,
              price: slot.price,
            });
            console.log(`Non-recurring event added with GMT offset: start=${startStr}, end=${endStr}`);
            return;
          }
        }
        
        // Fallback: use date + startTime/endTime as simple time strings
        // After loading, these should already be in Mecca timezone
        let slotDate: Date | null = null;
        let dateStr: string = '';
        
        if (slot.date) {
          // Date should be in YYYY-MM-DD format (already converted to Mecca time during load)
          dateStr = slot.date;
          const parts = dateStr.split('-').map(Number);
          if (parts.length === 3 && parts.every(p => !isNaN(p))) {
            const [year, month, day] = parts;
            slotDate = new Date(year, month - 1, day);
          }
          
          // Only log if slotDate is valid
          if (slotDate && !isNaN(slotDate.getTime())) {
            console.log(`Non-recurring slot parsed: dateStr=${dateStr}, startTime=${slot.startTime}, endTime=${slot.endTime}`);
          } else {
            console.warn(`Failed to parse slot date: ${slot.date}`);
            return; // Skip this slot
          }
        } else {
          // Fallback: calculate from dayOfWeek for current week only
          const currentDayOfWeek = today.getDay();
          const daysUntilSlot = (slot.dayOfWeek - currentDayOfWeek + 7) % 7;
          slotDate = new Date(today);
          slotDate.setDate(today.getDate() + daysUntilSlot);
          
          const year = slotDate.getFullYear();
          const month = (slotDate.getMonth() + 1).toString().padStart(2, '0');
          const day = slotDate.getDate().toString().padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        }
        
        // Skip if slotDate is null or invalid
        if (!slotDate || isNaN(slotDate.getTime())) {
          console.warn('Skipping slot with invalid date');
          return;
        }
        
        // Skip if the date is in the past
        if (slotDate < today) return;
        
        // Extract time from slot.startTime and slot.endTime (should be HH:mm format here)
        const startTimeStr = slot.startTime.includes(':') ? slot.startTime.split('T').pop()?.substring(0, 5) || slot.startTime : slot.startTime;
        const endTimeStr = slot.endTime.includes(':') ? slot.endTime.split('T').pop()?.substring(0, 5) || slot.endTime : slot.endTime;
        
        // Handle end time at midnight (00:00) - treat as next day
        let endDateStr = dateStr;
        if (endTimeStr === '00:00' || endTimeStr === '00:00:00') {
          const nextDay = new Date(slotDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const nextYear = nextDay.getFullYear();
          const nextMonth = (nextDay.getMonth() + 1).toString().padStart(2, '0');
          const nextDayNum = nextDay.getDate().toString().padStart(2, '0');
          endDateStr = `${nextYear}-${nextMonth}-${nextDayNum}`;
        }

        // Skip if this time slot is already booked
        const fallbackSlotKey = `${dateStr}T${startTimeStr}`;
        if (bookedTimeSlots.has(fallbackSlotKey)) {
          console.log(`Skipping availability (fallback) - already booked: ${fallbackSlotKey}`);
          return;
        }

        availabilityEvents.push({
          id: `avail-${slot.id || index}`,
          title: slot.isBooked ? (slot.studentName || this.translate.instant('my_booked_page.booked')) : this.translate.instant('my_booked_page.available'),
          start: `${dateStr}T${startTimeStr}`,
          end: `${endDateStr}T${endTimeStr}`,
          type: 'individual' as const,
          status: slot.isBooked ? 'booked' as const : 'available' as const,
          studentName: slot.studentName,
          price: slot.price,
        });
        console.log(`Non-recurring event added (fallback): start=${dateStr}T${startTimeStr}, end=${endDateStr}T${endTimeStr}`);
      }
    });

    this._calendarLessons = [...bookingEvents, ...availabilityEvents];
  }

  // Helper to get the next date for a specific day of week
  private getNextDateForDay(dayOfWeek: number, weekOffset: number = 0): Date {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const daysUntilSlot = (dayOfWeek - currentDayOfWeek + 7) % 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilSlot + (weekOffset * 7));
    targetDate.setHours(0, 0, 0, 0);
    return targetDate;
  }

  get calendarLessons(): LessonEvent[] {
    return this._calendarLessons;
  }

  private mapStatusToCalendar(status: string): 'available' | 'booked' | 'completed' {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'open':
      case 'full':
        return 'booked';
      case 'completed':
        return 'completed';
      default:
        return 'booked';
    }
  }

  onCalendarEventClick(event: LessonEvent): void {
    // Check if it's an availability slot or a booking
    const booking = this.bookings.find((b) => b.id.toString() === event.id);
    const availSlot = this.availabilitySlots.find((s) => s.id?.toString() === event.id || `avail-${s.id}` === event.id);
    
    if (availSlot) {
      this.openSlotDetailsModal(availSlot);
    } else if (booking) {
      this.openBookingDetailsModal(booking);
    }
  }

  onCalendarEventDrop(arg: any): void {
    const event = arg.event;
    
    // Check if it's an availability slot
    // We check extendedProps or ID pattern
    let slotId = event.id;
    if (slotId.startsWith('avail-')) {
      slotId = slotId.substring(6);
    } else if (!this.availabilitySlots.some(s => s.id?.toString() === slotId)) {
      // Not an availability slot (likely a booking)
      arg.revert();
      return;
    }
    
    const slotIndex = this.availabilitySlots.findIndex(s => s.id?.toString() === slotId || s.id === parseInt(slotId));
    if (slotIndex === -1) {
      arg.revert();
      return;
    }

    const slot = this.availabilitySlots[slotIndex];
    
    // Calculate new times
    const newStart = event.start;
    const newEnd = event.end;
    
    if (!newStart || !newEnd) {
      arg.revert();
      return;
    }

    // Format to HH:mm
    const formatTime = (date: Date) => {
      return date.toTimeString().substring(0, 5);
    };

    const newStartTime = formatTime(newStart);
    const newEndTime = formatTime(newEnd);
    const newDayOfWeek = newStart.getDay();

    // Create updated slot object
    const updatedSlot = { ...slot };
    updatedSlot.startTime = newStartTime;
    updatedSlot.endTime = newEndTime;
    updatedSlot.dayOfWeek = newDayOfWeek;

    // Call API to update
    this.updateAvailabilitySlot(updatedSlot, arg.revert);
  }

  onCalendarEventResize(arg: any): void {
    const event = arg.event;
    
    let slotId = event.id;
    if (slotId.startsWith('avail-')) {
      slotId = slotId.substring(6);
    } else if (!this.availabilitySlots.some(s => s.id?.toString() === slotId)) {
      arg.revert();
      return;
    }
    
    const slotIndex = this.availabilitySlots.findIndex(s => s.id?.toString() === slotId || s.id === parseInt(slotId));
    if (slotIndex === -1) {
      arg.revert();
      return;
    }

    const slot = this.availabilitySlots[slotIndex];
    
    const newStart = event.start;
    const newEnd = event.end;
    
    if (!newStart || !newEnd) {
      arg.revert();
      return;
    }

    const formatTime = (date: Date) => {
      return date.toTimeString().substring(0, 5);
    };

    const newStartTime = formatTime(newStart);
    const newEndTime = formatTime(newEnd);

    const updatedSlot = { ...slot };
    updatedSlot.startTime = newStartTime;
    updatedSlot.endTime = newEndTime;

    this.updateAvailabilitySlot(updatedSlot, arg.revert);
  }

  onCalendarSelect(arg: any): void {
    const start = arg.start;
    const end = arg.end;
    
    // Format date and times
    const year = start.getFullYear();
    const month = (start.getMonth() + 1).toString().padStart(2, '0');
    const day = start.getDate().toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const formatTime = (date: Date) => {
      return date.toTimeString().substring(0, 5);
    };
    
    const startTime = formatTime(start);
    const endTime = formatTime(end);
    
    // Open modal
    this.openAddAvailabilityModal(dateStr, startTime, endTime);
  }

  private updateAvailabilitySlot(slot: AvailabilitySlot, revertFunc: () => void): void {
    const updatedSlots = this.availabilitySlots.map(s => {
      if (s.id === slot.id) {
        return slot;
      }
      return s;
    });

    // Prepare data for API
    const availabilityData = updatedSlots.map(s => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      isRecurring: s.isRecurring,
      price: s.price
    }));

    const updateData = {
      availability: availabilityData
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        // Success
        this.availabilitySlots = updatedSlots;
        this.updateCounts();
        this.updateCalendarLessons();
        this.showSuccessModal(this.translate.instant('common.success'), this.translate.instant('my_booked_page.messages.slot_updated'));
      },
      error: (err) => {
        console.error('Error updating slot:', err);
        revertFunc();
        this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.save_error'));
      }
    });
  }

  onCalendarDateClick(dateInfo: any): void {
    // Open add availability modal with pre-filled date and time
    let dateStr = '';
    let timeStr = '';
    let clickedDate: Date | null = null;

    // dateInfo can be a Date object from FullCalendar's dateClick
    if (dateInfo instanceof Date) {
      clickedDate = dateInfo;
      const year = dateInfo.getFullYear();
      const month = (dateInfo.getMonth() + 1).toString().padStart(2, '0');
      const day = dateInfo.getDate().toString().padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
      // Extract local time from the Date object
      const hours = dateInfo.getHours().toString().padStart(2, '0');
      const minutes = dateInfo.getMinutes().toString().padStart(2, '0');
      timeStr = `${hours}:${minutes}`;
    } else if (typeof dateInfo === 'string') {
      // Check if it's a datetime string (contains 'T')
      if (dateInfo.includes('T')) {
        const parts = dateInfo.split('T');
        dateStr = parts[0];
        timeStr = parts[1]?.substring(0, 5) || ''; // Get HH:mm
        clickedDate = new Date(dateInfo);
      } else {
        dateStr = dateInfo;
        clickedDate = new Date(dateInfo);
      }
    } else if (dateInfo) {
      // Handle object with dateStr or date property
      if (dateInfo.dateStr) {
        if (dateInfo.dateStr.includes('T')) {
          const parts = dateInfo.dateStr.split('T');
          dateStr = parts[0];
          timeStr = parts[1]?.substring(0, 5) || '';
          clickedDate = new Date(dateInfo.dateStr);
        } else {
          dateStr = dateInfo.dateStr;
          clickedDate = new Date(dateInfo.dateStr);
        }
      } else if (dateInfo.date instanceof Date) {
        clickedDate = dateInfo.date;
        const year = dateInfo.date.getFullYear();
        const month = (dateInfo.date.getMonth() + 1).toString().padStart(2, '0');
        const day = dateInfo.date.getDate().toString().padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
        const hours = dateInfo.date.getHours().toString().padStart(2, '0');
        const minutes = dateInfo.date.getMinutes().toString().padStart(2, '0');
        timeStr = `${hours}:${minutes}`;
      }
    }

    // Check if the selected date is in the past
    if (clickedDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      clickedDate.setHours(0, 0, 0, 0);
      if (clickedDate < today) {
        this.showErrorModal(
          this.translate.instant('common.error'), 
          this.translate.instant('my_booked_page.messages.past_date_error')
        );
        return;
      }
    }

    // Calculate end time (60 minutes after start, except last slot ends at 23:59)
    let endTimeStr = '';
    if (timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      // If starting at 23:00, end at 23:59 (last slot of the day)
      if (hours === 23 && minutes === 0) {
        endTimeStr = '23:59';
      } else {
        // Add 60 minutes to get end time
        let endMinutes = minutes + 60;
        let endHours = hours;
        if (endMinutes >= 60) {
          endMinutes -= 60;
          endHours = (endHours + 1) % 24;
        }
        endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
      }
    }

    this.openAddAvailabilityModal(dateStr, timeStr, endTimeStr);
  }

  trackById(index: number, item: Booking) {
    return item.id;
  }

  joinLesson(b: Booking) {
    if (b.type === 'individual') {
      // For individual sessions, get the session URL from API
      this.repo.getSessionUrl(b.id.toString()).subscribe({
        next: (response: any) => {
          if (response && response.meetingRoomUrl) {
            window.open(response.meetingRoomUrl, '_blank');
          } else {
            console.error('Invalid session URL response', response);
            alert('Failed to get session URL');
          }
        },
        error: (err) => {
          console.error('Error getting session URL', err);
          alert('Error joining lesson');
        },
      });
    } else {
      // For group sessions, keep existing behavior
      if (b.meetingUrl) {
        window.open(b.meetingUrl, '_blank');
        return;
      }
      // fallback: placeholder action
      console.log('Joining lesson', b.id, b.title);
      alert(`Joining lesson: ${b.title}`);
    }
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
    this.profileSubscription?.unsubscribe();
    if (this.modalAutoCloseTimer) {
      clearTimeout(this.modalAutoCloseTimer);
    }
  }

  // ===== AVAILABILITY MODAL METHODS =====

  openAddAvailabilityModal(prefilledDate: string = '', prefilledFromTime: string = '', prefilledToTime: string = ''): void {
    this.addAvailabilityForm.reset({
      date: prefilledDate || '',
      fromTime: prefilledFromTime || '09:00',
      toTime: prefilledToTime || '10:00',
      price: this.defaultHourlyRate,
      isRecurring: false,
    });
    this.showAddAvailabilityModal = true;
  }

  closeAddAvailabilityModal(): void {
    this.showAddAvailabilityModal = false;
  }

  saveNewAvailability(): void {
    if (this.addAvailabilityForm.invalid) return;

    const formValue = this.addAvailabilityForm.value;

    // Debug: Log form values
    console.log('Form values:', formValue);

    // Validate that times are present
    if (!formValue.fromTime || !formValue.toTime) {
      this.showErrorModal(
        this.translate.instant('common.error'), 
        'Start time and end time are required'
      );
      return;
    }

    // Validate that fromTime is before toTime
    // Special case: "00:00" as end time means midnight (end of day), so it's valid
    // We need to convert "00:00" to "24:00" for comparison purposes
    const fromTimeForCompare = formValue.fromTime;
    const toTimeForCompare = formValue.toTime === '00:00' ? '24:00' : formValue.toTime;
    
    if (fromTimeForCompare >= toTimeForCompare) {
      console.error('Invalid time range:', formValue.fromTime, '>=', formValue.toTime);
      this.showErrorModal(
        this.translate.instant('common.error'), 
        this.translate.instant('my_booked_page.messages.invalid_time_range') || 'Start time must be before end time'
      );
      return;
    }

    // Parse the date correctly to avoid timezone issues
    // formValue.date is in format "YYYY-MM-DD"
    const dateParts = formValue.date.split('-');
    const selectedDate = new Date(
      parseInt(dateParts[0]), 
      parseInt(dateParts[1]) - 1, // Month is 0-indexed
      parseInt(dateParts[2])
    );
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      this.showErrorModal(
        this.translate.instant('common.error'), 
        this.translate.instant('my_booked_page.messages.past_date_error')
      );
      return;
    }

    // Convert date to day of week (using local date)
    const dayOfWeek = selectedDate.getDay();

    // Check for conflicts
    if (this.hasTimeConflict(dayOfWeek, formValue.fromTime, formValue.toTime)) {
      this.showErrorModal(
        this.translate.instant('common.error'), 
        this.translate.instant('my_booked_page.messages.conflict_error')
      );
      return;
    }

    // For non-recurring slots, include the specific date
    // For recurring slots, only dayOfWeek is needed
    const newSlot: any = {
      dayOfWeek: dayOfWeek,
      startTime: formValue.fromTime,
      endTime: formValue.toTime,
      isRecurring: formValue.isRecurring,
      price: this.defaultHourlyRate, // Always use default hourly rate
    };
    
    // Add specific date for non-recurring slots
    if (!formValue.isRecurring) {
      // Convert selected GMT offset time to UTC for storage
      // Times are stored as Mecca timezone directly (no UTC conversion)
      // The user enters time in Mecca timezone, send as-is
      
      const [startHours, startMinutes] = formValue.fromTime.split(':').map(Number);
      const [endHours, endMinutes] = formValue.toTime.split(':').map(Number);
      
      // Build a Date object representing the entered time in Mecca timezone
      // We use UTC methods but treat the values as Mecca time
      const meccaStartDateTime = new Date(Date.UTC(
        parseInt(dateParts[0]),  // year
        parseInt(dateParts[1]) - 1,  // month (0-indexed)
        parseInt(dateParts[2]),  // day
        startHours,
        startMinutes,
        0
      ));
      
      // Store as ISO string (representing Mecca time, not UTC)
      newSlot.startDateTime = meccaStartDateTime.toISOString();
      newSlot.date = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`; // Keep original date
      
      // For display in calendar, startTime and endTime should also be the full ISO datetime
      // updateCalendarLessons() checks if startTime.includes('T') to detect ISO format
      newSlot.startTime = meccaStartDateTime.toISOString();
      
      // Handle end time
      let endDay = parseInt(dateParts[2]);
      if (formValue.toTime === '00:00') {
        // Midnight means next day
        endDay += 1;
      }
      
      const meccaEndDateTime = new Date(Date.UTC(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        endDay,
        endHours,
        endMinutes,
        0
      ));
      newSlot.endDateTime = meccaEndDateTime.toISOString();
      newSlot.endTime = meccaEndDateTime.toISOString();
      
      console.log('Saving slot - Mecca time:', formValue.date, formValue.fromTime, 'to', formValue.toTime);
      console.log('Stored as:', newSlot.startTime, 'to', newSlot.endTime);
    }

    // If recurring, show confirmation modal first
    if (formValue.isRecurring) {
      this.pendingRecurringSlot = newSlot;
      this.showAddAvailabilityModal = false;
      this.showRecurringConfirmModal = true;
      return;
    }

    // Not recurring, save directly
    this.saveSlotToServer(newSlot);
  }

  // Confirm recurring and save
  confirmRecurringSlot(): void {
    if (!this.pendingRecurringSlot) return;
    this.showRecurringConfirmModal = false;
    this.saveSlotToServer(this.pendingRecurringSlot);
  }

  // Cancel recurring confirmation
  cancelRecurringConfirm(): void {
    this.showRecurringConfirmModal = false;
    this.pendingRecurringSlot = null;
    // Reopen the add modal
    this.showAddAvailabilityModal = true;
  }

  // Save slot to server
  private saveSlotToServer(newSlot: any): void {
    this.isSavingAvailability = true;

    // Get current availability and add new slot
    const currentAvailability = [...this.availabilitySlots];
    currentAvailability.push(newSlot as AvailabilitySlot);

    // Helper function to normalize time to comparable format
    const normalizeTime = (time: string): string => {
      if (!time) return '00:00:00';
      
      // If it's an ISO datetime string (contains 'T'), extract time part
      if (time.includes('T')) {
        const timePart = time.split('T')[1];
        if (timePart) {
          return timePart.substring(0, 8); // Get HH:mm:ss
        }
      }
      
      // If already in HH:mm:ss format, return as-is
      if (time.length === 8 && time[2] === ':' && time[5] === ':') {
        return time;
      }
      // If in HH:mm format, append :00
      if (time.length === 5 && time[2] === ':') {
        return time + ':00';
      }
      return time;
    };
    
    // Helper to extract just HH:mm from time string (for API)
    const extractTimeHHMM = (time: string): string => {
      if (!time) return '00:00';
      
      // If it's an ISO datetime string (contains 'T'), extract time part
      if (time.includes('T')) {
        const timePart = time.split('T')[1];
        if (timePart) {
          return timePart.substring(0, 5); // Get HH:mm
        }
      }
      
      // If already in HH:mm or HH:mm:ss format
      if (time.length >= 5 && time[2] === ':') {
        return time.substring(0, 5);
      }
      return time;
    };

    // Helper to check if time range is valid (handles midnight as end time)
    const isValidTimeRange = (startTime: string, endTime: string): boolean => {
      const startNorm = normalizeTime(startTime);
      const endNorm = normalizeTime(endTime);
      // Treat 00:00:00 end time as midnight (24:00:00) for comparison
      const effectiveEnd = endNorm === '00:00:00' ? '24:00:00' : endNorm;
      return startNorm < effectiveEnd;
    };

    // Prepare data for API - filter out any invalid slots
    const validSlots = currentAvailability.filter(slot => {
      const isValid = isValidTimeRange(slot.startTime, slot.endTime);
      if (!isValid) {
        console.warn('Skipping invalid slot:', slot, 'startTime:', slot.startTime, 'endTime:', slot.endTime);
      }
      return isValid;
    });

    const updateData = {
      availability: validSlots.map(slot => {
        // Extract HH:mm format for API (handles both ISO datetime and HH:mm)
        const startTime = extractTimeHHMM(slot.startTime);
        const endTime = extractTimeHHMM(slot.endTime);
        
        // Validate that we have actual times
        if (!startTime.includes(':') || !endTime.includes(':')) {
          console.error('Invalid time format in slot:', slot);
        }
        
        const slotData: any = {
          dayOfWeek: slot.dayOfWeek,
          startTime: startTime,
          endTime: endTime,
          // isRecurring: if explicitly set, use that value; otherwise check if date fields exist
          isRecurring: slot.isRecurring !== undefined ? slot.isRecurring : !((slot as any).date || (slot as any).startDateTime),
          isAvailable: true, // Always true when saving availability
        };
        // Include date/datetime for non-recurring slots
        if (!slot.isRecurring && (slot as any).date) {
          slotData.date = (slot as any).date;
          slotData.startDateTime = (slot as any).startDateTime;
          slotData.endDateTime = (slot as any).endDateTime;
        }
        return slotData;
      }),
    };

    // Debug: Log the data being sent
    console.log('Saving availability slots:', JSON.stringify(updateData, null, 2));
    console.log('Existing slots:', this.availabilitySlots);
    console.log('New slot:', newSlot);
    console.log('Valid slots count:', validSlots.length, 'Total count:', currentAvailability.length);
    
    // Log each slot's times for debugging
    updateData.availability.forEach((slot: any, index: number) => {
      console.log(`Slot ${index}: day=${slot.dayOfWeek}, start=${slot.startTime}, end=${slot.endTime}, isRecurring=${slot.isRecurring}, date=${slot.date}, startDateTime=${slot.startDateTime}`);
    });

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.isSavingAvailability = false;
        this.showAddAvailabilityModal = false;
        this.pendingRecurringSlot = null;
        this.availabilitySlots = currentAvailability;
        this.updateCounts();
        this.updateCalendarLessons();
        
        const message = newSlot.isRecurring 
          ? this.translate.instant('my_booked_page.messages.recurring_added', { day: this.getDayName(newSlot.dayOfWeek) })
          : this.translate.instant('my_booked_page.messages.slot_added');
        this.showSuccessModal(this.translate.instant('common.success'), message);
      },
      error: (err) => {
        this.isSavingAvailability = false;
        this.pendingRecurringSlot = null;
        console.error('Error saving availability:', err);
        console.error('Error details:', err?.error?.message || err?.error?.errors || err?.message);
        const errorMessage = err?.error?.message || err?.error?.errors?.join(', ') || this.translate.instant('my_booked_page.messages.save_error');
        this.showErrorModal(this.translate.instant('common.error'), errorMessage);
      },
    });
  }

  // Weekly Pattern Modal
  openWeeklyPatternModal(): void {
    // Reset to default state
    this.weekDays.forEach(day => {
      day.enabled = false;
      day.slots = [{ fromTime: '09:00', toTime: '10:00' }];
    });

    // Load existing pattern from availability
    this.availabilitySlots.forEach((slot) => {
      const dayIndex = slot.dayOfWeek;
      if (dayIndex >= 0 && dayIndex < 7) {
        this.weekDays[dayIndex].enabled = true;
        const existingSlot = this.weekDays[dayIndex].slots.find(
          s => s.fromTime === slot.startTime && s.toTime === slot.endTime
        );
        if (!existingSlot && slot.startTime && slot.endTime) {
          this.weekDays[dayIndex].slots.push({
            fromTime: slot.startTime,
            toTime: slot.endTime,
          });
        }
      }
    });

    this.showWeeklyPatternModal = true;
  }

  closeWeeklyPatternModal(): void {
    this.showWeeklyPatternModal = false;
  }

  onWeeklyDayToggle(dayIndex: number): void {
    this.weekDays[dayIndex].enabled = !this.weekDays[dayIndex].enabled;
    if (this.weekDays[dayIndex].enabled && this.weekDays[dayIndex].slots.length === 0) {
      this.weekDays[dayIndex].slots = [{ fromTime: '09:00', toTime: '10:00' }];
    }
  }

  addWeeklySlot(dayIndex: number): void {
    if (this.weekDays[dayIndex].slots.length < 5) {
      this.weekDays[dayIndex].slots.push({ fromTime: '09:00', toTime: '10:00' });
    }
  }

  removeWeeklySlot(dayIndex: number, slotIndex: number): void {
    if (this.weekDays[dayIndex].slots.length > 1) {
      this.weekDays[dayIndex].slots.splice(slotIndex, 1);
    }
  }

  clearWeeklyPattern(): void {
    this.isSavingPattern = true;

    const updateData = {
      availability: [],
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.isSavingPattern = false;
        this.showWeeklyPatternModal = false;
        
        // Clear local data
        this.availabilitySlots = [];
        this.weekDays.forEach(day => {
          day.enabled = false;
          day.slots = [{ fromTime: '09:00', toTime: '10:00' }];
        });
        this.updateCounts();
        this.updateCalendarLessons();
        this.showSuccessModal(this.translate.instant('common.success'), this.translate.instant('my_booked_page.messages.pattern_cleared'));
      },
      error: (err) => {
        this.isSavingPattern = false;
        console.error('Error clearing weekly pattern:', err);
        this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.pattern_error'));
      },
    });
  }

  saveWeeklyPattern(): void {
    this.isSavingPattern = true;

    // Build availability array from weekly pattern
    const newAvailability: any[] = [];

    this.weekDays.forEach((day) => {
      if (day.enabled) {
        day.slots.forEach(slot => {
          newAvailability.push({
            dayOfWeek: day.dayIndex,
            startTime: slot.fromTime,
            endTime: slot.toTime,
          });
        });
      }
    });

    const updateData = {
      availability: newAvailability,
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.isSavingPattern = false;
        this.showWeeklyPatternModal = false;
        
        // Update local data
        this.availabilitySlots = newAvailability.map((slot, index) => ({
          id: index,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isRecurring: true,
        }));
        this.updateCounts();
        this.updateCalendarLessons();
        this.showSuccessModal(this.translate.instant('common.success'), this.translate.instant('my_booked_page.messages.pattern_saved'));
      },
      error: (err) => {
        this.isSavingPattern = false;
        console.error('Error saving weekly pattern:', err);
        this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.pattern_error'));
      },
    });
  }

  // Slot/Booking Details Modal
  openSlotDetailsModal(slot: AvailabilitySlot): void {
    this.selectedSlotDetails = {
      type: 'availability',
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      dayName: this.getDayName(slot.dayOfWeek),
      time: `${slot.startTime} - ${slot.endTime}`,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isBooked: slot.isBooked,
      studentName: slot.studentName,
      studentId: slot.studentId,
      bookingId: slot.bookingId,
      price: slot.price,
      isRecurring: slot.isRecurring,
    };
    this.showDetailsModal = true;
  }

  openBookingDetailsModal(booking: Booking): void {
    this.selectedSlotDetails = {
      type: 'booking',
      id: booking.id,
      title: booking.title,
      datetime: booking.datetime,
      studentName: booking.name,
      email: booking.email,
      amount: booking.amount,
      status: booking.status,
      meetingUrl: booking.meetingUrl,
      bookingType: booking.type,
      currentParticipants: booking.currentParticipants,
    };
    this.showDetailsModal = true;
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedSlotDetails = null;
  }

  // Delete slot with refund
  deleteSlotWithRefund(): void {
    if (!this.selectedSlotDetails) return;

    this.isDeletingSlot = true;

    if (this.selectedSlotDetails.type === 'availability') {
      // Remove from availability
      const slotId = this.selectedSlotDetails.id;
      const updatedSlots = this.availabilitySlots.filter(s => s.id !== slotId);

      // If it was booked, we need to handle refund
      if (this.selectedSlotDetails.isBooked && this.selectedSlotDetails.bookingId) {
        // Call refund API first, then update availability
        this.processRefundAndDelete(this.selectedSlotDetails.bookingId, updatedSlots);
      } else {
        // Just update availability
        this.updateAvailabilityAfterDelete(updatedSlots);
      }
    } else {
      // For bookings, just close modal for now
      this.isDeletingSlot = false;
      this.closeDetailsModal();
    }
  }

  private processRefundAndDelete(bookingId: number, updatedSlots: AvailabilitySlot[]): void {
    // Teacher cancelling = full refund to student wallet
    console.log('Processing refund for individual booking:', bookingId);
    
    // Call teacher cancel endpoint which should handle refund
    this.repo.cancelIndividualBookingByTeacher(bookingId.toString()).subscribe({
      next: (response) => {
        console.log('Refund processed successfully:', response);
        // After refund, update availability
        this.updateAvailabilityAfterDelete(updatedSlots);
      },
      error: (err) => {
        console.error('Error processing refund:', err);
        // Even if refund API fails, still try to update availability
        // The backend should handle the refund when slot is cancelled
        this.updateAvailabilityAfterDelete(updatedSlots);
      }
    });
  }

  private updateAvailabilityAfterDelete(updatedSlots: AvailabilitySlot[]): void {
    const updateData = {
      availability: updatedSlots.map(slot => ({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.isDeletingSlot = false;
        this.closeDetailsModal();
        this.availabilitySlots = updatedSlots;
        this.updateCounts();
        this.updateCalendarLessons();

        const message = this.selectedSlotDetails?.isBooked 
          ? this.translate.instant('my_booked_page.messages.delete_refund_success')
          : this.translate.instant('my_booked_page.messages.delete_success');
        this.showSuccessModal(this.translate.instant('my_booked_page.messages.delete_title'), message);
      },
      error: (err) => {
        this.isDeletingSlot = false;
        console.error('Error deleting slot:', err);
        this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.delete_error'));
      },
    });
  }

  // Check for time conflicts
  private hasTimeConflict(dayOfWeek: number, startTime: string, endTime: string, excludeSlotId?: number | string): boolean {
    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.timeToMinutes(endTime);

    // Only check against existing availability slots (NOT bookings)
    // Bookings are specific to dates, but availability is a weekly schedule template.
    // A teacher should be able to add availability even if there's a booking on the same day of week,
    // because availability is for future weeks and bookings are date-specific.
    for (const slot of this.availabilitySlots) {
      // Skip if it's the slot we're editing
      if (excludeSlotId !== undefined && (slot.id === excludeSlotId || slot.id?.toString() === excludeSlotId?.toString())) {
        continue;
      }

      if (slot.dayOfWeek === dayOfWeek) {
        const slotStart = this.timeToMinutes(slot.startTime);
        const slotEnd = this.timeToMinutes(slot.endTime);

        // Check overlap: (StartA < EndB) and (EndA > StartB)
        // Adjacent slots (one ends at 9:00, next starts at 9:00) are NOT overlapping
        if (newStart < slotEnd && newEnd > slotStart) {
          return true;
        }
      }
    }

    return false;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Helper methods
  getDayName(dayIndex: number): string {
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return this.translate.instant('common.days.' + dayKeys[dayIndex]) || '';
  }

  calculateDuration(fromTime: string, toTime: string): number {
    if (!fromTime || !toTime) return 0;
    const [fromHour, fromMin] = fromTime.split(':').map(Number);
    const [toHour, toMin] = toTime.split(':').map(Number);
    return (toHour * 60 + toMin) - (fromHour * 60 + fromMin);
  }

  // Save default hourly rate to teacher profile
  saveDefaultHourlyRate(): void {
    if (this.defaultHourlyRate < 0) {
      this.showErrorModal(
        this.translate.instant('common.error'),
        this.translate.instant('my_booked_page.default_rate.min_error')
      );
      return;
    }

    this.isSavingDefaultRate = true;
    const updateData = { hourlyRate: this.defaultHourlyRate };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.isSavingDefaultRate = false;
        // Update the price in the form as well
        this.addAvailabilityForm.patchValue({ price: this.defaultHourlyRate });
        this.showSuccessModal(
          this.translate.instant('common.success'),
          this.translate.instant('my_booked_page.default_rate.saved')
        );
      },
      error: (err) => {
        this.isSavingDefaultRate = false;
        console.error('Error saving default hourly rate:', err);
        this.showErrorModal(
          this.translate.instant('common.error'),
          this.translate.instant('my_booked_page.default_rate.save_error')
        );
      },
    });
  }

  showSuccessModal(title: string, message: string): void {
    this.showResponseModal = true;
    this.responseModalData = { type: 'success', title, message };
    this.modalAutoCloseTimer = setTimeout(() => {
      this.showResponseModal = false;
    }, 3000);
  }

  showErrorModal(title: string, message: string): void {
    this.showResponseModal = true;
    this.responseModalData = { type: 'error', title, message };
  }

  closeResponseModal(): void {
    this.showResponseModal = false;
    this.responseModalData = null;
  }

  // Filtered availability for display (includes both availability slots and group sessions)
  get filteredAvailability(): AvailabilitySlot[] {
    // Start with individual availability slots
    let slots: AvailabilitySlot[] = this.availabilitySlots.map(s => ({
      ...s,
      type: 'individual' as const
    }));

    // Add group sessions converted to slot format (exclude cancelled sessions)
    const activeGroupBookings = this.groupBookings.filter(b => 
      b.status !== 'cancelled' && b.rawStatus !== 5
    );
    
    const groupSlots: AvailabilitySlot[] = activeGroupBookings.map(b => {
      const date = b.rawDateTime ? this.dateLocale.parseDate(b.rawDateTime) : null;
      const dayOfWeek = date ? date.getDay() : 0;
      const startTime = date ? this.dateLocale.formatTime(date) : '';
      // Assume 1 hour duration for group sessions
      const endDate = date ? new Date(date.getTime() + 60 * 60 * 1000) : null;
      const endTime = endDate ? this.dateLocale.formatTime(endDate) : '';
      
      return {
        id: typeof b.id === 'number' ? b.id : parseInt(b.id.toString(), 10),
        dayOfWeek,
        startTime,
        endTime,
        isRecurring: false,
        isBooked: (b.currentParticipants || 0) > 0,
        studentName: b.currentParticipants ? `${b.currentParticipants}/${b.maxParticipants} students` : undefined,
        price: parseFloat(b.amount?.replace('$', '') || '0'),
        type: 'group' as const,
        title: b.title,
        currentParticipants: b.currentParticipants || 0,
        maxParticipants: b.maxParticipants || 0,
        rawDateTime: b.rawDateTime || undefined
      };
    });

    slots = [...slots, ...groupSlots];

    // Filter by status
    if (this.availabilityFilter === 'available') {
      slots = slots.filter(s => !s.isBooked);
    } else if (this.availabilityFilter === 'booked') {
      slots = slots.filter(s => s.isBooked);
    }

    return slots;
  }

  // Join lesson for booking
  joinLessonFromDetails(): void {
    if (this.selectedSlotDetails?.type === 'booking') {
      const booking = this.bookings.find(b => b.id === this.selectedSlotDetails.id);
      if (booking) {
        this.joinLesson(booking);
        this.closeDetailsModal();
      }
    }
  }

  deleteBookingFromDetails(): void {
    if (!this.selectedSlotDetails) return;

    if (this.selectedSlotDetails.bookingType === 'group') {
      this.deleteGroupSessionFromDetails();
    } else {
      // Individual booking deletion
      if (confirm(this.translate.instant('my_booked_page.delete_confirm.message_booked'))) {
        this.isDeletingSlot = true;
        this.repo.cancelIndividualBookingByTeacher(this.selectedSlotDetails.id.toString()).subscribe({
          next: () => {
            this.isDeletingSlot = false;
            this.closeDetailsModal();
            
            // Refresh bookings
            this.startRequest();
            this.repo.getTeacherBookings().subscribe({
              next: (resp: any) => {
                const dataArray: any[] | null = Array.isArray(resp)
                  ? resp
                  : resp && Array.isArray((resp as any).data)
                  ? (resp as any).data
                  : null;

                if (dataArray) {
                  // Keep group sessions, update individual bookings
                  const groupSessions = this.bookings.filter(b => b.type === 'group');
                  const newBookings = dataArray.map((b: any) => this.mapApiToBooking(b));
                  this.bookings = [...groupSessions, ...newBookings];
                }
                this.finishRequest();
                this.showSuccessModal(this.translate.instant('my_booked_page.messages.delete_title'), this.translate.instant('my_booked_page.messages.delete_refund_success'));
              },
              error: (err) => {
                console.error('Failed to reload bookings', err);
                this.finishRequest();
              }
            });
          },
          error: (err) => {
            this.isDeletingSlot = false;
            console.error('Error deleting booking:', err);
            this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.delete_error'));
          }
        });
      }
    }
  }

  deleteGroupSessionFromDetails(): void {
    if (!this.selectedSlotDetails || this.selectedSlotDetails.bookingType !== 'group') return;
    
    const hasParticipants = (this.selectedSlotDetails.currentParticipants || 0) > 0;
    const confirmMessage = hasParticipants 
      ? this.translate.instant('my_booked_page.delete_confirm.message_booked') 
      : this.translate.instant('my_booked_page.delete_confirm.message_available');

    if (confirm(confirmMessage)) {
        this.isDeletingSlot = true;
        const sessionId = this.selectedSlotDetails.id.toString();
        this.repo.deleteGroupSession(sessionId).subscribe({
            next: () => {
                this.isDeletingSlot = false;
                this.closeDetailsModal();
                // Refresh group sessions
                this.startRequest();
                this.repo.getGroupSessionsByTeacher().subscribe({
                    next: (resp: any) => {
                        const sessions: any[] | null = Array.isArray(resp)
                        ? resp
                        : resp && Array.isArray((resp as any).data)
                        ? (resp as any).data
                        : null;
                        if (sessions) {
                            const mapped = sessions.map((s: any) =>
                                this.mapGroupSessionToBooking(s)
                            );
                            const others = this.bookings.filter((b) => b.type !== 'group');
                            this.bookings = [...others, ...mapped];
                        }
                        this.finishRequest();
                        
                        const successMessage = hasParticipants
                          ? this.translate.instant('my_booked_page.messages.delete_refund_success')
                          : this.translate.instant('my_booked_page.messages.delete_success');
                        
                        this.showSuccessModal(this.translate.instant('my_booked_page.messages.delete_title'), successMessage);
                    },
                    error: (err) => {
                        console.error('Failed to reload group sessions', err);
                        this.finishRequest();
                    }
                });
            },
            error: (err) => {
                this.isDeletingSlot = false;
                console.error('Error deleting group session:', err);
                this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.delete_error'));
            }
        });
    }
  }

  // Quick delete slot from card
  quickDeleteSlot(slot: AvailabilitySlot, event: Event): void {
    event.stopPropagation(); // Prevent opening details modal
    this.slotToDelete = slot;
    this.deleteMode = 'single'; // Reset to single delete
    this.showDeleteConfirmModal = true;
  }

  // Close delete confirmation modal
  closeDeleteConfirmModal(): void {
    this.showDeleteConfirmModal = false;
    this.slotToDelete = null;
    this.deleteMode = 'single';
  }

  // Set delete mode for recurring
  setDeleteMode(mode: 'single' | 'all-recurring'): void {
    this.deleteMode = mode;
  }

  // Confirm and execute delete
  confirmDeleteSlot(): void {
    if (!this.slotToDelete) return;

    this.isDeletingSlot = true;
    const slot = this.slotToDelete;

    let updatedSlots: AvailabilitySlot[];

    if (this.deleteMode === 'all-recurring' && slot.isRecurring) {
      // Delete all slots with same day and time (all recurring instances)
      updatedSlots = this.availabilitySlots.filter(s => 
        !(s.dayOfWeek === slot.dayOfWeek && s.startTime === slot.startTime && s.endTime === slot.endTime)
      );
    } else {
      // Delete only this specific slot
      updatedSlots = this.availabilitySlots.filter(s => 
        !(s.dayOfWeek === slot.dayOfWeek && s.startTime === slot.startTime && s.endTime === slot.endTime && s.isRecurring === slot.isRecurring)
      );
    }

    // If it was booked, we need to handle refund
    if (slot.isBooked && slot.bookingId) {
      this.processRefundAndDeleteConfirmed(slot.bookingId, updatedSlots, slot.isBooked);
    } else {
      // Just update availability
      this.updateAvailabilityAfterDeleteConfirmed(updatedSlots, false);
    }
  }

  private processRefundAndDeleteConfirmed(bookingId: number, updatedSlots: AvailabilitySlot[], wasBooked: boolean): void {
    // Teacher cancelling = full refund to student wallet
    console.log('Processing refund for individual booking:', bookingId);
    
    // Call teacher cancel endpoint which should handle refund
    this.repo.cancelIndividualBookingByTeacher(bookingId.toString()).subscribe({
      next: (response) => {
        console.log('Refund processed successfully:', response);
        // After refund, update availability
        this.updateAvailabilityAfterDeleteConfirmed(updatedSlots, wasBooked);
      },
      error: (err) => {
        console.error('Error processing refund:', err);
        // Even if refund API fails, still try to update availability
        // The backend should handle the refund when booking is cancelled
        this.updateAvailabilityAfterDeleteConfirmed(updatedSlots, wasBooked);
      }
    });
  }

  private updateAvailabilityAfterDeleteConfirmed(updatedSlots: AvailabilitySlot[], wasBooked: boolean): void {
    const updateData = {
      availability: updatedSlots.map(slot => ({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: slot.price || this.defaultHourlyRate,
        isRecurring: slot.isRecurring || false,
      })),
    };

    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.isDeletingSlot = false;
        this.closeDeleteConfirmModal();
        this.availabilitySlots = updatedSlots;
        this.updateCounts();
        this.updateCalendarLessons();

        const message = wasBooked 
          ? this.translate.instant('my_booked_page.messages.delete_refund_success')
          : this.translate.instant('my_booked_page.messages.delete_success');
        this.showSuccessModal(this.translate.instant('my_booked_page.messages.delete_title'), message);
      },
      error: (err) => {
        this.isDeletingSlot = false;
        console.error('Error deleting slot:', err);
        this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.delete_error'));
      },
    });
  }

  // ========== Approve/Reject Booking Methods ==========

  // Get pending bookings count
  get pendingBookingsCount(): number {
    return this.bookings.filter(b => b.status === 'pending').length;
  }

  // Get pending individual bookings
  get pendingIndividualBookings(): Booking[] {
    return this.bookings.filter(
      (b) => (b.type || 'individual') === 'individual' && b.status === 'pending'
    );
  }

  // Open approve confirmation (now approves directly)
  openApproveModal(booking: Booking): void {
    this.approveBookingDirectly(booking);
  }

  // Close approve/reject modal
  closeApproveRejectModal(): void {
    this.showApproveRejectModal = false;
    this.selectedBookingForAction = null;
    this.rejectReason = '';
  }

  // Open reject modal (still needs reason input)
  openRejectModal(booking: Booking): void {
    this.selectedBookingForAction = booking;
    this.rejectReason = '';
    this.showApproveRejectModal = true;
  }

  // Approve a pending booking directly without modal
  approveBookingDirectly(booking: Booking): void {
    if (this.isProcessingAction) return;

    this.isProcessingAction = true;
    const bookingId = booking.id;

    this.repo.approveBooking(bookingId).subscribe({
      next: (resp: any) => {
        console.log('Approve booking response:', resp);
        this.isProcessingAction = false;

        // Update the booking in the local list
        const index = this.bookings.findIndex(b => b.id === bookingId);
        if (index !== -1 && resp?.booking) {
          this.bookings[index] = this.mapApiToBooking(resp.booking);
        } else if (index !== -1) {
          // Just update status locally if API doesn't return full booking
          this.bookings[index].status = 'confirmed';
        }

        this.updateCounts();
        this.updateCalendarLessons();

        this.showSuccessModal(
          this.translate.instant('my_booked_page.approve.success_title'),
          this.translate.instant('my_booked_page.approve.success_message')
        );
      },
      error: (err) => {
        console.error('Error approving booking:', err);
        this.isProcessingAction = false;
        
        // Check if the booking was actually approved despite the error
        // This can happen if the response format is unexpected
        const errorMessage = err?.error?.message || err?.message || '';
        
        this.showErrorModal(
          this.translate.instant('common.error'),
          errorMessage || this.translate.instant('my_booked_page.approve.error_message')
        );
      },
    });
  }

  // Approve a pending booking (from modal - kept for compatibility)
  approveBooking(): void {
    if (!this.selectedBookingForAction || this.isProcessingAction) return;

    this.isProcessingAction = true;
    const bookingId = this.selectedBookingForAction.id;

    this.repo.approveBooking(bookingId).subscribe({
      next: (resp: any) => {
        this.isProcessingAction = false;
        this.closeApproveRejectModal();

        // Update the booking in the local list
        const index = this.bookings.findIndex(b => b.id === bookingId);
        if (index !== -1 && resp.booking) {
          this.bookings[index] = this.mapApiToBooking(resp.booking);
        } else if (index !== -1) {
          // Just update status locally if API doesn't return full booking
          this.bookings[index].status = 'confirmed';
        }

        this.updateCounts();
        this.updateCalendarLessons();

        this.showSuccessModal(
          this.translate.instant('my_booked_page.approve.success_title'),
          this.translate.instant('my_booked_page.approve.success_message')
        );
      },
      error: (err) => {
        this.isProcessingAction = false;
        console.error('Error approving booking:', err);
        this.showErrorModal(
          this.translate.instant('common.error'),
          err.error?.message || this.translate.instant('my_booked_page.approve.error_message')
        );
      },
    });
  }

  // Reject a pending booking
  rejectBooking(): void {
    if (!this.selectedBookingForAction || this.isProcessingAction) return;

    this.isProcessingAction = true;
    const bookingId = this.selectedBookingForAction.id;

    this.repo.rejectBooking(bookingId, this.rejectReason).subscribe({
      next: (resp: any) => {
        this.isProcessingAction = false;
        this.closeApproveRejectModal();

        // Update the booking in the local list
        const index = this.bookings.findIndex(b => b.id === bookingId);
        if (index !== -1 && resp.booking) {
          this.bookings[index] = this.mapApiToBooking(resp.booking);
        } else if (index !== -1) {
          // Just update status locally if API doesn't return full booking
          this.bookings[index].status = 'cancelled';
        }

        this.updateCounts();
        this.updateCalendarLessons();

        this.showSuccessModal(
          this.translate.instant('my_booked_page.reject.success_title'),
          this.translate.instant('my_booked_page.reject.success_message')
        );
      },
      error: (err) => {
        this.isProcessingAction = false;
        console.error('Error rejecting booking:', err);
        this.showErrorModal(
          this.translate.instant('common.error'),
          err.error?.message || this.translate.instant('my_booked_page.reject.error_message')
        );
      },
    });
  }

  /**
   * Format timezone display based on user's local timezone offset (original method)
   */
  private formatTimezoneDisplay(): string {
    const offsetMinutes = -new Date().getTimezoneOffset();
    return this.formatTimezoneDisplayFromOffset(offsetMinutes);
  }

  /**
   * Format timezone display from a given offset in minutes
   */
  private formatTimezoneDisplayFromOffset(offsetMinutes: number): string {
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? '+' : '-';
    
    if (minutes === 0) {
      return `GMT${sign}${hours}`;
    } else {
      return `GMT${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Handle GMT offset change from dropdown
   */
  onGmtOffsetChange(): void {
    this.userTimezoneDisplay = this.formatTimezoneDisplayFromOffset(this.selectedGmtOffset);
    // Refresh all time displays
    this.refreshDateFormatting();
  }

  /**
   * Convert a UTC date to the selected timezone for display
   */
  convertToSelectedTimezone(utcDateStr: string): Date {
    const utcDate = new Date(utcDateStr);
    const offsetMs = this.selectedGmtOffset * 60 * 1000;
    return new Date(utcDate.getTime() + offsetMs);
  }

  /**
   * Format time in selected timezone
   */
  formatTimeInSelectedTimezone(utcDateStr: string): string {
    const localDate = this.convertToSelectedTimezone(utcDateStr);
    const hours = localDate.getUTCHours().toString().padStart(2, '0');
    const minutes = localDate.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Format date in selected timezone
   */
  formatDateInSelectedTimezone(utcDateStr: string): string {
    const localDate = this.convertToSelectedTimezone(utcDateStr);
    return this.dateLocale.formatDayMonth(localDate);
  }
}
