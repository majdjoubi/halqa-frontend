import { Injectable } from '@angular/core';
import { RepoService } from '../../Repositories/repo.service';

@Injectable({
  providedIn: 'root',
})
export class GetTeacherByIDService {
  constructor(private _repo: RepoService) {}

  // method to get teacher by id
  getTeacherById(teacherId: string) {
    return this._repo.getTeacherById(teacherId);
  }
}
