import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, timer } from 'rxjs';
import { RepoService } from '../../../Repositories/repo.service';
import { NotificationService } from '../../../services/notification.service';
import { SlotsService } from '../../../services/scheduling/slots.service';
import { TimezoneService } from '../../../services/scheduling/timezone.service';

interface StudentBookingItem {
  id: number;
  teacherId: string;
  teacherName: string;
  teacherProfileImage?: string;
  lessonTitle: string;
  scheduledDateTime: string; // UTC ISO
  duration: number;
  status: string;
  rawStatus?: number;
  bookingType?: string;
  amountPaid?: number;
  meetingRoomUrl?: string;
}

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.scss'],
})
export class MyBookingsComponent implements OnInit {
  isLoading = true;
  hasLoaded = false;
  bookings: StudentBookingItem[] = [];

  upcomingBookings: StudentBookingItem[] = [];
  pastBookings: StudentBookingItem[] = [];
  nextUpcoming: StudentBookingItem | null = null;
  upcomingAfterNext: StudentBookingItem[] = [];

  private tickSub?: Subscription;
  private nowUtcIso: string = new Date().toISOString();
  private routeSub?: Subscription;
  private reviewBookingIdFromUrl: number | null = null;
  private lastEndNotificationCheckMs = 0;

  userIanaTimezone: string = 'UTC';

  // Review Modal state (Student -> Teacher)
  showReviewModal = false;
  currentBookingForReview: StudentBookingItem | null = null;
  reviewRating = 5;
  reviewComment = '';
  isSubmittingReview = false;

