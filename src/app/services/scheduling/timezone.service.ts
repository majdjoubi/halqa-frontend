import { Injectable } from '@angular/core';
import { DateTime, IANAZone } from 'luxon';

/**
 * Timezone-Safe Scheduling Service for Angular
 * 
 * ARCHITECTURE INVARIANTS:
 * - AM/PM is UI-only; parsing must be explicit: 12:00 AM = 00:00, 12:00 PM = 12:00
 * - All scheduled times use UTC as single source of truth
 * - IANA timezone detection on client for student timezone
 * - Display times in user's local timezone
 * 
 * CRITICAL: This service must be used for ALL time display and parsing
 * to prevent the "12:00 AM → 12:00 noon" bug.
 */
@Injectable({
  providedIn: 'root'
})
export class TimezoneService {

  constructor() {}

  /**
   * Parse 12-hour AM/PM time to 24-hour format.
   * 
   * CRITICAL INVARIANT:
   * - 12 AM → 0 (midnight)
   * - 12 PM → 12 (noon)
   * - 1-11 AM → 1-11
   * - 1-11 PM → 13-23
   * 
   * @param hour12 Hour in 12-hour format (1-12)
   * @param period "AM" or "PM" (case insensitive)
   * @returns Hour in 24-hour format (0-23)
   */
  parseAmPmToHour24(hour12: number, period: string): number {
    const normalizedPeriod = period.toUpperCase().trim();
    
    if (hour12 < 1 || hour12 > 12) {
      throw new Error(`Invalid 12-hour value: ${hour12}. Must be 1-12.`);
    }
    
    if (normalizedPeriod !== 'AM' && normalizedPeriod !== 'PM') {
      throw new Error(`Invalid period: ${period}. Must be AM or PM.`);
    }
    
    // CRITICAL: Handle the 12:00 edge cases correctly
    if (normalizedPeriod === 'AM') {
      // 12 AM is midnight (00:00), all others are same hour
      return hour12 === 12 ? 0 : hour12;
    } else {
      // 12 PM is noon (12:00), all others add 12
      return hour12 === 12 ? 12 : hour12 + 12;
    }
  }

  /**
   * Convert 24-hour format to 12-hour AM/PM display.
   * 
   * @param hour24 Hour in 24-hour format (0-23)
   * @returns Object with hour12 (1-12) and period (AM/PM)
   */
  formatHour24ToAmPm(hour24: number): { hour12: number; period: 'AM' | 'PM' } {
    if (hour24 < 0 || hour24 > 23) {
      throw new Error(`Invalid 24-hour value: ${hour24}. Must be 0-23.`);
    }
    
    if (hour24 === 0) {
      return { hour12: 12, period: 'AM' }; // Midnight
    } else if (hour24 < 12) {
      return { hour12: hour24, period: 'AM' };
    } else if (hour24 === 12) {
      return { hour12: 12, period: 'PM' }; // Noon
    } else {
      return { hour12: hour24 - 12, period: 'PM' };
    }
  }

  /**
   * Detect client's IANA timezone.
   * Falls back to 'UTC' if detection fails.
   */
  detectClientTimezone(): string {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Validate it's a valid IANA zone
      if (this.validateIanaZone(tz)) {
        return tz;
      }
    } catch {
      console.warn('Failed to detect client timezone, using UTC');
    }
    return 'UTC';
  }

  /**
   * Validate that a timezone string is a valid IANA timezone.
   */
  validateIanaZone(zone: string): boolean {
    if (!zone || typeof zone !== 'string') {
      return false;
    }
    try {
      const ianaZone = IANAZone.create(zone);
      return ianaZone.isValid;
    } catch {
      return false;
    }
  }

  /**
   * Convert UTC ISO string to local DateTime in specified timezone.
   */
  utcToLocal(utcIsoString: string, ianaZone: string): DateTime {
    const utc = DateTime.fromISO(utcIsoString, { zone: 'UTC' });
    if (!utc.isValid) {
      throw new Error(`Invalid UTC date string: ${utcIsoString}`);
    }
    return utc.setZone(ianaZone);
  }

  /**
   * Convert local DateTime to UTC ISO string.
   */
  localToUtc(localDateTime: DateTime): string {
    return localDateTime.toUTC().toISO()!;
  }

  /**
   * Format a UTC time for display in user's local timezone with 12-hour clock.
   * 
   * @param utcIsoString UTC time in ISO format
   * @param ianaZone IANA timezone for display
   * @param includeDate Whether to include the date in the output
   * @returns Formatted string like "2:30 PM" or "Jan 7, 2026 2:30 PM"
   */
  formatUtcAs12Hour(utcIsoString: string, ianaZone: string, includeDate = false): string {
    const local = this.utcToLocal(utcIsoString, ianaZone);
    
    if (includeDate) {
      return local.toFormat('MMM d, yyyy h:mm a');
    }
    return local.toFormat('h:mm a');
  }

  /**
   * Format a UTC time for display in user's local timezone with 24-hour clock.
   */
  formatUtcAs24Hour(utcIsoString: string, ianaZone: string, includeDate = false): string {
    const local = this.utcToLocal(utcIsoString, ianaZone);
    
    if (includeDate) {
      return local.toFormat('yyyy-MM-dd HH:mm');
    }
    return local.toFormat('HH:mm');
  }

  /**
   * Get the local date in the specified timezone for a given UTC time.
   * This is the "anchor date" from the user's perspective.
   */
  getLocalDate(utcIsoString: string, ianaZone: string): string {
    const local = this.utcToLocal(utcIsoString, ianaZone);
    return local.toFormat('yyyy-MM-dd');
  }

  /**
   * Get current time in UTC.
   */
  nowUtc(): DateTime {
    return DateTime.utc();
  }

  /**
   * Create a DateTime from date and time components in a specific timezone.
   * Useful for building booking requests from user input.
   */
  createLocalDateTime(
    year: number,
    month: number,
    day: number,
    hour24: number,
    minute: number,
    ianaZone: string
  ): DateTime {
    return DateTime.fromObject(
      { year, month, day, hour: hour24, minute },
      { zone: ianaZone }
    );
  }

  /**
   * Create a DateTime from date and 12-hour time with AM/PM in a specific timezone.
   */
  createLocalDateTimeFromAmPm(
    year: number,
    month: number,
    day: number,
    hour12: number,
    minute: number,
    period: 'AM' | 'PM',
    ianaZone: string
  ): DateTime {
    const hour24 = this.parseAmPmToHour24(hour12, period);
    return this.createLocalDateTime(year, month, day, hour24, minute, ianaZone);
  }

  /**
   * Calculate minutes until a session starts.
   * Useful for showing "Join" button or countdown.
   */
  getMinutesUntil(utcIsoString: string): number {
    const target = DateTime.fromISO(utcIsoString, { zone: 'UTC' });
    const now = DateTime.utc();
    return target.diff(now, 'minutes').minutes;
  }

  /**
   * Check if a session is joinable (within 15 minutes of start).
   */
  isSessionJoinable(utcIsoString: string): boolean {
    const minutes = this.getMinutesUntil(utcIsoString);
    return minutes <= 15 && minutes >= -30; // 15 min before to 30 min after
  }

  /**
   * Format duration in minutes to human-readable string.
   */
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    }
    return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMinutes} min`;
  }
}
