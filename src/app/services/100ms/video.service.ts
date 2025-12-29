// src/app/services/100ms/video.service.ts
import { Injectable } from '@angular/core';
import { HMSReactiveStore } from '@100mslive/hms-video-store';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private hmsManager = new HMSReactiveStore();
  private hmsStore = this.hmsManager.getStore();
  private hmsActions = this.hmsManager.getActions();

  constructor() {
    // لازم نعمل subscribe عشان ال store يبدأ يشتغل
    this.hmsManager.triggerOnSubscribe();
  }

  // join expects: { userName, authToken, ... } - نحن نمرر بس اللي محتاجينه
  async joinMeeting(token: string, userName: string, role?: string) {
    await this.hmsActions.join({
      userName,
      authToken: token,
      // لو عايز تبعت role أو roomId تقدر تضيفهم هنا حسب الحاجة
      // role, roomId ...
    });
  }

  async leaveMeeting() {
    try {
      await this.hmsActions.leave();
    } catch (e) {
      console.warn('leave error', e);
    }
  }

  // mute/unmute audio
  async setLocalAudioEnabled(enabled: boolean) {
    // uses SDK action
    await this.hmsActions.setLocalAudioEnabled(enabled);
  }

  // stop/start video
  async setLocalVideoEnabled(enabled: boolean) {
    await this.hmsActions.setLocalVideoEnabled(enabled);
  }

  // subscribe to peers list updates
  subscribeToPeers(callback: (peers: any[]) => void) {
    // the store keeps peers as a map keyed by id; convert it to an array for the callback
    this.hmsStore.subscribe(callback, (state) =>
      Object.values(state.peers || {})
    );
  }

  // subscribe to track updates (مهم جداً لعرض الفيديو!)
  subscribeToTracks(callback: () => void) {
    // نراقب أي تحديث في الـ tracks
    this.hmsStore.subscribe(callback, (state) => state.tracks);
  }

  // دالة مساعدة لربط الفيديو (الطريقة الصحيحة من 100ms SDK)
  async attachVideo(
    trackId: string,
    videoElement: HTMLVideoElement
  ): Promise<boolean> {
    try {
      if (!trackId || !videoElement) {
        console.warn('⚠️ No track ID or video element provided');
        return false;
      }

      console.log(
        '📹 Attaching video track:',
        trackId,
        'to element:',
        videoElement
      );

      // ✅ الطريقة الصحيحة: استخدام hmsActions.attachVideo
      await this.hmsActions.attachVideo(trackId, videoElement);
      console.log(
        '✅ Video attached successfully using hmsActions.attachVideo'
      );
      return true;
    } catch (error) {
      console.error('❌ Error attaching video:', error);
      return false;
    }
  }

  // دالة للحصول على الـ track object من الـ store
  getTrackById(trackId: string) {
    const state = this.hmsStore.getState();
    return state.tracks[trackId];
  }

  // دالة للحصول على الـ peer object كامل
  getPeerById(peerId: string) {
    const state = this.hmsStore.getState();
    return state.peers[peerId];
  }

  // دالة مساعدة لفصل الفيديو
  async detachVideo(
    trackId: string,
    videoElement: HTMLVideoElement
  ): Promise<void> {
    try {
      if (!trackId || !videoElement) {
        return;
      }

      console.log('🔌 Detaching video track:', trackId);
      await this.hmsActions.detachVideo(trackId, videoElement);
      console.log('✅ Video detached successfully');
    } catch (error) {
      console.error('❌ Error detaching video:', error);
    }
  }

  // دالة للحصول على HMSActions (للاستخدام المباشر)
  getActions() {
    return this.hmsActions;
  }
}
