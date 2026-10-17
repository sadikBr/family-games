/**
 * Voice chat, phone to phone. Every phone in the room's voice chat holds one WebRTC connection to
 * every other one (a mesh: fine for a family table of up to ~8). The game server only keeps the list
 * of who is in voice and passes the set-up messages along; the sound itself never touches it (except
 * through a TURN relay when two phones can't reach each other directly — see server/voice.ts).
 *
 * Who calls whom is fixed (the smaller player id makes the offer), so two phones never offer at the
 * same time. A connection that fails is rebuilt by the caller.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { IceServer, RoomView, VoiceSignal } from '@/shared/protocol';

import { client } from './client';
import { rtc } from './rtc';
import type { RtcPeer, RtcStream } from './rtc-types';

export interface VoiceSnapshot {
  /** I'm in the voice chat (or joining) */
  on: boolean;
  joining: boolean;
  muted: boolean;
  /** a problem to show (mic refused…) */
  error: string | null;
  /** player id → is talking right now (me included) */
  speaking: Record<string, boolean>;
  /** player id → connection state with them */
  links: Record<string, 'connecting' | 'connected' | 'failed'>;
}

interface Peer {
  pc: RtcPeer;
  caller: boolean;
  queued: Record<string, unknown>[];
  energy: number | null;
  retry: ReturnType<typeof setTimeout> | null;
}

const SPEAKING = 0.035; // audio level 0..1 above which someone counts as talking
const POLL_MS = 400;

class Voice {
  private snapshot: VoiceSnapshot = { on: false, joining: false, muted: false, error: null, speaking: {}, links: {} };
  private listeners = new Set<() => void>();
  private local: RtcStream | null = null;
  private ice: IceServer[] | null = null;
  private peers = new Map<string, Peer>();
  private me: string | null = null;
  private code: string | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private rejoinAt = 0;

  constructor() {
    client.onVoice((msg) => {
      if (msg.t === 'voiceConfig') {
        this.ice = msg.iceServers;
        this.sync(client.snap.room);
      } else this.onSignal(msg.from, msg.data);
    });
    client.subscribe(() => this.sync(client.snap.room));
    AppState.addEventListener('change', (s) => {
      if (s === 'active') this.sync(client.snap.room);
    });
  }

