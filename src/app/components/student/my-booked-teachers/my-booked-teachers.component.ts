import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { DateTime } from 'luxon';
import { RepoService } from '../../../Repositories/repo.service';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LuxonDateService } from '../../../services/common/luxon-date.service';
import { LanguageService } from '../../../services/language.service';
import {
  GroupSessionStatus,
  IndividualSessionStatus,
  getGroupStatusLabel,
  getIndividualStatusLabel
} from '../../../shared/enums/session-status.enum';

interface StudentBooking {
  id: string | number;
  teacherName: string;
  teacherEmail: string;
  lessonTitle: string;
  datetime: string;
  rawDateTime?: string | null; // ISO date string for language change refresh
  amount: string;
  status: 'confirmed' | 'completed' | 'cancelled' | string;
  // type: 'individual' | 'group' helps split bookings into tabs
  type?: 'individual' | 'group' | string;
  meetingUrl?: string | null;
  // raw numeric status for group sessions (1..5)
  rawStatus?: number | null;
  // participant counts (for group sessions)
  currentParticipants?: number | null;
  maxParticipants?: number | null;
  notes?: string | null;
}

@Component({
  selector: 'app-my-booked-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './my-booked-teachers.component.html',
  styleUrl: './my-booked-teachers.component.scss',
})
export class MyBookedTeachersComponent implements OnInit, OnDestroy {
  bookings: StudentBooking[] = [];
  view: 'individual' | 'group' | 'schedule' = 'schedule';

  // Loading state for bookings requests
  isLoading = true;
  private pendingRequests = 0;
  hasLoaded = false;

  // Language subscription for refreshing dates on language change
  private langSubscription?: Subscription;

  // Countdown timer
  countdownInterval: any = null;
  countdown: { days: number; hours: number; minutes: number; seconds: number } | null = null;
  nextLesson: StudentBooking | null = null;

