import { Component, HostListener, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, forkJoin, of, interval, from } from 'rxjs';
import { catchError, takeWhile, mergeMap, map, toArray } from 'rxjs/operators';
import { DateTime } from 'luxon';
import { SideMenuComponent } from '../../../shared/shared-component/side-menu/side-menu.component';
import { SimpleDatePickerComponent } from '../../../shared/shared-component/simple-date-picker/simple-date-picker.component';
import { LessonsHandelingFacadeService } from '../../../services/lessons-teachers/lessons-handeling-facade.service';
import { RepoService } from '../../../Repositories/repo.service';
import { GetTeacherByIDService } from '../../../services/lessons-teachers/get-teacher-by-id.service';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LuxonDateService } from '../../../services/common/luxon-date.service';
import { LanguageService } from '../../../services/language.service';
import { TimezoneService } from '../../../services/scheduling/timezone.service';
import { SlotsService, EnrichedSlot } from '../../../services/scheduling/slots.service';
import { AvailableLessonsService, AvailableLessonsPackage } from '../../../services/v2/available-lessons.service';
import { V2BookingService } from '../../../services/v2/v2-booking.service';
import { TrialService, TrialEligibilityResponse } from '../../../services/v2/trial.service';

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

  // Student wallet balance
  walletBalance: number = 0;
  walletLoading: boolean = false;

  // v2 Available Lessons (Credits)
  availableLessonsEnabled = false;
  availableLessonsLoading = false;
  availableLessonsAvailable = 0;
  availableLessonsReserved = 0;
  showAvailableLessonsModal = false;
  availableLessonsPackages: AvailableLessonsPackage[] = [];
  availableLessonsPackagesLoading = false;
  buyingPackageId: string | null = null;

  // v2 Trial
  trialEnabled = false;
  trialEligibilityLoading = false;
  trialEligibleForBookingTeacher = false;
  trialVerificationFeeUsd = 0;
  trialVerificationStatus: 'unpaid' | 'paid' | 'not_required' | string = 'unpaid';
  trialEligibilityReason: string | null = null;
  showTrialVerificationModal = false;
  trialVerifying = false;

  // Group session modal controls
  showGroupSessionModal = false;
  selectedGroupSession: any = null;
  groupBookingProcessing = false;

  // sample options - replace with real data or inputs as needed
  // label fields are kept as translation keys where possible
  courses: any[] = [];
  coursesLoading = false;

  // Language filter options (teacher languages)
  languages: Array<{ label: string; value: string }> = [
    { label: 'Arabic', value: 'Arabic' },
    { label: 'English', value: 'English' },
    { label: 'German', value: 'German' },
    { label: 'French', value: 'French' },
    { label: 'Turkish', value: 'Turkish' },
    { label: 'Other', value: 'Other' },
  ];

  teachers = [
    { label: 'teachers.ahmed', value: 'ahmed' },
    { label: 'teachers.sara', value: 'sara' },
  ];

  // Language subscription
  private langSubscription?: Subscription;

  // Polling for availability updates (every 30 seconds while sidebar is open)
  private slotsPollingSubscription?: Subscription;
  private readonly POLLING_INTERVAL_MS = 30000; // 30 seconds

  // Nearest-availability sorting (list view)
  private teacherSortRequestId = 0;
  private readonly TEACHERS_SORT_CONCURRENCY = 4;
  private readonly nearestAvailabilityCache = new Map<string, string | null>();
  private readonly TEACHERS_AVAILABILITY_PREFETCH_PAGES_LIMIT = 25;
  private readonly TEACHER_RATING_OVERRIDES_KEY = 'halqa_teacher_rating_overrides';

  // Timezone - User's IANA timezone (auto-detected)
  userIanaTimezone: string = 'UTC';
  userTimezoneDisplay: string = '';

  private readonly specializationTranslationKeyBySlug: Record<string, string> = {
    'quran-memorization': 'teacher_create_profile.specialization_quran_memorization',
    tajweed: 'teacher_create_profile.specialization_tajweed',
    'qiraat-seven': 'teacher_create_profile.specialization_qiraat_seven',
    'qiraat-ten': 'teacher_create_profile.specialization_qiraat_ten',
    tafseer: 'teacher_create_profile.specialization_tafseer',
    'hadith-explanation': 'teacher_create_profile.specialization_hadith_explanation',
    'arabic-language': 'teacher_create_profile.specialization_arabic_language',
  };

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private translate: TranslateService,
    private _repo: RepoService,
    private _getTeacher: GetTeacherByIDService,
    private dateLocale: DateLocaleService,
    private luxonDate: LuxonDateService,
    private languageService: LanguageService,
    private router: Router,
    private route: ActivatedRoute,
    private timezoneService: TimezoneService,
    private slotsService: SlotsService,
    private availableLessonsService: AvailableLessonsService,
    private v2BookingService: V2BookingService,
    private trialService: TrialService
  ) { }

  ngOnInit() {
    // Initialize timezone - auto-detect user's IANA timezone
    this.userIanaTimezone = this.timezoneService.detectClientTimezone();
    this.userTimezoneDisplay = this.formatTimezoneDisplayIana(this.userIanaTimezone);

    // Fetch all teachers on component initialization
    this.loadPage(this.currentpage);
    // load specializations once on init
    this.loadSpecializations();
    // load student's existing bookings for conflict detection
    this.loadStudentExistingBookings();
    // load student wallet balance
    this.loadWalletBalance();

    // load available lessons (feature-flagged)
    this.availableLessonsEnabled = this.availableLessonsService.isEnabled();
    if (this.availableLessonsEnabled) {
      this.refreshAvailableLessonsBalance();
    }

    // trial (feature-flagged)
    this.trialEnabled = this.trialService.isEnabled();

    // Check query param to open available lessons modal
    this.route.queryParams.subscribe(params => {
      if (params['openAvailableLessons'] === '1' && this.availableLessonsEnabled) {
        // Small delay to ensure component is ready
        setTimeout(() => {
          this.openAvailableLessonsModal();
          // Clear the query param to avoid reopening on navigation
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { openAvailableLessons: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        }, 500);
      }
    });
  }

  specializationLabel(value: any): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const slug = this.normalizeSpecializationSlug(raw);
    const key = this.specializationTranslationKeyBySlug[slug];
    if (!key) return raw;

    const translated = this.translate.instant(key);
    return translated && translated !== key ? translated : raw;
  }

  private normalizeSpecializationSlug(value: string): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const lowered = raw.toLowerCase();
    const normalized = lowered
      .replace(/_/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Handle common non-slug inputs (best-effort)
    const aliases: Record<string, string> = {
      'quran-memorization': 'quran-memorization',
      'quran memorization': 'quran-memorization',
      'tajweed': 'tajweed',
      'qiraat-seven': 'qiraat-seven',
      'qiraat-seven-qiraat': 'qiraat-seven',
      'qiraat-ten': 'qiraat-ten',
      'tafseer': 'tafseer',
      'tafsir': 'tafseer',
      'hadith-explanation': 'hadith-explanation',
      'hadith explanation': 'hadith-explanation',
      'arabic-language': 'arabic-language',
      'arabic language': 'arabic-language',
      'arabic-language-teaching': 'arabic-language',
      'تعليم-اللغة-العربية': 'arabic-language',
      'تعليم اللغة العربية': 'arabic-language',
    };

    return aliases[normalized] || normalized;
  }

  private refreshTrialEligibilityForBookingTeacher(): void {
    if (!this.trialEnabled) return;
    const teacherId = this.bookingTeacher?.id;
    if (!teacherId) return;

    this.trialEligibilityLoading = true;
    this.trialService.getEligibility(teacherId).subscribe({
      next: (res: TrialEligibilityResponse) => {
        this.trialEligibleForBookingTeacher = !!res?.eligible;
        this.trialVerificationFeeUsd = Number(res?.verificationFeeUsd || 0);
        this.trialVerificationStatus = (res?.verificationStatus as any) || (this.trialVerificationFeeUsd > 0 ? 'unpaid' : 'not_required');
        this.trialEligibilityReason = (res?.reason as any) ?? null;
        this.trialEligibilityLoading = false;
      },
      error: (err) => {
        console.error('Error loading trial eligibility:', err);
        this.trialEligibleForBookingTeacher = false;
        this.trialVerificationFeeUsd = 0;
        this.trialEligibilityReason = null;
        this.trialEligibilityLoading = false;
      }
    });
  }

  openTrialVerificationModal(): void {
    this.showTrialVerificationModal = true;
  }

  closeTrialVerificationModal(): void {
    this.showTrialVerificationModal = false;
    this.trialVerifying = false;
  }

  startTrialBooking(): void {
    if (!this.trialEnabled || !this.bookingTeacher || this.selectedSlotIndex === null) return;

    // UX: close booking sidebar immediately when user clicks Book Trial.
    this.closeBookingSidebar();

    if (!this.trialEligibleForBookingTeacher) {
      this.showModal = true;
      this.modalType = 'error';
      this.modalMessage = this.trialEligibilityReason || this.translate.instant('trial.not_eligible');
      return;
    }

    const fee = Number(this.trialVerificationFeeUsd || 0);
    const verified = this.trialVerificationStatus === 'paid' || this.trialVerificationStatus === 'not_required' || fee === 0;

    if (!verified) {
      this.openTrialVerificationModal();
      return;
    }

    this._bookTrialSelectedSlot();
  }

  confirmTrialVerificationAndBook(): void {
    if (!this.trialEnabled || this.trialVerifying) return;

    this.trialVerifying = true;
    const idempotencyKey = this._generateIdempotencyKey();
    this.trialService.verify('wallet', idempotencyKey).subscribe({
      next: () => {
        this.trialVerifying = false;
        this.closeTrialVerificationModal();
        this.trialVerificationStatus = 'paid';
        this._bookTrialSelectedSlot();
      },
      error: (err) => {
        const msg =
          (err && err.error && (err.error.message || err.error.msg)) ||
          err.message ||
          'Trial verification failed';

        const isBalanceError = msg && msg.toLowerCase().includes('insufficient');
        this.isInsufficientBalance = isBalanceError;

        this.trialVerifying = false;
        this.closeTrialVerificationModal();

        this.showModal = true;
        this.modalType = 'error';
        this.modalMessage = isBalanceError
          ? this.translate.instant('booking.errors.insufficient_balance')
          : msg;
      }
    });
  }

  private _bookTrialSelectedSlot(): void {
    if (!this.bookingTeacher || this.selectedSlotIndex === null) return;

    const slot = this.bookingTeacher.availability[this.selectedSlotIndex];
    const teacherId = this.bookingTeacher.id;
    const slotId = slot?.slotId || slot?.id;

    if (!teacherId || !slotId) return;

    if (this.payProcessing) return;
    this.payProcessing = true;

    // Match existing UX: close sidebar immediately.
    this.closeBookingSidebar();

    const idempotencyKey = this._generateIdempotencyKey();
    this.v2BookingService.bookSlot({ teacherId, slotId, method: 'trial', idempotencyKey }).subscribe({
      next: () => {
        this.payProcessing = false;
        this.loadStudentExistingBookings();
        this.refreshTrialEligibilityForBookingTeacher();

        this.showModal = true;
        this.modalType = 'success';
        this.modalMessage = this.translate.instant('trial.success');
      },
      error: (err) => {
        const msg =
          (err && err.error && (err.error.message || err.error.msg)) ||
          err.message ||
          'Trial booking failed';

        const errCode = err?.error?.error?.code || err?.error?.code;
        const isNotEligible = errCode === 'TRIAL_NOT_ELIGIBLE';
        const isVerificationRequired = errCode === 'TRIAL_VERIFICATION_REQUIRED';
        const isSlotTakenError = err.status === 409 || (msg && msg.toLowerCase().includes('already been booked'));

        if (isVerificationRequired) {
          this.payProcessing = false;
          this.openTrialVerificationModal();
          return;
        }

        this.showModal = true;
        this.modalType = 'error';

        if (isNotEligible) {
          this.modalMessage = this.translate.instant('trial.not_eligible');
        } else if (isSlotTakenError) {
          this.modalMessage =
            this.translate.instant('booking.errors.slot_already_booked') ||
            'This slot has already been booked. Please select a different time.';
          if (this.bookingTeacher?.id) {
            this.loadTeacherSlotsWithFallback(this.bookingTeacher.id, this.bookingTeacher);
          }
        } else {
          this.modalMessage = msg;
        }

        this.payProcessing = false;
      }
    });
  }

  private refreshAvailableLessonsBalance(): void {
    if (!this.availableLessonsEnabled) return;

    this.availableLessonsLoading = true;
    this.availableLessonsService.getBalance().subscribe({
      next: (bal) => {
        this.availableLessonsAvailable = Number((bal as any)?.available || 0);
        this.availableLessonsReserved = Number((bal as any)?.reserved || 0);
        this.availableLessonsLoading = false;
      },
      error: (err) => {
        console.error('Error loading available lessons balance:', err);
        this.availableLessonsAvailable = 0;
        this.availableLessonsReserved = 0;
        this.availableLessonsLoading = false;
      }
    });
  }

  openAvailableLessonsModal(): void {
    if (!this.availableLessonsEnabled) return;
    this.showAvailableLessonsModal = true;
    this.refreshAvailableLessonsBalance();
    this.loadAvailableLessonsPackages();
  }

  closeAvailableLessonsModal(): void {
    this.showAvailableLessonsModal = false;
    this.buyingPackageId = null;
  }

  private loadAvailableLessonsPackages(): void {
    if (!this.availableLessonsEnabled) return;
    this.availableLessonsPackagesLoading = true;
    this.availableLessonsService.getPackages().subscribe({
      next: (pkgs) => {
        this.availableLessonsPackages = Array.isArray(pkgs) ? pkgs : [];
        this.availableLessonsPackagesLoading = false;
      },
      error: (err) => {
        console.error('Error loading available lessons packages:', err);
        this.availableLessonsPackages = [];
        this.availableLessonsPackagesLoading = false;
      }
    });
  }

  buyAvailableLessonsWithWallet(packageId: string): void {
    if (!this.availableLessonsEnabled || !packageId || this.buyingPackageId) return;

    this.buyingPackageId = packageId;
    this.availableLessonsService.buyWithWallet(packageId).subscribe({
      next: () => {
        // Wallet may change due to purchase; refresh best-effort
        this.loadWalletBalance();

        this.availableLessonsService.getBalance().subscribe({
          next: (bal) => {
            this.availableLessonsAvailable = Number((bal as any)?.available || 0);
            this.availableLessonsReserved = Number((bal as any)?.reserved || 0);
            this.buyingPackageId = null;
            this.closeAvailableLessonsModal();

            this.showModal = true;
            this.modalType = 'success';
            this.modalMessage = this.translate.instant('available_lessons.badge.has', {
              count: this.availableLessonsAvailable,
            });
          },
          error: () => {
            this.buyingPackageId = null;
            this.closeAvailableLessonsModal();

            this.showModal = true;
            this.modalType = 'success';
            this.modalMessage = this.translate.instant('common.success');
          }
        });
      },
      error: (err) => {
        const msg =
          (err && err.error && (err.error.message || err.error.msg)) ||
          err.message ||
          'Purchase failed';

        const errCode = err?.error?.error?.code || err?.error?.code;
        const isInsufficientWallet = errCode === 'INSUFFICIENT_WALLET';
        const isBalanceError = isInsufficientWallet || (msg && msg.toLowerCase().includes('insufficient'));
        this.isInsufficientBalance = !!isBalanceError;
        this.buyingPackageId = null;
        this.closeAvailableLessonsModal();

        this.showModal = true;
        this.modalType = 'error';

        if (isInsufficientWallet) {
          const details = err?.error?.error?.details || {};
          const requiredAmount = Number(details?.requiredAmount ?? 0);
          const currentBalance = Number(details?.currentBalance ?? this.walletBalance ?? 0);
          const shortfall = Number(details?.shortfall ?? Math.max(0, requiredAmount - currentBalance));

          this.modalMessage = this.translate.instant('wallet.insufficient_balance_detailed', {
            currentBalance,
            shortfall,
          });
        } else {
          this.modalMessage = isBalanceError
            ? this.translate.instant('booking.errors.insufficient_balance')
            : msg;
        }
      }
    });
  }

  /**
   * Load student wallet balance
   */
  private loadWalletBalance(): void {
    this.walletLoading = true;
    this._repo.getStudentWallet().subscribe({
      next: (wallet) => {
        this.walletBalance = wallet?.currentBalance || 0;
        this.walletLoading = false;
      },
      error: (err) => {
        console.error('Error loading wallet balance:', err);
        this.walletBalance = 0;
        this.walletLoading = false;
      }
    });
  }

  /**
   * Format IANA timezone to display string
   */
  private formatTimezoneDisplayIana(ianaZone: string): string {
    try {
      const now = DateTime.now().setZone(ianaZone);
      const offset = now.offset;
      const hours = Math.floor(Math.abs(offset) / 60);
      const minutes = Math.abs(offset) % 60;
      const sign = offset >= 0 ? '+' : '-';
      const offsetStr = minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
      // Display city name from IANA zone (e.g., "America/New_York" -> "New York")
      const cityName = ianaZone.split('/').pop()?.replace(/_/g, ' ') || ianaZone;
      return `${cityName} (${offsetStr})`;
    } catch {
      return ianaZone;
    }
  }



  // Load student's existing bookings to check for time conflicts
  private loadStudentExistingBookings(): void {
    this.slotsService.getStudentBookings().subscribe({
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

    const hasSearch = !!(this.searchText && this.searchText.trim().length > 0);
    const hasFilters = !!(
      (this.selectedCourse && this.selectedCourse.toString().trim().length > 0) ||
      (this.selectedTeacher && this.selectedTeacher.toString().trim().length > 0) ||
      (this.selectedLanguage !== null && this.selectedLanguage !== undefined) ||
      (this.minRating !== null && this.minRating !== undefined) ||
      (this.maxHourlyRate !== null && this.maxHourlyRate !== undefined) ||
      (this.minExperience !== null && this.minExperience !== undefined) ||
      typeof this.onlyAvailable === 'boolean'
    );

    const useSearchEndpoint = hasSearch || hasFilters;

    const baseOptions: any = {
      search: this.searchText || undefined,
      specialization: this.selectedCourse || undefined,
      language: this.selectedLanguage || undefined,
      minRating: this.minRating || undefined,
      maxHourlyRate: this.maxHourlyRate || undefined,
      minExperience: this.minExperience || undefined,
    };

    // When user explicitly filters availability, respect backend paging as-is.
    if (typeof this.onlyAvailable === 'boolean') {
      const options = {
        ...baseOptions,
        isAvailable: this.onlyAvailable,
        page,
        pageSize: this.pageSize,
      };

      this._repo.searchTeachers(options).subscribe({
        next: (response) => {
          this.allTeachers = this.extractTeachersArray(response);
          this.applyRatingOverridesToList(this.allTeachers);

          this.AllTeacherCount = this.extractTotalCount(response, this.allTeachers);
          this.currentpage = page;
          this.totalPages = Math.max(1, Math.ceil(this.AllTeacherCount / this.pageSize));
          this.loading = false;
        },
        error: (err) => {
          console.error('Failed to load teachers', err);
          this.loading = false;
        }
      });

      return;
    }

    // Default mode: availability-first across pagination (computed from bookable slots).
    this.loadTeachersAvailabilityFirstComputed(page, baseOptions, useSearchEndpoint);
  }

  private extractTeachersArray(response: any): any[] {
    if (!response) return [];
    const list = (response as any).teachers || (response as any).items || (response as any).data || [];
    return Array.isArray(list) ? list : [];
  }

  private extractTotalCount(response: any, fallbackTeachers: any[]): number {
    const total = response?.totalCount ?? response?.total;
    if (typeof total === 'number' && Number.isFinite(total)) return total;
    return Array.isArray(fallbackTeachers) ? fallbackTeachers.length : 0;
  }

  private getTeacherIdString(teacher: any): string {
    const rawId = teacher?.id ?? teacher?.userId ?? teacher?.teacherId;
    if (rawId === null || rawId === undefined) return '';
    if (typeof rawId !== 'string' && typeof rawId !== 'number') return '';
    return String(rawId).trim();
  }

  /**
   * De-dupe teachers by id while keeping the first occurrence.
   * Teachers with missing ids are kept (not deduped).
   */
  private dedupeTeachersById(list: any[]): any[] {
    if (!Array.isArray(list) || list.length === 0) return [];

    const seen = new Set<string>();
    const out: any[] = [];

    for (const t of list) {
      const id = this.getTeacherIdString(t);
      if (!id) {
        out.push(t);
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(t);
    }

    return out;
  }

  /**
   * Availability-first pagination that does NOT rely on backend isAvailable.
   * Instead, it computes each teacher's nearest bookable slot using SlotsService (timezone-safe),
   * then paginates the resulting global order so page 1/2 reflect true availability priority.
   */
  private loadTeachersAvailabilityFirstComputed(page: number, baseOptions: any, useSearchEndpoint: boolean): void {
    if (!isPlatformBrowser(this.platformId)) {
      // SSR: fall back to backend paging without heavy slot lookups.
      this.loadPageBackendOnly(page, baseOptions, useSearchEndpoint);
      return;
    }

    const requestId = ++this.teacherSortRequestId;
    const uiPageSize = this.pageSize;
    const targetStart = (page - 1) * uiPageSize;
    const targetEnd = targetStart + uiPageSize;

    const now = DateTime.now().setZone(this.userIanaTimezone);
    const fromDate = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const toDate = now.plus({ days: 29 }).toFormat('yyyy-MM-dd');

    const available: any[] = [];
    const unavailable: any[] = [];
    const seen = new Set<string>();

    let serverPage = 1;
    const serverPageSize = Math.max(20, uiPageSize);
    let totalCount: number | null = null;

    const finalizeFromCurrentBuffers = () => {
      // Sort available by earliest next slot; keep stable order for ties.
      const availableSorted = [...available].sort((a: any, b: any) => {
        const aNext: string | null = a?.__nextAvailableAtUtc ?? null;
        const bNext: string | null = b?.__nextAvailableAtUtc ?? null;
        if (aNext && bNext) {
          const cmp = aNext.localeCompare(bNext);
          return cmp !== 0 ? cmp : (a?.__scanIndex ?? 0) - (b?.__scanIndex ?? 0);
        }
        if (aNext && !bNext) return -1;
        if (!aNext && bNext) return 1;
        return (a?.__scanIndex ?? 0) - (b?.__scanIndex ?? 0);
      });

      const combined = [...availableSorted, ...unavailable];
      const pageItems = combined.slice(targetStart, targetEnd);
      this.allTeachers = pageItems;
      this.applyRatingOverridesToList(this.allTeachers);
      this.loading = false;
    };

    const fetchServerPage = (p: number) => {
      if (useSearchEndpoint) {
        return this._repo.searchTeachers({ ...baseOptions, page: p, pageSize: serverPageSize });
      }
      return this._repo.getAllTeachers(p, serverPageSize);
    };

    const processServerPage = (p: number) => {
      fetchServerPage(p).pipe(catchError(() => of(null))).subscribe({
        next: (response) => {
          if (requestId !== this.teacherSortRequestId) return;

          const teachers = this.extractTeachersArray(response);
          if (totalCount === null) {
            totalCount = this.extractTotalCount(response, teachers);
            this.AllTeacherCount = totalCount;
            this.currentpage = page;
            this.totalPages = Math.max(1, Math.ceil(totalCount / uiPageSize));
          }

          if (!teachers || teachers.length === 0) {
            finalizeFromCurrentBuffers();
            return;
          }

          const pageSnapshot = teachers.map((t: any, idx: number) => ({ t, idx }));

          from(pageSnapshot)
            .pipe(
              mergeMap(
                ({ t, idx }: any) => {
                  const teacherId = this.getTeacherIdString(t);
                  const scanIndex = (p - 1) * serverPageSize + idx;

                  if (teacherId && seen.has(teacherId)) {
                    return of(null);
                  }

                  if (!teacherId) {
                    return of({ teacher: t, teacherId: '', nextAtUtc: null as string | null, scanIndex });
                  }

                  if (this.nearestAvailabilityCache.has(teacherId)) {
                    return of({
                      teacher: t,
                      teacherId,
                      nextAtUtc: this.nearestAvailabilityCache.get(teacherId) ?? null,
                      scanIndex,
                    });
                  }

                  return this.slotsService
                    .getEnrichedSlots(teacherId, fromDate, toDate, 60, this.userIanaTimezone)
                    .pipe(
                      map((result: any) => {
                        const slots: EnrichedSlot[] = (result?.slots || []) as EnrichedSlot[];
                        let nextAtUtc: string | null = null;
                        for (const s of slots) {
                          if (!s || !s.isBookable || !s.startAtUtc) continue;
                          if (nextAtUtc === null || s.startAtUtc < nextAtUtc) {
                            nextAtUtc = s.startAtUtc;
                          }
                        }
                        this.nearestAvailabilityCache.set(teacherId, nextAtUtc);
                        return { teacher: t, teacherId, nextAtUtc, scanIndex };
                      }),
                      catchError(() => {
                        this.nearestAvailabilityCache.set(teacherId, null);
                        return of({ teacher: t, teacherId, nextAtUtc: null as string | null, scanIndex });
                      })
                    );
                },
                this.TEACHERS_SORT_CONCURRENCY
              ),
              toArray(),
              map((rows: any[]) => (rows || []).filter(Boolean))
            )
            .subscribe({
              next: (rows: Array<{ teacher: any; teacherId: string; nextAtUtc: string | null; scanIndex: number }>) => {
                if (requestId !== this.teacherSortRequestId) return;

                // Preserve original order within this fetched server page.
                rows.sort((a, b) => (a.scanIndex ?? 0) - (b.scanIndex ?? 0));

                for (const r of rows) {
                  const t = r.teacher;
                  const id = r.teacherId;
                  if (id) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                  }

                  t.__nextAvailableAtUtc = r.nextAtUtc;
                  t.__scanIndex = r.scanIndex;

                  if (r.nextAtUtc) {
                    available.push(t);
                  } else {
                    unavailable.push(t);
                  }
                }

                const availableSortedCount = available.length;
                const combinedCount = availableSortedCount + unavailable.length;

                const hasEnoughForTarget = combinedCount >= targetEnd;
                const reachedLastServerPage = totalCount !== null
                  ? (serverPage * serverPageSize) >= totalCount
                  : teachers.length < serverPageSize;

                const reachedPrefetchLimit = serverPage >= this.TEACHERS_AVAILABILITY_PREFETCH_PAGES_LIMIT;

                if (hasEnoughForTarget || reachedLastServerPage || reachedPrefetchLimit) {
                  finalizeFromCurrentBuffers();
                  return;
                }

                serverPage += 1;
                processServerPage(serverPage);
              },
              error: () => {
                // If per-teacher processing fails unexpectedly, fall back to backend-only mode.
                if (requestId !== this.teacherSortRequestId) return;
                this.loadPageBackendOnly(page, baseOptions, useSearchEndpoint);
              }
            });
        },
        error: (err) => {
          if (requestId !== this.teacherSortRequestId) return;
          console.error('Failed to load teachers', err);
          this.loading = false;
        }
      });
    };

    // Start scanning from page 1 to build global ordering for the requested UI page.
    serverPage = 1;
    processServerPage(serverPage);
  }

  private loadPageBackendOnly(page: number, baseOptions: any, useSearchEndpoint: boolean): void {
    const pageSize = this.pageSize;

    const obs = useSearchEndpoint
      ? this._repo.searchTeachers({ ...baseOptions, page, pageSize })
      : this._repo.getAllTeachers(page, pageSize);

    obs.subscribe({
      next: (response) => {
        this.allTeachers = this.extractTeachersArray(response);
        this.applyRatingOverridesToList(this.allTeachers);
        this.AllTeacherCount = this.extractTotalCount(response, this.allTeachers);
        this.currentpage = page;
        this.totalPages = Math.max(1, Math.ceil(this.AllTeacherCount / pageSize));
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load teachers', err);
        this.loading = false;
      }
    });
  }

  /**
   * Best-effort: sort current page teachers by earliest upcoming available slot.
   *
   * Safety:
   * - Runs only in browser (avoid SSR triggering many HTTP calls)
   * - Limits concurrency
   * - Stable fallback order (keeps original order for teachers with no availability / errors)
   * - Ignores stale results if user changes page/filters mid-flight
   */
  private sortTeachersByNearestAvailability(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!Array.isArray(this.allTeachers) || this.allTeachers.length < 2) return;

    const requestId = ++this.teacherSortRequestId;
    const teachersSnapshot = [...this.allTeachers];

    // Keep stable original order as fallback
    for (let i = 0; i < teachersSnapshot.length; i++) {
      const t: any = teachersSnapshot[i];
      if (t && t.__origIndex === undefined) {
        t.__origIndex = i;
      } else if (t) {
        t.__origIndex = i;
      }
      // reset computed field to avoid showing stale values across pages
      if (t) t.__nextAvailableAtUtc = null;
    }

    const now = DateTime.now().setZone(this.userIanaTimezone);
    const fromDate = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const toDate = now.plus({ days: 29 }).toFormat('yyyy-MM-dd');

    const teacherIds: string[] = teachersSnapshot
      .map((t: any) => {
        const rawId = t?.id ?? t?.userId ?? t?.teacherId;
        if (rawId === null || rawId === undefined) return null;
        if (typeof rawId !== 'string' && typeof rawId !== 'number') return null;
        const id = String(rawId).trim();
        return id.length > 0 ? id : null;
      })
      .filter((id: string | null): id is string => typeof id === 'string');

    from(teacherIds)
      .pipe(
        mergeMap(
          (teacherId: string) => {
            if (this.nearestAvailabilityCache.has(teacherId)) {
              return of({ teacherId, nextAtUtc: this.nearestAvailabilityCache.get(teacherId) ?? null });
            }

            return this.slotsService
              .getEnrichedSlots(teacherId, fromDate, toDate, 60, this.userIanaTimezone)
              .pipe(
                map((result: any) => {
                  const slots: EnrichedSlot[] = (result?.slots || []) as EnrichedSlot[];
                  let nextAtUtc: string | null = null;
                  for (const s of slots) {
                    if (!s || !s.isBookable || !s.startAtUtc) continue;
                    if (nextAtUtc === null || s.startAtUtc < nextAtUtc) {
                      nextAtUtc = s.startAtUtc;
                    }
                  }
                  this.nearestAvailabilityCache.set(teacherId, nextAtUtc);
                  return { teacherId, nextAtUtc };
                }),
                catchError(() => {
                  this.nearestAvailabilityCache.set(teacherId, null);
                  return of({ teacherId, nextAtUtc: null });
                })
              );
          },
          this.TEACHERS_SORT_CONCURRENCY
        ),
        toArray()
      )
      .subscribe((rows: Array<{ teacherId: string; nextAtUtc: string | null }>) => {
        if (requestId !== this.teacherSortRequestId) return;

        const byId = new Map<string, string | null>(rows.map(r => [r.teacherId, r.nextAtUtc]));
        for (const t of teachersSnapshot as any[]) {
          const rawId = t?.id ?? t?.userId ?? t?.teacherId;
          const id = rawId === null || rawId === undefined ? '' : String(rawId);
          t.__nextAvailableAtUtc = id ? (byId.get(id) ?? null) : null;
        }

        teachersSnapshot.sort((a: any, b: any) => {
          const aNext: string | null = a?.__nextAvailableAtUtc ?? null;
          const bNext: string | null = b?.__nextAvailableAtUtc ?? null;
          if (aNext && bNext) {
            const cmp = aNext.localeCompare(bNext);
            return cmp !== 0 ? cmp : (a?.__origIndex ?? 0) - (b?.__origIndex ?? 0);
          }
          if (aNext && !bNext) return -1;
          if (!aNext && bNext) return 1;
          return (a?.__origIndex ?? 0) - (b?.__origIndex ?? 0);
        });

        // Apply sorted list only if the underlying list hasn't changed shape
        if (this.allTeachers.length === teachersSnapshot.length) {
          this.allTeachers = teachersSnapshot;
        }
      });
  }

  private readTeacherRatingOverrides(): Record<string, { averageRating?: number; totalReviews?: number }> {
    if (!isPlatformBrowser(this.platformId)) return {};
    try {
      const raw = localStorage.getItem(this.TEACHER_RATING_OVERRIDES_KEY);
      const map = raw ? JSON.parse(raw) : {};
      return map && typeof map === 'object' ? map : {};
    } catch {
      return {};
    }
  }

  private applyRatingOverrideToTeacher(teacher: any): void {
    if (!isPlatformBrowser(this.platformId) || !teacher) return;
    const overrides = this.readTeacherRatingOverrides();
    const teacherId = String(teacher.id || teacher.teacherId || teacher.userId || '');
    if (!teacherId) return;
    const o = overrides[teacherId];
    if (!o) return;

    if (typeof o.averageRating === 'number') {
      teacher.averageRating = o.averageRating;
    }
    if (typeof o.totalReviews === 'number') {
      teacher.totalReviews = o.totalReviews;
    }
  }

  private applyRatingOverridesToList(list: any[]): void {
    if (!isPlatformBrowser(this.platformId) || !Array.isArray(list) || list.length === 0) return;
    for (const t of list) {
      this.applyRatingOverrideToTeacher(t);
    }
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

        // Apply locally-saved rating overrides (best-effort; browser-only)
        this.applyRatingOverrideToTeacher(this.teacherById);

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
    // If the teacher profile side-menu is open, close it when starting booking.
    // This prevents having both the profile sidebar and booking sidebar visible.
    this.sidebarOpen = false;

    // show spinner on the clicked Book button
    this.loadingBookId = teacherId;

    // 1. Fetch teacher details first
    this._getTeacher.getTeacherById(teacherId).subscribe({
      next: (teacher) => {
        // 2. Try V1 API first, fallback to legacy if not available
        this.loadTeacherSlotsWithFallback(teacherId, teacher);
      },
      error: (err) => {
        console.error('Failed to load teacher details', err);
        this.loadingBookId = null;
      }
    });

    // Refresh available lessons when starting booking (best-effort)
    if (this.availableLessonsEnabled) {
      this.refreshAvailableLessonsBalance();
    }
  }

  /**
   * Load teacher slots using V1 API with fallback to legacy API
   */
  private loadTeacherSlotsWithFallback(teacherId: string, teacher: any): void {
    const now = DateTime.now().setZone(this.userIanaTimezone);
    // Backend treats from/to as TEACHER-local anchor dates and enforces a max span of 30 days.
    // Shift the window by -1 day to avoid day-boundary mismatches (DST/zone edge cases) while keeping <= 30 days.
    const fromDate = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const toDate = now.plus({ days: 29 }).toFormat('yyyy-MM-dd');

    this.slotsService.getEnrichedSlots(teacherId, fromDate, toDate, 60, this.userIanaTimezone)
      .pipe(
        catchError(err => {
          console.warn('V1 API not available, falling back to legacy:', err);
          // Return null to trigger fallback
          return of(null);
        })
      )
      .subscribe((result: any) => {
        if (result === null) {
          // Fallback ONLY when the V1 call fails.
          this.loadLegacyAvailability(teacher);
          return;
        }

        // V1 call succeeded (even if empty). Empty means "no bookable availability".
        this.processEnrichedSlots((result?.slots || []) as EnrichedSlot[], teacher);
      });
  }

  /**
   * Process enriched slots from V1 API
   */
  private processEnrichedSlots(enrichedSlots: EnrichedSlot[], teacher: any): void {
    // Only show slots that are actually bookable (available AND not in the past)
    const bookableSlots = (enrichedSlots || []).filter(s => s.isBookable);

    // Map enriched slots to the format expected by the template
    const mappedSlots = bookableSlots.map((slot: EnrichedSlot) => {
      const startTime = slot.viewerLocal12h;
      const endTime = this._calculateEndTime(startTime, slot.durationMin);
      return {
        ...slot,
        // Map properties for template compatibility
        startTime,
        endTime,
        displayTimeRange: this._formatTimeRange(startTime, endTime),
        price: teacher.hourlyRate, // Use teacher's hourly rate
        isAvailable: slot.isBookable, // Use isBookable from EnrichedSlot

        // Date handling
        date: slot.viewerLocalDate,
        displayDate: DateTime.fromISO(slot.viewerLocalDate).toFormat('MMM d'),
        adjustedDateKey: slot.viewerLocalDate,

        // Calculate day of week (0-6) from date
        dayOfWeek: DateTime.fromISO(slot.viewerLocalDate).weekday % 7,

        // Preserve original slotId for booking
        id: slot.slotId, // Ensure ID is mapped correctly
        startIsoUtc: slot.startAtUtc
      };
    });

    this.bookingTeacher = {
      ...teacher,
      availability: mappedSlots
    };

    this.bookingSidebarOpen = true;
    this.selectedSlotIndex = null;
    this.selectedCalendarDate = null;
    this.loadingBookId = null;

    // Trial eligibility (best-effort)
    this.refreshTrialEligibilityForBookingTeacher();

    // Start polling for availability updates
    this.startSlotsPolling(teacher.id || teacher.userId);
  }

  /**
   * Fallback: Load availability from legacy teacher profile API
   */
  private loadLegacyAvailability(teacher: any): void {
    const legacySlots = teacher.availability || [];
    
    // Map legacy slots to the expected format
    const nowUtc = DateTime.utc();
    const mappedSlots = legacySlots.map((slot: any) => {
      let displayDate = '';
      let adjustedDateKey = '';
      let dayOfWeek = slot.dayOfWeek || 0;
      let startTime12h = '';
      let endTime12h = '';
      let isPast = false;

      if (slot.startDateTime) {
        try {
          const localStart = this.timezoneService.utcToLocal(slot.startDateTime, this.userIanaTimezone);
          displayDate = localStart.toFormat('MMM d');
          adjustedDateKey = localStart.toFormat('yyyy-MM-dd');
          dayOfWeek = localStart.weekday % 7;
          startTime12h = localStart.toFormat('h:mm a');

          try {
            const startUtc = DateTime.fromISO(slot.startDateTime, { zone: 'utc' });
            isPast = startUtc.isValid && startUtc < nowUtc;
          } catch {
            isPast = false;
          }
          
          const localEnd = slot.endDateTime 
            ? this.timezoneService.utcToLocal(slot.endDateTime, this.userIanaTimezone)
            : localStart.plus({ hours: 1 });
          endTime12h = localEnd.toFormat('h:mm a');
        } catch {
          // Use raw values if conversion fails
          startTime12h = slot.startTime || '';
          endTime12h = slot.endTime || '';
        }
      } else {
        // Legacy format without datetime
        startTime12h = slot.startTime || '';
        endTime12h = slot.endTime || '';
      }

      return {
        ...slot,
        startTime: startTime12h,
        endTime: endTime12h,
        displayTimeRange: this._formatTimeRange(startTime12h, endTime12h),
        price: teacher.hourlyRate,
        // Only show bookable slots in the UI: available AND not in the past.
        isAvailable: (slot.isAvailable !== false && !slot.isBooked) && !isPast,
        displayDate: displayDate,
        adjustedDateKey: adjustedDateKey,
        dayOfWeek: dayOfWeek,
        id: slot.id || slot.availabilityId,
        startIsoUtc: slot.startDateTime
      };
    });

    // Hide unavailable/past slots completely.
    const bookableOnly = mappedSlots.filter((s: any) => s.isAvailable);

    this.bookingTeacher = {
      ...teacher,
      availability: bookableOnly
    };

    this.bookingSidebarOpen = true;
    this.selectedSlotIndex = null;
    this.selectedCalendarDate = null;
    this.loadingBookId = null;

    // Trial eligibility (best-effort)
    this.refreshTrialEligibilityForBookingTeacher();

    // Start polling for availability updates
    this.startSlotsPolling(teacher.id || teacher.userId);
  }

  /**
   * Start polling for availability updates every 30 seconds
   */
  private startSlotsPolling(teacherId: string): void {
    // Stop any existing polling
    this.stopSlotsPolling();

    this.slotsPollingSubscription = interval(this.POLLING_INTERVAL_MS)
      .pipe(takeWhile(() => this.bookingSidebarOpen))
      .subscribe(() => {
        if (this.bookingTeacher && this.bookingSidebarOpen) {
          console.log('[Polling] Refreshing teacher availability...');
          this.refreshBookingSlots(teacherId);
        }
      });
  }

  /**
   * Stop polling for availability updates
   */
  private stopSlotsPolling(): void {
    if (this.slotsPollingSubscription) {
      this.slotsPollingSubscription.unsubscribe();
      this.slotsPollingSubscription = undefined;
    }
  }

  /**
   * Refresh slots without resetting selection (for polling)
   */
  private refreshBookingSlots(teacherId: string): void {
    const now = DateTime.now().setZone(this.userIanaTimezone);
    // Keep polling window aligned with initial load (see loadTeacherSlotsWithFallback)
    const fromDate = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const toDate = now.plus({ days: 29 }).toFormat('yyyy-MM-dd');

    this.slotsService.getEnrichedSlots(teacherId, fromDate, toDate, 60, this.userIanaTimezone)
      .pipe(catchError(() => of(null)))
      .subscribe((result: any) => {
        if (result && result.slots && result.slots.length > 0 && this.bookingTeacher) {
          // Update slots while preserving current selection
          const currentSelection = this.selectedSlotIndex;
          const currentDate = this.selectedCalendarDate;
          
          const mappedSlots = result.slots.map((slot: EnrichedSlot) => {
            const startTime = slot.viewerLocal12h;
            const endTime = this._calculateEndTime(startTime, slot.durationMin);
            return {
              ...slot,
              startTime,
              endTime,
              displayTimeRange: this._formatTimeRange(startTime, endTime),
              price: this.bookingTeacher.hourlyRate,
              isAvailable: slot.isBookable,
              date: slot.viewerLocalDate,
              displayDate: DateTime.fromISO(slot.viewerLocalDate).toFormat('MMM d'),
              adjustedDateKey: slot.viewerLocalDate,
              dayOfWeek: DateTime.fromISO(slot.viewerLocalDate).weekday % 7,
              id: slot.slotId,
              startIsoUtc: slot.startAtUtc
            };
          });

          this.bookingTeacher = {
            ...this.bookingTeacher,
            availability: mappedSlots
          };

          // Restore selection if still valid
          this.selectedCalendarDate = currentDate;
          // Validate that selected slot is still available
          if (currentSelection !== null) {
            const selectedSlot = mappedSlots[currentSelection];
            if (!selectedSlot || !selectedSlot.isAvailable) {
              this.selectedSlotIndex = null; // Reset if no longer available
            } else {
              this.selectedSlotIndex = currentSelection;
            }
          }
        }
      });
  }

  private _calculateEndTime(startTime12h: string, durationMin: number): string {
    try {
      // Parse "3:00 PM"
      const dt = DateTime.fromFormat(startTime12h, 'h:mm a');
      return dt.plus({ minutes: durationMin }).toFormat('h:mm a');
    } catch {
      return '';
    }
  }

  private _formatTimeRange(startTime: string, endTime: string): string {
    const start = (startTime || '').trim();
    const end = (endTime || '').trim();
    if (!start || !end) return start && end ? `${start} - ${end}` : (start || end);

    const re = /^(\d{1,2}:\d{2})\s*([AP]M)$/i;
    const startMatch = start.match(re);
    const endMatch = end.match(re);

    if (!startMatch || !endMatch) {
      return `${start} - ${end}`;
    }

    const startHm = startMatch[1];
    const startMeridiem = startMatch[2].toUpperCase();
    const endHm = endMatch[1];
    const endMeridiem = endMatch[2].toUpperCase();

    if (startMeridiem === endMeridiem) {
      return `${startHm} - ${endHm} ${endMeridiem}`;
    }

    return `${startHm} ${startMeridiem} - ${endHm} ${endMeridiem}`;
  }

  // Map group session to slot format for display in the calendar
  private _mapGroupSessionToSlot(gs: any): any {
    // Use TimezoneService to convert UTC to user's local timezone
    try {
      const localStart = this.timezoneService.utcToLocal(gs.scheduledDateTime, this.userIanaTimezone);
      const durationHours = gs.duration || 1;
      const localEnd = localStart.plus({ hours: durationHours });

      const startTime = localStart.toFormat('h:mm a');
      const endTime = localEnd.toFormat('h:mm a');

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
        startTime,
        endTime,
        displayTimeRange: this._formatTimeRange(startTime, endTime),
        displayDate: localStart.toFormat('MMM d'),
        dayOfWeek: localStart.weekday % 7, // Luxon uses 1-7 (Mon-Sun), convert to 0-6
        date: localStart.toFormat('yyyy-MM-dd'),
        adjustedDateKey: localStart.toFormat('yyyy-MM-dd'),
        startIsoUtc: gs.scheduledDateTime,
        _originalStartIso: gs.scheduledDateTime
      };
    } catch (e) {
      console.warn('Failed to map group session:', e);
      // Fallback to UTC display
      const scheduledDate = new Date(gs.scheduledDateTime);
      const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
      return {
        slotType: 'group',
        isGroupSession: true,
        groupSessionId: gs.id,
        groupSessionData: gs,
        title: gs.title,
        isAvailable: false,
        startTime: `${pad(scheduledDate.getUTCHours())}:${pad(scheduledDate.getUTCMinutes())}`,
        startIsoUtc: gs.scheduledDateTime,
        _originalStartIso: gs.scheduledDateTime
      };
    }
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

    // UX: close booking sidebar immediately when user clicks Book Now.
    this.closeBookingSidebar();
    const slot = this.bookingTeacher.availability[this.selectedSlotIndex];

    // v2 credits gate: require >= 1 available lesson, otherwise show purchase modal.
    // Keep scheduling/time logic unchanged; only gate the action.
    if (this.availableLessonsEnabled) {
      if (this.payProcessing) return;
      this.payProcessing = true;

      this.availableLessonsService.getBalance().subscribe({
        next: (bal) => {
          const available = Number((bal as any)?.available || 0);
          const reserved = Number((bal as any)?.reserved || 0);
          this.availableLessonsAvailable = available;
          this.availableLessonsReserved = reserved;

          if (available <= 0) {
            this.payProcessing = false;
            this.openAvailableLessonsModal();
            return;
          }
          this._bookSelectedSlot(slot);
        },
        error: (err) => {
          console.error('Error checking available lessons balance:', err);
          this.payProcessing = false;
          this.showModal = true;
          this.modalType = 'error';
          this.modalMessage = err?.message || 'Failed to check available lessons';
        }
      });
      return;
    }

    this.payProcessing = true;
    this._bookSelectedSlot(slot);
  }

  getAvailableLessonsPackageNameKey(lessons: number): string | null {
    if (lessons === 1 || lessons === 3 || lessons === 6 || lessons === 10) {
      return `available_lessons.modal.package_names.${lessons}`;
    }
    return null;
  }

  private _bookSelectedSlot(slot: any): void {
    if (!slot || !this.bookingTeacher) {
      this.payProcessing = false;
      return;
    }

    // Use the secure bookSlot method from SlotsService
    // We just need teacherId and the secure slotId
    const teacherId = this.bookingTeacher.id;
    const slotId = slot.slotId || slot.id; // Map from our mapped object

    if (!slotId) {
      console.error('Missing slot ID for booking');
      this.payProcessing = false;
      return;
    }

    // Frontend wallet balance check (legacy flow only).
    if (!this.availableLessonsEnabled) {
      const slotPrice = slot.price || this.bookingTeacher.hourlyRate || 0;
      if (slotPrice > this.walletBalance) {
        this.payProcessing = false;
        this.isInsufficientBalance = true;
        this.showModal = true;
        this.modalType = 'error';
        this.modalMessage = this.translate.instant('booking.errors.insufficient_balance');
        return;
      }
    }

    // V2 path (credits/trial) uses /v2/slots/book to avoid wallet deduction.
    if (this.availableLessonsEnabled) {
      const idempotencyKey = this._generateIdempotencyKey();
      this.v2BookingService.bookSlot({ teacherId, slotId, method: 'credit', idempotencyKey }).subscribe({
        next: (res) => {
          console.log('Booking created successfully via V2BookingService', res);
          this.payProcessing = false;

          this.loadStudentExistingBookings();
          if (res?.balance) {
            this.availableLessonsAvailable = Number((res.balance as any).available || 0);
            this.availableLessonsReserved = Number((res.balance as any).reserved || 0);
          } else {
            this.refreshAvailableLessonsBalance();
          }

          this.showModal = true;
          this.modalType = 'success';
          this.modalMessage = this.translate.instant('booking.request_sent_message');
        },
        error: (err) => {
          const msg =
            (err && err.error && (err.error.message || err.error.msg)) ||
            err.message || 'Booking failed';

          const errCode = err?.error?.error?.code || err?.error?.code;
          const isCreditsError = errCode === 'INSUFFICIENT_CREDITS' || (msg && msg.toLowerCase().includes('available lesson'));
          const isSlotTakenError = err.status === 409 || (msg && msg.toLowerCase().includes('already been booked'));

          if (isCreditsError) {
            this.payProcessing = false;
            this.openAvailableLessonsModal();
            return;
          }

          this.showModal = true;
          this.modalType = 'error';

          if (isSlotTakenError) {
            this.modalMessage =
              this.translate.instant('booking.errors.slot_already_booked') ||
              'This slot has already been booked. Please select a different time.';
            if (this.bookingTeacher?.id) {
              this.loadTeacherSlotsWithFallback(this.bookingTeacher.id, this.bookingTeacher);
            }
          } else {
            this.modalMessage = msg;
          }

          this.payProcessing = false;
        }
      });
      return;
    }

    // Legacy wallet-based booking
    this.slotsService.bookSlot(teacherId, slotId).subscribe({
      next: (res) => {
        console.log('Booking created successfully via SlotsService', res);
        this.payProcessing = false;
        this.loadStudentExistingBookings();
        this.showModal = true;
        this.modalType = 'success';
        this.modalMessage = this.translate.instant('booking.request_sent_message');
      },
      error: (err) => {
        const msg =
          (err && err.error && (err.error.message || err.error.msg)) ||
          err.message || "Booking failed";

        const isBalanceError = msg && msg.toLowerCase().includes('insufficient');
        const isSlotTakenError = err.status === 409 || msg.toLowerCase().includes('already been booked');
        this.isInsufficientBalance = isBalanceError;

        this.showModal = true;
        this.modalType = 'error';

        if (isBalanceError) {
          this.modalMessage = this.translate.instant('booking.errors.insufficient_balance');
        } else if (isSlotTakenError) {
          this.modalMessage = this.translate.instant('booking.errors.slot_already_booked') || 'This slot has already been booked. Please select a different time.';
          if (this.bookingTeacher?.id) {
            this.loadTeacherSlotsWithFallback(this.bookingTeacher.id, this.bookingTeacher);
          }
        } else {
          this.modalMessage = msg;
        }

        this.payProcessing = false;
      }
    });
  }

  private _generateIdempotencyKey(): string {
    try {
      const anyCrypto: any = (globalThis as any)?.crypto;
      if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
        return anyCrypto.randomUUID();
      }
    } catch {
      // ignore
    }

    // Fallback
    return `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
        this.closeBookingSidebar();

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
    try {
      const local = this.timezoneService.utcToLocal(dateStr, this.userIanaTimezone);
      return local.toFormat('MMM d, yyyy');
    } catch {
      const date = new Date(dateStr);
      return this.dateLocale.formatDayMonth(date);
    }
  }

  // Format time for group session modal display
  formatGroupSessionTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return this.timezoneService.formatUtcAs12Hour(dateStr, this.userIanaTimezone);
    } catch {
      const date = new Date(dateStr);
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  }

  goToWalletTopUp() {
    this.closeModal();
    this.router.navigate(['/wallet/topup']);
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

  onLanguageChange() {
    // When language filter changes, reload results immediately
    this.loadPage(1);
  }

  onTeacherChange() {
    // update teacher filter but don't auto-search
  }

  // Custom dropdown open states
  languagesOpen = false;
  teachersOpen = false;

  toggleLanguages(event?: Event) {
    if (event) event.stopPropagation();
    this.languagesOpen = !this.languagesOpen;
    if (this.languagesOpen) this.teachersOpen = false;
  }

  toggleTeachers(event?: Event) {
    if (event) event.stopPropagation();
    this.teachersOpen = !this.teachersOpen;
    if (this.teachersOpen) this.languagesOpen = false;
  }

  selectLanguage(value: string | number | null, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedLanguage = value;
    this.languagesOpen = false;
    this.onLanguageChange();
  }

  selectTeacher(value: string, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedTeacher = value;
    this.teachersOpen = false;
    this.onTeacherChange();
  }

  getLanguageLabel(): string {
    if (!this.selectedLanguage) {
      return this.isRtl ? 'كل اللغات' : 'All Languages';
    }
    // selectedLanguage is sent as-is to API (string/number). Display it as string.
    return String(this.selectedLanguage);
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
    let slotsToGroup = this.bookingTeacher.availability.filter((s: any) => !!s?.isAvailable);
    if (this.selectedCalendarDate) {
      slotsToGroup = slotsToGroup.filter((slot: any) => {
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
  onLanguageKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleLanguages();
    } else if (e.key === 'Escape') {
      this.languagesOpen = false;
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
    this.languagesOpen = false;
    this.teachersOpen = false;
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
    this.stopSlotsPolling();
  }

  /**
   * Close booking sidebar and stop polling
   */
  closeBookingSidebar(): void {
    this.bookingSidebarOpen = false;
    this.stopSlotsPolling();
  }
}
