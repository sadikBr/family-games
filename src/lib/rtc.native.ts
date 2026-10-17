/**
 * WebRTC on phones: react-native-webrtc for the connections and the microphone, and
 * react-native-incall-manager to route the sound to the loudspeaker (or to headphones / Bluetooth
 * when plugged in) while the voice chat is on. Same surface as rtc.ts.
 */
import { PermissionsAndroid, Platform } from 'react-native';

import type { RtcPlatform } from './rtc-types';

type WebRtcModule = typeof import('react-native-webrtc');
type InCallModule = typeof import('react-native-incall-manager').default;

/**
 * Loaded lazily: Expo Go and APKs built before the voice chat don't have these native modules, and a
 * plain import would crash the whole room screen. Without them the voice button just stays hidden.
 */
let webrtc: WebRtcModule | null = null;
let InCallManager: InCallModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webrtc = require('react-native-webrtc') as WebRtcModule;
} catch {
  webrtc = null;
}
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  InCallManager = (require('react-native-incall-manager') as { default: InCallModule }).default;
} catch {
  InCallManager = null;
}

let audioOn = false;

export const rtc: RtcPlatform = {
  supported: !!webrtc,
  createPeer: (config) => new webrtc!.RTCPeerConnection(config) as never,
  async getMic() {
    if (Platform.OS === 'android') {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (res !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('mic-denied');
    }
    if (!webrtc) throw new Error('no-webrtc');
    return (await webrtc.mediaDevices.getUserMedia({ audio: true, video: false })) as never;
  },
  startAudio() {
    if (audioOn) return;
    audioOn = true;
    try {
      // 'video' mode = loudspeaker by default, but still switches to a headset or Bluetooth when present
      InCallManager?.start({ media: 'video' });
    } catch {}
  },
  stopAudio() {
    if (!audioOn) return;
    audioOn = false;
    try {
      InCallManager?.stop();
    } catch {}
  },
  playRemote() {},
  stopRemote() {},
};