  // Timezone display
  userTimezoneDisplay: string = 'GMT+0';

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
    // Start countdown timer after counts are updated
    this.startCountdownTimer();
  }

  // Get upcoming (confirmed) bookings sorted by date
  get upcomingBookings(): StudentBooking[] {
    const now = DateTime.now();
    return this.bookings
      .filter(b => {
        if (b.status === 'cancelled' || b.rawStatus === 5) return false;
        if (b.status === 'completed' || b.rawStatus === 4) return false;
        if (!b.rawDateTime) return false;
        const bookingDate = this.luxonDate.fromServerTimeToMecca(b.rawDateTime);
        return bookingDate.isValid && bookingDate > now;
      })
      .sort((a, b) => {
        const dateA = a.rawDateTime ? DateTime.fromISO(a.rawDateTime) : DateTime.invalid('empty');
        const dateB = b.rawDateTime ? DateTime.fromISO(b.rawDateTime) : DateTime.invalid('empty');
        return dateA.toMillis() - dateB.toMillis();
      });
  }

  // Group bookings by day for schedule view
  get groupedSchedule(): { day: string; date: string; bookings: StudentBooking[] }[] {
    const groups: { [key: string]: { day: string; date: string; dateObj: Date; bookings: StudentBooking[] } } = {};
    
    for (const booking of this.upcomingBookings) {
      if (!booking.rawDateTime) continue;
      
      const date = this.dateLocale.parseDate(booking.rawDateTime);
      if (!date) continue;
      
      const dateKey = date.toDateString();
      
      if (!groups[dateKey]) {
        const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        groups[dateKey] = {
          day: dayNames[date.getDay()],
          date: this.dateLocale.formatDayMonth(date),
          dateObj: date,
          bookings: []
        };
      }
      
      groups[dateKey].bookings.push(booking);
    }
    
    // Sort groups by date
    const sortedGroups = Object.values(groups).sort((a, b) => 
      a.dateObj.getTime() - b.dateObj.getTime()
    );
    
    // Sort bookings within each group by time
    for (const group of sortedGroups) {
      group.bookings.sort((a, b) => {
        const timeA = a.rawDateTime ? new Date(a.rawDateTime).getTime() : 0;
        const timeB = b.rawDateTime ? new Date(b.rawDateTime).getTime() : 0;
        return timeA - timeB;
      });
    }
    
    return sortedGroups;
  }

  // Format time from booking for simple display (e.g., "19:00")
  formatBookingTime(booking: StudentBooking): string {
    if (!booking.rawDateTime) return '';
    const date = this.dateLocale.parseDate(booking.rawDateTime);
    if (!date) return '';
    return this.dateLocale.formatTime(date);
  }

  // Start countdown timer for next lesson
  private startCountdownTimer(): void {
    // Clear existing interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    // Find next upcoming lesson
    const upcoming = this.upcomingBookings;
    if (upcoming.length === 0) {
      this.nextLesson = null;
      this.countdown = null;
      return;
    }

    this.nextLesson = upcoming[0];
    
    // Update countdown every second
    this.updateCountdown();
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  private updateCountdown(): void {
    if (!this.nextLesson?.rawDateTime) {
      this.countdown = null;
      return;
    }

    const now = DateTime.now();
    const lessonTime = this.luxonDate.fromServerTimeToMecca(this.nextLesson.rawDateTime);
    const diff = lessonTime.diff(now, ['days', 'hours', 'minutes', 'seconds']);

    if (diff.toMillis() <= 0) {
      this.countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
      // Refresh to find next lesson
      this.startCountdownTimer();
      return;
    }

    const days = Math.floor(diff.days);
    const hours = Math.floor(diff.hours);
    const minutes = Math.floor(diff.minutes);
    const seconds = Math.floor(diff.seconds);

    this.countdown = { days, hours, minutes, seconds };
  }

  constructor(
    private repo: RepoService,
    private dateLocale: DateLocaleService,
    private luxonDate: LuxonDateService,
    private languageService: LanguageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Initialize timezone display
    this.userTimezoneDisplay = this.formatTimezoneDisplay();

    // Subscribe to language changes to refresh date formatting
    this.langSubscription = this.languageService.currentLanguage$.subscribe(() => {
      this.refreshDateFormatting();
    });

    // reset request counter
    this.pendingRequests = 0;

    // Check for pending reviews when page loads
    this.checkForPendingReviews();

    // Fetch individual sessions specifically using getAllIndividualSession
    this.startRequest();
    this.repo.getAllIndividualSession().subscribe({
      next: (resp: any) => {
        const dataArray: any[] | null = Array.isArray(resp)
          ? resp
          : resp && Array.isArray((resp as any).data)
          ? (resp as any).data
          : null;

        if (dataArray) {
          const mapped = dataArray.map((b: any) => this.mapApiToBooking(b));
          // Filter only individual sessions
          const individualBookings = mapped.filter(
            (b) => b.type === 'individual'
          );
          this.bookings = [
            ...this.bookings.filter((b) => b.type !== 'individual'),
            ...individualBookings,
          ];
        } else {
          // fallback: keep current seeded bookings
          console.warn('Unexpected individual sessions response', resp);
        }
        this.finishRequest();
      },
      error: (err) => {
        console.error('Failed to load individual sessions', err);
        this.finishRequest();
      },
    });

    // Fetch group sessions specifically and append as group bookings
    this.startRequest();
    this.repo.getBookedTeachersByStudent().subscribe({
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
      // Update cached counts when all requests complete
      this.updateCounts();
      // Check for completed bookings that need review after data is loaded
      setTimeout(() => this.checkForCompletedBookingsReview(), 500);
    }
  }

  /**
   * Check for completed bookings that need review
   */
  private checkForPendingReviews(): void {
    // This runs on page load to check localStorage for pending reviews
    const pending = localStorage.getItem('halqa_pending_reviews');
    if (!pending) return;

    try {
      const pendingList: string[] = JSON.parse(pending);
      console.log('Pending reviews found:', pendingList);
    } catch (e) {
      console.error('Error parsing pending reviews', e);
    }
  }

  /**
   * Check for completed bookings that need review after data loads
   */
  private checkForCompletedBookingsReview(): void {
    const reviewedBookings = this.getReviewedBookings();

    // Find completed bookings that haven't been reviewed yet
    const completedBookingsNeedingReview = this.bookings.filter(
      (b) =>
        (b.status === 'completed' || b.rawStatus === 4) &&
        !reviewedBookings.includes(b.id.toString())
    );

    // If there are bookings needing review, show modal for the first one
    if (completedBookingsNeedingReview.length > 0) {
      setTimeout(() => {
        this.currentBookingForReview = completedBookingsNeedingReview[0];
        this.reviewRating = 5;
        this.reviewComment = '';
        this.showReviewModal = true;
      }, 1000);
    }
  }

  /**
   * Get list of booking IDs that have already been reviewed
   */
  private getReviewedBookings(): string[] {
    const reviewed = localStorage.getItem('halqa_reviewed_bookings');
    return reviewed ? JSON.parse(reviewed) : [];
  }

  /**
   * Mark a booking as reviewed
   */
  private markBookingAsReviewed(bookingId: string | number): void {
    const reviewed = this.getReviewedBookings();
    if (!reviewed.includes(bookingId.toString())) {
      reviewed.push(bookingId.toString());
      localStorage.setItem('halqa_reviewed_bookings', JSON.stringify(reviewed));
    }
  }

  /**
   * Save booking to pending reviews (when user joins a session)
   */
  private savePendingReview(bookingId: string | number): void {
    const pending = localStorage.getItem('halqa_pending_reviews');
    const pendingList: string[] = pending ? JSON.parse(pending) : [];

    if (!pendingList.includes(bookingId.toString())) {
      pendingList.push(bookingId.toString());
      localStorage.setItem(
        'halqa_pending_reviews',
        JSON.stringify(pendingList)
      );
    }
  }

  /**
   * Remove booking from pending reviews
   */
  private removePendingReview(bookingId: string | number): void {
    const pending = localStorage.getItem('halqa_pending_reviews');
    if (!pending) return;

    const pendingList: string[] = JSON.parse(pending);
    const filtered = pendingList.filter((id) => id !== bookingId.toString());
    localStorage.setItem('halqa_pending_reviews', JSON.stringify(filtered));
  }

  private mapApiToBooking(a: any): StudentBooking {
    const rawDt = a.scheduledDateTime || a.scheduled_date_time || a.scheduledAt;
    const defaultTitle = this.translate.instant('my_booked_teachers_page.session_types.individual');
    const defaultTeacher = this.translate.instant('my_booked_teachers_page.session_types.teacher');
    return {
      id: a.id,
      teacherName: a.teacherName || a.teacher_name || a.teacher || defaultTeacher,
      teacherEmail: a.teacherEmail || a.teacher_email || '',
      lessonTitle: this.translateLessonTitle(a.lessonTitle || a.lesson_title || a.lessonTitle || 'Individual Session'),
      datetime: this.formatDate(rawDt),
      rawDateTime: rawDt || null,
      amount: `$${Number(a.amountPaid ?? a.amount ?? 0).toFixed(2)}`,
      status: this.statusLabel(a.status),
      // attempt to detect lesson type from api fields
      type:
        a.isGroupSession ||
        a.type === 'group' ||
        a.lessonType === 2 ||
        a.lessonType === 'group'
          ? 'group'
          : 'individual',
      meetingUrl: a.meetingRoomUrl ?? a.meeting_url ?? null,
      notes: a.notes ?? null,
    };
  }

  // Translate common lesson titles to current language
  private translateLessonTitle(title: string): string {
    const translations: { [key: string]: string } = {
      'Individual Session': this.translate.instant('my_booked_teachers_page.session_types.individual'),
      'Group Session': this.translate.instant('my_booked_teachers_page.session_types.group'),
      'Lesson': this.translate.instant('my_booked_teachers_page.session_types.lesson'),
      'Teacher': this.translate.instant('my_booked_teachers_page.session_types.teacher')
    };
    return translations[title] || title;
  }

  // returns bookings filtered by current view
  get filteredBookings(): StudentBooking[] {
    return this.bookings.filter((b) => (b.type || 'individual') === this.view);
  }

  get individualBookings(): StudentBooking[] {
    return this.bookings.filter(
      (b) => (b.type || 'individual') === 'individual'
    );
  }

  get groupBookings(): StudentBooking[] {
    return this.bookings.filter((b) => (b.type || 'individual') === 'group');
  }

  get emptyMessage(): string {
    return this.view === 'individual'
      ? 'my_booked_teachers_page.empty.individual_title'
      : 'my_booked_teachers_page.empty.group_title';
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

  private statusLabel(code: any): string {
    return getIndividualStatusLabel(Number(code));
  }

  private mapGroupSessionToBooking(s: any): StudentBooking {
    const rawDt = s.scheduledDateTime || s.scheduled_date_time || s.sessionDateTime;
    const defaultGroupSession = this.translate.instant('my_booked_teachers_page.session_types.group');
    return {
      id: s.id,
      teacherName:
        s.teacherName || s.teacher?.name || s.teacher_name || defaultGroupSession,
      teacherEmail: s.teacher?.email || s.teacherEmail || '',
      lessonTitle:
        this.translateLessonTitle(s.title || s.lessonTitle || s.sessionTitle || 'Group Session'),
      datetime: this.formatDate(rawDt),
      rawDateTime: rawDt || null,
      amount: `$${Number(s.price ?? s.amount ?? s.sessionPrice ?? 0).toFixed(
        2
      )}`,
      rawStatus: Number(s.status ?? s.sessionStatus ?? 0),
      status: this.mapGroupStatus(Number(s.status ?? s.sessionStatus ?? 0)),
      type: 'group',
      meetingUrl:
        s.meetingUrls?.broadcaster ??
        s.meetingUrls?.viewer ??
        s.meetingUrl ??
        null,
      currentParticipants: Number(
        s.currentParticipants ??
          s.current_participants ??
          s.participantsCount ??
          0
      ),
      maxParticipants: Number(
        s.maxParticipants ??
          s.max_participants ??
          s.maxParticipants ??
          s.capacity ??
          0
      ),
      notes: s.description ?? s.notes ?? null,
    };
  }

  private mapGroupStatus(n: number): string {
    return getGroupStatusLabel(n);
  }

  trackById(index: number, item: StudentBooking) {
    return item.id;
  }

  // Review Modal properties
  showReviewModal = false;
  currentBookingForReview: StudentBooking | null = null;
  reviewRating = 5;
  reviewComment = '';
  isSubmittingReview = false;

  joinLesson(b: StudentBooking) {
    // Save this booking as pending review (user is joining the session)
    this.savePendingReview(b.id);

    if (b.type === 'individual') {
      // For individual sessions, get the session URL from API
      this.repo.getIndividualSessionUrl(b.id.toString()).subscribe({
        next: (response: any) => {
          if (response && response.meetingRoomUrl) {
            window.open(response.meetingRoomUrl, '_blank');
            // Don't show modal immediately - only show for completed bookings
          } else {
            console.error('Invalid session URL response', response);
            alert(this.translate.instant('my_booked_teachers_page.errors.join_failed'));
          }
        },
        error: (err) => {
          console.error('Error getting session URL', err);
          this.handleJoinError(err);
        },
      });
    } else {
      // For group sessions, get the group session URL from API
      this.repo.getGroupSessionUrl(b.id.toString()).subscribe({
        next: (response: any) => {
          if (response && response.meetingRoomUrl) {
            window.open(response.meetingRoomUrl, '_blank');
            // Don't show modal immediately - only show for completed bookings
          } else {
            console.error('Invalid group session URL response', response);
            alert(this.translate.instant('my_booked_teachers_page.errors.join_failed'));
          }
        },
        error: (err) => {
          console.error('Error getting group session URL', err);
          this.handleJoinError(err);
        },
      });
    }
  }

  private handleJoinError(err: any): void {
    console.log('Join error details:', err);
    console.log('Error object:', JSON.stringify(err));
    
    // Try to get error message from different possible locations
    const errorMessage = err?.error?.message || err?.message || err?.error || '';
    const errorString = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : JSON.stringify(errorMessage).toLowerCase();
    
    console.log('Parsed error message:', errorString);
    
    // Check if it's a "room not created" error
    if (errorString.includes('not yet created') || 
        errorString.includes('meeting room') ||
        errorString.includes('room not') ||
        err?.status === 400) {
      alert(this.translate.instant('my_booked_teachers_page.errors.lesson_not_started') + '\n\n' +
            this.translate.instant('my_booked_teachers_page.errors.lesson_not_started_message'));
    } else {
      alert(this.translate.instant('my_booked_teachers_page.errors.join_failed'));
    }
  }

  closeReviewModal() {
    this.showReviewModal = false;
    this.currentBookingForReview = null;
    this.reviewRating = 5;
    this.reviewComment = '';
  }

  skipReview() {
    if (this.currentBookingForReview) {
      // Mark as reviewed (skipped) so it won't show again
      this.markBookingAsReviewed(this.currentBookingForReview.id);
      this.removePendingReview(this.currentBookingForReview.id);
    }
    this.closeReviewModal();
  }

  setRating(rating: number) {
    this.reviewRating = rating;
  }

  submitReview() {
    if (!this.currentBookingForReview || this.isSubmittingReview) {
      return;
    }

    const reviewData = {
      bookingId: this.currentBookingForReview.id,
      rating: this.reviewRating,
      comment: this.reviewComment,
    };

    this.isSubmittingReview = true;

    this.repo.reviewTeacher(reviewData).subscribe({
      next: (response: any) => {
        console.log('Review submitted successfully', response);

        // Mark this booking as reviewed
        if (this.currentBookingForReview) {
          this.markBookingAsReviewed(this.currentBookingForReview.id);
          this.removePendingReview(this.currentBookingForReview.id);
        }

        this.isSubmittingReview = false;
        this.closeReviewModal();

        // Show success message
        alert('Thank you for your review!');

        // Check if there are more completed bookings to review
        setTimeout(() => this.checkForCompletedBookingsReview(), 500);
      },
      error: (err) => {
        console.error('Error submitting review', err);
        this.isSubmittingReview = false;

        // Check the error message
        const errorMsg =
          err?.error?.message || err?.message || 'Failed to submit review';

        if (errorMsg.includes('Can only review completed bookings')) {
          alert(
            'This session must be completed before you can leave a review. The review form will appear automatically after the session is finished.'
          );
          this.closeReviewModal();
        } else {
          alert('Failed to submit review. Please try again.');
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
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
