import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DateTime } from 'luxon';
import { SideMenuComponent } from '../../../shared/shared-component/side-menu/side-menu.component';
import { SimpleDatePickerComponent } from '../../../shared/shared-component/simple-date-picker/simple-date-picker.component';
import { LessonsHandelingFacadeService } from '../../../services/lessons-teachers/lessons-handeling-facade.service';
import { RepoService } from '../../../Repositories/repo.service';
import { GetTeacherByIDService } from '../../../services/lessons-teachers/get-teacher-by-id.service';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LuxonDateService } from '../../../services/common/luxon-date.service';
import { LanguageService } from '../../../services/language.service';

@Component({
  selector: 'app-all-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SideMenuComponent, SimpleDatePickerComponent],
  templateUrl: './all-teachers.component.html',
  styleUrls: ['./all-teachers.component.scss'],
})
export class AllTeachersComponent implements OnInit, OnDestroy {
  // bindings for filter controls
  searchText = '';
  selectedCourse: string | null = '';
  selectedTeacher: string | null = '';
  // additional filters
  selectedLanguage: string | number | null = null;
  minRating: number | null = null;
  maxHourlyRate: number | null = null;
  minExperience: number | null = null;
  // onlyAvailable: when null, do not include isAvailable param in search (don't force filter)
  onlyAvailable: boolean | null = null;
  // debounce timer for search input
  private searchDebounceTimer: any = null;
  allTeachers: any[] = []; // to be populated from service
  teacherById: any = null;
  // controls visibility of the shared side-menu
  sidebarOpen = false;
  AllTeacherCount: number = 0;
  currentpage = 1;
  pageSize = 10;
  totalPages = 1;
  loading = false;
  // id of teacher currently loading for the "View" action (used to show spinner next to button)
  loadingViewId: string | null = null;
  // id of teacher currently loading for the "Book" action (used to show spinner next to book button)
  loadingBookId: string | null = null;
  // booking side menu controls
  bookingSidebarOpen = false;
  bookingTeacher: any = null;
  // index of the selected availability slot inside bookingTeacher.availability
  selectedSlotIndex: number | null = null;
  // Selected date from calendar picker (format: 'YYYY-MM-DD')
  selectedCalendarDate: string | null = null;
  // processing flag for payment action
  payProcessing = false;
  // available page sizes for the user to choose from
  pageSizeOptions = [5, 10, 20, 50];
  // Store student's existing bookings for conflict checking
  studentExistingBookings: any[] = [];
  
  // Group session modal controls
  showGroupSessionModal = false;
  selectedGroupSession: any = null;
  groupBookingProcessing = false;

  // sample options - replace with real data or inputs as needed
  // label fields are kept as translation keys where possible
  courses: any[] = [];
  coursesLoading = false;

  teachers = [
    { label: 'teachers.ahmed', value: 'ahmed' },
    { label: 'teachers.sara', value: 'sara' },
  ];

  // Language subscription
  private langSubscription?: Subscription;

  // Timezone - Fixed to Mecca time (GMT+3)
  selectedGmtOffset: number = 180; // Fixed to GMT+3 (Mecca time)
  userTimezoneDisplay: string = 'GMT+3';
  gmtOptions: { label: string; value: number }[] = [
    { label: 'GMT+3 (توقيت مكة)', value: 180 },
  ];

  constructor(
    private translate: TranslateService,
    private _repo: RepoService,
    private _getTeacher: GetTeacherByIDService,
    private dateLocale: DateLocaleService,
    private luxonDate: LuxonDateService,
    private languageService: LanguageService,
    private router: Router
  ) {}

  ngOnInit() {
    // Initialize timezone display
    this.userTimezoneDisplay = this.formatTimezoneDisplay(this.selectedGmtOffset);
    
    // Fetch all teachers on component initialization
    this.loadPage(this.currentpage);
    // load specializations once on init
    this.loadSpecializations();
    // load student's existing bookings for conflict detection
    this.loadStudentExistingBookings();
  }

