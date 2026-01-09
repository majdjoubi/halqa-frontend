import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environment/environment';
import { TimezoneService } from './timezone.service';

/**
 * Available slot from the API with HMAC-signed slotId.
 */
export interface SlotDto {
  slotId: string;
  startAtUtc: string;
  endAtUtc: string;
  anchorDateTeacher: string;
  durationMin: number;
  status: 'Available' | 'Booked';
  teacherLocal?: {
    date: string;
    time24h: string;
  };
}

/**
 * Response from GET /v1/teacher/availability
 */
export interface TeacherSlotsResponse {
  teacherId: string;
  teacherIanaTimezone: string;
  range: {
    fromAnchorDateTeacher: string;
    toAnchorDateTeacher: string;
  };
  slotDurationMin: number;
  slots: SlotDto[];
}

/**
 * Request body for POST /v1/bookings
 */
export interface BookSlotRequest {
  slotId: string;
  studentNote?: string;
}

/**
 * Response from POST /v1/bookings
 */
export interface SlotBookingResponse {
  id: string;
  slotId: string;
  studentId: string;
  teacherId: string;
  status: string;
  scheduledAtUtc: string;
  durationMinutes: number;
  teacherIanaTimezone: string;
  studentIanaTimezone: string;
  startTimeLocal: string;
  endTimeLocal: string;
  createdAtUtc: string;
  studentNote?: string;
}

/**
 * Response from GET /v1/bookings/{id}
 */
export interface BookingDetailResponse extends SlotBookingResponse {
  cancelledAtUtc?: string;
  cancellationReason?: string;
}

/**
 * Response from POST /v1/bookings/{id}/cancel
 */
export interface CancelBookingResponse {
  bookingId: string;
  status: string;
  cancelledAt: string;
  refundAmount?: number;
}

/**
 * Response from POST /v1/bookings/{id}/meeting-token
 */
export interface MeetingTokenResponse {
  token: string;
  roomName: string;
  expiresAt: string;
  joinUrl?: string;
}

/**
 * Enriched slot with display information in the viewer's timezone.
 */
export interface EnrichedSlot extends SlotDto {
  /** Display time in viewer's local timezone (12-hour format) */
  viewerLocal12h: string;
  /** Display date in viewer's local timezone */
  viewerLocalDate: string;
  /** Is this slot in the past? */
  isPast: boolean;
  /** Is this slot available for booking? */
  isBookable: boolean;
}

/**
 * Slots Service for timezone-safe booking using HMAC-signed slot IDs.
 * 
 * ARCHITECTURE:
 * - Fetches available slots from backend (already converted to UTC)
 * - Enriches slots with display times in viewer's timezone
 * - Books slots using secure HMAC-signed slot IDs
 * 
 * API ENDPOINTS (v1 - scheduling-service):
 * - GET  /v1/teacher/availability - Get teacher's available slots
 * - POST /v1/bookings - Create a booking
 * - GET  /v1/bookings/{id} - Get booking details
 * - POST /v1/bookings/{id}/cancel - Cancel a booking
 * - POST /v1/bookings/{id}/meeting-token - Get meeting token
 */
@Injectable({
  providedIn: 'root'
})
export class SlotsService {
  // Legacy Halqa API base URL (used for /api/* endpoints)
  private legacyBaseUrl = (environment.apiUrl || '').replace(/\/$/, '');

  // Scheduling Service base URL (used for /v1/* endpoints)
  // Falls back to legacyBaseUrl if not configured.
  private schedulingBaseUrl = ((environment as any).schedulingApiUrl || this.legacyBaseUrl || '').replace(/\/$/, '');

  // Use v1 prefix for scheduling-service endpoints
  private schedulingApiPrefix = '/v1';

