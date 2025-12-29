import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VideoService } from '../../../services/100ms/video.service';
import { HMSPeer } from '@100mslive/hms-video-store';

@Component({
  selector: 'app-video-room-bootstrap',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-room-bootstrap.component.html',
  styleUrls: ['./video-room-bootstrap.component.scss'],
})
export class VideoRoomBootstrapComponent implements OnInit, OnDestroy {
  peers: HMSPeer[] = [];
  remotePeers: HMSPeer[] = [];

  // form fields
  userName = '';
  role: 'student' | 'broadcaster' = 'student';
  token = ''; // هنا تلصق التوكين يدوياً للتجربة

  // controls state
  isAudioEnabled = true;
  isVideoEnabled = true;
  joined = false;

  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChildren('remoteVideo') remoteVideoElements!: QueryList<
    ElementRef<HTMLVideoElement>
  >;

  constructor(private videoService: VideoService) {}

  ngOnInit(): void {
    // ما ننضمش تلقائياً — ننتظر المستخدم يضغط Join (عشان نجرب التوكن اليدوي)
  }

  async join() {
    if (!this.token || !this.userName) {
      alert('من فضلك أدخل اسمك والتوكن أولاً');
      return;
    }

    try {
      await this.videoService.joinMeeting(this.token, this.userName, this.role);
      this.joined = true;

      // اشترك في الـ peers - هيتنادى كل ما في تحديث
      this.videoService.subscribeToPeers((peers: HMSPeer[]) => {
        console.log('📹 Peers updated:', peers.length, peers);

        this.peers = peers;
        // نفرز اللي مش local علشان نرسمهم كـ remote
        this.remotePeers = peers.filter((p) => !p.isLocal);

        // نربط الفيديوهات بعد تحديث العرض
        setTimeout(() => {
          this.attachAllVideos(peers);
        }, 200);
      });

      // اشترك في تحديثات الـ tracks (مهم جداً!)
      this.videoService.subscribeToTracks(() => {
        console.log('🎬 Tracks updated, re-attaching videos...');
        setTimeout(() => {
          this.attachAllVideos(this.peers);
        }, 100);
      });
    } catch (err) {
      console.error('join error', err);
      alert('فشل الانضمام: ' + (err as any)?.message || err);
    }
  }

  // دالة منفصلة لربط كل الفيديوهات
  private async attachAllVideos(peers: HMSPeer[]) {
    console.log('🔄 Attaching all videos. Total peers:', peers.length);

    // 1. Local video - عرض الكاميرا الخاصة بك
    const localPeer = peers.find((p) => p.isLocal);
    if (localPeer && this.localVideo?.nativeElement) {
      console.log('🎥 Local peer found:', {
        name: localPeer.name,
        hasVideo: !!localPeer.videoTrack,
        hasAudio: !!localPeer.audioTrack,
        videoId: (localPeer.videoTrack as any)?.id,
        videoEnabled: this.isVideoEnabled,
      });

      if (localPeer.videoTrack) {
        console.log('📹 Attaching local video track...');
        await this.attachVideoTrack(
          localPeer.videoTrack,
          this.localVideo.nativeElement
        );
      } else {
        console.warn('⚠️ Local peer has no video track');
      }
    } else {
      console.warn('⚠️ No local peer or video element found');
    }

    // 2. Remote videos - عرض المشاركين الآخرين
    const remoteEls = this.remoteVideoElements.toArray();
    console.log(
      '👥 Remote peers:',
      this.remotePeers.length,
      'Video elements:',
      remoteEls.length
    );

    // نربط كل الفيديوهات بشكل متوازي
    const attachPromises = remoteEls.map(async (elRef, idx) => {
      const peer = this.remotePeers[idx];
      if (peer) {
        console.log(`🎬 Processing remote peer ${idx}:`, {
          name: peer.name,
          hasVideo: !!peer.videoTrack,
          hasAudio: !!peer.audioTrack,
          videoId: (peer.videoTrack as any)?.id,
        });

        const videoEl = elRef.nativeElement;

        // نربط الفيديو والصوت مع بعض
        if (peer.videoTrack || peer.audioTrack) {
          await this.attachMediaTracks(peer, videoEl);
        } else {
          console.warn(`⚠️ Peer ${peer.name} has no tracks`);
        }
      } else {
        console.warn(`⚠️ No peer data for index ${idx}`);
      }
    });

    // ننتظر كل الربط يخلص
    await Promise.all(attachPromises);
    console.log('✅ Finished attaching all videos');
  }