  /**
   * Format timezone offset to display string
   */
  private formatTimezoneDisplay(offsetMinutes: number): string {
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
   * Handle GMT offset change
   */
  onGmtOffsetChange(): void {
    this.userTimezoneDisplay = this.formatTimezoneDisplay(this.selectedGmtOffset);
    // Refresh time display if booking sidebar is open
    if (this.bookingTeacher && this.bookingTeacher.availability) {
      this.refreshAvailabilityTimes();
    }
  }

  /**
   * Refresh availability times based on selected GMT offset
   */
  private refreshAvailabilityTimes(): void {
    if (!this.bookingTeacher?.availability) return;
    
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    const offsetMs = this.selectedGmtOffset * 60 * 1000;
    
    // Re-calculate times for each slot based on stored UTC ISO strings
    this.bookingTeacher.availability = this.bookingTeacher.availability.map((slot: any) => {
      if (!slot._originalStartIso) return slot;
      
      const utcStart = new Date(slot._originalStartIso);
      const adjustedStart = new Date(utcStart.getTime() + offsetMs);
      
      slot.startTime = `${pad(adjustedStart.getUTCHours())}:${pad(adjustedStart.getUTCMinutes())}`;
      slot.displayDate = this.dateLocale.formatDayMonth(adjustedStart);
      slot.dayOfWeek = adjustedStart.getUTCDay();
      
      if (slot._originalEndIso) {
        const utcEnd = new Date(slot._originalEndIso);
        const adjustedEnd = new Date(utcEnd.getTime() + offsetMs);
        slot.endTime = `${pad(adjustedEnd.getUTCHours())}:${pad(adjustedEnd.getUTCMinutes())}`;
      }
      
      return slot;
    });
  }

  // Load student's existing bookings to check for time conflicts

  /**
   * Format time from date object as HH:MM
   */
  private formatTimeFromDate(date: Date): string {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Load student's existing bookings to check for time conflicts
  private loadStudentExistingBookings(): void {
    this._repo.getAllIndividualSession().subscribe({
      next: (resp: any) => {
        const dataArray: any[] | null = Array.isArray(resp)
          ? resp
          : resp && Array.isArray((resp as any).data)
          ? (resp as any).data
          : null;
        if (dataArray) {
          this.studentExistingBookings = dataArray;
        }
      },
      error: (err) => {
        console.error('Failed to load student bookings for conflict check', err);
      },
    });
  }

  loadPage(page: number = 1) {
    this.loading = true;
    // If user hasn't typed a search and no filters are active, use default listing endpoint
    const hasSearch = !!(this.searchText && this.searchText.trim().length > 0);
    const hasFilters = !!(
      (this.selectedCourse &&
        this.selectedCourse.toString().trim().length > 0) ||
      (this.selectedTeacher &&
        this.selectedTeacher.toString().trim().length > 0) ||
      (this.selectedLanguage !== null && this.selectedLanguage !== undefined) ||
      (this.minRating !== null && this.minRating !== undefined) ||
      (this.maxHourlyRate !== null && this.maxHourlyRate !== undefined) ||
      (this.minExperience !== null && this.minExperience !== undefined) ||
      typeof this.onlyAvailable === 'boolean'
    );

    if (!hasSearch && !hasFilters) {
      this._repo.getAllTeachers(page, this.pageSize).subscribe(
        (response) => {
          // Expecting response shape { teachers: [], totalCount: number }
          this.allTeachers =
            response.teachers || response.items || response.data || [];
          this.AllTeacherCount =
            response.totalCount ||
            response.total ||
            (Array.isArray(this.allTeachers) ? this.allTeachers.length : 0);
          this.currentpage = page;
          this.totalPages = Math.max(
            1,
            Math.ceil(this.AllTeacherCount / this.pageSize)
          );
          this.loading = false;
        },
        (err) => {
          console.error('Failed to load teachers', err);
          this.loading = false;
        }
      );
      return;
    }

    // Otherwise call search endpoint (include filters alongside search term)
    const options: any = {
      search: this.searchText || undefined,
      specialization: this.selectedCourse || undefined,
      language: this.selectedLanguage || undefined,
      minRating: this.minRating || undefined,
      maxHourlyRate: this.maxHourlyRate || undefined,
      minExperience: this.minExperience || undefined,
      page: page,
      pageSize: this.pageSize,
    };
    // include availability filter only when explicitly set (true/false)
    if (typeof this.onlyAvailable === 'boolean') {
      options.isAvailable = this.onlyAvailable;
    }

    this._repo.searchTeachers(options).subscribe(
      (response) => {
        // Expect response shape similar to { teachers: [], totalCount }
        this.allTeachers =
          response.teachers || response.items || response.data || [];
        this.AllTeacherCount =
          response.totalCount ||
          response.total ||
          (Array.isArray(this.allTeachers) ? this.allTeachers.length : 0);
        this.currentpage = page;
        this.totalPages = Math.max(
          1,
          Math.ceil(this.AllTeacherCount / this.pageSize)
        );
        this.loading = false;
      },
      (err) => {
        console.error('Failed to load teachers', err);
        this.loading = false;
      }
    );

    // ...existing code...
  }

  // Load specializations once during component init
  private loadSpecializations() {
    this.coursesLoading = true;
    this._repo.getAllSpecializations().subscribe(
      (specializations: any) => {
        try {
          this.courses = this.normalizeSpecializations(specializations);
        } catch (e) {
          console.error('Failed to normalize specializations', e);
          this.courses = Array.isArray(specializations) ? specializations : [];
        }
        this.coursesLoading = false;
      },
      (err) => {
        console.error('Failed to load specializations', err);
        this.courses = [];
        this.coursesLoading = false;
      }
    );
  }

  // Normalize different possible API shapes into [{ label, value }]
  private normalizeSpecializations(input: any): any[] {
    // If input is an array
    if (Array.isArray(input)) {
      // array of strings
      if (input.length === 0) return [];
      const first = input[0];
      if (typeof first === 'string') {
        return input.map((s: string) => ({ label: s, value: s }));
      }
      // array of objects already with label/value
      if (first && typeof first === 'object') {
        // try to detect label/value fields
        return input.map((it: any) => {
          if (it.label && it.value) return it;
          if (it.name) return { label: it.name, value: it.name };
          if (it.title) return { label: it.title, value: it.title };
          // fallback: stringify
          return { label: JSON.stringify(it), value: JSON.stringify(it) };
        });
      }
    }

    // If input is an object wrapper like { data: [...] } or { specializations: [...] }
    if (input && typeof input === 'object') {
      const candidates = ['data', 'specializations', 'items', 'results'];
      for (const key of candidates) {
        if (Array.isArray(input[key])) {
          return this.normalizeSpecializations(input[key]);
        }
      }
    }

    // Unknown shape -> throw so caller can fallback
    throw new Error('Unsupported specializations response shape');
  }

  // pagination helpers
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages || page === this.currentpage) return;
    this.loadPage(page);
  }

