import { TestBed } from '@angular/core/testing';
import { ErrorHandlerService } from './error-handler.service';

describe('ErrorHandlerService', () => {
  let service: ErrorHandlerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ErrorHandlerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return correct error message for 401 status', () => {
    const error = { status: 401 };
    const message = service.getAuthErrorMessage(error);
    expect(message).toBe(
      'Invalid email or password. Please check your credentials.'
    );
  });

  it('should return correct error message for 409 status in registration', () => {
    const error = { status: 409 };
    const message = service.getRegistrationErrorMessage(error);
    expect(message).toBe('User already exists. Please use a different email.');
  });

  it('should return custom error message from response', () => {
    const error = {
      status: 400,
      error: { message: 'Custom error message' },
    };
    const message = service.getAuthErrorMessage(error);
    expect(message).toBe('Custom error message');
  });
});
