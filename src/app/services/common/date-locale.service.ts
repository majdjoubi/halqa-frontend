// src/app/services/common/date-locale.service.ts
import { Injectable } from '@angular/core';
import { LanguageService } from '../language.service';

/**
 * Service for language-aware date formatting
 * Provides consistent date formatting across the application
 * that respects the current language setting (Arabic/English)
 */
@Injectable({
  providedIn: 'root',
})
export class DateLocaleService {
  constructor(private languageService: LanguageService) {}

  /**
   * Get the current locale code for date formatting
   */
  get currentLocale(): string {
    const lang = this.languageService.currentLanguage;
    return lang.code === 'ar' ? 'ar-SA' : 'en-US';
  }

  /**
   * Get FullCalendar locale string
   */
  get calendarLocale(): string {
    return this.languageService.currentLanguage.code;
  }

  /**
   * Get direction for calendar (rtl/ltr)
   */
  get calendarDirection(): 'rtl' | 'ltr' {
    return this.languageService.currentLanguage.direction;
  }

  /**
   * Format a date with full details (day, month, year, time)
   * Example: "December 27, 2025, 10:30 AM" or "27 ديسمبر 2025، 10:30 ص"
   */
  formatDateTime(date: Date | string | null | undefined): string {
    const d = this.parseDate(date);
    if (!d) return '';

    return d.toLocaleString(this.currentLocale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
  }

  /**
   * Format a date only (no time)
   * Example: "December 27, 2025" or "27 ديسمبر 2025"
   */
  formatDate(date: Date | string | null | undefined): string {
    const d = this.parseDate(date);
    if (!d) return '';

    return d.toLocaleDateString(this.currentLocale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  /**
   * Format time only
   * Example: "10:30 AM" or "10:30 ص"
   */
  formatTime(date: Date | string | null | undefined): string {
    const d = this.parseDate(date);
    if (!d) return '';

    return d.toLocaleTimeString(this.currentLocale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
  }

  /**
   * Format date for display in cards (short format)
   * Example: "Dec 27" or "27 ديسمبر"
   */
  formatShortDate(date: Date | string | null | undefined): string {
    const d = this.parseDate(date);
    if (!d) return '';

    return d.toLocaleDateString(this.currentLocale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  /**
   * Format date as DD/MM (day/month numeric) in UTC
   * Example: "27/12"
   */
  formatDayMonth(date: Date | string | null | undefined): string {
    const d = this.parseDate(date);
    if (!d) return '';

    const day = d.getUTCDate().toString().padStart(2, '0');
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  }

  /**
   * Format relative date (today, tomorrow, etc.) based on UTC
   */
  formatRelativeDate(date: Date | string | null | undefined): string {
    const d = this.parseDate(date);
    if (!d) return '';

    const now = new Date();
    // Use UTC for comparison
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const targetDate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diffDays = Math.round((targetDate - today) / (1000 * 60 * 60 * 24));

    const isArabic = this.languageService.currentLanguage.code === 'ar';

    if (diffDays === 0) {
      return isArabic ? 'اليوم' : 'Today';
    } else if (diffDays === 1) {
      return isArabic ? 'غداً' : 'Tomorrow';
    } else if (diffDays === -1) {
      return isArabic ? 'أمس' : 'Yesterday';
    } else if (diffDays > 1 && diffDays <= 7) {
      // Return day name for next 7 days
      return d.toLocaleDateString(this.currentLocale, { weekday: 'long', timeZone: 'UTC' });
    } else {
      return this.formatShortDate(d);
    }
  }

  /**
   * Format day of week name
   */
  formatDayOfWeek(dayNumber: number): string {
    // Create a date that falls on the desired day of week
    const baseDate = new Date(2024, 0, 7); // Sunday, Jan 7, 2024
    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + dayNumber);

    return targetDate.toLocaleDateString(this.currentLocale, { weekday: 'long' });
  }

  /**
   * Format month name
   */
  formatMonth(monthNumber: number): string {
    const date = new Date(2024, monthNumber, 1);
    return date.toLocaleDateString(this.currentLocale, { month: 'long' });
  }

  /**
   * Get calendar button text translations
   */
  getCalendarButtonText(): { today: string; month: string; week: string; day: string } {
    const isArabic = this.languageService.currentLanguage.code === 'ar';
    return {
      today: isArabic ? 'اليوم' : 'Today',
      month: isArabic ? 'شهر' : 'Month',
      week: isArabic ? 'أسبوع' : 'Week',
      day: isArabic ? 'يوم' : 'Day',
    };
  }

  /**
   * Parse various date formats to Date object
   * Handles ISO strings, timestamps, and Date objects
   * Treats timezone-less ISO strings as UTC
   */
  parseDate(value: any): Date | null {
    if (!value) return null;

    // If it's already a Date
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    // If it's a numeric timestamp
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }

    // If it's a string
    if (typeof value === 'string') {
      const trimmed = value.trim();

      // If string ends with Z or contains +/- offset, Date will parse as UTC
      if (/Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
      }

      // If it's an ISO-like string without timezone, append 'Z' to force UTC
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(trimmed)) {
        const d = new Date(trimmed + 'Z');
        return isNaN(d.getTime()) ? null : d;
      }

      // Last resort: let Date try to parse
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  /**
   * Convert a Date to ISO string for API calls
   */
  toISOString(date: Date | null): string | null {
    if (!date) return null;
    return date.toISOString();
  }

  /**
   * Get duration text based on minutes
   */
  formatDuration(minutes: number): string {
    const isArabic = this.languageService.currentLanguage.code === 'ar';
    
    if (minutes < 60) {
      return isArabic ? `${minutes} دقيقة` : `${minutes} minutes`;
    } else if (minutes === 60) {
      return isArabic ? 'ساعة واحدة' : '1 hour';
    } else if (minutes === 90) {
      return isArabic ? 'ساعة ونصف' : '1.5 hours';
    } else if (minutes === 120) {
      return isArabic ? 'ساعتان' : '2 hours';
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (mins === 0) {
        return isArabic ? `${hours} ساعات` : `${hours} hours`;
      } else {
        return isArabic 
          ? `${hours} ساعات و ${mins} دقيقة` 
          : `${hours} hours ${mins} minutes`;
      }
    }
  }
}
