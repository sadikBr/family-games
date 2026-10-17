import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type {
  ClientMsg,
  GameAction,
  GameId,
  RoomAction,
  RoomView,
  ServerMsg,
} from '@/shared/protocol';

import { getProfile } from './profile';
import { serverUrl } from './server-url';

const LAST_ROOM_KEY = 'fg.lastRoom.v1';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'offline';

export interface ClientSnapshot {
  status: ConnStatus;
  room: RoomView | null;
  error: { id: number; message: string; code?: string } | null;
  /** serverTime - localTime, to keep every phone's countdown in sync */
  offset: number;
  lastCode: string | null;
  url: string;
}

class GameClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private queue: ClientMsg[] = [];
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  private errorId = 0;
  private code: string | null = null;
  private appStateSub: { remove(): void } | null = null;

  snap: ClientSnapshot = {
    status: 'idle',
    room: null,
    error: null,
    offset: 0,
    lastCode: null,
    url: '',
  };

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private update(patch: Partial<ClientSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  async init() {
    try {
      const last = await AsyncStorage.getItem(LAST_ROOM_KEY);
      if (last) this.update({ lastCode: last });
    } catch {}
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener('change', (s) => {
        if (s === 'active' && this.wanted && !this.isOpen()) {
          this.retry = 0;
          this.connect();
        }
      });
    }
  }

  serverNow() {
    return Date.now() + this.snap.offset;
  }

  private isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect() {
    this.wanted = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const url = serverUrl();
    this.update({ status: 'connecting', url });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.update({ status: 'online' });
      this.raw({ t: 'hello', player: getProfile() });
      if (this.code) this.raw({ t: 'join', code: this.code });
      const q = this.queue;
      this.queue = [];
      q.forEach((m) => this.raw(m));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.raw({ t: 'ping' }), 20000);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.update({ status: 'offline' });
      if (this.wanted) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows
    };
  }

  private scheduleReconnect() {
    if (this.retryTimer) return;
    const delay = Math.min(400 * 2 ** this.retry, 4000);
    this.retry += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  /** Reconnect from scratch (e.g. the server address changed). */
  reconnect() {
    const old = this.ws;
    this.ws = null;
    try {
      old?.close();
    } catch {}
    this.retry = 0;
    this.connect();
  }

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
      case 'pong':
        this.update({ offset: msg.now - Date.now() });
        return;
      case 'state': {
        this.code = msg.room.code;
        if (this.snap.lastCode !== msg.room.code) {
          AsyncStorage.setItem(LAST_ROOM_KEY, msg.room.code).catch(() => {});
        }
        this.update({ room: msg.room, offset: msg.now - Date.now(), lastCode: msg.room.code });
        return;
      }
      case 'error': {
        if (msg.code === 'no_room') {
          this.code = null;
          this.forgetRoom();
        }
        this.update({ error: { id: ++this.errorId, message: msg.message, code: msg.code } });
        return;
      }
      case 'left':
        this.code = null;
        this.forgetRoom();
        if (msg.kicked) this.update({ error: { id: ++this.errorId, message: 'أخرجك المضيف من الغرفة', code: 'kicked' } });
        return;
    }
  }

  private forgetRoom() {
    AsyncStorage.removeItem(LAST_ROOM_KEY).catch(() => {});
    this.update({ room: null, lastCode: null });
  }

  private raw(msg: ClientMsg) {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {}
  }

  private send(msg: ClientMsg) {
    if (this.isOpen()) this.raw(msg);
    else {
      this.queue.push(msg);
      this.connect();
    }
  }

  createRoom(game: GameId) {
    this.code = null;
    this.update({ room: null });
    this.send({ t: 'create', game });
  }

  joinRoom(code: string) {
    this.code = code;
    if (this.snap.room?.code !== code) this.update({ room: null });
    if (this.isOpen()) this.raw({ t: 'join', code });
    else this.connect(); // join is sent on open
  }

  leaveRoom() {
    if (this.isOpen()) this.raw({ t: 'leave' });
    this.code = null;
    this.forgetRoom();
  }

  /** Re-send our profile (name / avatar changed). */
  refreshProfile() {
    if (!this.isOpen()) return;
    this.raw({ t: 'hello', player: getProfile() });
    if (this.code) this.raw({ t: 'join', code: this.code });
  }

  roomAction(action: RoomAction) {
    this.send({ t: 'room', action });
  }

  act(action: GameAction) {
    this.send({ t: 'act', action });
  }

  clearError() {
    this.update({ error: null });
  }
}

export const client = new GameClient();

export function useClient(): ClientSnapshot {
  return useSyncExternalStore(client.subscribe, () => client.snap, () => client.snap);
}

export function useRoom(): RoomView | null {
  return useClient().room;
}
