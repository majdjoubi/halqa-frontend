import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeacherCreateProfileComponent } from './teacher-create-profile.component';

describe('TeacherCreateProfileComponent', () => {
  let component: TeacherCreateProfileComponent;
  let fixture: ComponentFixture<TeacherCreateProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeacherCreateProfileComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TeacherCreateProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
