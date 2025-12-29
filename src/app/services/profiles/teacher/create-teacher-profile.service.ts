import { Injectable } from '@angular/core';
import { RepoService } from '../../../Repositories/repo.service';
import {
  CreateTeacherProfile,
  LanguageProficiency,
} from '../../../shared/modals/auth-modals';

@Injectable({
  providedIn: 'root',
})
export class CreateTeacherProfileService {
  constructor(private _repo: RepoService) {}

  // edit or create teacher profile
  EditTeacherProfileService(data: CreateTeacherProfile) {
    return this._repo.EditOrUpdateTeacherProfile(data);
  }

  // get teacher profile
  getTeacherProfile() {
    return this._repo.getTeacherProfile();
  }

  // teacher language
  setTeacherLanguage(lang: LanguageProficiency) {
    return this._repo.setLanguage(lang);
  }
}
