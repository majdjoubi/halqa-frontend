import { Injectable } from '@angular/core';
import { RepoService } from '../../../Repositories/repo.service';
import { UpdateStudentProfileRequest } from '../../../shared/modals/auth-modals';

@Injectable({
  providedIn: 'root',
})
export class UpdateStudentProfileService {
  constructor(private _repo: RepoService) {}

  updateStudentProfile(data: UpdateStudentProfileRequest) {
    return this._repo.updateStudentProfile(data);
  }
}
