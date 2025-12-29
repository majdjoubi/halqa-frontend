import { Injectable } from '@angular/core';
import { RepoService } from '../../../Repositories/repo.service';

@Injectable({
  providedIn: 'root',
})
export class StudentDashboardService {
  constructor(private _repo: RepoService) {}

  // get student profile (Dashboard)
  studentProfile() {
    return this._repo.studentProfile();
  }
}
