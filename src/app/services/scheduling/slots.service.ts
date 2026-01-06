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
 * Response from GET /api/slots/teachers/{teacherId}
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
 * Request body for POST /api/slots/book
 */
export interface BookSlotRequest {
  teacherId: string;
  slotId: string;
  studentIanaTimezone: string;
  clientContext?: {
    uiClock?: '12H' | '24H';
    uiLocale?: string;
    source?: string;
  };
}

/**
 * Response from POST /api/slots/book
 */
export interface SlotBookingResponse {
  bookingId: number;
  teacherId: string;
  studentId: string;
  scheduledAtUtc: string;
  durationMin: number;
  anchorDateTeacher: string;
  teacherIanaTimezone: string;
  studentIanaTimezone: string;
  display: {
    teacherLocal12h: string;
    teacherLocalDate: string;
    studentLocal12h: string;
    studentLocalDate: string;
  };
  meeting?: {
    provider: string;
    roomId?: string;
    joinWindow?: {
      opensAtUtc: string;
      closesAtUtc: string;
    };
  };
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
 */
@Injectable({
  providedIn: 'root'
})
export class SlotsService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Get available slots for a teacher within a date range.
   * Slots are returned in UTC with HMAC-signed IDs for secure booking.
   * 
   * @param teacherId Teacher ID to get slots for
   * @param fromAnchorDate Start date (YYYY-MM-DD in teacher's timezone)
   * @param toAnchorDate End date (YYYY-MM-DD in teacher's timezone)
   * @param durationMinutes Slot duration (30 or 60)
   */
  getTeacherSlots(
    teacherId: string,
    fromAnchorDate: string,
    toAnchorDate: string,
    durationMinutes: number = 60
  ): Observable<TeacherSlotsResponse> {
    const params = new HttpParams()
      .set('fromAnchorDate', fromAnchorDate)
      .set('toAnchorDate', toAnchorDate)
      .set('durationMinutes', durationMinutes.toString());

    return this.http.get<TeacherSlotsResponse>(
      `${this.baseUrl}/api/slots/teachers/${teacherId}`,
      { params }
    );
  }

  /**
   * Get available slots enriched with display information in the viewer's timezone.
   * This is the recommended method for UI display.
   * 
   * @param teacherId Teacher ID to get slots for
   * @param fromAnchorDate Start date (YYYY-MM-DD in teacher's timezone)
   * @param toAnchorDate End date (YYYY-MM-DD in teacher's timezone)
   * @param durationMinutes Slot duration (30 or 60)
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

    return this.getTeacherSlots(teacherId, fromAnchorDate, toAnchorDate, durationMinutes).pipe(
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
   * @param teacherId Teacher ID (must match the slot's teacher)
   * @param slotId HMAC-signed slot ID from getTeacherSlots
   */
  bookSlot(teacherId: string, slotId: string): Observable<SlotBookingResponse> {
    const request: BookSlotRequest = {
      teacherId,
      slotId,
      studentIanaTimezone: this.timezoneService.detectClientTimezone(),
      clientContext: {
        uiClock: '12H',
        uiLocale: navigator.language || 'en',
        source: 'web'
      }
    };

    return this.http.post<SlotBookingResponse>(
      `${this.baseUrl}/api/slots/book`,
      request
    );
  }

  /**
   * Get meeting token for a booking (only available 15 min before session).
   */
  getMeetingToken(bookingId: number): Observable<{ canJoin: boolean; role: string; scheduledAtUtc: string }> {
    return this.http.post<{ canJoin: boolean; role: string; scheduledAtUtc: string }>(
      `${this.baseUrl}/api/slots/${bookingId}/meeting/token`,
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
}
