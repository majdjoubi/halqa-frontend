// Scheduling System Interfaces - New unified booking system

// ============ Enums ============
export enum BookingStatus {
  Confirmed = 2,
  Completed = 4,
  InProgress = 5,
  StudentNoShow = 8
}

export enum BookingType {
  Individual = 1,
  Group = 2
}

export enum PaymentStatus {
  Held = 1,
  ReleasedToTeacher = 2
}

// ============ Request DTOs ============

export interface BookIndividualSessionRequest {
  teacherId: string;
  scheduledDateTime: string; // ISO date string
  duration: number; // 30 or 60
  notes?: string;
}

export interface BookGroupSessionRequest {
  groupSessionId: number;
  notes?: string;
}

export interface CreateGroupSessionRequest {
  title: string;
  description?: string;
  scheduledDateTime: string; // ISO date string
  duration: number; // 30 or 60
  price: number;
  maxStudents: number;
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  slotDuration: number; // 30 or 60
  isRecurring: boolean;
  date?: string;
}

export interface UpdateSchedulingAvailabilityRequest {
  slots: AvailabilitySlot[];
}

export interface UpdateRatesRequest {
  hourlyRate: number;
  halfHourRate: number;
}

// ============ Response DTOs ============

export interface BookingStudent {
  id: string;
  fullName: string;
  profilePictureUrl?: string;
}

export interface BookingTeacher {
  id: string;
  fullName: string;
  profilePictureUrl?: string;
  hourlyRate: number;
  halfHourRate: number;
}

export interface BookingGroupSession {
  id: number;
  title: string;
  description?: string;
  currentEnrollment: number;
  maxStudents: number;
}

export interface BookingResponse {
  id: number;
  scheduledDateTime: string;
  status: BookingStatus;
  statusDisplay: string;
  bookingType: BookingType;
  bookingTypeDisplay: string;
  duration: number;
  amountPaid: number;
  teacherEarning: number;
  platformFee: number;
  paymentStatus: PaymentStatus;
  paymentStatusDisplay: string;
  meetingRoomId?: string;
  meetingRoomUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  student?: BookingStudent;
  teacher?: BookingTeacher;
  groupSession?: BookingGroupSession;
}

export interface StudentBookingsResponse {
  upcomingBookings: BookingResponse[];
  pastBookings: BookingResponse[];
  totalUpcoming: number;
  totalPast: number;
}

export interface CalendarEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  type: string; // "individual" or "group"
  status: string;
  studentName?: string;
  currentEnrollment?: number;
  maxStudents?: number;
  meetingRoomUrl?: string;
  color: string;
}

export interface TeacherCalendarResponse {
  events: CalendarEvent[];
  availability: AvailabilitySlot[];
}

export interface AvailableSlot {
  startDateTime: string;
  endDateTime: string;
  slotTime: string; // alias for startDateTime
  duration: number;
  price: number;
  isAvailable: boolean;
}

export interface AvailableGroupSession {
  id: number;
  title: string;
  description?: string;
  scheduledDateTime: string;
  duration: number;
  price: number;
  pricePerStudent: number; // alias for price
  currentEnrollment: number;
  currentParticipants: number; // alias for currentEnrollment
  maxStudents: number;
  maxParticipants: number; // alias for maxStudents
  availableSpots: number;
  isFull: boolean;
  teacherName?: string;
  teacherId?: string;
}

export interface AvailableTeacher {
  teacherId: string;
  fullName: string;
  teacherName: string; // alias for fullName
  profilePictureUrl?: string;
  bio?: string;
  hourlyRate: number;
  halfHourRate: number;
  averageRating: number;
  rating: number; // alias for averageRating
  totalReviews: number;
  specializations: string[];
  availableSlots: AvailableSlot[];
  availableSlotsCount: number;
  upcomingGroupSessions: AvailableGroupSession[];
}

// Type aliases for component compatibility
export type AvailableTeacherDto = AvailableTeacher;
export type AvailableSlotDto = AvailableSlot & { slotTime: string };
export type GroupSessionDto = AvailableGroupSession & {
  teacherName: string;
  currentParticipants: number;
  maxParticipants: number;
  pricePerStudent: number;
};
export type BookingDto = BookingResponse & {
  type: string;
  lessonTitle: string;
  teacherName: string;
  amount: number;
};

export interface EarningTransaction {
  bookingId: number;
  sessionDate: string;
  studentName: string;
  sessionType: string;
  amount: number;
  status: PaymentStatus;
  transactionDate: string;
}

export interface TeacherEarnings {
  walletBalance: number;
  pendingEarnings: number;
  monthlyEarnings: number;
  totalEarnings: number;
  recentTransactions: EarningTransaction[];
}

export interface SuccessResponse {
  success: boolean;
  message: string;
}

export interface MeetingTokenResponse {
  token: string;
}
