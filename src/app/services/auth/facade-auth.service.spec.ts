import { TestBed } from '@angular/core/testing';

import { FacadeAuthService } from './facade-auth.service';

describe('FacadeAuthService', () => {
  let service: FacadeAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FacadeAuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