  // ربط الفيديو تراك (الطريقة الصحيحة 100%)
  private async attachVideoTrack(track: any, videoEl: HTMLVideoElement) {
    try {
      if (!track) {
        console.warn('⚠️ No video track to attach');
        return;
      }

      // ⚠️ مهم: الـ track ممكن يكون string (trackId) أو object
      const trackId = typeof track === 'string' ? track : track?.id || track;

      console.log('🎥 Attaching video track:', {
        trackValue: track,
        trackType: typeof track,
        extractedId: trackId,
        enabled: track?.enabled,
        type: track?.type,
      });

      // ✅ الطريقة الصحيحة: استخدام hmsActions.attachVideo مع track ID
      if (trackId) {
        const hmsActions = this.videoService.getActions();
        await hmsActions.attachVideo(trackId, videoEl);
        console.log('✅ Video attached successfully using hmsActions');
      } else {
        console.error('❌ Track has no valid ID', { track, trackId });
      }
    } catch (e) {
      console.error('❌ attachVideoTrack error', e);
    }
  }

  // ربط الفيديو والصوت مع بعض (الطريقة الصحيحة 100%)
  private async attachMediaTracks(peer: HMSPeer, videoEl: HTMLVideoElement) {
    try {
      const videoTrack = peer.videoTrack;
      const audioTrack = peer.audioTrack;

      // ⚠️ استخراج الـ track ID بشكل صحيح
      const videoTrackId =
        typeof videoTrack === 'string'
          ? videoTrack
          : (videoTrack as any)?.id || videoTrack;

      const audioTrackId =
        typeof audioTrack === 'string'
          ? audioTrack
          : (audioTrack as any)?.id || audioTrack;

      console.log('🎬 Attaching media for:', peer.name, {
        hasVideo: !!videoTrack,
        hasAudio: !!audioTrack,
        videoTrackValue: videoTrack,
        videoTrackType: typeof videoTrack,
        extractedVideoId: videoTrackId,
        audioTrackValue: audioTrack,
        audioTrackType: typeof audioTrack,
        extractedAudioId: audioTrackId,
      });

      const hmsActions = this.videoService.getActions();

      // ✅ الطريقة الصحيحة: استخدام hmsActions.attachVideo
      if (videoTrackId) {
        try {
          await hmsActions.attachVideo(videoTrackId, videoEl);
          console.log('✅ Video attached using hmsActions for:', peer.name);

          // إذا في صوت، نشغل الفيديو element علشان الصوت يشتغل
          if (audioTrackId) {
            videoEl.play().catch((err) => {
              console.log('▶️ Autoplay blocked for:', peer.name);
            });
          }
        } catch (error) {
          console.error('❌ Failed to attach video for:', peer.name, error);
        }
      } else {
        console.warn('⚠️ No video track ID for:', peer.name, {
          videoTrack,
          extractedId: videoTrackId,
        });
      }
    } catch (e) {
      console.error('❌ attachMediaTracks error for:', peer.name, e);
    }
  }

  async toggleAudio() {
    this.isAudioEnabled = !this.isAudioEnabled;
    await this.videoService.setLocalAudioEnabled(this.isAudioEnabled);
  }

  async toggleVideo() {
    this.isVideoEnabled = !this.isVideoEnabled;
    await this.videoService.setLocalVideoEnabled(this.isVideoEnabled);
  }

  async leave() {
    console.log('👋 Leaving meeting...');

    // تنظيف الفيديوهات قبل الخروج
    if (this.localVideo?.nativeElement) {
      this.localVideo.nativeElement.srcObject = null;
    }

    this.remoteVideoElements.forEach((elRef) => {
      if (elRef.nativeElement) {
        elRef.nativeElement.srcObject = null;
      }
    });

    await this.videoService.leaveMeeting();
    this.joined = false;

    // تفريغ العناصر
    this.peers = [];
    this.remotePeers = [];

    console.log('✅ Left meeting successfully');
  }

  ngOnDestroy(): void {
    // لو لسه داخل نخرج
    if (this.joined) {
      this.leave();
    }
  }
}
