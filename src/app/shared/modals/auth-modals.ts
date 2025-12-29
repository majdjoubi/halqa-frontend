// login request interface
export interface LoginRequest {
  email: string;
  password: string;
}

// login response interface
// models/auth.ts

export interface LoginResponse {
  token: string;
  expiresAt: string; // ISO date string

  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: number;
    profilePictureUrl: string;
    phoneNumber: string;
    createdAt: string; // ISO date string
    isActive: boolean;

    student: {
      id: string;
      age: number | null;
      level: number;
      goals: string | null;
      walletBalance: number;
    } | null;

    teacher: unknown | null;
  };
}

// student registration request interface
export interface StudentRegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: number;
  phoneNumber: string;
  profilePictureUrl: string | null;
}
// student registration response interface
export interface StudentRegisterResponse {
  message?: string;
  user: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: number;
    profilePictureUrl?: string | null;
    phoneNumber?: string;
    createdAt?: string;
    isActive?: boolean;
    student?: {
      id?: string;
      age?: number | null;
      level?: number;
      goals?: string | null;
      walletBalance?: number;
    };
    teacher?: any | null;
  };
}

// teacher registration request interface
export interface UserProfileResponse {
  profile: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePictureUrl: string;
    phoneNumber: string;
    age: number | null;
    level: number;
    goals: string | null;
    walletBalance: number;
    createdAt: string;
    updatedAt: string;
  };
  stats: {
    totalBookings: number;
    completedLessons: number;
    upcomingLessons: number;
    favoriteTeachers: number;
    reviewsWritten: number;
    totalSpent: number;
    walletBalance: number;
  };
  recentBookings: any[]; // Array فاضي حالياً لحد ما تعرف شكله
  upcomingLessons: any[]; // Array
  favoriteTeachers: any[]; // Array
}

// update student profile request interface
export interface UpdateStudentProfileRequest {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePictureUrl: string | null;
}

export interface UpdateStudentProfileResponse {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePictureUrl: string;
  age: number;
  level: number;
  goals: string;
}

// create or update teacher profile request and response can be defined similarly
// models/teacher.ts

export interface AvailabilityItem {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface CreateTeacherProfile {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePictureUrl: string;
  specializations: string[];
  yearsOfExperience: number;
  hourlyRate: number;
  bio: string;
  acceptsDonations: boolean;
  availability: Availability[];
  languages?: string[]; // Optional for edit profile
}

export interface Availability {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ... (زي ما انت ماشي)
  startTime: string; // "HH:mm:ss"
  endTime: string; // "HH:mm:ss"
  isAvailable: boolean;
}

//  get teacher profile response interface
export interface GetProfileResponse {
  profile: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePictureUrl: string | null;
    phoneNumber: string;
    specializations: string[];
    yearsOfExperience: number;
    hourlyRate: number;
    bio: string | null;
    averageRating: number;
    totalStudents: number;
    totalLessons: number;
    monthlyEarnings: number;
    status: number;
    acceptsDonations: boolean;
    walletBalance: number;
    createdAt: string; // ISO date
    updatedAt: string; // ISO date
    certifications: string[];
    languages: string[];
    availability: string[];
  };
  stats: {
    totalStudents: number;
    totalLessons: number;
    completedLessons: number;
    pendingBookings: number;
    averageRating: number;
    monthlyEarnings: number;
    totalEarnings: number;
    totalReviews: number;
  };
  recentBookings: any[];
  upcomingLessons: any[];
}

// language interface
export interface LanguageProficiency {
  language: string;
  proficiencyLevel?: string;
}

// get all teachers response interface
export interface TeacherResponse {
  teachers: Teacher[];
}

export interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string;
  specializations: string[];
  yearsOfExperience: number;
  hourlyRate: number;
  averageRating: number;
  totalStudents: number;
  availability: Availability[];
}
