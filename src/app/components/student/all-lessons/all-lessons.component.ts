import {
  Component,
  ElementRef,
  Renderer2,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';
import { RepoService } from '../../../Repositories/repo.service';
import { Subscription, forkJoin } from 'rxjs';
import { SideMenuComponent } from '../../../shared/shared-component/side-menu/side-menu.component';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LanguageService } from '../../../services/language.service';

interface Lesson {
  id: number;
  title: string;
  category: string;
  author: string;
  rating: number;
  reviews: number;
  price: number;
  image: string;
  description?: string;
  duration?: string; // e.g. "3h 20m"
  scheduledDateTime?: string;
  maxParticipants?: number;
  currentParticipants?: number;
}

interface LessonDetails {
  id: number;
  title: string;
  description: string;
  duration: string;
  price: number;
  maxParticipants: number;
  teacherName: string;
  teacherProfilePictureUrl: string;
  teacherBio?: string;
  teacherYearsOfExperience: number;
  teacherLanguages: string[];
  teacherSpecializations: string[];
  teacherAverageRating: number;
  teacherHourlyRate?: number;
  teacherTotalStudents?: number;
  teacherTotalLessons?: number;
  scheduledDateTime: string;
  currentParticipants: number;
  meetingRoomId: string;
}

@Component({
  selector: 'app-all-lessons',
  standalone: true,
  imports: [CommonModule, RouterModule, SideMenuComponent, TranslateModule],
  templateUrl: './all-lessons.component.html',
  styleUrl: './all-lessons.component.scss',
})
export class AllLessonsComponent implements AfterViewInit, OnDestroy {
  minPrice = 0;
  maxPrice = 500;
  currentPrice = 500;
  lessons: Lesson[] = [];

  // Filter properties
  searchQuery = '';
  sortBy = 'newest';

  // Search timeout for debouncing
  private searchTimeout: any;

