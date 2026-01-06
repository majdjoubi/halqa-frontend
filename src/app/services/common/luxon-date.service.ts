import { Injectable } from '@angular/core';
import { DateTime, Duration, Settings } from 'luxon';

/**
 * LuxonDateService - Centralized date/time handling using Luxon
 * 
 * RULES:
 * 1. All data to/from backend must be UTC ISO 8601 strings (e.g., "2023-10-27T14:00:00Z")
 * 2. Internally store dates as Luxon DateTime objects
 * 3. Convert to user's timezone only at display time
 * 4. Use Luxon's semantic math (plus/minus) instead of milliseconds
 * 5. Use Luxon's comparison methods instead of converting to numbers
 */
@Injectable({
  providedIn: 'root'
})
export class LuxonDateService {
  
  // Mecca timezone (GMT+3)
  private readonly MECCA_TIMEZONE = 'Asia/Riyadh';
  
  constructor() {
    // Set default locale based on browser
    Settings.defaultLocale = navigator.language || 'en';
  }

  // ========== CONVERSION HELPERS ==========

  /**
   * Convert DateTime to UTC ISO string for server communication
   * @param dateTime Luxon DateTime object
   * @returns UTC ISO 8601 string (e.g., "2023-10-27T14:00:00.000Z")
   */
  toServerTime(dateTime: DateTime): string {
    return dateTime.toUTC().toISO() || '';
  }

  /**
   * Parse server UTC ISO string to local DateTime
   * @param isoString UTC ISO string from server
   * @returns DateTime in user's local timezone
   */
  fromServerTime(isoString: string): DateTime {
    if (!isoString) {
      return DateTime.invalid('empty string');
    }
    return DateTime.fromISO(isoString, { zone: 'utc' }).toLocal();
  }

  /**
   * Parse server UTC ISO string to Mecca timezone DateTime
   * @param isoString UTC ISO string from server
   * @returns DateTime in Mecca timezone (GMT+3)
   */
  fromServerTimeToMecca(isoString: string): DateTime {
    if (!isoString) {
      return DateTime.invalid('empty string');
    }
    return DateTime.fromISO(isoString, { zone: 'utc' }).setZone(this.MECCA_TIMEZONE);
  }

  /**
   * Convert local DateTime to Mecca timezone
   * @param dateTime DateTime in any timezone
   * @returns DateTime in Mecca timezone
   */
  toMeccaTime(dateTime: DateTime): DateTime {
    return dateTime.setZone(this.MECCA_TIMEZONE);
  }

  /**
   * Convert DateTime to UTC
   * @param dateTime DateTime in any timezone
   * @returns DateTime in UTC
   */
  toUTC(dateTime: DateTime): DateTime {
    return dateTime.toUTC();
  }

  // ========== FACTORY METHODS ==========

  /**
   * Get current DateTime in local timezone
   */
  now(): DateTime {
    return DateTime.now();
  }

  /**
   * Get current DateTime in Mecca timezone
   */
  nowMecca(): DateTime {
    return DateTime.now().setZone(this.MECCA_TIMEZONE);
  }

  /**
   * Get current DateTime in UTC
   */
  nowUTC(): DateTime {
    return DateTime.utc();
  }

  /**
   * Create DateTime from ISO string
   * @param isoString ISO date string
   * @param zone Optional timezone (defaults to local)
   */
  fromISO(isoString: string, zone?: string): DateTime {
    if (!isoString) {
      return DateTime.invalid('empty string');
    }
    const dt = DateTime.fromISO(isoString);
    return zone ? dt.setZone(zone) : dt;
  }

  /**
   * Create DateTime from JavaScript Date object
   * @param date JavaScript Date
   * @param zone Optional timezone
   */
  fromJSDate(date: Date, zone?: string): DateTime {
    const dt = DateTime.fromJSDate(date);
    return zone ? dt.setZone(zone) : dt;
  }