  nextPage() {
    if (this.currentpage < this.totalPages) this.loadPage(this.currentpage + 1);
  }

  prevPage() {
    if (this.currentpage > 1) this.loadPage(this.currentpage - 1);
  }

  changePageSize(size: number) {
    const newSize = Number(size);
    if (!newSize || newSize === this.pageSize) return;
    this.pageSize = newSize;
    // when page size changes reset to first page to avoid invalid page numbers
    this.loadPage(1);
  }

  // method to get teacher by id
  viewTeacherProfile(teacherId: string) {
    // show spinner on the clicked button
    this.loadingViewId = teacherId;
    // fetch teacher profile and open side menu on success
    this._getTeacher.getTeacherById(teacherId).subscribe(
      (response: any) => {
        this.teacherById = response;
        console.log('Teacher Profile:', response);
        // open the reusable side-menu component
        this.sidebarOpen = true;
        // hide spinner
        this.loadingViewId = null;
      },
      (err) => {
        console.error('Failed to load teacher profile', err);
        // hide spinner in error case as well
        this.loadingViewId = null;
      }
    );
  }

  // lightweight helper to start booking flow (placeholder)
  bookTeacher(teacherId: string) {
    // show spinner on the clicked Book button
    this.loadingBookId = teacherId;

    // Fetch both individual availability AND group sessions in parallel
    forkJoin({
      individual: this._repo.getIndividualBookingsByStudent(teacherId).pipe(
        catchError(err => {
          console.error('Failed to load individual availability', err);
          return of([]);
        })
      ),
      groupSessions: this._repo.getGroupSessionsByTeacherId(teacherId).pipe(
        catchError(err => {
          console.error('Failed to load group sessions', err);
          return of({ sessions: [] });
        })
      )
    }).subscribe({
      next: ({ individual, groupSessions }) => {
        console.log('🔍 [DEBUG] Raw API individual availability:', individual);
        console.log('🔍 [DEBUG] Raw API group sessions:', groupSessions);
        
        try {
          // Process individual slots
          let individualSlots = Array.isArray(individual)
            ? individual.map((s: any) => ({ ...this._mapUtcSlotToLocal(s), slotType: 'individual' }))
            : [];
          
          // Process group sessions
          const sessionsArray = groupSessions?.sessions || groupSessions || [];
          let groupSlots = Array.isArray(sessionsArray)
            ? sessionsArray.map((gs: any) => this._mapGroupSessionToSlot(gs))
            : [];
          
          // Combine all slots
          const allSlots = [...individualSlots, ...groupSlots];
          
          // Mark past slots as unavailable
          const processedSlots = this._processAvailability(allSlots);
          
          const teacherObj: any = {
            id: teacherId,
            firstName: '',
            availability: processedSlots,
            groupSessions: sessionsArray // Keep original group sessions for modal
          };

          console.log('🔍 [DEBUG] Combined availability:', teacherObj.availability);

          this.bookingTeacher = teacherObj;
          this.bookingSidebarOpen = true;
          this.selectedSlotIndex = null;
          this.selectedCalendarDate = null;
        } catch (e) {
          console.error('Failed to process availability response', e);
          this.bookingTeacher = { id: teacherId, availability: [], groupSessions: [] };
          this.bookingSidebarOpen = true;
          this.selectedSlotIndex = null;
          this.selectedCalendarDate = null;
        }

        this.loadingBookId = null;
      },
      error: (err) => {
        console.error('Failed to load teacher data', err);
        this.loadingBookId = null;
      }
    });
  }

  // Map group session to slot format for display in the calendar
  private _mapGroupSessionToSlot(gs: any): any {
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    
    const scheduledDate = new Date(gs.scheduledDateTime);
    const year = scheduledDate.getUTCFullYear();
    const month = scheduledDate.getUTCMonth() + 1;
    const day = scheduledDate.getUTCDate();
    const hours = scheduledDate.getUTCHours();
    const minutes = scheduledDate.getUTCMinutes();
    
    // Calculate end time based on duration (default 1 hour)
    const durationHours = gs.duration || 1;
    const endDate = new Date(scheduledDate.getTime() + durationHours * 60 * 60 * 1000);
    
    return {
      slotType: 'group',
      isGroupSession: true,
      groupSessionId: gs.id,
      groupSessionData: gs, // Keep full data for modal
      title: gs.title,
      description: gs.description,
      price: gs.price,
      maxParticipants: gs.maxParticipants,
      currentParticipants: gs.currentParticipants,
      teacherName: gs.teacherName,
      status: gs.status,
      isAvailable: gs.status === 'Open' || gs.status === 0, // 0 = Open status
      startTime: `${pad(hours)}:${pad(minutes)}`,
      endTime: `${pad(endDate.getUTCHours())}:${pad(endDate.getUTCMinutes())}`,
      displayDate: this.dateLocale.formatDayMonth(scheduledDate),
      dayOfWeek: scheduledDate.getUTCDay(),
      date: `${year}-${pad(month)}-${pad(day)}`,
      adjustedDateKey: `${year}-${pad(month)}-${pad(day)}`,
      startIsoUtc: gs.scheduledDateTime,
      _originalStartIso: gs.scheduledDateTime
    };
  }

