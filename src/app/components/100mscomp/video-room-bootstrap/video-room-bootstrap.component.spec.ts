import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoRoomBootstrapComponent } from './video-room-bootstrap.component';

describe('VideoRoomBootstrapComponent', () => {
  let component: VideoRoomBootstrapComponent;
  let fixture: ComponentFixture<VideoRoomBootstrapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoRoomBootstrapComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(VideoRoomBootstrapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