  /**
   * Create DateTime from date components
   */
  fromObject(obj: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
  }, zone?: string): DateTime {
    const dt = DateTime.fromObject(obj);
    return zone ? dt.setZone(zone) : dt;
  }

  /**
   * Create DateTime from format string
   * @param text Date string
   * @param format Format pattern (e.g., "yyyy-MM-dd")
   */
  fromFormat(text: string, format: string, zone?: string): DateTime {
    const dt = DateTime.fromFormat(text, format);
    return zone ? dt.setZone(zone) : dt;
  }

  /**
   * Create DateTime in Mecca timezone from date string and hour
   * @param dateStr Date string in "yyyy-MM-dd" format
   * @param hour Hour (0-23)
   * @param minute Minute (0-59)
   * @returns DateTime in Mecca timezone
   */
  createMeccaDateTime(dateStr: string, hour: number, minute: number = 0): DateTime {
    // Parse the date parts
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Create DateTime directly in Mecca timezone
    return DateTime.fromObject(
      { year, month, day, hour, minute, second: 0, millisecond: 0 },
      { zone: this.MECCA_TIMEZONE }
    );
  }

  // ========== DATE MATH (DST-Safe) ==========

  /**
   * Add time to DateTime
   * @param dateTime Base DateTime
   * @param duration Object with time units to add
   */
  plus(dateTime: DateTime, duration: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  }): DateTime {
    return dateTime.plus(duration);
  }

  /**
   * Subtract time from DateTime
   * @param dateTime Base DateTime
   * @param duration Object with time units to subtract
   */
  minus(dateTime: DateTime, duration: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  }): DateTime {
    return dateTime.minus(duration);
  }

  /**
   * Get start of a time period
   * @param dateTime DateTime to adjust
   * @param unit 'day' | 'week' | 'month' | 'year'
   */
  startOf(dateTime: DateTime, unit: 'day' | 'week' | 'month' | 'year'): DateTime {
    return dateTime.startOf(unit);
  }

  /**
   * Get end of a time period
   * @param dateTime DateTime to adjust
   * @param unit 'day' | 'week' | 'month' | 'year'
   */
  endOf(dateTime: DateTime, unit: 'day' | 'week' | 'month' | 'year'): DateTime {
    return dateTime.endOf(unit);
  }

  // ========== COMPARISON METHODS ==========

  /**
   * Check if date1 is before date2
   */
  isBefore(date1: DateTime, date2: DateTime): boolean {
    return date1 < date2;
  }

  /**
   * Check if date1 is after date2
   */
  isAfter(date1: DateTime, date2: DateTime): boolean {
    return date1 > date2;
  }

  /**
   * Check if date1 equals date2
   */
  isSame(date1: DateTime, date2: DateTime): boolean {
    return date1.equals(date2);
  }

  /**
   * Check if date1 is same day as date2
   */
  isSameDay(date1: DateTime, date2: DateTime): boolean {
    return date1.hasSame(date2, 'day');
  }

  /**
   * Check if dateTime is in the past
   */
  isPast(dateTime: DateTime): boolean {
    return dateTime < DateTime.now();
  }

  /**
   * Check if dateTime is in the future
   */
  isFuture(dateTime: DateTime): boolean {
    return dateTime > DateTime.now();
  }

  /**
   * Check if dateTime is today
   */
  isToday(dateTime: DateTime): boolean {
    return dateTime.hasSame(DateTime.now(), 'day');
  }

  /**
   * Get difference between two DateTimes
   */
  diff(date1: DateTime, date2: DateTime, units: ('years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds')[] = ['seconds']): Duration {
    return date1.diff(date2, units);
  }

  // ========== FORMATTING ==========

  /**
   * Format DateTime for display
   * @param dateTime DateTime to format
   * @param format Format string or preset
   */
  format(dateTime: DateTime, format: string = 'yyyy-MM-dd HH:mm'): string {
    if (!dateTime.isValid) return '';
    return dateTime.toFormat(format);
  }

  /**
   * Format DateTime as relative time (e.g., "2 hours ago")
   */
  formatRelative(dateTime: DateTime): string {
    if (!dateTime.isValid) return '';
    return dateTime.toRelative() || '';
  }

  /**
   * Format DateTime as localized string
   */
  formatLocalized(dateTime: DateTime, options?: Intl.DateTimeFormatOptions): string {
    if (!dateTime.isValid) return '';
    return dateTime.toLocaleString(options || DateTime.DATETIME_MED);
  }

  /**
   * Format as date only (YYYY-MM-DD)
   */
  formatDate(dateTime: DateTime): string {
    if (!dateTime.isValid) return '';
    return dateTime.toFormat('yyyy-MM-dd');
  }

  /**
   * Format as time only (HH:mm)
   */
  formatTime(dateTime: DateTime): string {
    if (!dateTime.isValid) return '';
    return dateTime.toFormat('HH:mm');
  }

  /**
   * Format as time with seconds (HH:mm:ss)
   */
  formatTimeWithSeconds(dateTime: DateTime): string {
    if (!dateTime.isValid) return '';
    return dateTime.toFormat('HH:mm:ss');
  }

  // ========== UTILITY METHODS ==========

  /**
   * Get day of week (1 = Monday, 7 = Sunday in Luxon)
   * Convert to JS convention (0 = Sunday, 6 = Saturday)
   */
  getDayOfWeekJS(dateTime: DateTime): number {
    return dateTime.weekday % 7; // Luxon: 1=Mon..7=Sun -> JS: 0=Sun..6=Sat
  }

  /**
   * Get Luxon weekday (1 = Monday, 7 = Sunday)
   */
  getWeekday(dateTime: DateTime): number {
    return dateTime.weekday;
  }

  /**
   * Check if DateTime is valid
   */
  isValid(dateTime: DateTime): boolean {
    return dateTime.isValid;
  }

  /**
   * Get timezone offset in minutes for Mecca
   */
  getMeccaOffsetMinutes(): number {
    return 180; // GMT+3 = 180 minutes
  }

  /**
   * Get current local timezone offset in minutes
   */
  getLocalOffsetMinutes(): number {
    return DateTime.now().offset;
  }

  /**
   * Convert JavaScript Date to DateTime (legacy support)
   */
  fromDate(date: Date): DateTime {
    return DateTime.fromJSDate(date);
  }

  /**
   * Convert DateTime to JavaScript Date (for library compatibility)
   */
  toJSDate(dateTime: DateTime): Date {
    return dateTime.toJSDate();
  }

  /**
   * Parse various date formats intelligently
   * Handles: ISO strings, date-only strings, Date objects
   */
  parseAny(value: string | Date | DateTime | null | undefined): DateTime {
    if (!value) {
      return DateTime.invalid('null or undefined');
    }
    
    if (value instanceof DateTime) {
      return value;
    }
    
    if (value instanceof Date) {
      return DateTime.fromJSDate(value);
    }
    
    const trimmed = String(value).trim();
    
    // Already has timezone info (Z or +/- offset)
    if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
      return DateTime.fromISO(trimmed);
    }
    
    // Try ISO format
    const isoResult = DateTime.fromISO(trimmed);
    if (isoResult.isValid) {
      return isoResult;
    }
    
    // Try common formats
    const formats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm'];
    for (const fmt of formats) {
      const result = DateTime.fromFormat(trimmed, fmt);
      if (result.isValid) {
        return result;
      }
    }
    
    return DateTime.invalid('unrecognized format');
  }

  /**
   * Create a DateTime for a specific time today
   * @param hour Hour (0-23)
   * @param minute Minute (0-59)
   */
  todayAt(hour: number, minute: number = 0): DateTime {
    return DateTime.now().set({ hour, minute, second: 0, millisecond: 0 });
  }

  /**
   * Create a DateTime for a specific time on a specific date
   */
  dateAt(date: DateTime, hour: number, minute: number = 0): DateTime {
    return date.set({ hour, minute, second: 0, millisecond: 0 });
  }
}
