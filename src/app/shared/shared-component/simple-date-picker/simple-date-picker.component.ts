import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-simple-date-picker',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './simple-date-picker.component.html',
  styleUrls: ['./simple-date-picker.component.scss'],
})
export class SimpleDatePickerComponent implements OnChanges {
  /**
   * Array of dates that have available slots (as ISO date strings 'YYYY-MM-DD' or Date objects)
   */
  @Input() availableDates: (string | Date)[] = [];

  /**
   * Currently selected date (ISO string 'YYYY-MM-DD')
   */
  @Input() selectedDate: string | null = null;

  /**
   * RTL mode for Arabic layout
   */
  @Input() rtl: boolean = false;

  /**
   * Allow clicking all future dates (for teacher mode)
   * When true, all non-past dates are clickable, not just those with availability
   */
  @Input() allowAllFutureDates: boolean = false;

  /**
   * Emits when user selects a date
   */
  @Output() dateSelected = new EventEmitter<string>();

  // Current displayed month/year
  currentMonth: number = new Date().getMonth();
  currentYear: number = new Date().getFullYear();

  // Calendar grid data
  calendarDays: CalendarDay[] = [];

  // Day names for header
  dayNames: string[] = [];

  // Set of available dates for quick lookup (format: 'YYYY-MM-DD')
  private availableDatesSet: Set<string> = new Set();

  constructor(private translate: TranslateService) {
    this.initDayNames();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['availableDates']) {
      this.updateAvailableDatesSet();
      this.buildCalendar();
      
      // Auto-select first available date if no selection
      if (!this.selectedDate && this.availableDates.length > 0) {
        this.autoSelectFirstAvailable();
      }
    }
    if (changes['selectedDate']) {
      this.buildCalendar();
    }
    if (changes['rtl']) {
      this.initDayNames();
    }
  }

  private initDayNames(): void {
    // Week starts from Sunday
    this.dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  }

  private updateAvailableDatesSet(): void {
    this.availableDatesSet.clear();
    for (const date of this.availableDates) {
      const dateStr = this.toDateString(date);
      if (dateStr) {
        this.availableDatesSet.add(dateStr);
      }
    }
  }

  private toDateString(date: string | Date): string {
    if (!date) return '';
    if (typeof date === 'string') {
      // Already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      // ISO datetime string - extract date part
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return this.formatDateKey(d);
      }
      return '';
    }
    return this.formatDateKey(date);
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private autoSelectFirstAvailable(): void {
    // Find first available date from today onwards
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sortedDates = Array.from(this.availableDatesSet)
      .map(d => new Date(d))
      .filter(d => d >= today)
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (sortedDates.length > 0) {
      const firstDate = this.formatDateKey(sortedDates[0]);
      // Navigate to the month containing the first available date
      this.currentMonth = sortedDates[0].getMonth();
      this.currentYear = sortedDates[0].getFullYear();
      this.buildCalendar();
      this.selectDate(firstDate);
    }
  }

  buildCalendar(): void {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // First day of month
    const firstDayOfMonth = new Date(this.currentYear, this.currentMonth, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0-6
    
    // Days in this month
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    
    // Days from previous month to fill the first week
    const prevMonthDays = new Date(this.currentYear, this.currentMonth, 0).getDate();
    
    // Add empty/previous month days
    for (let i = 0; i < startingDayOfWeek; i++) {
      const day = prevMonthDays - startingDayOfWeek + i + 1;
      days.push({
        date: null,
        day: day,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        hasAvailability: false,
        isPast: true,
      });
    }
    
    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.currentYear, this.currentMonth, day);
      const dateKey = this.formatDateKey(date);
      const isPast = date < today;
      
      days.push({
        date: dateKey,
        day: day,
        isCurrentMonth: true,
        isToday: this.formatDateKey(today) === dateKey,
        isSelected: this.selectedDate === dateKey,
        hasAvailability: this.availableDatesSet.has(dateKey) && !isPast,
        isPast: isPast,
      });
    }
    
    // Fill remaining cells to complete the grid (6 rows × 7 days = 42 cells)
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: null,
        day: i,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        hasAvailability: false,
        isPast: false,
      });
    }
    
    this.calendarDays = days;
  }

  selectDate(dateKey: string): void {
    if (!dateKey) return;
    
    // Check if date is clickable
    const day = this.calendarDays.find(d => d.date === dateKey);
    if (day && !day.isPast && day.isCurrentMonth) {
      // Allow selection if has availability OR allowAllFutureDates is true
      if (day.hasAvailability || this.allowAllFutureDates) {
        this.dateSelected.emit(dateKey);
      }
    }
  }

  prevMonth(): void {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.buildCalendar();
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.buildCalendar();
  }

  getMonthName(): string {
    const date = new Date(this.currentYear, this.currentMonth, 1);
    // Use Arabic locale if RTL
    const locale = this.rtl ? 'ar' : 'en';
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }

  getDayName(dayKey: string): string {
    // Return translation key for day names
    return `calendar.days.${dayKey}`;
  }

  trackByDay(index: number, day: CalendarDay): string {
    return day.date || `empty-${index}`;
  }
}

interface CalendarDay {
  date: string | null;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasAvailability: boolean;
  isPast: boolean;
}
