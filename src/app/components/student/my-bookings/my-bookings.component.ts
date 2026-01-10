import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, timer } from 'rxjs';
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
  bookingType?: string;
  amountPaid?: number;
  meetingRoomUrl?: string;
}

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.scss'],
})
export class MyBookingsComponent implements OnInit {
  isLoading = true;
  bookings: StudentBookingItem[] = [];

  private tickSub?: Subscription;
  private nowUtcIso: string = new Date().toISOString();

  userIanaTimezone: string = 'UTC';

  constructor(
    private slotsService: SlotsService,
    private timezoneService: TimezoneService,
    private translate: TranslateService
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
          bookingType: typeof b.bookingType === 'string' ? b.bookingType : b.bookingType != null ? String(b.bookingType) : undefined,
          amountPaid: typeof b.amountPaid === 'number' ? b.amountPaid : b.amountPaid != null ? Number(b.amountPaid) : undefined,
          meetingRoomUrl: b.meetingRoomUrl,
        }));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading student bookings:', err);
        this.isLoading = false;
      },
    });
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
}
