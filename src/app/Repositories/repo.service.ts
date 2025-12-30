import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  GetProfileResponse,
  LanguageProficiency,
  LoginRequest,
  LoginResponse,
  StudentRegisterRequest,
  StudentRegisterResponse,
  TeacherResponse,
  UpdateStudentProfileRequest,
  UpdateStudentProfileResponse,
  UserProfileResponse,
} from '../shared/modals/auth-modals';
import { Observable } from 'rxjs';
import { environment } from '../environment/environment';

@Injectable({
  providedIn: 'root',
})
export class RepoService {
  private base_url = (environment.apiUrl || '').replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  login(data: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.base_url}/api/auth/login`,
      data
    );
  }

  // student registration
  studentRegister(
    data: StudentRegisterRequest
  ): Observable<StudentRegisterResponse> {
    return this.http.post<StudentRegisterResponse>(
      `${this.base_url}/api/auth/register`,
      data
    );
  }

  // teacher registration
  teacherRegister(
    data: StudentRegisterRequest
  ): Observable<StudentRegisterResponse> {
    return this.http.post<StudentRegisterResponse>(
      `${this.base_url}/api/auth/register`,
      data
    );
  }

  // get student profile (Dashboard)
  studentProfile(): Observable<any> {
    return this.http.get<any>(`${this.base_url}/api/student/dashboard`);
  }

  // update student profile
  updateStudentProfile(
    data: UpdateStudentProfileRequest
  ): Observable<UpdateStudentProfileResponse> {
    return this.http.put<any>(`${this.base_url}/api/student/profile`, data);
  }

  // Edit or update teacher profile
  EditOrUpdateTeacherProfile(data: any): Observable<any> {
    return this.http.put<any>(`${this.base_url}/api/teacher/profile`, data);
  }

  //edit teacher certification
  editTeacherCertification(
    certificationId: string,
    data: any
  ): Observable<any> {
    return this.http.put<any>(
      `${this.base_url}/api/teacher/certifications/${certificationId}`,
      data
    );
  }

  // get teacher profile
  getTeacherProfile(): Observable<GetProfileResponse> {
    return this.http.get<GetProfileResponse>(
      `${this.base_url}/api/teacher/dashboard`
    );
  }

  // the language service
  setLanguage(lang: any): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/teacher/languages/bulk`,
      lang
    );
  }

  // get teacher languages
  getTeacherLanguages(): Observable<LanguageProficiency[]> {
    return this.http.get<LanguageProficiency[]>(
      `${this.base_url}/api/teacher/languages`
    );
  }

  // get all teachers
  // Make page/limit optional with sensible defaults so callers can invoke without arguments
  getAllTeachers(page: number = 1, limit: number = 10): Observable<any> {
    return this.http.get<any>(`${this.base_url}/api/public/teachers`, {
      params: new HttpParams()
        .set('page', String(page))
        .set('limit', String(limit)),
    });
  }

  // search teachers with filters
  searchTeachers(options: {
    search?: string;
    specialization?: string;
    language?: string | number;
    minRating?: number | string;
    maxHourlyRate?: number | string;
    minExperience?: number | string;
    isAvailable?: boolean | string;
    page?: number;
    pageSize?: number;
  }): Observable<any> {
    let params = new HttpParams();
    if (options.search) params = params.set('search', String(options.search));
    if (options.specialization)
      params = params.set('specialization', String(options.specialization));
    if (options.language)
      params = params.set('language', String(options.language));
    if (options.minRating)
      params = params.set('minRating', String(options.minRating));
    if (options.maxHourlyRate)
      params = params.set('maxHourlyRate', String(options.maxHourlyRate));
    if (options.minExperience)
      params = params.set('minExperience', String(options.minExperience));
    if (typeof options.isAvailable !== 'undefined')
      params = params.set('isAvailable', String(options.isAvailable));
    if (options.page) params = params.set('page', String(options.page));
    if (options.pageSize)
      params = params.set('pageSize', String(options.pageSize));

    return this.http.get<any>(`${this.base_url}/api/public/teachers/search`, {
      params,
    });
  }

  // upload files
  uploadFile(file: File, category: string = 'images'): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    // Backend expects a 'category' field (e.g., 'documents', 'images', 'certificates')
    formData.append('category', category);
    return this.http.post<any>(`${this.base_url}/api/files/upload`, formData);
  }

  // get teacher by id for student to view teacher profile
  getTeacherById(teacherId: string): Observable<TeacherResponse> {
    return this.http.get<TeacherResponse>(
      `${this.base_url}/api/public/teachers/${teacherId}`
    );
  }

  // get all specializations for dropdown
  getAllSpecializations(): Observable<string[]> {
    return this.http.get<string[]>(
      `${this.base_url}/api/Public/specializations`
    );
  }

  // Admin APIs

  // get all pending teachers for admin
  getAllPendingTeachers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/admin/teachers`);
  }

  // approve pending teacher
  approveTeacher(teacherId: string, stat: number): Observable<any> {
    return this.http.patch<any>(
      `${this.base_url}/api/admin/teachers/${teacherId}/status`,
      {
        status: stat,
      }
    );
  }

  // active and deactivate user (student or teacher) by admin
  toggleUserStatus(userId: string, isAct: boolean): Observable<any> {
    return this.http.patch<any>(
      `${this.base_url}/api/admin/users/${userId}/active`,
      {
        isActive: isAct,
      }
    );
  }

  // get all users (students and teachers) for admin
  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/admin/users`);
  }

  // get all analytics data for admin dashboard
  getAdminAnalytics(): Observable<any> {
    return this.http.get<any>(
      `${this.base_url}/api/admin/statistics/dashboard`
    );
  }
  // get quick status counts for admin dashboard
  getAdminStatusCounts(): Observable<any> {
    return this.http.get<any>(`${this.base_url}/api/admin/statistics/quick`);
  }

  // teacher create profile
  createTeacherProfile(data: any): Observable<any> {
    return this.http.put<any>(`${this.base_url}/api/teacher/profile`, data);
  }

  // create teacher certifications
  createTeacherCertifications(data: any): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/teacher/certifications`,
      data
    );
  }
  // get recent lessons (public endpoint) - supports limit and page when available
  // Use the public 'recent' endpoint which is intended for unauthenticated access.
  getAllLessons(page: number = 1, limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/lesson/recent`, {
      params: new HttpParams()
        .set('page', String(page))
        .set('limit', String(limit)),
    });
  }

  // fallback that tries the non-recent endpoint (in case API uses different paths)
  fallbackGetAllLessons(page: number, limit: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/lesson`, {
      params: new HttpParams()
        .set('page', String(page))
        .set('limit', String(limit)),
    });
  }

  // get lesson by id for student to view lesson details
  getLessonById(lessonId: string): Observable<any> {
    return this.http.get<any>(`${this.base_url}/api/lesson/public/${lessonId}`);
  }

  // lesson search with filters
  searchLessons(options: {
    search?: string;
    type?: string; // e.g. 'Group', 'Private'
    minPrice?: number | string;
    maxPrice?: number | string;
    minDuration?: number | string;
    maxDuration?: number | string;
    teacherSpecialization?: string;
    teacherLanguage?: string;
    minTeacherRating?: number | string;
    minTeacherExperience?: number | string;
    isAvailable?: boolean | string;
    activeOnly?: boolean | string;
    page?: number;
    pageSize?: number;
    sortBy?: string; // e.g. 'Price', 'Duration', 'Rating'
    sortDirection?: string; // e.g. 'Ascending', 'Descending'
  }): Observable<any> {
    let params = new HttpParams();

    if (options.search) params = params.set('search', String(options.search));
    if (options.type) params = params.set('type', String(options.type));
    if (options.minPrice)
      params = params.set('minPrice', String(options.minPrice));
    if (options.maxPrice)
      params = params.set('maxPrice', String(options.maxPrice));
    if (options.minDuration)
      params = params.set('minDuration', String(options.minDuration));
    if (options.maxDuration)
      params = params.set('maxDuration', String(options.maxDuration));
    if (options.teacherSpecialization)
      params = params.set(
        'teacherSpecialization',
        String(options.teacherSpecialization)
      );
    if (options.teacherLanguage)
      params = params.set('teacherLanguage', String(options.teacherLanguage));
    if (options.minTeacherRating)
      params = params.set('minTeacherRating', String(options.minTeacherRating));
    if (options.minTeacherExperience)
      params = params.set(
        'minTeacherExperience',
        String(options.minTeacherExperience)
      );
    if (typeof options.isAvailable !== 'undefined')
      params = params.set('isAvailable', String(options.isAvailable));
    if (typeof options.activeOnly !== 'undefined')
      params = params.set('activeOnly', String(options.activeOnly));
    if (options.page) params = params.set('page', String(options.page));
    if (options.pageSize)
      params = params.set('pageSize', String(options.pageSize));
    if (options.sortBy) params = params.set('sortBy', String(options.sortBy));
    if (options.sortDirection)
      params = params.set('sortDirection', String(options.sortDirection));

    return this.http.get<any>(`${this.base_url}/api/lesson/search`, { params });
  }

  // get all lessons for a specific teacher
  getLessonsByTeacher(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/lesson`);
  }
  // get a lesson by id (teacher)
  getTeacherLessonById(lessonId: string): Observable<any> {
    return this.http.get<any>(`${this.base_url}/api/lesson/${lessonId}`);
  }

  // create a new lesson (teacher)
  createLesson(data: any): Observable<any> {
    return this.http.post<any>(`${this.base_url}/api/lesson`, data);
  }
  // delete a lesson (teacher)
  deleteLesson(lessonId: string): Observable<any> {
    return this.http.delete<any>(`${this.base_url}/api/lesson/${lessonId}`);
  }
  // update a lesson (teacher)
  updateLesson(lessonId: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.base_url}/api/lesson/${lessonId}`, data);
  }

  // Booking APIs for teacher MY-Booked component
  getTeacherBookings(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/booking/teacher`);
  }

  // Booking APIs for student MY-Bookings component
  CreateIndividualBooking(data: any): Observable<any> {
    return this.http.post<any>(`${this.base_url}/api/booking/individual`, data);
  }

  // Create Group session
  CreateGroupSession(data: any): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/GroupSession/teacher/schedule`,
      data
    );
  }

  // get all Group sessions for a student
  // get all Group sessions for a student
  // Accepts optional pagination parameters. If not provided, calls endpoint without params.
  getGroupSessionsByStudent(page?: number, limit?: number): Observable<any[]> {
    let params = new HttpParams();
    if (typeof page !== 'undefined') params = params.set('page', String(page));
    if (typeof limit !== 'undefined')
      params = params.set('limit', String(limit));
    const url = `${this.base_url}/api/groupsession/available`;
    return this.http.get<any[]>(url, {
      params: params.keys().length ? params : undefined,
    });
  }

  // get group session by id for student to view details
  getGroupSessionById(sessionId: string): Observable<any> {
    return this.http.get<any>(`${this.base_url}/api/GroupSession/${sessionId}`);
  }

  // delete/cancel group session
  deleteGroupSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.base_url}/api/GroupSession/teacher/${sessionId}/cancel`, {});
  }

  // book group session for student
  bookGroupSession(data: any): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/Booking/group-session`,
      data
    );
  }

  // get all group sessions for a specific teacher
  getGroupSessionsByTeacher(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.base_url}/api/groupsession/teacher/my-sessions`
    );
  }

  // get all individual bookings for a teacher
  getIndividualBookingsByTeacher(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/booking/teacher`);
  }
  // get the individual session url for teacher

  getSessionUrl(bookingId: string): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/booking/teacher/${bookingId}/start-session`,
      { bookingId }
    );
  }

  // get all individual bookings for a student
  getIndividualBookingsByStudent(teacherId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.base_url}/api/booking/public/availability/${teacherId}/hourly`
    );
  }
  // book individual session
  bookIndividualSession(data: any): Observable<any> {
    return this.http.post<any>(`${this.base_url}/api/booking/individual`, data);
  }

  // student apis
  // get all booked teachers for a student (groupe sessions)
  getBookedTeachersByStudent(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.base_url}/api/student/bookings/group-sessions`
    );
  }
  // get the group session url for student
  getGroupSessionUrl(bookingId: string): Observable<any> {
    return this.http.get<any>(
      `${this.base_url}/api/groupsession/student/booking/${bookingId}/meeting-url`
    );
  }
  // get the individual session url for student
  getIndividualSessionUrl(bookingId: string): Observable<any> {
    return this.http.get<any>(
      `${this.base_url}/api/booking/student/${bookingId}/meeting-url`
    );
  }

  // get all booked individual sessions for student
  getAllIndividualSession(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/booking/student`);
  }

  // get all individual bookings for a student
  getStudentBookings(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.base_url}/api/student/bookings/individual`
    );
  }

  // make withdraw request for teacher
  makeWithdrawRequest(data: any): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/teacherwithdrawal/request`,
      data
    );
  }

  // get all withdrawal requests for a teacher
  getTeacherWithdrawalRequests(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.base_url}/api/teacherwithdrawal/my-withdrawals`
    );
  }

  // Admin - get all withdrawal requests
  getAllWithdrawalRequests(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base_url}/api/teacherwithdrawal/all`);
  }

  // Admin - approve withdrawal request
  approveWithdrawalRequest(
    requestId: number,
    adminNotes?: string
  ): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/teacherwithdrawal/${requestId}/approve`,
      {
        approve: true,
        adminNotes: adminNotes || 'Approved for payment',
      }
    );
  }

  // Admin - reject withdrawal request
  rejectWithdrawalRequest(
    requestId: number,
    adminNotes?: string
  ): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/teacherwithdrawal/${requestId}/reject`,
      {
        approve: false,
        adminNotes: adminNotes || 'Rejected',
      }
    );
  }

  // Admin - get user (teacher) by id
  getUserById(userId: string): Observable<UserProfileResponse> {
    return this.http.get<UserProfileResponse>(
      `${this.base_url}/api/admin/teachers/${userId}/details`
    );
  }

  // Teacher - cancel withdrawal request
  cancelWithdrawalRequest(requestId: number): Observable<any> {
    return this.http.delete<any>(
      `${this.base_url}/api/teacherwithdrawal/${requestId}/cancel`
    );
  }

  // review teacher by student
  reviewTeacher(data: any): Observable<any> {
    return this.http.post<any>(`${this.base_url}/api/review/student`, data);
  }

  // Admin - delete user
  deleteUser(userId: string): Observable<any> {
    return this.http.delete<any>(`${this.base_url}/api/admin/users/${userId}`);
  }

  // ============ REFUND APIs ============
  
  // Teacher cancels individual booking - process full refund to student wallet
  cancelIndividualBookingByTeacher(bookingId: string | number): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/booking/teacher/${bookingId}/cancel`,
      {}
    );
  }

  // Process refund for a booking (fallback if cancel doesn't auto-refund)
  processRefund(bookingId: string | number, amount?: number): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/booking/${bookingId}/refund`,
      { amount }
    );
  }

  // Credit student wallet directly (admin/teacher action)
  creditStudentWallet(studentId: string, amount: number, reason: string): Observable<any> {
    return this.http.post<any>(
      `${this.base_url}/api/payment/wallet/credit`,
      { studentId, amount, reason }
    );
  }
}