  constructor(
    private slotsService: SlotsService,
    private timezoneService: TimezoneService,
    private translate: TranslateService,
    private repo: RepoService,
    private notifications: NotificationService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.userIanaTimezone = this.timezoneService.detectClientTimezone();

    // Note: We intentionally do NOT auto-open the review modal on page load.
    // Reviews should only open when the user clicks the specific lesson.
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const raw = (params.get('review') || '').trim();
      const n = raw ? Number(raw) : NaN;
      this.reviewBookingIdFromUrl = Number.isFinite(n) ? n : null;
    });

    // Update countdowns every second.
    this.tickSub = timer(0, 1000).subscribe(() => {
      this.nowUtcIso = this.timezoneService.nowUtc().toISO() ?? new Date().toISOString();
      this.refreshBookingsView();
      this.checkLessonEndNotifications();
    });
    this.loadBookings();
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe();
    this.routeSub?.unsubscribe();
  }

  loadBookings(): void {
    this.isLoading = true;
    this.hasLoaded = false;

    this.slotsService.getStudentBookings().subscribe({
      next: (response: any) => {
        // Backend returns StudentBookingDto[] from legacy endpoint.
        // Be tolerant if the API ever wraps the array.
        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.bookings)
            ? response.bookings
            : Array.isArray(response?.data)
              ? response.data
              : [];

        this.bookings = list.map((b: any) => ({
          id: b.id,
          teacherId: b.teacherId,
          teacherName: b.teacherName,
          teacherProfileImage: b.teacherProfileImage,
          lessonTitle: b.lessonTitle,
          scheduledDateTime: b.scheduledDateTime,
          duration: b.duration,
          status: typeof b.status === 'string' ? b.status : String(b.status),
          rawStatus: b.status != null ? Number(b.status) : undefined,
          bookingType: typeof b.bookingType === 'string' ? b.bookingType : b.bookingType != null ? String(b.bookingType) : undefined,
          amountPaid: typeof b.amountPaid === 'number' ? b.amountPaid : b.amountPaid != null ? Number(b.amountPaid) : undefined,
          meetingRoomUrl: b.meetingRoomUrl,
        }));

        this.refreshBookingsView();
        this.isLoading = false;
        this.hasLoaded = true;
      },
      error: (err) => {
        console.error('Error loading student bookings:', err);
        this.isLoading = false;
        this.hasLoaded = true;
      },
    });
  }

  private refreshBookingsView(): void {
    if (!this.bookings || this.bookings.length === 0) {
      this.upcomingBookings = [];
      this.pastBookings = [];
      this.nextUpcoming = null;
      this.upcomingAfterNext = [];
      return;
    }

    const nowMs = this.getUtcMs(this.nowUtcIso);

    const upcoming = this.bookings
      .filter((b) => this.getUtcMs(b.scheduledDateTime) >= nowMs)
      .sort((a, b) => this.getUtcMs(a.scheduledDateTime) - this.getUtcMs(b.scheduledDateTime));

    const past = this.bookings
      .filter((b) => this.getUtcMs(b.scheduledDateTime) < nowMs)
      .sort((a, b) => this.getUtcMs(b.scheduledDateTime) - this.getUtcMs(a.scheduledDateTime));

    this.upcomingBookings = upcoming;
    this.pastBookings = past;
    this.nextUpcoming = upcoming.length > 0 ? upcoming[0] : null;
    this.upcomingAfterNext = upcoming.length > 1 ? upcoming.slice(1) : [];
  }

  private getUtcMs(utcIso: string): number {
    try {
      return this.timezoneService.utcToLocal(utcIso, 'UTC').toMillis();
    } catch {
      const ms = Date.parse(utcIso);
      return Number.isFinite(ms) ? ms : 0;
    }
  }

  isUpcomingBooking(b: StudentBookingItem): boolean {
    return this.getUtcMs(b.scheduledDateTime) >= this.getUtcMs(this.nowUtcIso);
  }

  trackById(index: number, item: StudentBookingItem) {
    return item.id;
  }

  private normalizeStatus(status: any): string {
    const s = (status ?? '').toString().trim().toLowerCase();
    if (!s) return 'scheduled';
    if (s === '2' || s.includes('confirm')) return 'confirmed';
    if (s === '3' || s.includes('progress') || s.includes('in progress')) return 'in progress';
    if (s === '4' || s.includes('complete')) return 'completed';
    if (s === '5' || s.includes('cancel')) return 'cancelled';
    return s;
  }

  statusClass(b: StudentBookingItem): string {
    return this.normalizeStatus(b.status);
  }

  statusKey(b: StudentBookingItem): string {
    const s = this.normalizeStatus(b.status);
    switch (s) {
      case 'confirmed':
        return 'SCHEDULING.BOOKING_STATUS_CONFIRMED';
      case 'in progress':
        return 'SCHEDULING.BOOKING_STATUS_IN_PROGRESS';
      case 'completed':
        return 'SCHEDULING.BOOKING_STATUS_COMPLETED';
      case 'cancelled':
        return 'SCHEDULING.BOOKING_STATUS_CANCELLED';
      default:
        return 'SCHEDULING.BOOKING_STATUS_SCHEDULED';
    }
  }

  isCompleted(b: StudentBookingItem): boolean {
    const normalized = this.normalizeStatus(b.status);
    if (normalized === 'completed' || b.rawStatus === 4) return true;
    if (normalized === 'cancelled' || b.rawStatus === 5) return false;
    // If backend doesn't mark completion, consider it completed after scheduled end time.
    const startMs = this.getUtcMs(b.scheduledDateTime);
    const durMin = Number(b.duration) || 0;
    const endMs = startMs + durMin * 60_000;
    const nowMs = this.getUtcMs(this.nowUtcIso);
    return endMs > 0 && nowMs >= endMs;
  }

  canReview(b: StudentBookingItem): boolean {
    return this.isCompleted(b) && !this.hasReviewed(b.id);
  }

  formatDateTimeUtc(utcIso: string): string {
    try {
      return this.timezoneService.formatUtcAs12Hour(utcIso, this.userIanaTimezone, true);
    } catch {
      return utcIso;
    }
  }

  canJoin(utcIso: string): boolean {
    return this.timezoneService.isSessionJoinable(utcIso);
  }

  getCountdownTime(utcIso: string): string {
    try {
      // Ensure countdown updates by depending on nowUtcIso.
      void this.nowUtcIso;

      const seconds = Math.floor(
        this.timezoneService.utcToLocal(utcIso, 'UTC')
          .diff(this.timezoneService.utcToLocal(this.nowUtcIso, 'UTC'), 'seconds').seconds
      );

      if (seconds <= 0) {
        return '';
      }

      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(secs).padStart(2, '0');

      return `${hh}:${mm}:${ss}`;
    } catch {
      return '';
    }
  }

  joinBooking(booking: StudentBookingItem): void {
    this.slotsService.getMeetingToken(booking.id).subscribe({
      next: (response: any) => {
        const joinUrl = response?.joinUrl || response?.meetingUrl || booking.meetingRoomUrl;
        if (joinUrl) {
          window.open(joinUrl, '_blank');
          this.savePendingReview(booking.id);
          return;
        }
        alert('تعذر فتح الغرفة الآن، حاول مرة أخرى لاحقًا.');
      },
      error: (err) => {
        const code = err?.error?.code;
        if (code === 'TIME_NOT_YET') {
          alert('الوقت لم يحن بعد. يمكنك الدخول قبل الموعد بـ 5 دقائق.');
          return;
        }
        // Fallback to backend message when available
        const msg = err?.error?.message;
        alert(msg || this.translate.instant('COMMON.ERROR') || 'حدث خطأ');
      },
    });
  }

  // ===== Review helpers (local tracking) =====
  private getReviewedBookings(): string[] {
    const reviewed = localStorage.getItem('halqa_reviewed_bookings');
    return reviewed ? JSON.parse(reviewed) : [];
  }

  private hasReviewed(bookingId: number): boolean {
    const reviewed = this.getReviewedBookings();
    return reviewed.includes(bookingId.toString());
  }

  private markReviewed(bookingId: number): void {
    const reviewed = this.getReviewedBookings();
    if (!reviewed.includes(bookingId.toString())) {
      reviewed.push(bookingId.toString());
      localStorage.setItem('halqa_reviewed_bookings', JSON.stringify(reviewed));
    }
  }

  private savePendingReview(bookingId: number): void {
    const pending = localStorage.getItem('halqa_pending_reviews');
    const pendingList: string[] = pending ? JSON.parse(pending) : [];
    if (!pendingList.includes(bookingId.toString())) {
      pendingList.push(bookingId.toString());
      localStorage.setItem('halqa_pending_reviews', JSON.stringify(pendingList));
    }
  }

  private removePendingReview(bookingId: number): void {
    const pending = localStorage.getItem('halqa_pending_reviews');
    if (!pending) return;
    const pendingList: string[] = JSON.parse(pending);
    const filtered = pendingList.filter((id) => id !== bookingId.toString());
    localStorage.setItem('halqa_pending_reviews', JSON.stringify(filtered));
  }

  private checkForCompletedBookingsReview(): void {
    const reviewed = this.getReviewedBookings();
    const completedNeedingReview = this.bookings.filter(
      (b) => this.isCompleted(b) && !reviewed.includes(b.id.toString())
    );

    if (completedNeedingReview.length > 0) {
      // Intentionally no auto-open. The user can click the Review button.
    }
  }

  openReviewModal(b: StudentBookingItem): void {
    this.currentBookingForReview = b;
    this.reviewRating = 5;
    this.reviewComment = '';
    this.showReviewModal = true;
  }

  closeReviewModal(): void {
    this.showReviewModal = false;
    this.currentBookingForReview = null;
    this.reviewRating = 5;
    this.reviewComment = '';
  }

  skipReview(): void {
    if (this.currentBookingForReview) {
      this.markReviewed(this.currentBookingForReview.id);
      this.removePendingReview(this.currentBookingForReview.id);
    }
    this.closeReviewModal();
  }

  setRating(rating: number): void {
    this.reviewRating = rating;
  }

  submitReview(): void {
    if (!this.currentBookingForReview || this.isSubmittingReview) return;

    const reviewData = {
      bookingId: this.currentBookingForReview.id,
      rating: this.reviewRating,
      comment: this.reviewComment,
    };

    this.isSubmittingReview = true;
    this.repo.reviewTeacher(reviewData).subscribe({
      next: () => {
        if (this.currentBookingForReview) {
          this.markReviewed(this.currentBookingForReview.id);
          this.removePendingReview(this.currentBookingForReview.id);
        }
        this.isSubmittingReview = false;
        this.closeReviewModal();
        alert(this.translate.instant('SCHEDULING.REVIEW_THANK_YOU') || 'شكرًا لتقييمك!');
      },
      error: (err) => {
        console.error('Error submitting review', err);
        this.isSubmittingReview = false;
        const msg = err?.error?.message || err?.message;
        alert(msg || this.translate.instant('COMMON.ERROR') || 'حدث خطأ');
      },
    });
  }

  private openReviewFromUrlIfPossible(): void {
    if (!this.reviewBookingIdFromUrl) return;
    if (this.showReviewModal) return;

    const booking = this.bookings.find((b) => b.id === this.reviewBookingIdFromUrl);
    if (!booking) return;
    if (!this.canReview(booking)) return;

    this.openReviewModal(booking);
  }

  private getLessonEndNotifiedSet(): Set<string> {
    const raw = localStorage.getItem('halqa_lesson_end_notified');
    try {
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set((Array.isArray(arr) ? arr : []).map(String));
    } catch {
      return new Set();
    }
  }

  private markLessonEndNotified(bookingId: number): void {
    const set = this.getLessonEndNotifiedSet();
    set.add(String(bookingId));
    localStorage.setItem('halqa_lesson_end_notified', JSON.stringify(Array.from(set)));
  }

  private checkLessonEndNotifications(): void {
    // Avoid doing work every second.
    const nowMs = this.getUtcMs(this.nowUtcIso);
    if (nowMs - this.lastEndNotificationCheckMs < 15_000) return;
    this.lastEndNotificationCheckMs = nowMs;

    if (!this.bookings || this.bookings.length === 0) return;

    const notified = this.getLessonEndNotifiedSet();

    for (const b of this.bookings) {
      if (!b?.id) continue;
      if (notified.has(String(b.id))) continue;

      // Don't notify cancelled bookings.
      const normalized = this.normalizeStatus(b.status);
      if (normalized === 'cancelled' || b.rawStatus === 5) continue;

      const startMs = this.getUtcMs(b.scheduledDateTime);
      const durMin = Number(b.duration) || 0;
      const endMs = startMs + durMin * 60_000;
      if (!endMs || endMs <= 0) continue;

      // Notify once when the lesson has just ended (within 6 hours).
      if (nowMs < endMs) continue;
      if (nowMs - endMs > 6 * 60 * 60 * 1000) continue;

      const title = this.translate.instant('notifications.lessonEndedTitle') || 'Lesson ended';
      const message = this.translate.instant('notifications.lessonEndedMessage', { teacher: b.teacherName }) || `Your lesson with ${b.teacherName} has ended. Tap to rate.`;

      this.notifications.pushLocalNotification({
        type: 'lesson',
        title,
        message,
        actionUrl: `/my-bookings?review=${b.id}`,
        id: Date.now() + b.id,
      });

      this.markLessonEndNotified(b.id);
    }
  }
}
