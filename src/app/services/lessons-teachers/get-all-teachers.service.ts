import { Injectable } from '@angular/core';
import { RepoService } from '../../Repositories/repo.service';

@Injectable({
  providedIn: 'root',
})
export class GetAllTeachersService {
  constructor(private _repo: RepoService) {}

  // method to get all teachers
  getAllTeachers(page?: number, limit?: number) {
    // forward values if provided; RepoService has defaults so callers may omit them
    return this._repo.getAllTeachers(page ?? undefined, limit ?? undefined);
  }
}
