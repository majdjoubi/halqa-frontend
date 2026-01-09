import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SlotsService } from '../../../services/scheduling/slots.service';
import { TimezoneService } from '../../../services/scheduling/timezone.service';

interface StudentBookingItem {
  id: number;
  teacherId: string;
  teacherName: string;
  lessonTitle: string;
  scheduledDateTime: string; // UTC ISO
  duration: number;
  status: string;
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

  userIanaTimezone: string = 'UTC';

  constructor(
    private slotsService: SlotsService,
    private timezoneService: TimezoneService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.userIanaTimezone = this.timezoneService.detectClientTimezone();
    this.loadBookings();
  }

  loadBookings(): void {
    this.isLoading = true;

    this.slotsService.getStudentBookings().subscribe({
      next: (response: any) => {
        // Backend returns StudentBookingDto[] from legacy endpoint.
        this.bookings = (response || []).map((b: any) => ({
          id: b.id,
          teacherId: b.teacherId,
          teacherName: b.teacherName,
          lessonTitle: b.lessonTitle,
          scheduledDateTime: b.scheduledDateTime,
          duration: b.duration,
          status: typeof b.status === 'string' ? b.status : String(b.status),
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
