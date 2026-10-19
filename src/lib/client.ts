import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import type {
  ClientMsg,
  GameAction,
  GameId,
  GroupInfo,
  GroupRequest,
  PlayerInfo,
  RoomAction,
  RoomView,
  ServerMsg,
} from '@/shared/protocol';

import { getProfile } from './profile';
import { serverUrl } from './server-url';

const LAST_ROOM_KEY = 'fg.lastRoom.v1';
/** the last group list, so the home screen shows the groups at once (refreshed when connected) */
const GROUPS_KEY = 'fg.groups.v1';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'offline';

export interface ClientSnapshot {
  status: ConnStatus;
  room: RoomView | null;
  error: { id: number; message: string; code?: string } | null;
  /** serverTime - localTime, to keep every phone's countdown in sync */
  offset: number;
  lastCode: string | null;
  url: string;
  /** my groups (null until known) */
  groups: GroupInfo[] | null;
  /** a group I'm in started playing: the invitation to show (see GroupCallSheet) */
  call: GroupCall | null;
  /** the server's answer to my last group create / join */
  groupReply: { id: number; a: 'create' | 'join'; group: GroupInfo } | null;
}

export interface GroupCall {
  id: number;
  group: { id: string; name: string };
  code: string;
  by: PlayerInfo;
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
  /** moving from one room to another: states of the old room still on their way are ignored */
  private switchTo: string | null = null;
  /** a room was asked for since the app started (create / join / a group's «لنلعب») */
  private askedRoom = false;
  private pushToken: string | null = null;
  private callId = 0;
  private replyId = 0;
  /** voice chat messages go to the voice manager (src/lib/voice.ts) */
  private voiceListener: ((msg: Extract<ServerMsg, { t: 'signal' | 'voiceConfig' }>) => void) | null = null;

  snap: ClientSnapshot = {
    status: 'idle',
    room: null,
    error: null,
    offset: 0,
    lastCode: null,
    url: '',
    groups: null,
    call: null,
    groupReply: null,
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
    try {
      const raw = await AsyncStorage.getItem(GROUPS_KEY);
      if (raw && !this.snap.groups) {
        // who is online and who is playing is only known once connected
        const saved = (JSON.parse(raw) as GroupInfo[]).map((g) => ({ ...g, playing: null, members: g.members.map((m) => ({ ...m, online: false })) }));
        this.update({ groups: saved });
      }
    } catch {}
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          // the app is open: be connected, so the family sees us and our calls arrive
          if (!this.isOpen()) {
            this.retry = 0;
            this.connect();
          }
        } else if (s === 'background' && Platform.OS !== 'web' && !this.code) {
          // closed outside a room: let the server know, so a group call comes as a notification
          this.sleep();
        }
      });
    }
  }

  /** Stay connected while the app is open (presence and group calls), not only inside a room. */
  start() {
    if (AppState.currentState === 'background' && Platform.OS !== 'web') return;
    this.connect();
  }

  /** Disconnect until the app comes back (outside a room only). */
  private sleep() {
    this.wanted = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      this.ws?.close();
    } catch {}
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
        this.update({ offset: msg.now - Date.now() });
        this.raw({ t: 'groups' });
        if (this.pushToken) this.raw({ t: 'push', token: this.pushToken });
        return;
      case 'pong':
        this.update({ offset: msg.now - Date.now() });
        return;
      case 'groups':
        this.update({ groups: msg.groups });
        AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(msg.groups)).catch(() => {});
        return;
      case 'group':
        this.update({ groupReply: { id: ++this.replyId, a: msg.a, group: msg.group } });
        return;
      case 'groupCall':
        // already in that room: nothing to invite me to
        if (this.snap.room?.code === msg.code || this.code === msg.code) return;
        this.update({ call: { id: ++this.callId, group: msg.group, code: msg.code, by: msg.by } });
        return;
      case 'state': {
        if (this.switchTo) {
          if (msg.room.code !== this.switchTo) return; // the room we're leaving
          this.switchTo = null;
        }
        this.code = msg.room.code;
        if (this.snap.lastCode !== msg.room.code) {
          AsyncStorage.setItem(LAST_ROOM_KEY, msg.room.code).catch(() => {});
        }
        this.update({ room: msg.room, offset: msg.now - Date.now(), lastCode: msg.room.code });
        return;
      }
      case 'error': {
        if (msg.code === 'no_room' || (this.switchTo && msg.code !== 'group')) {
          // (a refused move to another room: the server already took us out of the old one)
          this.code = null;
          this.switchTo = null;
          this.forgetRoom();
        }
        this.update({ error: { id: ++this.errorId, message: msg.message, code: msg.code } });
        return;
      }
      case 'signal':
      case 'voiceConfig':
        this.voiceListener?.(msg);
        return;
      case 'left':
        if (this.switchTo) return; // the old room letting us go on the way to the new one
        this.code = null;
        this.forgetRoom();
        if (msg.kicked) this.update({ error: { id: ++this.errorId, message: 'أخرجك المضيف من الغرفة', code: 'kicked' } });
        return;
    }
  }

  onVoice(fn: typeof this.voiceListener) {
    this.voiceListener = fn;
  }

  /** Voice chat messages: sent only while connected (a stale WebRTC message is worse than none). */
  voice(msg: Extract<ClientMsg, { t: 'voice' | 'signal' }>) {
    if (this.isOpen()) this.raw(msg);
  }

  /** Is the connection to the server up? */
  get online() {
    return this.isOpen();
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
    this.askedRoom = true;
    this.code = null;
    this.switchTo = null;
    this.update({ room: null });
    this.send({ t: 'create', game });
  }

  /** The room screen opened without any room asked for: the page was reloaded on the web. */
  get coldRoomScreen() {
    return !this.askedRoom;
  }

  joinRoom(code: string) {
    this.askedRoom = true;
    // from one room straight into another (an invitation accepted in a room): the old room stays
    // on screen until the new one arrives
    const switching = !!this.snap.room && this.snap.room.code !== code;
    this.code = code;
    this.switchTo = switching ? code : null;
    if (this.snap.call?.code === code) this.update({ call: null });
    if (this.isOpen()) this.raw({ t: 'join', code });
    else this.connect(); // join is sent on open
  }

  /** «لنلعب»: open the group's room (or join it if it is already playing). */
  groupPlay(id: string) {
    this.askedRoom = true;
    this.code = null;
    this.switchTo = null;
    this.update({ room: null, call: this.snap.call?.group.id === id ? null : this.snap.call });
    this.send({ t: 'group', a: 'play', id });
  }

  group(msg: Exclude<GroupRequest, { a: 'play' }>) {
    this.send(msg);
  }

  /** Ask for my groups again (e.g. pulling the home screen). */
  refreshGroups() {
    if (this.isOpen()) this.raw({ t: 'groups' });
    else this.connect();
  }

  /** The Expo push token of this phone: sent now and on every connection. */
  setPushToken(token: string) {
    this.pushToken = token;
    if (this.isOpen()) this.raw({ t: 'push', token });
  }

  dismissCall() {
    this.update({ call: null });
  }

  leaveRoom() {
    if (this.isOpen()) this.raw({ t: 'leave' });
    this.code = null;
    this.switchTo = null;
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
