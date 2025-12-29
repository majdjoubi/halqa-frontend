import { TestBed } from '@angular/core/testing';

import { UpdateStudentProfileService } from './update-student-profile.service';

describe('UpdateStudentProfileService', () => {
  let service: UpdateStudentProfileService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UpdateStudentProfileService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
