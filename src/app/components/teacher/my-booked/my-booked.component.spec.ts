import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyBookedComponent } from './my-booked.component';

describe('MyBookedComponent', () => {
  let component: MyBookedComponent;
  let fixture: ComponentFixture<MyBookedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyBookedComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MyBookedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
