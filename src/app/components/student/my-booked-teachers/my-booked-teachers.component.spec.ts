import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyBookedTeachersComponent } from './my-booked-teachers.component';

describe('MyBookedTeachersComponent', () => {
  let component: MyBookedTeachersComponent;
  let fixture: ComponentFixture<MyBookedTeachersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyBookedTeachersComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MyBookedTeachersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
