/**
 * WebRTC on the web (the browser's own API). The phone version is rtc.native.ts — both export the
 * same small surface used by the voice chat (src/lib/voice.ts).
 */
import type { RtcPlatform } from './rtc-types';

const audios = new Map<string, HTMLAudioElement>();
const hasRtc = typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined';

export const rtc: RtcPlatform = {
  supported: hasRtc && !!navigator.mediaDevices?.getUserMedia,
  createPeer: (config) => new window.RTCPeerConnection(config) as never,
  async getMic() {
    return (await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })) as never;
  },
  startAudio() {},
  stopAudio() {
    for (const a of audios.values()) a.srcObject = null;
    audios.clear();
  },
  playRemote(id, stream) {
    let a = audios.get(id);
    if (!a) {
      a = new Audio();
      a.autoplay = true;
      audios.set(id, a);
    }
    a.srcObject = stream as unknown as MediaStream;
    a.play().catch(() => {});
  },
  stopRemote(id) {
    const a = audios.get(id);
    if (a) a.srcObject = null;
    audios.delete(id);
  },
};
