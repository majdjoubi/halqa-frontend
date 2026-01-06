import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../../environment/environment';

interface MockUsers {
  teacher: {
    id: string;
    name: string;
    email: string;
    ianaTimezone: string;
    hourlyRate: number;
    availability: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isRecurring: boolean;
    }>;
  };
  student: {
    id: string;
    name: string;
    email: string;
    ianaTimezone: string;
    walletBalance: number;
  };
  availableTimezones: Array<{ value: string; label: string }>;
}

interface Slot {
  slotId: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  status: string;
  teacherView: {
    date: string;
    dayName: string;
    time24h: string;
    time12h: string;
    timezone: string;
  };
  studentView: {
    date: string;
    dayName: string;
    time24h: string;
    time12h: string;
    timezone: string;
  };
}

interface SlotsResponse {
  teacherTimezone: string;
  studentTimezone: string;
  generatedAt: string;
  totalSlots: number;
  slots: Slot[];
}

interface BookingResult {
  success: boolean;
  message: string;
  booking: {
    id: number;
    teacherId: string;
    teacherName: string;
    studentId: string;
    scheduledAtUtc: string;
    duration: number;
    status: string;
    amountPaid: number;
    meetingRoomUrl: string;
    meetingRoomId: string;
    createdAt: string;
  };
  hms100ms: {
    roomCreated: boolean;
    roomId: string;
    roomUrl: string;
  };
}

interface RecentBooking {
  id: number;
  teacherName: string;
  studentName: string;
  scheduledAtUtc: string;
  duration: number;
  status: string;
  amountPaid: number;
  meetingRoomId: string;
  meetingRoomUrl: string;
  hasRoom: boolean;
  createdAt: string;
  isSimulation: boolean;
}

@Component({
  selector: 'app-scheduling-test',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './scheduling-test.component.html',
  styleUrls: ['./scheduling-test.component.scss']
})
export class SchedulingTestComponent implements OnInit {
  // Loading states
  loadingMockUsers = false;
  loadingSlots = false;
  bookingInProgress = false;
  loadingBookings = false;
  cleaningUp = false;

  // Data
  mockUsers: MockUsers | null = null;
  slotsResponse: SlotsResponse | null = null;
  selectedSlot: Slot | null = null;
  bookingResult: BookingResult | null = null;
  recentBookings: RecentBooking[] = [];
  
  // Timezone selections
  teacherTimezone = 'Asia/Riyadh';
  studentTimezone = 'Europe/Berlin';

  // Error handling
  error: string | null = null;

  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadMockUsers();
    this.loadRecentBookings();
  }

  loadMockUsers(): void {
    this.loadingMockUsers = true;
    this.error = null;

    this.http.get<MockUsers>(`${this.apiUrl}/api/admin/scheduling-debug/mock-users`)
      .subscribe({
        next: (response) => {
          this.mockUsers = response;
          this.teacherTimezone = response.teacher.ianaTimezone;
          this.studentTimezone = response.student.ianaTimezone;
          this.loadingMockUsers = false;
        },
        error: (err) => {
          this.error = `Failed to load mock users: ${err.error?.message || err.message}`;
          this.loadingMockUsers = false;
        }
      });
  }

  generateSlots(): void {
    this.loadingSlots = true;
    this.error = null;
    this.selectedSlot = null;
    this.bookingResult = null;

    this.http.post<SlotsResponse>(`${this.apiUrl}/api/admin/scheduling-debug/generate-slots`, {
      teacherTimezone: this.teacherTimezone,
      studentTimezone: this.studentTimezone
    }).subscribe({
      next: (response) => {
        this.slotsResponse = response;
        this.loadingSlots = false;
      },
      error: (err) => {
        this.error = `Failed to generate slots: ${err.error?.message || err.message}`;
        this.loadingSlots = false;
      }
    });
  }

  selectSlot(slot: Slot): void {
    this.selectedSlot = slot;
    this.bookingResult = null;
  }

  bookSelectedSlot(): void {
    if (!this.selectedSlot) return;

    this.bookingInProgress = true;
    this.error = null;

    this.http.post<BookingResult>(`${this.apiUrl}/api/admin/scheduling-debug/simulate-booking`, {
      slotId: this.selectedSlot.slotId,
      scheduledAtUtc: this.selectedSlot.startAtUtc,
      durationMin: this.selectedSlot.durationMin
    }).subscribe({
      next: (response) => {
        this.bookingResult = response;
        this.bookingInProgress = false;
        // Refresh recent bookings
        this.loadRecentBookings();
      },
      error: (err) => {
        this.error = `Booking failed: ${err.error?.message || err.message}`;
        this.bookingInProgress = false;
      }
    });
  }

  loadRecentBookings(): void {
    this.loadingBookings = true;

    this.http.get<{ totalCount: number; bookings: RecentBooking[] }>(
      `${this.apiUrl}/api/admin/scheduling-debug/recent-bookings?limit=10`
    ).subscribe({
      next: (response) => {
        this.recentBookings = response.bookings;
        this.loadingBookings = false;
      },
      error: (err) => {
        console.error('Failed to load recent bookings:', err);
        this.loadingBookings = false;
      }
    });
  }

  cleanupSimulations(): void {
    if (!confirm('هل أنت متأكد من حذف جميع الحجوزات التجريبية؟')) return;

    this.cleaningUp = true;
    this.http.delete<{ message: string }>(`${this.apiUrl}/api/admin/scheduling-debug/cleanup-simulations`)
      .subscribe({
        next: (response) => {
          alert(response.message);
          this.cleaningUp = false;
          this.loadRecentBookings();
          this.bookingResult = null;
        },
        error: (err) => {
          this.error = `Cleanup failed: ${err.error?.message || err.message}`;
          this.cleaningUp = false;
        }
      });
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString('ar-SA');
    } catch {
      return isoString;
    }
  }

  getDayName(dayOfWeek: number): string {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return days[dayOfWeek] || '';
  }

  hasSimulationBookings(): boolean {
    return this.recentBookings.some(b => b.isSimulation);
  }
}
