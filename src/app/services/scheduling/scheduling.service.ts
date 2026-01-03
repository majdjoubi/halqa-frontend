import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';
import {
  AvailableTeacher,
  AvailableSlot,
  AvailableGroupSession,
  BookGroupSessionRequest,
  BookIndividualSessionRequest,
  BookingResponse,
  CreateGroupSessionRequest,
  MeetingTokenResponse,
  StudentBookingsResponse,
  SuccessResponse,
  TeacherCalendarResponse,
  TeacherEarnings,
  UpdateRatesRequest,
  UpdateSchedulingAvailabilityRequest
} from '../../shared/modals/scheduling-modals';

@Injectable({
  providedIn: 'root'
})
export class SchedulingService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ============ Student Operations ============

  /**
   * Book an individual session with a teacher (time-slot based)
   */
  bookIndividualSession(request: BookIndividualSessionRequest): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(
      `${this.baseUrl}/api/scheduling/book/individual`,
      request
    );
  }

  /**
   * Book a spot in an existing group session
   */
  bookGroupSession(request: BookGroupSessionRequest): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(
      `${this.baseUrl}/api/scheduling/book/group`,
      request
    );
  }

  /**
   * Get student's bookings (upcoming and past)
   */
  getStudentBookings(): Observable<StudentBookingsResponse> {
    return this.http.get<StudentBookingsResponse>(
      `${this.baseUrl}/api/scheduling/student/bookings`
    );
  }

  /**
   * Get available teachers with their available slots
   */
  getAvailableTeachers(
    fromDate?: Date,
    toDate?: Date,
    duration?: number
  ): Observable<AvailableTeacher[]> {
    let params = new HttpParams();
    
    if (fromDate) {
      params = params.set('fromDate', fromDate.toISOString());
    }
    if (toDate) {
      params = params.set('toDate', toDate.toISOString());
    }
    if (duration) {
      params = params.set('duration', duration.toString());
    }

    return this.http.get<AvailableTeacher[]>(
      `${this.baseUrl}/api/scheduling/available-teachers`,
      { params }
    );
  }

  /**
   * Get a specific teacher's availability
   */
  getTeacherAvailability(
    teacherId: string,
    fromDate: Date,
    toDate: Date
  ): Observable<AvailableTeacher> {
    const params = new HttpParams()
      .set('fromDate', fromDate.toISOString())
      .set('toDate', toDate.toISOString());

    return this.http.get<AvailableTeacher>(
      `${this.baseUrl}/api/scheduling/teacher/${teacherId}/availability`,
      { params }
    );
  }

  /**
   * Get available slots for a teacher on a specific date
   */
  getTeacherAvailableSlots(teacherId: string, date: string): Observable<AvailableSlot[]> {
    const params = new HttpParams().set('date', date);
    return this.http.get<AvailableSlot[]>(
      `${this.baseUrl}/api/scheduling/teacher/${teacherId}/slots`,
      { params }
    );
  }

  /**
   * Get all available group sessions
   */
  getAvailableGroupSessions(): Observable<AvailableGroupSession[]> {
    return this.http.get<AvailableGroupSession[]>(
      `${this.baseUrl}/api/scheduling/group-sessions`
    );
  }

  // ============ Teacher Operations ============

  /**
   * Create a new group session
   */
  createGroupSession(request: CreateGroupSessionRequest): Observable<AvailableGroupSession> {
    return this.http.post<AvailableGroupSession>(
      `${this.baseUrl}/api/scheduling/group-session`,
      request
    );
  }

  /**
   * Cancel a group session (refunds all students)
   */
  cancelGroupSession(groupSessionId: number): Observable<SuccessResponse> {
    return this.http.delete<SuccessResponse>(
      `${this.baseUrl}/api/scheduling/group-session/${groupSessionId}`
    );
  }

  /**
   * Get teacher's calendar view
   */
  getTeacherCalendar(fromDate: Date, toDate: Date): Observable<TeacherCalendarResponse> {
    const params = new HttpParams()
      .set('fromDate', fromDate.toISOString())
      .set('toDate', toDate.toISOString());

    return this.http.get<TeacherCalendarResponse>(
      `${this.baseUrl}/api/scheduling/teacher/calendar`,
      { params }
    );
  }

  /**
   * Update teacher's availability
   */
  updateAvailability(request: UpdateSchedulingAvailabilityRequest): Observable<SuccessResponse> {
    return this.http.put<SuccessResponse>(
      `${this.baseUrl}/api/scheduling/teacher/availability`,
      request
    );
  }

  /**
   * Update teacher's rates
   */
  updateRates(request: UpdateRatesRequest): Observable<SuccessResponse> {
    return this.http.put<SuccessResponse>(
      `${this.baseUrl}/api/scheduling/teacher/rates`,
      request
    );
  }

  /**
   * Get teacher's earnings summary
   */
  getTeacherEarnings(): Observable<TeacherEarnings> {
    return this.http.get<TeacherEarnings>(
      `${this.baseUrl}/api/scheduling/teacher/earnings`
    );
  }

  // ============ Session Lifecycle ============

  /**
   * Start a session (creates 100ms room) - Teacher only
   */
  startSession(bookingId: number): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(
      `${this.baseUrl}/api/scheduling/session/${bookingId}/start`,
      {}
    );
  }

  /**
   * End a session (releases payment to teacher) - Teacher only
   */
  endSession(bookingId: number): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(
      `${this.baseUrl}/api/scheduling/session/${bookingId}/end`,
      {}
    );
  }

  /**
   * Mark student as no-show (teacher gets paid) - Teacher only
   */
  markStudentNoShow(bookingId: number): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(
      `${this.baseUrl}/api/scheduling/session/${bookingId}/student-no-show`,
      {}
    );
  }

  /**
   * Get meeting join token
   */
  getMeetingToken(bookingId: number): Observable<MeetingTokenResponse> {
    return this.http.get<MeetingTokenResponse>(
      `${this.baseUrl}/api/scheduling/session/${bookingId}/token`
    );
  }

  // ============ Utility Methods ============

  /**
   * Format duration for display
   */
  formatDuration(minutes: number): string {
    if (minutes === 60) return '1 hour';
    if (minutes === 30) return '30 min';
    return `${minutes} min`;
  }

  /**
   * Get status color for UI
   */
  getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'confirmed': return 'success';
      case 'pending': return 'warning';
      case 'inprogress': return 'info';
      case 'completed': return 'success';
      case 'cancelled':
      case 'cancelledbyteacher':
      case 'teachernoshow':
      case 'studentnoshow': return 'danger';
      default: return 'secondary';
    }
  }

  /**
   * Get booking type display name
   */
  getBookingTypeDisplay(type: number): string {
    return type === 1 ? 'Individual' : 'Group';
  }
}
