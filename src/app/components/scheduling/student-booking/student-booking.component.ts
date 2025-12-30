import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SchedulingService } from '../../../services/scheduling/scheduling.service';
import {
  AvailableTeacher,
  AvailableSlot,
  AvailableGroupSession,
  BookIndividualSessionRequest,
  BookGroupSessionRequest,
  BookingResponse,
  StudentBookingsResponse
} from '../../../shared/modals/scheduling-modals';

@Component({
  selector: 'app-student-booking',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule
  ],
  templateUrl: './student-booking.component.html',
  styleUrls: ['./student-booking.component.scss']
})
export class StudentBookingComponent implements OnInit {
  // View State
  view: 'teachers' | 'slots' | 'groups' | 'bookings' = 'teachers';
  isLoading = false;

  // Data
  teachers: AvailableTeacher[] = [];
  availableSlots: AvailableSlot[] = [];
  groupSessions: AvailableGroupSession[] = [];
  myBookings: BookingResponse[] = [];

  // Selected Items
  selectedTeacher: AvailableTeacher | null = null;
  selectedSlot: AvailableSlot | null = null;
  selectedGroupSession: AvailableGroupSession | null = null;
  selectedBooking: BookingResponse | null = null;

  // Modals
  showBookingModal = false;
  showConfirmModal = false;
  showGroupDetailsModal = false;
  showBookingDetailsModal = false;

  // Filters
  dateFilter: string = '';
  durationFilter: number = 0;
  minRating: number = 0;

  // Booking Form
  bookingForm: FormGroup;

