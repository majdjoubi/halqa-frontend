import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, timer } from 'rxjs';
import { RepoService } from '../../../Repositories/repo.service';
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

  private tickSub?: Subscription;
  private nowUtcIso: string = new Date().toISOString();

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
    private repo: RepoService
  ) {}

  ngOnInit(): void {
    this.userIanaTimezone = this.timezoneService.detectClientTimezone();
    // Update countdowns every second.
    this.tickSub = timer(0, 1000).subscribe(() => {
      this.nowUtcIso = this.timezoneService.nowUtc().toISO() ?? new Date().toISOString();
    });
    this.loadBookings();
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe();
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
        this.isLoading = false;
        this.hasLoaded = true;

        // After loading, prompt review modal if any completed booking needs review
        setTimeout(() => this.checkForCompletedBookingsReview(), 300);
      },
      error: (err) => {
        console.error('Error loading student bookings:', err);
        this.isLoading = false;
        this.hasLoaded = true;
      },
    });
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

  statusLabel(b: StudentBookingItem): string {
    const s = this.normalizeStatus(b.status);
    switch (s) {
      case 'confirmed':
        return this.translate.instant('BOOKING_STATUS_CONFIRMED') || 'مؤكد';
      case 'in progress':
        return this.translate.instant('BOOKING_STATUS_IN_PROGRESS') || 'قيد التنفيذ';
      case 'completed':
        return this.translate.instant('BOOKING_STATUS_COMPLETED') || 'مكتمل';
      case 'cancelled':
        return this.translate.instant('BOOKING_STATUS_CANCELLED') || 'ملغى';
      default:
        return this.translate.instant('BOOKING_STATUS_SCHEDULED') || 'مجدول';
    }
  }

  isCompleted(b: StudentBookingItem): boolean {
    const normalized = this.normalizeStatus(b.status);
    return normalized === 'completed' || b.rawStatus === 4;
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

  getCountdownText(utcIso: string): string {
    try {
      // Ensure countdown updates by depending on nowUtcIso.
      void this.nowUtcIso;

      const seconds = Math.floor(
        this.timezoneService.utcToLocal(utcIso, 'UTC')
          .diff(this.timezoneService.utcToLocal(this.nowUtcIso, 'UTC'), 'seconds').seconds
      );

      if (seconds <= 0) {
        return this.translate.instant('SESSION_STARTED') || 'بدأت الجلسة';
      }

      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(secs).padStart(2, '0');

      const prefix = this.translate.instant('STARTS_IN') || 'يبدأ بعد';
      return `${prefix}: ${hh}:${mm}:${ss}`;
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
          alert('الوقت لم يحن بعد. يمكنك الدخول قبل الموعد بـ 60 دقيقة.');
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
      this.openReviewModal(completedNeedingReview[0]);
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
        alert(this.translate.instant('REVIEW_THANK_YOU') || 'شكرًا لتقييمك!');
        setTimeout(() => this.checkForCompletedBookingsReview(), 300);
      },
      error: (err) => {
        console.error('Error submitting review', err);
        this.isSubmittingReview = false;
        const msg = err?.error?.message || err?.message;
        alert(msg || this.translate.instant('COMMON.ERROR') || 'حدث خطأ');
      },
    });
  }
}