  constructor(
    private http: HttpClient,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Get available slots for a teacher within a date range.
   * Slots are returned in UTC with HMAC-signed IDs for secure booking.
   * 
   * Uses backend endpoint: GET /api/slots/teachers/{teacherId}
   * 
   * @param teacherId Teacher ID to get slots for
   * @param fromAnchorDate Start date in teacher's timezone (YYYY-MM-DD)
   * @param toAnchorDate End date in teacher's timezone (YYYY-MM-DD)
   * @param durationMinutes Slot duration in minutes (fixed to 60)
   */
  getTeacherSlots(
    teacherId: string,
    fromAnchorDate: string,
    toAnchorDate: string,
    durationMinutes: number = 60
  ): Observable<TeacherSlotsResponse> {
    // Extract date-only portion if full ISO string was passed
    const fromDate = fromAnchorDate.split('T')[0];
    const toDate = toAnchorDate.split('T')[0];

    const params = new HttpParams()
      .set('fromAnchorDate', fromDate)
      .set('toAnchorDate', toDate)
      .set('durationMinutes', String(durationMinutes));

    return this.http.get<TeacherSlotsResponse>(
      `${this.legacyBaseUrl}/api/slots/teachers/${teacherId}`,
      { params }
    );
  }

  /**
   * Get available slots enriched with display information in the viewer's timezone.
   * This is the recommended method for UI display.
   * 
   * Uses backend endpoint: GET /api/slots/teachers/{teacherId}
   * Duration is fixed to 60 minutes (1 hour lessons only).
   * 
   * @param teacherId Teacher ID to get slots for
   * @param fromAnchorDate Start date (YYYY-MM-DD in teacher's timezone)
   * @param toAnchorDate End date (YYYY-MM-DD in teacher's timezone)
   * @param durationMinutes Slot duration - fixed to 60 (ignored, kept for compatibility)
   * @param viewerIanaTimezone Viewer's IANA timezone for display
   */
  getEnrichedSlots(
    teacherId: string,
    fromAnchorDate: string,
    toAnchorDate: string,
    durationMinutes: number = 60,
    viewerIanaTimezone?: string
  ): Observable<{ response: TeacherSlotsResponse; slots: EnrichedSlot[] }> {
    const viewerTz = viewerIanaTimezone || this.timezoneService.detectClientTimezone();

    // Always use 60 minutes (1 hour lessons only)
    const fixedDuration = 60;

    return this.getTeacherSlots(teacherId, fromAnchorDate, toAnchorDate, fixedDuration).pipe(
      map(response => ({
        response,
        slots: this.enrichSlots(response.slots, viewerTz)
      }))
    );
  }

  /**
   * Book a slot using its HMAC-signed slot ID.
   * The slot ID contains the encoded schedule information and cannot be tampered with.
   * 
   * Uses backend endpoint: POST /api/slots/book
   * Backend requires: teacherId, slotId, studentIanaTimezone
   * 
   * @param teacherId Teacher ID (required by backend)
   * @param slotId HMAC-signed slot ID from getTeacherSlots
   * @param studentNote Optional note from student (not currently used by backend)
   */
  bookSlot(teacherId: string, slotId: string, studentNote?: string): Observable<SlotBookingResponse> {
    // Build request matching backend BookSlotRequestDto
    const request = {
      teacherId: teacherId,
      slotId: slotId,
      studentIanaTimezone: this.timezoneService.detectClientTimezone()
    };

    return this.http.post<SlotBookingResponse>(
      `${this.legacyBaseUrl}/api/slots/book`,
      request
    );
  }

  /**
   * Get booking details by ID.
   * 
   * @param bookingId The booking ID (GUID)
   */
  getBooking(bookingId: string): Observable<BookingDetailResponse> {
    return this.http.get<BookingDetailResponse>(
      `${this.schedulingBaseUrl}${this.schedulingApiPrefix}/bookings/${bookingId}`
    );
  }

  /**
   * Cancel a booking.
   * 
   * @param bookingId The booking ID (GUID)
   * @param reason Cancellation reason
   */
  cancelBooking(bookingId: string, reason: string): Observable<CancelBookingResponse> {
    return this.http.post<CancelBookingResponse>(
      `${this.schedulingBaseUrl}${this.schedulingApiPrefix}/bookings/${bookingId}/cancel`,
      { cancellationReason: reason }
    );
  }

  /**
   * Get meeting token for a booking (only available 15 min before session).
   * 
   * Uses backend endpoint: POST /api/slots/{bookingId}/meeting/token
   * 
   * @param bookingId The booking ID (number)
   */
  getMeetingToken(bookingId: string | number): Observable<MeetingTokenResponse> {
    return this.http.post<MeetingTokenResponse>(
      `${this.legacyBaseUrl}/api/slots/${bookingId}/meeting/token`,
      {}
    );
  }

  /**
   * Enrich slots with display information in the viewer's timezone.
   */
  private enrichSlots(slots: SlotDto[], viewerIanaTimezone: string): EnrichedSlot[] {
    const now = this.timezoneService.nowUtc();

    return slots.map(slot => {
      const viewerLocal12h = this.timezoneService.formatUtcAs12Hour(slot.startAtUtc, viewerIanaTimezone);
      const viewerLocalDate = this.timezoneService.getLocalDate(slot.startAtUtc, viewerIanaTimezone);
      
      const slotTime = this.timezoneService.utcToLocal(slot.startAtUtc, 'UTC');
      const isPast = slotTime < now;
      const isBookable = slot.status === 'Available' && !isPast;

      return {
        ...slot,
        viewerLocal12h,
        viewerLocalDate,
        isPast,
        isBookable
      };
    });
  }

  /**
   * Group slots by anchor date for calendar display.
   */
  groupSlotsByDate(slots: EnrichedSlot[]): Map<string, EnrichedSlot[]> {
    const grouped = new Map<string, EnrichedSlot[]>();
    
    for (const slot of slots) {
      const date = slot.viewerLocalDate;
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(slot);
    }

    // Sort each day's slots by time
    for (const [date, dateSlots] of grouped) {
      grouped.set(date, dateSlots.sort((a, b) => 
        new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime()
      ));
    }

    return grouped;
  }

  /**
   * Filter slots to show only available ones.
   */
  filterAvailableSlots(slots: EnrichedSlot[]): EnrichedSlot[] {
    return slots.filter(slot => slot.isBookable);
  }

  // ============================================
  // STUDENT BOOKING MANAGEMENT METHODS
  // ============================================

  /**
   * Get all individual bookings for the current student.
   * Uses the legacy API endpoint until fully migrated.
   */
  getStudentBookings(): Observable<BookingDetailResponse[]> {
    return this.http.get<BookingDetailResponse[]>(
      `${this.legacyBaseUrl}/api/booking/student`
    );
  }

  /**
   * Get meeting URL for a student's individual session.
   * 
   * @param bookingId The booking ID
   */
  getStudentMeetingUrl(bookingId: string): Observable<{ meetingUrl: string; canJoin: boolean }> {
    return this.http.get<{ meetingUrl: string; canJoin: boolean }>(
      `${this.legacyBaseUrl}/api/booking/student/${bookingId}/meeting-url`
    );
  }

  // ============================================
  // TEACHER BOOKING MANAGEMENT METHODS
  // ============================================

  /**
   * Get all bookings for the current teacher.
   */
  getTeacherBookings(options?: {
    page?: number;
    pageSize?: number;
    upcomingOnly?: boolean;
  }): Observable<{ bookings: BookingDetailResponse[]; totalCount: number }> {
    let params = new HttpParams();
    if (options?.page) params = params.set('page', String(options.page));
    if (options?.pageSize) params = params.set('pageSize', String(options.pageSize));
    if (options?.upcomingOnly !== undefined) params = params.set('upcomingOnly', String(options.upcomingOnly));

    return this.http.get<{ bookings: BookingDetailResponse[]; totalCount: number }>(
      `${this.legacyBaseUrl}/api/teacher/bookings`,
      { params }
    );
  }

  /**
   * Start a session and get meeting URL (for teacher).
   * 
   * @param bookingId The booking ID
   */
  startTeacherSession(bookingId: string | number): Observable<{ meetingUrl: string; roomId: string }> {
    return this.http.post<{ meetingUrl: string; roomId: string }>(
      `${this.legacyBaseUrl}/api/teacher/bookings/${bookingId}/start`,
      {}
    );
  }

  /**
   * Teacher cancels a booking (processes refund to student).
   * 
   * @param bookingId The booking ID
   * @param reason Optional cancellation reason
   */
  cancelBookingByTeacher(bookingId: string | number, reason?: string): Observable<CancelBookingResponse> {
    return this.http.post<CancelBookingResponse>(
      `${this.legacyBaseUrl}/api/booking/teacher/${bookingId}/cancel`,
      { reason }
    );
  }

  // ============================================
  // TEACHER AVAILABILITY MANAGEMENT METHODS
  // ============================================

  /**
   * Create availability slots for a teacher.
   * Matches backend DTO: CreateAvailabilitySlotsRequest
   * 
   * @param request The slot creation request
   */
  createTeacherSlots(request: {
    date: string;  // Format: YYYY-MM-DD (DateOnly on backend)
    timeRanges: Array<{ startTime: string; endTime: string }>;  // Format: HH:mm:ss (TimeOnly on backend)
    slotDurationMinutes: number;
  }): Observable<{ createdSlots: SlotDto[]; totalCreated: number }> {
    return this.http.post<{ createdSlots: SlotDto[]; totalCreated: number }>(
      `${this.schedulingBaseUrl}${this.schedulingApiPrefix}/teacher/slots`,
      request
    );
  }

  /**
   * Delete an availability slot.
   * Only available (non-booked) slots can be deleted.
   * 
   * @param slotId The slot ID (GUID)
   */
  deleteSlot(slotId: string): Observable<{ slotId: string; deleted: boolean }> {
    return this.http.delete<{ slotId: string; deleted: boolean }>(
      `${this.schedulingBaseUrl}${this.schedulingApiPrefix}/teacher/slots/${slotId}`
    );
  }
}
