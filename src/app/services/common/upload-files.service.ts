import { Injectable } from '@angular/core';
import { RepoService } from '../../Repositories/repo.service';

@Injectable({
  providedIn: 'root',
})
export class UploadFilesService {
  constructor(private repo: RepoService) {}

  // method to upload file
  uploadFile(file: File, category: string = 'images') {
    return this.repo.uploadFile(file, category);
  }
}
