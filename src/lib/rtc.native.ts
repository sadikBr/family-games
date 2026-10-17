/**
 * WebRTC on phones: react-native-webrtc for the connections and the microphone, and
 * react-native-incall-manager to route the sound to the loudspeaker (or to headphones / Bluetooth
 * when plugged in) while the voice chat is on. Same surface as rtc.ts.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { RTCPeerConnection, mediaDevices } from 'react-native-webrtc';

import type { RtcPlatform } from './rtc-types';

let audioOn = false;

export const rtc: RtcPlatform = {
  supported: true,
  createPeer: (config) => new RTCPeerConnection(config) as never,
  async getMic() {
    if (Platform.OS === 'android') {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (res !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('mic-denied');
    }
    return (await mediaDevices.getUserMedia({ audio: true, video: false })) as never;
  },
  startAudio() {
    if (audioOn) return;
    audioOn = true;
    try {
      // 'video' mode = loudspeaker by default, but still switches to a headset or Bluetooth when present
      InCallManager.start({ media: 'video' });
    } catch {}
  },
  stopAudio() {
    if (!audioOn) return;
    audioOn = false;
    try {
      InCallManager.stop();
    } catch {}
  },
  playRemote() {},
  stopRemote() {},
};
