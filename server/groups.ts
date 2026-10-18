/**
 * Groups («المجموعات»): a family saved once (SQLite, see db.ts), so anyone in it can press «لنلعب»
 * and open a room with everyone, instead of sharing a code each time.
 *
 * - Presence: who has the app open = who has at least one open socket.
 * - «لنلعب»: opens a normal Room marked with the group; members with the app open get a `groupCall`,
 *   the others a push notification (Expo push service) if their phone registered a token.
 *   The room waits until everyone is in (or the caller chooses «ابدأ بالموجودين»).
 * - Every member with the app open gets a fresh `groups` list whenever one of their groups changes.
 */
import { randomUUID } from 'node:crypto';

import { cleanGroupName, GROUP_CODE_ALPHABET, GROUP_CODE_LEN, isExpoPushToken, MAX_GROUP_MEMBERS, MAX_GROUPS_PER_PLAYER, normalizeGroupCode } from '../src/shared/groups';
import { GAME_IDS, type ClientMsg, type GameId, type GroupInfo, type GroupRequest, type PlayerInfo, type ServerMsg } from '../src/shared/protocol';
import type { GroupRow, Store } from './db';
import { send, type Room, type Sock } from './room';
import { GameError } from './types';

/** One call (notifications) per group per minute: a second tap just joins the live room. */
export const CALL_COOLDOWN_MS = 60_000;
/** A group room nobody is connected to for this long no longer counts as «playing». */
export const IDLE_ROOM_MS = 30_000;
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** A group that never played opens its first room on this game (anyone can change it in the room). */
export const FIRST_GROUP_GAME: GameId = 'imposter';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { kind: 'groupCall'; code: string; groupId: string };
  channelId: 'group-calls';
  priority: 'high';
  sound: 'default';
}

export interface HubDeps {
  store: Store;
  rooms: Map<string, Room>;
  /** open a normal room on this game with this host (and register it in `rooms`) */
  createRoom: (host: PlayerInfo, game: GameId) => Room;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  /** presence changes are sent together after this delay */
  presenceDelayMs?: number;
  /** EXPO_ACCESS_TOKEN, when the Expo project requires authenticated pushes */
  expoAccessToken?: string;
  log?: Pick<Console, 'log' | 'warn' | 'error'>;
}

class GroupError extends GameError {}

export class GroupHub {
  private store: Store;
  private rooms: Map<string, Room>;
  private now: () => number;
  private fetch: NonNullable<HubDeps['fetch']>;
  private log: NonNullable<HubDeps['log']>;
  private presenceDelay: number;
  /** player id → their open sockets */
  private sockets = new Map<string, Set<Sock>>();
  private sockPlayer = new Map<Sock, string>();
  /** group id → its live «لنلعب» room */
  private playing = new Map<string, { code: string; by: string; since: number }>();
  private idleSince = new Map<string, number>();
  private lastCall = new Map<string, number>();
  /** players whose presence / profile changed since the last flush */
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** push requests still in flight (tests wait for them) */
  readonly inFlight = new Set<Promise<void>>();

  constructor(private deps: HubDeps) {
    this.store = deps.store;
    this.rooms = deps.rooms;
    this.now = deps.now ?? Date.now;
    this.fetch = deps.fetch ?? ((url, init) => fetch(url, init));
    this.log = deps.log ?? console;
    this.presenceDelay = deps.presenceDelayMs ?? 1000;
  }

  /* ---------------------------------------------------------------- */
  /* Presence                                                          */
  /* ---------------------------------------------------------------- */

  isOnline(playerId: string) {
    return (this.sockets.get(playerId)?.size ?? 0) > 0;
  }

  /** A socket said hello (on every connection, and again when the profile changes). */
  hello(ws: Sock, player: PlayerInfo) {
    const before = this.sockPlayer.get(ws);
    if (before && before !== player.id) this.dropSocket(ws, before);
    let set = this.sockets.get(player.id);
    if (!set) {
      set = new Set();
      this.sockets.set(player.id, set);
    }
    const wasOnline = set.size > 0;
    set.add(ws);
    this.sockPlayer.set(ws, player.id);
    const renamed = this.store.refreshMember(player);
    if (!wasOnline || renamed) this.markDirty(player.id);
  }

  /** A socket closed. */
  closed(ws: Sock) {
    const id = this.sockPlayer.get(ws);
    if (id) this.dropSocket(ws, id);
  }

