/** The small slice of WebRTC the voice chat needs, the same on the web and on phones. */

export interface RtcTrack {
  enabled: boolean;
  kind: string;
  stop(): void;
}

export interface RtcStream {
  getTracks(): RtcTrack[];
  getAudioTracks(): RtcTrack[];
}

export interface RtcCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  toJSON?(): Record<string, unknown>;
}

export interface RtcDescription {
  type: 'offer' | 'answer' | string;
  sdp: string;
}

export interface RtcPeer {
  connectionState: string;
  signalingState: string;
  remoteDescription: RtcDescription | null;
  addTrack(track: RtcTrack, stream: RtcStream): unknown;
  createOffer(options?: Record<string, unknown>): Promise<RtcDescription>;
  createAnswer(): Promise<RtcDescription>;
  setLocalDescription(d: RtcDescription): Promise<void>;
  setRemoteDescription(d: RtcDescription): Promise<void>;
  addIceCandidate(c: Record<string, unknown>): Promise<void>;
  getStats(): Promise<Map<string, Record<string, unknown>> | { forEach(cb: (v: Record<string, unknown>) => void): void }>;
  addEventListener(type: 'icecandidate', cb: (e: { candidate: RtcCandidate | null }) => void): void;
  addEventListener(type: 'track', cb: (e: { streams: RtcStream[] }) => void): void;
  addEventListener(type: 'connectionstatechange', cb: () => void): void;
  close(): void;
}

export interface RtcPlatform {
  /** false where there is no WebRTC (old browsers): the voice button is hidden */
  supported: boolean;
  createPeer(config: { iceServers: { urls: string | string[]; username?: string; credential?: string }[] }): RtcPeer;
  /** Asks for the microphone (and the permission on Android). Throws if refused. */
  getMic(): Promise<RtcStream>;
  /** Route the call to the loudspeaker (phones) while in voice. */
  startAudio(): void;
  stopAudio(): void;
  /** Play someone's sound (phones play it by themselves). */
  playRemote(id: string, stream: RtcStream): void;
  stopRemote(id: string): void;
}
