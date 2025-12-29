import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AllLessonsComponent } from './all-lessons.component';

describe('AllLessonsComponent', () => {
  let component: AllLessonsComponent;
  let fixture: ComponentFixture<AllLessonsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllLessonsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AllLessonsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