  // Mark slots in the past as unavailable or filter them out.
  // For non-recurring slots with specific dates, check if the date has passed.
  private _processAvailability(slots: any[]) {
    // We treat all displayed times as "Mecca wall-clock" (GMT+3) regardless of the viewer's local timezone.
    // To compare fairly, compute "now" as Mecca wall-clock represented in a UTC timeline.
    const nowMeccaWall = DateTime.utc().plus({ minutes: this.selectedGmtOffset });

    const normalizeTimeForIso = (t: string): string => {
      if (!t) return '00:00:00';
      // Accept HH:mm or HH:mm:ss. If an ISO string sneaks in, ignore and fall back.
      if (t.includes('T') || t.includes('Z')) return '00:00:00';
      const parts = t.split(':');
      const hh = (parts[0] || '00').padStart(2, '0');
      const mm = (parts[1] || '00').padStart(2, '0');
      const ss = (parts[2] || '00').padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    const getSlotStartMeccaWall = (slot: any): DateTime | null => {
      // Prefer the preserved ISO timestamp (already treated as Mecca wall-clock with a Z suffix).
      const iso = slot._originalStartIso || slot.startIsoUtc || slot.startDateTime || slot.start;
      if (typeof iso === 'string' && iso.length > 0 && (iso.includes('T') || iso.includes('Z'))) {
        const dt = DateTime.fromISO(iso, { zone: 'utc' });
        return dt.isValid ? dt : null;
      }

      // Fall back to date + startTime (both represent Mecca wall-clock).
      const dateKey = slot.adjustedDateKey || slot.date;
      if (typeof dateKey === 'string' && dateKey.includes('-') && typeof slot.startTime === 'string') {
        const time = normalizeTimeForIso(slot.startTime);
        const dt = DateTime.fromISO(`${dateKey}T${time}`, { zone: 'utc' });
        return dt.isValid ? dt : null;
      }

      // Last resort: specificDate
      if (slot.specificDate) {
        try {
          const jsDate = new Date(slot.specificDate);
          const dt = DateTime.fromJSDate(jsDate, { zone: 'utc' });
          return dt.isValid ? dt : null;
        } catch {
          return null;
        }
      }

      return null;
    };

    // Clone first so any isAvailable edits persist.
    return (slots || [])
      .map((s) => ({ ...s, isAvailable: typeof s?.isAvailable === 'undefined' ? true : s.isAvailable }))
      .filter((slot) => {
        // Only apply past filtering when we can compute an exact slot start.
        const slotStartMeccaWall = getSlotStartMeccaWall(slot);
        if (!slotStartMeccaWall) return true;

        if (slotStartMeccaWall <= nowMeccaWall) {
          // Non-recurring slots in the past should disappear.
          if (!slot.isRecurring) return false;
          // Recurring slots can remain but should be disabled.
          slot.isAvailable = false;
        }

        return true;
      });
  }

  // Convert slot data to normalized display format
  // Times are now stored as Mecca timezone directly (no UTC conversion needed)
  private _mapUtcSlotToLocal(s: any) {
    const slot: any = { ...s };

    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

    // No offset conversion needed - times are already in Mecca timezone
    const formatTime = (date: Date) => {
      return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    };

    // Helper to try parse common keys
    const isoCandidates = [
      slot.startDateTime,
      slot.startTime,
      slot.startDate,
      slot.start,
    ];

    const isIsoString = (v: any) => typeof v === 'string' && /T|Z/.test(v);
    
    // Check if slot has a specific date (non-recurring)
    // Format: "YYYY-MM-DD" or ISO date
    // If slot has a date field, treat it as non-recurring regardless of isRecurring flag
    if (slot.date && slot.isRecurring === false) {
      try {
        // Parse the specific date with time - times are already in Mecca timezone
        const dateStr = slot.date;
        const timeStr = slot.startTime || '00:00';
        const endTimeStr = slot.endTime || '01:00';
        
        // Parse time strings
        const [hours, minutes] = timeStr.includes('T') 
          ? [new Date(timeStr).getUTCHours(), new Date(timeStr).getUTCMinutes()]
          : timeStr.split(':').map(Number);
        const [endHours, endMinutes] = endTimeStr.includes('T')
          ? [new Date(endTimeStr).getUTCHours(), new Date(endTimeStr).getUTCMinutes()]
          : endTimeStr.split(':').map(Number);
        
        // Parse date
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Create Date objects (treated as Mecca time)
        const startDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
        const endDate = new Date(Date.UTC(year, month - 1, day, endHours, endMinutes));
        
        // Store for booking
        slot.startIsoUtc = startDate.toISOString();
        slot.endIsoUtc = endDate.toISOString();
        slot._originalStartIso = slot.startIsoUtc;
        slot._originalEndIso = slot.endIsoUtc;
        
        // Format for display (no conversion needed)
        slot.startTime = formatTime(startDate);
        slot.endTime = formatTime(endDate);
        slot.displayDate = this.dateLocale.formatDayMonth(startDate);
        slot.dayOfWeek = startDate.getUTCDay();
        slot.specificDate = startDate;
        slot.adjustedDateKey = `${year}-${pad(month)}-${pad(day)}`;
        
        return slot;
      } catch (e) {
        // fallthrough to other handlers
      }
    }

    // If startTime (or other field) is an ISO datetime, parse and use directly
    const foundIso = isoCandidates.find((c) => isIsoString(c));
    if (foundIso) {
      try {
        const startDate = new Date(foundIso);
        // preserve original ISO for booking
        slot.startIsoUtc = foundIso;
        slot._originalStartIso = foundIso;
        
        // Use directly (no offset conversion)
        slot.startTime = formatTime(startDate);
        slot.displayDate = this.dateLocale.formatDayMonth(startDate);
        slot.dayOfWeek = startDate.getUTCDay();
        slot.adjustedDateKey = `${startDate.getUTCFullYear()}-${pad(startDate.getUTCMonth() + 1)}-${pad(startDate.getUTCDate())}`;
        
        // try end
        const endIso =
          slot.endTime || slot.endDate || slot.endDateTime || slot.end;
        if (isIsoString(endIso)) {
          const endDate = new Date(endIso);
          slot.endTime = formatTime(endDate);
          slot.endIsoUtc = endIso;
          slot._originalEndIso = endIso;
        } else if (slot.durationMinutes) {
          const endDate = new Date(
            startDate.getTime() + Number(slot.durationMinutes) * 60000
          );
          slot.endTime = formatTime(endDate);
          slot.endIsoUtc = endDate.toISOString();
          slot._originalEndIso = slot.endIsoUtc;
        }
        return slot;
      } catch (e) {
        // fallthrough to other handlers
      }
    }

    // If startTime is a plain HH:mm string and we have dayOfWeek,
    // construct a Date for display
    if (
      typeof slot.startTime === 'string' &&
      slot.startTime.split(':').length >= 2 &&
      typeof slot.dayOfWeek !== 'undefined'
    ) {
      const parts = slot.startTime.split(':').map((p: string) => Number(p));
      const sh = parts[0] || 0;
      const sm = parts[1] || 0;

      const now = new Date();
      const today = now.getDay();
      let targetDay = Number(slot.dayOfWeek);
      if (isNaN(targetDay)) targetDay = today;

      // For non-recurring slots with a date field
      if (!slot.isRecurring && slot.date && !slot.specificDate) {
        try {
          const [year, month, day] = slot.date.split('-').map(Number);
          const specificDate = new Date(Date.UTC(year, month - 1, day, sh, sm, 0));
          slot.startIsoUtc = specificDate.toISOString();
          slot._originalStartIso = slot.startIsoUtc;
          
          slot.startTime = formatTime(specificDate);
          slot.displayDate = this.dateLocale.formatDayMonth(specificDate);
          slot.dayOfWeek = specificDate.getUTCDay();
          slot.specificDate = specificDate;
          slot.adjustedDateKey = `${year}-${pad(month)}-${pad(day)}`;
          
          if (slot.endTime && typeof slot.endTime === 'string') {
            const ep = slot.endTime.split(':').map((p: string) => Number(p));
            const endDate = new Date(Date.UTC(year, month - 1, day, ep[0] || 0, ep[1] || 0, 0));
            slot.endTime = formatTime(endDate);
            slot.endIsoUtc = endDate.toISOString();
            slot._originalEndIso = slot.endIsoUtc;
          }
          return slot;
        } catch (e) {
          // fallthrough
        }
      }

      // For recurring slots, find next occurrence
      const daysUntil = (targetDay - today + 7) % 7;
      const candidateDate = new Date(
        Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + daysUntil,
          sh,
          sm,
          0
        )
      );
      slot.startIsoUtc = candidateDate.toISOString();
      slot._originalStartIso = slot.startIsoUtc;
      
      slot.startTime = formatTime(candidateDate);
      slot.displayDate = this.dateLocale.formatDayMonth(candidateDate);
      slot.dayOfWeek = candidateDate.getUTCDay();
      slot.adjustedDateKey = `${candidateDate.getUTCFullYear()}-${pad(candidateDate.getUTCMonth() + 1)}-${pad(candidateDate.getUTCDate())}`;
      
      if (slot.durationMinutes) {
        const endDate = new Date(
          candidateDate.getTime() + Number(slot.durationMinutes) * 60000
        );
        slot.endTime = formatTime(endDate);
        slot.endIsoUtc = endDate.toISOString();
        slot._originalEndIso = slot.endIsoUtc;
      } else if (slot.endTime && typeof slot.endTime === 'string') {
        const ep = slot.endTime.split(':').map((p: string) => Number(p));
        const eh = ep[0] || 0;
        const em = ep[1] || 0;
        const candidateEndDate = new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + daysUntil,
            eh,
            em,
            0
          )
        );
        slot.endTime = formatTime(candidateEndDate);
        slot.endIsoUtc = candidateEndDate.toISOString();
        slot._originalEndIso = slot.endIsoUtc;
      }