  // Custom sort dropdown state
  sortOptions = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Oldest First', value: 'oldest' },
  ];
  sortDropdownOpen = false;

  // sample images to pick randomly from (put your asset paths here)
  sampleImages: string[] = [
    '/uploads/documents/20251003142411165-9792b39aa83c4df380f4a73e73b3c4cc-lesson02.webp',
    '/uploads/documents/20251003142534831-6eb8b0e19d6c4656af19990141c6e3b9-lesson03.webp',
    '/uploads/documents/20251003142645389-f83d82510c454a66a9319e103380f7a5-lesson04.webp',
    '/uploads/documents/20251003142746171-2bf82b30980d40d4962879a11b277eb2-lesson01.webp',
    '/uploads/documents/20251003142914872-f17e471eae4d422a8c91079a5c71eb51-lesson05.webp',
    '/uploads/documents/20251003143038287-992a36b5d8c3460fbde371f868ebbef7-lesson06.webp',
  ];

  private getRandomImage(): string {
    const idx = Math.floor(Math.random() * this.sampleImages.length);
    return this.sampleImages[idx];
  }

  /**
   * Format duration value from API into a human readable string.
   * The API returns durations as decimal hours (e.g. 1.5 = 1 hour 30 minutes).
   */
  formatDuration(value: any): string {
    if (value === null || typeof value === 'undefined' || value === '') {
      return 'N/A';
    }

    // if it's already a string like "1h 30m", return as-is
    if (typeof value === 'string' && /[hm]/.test(value)) {
      return value;
    }

    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(num)) return 'N/A';

    const totalMinutes = Math.round(num * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return '0m';
  }

  /**
   * Format scheduled date time into a human readable string.
   */
  formatScheduledDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = this.dateLocale.parseDate(dateString);
    if (!date) return 'N/A';
    // Format as DD/MM HH:mm
    const dayMonth = this.dateLocale.formatDayMonth(date);
    const time = this.dateLocale.formatTime(date);
    return `${dayMonth} ${time}`;
  }

  // pagination state
  page = 1;
  limit = 50; // fetch 50 items in one request
  loading = false;
  errorMessage: string | null = null;

  // side menu state
  isSideMenuOpen = false;
  selectedLessonId: number | null = null;
  selectedLessonDetails: LessonDetails | null = null;
  loadingLessonDetails = false;
  lessonDetailsError: string | null = null;

  // booking state
  isBookingModalOpen = false;
  bookingMessage = '';
  bookingError = false;
  isBooking = false;

  private sub = new Subscription();
  private langSubscription?: Subscription;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private repo: RepoService,
    private dateLocale: DateLocaleService,
    private languageService: LanguageService
  ) {
    // Subscribe to language changes
    this.langSubscription = this.languageService.currentLanguage$.subscribe(() => {
      // Trigger change detection by reassigning lessons array
      this.lessons = [...this.lessons];
    });
  }

  ngAfterViewInit() {
    this.updateSliderProgress();
    // initial load - use default API
    this.loadLessons();
  }

  onPriceChange(event: any) {
    this.currentPrice = parseInt(event.target.value);
    this.updateSliderProgress();
    // Only apply filter if user changed price from max
    if (this.currentPrice < this.maxPrice) {
      this.applyFilters();
    }
  }

  onSearchChange(event: any) {
    this.searchQuery = event.target.value;
    // Since search is not supported, just reload lessons
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.loadLessons();
    }, 500);
  }

  onSortChange(event: any) {
    const oldSort = this.sortBy;
    this.sortBy = event.target.value;

    // Since sorting is not supported, just reload lessons
    if (oldSort !== this.sortBy) {
      this.loadLessons();
    }
  }

  // Toggle custom dropdown
  toggleSortDropdown(event: Event) {
    event.stopPropagation();
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  // Programmatic set sort (used by custom dropdown)
  setSort(value: string) {
    const oldSort = this.sortBy;
    this.sortBy = value;
    this.sortDropdownOpen = false;

    // Since sorting is not supported, just reload lessons
    if (oldSort !== this.sortBy) {
      this.loadLessons();
    }
  }

  getSortLabel(val: string) {
    const found = this.sortOptions.find((s) => s.value === val);
    return found ? found.label : val;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.sortDropdownOpen) this.sortDropdownOpen = false;
  }

  applyFilters() {
    // Reset pagination
    this.page = 1;
    this.lessons = [];
    // Load with filters using search API
    this.searchLessonsWithFilters();
  }

  resetToDefault() {
    // Reset pagination
    this.page = 1;
    this.lessons = [];
    // Load with default API
    this.loadLessons();
  }

  // Check if filters are active
  hasActiveFilters(): boolean {
    // Filters not supported for group sessions
    return false;
  }

  private updateSliderProgress() {
    const progress =
      ((this.currentPrice - this.minPrice) / (this.maxPrice - this.minPrice)) *
      100;
    const slider = this.el.nativeElement.querySelector('.price-slider');
    if (slider) {
      this.renderer.setStyle(slider, '--progress', `${progress}%`);
    }
  }

  loadLessons() {
    if (this.loading) return;

    this.loading = true;

    // Fetch first page to detect pagination, then fetch remaining pages if any
    const pageToRequest = 1;
    const limitToRequest = this.limit;

    const first$ = this.repo.getGroupSessionsByStudent(
      pageToRequest,
      limitToRequest
    );
    const firstSub = first$.subscribe(
      (res: any) => {
        // normalize response to sessions array
        const firstSessions: any[] = Array.isArray(res)
          ? res
          : res.sessions || [];

        // detect pagination metadata if present
        const totalPages: number =
          (res && (res.totalPages ?? res.total_pages)) || 1;

        if (!firstSessions.length && totalPages <= 1) {
          this.lessons = [];
          this.loading = false;
          return;
        }

        if (totalPages > 1) {
          // prepare requests for remaining pages (2..totalPages)
          const calls = [] as any[];
          for (let p = 2; p <= totalPages; p++) {
            calls.push(this.repo.getGroupSessionsByStudent(p, limitToRequest));
          }

          const pagesSub = forkJoin(calls).subscribe(
            (results: any[]) => {
              // merge sessions from all pages
              const allSessions = [...firstSessions];
              for (const r of results) {
                const s = Array.isArray(r) ? r : r.sessions || [];
                allSessions.push(...s);
              }

              // map to UI model
              this.lessons = allSessions.map(
                (r: any) =>
                  ({
                    id: r.id,
                    title: r.title,
                    category: 'Group Session',
                    author: r.teacherName || 'Teacher',
                    rating: 0,
                    reviews: r.currentParticipants || 0,
                    price: r.price || 0,
                    image: this.getRandomImage(),
                    description: r.description || r.title || '',
                    duration: this.formatDuration(r.duration),
                    scheduledDateTime: r.scheduledDateTime,
                    maxParticipants: r.maxParticipants,
                    currentParticipants: r.currentParticipants,
                  } as Lesson)
              );

              this.loading = false;
            },
            (err) => {
              console.error(
                'Failed to load additional group session pages',
                err
              );
              this.errorMessage = 'Failed to load group sessions';
              this.loading = false;
            }
          );

          this.sub.add(pagesSub);
        } else {
          // single page only - map and assign
          this.lessons = firstSessions.map(
            (r: any) =>
              ({
                id: r.id,
                title: r.title,
                category: 'Group Session',
                author: r.teacherName || 'Teacher',
                rating: 0,
                reviews: r.currentParticipants || 0,
                price: r.price || 0,
                image: this.getRandomImage(),
                description: r.description || r.title || '',
                duration: this.formatDuration(r.duration),
                scheduledDateTime: r.scheduledDateTime,
                maxParticipants: r.maxParticipants,
                currentParticipants: r.currentParticipants,
              } as Lesson)
          );

          this.loading = false;
        }
      },
      (err) => {
        console.error('Failed to load group sessions', err);
        this.errorMessage = 'Failed to load group sessions';
        this.loading = false;
      }
    );

    this.sub.add(firstSub);
  }

  // Search lessons with filters using the new API
  searchLessonsWithFilters() {
    // Since getGroupSessionsByStudent doesn't support filters, just load all
    this.loadLessons();
  }

  // Open side menu and load lesson details
  openLessonDetails(lessonId: number, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.isSideMenuOpen = true;
    this.loadingLessonDetails = true;
    this.lessonDetailsError = null;
    this.selectedLessonDetails = null;

    const sub = this.repo.getGroupSessionById(lessonId.toString()).subscribe(
      (response: any) => {
        this.selectedLessonDetails = {
          id: response.id,
          title: response.title || 'Untitled',
          description: response.description || 'No description available',
          duration: this.formatDuration(response.duration),
          price: response.price || 0,
          maxParticipants: response.maxParticipants || 0,
          teacherName: response.teacherName || 'Unknown Teacher',
          teacherProfilePictureUrl:
            response.teacherProfilePictureUrl ||
            '/assets/images/default-avatar.svg',
          teacherBio: response.teacherBio || '',
          teacherYearsOfExperience: response.teacherYearsOfExperience || 0,
          teacherLanguages: [], // Not in response
          teacherSpecializations: response.teacherSpecializations || [],
          teacherAverageRating: response.teacherAverageRating || 0,
          teacherHourlyRate: response.teacherHourlyRate || 0,
          teacherTotalStudents: response.teacherTotalStudents || 0,
          teacherTotalLessons: response.teacherTotalLessons || 0,
          scheduledDateTime: response.scheduledDateTime,
          currentParticipants: response.currentParticipants || 0,
          meetingRoomId: response.meetingRoomId || '',
        };
        this.loadingLessonDetails = false;
      },
      (error) => {
        console.error('Failed to load group session details', error);
        this.lessonDetailsError =
          'Failed to load group session details. Please try again.';
        this.loadingLessonDetails = false;
      }
    );

    this.sub.add(sub);
  }

  // Close side menu
  closeSideMenu() {
    this.isSideMenuOpen = false;
    this.selectedLessonDetails = null;
    this.lessonDetailsError = null;
  }

  // Book group session
  bookSession() {
    if (!this.selectedLessonDetails || this.isBooking) return;

    this.isBooking = true;
    const bookingData = {
      groupSessionId: this.selectedLessonDetails.id,
      notes: 'Booking from student dashboard',
    };

    const sub = this.repo.bookGroupSession(bookingData).subscribe(
      (response: any) => {
        this.isBooking = false;
        this.bookingMessage =
          'Booking successful! You have been enrolled in the session.';
        this.bookingError = false;
        this.isBookingModalOpen = true;
        // Optionally, close the side menu or refresh
        // this.closeSideMenu();
      },
      (error) => {
        this.isBooking = false;
        this.bookingMessage =
          error.error?.message ||
          'Failed to book the session. Please try again.';
        this.bookingError = true;
        this.isBookingModalOpen = true;
      }
    );

    this.sub.add(sub);
  }

  // Close booking modal
  closeBookingModal() {
    this.isBookingModalOpen = false;
    this.bookingMessage = '';
    this.bookingError = false;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.langSubscription?.unsubscribe();
  }
}
