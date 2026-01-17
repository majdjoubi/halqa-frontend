import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions, EventInput, DateSelectArg, EventDropArg, Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { EventResizeDoneArg } from '@fullcalendar/interaction';
import { TranslateModule } from '@ngx-translate/core';
import { DateTime } from 'luxon';
import { DateLocaleService } from '../../../services/common/date-locale.service';
import { LanguageService } from '../../../services/language.service';
import { Subscription } from 'rxjs';

export interface LessonEvent {
  id: string;
  title: string;
  start: Date | string;
  end?: Date | string;
  type: 'individual' | 'group';
  status: 'available' | 'booked' | 'completed';
  studentName?: string;
  teacherName?: string;
  price?: number;
  maxStudents?: number;
  currentStudents?: number;
  description?: string;
}

@Component({
  selector: 'app-lesson-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule, TranslateModule],
  templateUrl: './lesson-calendar.component.html',
  styleUrls: ['./lesson-calendar.component.scss']
})
export class LessonCalendarComponent implements OnInit, OnChanges, OnDestroy {
  // Input: role determines what user sees
  // 'teacher' - sees booked lessons with student names
  // 'student' - sees available lessons only
  @Input() userRole: 'teacher' | 'student' = 'student';
  
  // Input: lessons to display
  @Input() lessons: LessonEvent[] = [];
  
  // Input: loading state
  @Input() isLoading = false;
  
  // Input: GMT offset in minutes (e.g., 60 for GMT+1, -300 for GMT-5)
  // Fixed to GMT +0 (UTC) = 0 minutes
  @Input() gmtOffset: number = 0;
  
  // Output: when user clicks on an event
  @Output() eventClick = new EventEmitter<LessonEvent>();
  
  // Output: when user clicks on an empty date (for creating new lessons)
  @Output() dateClick = new EventEmitter<Date>();

  // Output: when user drops an event (drag & drop)
  @Output() eventDrop = new EventEmitter<EventDropArg>();

  // Output: when user resizes an event
  @Output() eventResize = new EventEmitter<EventResizeDoneArg>();

  // Output: when user selects a date range
  @Output() select = new EventEmitter<DateSelectArg>();

  // ViewChild to access FullCalendar API
  @ViewChild('calendar') calendarComponent?: FullCalendarComponent;

  // Used to force calendar re-creation when GMT offset changes
  calendarVisible = true;