      return slot;
    }

    // Default: leave slot mostly unchanged
    if (typeof slot.dayOfWeek === 'string') {
      const n = parseInt(slot.dayOfWeek, 10);
      if (!isNaN(n)) slot.dayOfWeek = n;
    }

    return slot;
  }

  // Select an availability slot by index. If the slot is not available, ignore.
  // For group sessions, open the group session modal instead of selecting.
  selectSlot(index: number) {
    if (!this.bookingTeacher || !this.bookingTeacher.availability) return;
    const slot = this.bookingTeacher.availability[index];
    if (!slot || slot.isAvailable === false) return; // cannot select unavailable slot

    // If this is a group session, open the modal instead
    if (slot.isGroupSession) {
      this.openGroupSessionModal(slot);
      return;
    }

    // Toggle selection: selecting same index will deselect
    if (this.selectedSlotIndex === index) {
      this.selectedSlotIndex = null;
    } else {
      this.selectedSlotIndex = index;
    }
  }

  // Simple pay flow placeholder — replace with real payment integration
  payNow() {
    if (this.selectedSlotIndex === null || !this.bookingTeacher) return;
    const slot = this.bookingTeacher.availability[this.selectedSlotIndex];
    this.payProcessing = true;

    // Compute scheduled datetime for the selected slot (next occurrence)
    const scheduledDate = this._computeScheduledDateForSlot(slot);

    // If the slot originally included an exact UTC ISO, prefer sending it
    const scheduledDateIso = slot.startIsoUtc
      ? slot.startIsoUtc
      : scheduledDate
      ? scheduledDate.toISOString()
      : null;

    // Check for time conflict with existing bookings
    if (scheduledDate && this.hasTimeConflict(scheduledDate)) {
      this.payProcessing = false;
      this.showModal = true;
      this.modalType = 'error';
      this.modalMessage = this.translate.instant('booking.errors.time_conflict');
      return;
    }

    // Get the price from the slot (set by teacher when creating availability)
    const slotPrice = slot.price || slot.hourlyRate || slot.rate || 0;
    
    // Get the availability ID to link the booking to the specific slot
    const availabilityId = slot.id || slot._id || slot.availabilityId;

    const payload: any = {
      teacherId:
        this.bookingTeacher.id ||
        this.bookingTeacher.teacherId ||
        this.bookingTeacher._id,
      scheduledDateTime: scheduledDateIso,
      notes: 'individual booking',
      price: slotPrice,
    };
    
    // Include availabilityId if present
    if (availabilityId) {
      payload.availabilityId = availabilityId;
    }

    // Debug logging for booking payload
    console.log('🔍 [DEBUG] Booking payload:', JSON.stringify(payload, null, 2));
    console.log('🔍 [DEBUG] Selected slot:', JSON.stringify(slot, null, 2));
    console.log('🔍 [DEBUG] slot.startIsoUtc:', slot.startIsoUtc);
    console.log('🔍 [DEBUG] scheduledDateIso being sent:', scheduledDateIso);

    // Use the Booking function (which now returns an observable) so we can
    // subscribe and update UI based on success/failure.
    this.Booking(payload).subscribe({
      next: (res) => {
        console.log('Booking/payment created successfully', res);
        this.payProcessing = false;
        // close booking sidebar after successful payment/booking
        this.bookingSidebarOpen = false;
        // Refresh student bookings after successful booking
        this.loadStudentExistingBookings();
        // show success modal with pending message (booking needs teacher approval)
        this.showModal = true;
        this.modalType = 'success';
        this.modalMessage = this.translate.instant('booking.request_sent_message');
      },
      error: (err) => {
        // Show backend error in a modal to the user
        const msg =
          (err && err.error && (err.error.message || err.error.msg)) ||
          err.message ||
          (typeof err === 'string' ? err : JSON.stringify(err));
        
        // Check if it's an insufficient balance error
        const isBalanceError = msg && msg.toLowerCase().includes('insufficient');
        this.isInsufficientBalance = isBalanceError;
        
        this.showModal = true;
        this.modalType = 'error';
        this.modalMessage = isBalanceError 
          ? this.translate.instant('booking.errors.insufficient_balance')
          : msg;
        this.payProcessing = false;
      },
    });
  }

  // Check if the new booking time conflicts with existing bookings
  private hasTimeConflict(newBookingDate: Date): boolean {
    if (!this.studentExistingBookings || this.studentExistingBookings.length === 0) {
      return false;
    }

    const newBookingTime = newBookingDate.getTime();
    // Assume lesson duration is 1 hour (60 minutes)
    const lessonDuration = 60 * 60 * 1000; // in milliseconds

    for (const booking of this.studentExistingBookings) {
      // Parse existing booking datetime
      const existingDateStr = booking.scheduledDateTime || booking.date || booking.startTime;
      if (!existingDateStr) continue;

      const existingDate = new Date(existingDateStr);
      if (isNaN(existingDate.getTime())) continue;

      const existingTime = existingDate.getTime();

      // Check if time slots overlap
      // New booking starts during existing booking OR existing booking starts during new booking
      if (
        (newBookingTime >= existingTime && newBookingTime < existingTime + lessonDuration) ||
        (existingTime >= newBookingTime && existingTime < newBookingTime + lessonDuration)
      ) {
        return true;
      }
    }

    return false;
  }

  // Reusable modal state & helpers (success/error)
  showModal = false;
  modalType: 'success' | 'error' = 'success';
  modalMessage: string | null = null;
  isInsufficientBalance = false;

  closeModal() {
    this.showModal = false;
    this.modalMessage = null;
    this.isInsufficientBalance = false;
  }

  // Open group session details modal
  openGroupSessionModal(slot: any) {
    if (!slot.isGroupSession || !slot.groupSessionData) return;
    this.selectedGroupSession = slot.groupSessionData;
    this.showGroupSessionModal = true;
  }

  // Close group session modal
  closeGroupSessionModal() {
    this.showGroupSessionModal = false;
    this.selectedGroupSession = null;
  }

  // Book group session
  bookGroupSession() {
    if (!this.selectedGroupSession) return;
    
    this.groupBookingProcessing = true;
    
    const payload = {
      groupSessionId: this.selectedGroupSession.id
    };

    this._repo.bookGroupSession(payload).subscribe({
      next: (res) => {
        console.log('Group session booked successfully', res);
        this.groupBookingProcessing = false;
        this.closeGroupSessionModal();
        this.bookingSidebarOpen = false;
        
        // Refresh student bookings
        this.loadStudentExistingBookings();
        
        // Show success modal
        this.showModal = true;
        this.modalType = 'success';
        this.modalMessage = this.translate.instant('booking.group_booking_success');
      },
      error: (err) => {
        console.error('Failed to book group session', err);
        const msg =
          (err && err.error && (err.error.message || err.error.msg)) ||
          err.message ||
          (typeof err === 'string' ? err : JSON.stringify(err));
        
        const isBalanceError = msg && msg.toLowerCase().includes('insufficient');
        this.isInsufficientBalance = isBalanceError;
        
        this.groupBookingProcessing = false;
        this.closeGroupSessionModal();
        
        this.showModal = true;
        this.modalType = 'error';
        this.modalMessage = isBalanceError 
          ? this.translate.instant('booking.errors.insufficient_balance')
          : msg;
      }
    });
  }

  // Format date for group session modal display
  formatGroupSessionDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return this.dateLocale.formatDayMonth(date);
  }

  // Format time for group session modal display
  formatGroupSessionTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  goToWalletTopUp() {
    this.closeModal();
    this.router.navigate(['/wallet/topup']);
  }

  // Compute the next Date instance for a slot object that contains
  // dayOfWeek (0=Sunday..6=Saturday) and startTime ("HH:mm" or "HH:mm:ss").
  private _computeScheduledDateForSlot(slot: any): Date | null {
    if (!slot) return null;
    // If the slot includes an original UTC ISO timestamp, use it directly
    if (slot.startIsoUtc) {
      try {
        return new Date(slot.startIsoUtc);
      } catch (e) {
        // fallthrough to compute based on dayOfWeek/startTime
      }
    }
    const now = new Date();
    const todayDay = now.getDay();
    let targetDay =
      typeof slot.dayOfWeek === 'number'
        ? slot.dayOfWeek
        : parseInt(slot.dayOfWeek, 10);
    if (isNaN(targetDay)) targetDay = todayDay;

    // parse time
    const parts = (slot.startTime || '00:00')
      .split(':')
      .map((p: string) => Number(p));
    const sh = parts[0] || 0;
    const sm = parts[1] || 0;
    const ss = parts[2] || 0;

    let daysUntil = (targetDay - todayDay + 7) % 7;
    // If it's today but the time is earlier or equal to now, schedule for next week
    if (daysUntil === 0) {
      const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        sh,
        sm,
        ss
      );
      if (candidate.getTime() <= now.getTime()) {
        daysUntil = 7;
      }
    }

    const scheduled = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysUntil,
      sh,
      sm,
      ss
    );
    return scheduled;
  }

  // helper to map dayOfWeek number to label (short)
  getDayLabel(day: number) {
    const days = [
      this.translate.instant('days.sunday') || 'Sun',
      this.translate.instant('days.monday') || 'Mon',
      this.translate.instant('days.tuesday') || 'Tue',
      this.translate.instant('days.wednesday') || 'Wed',
      this.translate.instant('days.thursday') || 'Thu',
      this.translate.instant('days.friday') || 'Fri',
      this.translate.instant('days.saturday') || 'Sat',
    ];
    return days[day] || '';
  }

  // computed helpers for template
  get rangeStart(): number {
    return this.AllTeacherCount === 0
      ? 0
      : (this.currentpage - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.currentpage * this.pageSize, this.AllTeacherCount);
  }

  get pagesArray(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get displayPages(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentpage;
    if (total <= 7) return this.pagesArray;

    const pages: (number | string)[] = [];
    pages.push(1);

    let start = Math.max(2, current - 2);
    let end = Math.min(total - 1, current + 2);

    if (start > 2) pages.push('...');

    for (let p = start; p <= end; p++) pages.push(p);

    if (end < total - 1) pages.push('...');

    pages.push(total);
    return pages;
  }

  // create individual handlers for filter changes
  // Return observable so callers can subscribe and handle UI state
  Booking(data: any) {
    // Use the repo method that books an individual session
    return this._repo.bookIndividualSession(data);
  }

  onSearchChange() {
    // debounce search input so we don't call API on every keystroke
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.loadPage(1);
    }, 300);
  }

  onCourseChange() {
    // When the course (specialization) dropdown changes, reload results immediately
    this.loadPage(1);
  }

  onTeacherChange() {
    // update teacher filter but don't auto-search
  }

  // Custom dropdown open states
  coursesOpen = false;
  teachersOpen = false;

  toggleCourses(event?: Event) {
    if (event) event.stopPropagation();
    this.coursesOpen = !this.coursesOpen;
    if (this.coursesOpen) this.teachersOpen = false;
  }

  toggleTeachers(event?: Event) {
    if (event) event.stopPropagation();
    this.teachersOpen = !this.teachersOpen;
    if (this.teachersOpen) this.coursesOpen = false;
  }

  selectCourse(value: string, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedCourse = value;
    this.coursesOpen = false;
    this.onCourseChange();
  }

  selectTeacher(value: string, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedTeacher = value;
    this.teachersOpen = false;
    this.onTeacherChange();
  }

  getCourseLabel$() {
    if (!this.selectedCourse)
      return this.translate.get('all_teachers.all_courses');
    const found = this.courses.find((c) => c.value === this.selectedCourse);
    if (!found) return this.translate.get('all_teachers.all_courses');
    return this.translate.get(found.label || found.value);
  }

  getTeacherLabel$() {
    if (!this.selectedTeacher)
      return this.translate.get('all_teachers.all_teachers');
    const found = this.teachers.find((t) => t.value === this.selectedTeacher);
    if (!found) return this.translate.get('all_teachers.all_teachers');
    return this.translate.get(found.label || found.value);
  }

  /**
   * Get unique dates that have available slots (for calendar highlighting)
   * Returns array of ISO date strings 'YYYY-MM-DD'
   */
  get availableDates(): string[] {
    if (!this.bookingTeacher?.availability) return [];
    
    const datesSet = new Set<string>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const slot of this.bookingTeacher.availability) {
      if (!slot.isAvailable) continue;
      
      // Try to get date from various slot formats
      let dateKey = '';
      
      // First priority: use adjustedDateKey (calculated during slot processing)
      if (slot.adjustedDateKey) {
        const [year, month, day] = slot.adjustedDateKey.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        if (d >= today) {
          dateKey = slot.adjustedDateKey;
        }
      } else if (slot.specificDate) {
        const d = new Date(slot.specificDate);
        if (d >= today) {
          dateKey = this.formatDateKey(d);
        }
      } else if (slot.date) {
        // Format: 'YYYY-MM-DD'
        const [year, month, day] = slot.date.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        if (d >= today) {
          dateKey = slot.date;
        }
      }
      
      if (dateKey) {
        datesSet.add(dateKey);
      }
    }
    
    return Array.from(datesSet);
  }

  /**
   * Format Date to 'YYYY-MM-DD' string
   */
  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Handle date selection from calendar picker
   */
  onCalendarDateSelected(dateKey: string): void {
    this.selectedCalendarDate = dateKey;
    // Reset slot selection when date changes
    this.selectedSlotIndex = null;
  }

  /**
   * Check if current language is RTL (Arabic)
   */
  get isRtl(): boolean {
    return this.translate.currentLang === 'ar';
  }

  // Group availability slots by day for simple display
  // Now filters by selectedCalendarDate if set
  get groupedAvailability(): { day: string; date: string; slots: any[] }[] {
    if (!this.bookingTeacher?.availability) return [];
    
    // Filter slots by selected calendar date if set
    let slotsToGroup = this.bookingTeacher.availability;
    if (this.selectedCalendarDate) {
      slotsToGroup = this.bookingTeacher.availability.filter((slot: any) => {
        // First priority: use adjustedDateKey (calculated during slot processing)
        if (slot.adjustedDateKey) {
          return slot.adjustedDateKey === this.selectedCalendarDate;
        }
        
        // Fallback: Match against slot.date
        if (slot.date === this.selectedCalendarDate) return true;
        
        // Fallback: Match against specificDate
        if (slot.specificDate) {
          const d = new Date(slot.specificDate);
          return this.formatDateKey(d) === this.selectedCalendarDate;
        }
        
        return false;
      });
    }
    
    const groups: { [key: string]: { day: string; date: string; dayOfWeek: number; slots: any[] } } = {};
    
    for (const slot of slotsToGroup) {
      // Create a unique key based on dayOfWeek and displayDate
      const dayKey = `${slot.dayOfWeek}-${slot.displayDate || ''}`;
      
      if (!groups[dayKey]) {
        groups[dayKey] = {
          day: this.getDayLabel(slot.dayOfWeek),
          date: slot.displayDate || '',
          dayOfWeek: slot.dayOfWeek,
          slots: []
        };
      }
      
      groups[dayKey].slots.push(slot);
    }
    
    // Sort groups by dayOfWeek (starting from today)
    const today = new Date().getDay();
    const sortedGroups = Object.values(groups).sort((a, b) => {
      // Calculate days from today
      const aDays = (a.dayOfWeek - today + 7) % 7;
      const bDays = (b.dayOfWeek - today + 7) % 7;
      return aDays - bDays;
    });
    
    // Sort slots within each group by startTime
    for (const group of sortedGroups) {
      group.slots.sort((a, b) => {
        const aTime = a.startTime?.replace(':', '') || '0000';
        const bTime = b.startTime?.replace(':', '') || '0000';
        return aTime.localeCompare(bTime);
      });
    }
    
    return sortedGroups;
  }

  // Get slot index in original array for selection
  getSlotOriginalIndex(slot: any): number {
    if (!this.bookingTeacher?.availability) return -1;
    return this.bookingTeacher.availability.indexOf(slot);
  }

  // Keyboard handlers for accessibility
  onCourseKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleCourses();
    } else if (e.key === 'Escape') {
      this.coursesOpen = false;
    }
  }

  onTeacherKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleTeachers();
    } else if (e.key === 'Escape') {
      this.teachersOpen = false;
    }
  }

  // Close dropdowns when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    // close both dropdowns
    this.coursesOpen = false;
    this.teachersOpen = false;
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }
}
