import { TestBed } from '@angular/core/testing';

import { CreateTeacherProfileService } from './create-teacher-profile.service';

describe('CreateTeacherProfileService', () => {
  let service: CreateTeacherProfileService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CreateTeacherProfileService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
