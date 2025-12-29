import { Injectable } from '@angular/core';
import { GetAllTeachersService } from './get-all-teachers.service';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, EMPTY, finalize, tap } from 'rxjs';
import { TeacherResponse } from '../../shared/modals/auth-modals';

@Injectable({
  providedIn: 'root',
})
export class LessonsHandelingFacadeService {
  constructor(
    private _getAllTeachersService: GetAllTeachersService,
    private _router: Router
  ) {}

  // store and state get all teachers
  private _loadingAllTeachers = new BehaviorSubject<boolean>(false);
  loadingAllTeachers$ = this._loadingAllTeachers.asObservable();

  private _allTeachersError = new BehaviorSubject<TeacherResponse | null>(null);
  allTeachersError$ = this._allTeachersError.asObservable();

  private _allTeachersData = new BehaviorSubject<TeacherResponse[] | null>(
    null
  );
  allTeachersData$ = this._allTeachersData.asObservable();

  // method to get all teachers
  getAllTeachers() {
    this._loadingAllTeachers.next(true);

    this._getAllTeachersService
      .getAllTeachers()
      .pipe(
        tap((res: any) => {
          this._loadingAllTeachers.next(false);
          // Normalize response to an array: if service returns a single TeacherResponse wrap it,
          // if it already returns an array (unlikely here) Array.isArray will keep it as-is.
          this._allTeachersData.next(res);
        }),
        catchError((err) => {
          this._loadingAllTeachers.next(false);
          this._allTeachersError.next(err);
          return EMPTY;
        }),
        finalize(() => {
          this._loadingAllTeachers.next(false);
        })
      )
      .subscribe();
  }
}