  get snap() {
    return this.snapshot;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  get supported() {
    return rtc.supported;
  }

  async join() {
    if (this.snapshot.on || !rtc.supported) return;
    this.set({ on: true, joining: true, error: null });
    try {
      this.local = await rtc.getMic();
    } catch {
      this.local = null;
      this.set({ on: false, joining: false, error: 'لم نتمكن من استعمال الميكروفون. اسمح للتطبيق باستعماله من إعدادات الهاتف ثم حاول مرة أخرى.' });
      return;
    }
    if (!this.snapshot.on) {
      // left while the permission prompt was open
      this.local.getTracks().forEach((t) => t.stop());
      this.local = null;
      return;
    }
    for (const t of this.local.getAudioTracks()) t.enabled = !this.snapshot.muted;
    rtc.startAudio();
    this.startPolling();
    this.code = client.snap.room?.code ?? null;
    this.rejoinAt = Date.now();
    client.voice({ t: 'voice', a: 'join', muted: this.snapshot.muted });
  }

  leave() {
    if (!this.snapshot.on) return;
    client.voice({ t: 'voice', a: 'leave' });
    this.teardown();
    this.set({ on: false, joining: false, speaking: {}, links: {} });
  }

  setMuted(muted: boolean) {
    for (const t of this.local?.getAudioTracks() ?? []) t.enabled = !muted;
    this.set({ muted });
    if (this.snapshot.on) client.voice({ t: 'voice', a: 'mute', muted });
  }

  clearError() {
    this.set({ error: null });
  }

  private teardown() {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.ice = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    rtc.stopAudio();
  }

  /** Match my connections to the room's voice list (called on every room update). */
  private sync(room: RoomView | null) {
    if (!this.snapshot.on) return;
    if (!room || (this.code && room.code !== this.code)) {
      // left the room (or moved to another): leave the voice chat too
      this.teardown();
      this.set({ on: false, joining: false, speaking: {}, links: {} });
      return;
    }
    this.me = room.me;
    if (!this.local) return; // still waiting for the microphone
    const inVoice = room.voice.some((v) => v.id === room.me);
    if (!inVoice) {
      // the server dropped me (connection lost): start over with everyone and join again
      for (const id of [...this.peers.keys()]) this.drop(id);
      if (client.online && Date.now() - this.rejoinAt > 3000) {
        this.rejoinAt = Date.now();
        this.ice = null;
        client.voice({ t: 'voice', a: 'join', muted: this.snapshot.muted });
      }
      this.set({ joining: true });
      return;
    }
    if (!this.ice) return; // the server's ICE list is on its way
    if (this.snapshot.joining) this.set({ joining: false });
    const others = new Set(room.voice.filter((v) => v.id !== room.me && room.players.some((p) => p.id === v.id && p.connected)).map((v) => v.id));
    for (const id of [...this.peers.keys()]) if (!others.has(id)) this.drop(id);
    for (const id of others) if (!this.peers.has(id)) this.connect(id);
  }

  private link(id: string, state: VoiceSnapshot['links'][string] | null) {
    const links = { ...this.snapshot.links };
    if (state) links[id] = state;
    else delete links[id];
    this.set({ links });
  }

  private connect(id: string) {
    if (!this.local || !this.ice || !this.me) return;
    const pc = rtc.createPeer({ iceServers: this.ice });
    const peer: Peer = { pc, caller: this.me < id, queued: [], energy: null, retry: null };
    this.peers.set(id, peer);
    this.link(id, 'connecting');
    for (const t of this.local.getAudioTracks()) pc.addTrack(t, this.local);
    pc.addEventListener('icecandidate', (e) => {
      if (!e.candidate) return;
      const c = e.candidate.toJSON ? e.candidate.toJSON() : { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex };
      client.voice({ t: 'signal', to: id, data: { candidate: c } });
    });
    pc.addEventListener('track', (e) => {
      if (e.streams[0]) rtc.playRemote(id, e.streams[0]);
    });
    pc.addEventListener('connectionstatechange', () => {
      if (this.peers.get(id)?.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'connected') this.link(id, 'connected');
      else if (s === 'failed') {
        this.link(id, 'failed');
        // the caller rebuilds the connection (maybe through the relay this time)
        if (peer.caller && !peer.retry) peer.retry = setTimeout(() => this.restart(id), 1500);
      }
    });
    if (peer.caller) void this.offer(id, peer);
  }

  private async offer(id: string, peer: Peer) {
    try {
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      await peer.pc.setLocalDescription(offer);
      client.voice({ t: 'signal', to: id, data: { description: { type: 'offer', sdp: offer.sdp } } });
    } catch (e) {
      console.warn('voice: offer failed', e);
    }
  }

  private restart(id: string) {
    if (!this.peers.has(id) || !this.snapshot.on) return;
    this.drop(id);
    client.voice({ t: 'signal', to: id, data: { restart: true } });
    this.connect(id);
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    if (p.retry) clearTimeout(p.retry);
    this.peers.delete(id);
    try {
      p.pc.close();
    } catch {}
    rtc.stopRemote(id);
    this.link(id, null);
    if (this.snapshot.speaking[id]) {
      const speaking = { ...this.snapshot.speaking };
      delete speaking[id];
      this.set({ speaking });
    }
  }

  private async onSignal(from: string, data: VoiceSignal) {
    if (!this.snapshot.on || !this.local || !this.ice) return;
    if ('restart' in data) {
      // the caller is rebuilding: drop my side, its new offer follows
      this.drop(from);
      return;
    }
    let peer = this.peers.get(from);
    if ('description' in data) {
      const d = data.description;
      if (d.type === 'offer') {
        // a fresh offer replaces whatever connection there was
        if (peer && (peer.pc.remoteDescription || peer.pc.signalingState !== 'stable')) {
          this.drop(from);
          peer = undefined;
        }
        if (!peer) {
          this.connect(from);
          peer = this.peers.get(from);
        }
        if (!peer || peer.caller) return;
        try {
          await peer.pc.setRemoteDescription(d);
          await this.flush(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          client.voice({ t: 'signal', to: from, data: { description: { type: 'answer', sdp: answer.sdp } } });
        } catch (e) {
          console.warn('voice: answer failed', e);
        }
      } else if (peer && peer.pc.signalingState === 'have-local-offer') {
        try {
          await peer.pc.setRemoteDescription(d);
          await this.flush(peer);
        } catch (e) {
          console.warn('voice: remote answer failed', e);
        }
      }
      return;
    }
    if ('candidate' in data && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.queued.push(data.candidate);
    }
  }

  private async flush(peer: Peer) {
    const q = peer.queued;
    peer.queued = [];
    for (const c of q) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  /** Who is talking: audio levels from the connections' stats, a few times a second. */
  private startPolling() {
    if (this.poll) clearInterval(this.poll);
    this.poll = setInterval(() => void this.measure(), POLL_MS);
  }

  private async measure() {
    const speaking: Record<string, boolean> = {};
    let mine = 0;
    for (const [id, peer] of this.peers) {
      try {
        const stats = await peer.pc.getStats();
        let level = 0;
        let energy: number | null = null;
        stats.forEach((r: Record<string, unknown>) => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            if (typeof r.audioLevel === 'number') level = Math.max(level, r.audioLevel);
            if (typeof r.totalAudioEnergy === 'number') energy = r.totalAudioEnergy;
          }
          if (r.type === 'media-source' && r.kind === 'audio' && typeof r.audioLevel === 'number') mine = Math.max(mine, r.audioLevel);
        });
        // some phones report only the running energy total: turn its growth into a level
        if (!level && energy !== null && peer.energy !== null) level = Math.sqrt(Math.max(0, energy - peer.energy) / (POLL_MS / 1000));
        peer.energy = energy;
        speaking[id] = level > SPEAKING;
      } catch {}
    }
    if (this.me) speaking[this.me] = !this.snapshot.muted && mine > SPEAKING;
    const before = this.snapshot.speaking;
    const same = Object.keys(speaking).length === Object.keys(before).length && Object.entries(speaking).every(([k, v]) => before[k] === v);
    if (!same) this.set({ speaking });
  }
}

export const voice = new Voice();

export function useVoice(): VoiceSnapshot {
  return useSyncExternalStore(voice.subscribe, () => voice.snap, () => voice.snap);
}