  private langSubscription?: Subscription;

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    weekends: true,
    editable: false, // Will be updated based on role
    selectable: false, // Will be updated based on role
    selectMirror: true,
    dayMaxEvents: true,
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    slotDuration: '00:30:00',
    scrollTime: '08:00:00',
    allDaySlot: false,
    nowIndicator: true,
    now: () => this.getNowInSelectedTimezone(),
    height: 'auto',
    slotLabelFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    dayHeaderFormat: (date: any) => {
      const d = date.date.marker;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const weekday = d.toLocaleDateString('en', { weekday: 'short' });
      return `${weekday} ${day}/${month}`;
    },
    titleFormat: (date: any) => {
      const start = date.start.marker;
      const day = start.getDate().toString().padStart(2, '0');
      const month = (start.getMonth() + 1).toString().padStart(2, '0');
      const year = start.getFullYear();
      return `${day}/${month}/${year}`;
    },
    locale: 'ar',
    direction: 'rtl',
    buttonText: {
      today: 'اليوم',
      month: 'شهر',
      week: 'أسبوع',
      day: 'يوم'
    },
    events: [],
    eventClick: this.handleEventClick.bind(this),
    dateClick: this.handleDateClick.bind(this),
    eventDrop: this.handleEventDrop.bind(this),
    eventResize: this.handleEventResize.bind(this),
    select: this.handleDateSelect.bind(this)
  };

  constructor(
    private dateLocaleService: DateLocaleService,
    private languageService: LanguageService
  ) {}

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    const isMobile = event.target.innerWidth < 768;
    const newView = isMobile ? 'timeGridDay' : 'timeGridWeek';
    if (this.calendarOptions.initialView !== newView) {
      this.calendarOptions = {
        ...this.calendarOptions,
        initialView: newView
      };
    }
  }

  ngOnInit(): void {
    // Subscribe to language changes
    this.langSubscription = this.languageService.currentLanguage$.subscribe(lang => {
      this.updateCalendarLocale();
      this.updateCalendarEvents();
    });
    
    this.updateCalendarLocale();
    this.updateCalendarEvents();
    this.updateInteractivity();
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lessons'] || changes['userRole']) {
      this.updateCalendarEvents();
    }
    if (changes['userRole']) {
      this.updateInteractivity();
    }
    if (changes['gmtOffset']) {
      // Update the now indicator when GMT offset changes
      this.updateNowIndicator();
    }
  }

  /**
   * Get current time adjusted to selected GMT offset for the now indicator
   * Uses Luxon for DST-safe timezone handling
   */
  private getNowInSelectedTimezone(): Date {
    // Use Luxon to handle timezone correctly
    const now = DateTime.utc();
    // Apply GMT offset (in minutes)
    const adjusted = now.plus({ minutes: this.gmtOffset });
    return adjusted.toJSDate();
  }

  /**
   * Force calendar to update the now indicator by recreating it
   */
  private updateNowIndicator(): void {
    // Update the now option
    this.calendarOptions = {
      ...this.calendarOptions,
      now: () => this.getNowInSelectedTimezone()
    };
    
    // Force calendar to re-create by hiding and showing
    this.calendarVisible = false;
    setTimeout(() => {
      this.calendarVisible = true;
    }, 0);
  }

  private updateInteractivity(): void {
    const isTeacher = this.userRole === 'teacher';
    this.calendarOptions = {
      ...this.calendarOptions,
      editable: isTeacher,
      selectable: isTeacher
    };
  }

  /**
   * Update calendar locale based on current language
   */
  private updateCalendarLocale(): void {
    const buttonText = this.dateLocaleService.getCalendarButtonText();
    const currentLang = this.dateLocaleService.calendarLocale;
    
    this.calendarOptions = {
      ...this.calendarOptions,
      locale: currentLang,
      direction: this.dateLocaleService.calendarDirection,
      buttonText: buttonText,
      // Force DD/MM format using custom formatters
      dayHeaderFormat: (date: any) => {
        const d = date.date.marker;
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const weekday = d.toLocaleDateString(currentLang, { weekday: 'short' });
        return `${weekday} ${day}/${month}`;
      },
      titleFormat: (date: any) => {
        const start = date.start.marker;
        const day = start.getDate().toString().padStart(2, '0');
        const month = (start.getMonth() + 1).toString().padStart(2, '0');
        const year = start.getFullYear();
        return `${day}/${month}/${year}`;
      },
      slotLabelFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      },
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }
    };
  }

  private updateCalendarEvents(): void {
    const events: EventInput[] = this.lessons
      .filter(lesson => this.shouldShowLesson(lesson))
      .map(lesson => this.mapLessonToEvent(lesson));
    
    this.calendarOptions = {
      ...this.calendarOptions,
      events: events
    };
  }

  private shouldShowLesson(lesson: LessonEvent): boolean {
    if (this.userRole === 'student') {
      // Students see available lessons only
      return lesson.status === 'available';
    } else {
      // Teachers see all their lessons
      return true;
    }
  }

  private mapLessonToEvent(lesson: LessonEvent): EventInput {
    let backgroundColor = '#27ae60'; // default green for available
    let borderColor = '#27ae60';
    let title = lesson.title;

    // Check if lesson is in the past
    const now = new Date();
    const lessonEnd = lesson.end ? new Date(lesson.end) : new Date(lesson.start);
    const isPast = lessonEnd < now;

    if (isPast) {
      backgroundColor = '#95a5a6'; // Silver/Grey for past lessons
      borderColor = '#7f8c8d';
    } else {
      // Set colors based on status for future lessons
      switch (lesson.status) {
        case 'available':
          backgroundColor = '#27ae60';
          borderColor = '#1e8449';
          break;
        case 'booked':
          backgroundColor = '#3498db';
          borderColor = '#2980b9';
          if (this.userRole === 'teacher' && lesson.studentName) {
            title = `${lesson.title} - ${lesson.studentName}`;
          }
          break;
        case 'completed':
          backgroundColor = '#95a5a6';
          borderColor = '#7f8c8d';
          break;
      }

      // Different color for group vs individual
      if (lesson.type === 'group') {
        backgroundColor = lesson.status === 'available' ? '#9b59b6' : backgroundColor;
        borderColor = lesson.status === 'available' ? '#8e44ad' : borderColor;
      }
    }

    return {
      id: lesson.id,
      title: title,
      start: lesson.start,
      end: lesson.end,
      backgroundColor,
      borderColor,
      extendedProps: {
        type: lesson.type,
        status: lesson.status,
        studentName: lesson.studentName,
        teacherName: lesson.teacherName,
        price: lesson.price,
        maxStudents: lesson.maxStudents,
        currentStudents: lesson.currentStudents,
        description: lesson.description,
        originalLesson: lesson
      }
    };
  }

  handleEventClick(info: any): void {
    const lesson = info.event.extendedProps.originalLesson as LessonEvent;
    this.eventClick.emit(lesson);
  }

  handleDateClick(info: any): void {
    if (this.userRole === 'teacher') {
      this.dateClick.emit(info.date);
    }
  }

  handleEventDrop(arg: EventDropArg): void {
    this.eventDrop.emit(arg);
  }

  handleEventResize(arg: EventResizeDoneArg): void {
    this.eventResize.emit(arg);
  }

  handleDateSelect(arg: DateSelectArg): void {
    if (this.userRole === 'teacher') {
      this.select.emit(arg);
    }
  }
}
