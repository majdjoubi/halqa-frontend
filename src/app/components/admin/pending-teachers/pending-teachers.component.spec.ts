import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingTeachersComponent } from './pending-teachers.component';

describe('PendingTeachersComponent', () => {
  let component: PendingTeachersComponent;
  let fixture: ComponentFixture<PendingTeachersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingTeachersComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PendingTeachersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
