import { TestBed } from '@angular/core/testing';

import { FacadeProfilesService } from './facade-profiles.service';

describe('FacadeProfilesService', () => {
  let service: FacadeProfilesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FacadeProfilesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
