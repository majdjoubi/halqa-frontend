// src/app/shared/enums/session-status.enum.ts

/**
 * Status enum for group sessions
 */
export enum GroupSessionStatus {
  Open = 1,
  Full = 2,
  InProgress = 3,
  Completed = 4,
}

/**
 * Status enum for individual booking sessions
 */
export enum IndividualSessionStatus {
  Confirmed = 2,
  InProgress = 3,
  Completed = 4,
  StudentNoShow = 8,
}

/**
 * Unified booking status for UI display
 */
export type BookingStatusLabel = 
  | 'confirmed'
  | 'open'
  | 'full'
  | 'in-progress'
  | 'completed'
  | 'scheduled'
  | 'no-show';

/**
 * Lesson type enum
 */
export enum LessonType {
  Individual = 'individual',
  Group = 'group',
}

/**
 * Duration options for lessons (in minutes)
 */
export const LESSON_DURATION_OPTIONS = [
  { value: 30, labelKey: 'lesson.duration.30min' },
  { value: 60, labelKey: 'lesson.duration.1hour' },
  { value: 90, labelKey: 'lesson.duration.90min' },
  { value: 120, labelKey: 'lesson.duration.2hours' },
];

/**
 * Helper to map GroupSessionStatus to display label
 */
export function getGroupStatusLabel(status: GroupSessionStatus): BookingStatusLabel {
  switch (status) {
    case GroupSessionStatus.Open:
      return 'open';
    case GroupSessionStatus.Full:
      return 'full';
    case GroupSessionStatus.InProgress:
      return 'in-progress';
    case GroupSessionStatus.Completed:
      return 'completed';
    default:
      return 'scheduled';
  }
}

/**
 * Helper to map IndividualSessionStatus to display label
 */
export function getIndividualStatusLabel(status: IndividualSessionStatus): BookingStatusLabel {
  switch (status) {
    case IndividualSessionStatus.Confirmed:
      return 'confirmed';
    case IndividualSessionStatus.InProgress:
      return 'in-progress';
    case IndividualSessionStatus.Completed:
      return 'completed';
    case IndividualSessionStatus.StudentNoShow:
      return 'no-show';
    default:
      return 'scheduled';
  }
}
