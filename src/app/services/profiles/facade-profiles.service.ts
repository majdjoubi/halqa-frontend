import { Injectable } from '@angular/core';
import { StudentDashboardService } from './student/student-dashboard.service';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  tap,
} from 'rxjs';
import {
  CreateTeacherProfile,
  GetProfileResponse,
  LanguageProficiency,
  UpdateStudentProfileRequest,
} from '../../shared/modals/auth-modals';
import { UpdateStudentProfileService } from './student/update-student-profile.service';
import { CreateTeacherProfileService } from './teacher/create-teacher-profile.service';

@Injectable({
  providedIn: 'root',
})
export class FacadeProfilesService {
  constructor(
    private _studentDashboardService: StudentDashboardService,
    private _router: Router,
    private _updateStudentProfileService: UpdateStudentProfileService,
    private _createTeacherProfileService: CreateTeacherProfileService,
    private _getTeacherProfileService: CreateTeacherProfileService
  ) {}

  // state and store for user profile data
  private _loadingStudentProfile = new BehaviorSubject<boolean>(false);
  loadingStudentProfile$ = this._loadingStudentProfile.asObservable();

  private _studentProfileError = new BehaviorSubject<string | null>(null);
  studentProfileError$ = this._studentProfileError.asObservable();

  private _studentProfileData = new BehaviorSubject<any | null>(null);
  studentProfileData$ = this._studentProfileData.asObservable();

  // state and store for update student profile data
  private _loadingUpdateStudentProfile = new BehaviorSubject<boolean>(false);
  loadingUpdateStudentProfile$ =
    this._loadingUpdateStudentProfile.asObservable();

  private _updateStudentProfileError = new BehaviorSubject<string | null>(null);
  updateStudentProfileError$ = this._updateStudentProfileError.asObservable();

  private _updateStudentProfileData = new BehaviorSubject<any | null>(null);
  updateStudentProfileData$ = this._updateStudentProfileData.asObservable();

  // store and state management for teacher profile can be added here similarly

  private _loadingTeacherProfile = new BehaviorSubject<boolean>(false);
  loadingTeacherProfile$ = this._loadingTeacherProfile.asObservable();

  private _teacherProfileError = new BehaviorSubject<string | null>(null);
  teacherProfileError$ = this._teacherProfileError.asObservable();

  private _teacherProfileData = new BehaviorSubject<any | null>(null);
  teacherProfileData$ = this._teacherProfileData.asObservable();

  // state and store for teacher profile  Get data
  private _loadingGetTeacherProfile = new BehaviorSubject<boolean>(false);
  loadingGetTeacherProfile$ = this._loadingGetTeacherProfile.asObservable();

  private _getTeacherProfileError = new BehaviorSubject<string | null>(null);
  getTeacherProfileError$ = this._getTeacherProfileError.asObservable();

  private _getTeacherProfileData = new BehaviorSubject<any | null>(null);
  getTeacherProfileData$ = this._getTeacherProfileData.asObservable();

  // language state and store
  private _languageResponse = new BehaviorSubject<string | null>(null);
  languageResponse$ = this._languageResponse.asObservable();

  private _languageError = new BehaviorSubject<string | null>(null);
  languageError$ = this._languageError.asObservable();

  // method to fetch student profile data
  studentProgileRequst() {
    this._loadingStudentProfile.next(true);

    return this._studentDashboardService.studentProfile().pipe(
      tap((response) => {
        this._loadingStudentProfile.next(false);
        this._studentProfileData.next(response);
      }),
      // handle error
      catchError((error) => {
        this._loadingStudentProfile.next(false);
        this._studentProfileError.next(error.message || 'An error occurred');
        return EMPTY;
      }),
      finalize(() => {
        this._loadingStudentProfile.next(false);
      })
    );
  }

  // method to update student profile data
  updateStudentProfileRequst(data: UpdateStudentProfileRequest) {
    this._loadingUpdateStudentProfile.next(true);
    return this._updateStudentProfileService.updateStudentProfile(data).pipe(
      tap((response) => {
        this._loadingUpdateStudentProfile.next(false);
        this._updateStudentProfileData.next(response);

        // Update the main profile data with the new values
        const currentProfileData = this._studentProfileData.value;
        if (currentProfileData) {
          const updatedProfileData = {
            ...currentProfileData,
            profile: {
              ...currentProfileData.profile,
              firstName: data.firstName,
              lastName: data.lastName,
              phoneNumber: data.phoneNumber,
              profilePictureUrl:
                data.profilePictureUrl ||
                currentProfileData.profile?.profilePictureUrl,
            },
          };
          this._studentProfileData.next(updatedProfileData);
        }
      }),
      catchError((error) => {
        this._loadingUpdateStudentProfile.next(false);
        this._updateStudentProfileError.next(
          error.message || 'An error occurred'
        );
        return EMPTY;
      }),
      finalize(() => {
        this._loadingUpdateStudentProfile.next(false);
      })
    );
  }

  // method to teacher Edit profile state
  EditTeacherProfile(data: CreateTeacherProfile) {
    this._loadingTeacherProfile.next(true);
    return this._createTeacherProfileService
      .EditTeacherProfileService(data)
      .pipe(
        tap((response) => {
          this._loadingTeacherProfile.next(false);
          this._teacherProfileData.next(response);
        }),
        catchError((error) => {
          this._loadingTeacherProfile.next(false);
          this._teacherProfileError.next(error.message || 'An error occurred');
          return EMPTY;
        }),
        finalize(() => {
          this._loadingTeacherProfile.next(false);
        })
      );
  }

  // method to get teacher profile data
  getTeacherProfile(): Observable<GetProfileResponse> {
    this._loadingGetTeacherProfile.next(true);

    return this._getTeacherProfileService.getTeacherProfile().pipe(
      tap((response) => {
        this._loadingGetTeacherProfile.next(false);
        this._getTeacherProfileData.next(response);
      }),
      catchError((error) => {
        this._loadingGetTeacherProfile.next(false);
        this._getTeacherProfileError.next(error.message || 'An error occurred');
        return EMPTY;
      }),
      finalize(() => {
        this._loadingGetTeacherProfile.next(false);
      })
    );
  }

  // method for language
  setLanguageRequst(lang: any) {
    // clear previous error
    this._languageError.next(null);

    return this._getTeacherProfileService.setTeacherLanguage(lang).pipe(
      tap((response) => {
        this._languageResponse.next(response);
      }),
      catchError((error) => {
        this._languageError.next(error.message || 'An error occurred');
        return EMPTY;
      }),
      finalize(() => {
        // any finalization if needed
      })
    );
  }
}
