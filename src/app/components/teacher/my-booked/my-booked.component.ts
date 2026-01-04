import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RepoService } from '../../../Repositories/repo.service';
import { LessonCalendarComponent, LessonEvent } from '../../../shared/shared-component/lesson-calendar/lesson-calendar.component';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LanguageService } from '../../../services/language.service';
import { FacadeProfilesService } from '../../../services/profiles/facade-profiles.service';
import {
  GroupSessionStatus,
  IndividualSessionStatus,
  getGroupStatusLabel,
  getIndividualStatusLabel
} from '../../../shared/enums/session-status.enum';

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
  imports: [CommonModule, TranslateModule, LessonCalendarComponent, FormsModule, ReactiveFormsModule],
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
  minDate: string = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();
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

  // Timezone display
  userTimezoneDisplay: string = 'GMT+0';

  constructor(
    private repo: RepoService,
    private dateLocale: DateLocaleService,
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
  }

  ngOnInit(): void {
    // Initialize timezone display
    this.userTimezoneDisplay = this.formatTimezoneDisplay();

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

    this.facadeProfilesService.getTeacherProfileData$.subscribe((data) => {
      if (data?.profile) {
        // Get default hourly rate from teacher profile
        if (data.profile.hourlyRate) {
          this.defaultHourlyRate = data.profile.hourlyRate;
          // Update form with new default price
          this.addAvailabilityForm.patchValue({ price: this.defaultHourlyRate });
        }

        if (data.profile.availability) {
          this.availabilitySlots = data.profile.availability.map((slot: any) => ({
            id: slot.id,
            dayOfWeek: slot.dayOfWeek ?? slot.day,
            startTime: slot.startTime || slot.fromTime,
            endTime: slot.endTime || slot.toTime,
            isRecurring: slot.isRecurring ?? false,
            isBooked: !!slot.studentId || !!slot.bookedBy,
            studentId: slot.studentId,
            studentName: slot.studentName,
            bookingId: slot.bookingId,
            price: slot.price || this.defaultHourlyRate,
            // Non-recurring slot specific date fields
            date: slot.date,
            startDateTime: slot.startDateTime,
            endDateTime: slot.endDateTime,
          }));
          
          // Debug: Log loaded availability slots
          console.log('Loaded availability slots from backend:', this.availabilitySlots);
          this.availabilitySlots.forEach((slot, index) => {
            console.log(`Loaded slot ${index}: day=${slot.dayOfWeek}, start=${slot.startTime}, end=${slot.endTime}, recurring=${slot.isRecurring}`);
          });
          
          this.updateCounts();
          this.updateCalendarLessons();
        }
      }
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
      // Update cached counts and calendar lessons when all requests complete
      this.updateCounts();
      this.updateCalendarLessons();
    }
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
    const d = this.dateLocale.parseDate(dt);
    if (!d) return dt;
    // Format as DD/MM HH:mm
    const dayMonth = this.dateLocale.formatDayMonth(d);
    const time = this.dateLocale.formatTime(d);
    return `${dayMonth} ${time}`;
  }

  // Refresh date formatting for all bookings when language changes
  private refreshDateFormatting(): void {
    this.bookings = this.bookings.map((b) => ({
      ...b,
      datetime: b.rawDateTime ? this.formatDate(b.rawDateTime) : b.datetime,
    }));
  }

  /**
   * Parse a date coming from the API which is expected to be UTC+0.
   * Handles ISO strings with or without timezone, numeric timestamps, and Date objects.
   * If the string has no timezone offset, we treat it as UTC by appending 'Z'.
   */
  private parseApiDateAsUTC(value: any): Date | null {
    if (!value) return null;
    // If it's already a Date
    if (value instanceof Date) return value;

    // If it's a numeric timestamp
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value);
    }

    // If it's a string
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // If string ends with Z or contains +/- offset, Date will parse as UTC
      if (/Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        const d = new Date(trimmed);
        return Number.isNaN(d.getTime()) ? null : d;
      }

      // If it's an ISO-like string without timezone (e.g. '2025-10-23T14:30:00'),
      // append 'Z' to force UTC parsing from backend.
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(trimmed)) {
        const d = new Date(trimmed + 'Z');
        return Number.isNaN(d.getTime()) ? null : d;
      }

      // Last resort: let Date try to parse (may be locale-dependent)
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
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
        start: b.rawDateTime!,
        type: (b.type as 'individual' | 'group') || 'individual',
        status: this.mapStatusToCalendar(b.status),
        studentName: b.name,
        price: parseFloat(b.amount.replace('$', '')),
        maxStudents: b.maxParticipants || undefined,
        currentStudents: b.currentParticipants || undefined,
        description: b.notes || undefined,
      }));
    
    console.log('Calendar - Total bookings:', this.bookings.length, 'Valid for calendar:', bookingEvents.length);

    // Then, map availability slots to events
    // For recurring slots, generate events for multiple weeks
    const availabilityEvents: LessonEvent[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    this.availabilitySlots.forEach((slot, index) => {
      if (slot.isRecurring) {
        // Generate events for the next 8 weeks for recurring slots
        for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
          const slotDate = this.getNextDateForDay(slot.dayOfWeek, weekOffset);
          // Skip if the date is in the past
          if (slotDate < today) continue;
          
          // Use local date string to avoid timezone shifts
          const year = slotDate.getFullYear();
          const month = (slotDate.getMonth() + 1).toString().padStart(2, '0');
          const day = slotDate.getDate().toString().padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          
          // Handle end time at midnight (00:00) - treat as next day
          let endDateStr = dateStr;
          if (slot.endTime === '00:00' || slot.endTime === '00:00:00') {
            const nextDay = new Date(slotDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextYear = nextDay.getFullYear();
            const nextMonth = (nextDay.getMonth() + 1).toString().padStart(2, '0');
            const nextDayNum = nextDay.getDate().toString().padStart(2, '0');
            endDateStr = `${nextYear}-${nextMonth}-${nextDayNum}`;
          }

          availabilityEvents.push({
            id: `avail-${slot.id || index}-week${weekOffset}`,
            title: slot.isBooked ? (slot.studentName || this.translate.instant('my_booked_page.booked')) : this.translate.instant('my_booked_page.available'),
            start: `${dateStr}T${slot.startTime}`,
            end: `${endDateStr}T${slot.endTime}`,
            type: 'individual' as const,
            status: slot.isBooked ? 'booked' as const : 'available' as const,
            studentName: slot.studentName,
            price: slot.price,
            description: this.translate.instant('my_booked_page.recurring'),
          });
        }
      } else {
        // Non-recurring: use the specific date if available
        let slotDate: Date;
        let dateStr: string;
        
        if (slot.date) {
          // Use the saved specific date for non-recurring slot
          const [year, month, day] = slot.date.split('-').map(Number);
          slotDate = new Date(year, month - 1, day);
          dateStr = slot.date;
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
        
        // Skip if the date is in the past
        if (slotDate < today) return;
        
        // Handle end time at midnight (00:00) - treat as next day
        let endDateStr = dateStr;
        if (slot.endTime === '00:00' || slot.endTime === '00:00:00') {
          const nextDay = new Date(slotDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const nextYear = nextDay.getFullYear();
          const nextMonth = (nextDay.getMonth() + 1).toString().padStart(2, '0');
          const nextDayNum = nextDay.getDate().toString().padStart(2, '0');
          endDateStr = `${nextYear}-${nextMonth}-${nextDayNum}`;
        }

        availabilityEvents.push({
          id: `avail-${slot.id || index}`,
          title: slot.isBooked ? (slot.studentName || this.translate.instant('my_booked_page.booked')) : this.translate.instant('my_booked_page.available'),
          start: `${dateStr}T${slot.startTime}`,
          end: `${endDateStr}T${slot.endTime}`,
          type: 'individual' as const,
          status: slot.isBooked ? 'booked' as const : 'available' as const,
          studentName: slot.studentName,
          price: slot.price,
        });
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

  private mapStatusToCalendar(status: string): 'available' | 'booked' | 'completed' | 'cancelled' {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'open':
      case 'full':
        return 'booked';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
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

    // Calculate end time (1 hour after start)
    let endTimeStr = '';
    if (timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const endHours = (hours + 1) % 24;
      endTimeStr = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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
      newSlot.date = formValue.date; // YYYY-MM-DD format
      // Create full ISO datetime for the slot - convert to UTC using toISOString()
      const startDate = new Date(`${formValue.date}T${formValue.fromTime}:00`);
      newSlot.startDateTime = startDate.toISOString();
      
      // Handle midnight (00:00) end time - it means the next day
      if (formValue.toTime === '00:00') {
        // Calculate next day's date for endDateTime
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const endDate = new Date(`${nextDay.getFullYear()}-${(nextDay.getMonth() + 1).toString().padStart(2, '0')}-${nextDay.getDate().toString().padStart(2, '0')}T00:00:00`);
        newSlot.endDateTime = endDate.toISOString();
      } else {
        const endDate = new Date(`${formValue.date}T${formValue.toTime}:00`);
        newSlot.endDateTime = endDate.toISOString();
      }
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
        // Ensure times are in correct format
        const startTime = slot.startTime || '00:00';
        const endTime = slot.endTime || '00:00';
        
        // Validate that we have actual times
        if (!startTime.includes(':') || !endTime.includes(':')) {
          console.error('Invalid time format in slot:', slot);
        }
        
        const slotData: any = {
          dayOfWeek: slot.dayOfWeek,
          startTime: startTime,
          endTime: endTime,
          isRecurring: slot.isRecurring ?? true,
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
      console.log(`Slot ${index}: day=${slot.dayOfWeek}, start=${slot.startTime}, end=${slot.endTime}, isRecurring=${slot.isRecurring}`);
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
        this.showErrorModal(this.translate.instant('common.error'), this.translate.instant('my_booked_page.messages.save_error'));
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
   * Format timezone display based on user's local timezone offset
   */
  private formatTimezoneDisplay(): string {
    const offsetMinutes = -new Date().getTimezoneOffset();
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? '+' : '-';
    
    if (minutes === 0) {
      return `GMT${sign}${hours}`;
    } else {
      return `GMT${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
    }
  }
}
