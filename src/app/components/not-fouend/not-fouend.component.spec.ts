import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotFouendComponent } from './not-fouend.component';

describe('NotFouendComponent', () => {
  let component: NotFouendComponent;
  let fixture: ComponentFixture<NotFouendComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFouendComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(NotFouendComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