  constructor(
    private schedulingService: SchedulingService,
    private fb: FormBuilder,
    private translate: TranslateService
  ) {
    this.bookingForm = this.fb.group({
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.loadTeachers();
    this.loadMyBookings();
  }

  // View Navigation
  switchView(view: 'teachers' | 'slots' | 'groups' | 'bookings'): void {
    this.view = view;
    if (view === 'teachers') {
      this.loadTeachers();
    } else if (view === 'groups') {
      this.loadGroupSessions();
    } else if (view === 'bookings') {
      this.loadMyBookings();
    }
  }

  // Load Teachers
  async loadTeachers(): Promise<void> {
    this.isLoading = true;
    try {
      const fromDate = this.dateFilter ? new Date(this.dateFilter) : undefined;
      const response = await this.schedulingService.getAvailableTeachers(
        fromDate,
        undefined,
        this.durationFilter || undefined
      ).toPromise();
      this.teachers = response || [];
    } catch (error) {
      console.error('Error loading teachers:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Load Available Slots for Teacher
  async loadTeacherSlots(teacher: AvailableTeacher): Promise<void> {
    this.selectedTeacher = teacher;
    this.isLoading = true;
    try {
      const date = this.dateFilter || new Date().toISOString().split('T')[0];
      const response = await this.schedulingService.getTeacherAvailableSlots(
        teacher.teacherId,
        date
      ).toPromise();
      this.availableSlots = response || [];
      this.view = 'slots';
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Load Group Sessions
  async loadGroupSessions(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await this.schedulingService.getAvailableGroupSessions().toPromise();
      this.groupSessions = response || [];
    } catch (error) {
      console.error('Error loading group sessions:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Load My Bookings
  async loadMyBookings(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await this.schedulingService.getStudentBookings().toPromise();
      // Combine upcoming and past bookings
      if (response) {
        this.myBookings = [...(response.upcomingBookings || []), ...(response.pastBookings || [])];
      } else {
        this.myBookings = [];
      }
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Select Slot
  selectSlot(slot: AvailableSlot): void {
    this.selectedSlot = slot;
    this.showBookingModal = true;
  }

  // Book Individual Session
  async bookIndividualSession(): Promise<void> {
    if (!this.selectedTeacher || !this.selectedSlot) return;

    this.isLoading = true;
    try {
      const request: BookIndividualSessionRequest = {
        teacherId: this.selectedTeacher.teacherId,
        scheduledDateTime: this.selectedSlot.startDateTime,
        duration: this.selectedSlot.duration,
        notes: this.bookingForm.value.notes
      };

      await this.schedulingService.bookIndividualSession(request).toPromise();
      
      this.showBookingModal = false;
      this.showConfirmModal = true;
      
      // Reload bookings
      this.loadMyBookings();
    } catch (error) {
      console.error('Error booking session:', error);
      alert(this.translate.instant('SCHEDULING.BOOKING_FAILED'));
    } finally {
      this.isLoading = false;
    }
  }

  // Show Group Session Details
  showGroupDetails(session: AvailableGroupSession): void {
    this.selectedGroupSession = session;
    this.showGroupDetailsModal = true;
  }

  // Book Group Session
  async bookGroupSession(session: AvailableGroupSession): Promise<void> {
    this.isLoading = true;
    try {
      const request: BookGroupSessionRequest = {
        groupSessionId: session.id,
        notes: ''
      };

      await this.schedulingService.bookGroupSession(request).toPromise();
      
      this.showGroupDetailsModal = false;
      this.showConfirmModal = true;
      
      // Reload
      this.loadGroupSessions();
      this.loadMyBookings();
    } catch (error) {
      console.error('Error booking group session:', error);
      alert(this.translate.instant('SCHEDULING.BOOKING_FAILED'));
    } finally {
      this.isLoading = false;
    }
  }

  // Show Booking Details
  showBookingDetails(booking: BookingResponse): void {
    this.selectedBooking = booking;
    this.showBookingDetailsModal = true;
  }

  // Join Session
  joinSession(): void {
    if (this.selectedBooking?.meetingRoomUrl) {
      window.open(this.selectedBooking.meetingRoomUrl, '_blank');
    }
  }

  // Cancel Booking
  async cancelBooking(bookingId: number): Promise<void> {
    if (!confirm(this.translate.instant('SCHEDULING.CONFIRM_CANCEL'))) return;

    this.isLoading = true;
    try {
      await this.schedulingService.cancelBooking(bookingId).toPromise();
      this.showBookingDetailsModal = false;
      this.loadMyBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert(this.translate.instant('SCHEDULING.CANCEL_FAILED'));
    } finally {
      this.isLoading = false;
    }
  }

  // Apply Filters
  applyFilters(): void {
    this.loadTeachers();
  }

  // Reset Filters
  resetFilters(): void {
    this.dateFilter = '';
    this.durationFilter = 0;
    this.minRating = 0;
    this.loadTeachers();
  }

  // Go Back
  goBack(): void {
    if (this.view === 'slots') {
      this.view = 'teachers';
      this.selectedTeacher = null;
    }
  }

  // Close Modals
  closeBookingModal(): void {
    this.showBookingModal = false;
    this.selectedSlot = null;
    this.bookingForm.reset();
  }

  closeConfirmModal(): void {
    this.showConfirmModal = false;
  }

  closeGroupDetailsModal(): void {
    this.showGroupDetailsModal = false;
    this.selectedGroupSession = null;
  }

  closeBookingDetailsModal(): void {
    this.showBookingDetailsModal = false;
    this.selectedBooking = null;
  }

  // Helpers
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  formatTime(date: string): string {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleString();
  }

  getStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'Confirmed': 'confirmed',
      'Pending': 'pending',
      'Completed': 'completed',
      'Cancelled': 'cancelled',
      'NoShow': 'no-show',
      'InProgress': 'inprogress'
    };
    return statusMap[status] || 'default';
  }

  canJoinSession(booking: BookingResponse): boolean {
    if (!booking.meetingRoomUrl) return false;
    const status = booking.status.toString();
    return status === 'Confirmed' || status === 'InProgress' || status === '2' || status === '5';
  }

  canCancel(booking: BookingResponse): boolean {
    const status = booking.status.toString();
    return status === 'Pending' || status === 'Confirmed' || status === '1' || status === '2';
  }

  // Star Rating Helper
  getStarArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < Math.round(rating) ? 1 : 0);
  }
}