  private dropSocket(ws: Sock, id: string) {
    this.sockPlayer.delete(ws);
    const set = this.sockets.get(id);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.sockets.delete(id);
      this.markDirty(id);
    }
  }

  private markDirty(id: string) {
    this.dirty.add(id);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.presenceDelay);
  }

  /** Forget pending presence updates (shutting down). */
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.dirty.clear();
  }

  /** Send the presence changes collected since the last flush (debounced). */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty.size) return;
    const groups = new Set<string>();
    for (const id of this.dirty) for (const g of this.store.groupsOf(id)) groups.add(g.id);
    this.dirty.clear();
    const people = new Set<string>();
    for (const gid of groups) {
      for (const m of this.store.members(gid)) if (this.isOnline(m.id)) people.add(m.id);
      // the waiting list in the group's room shows who has the app open
      const live = this.livePlaying(gid);
      if (live) this.rooms.get(live.code)?.broadcast();
    }
    for (const id of people) this.sendGroups(id);
  }

  /* ---------------------------------------------------------------- */
  /* Messages                                                          */
  /* ---------------------------------------------------------------- */

  handle(ws: Sock, player: PlayerInfo, msg: Extract<ClientMsg, { t: 'groups' | 'group' | 'push' }>) {
    try {
      if (msg.t === 'groups') return send(ws, { t: 'groups', groups: this.groupsFor(player.id) });
      if (msg.t === 'push') {
        if (isExpoPushToken(msg.token)) this.store.setPushToken(player.id, msg.token, this.now());
        return;
      }
      this.groupAction(ws, player, msg);
    } catch (e) {
      if (e instanceof GroupError) send(ws, { t: 'error', code: 'group', message: e.message });
      else throw e;
    }
  }

  private groupAction(ws: Sock, player: PlayerInfo, msg: GroupRequest) {
    switch (msg.a) {
      case 'create': {
        const name = cleanGroupName(msg.name);
        if (!name) throw new GroupError('اكتب اسماً للمجموعة');
        this.checkRoomForAnotherGroup(player.id);
        const now = this.now();
        const id = randomUUID();
        this.store.createGroup({ id, code: this.newCode(), name, createdBy: player.id, createdAt: now }, player);
        this.log.log(`group «${name}» created by ${player.name}`);
        send(ws, { t: 'group', a: 'create', group: this.info(this.store.group(id)!) });
        this.sendGroups(player.id);
        return;
      }
      case 'join': {
        const code = normalizeGroupCode(msg.code);
        const g = code ? this.store.groupByCode(code) : null;
        if (!g) throw new GroupError('الرمز غير صحيح');
        if (!this.store.isMember(g.id, player.id)) {
          if (this.store.countMembers(g.id) >= MAX_GROUP_MEMBERS) throw new GroupError(`المجموعة ممتلئة (${MAX_GROUP_MEMBERS} عضواً)`);
          this.checkRoomForAnotherGroup(player.id);
          this.store.addMember(g.id, player, this.now());
          this.notifyGroup(g.id);
        }
        send(ws, { t: 'group', a: 'join', group: this.info(g) });
        this.sendGroups(player.id);
        return;
      }
      case 'leave': {
        const g = this.mine(msg.id, player.id);
        this.store.removeMember(g.id, player.id);
        const rest = this.store.members(g.id);
        if (!rest.length) {
          this.store.deleteGroup(g.id);
          this.playing.delete(g.id);
          this.lastCall.delete(g.id);
        } else if (g.createdBy === player.id) {
          this.store.setCreator(g.id, rest[0].id); // the longest-standing member takes over
        }
        this.dropExpected(g.id, player.id);
        this.sendGroups(player.id);
        this.notifyGroup(g.id);
        return;
      }
      case 'rename': {
        const g = this.mine(msg.id, player.id);
        const name = cleanGroupName(msg.name);
        if (!name) throw new GroupError('اكتب اسماً للمجموعة');
        if (name === g.name) return;
        this.store.rename(g.id, name);
        const room = this.liveRoom(g.id);
        if (room?.group) {
          room.group.name = name;
          room.broadcast();
        }
        this.notifyGroup(g.id);
        return;
      }
      case 'remove': {
        const g = this.mine(msg.id, player.id);
        if (g.createdBy !== player.id) throw new GroupError('إخراج الأعضاء لمنشئ المجموعة فقط');
        if (typeof msg.player !== 'string' || msg.player === player.id || !this.store.isMember(g.id, msg.player)) return;
        this.store.removeMember(g.id, msg.player);
        this.dropExpected(g.id, msg.player);
        this.notifyGroup(g.id, [msg.player]);
        return;
      }
      case 'play': {
        this.play(ws, player, this.mine(msg.id, player.id));
        return;
      }
    }
  }

  /** The group, if this player is in it. */
  private mine(id: unknown, playerId: string): GroupRow {
    const g = typeof id === 'string' ? this.store.group(id) : null;
    if (!g || !this.store.isMember(g.id, playerId)) throw new GroupError('لست في هذه المجموعة');
    return g;
  }

  private checkRoomForAnotherGroup(playerId: string) {
    if (this.store.countGroupsOf(playerId) >= MAX_GROUPS_PER_PLAYER) {
      throw new GroupError(`لا يمكن الانضمام إلى أكثر من ${MAX_GROUPS_PER_PLAYER} مجموعة — غادر مجموعة قديمة أولاً`);
    }
  }

  private newCode(): string {
    for (let i = 0; i < 1000; i++) {
      let code = '';
      for (let j = 0; j < GROUP_CODE_LEN; j++) code += GROUP_CODE_ALPHABET[Math.floor(Math.random() * GROUP_CODE_ALPHABET.length)];
      if (!this.store.codeTaken(code)) return code;
    }
    throw new Error('no free group codes');
  }

  /* ---------------------------------------------------------------- */
  /* «لنلعب»                                                           */
  /* ---------------------------------------------------------------- */

  private play(ws: Sock, player: PlayerInfo, g: GroupRow) {
    const now = this.now();
    const room = this.liveRoom(g.id);
    const recent = now - (this.lastCall.get(g.id) ?? -Infinity) < CALL_COOLDOWN_MS;
    // the group is already playing (or was just called): join that room
    if (room && (hasPeople(room) || recent)) {
      this.enter(ws, player, room);
      return;
    }

    const game = (GAME_IDS as string[]).includes(g.lastGame ?? '') ? (g.lastGame as GameId) : FIRST_GROUP_GAME;
    const members = this.store.members(g.id);
    const r = this.deps.createRoom(player, game);
    r.group = {
      id: g.id,
      name: g.name,
      by: player.id,
      expected: members.map(({ id, name, avatar, color }) => ({ id, name, avatar, color })),
      waiting: true,
      notified: new Set(),
    };
    r.isOnline = (id) => this.isOnline(id);
    r.onStart = (started) => this.store.setLastGame(g.id, started);
    this.playing.set(g.id, { code: r.code, by: player.id, since: now });
    this.idleSince.delete(g.id);
    this.enter(ws, player, r);
    this.log.log(`group «${g.name}»: ${player.name} opened room ${r.code}`);
    // everyone's group card shows «يلعبون الآن» before the call arrives
    this.notifyGroup(g.id);
    if (recent) return;

    this.lastCall.set(g.id, now);
    const by: PlayerInfo = { id: player.id, name: player.name, avatar: player.avatar, color: player.color };
    const pushes: PushMessage[] = [];
    for (const m of members) {
      if (m.id === player.id) continue;
      if (this.isOnline(m.id)) {
        if (r.players.some((p) => p.id === m.id && p.connected)) continue;
        const call: ServerMsg = { t: 'groupCall', group: { id: g.id, name: g.name }, code: r.code, by };
        for (const s of this.sockets.get(m.id) ?? []) send(s, call);
        continue;
      }
      const token = this.store.pushToken(m.id);
      if (!token) continue;
      pushes.push(pushMessage(token, by.name, g, r.code));
      r.group.notified.add(m.id);
    }
    if (pushes.length) {
      r.broadcast(); // the waiting list says who was notified
      this.sendPush(pushes);
    }
  }

  /** Move this socket's player into the room (leaving the one they were in). */
  private enter(ws: Sock, player: PlayerInfo, room: Room) {
    const current = ws.data.code ? this.rooms.get(ws.data.code) : undefined;
    if (current && current !== room) current.leave(player.id);
    room.join(player, ws);
  }

  /** A member left or was removed: the group's room stops waiting for them. */
  private dropExpected(groupId: string, playerId: string) {
    const room = this.liveRoom(groupId);
    if (!room?.group) return;
    room.group.expected = room.group.expected.filter((e) => e.id !== playerId);
    room.checkGroupComplete();
    room.broadcast();
  }

  private liveRoom(groupId: string): Room | undefined {
    const live = this.livePlaying(groupId);
    return live ? this.rooms.get(live.code) : undefined;
  }

  private livePlaying(groupId: string) {
    const p = this.playing.get(groupId);
    if (!p) return null;
    const room = this.rooms.get(p.code);
    return room && room.group?.id === groupId ? p : null;
  }

  /** Clean-up a few times a second: a group whose room closed or emptied is no longer playing. */
  tick() {
    const now = this.now();
    for (const [gid, p] of this.playing) {
      const room = this.rooms.get(p.code);
      let over = !room || room.group?.id !== gid || !room.players.some((x) => !x.bot);
      if (!over && room && !hasPeople(room)) {
        const since = this.idleSince.get(gid) ?? now;
        this.idleSince.set(gid, since);
        over = now - since >= IDLE_ROOM_MS;
      } else this.idleSince.delete(gid);
      if (over) {
        this.playing.delete(gid);
        this.idleSince.delete(gid);
        this.notifyGroup(gid);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Push notifications (Expo push service)                            */
  /* ---------------------------------------------------------------- */

  /** Fire and forget: never blocks the server; failures are logged, dead tokens dropped. */
  private sendPush(messages: PushMessage[]) {
    const job = (async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (this.deps.expoAccessToken) headers.Authorization = `Bearer ${this.deps.expoAccessToken}`;
        const res = await this.fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(15_000) });
        const json = (await res.json().catch(() => null)) as { data?: unknown; errors?: unknown } | null;
        if (!res.ok) {
          this.log.warn(`push: Expo answered ${res.status}`, JSON.stringify(json?.errors ?? json));
          return;
        }
        const tickets = Array.isArray(json?.data) ? (json.data as { status?: string; message?: string; details?: { error?: string } }[]) : [];
        tickets.forEach((t, i) => {
          if (t?.status !== 'error') return;
          const to = messages[i]?.to;
          if (t.details?.error === 'DeviceNotRegistered' && to) this.store.dropPushToken(to);
          this.log.warn(`push to ${to} failed: ${t.details?.error ?? ''} ${t.message ?? ''}`);
        });
      } catch (e) {
        this.log.warn('push failed:', e instanceof Error ? e.message : e);
      }
    })();
    this.inFlight.add(job);
    job.finally(() => this.inFlight.delete(job));
  }

  /* ---------------------------------------------------------------- */
  /* Group lists                                                       */
  /* ---------------------------------------------------------------- */

  private info(g: GroupRow): GroupInfo {
    return {
      id: g.id,
      code: g.code,
      name: g.name,
      createdBy: g.createdBy,
      members: this.store.members(g.id).map(({ id, name, avatar, color }) => ({ id, name, avatar, color, online: this.isOnline(id) })),
      playing: this.livePlaying(g.id),
    };
  }

  groupsFor(playerId: string): GroupInfo[] {
    return this.store.groupsOf(playerId).map((g) => this.info(g));
  }

  private sendGroups(playerId: string) {
    const socks = this.sockets.get(playerId);
    if (!socks?.size) return;
    const msg: ServerMsg = { t: 'groups', groups: this.groupsFor(playerId) };
    for (const s of socks) send(s, msg);
  }

  /** Something in the group changed: every member with the app open (and `also`) gets a fresh list. */
  private notifyGroup(groupId: string, also: string[] = []) {
    const ids = new Set([...this.store.members(groupId).map((m) => m.id), ...also]);
    for (const id of ids) this.sendGroups(id);
  }
}

function hasPeople(room: Room) {
  return room.players.some((p) => !p.bot && p.connected);
}

export function pushMessage(to: string, byName: string, g: { id: string; name: string }, code: string): PushMessage {
  return {
    to,
    title: 'ألعاب العائلة',
    body: `دعوة من ${byName}: «${g.name}» تلعب الآن — ادخل!`,
    data: { kind: 'groupCall', code, groupId: g.id },
    channelId: 'group-calls',
    priority: 'high',
    sound: 'default',
  };
}
