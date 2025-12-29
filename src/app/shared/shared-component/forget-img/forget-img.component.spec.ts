import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ForgetImgComponent } from './forget-img.component';

describe('ForgetImgComponent', () => {
  let component: ForgetImgComponent;
  let fixture: ComponentFixture<ForgetImgComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgetImgComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ForgetImgComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
