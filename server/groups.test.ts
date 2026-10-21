/**
 * Groups («المجموعات»): storage, presence, «لنلعب», the waiting room and push notifications.
 *   bun test server/groups.test.ts
 */
import { afterAll, expect, test } from 'bun:test';
import type { Subprocess } from 'bun';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanGroupName, GROUP_CODE_ALPHABET, isExpoPushToken, normalizeGroupCode, typingGroupCode } from '../src/shared/groups';
import type { ClientMsg, GroupInfo, PlayerInfo, RoomAction, ServerMsg } from '../src/shared/protocol';
import { AUTO_AWAY_MS, cleanStatus, effectiveStatus, type MyStatus } from '../src/shared/status';
import { dataLocation, migrate, Store } from './db';
import { CALL_COOLDOWN_MS, GroupHub, IDLE_ROOM_MS, type PushMessage } from './groups';
import { Room, type Sock } from './room';
import { GameError } from './types';

const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'fg-groups-'));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const quiet = { log() {}, warn() {}, error() {} };

/** A phone's socket, without a network. */
class FakeSock {
  data: { player: PlayerInfo | null; code: string | null } = { player: null, code: null };
  msgs: ServerMsg[] = [];
  closed = false;
  send(raw: string) {
    if (this.closed) throw new Error('closed');
    this.msgs.push(JSON.parse(raw));
  }
  close() {
    this.closed = true;
  }
}

interface Sent {
  url: string;
  body: PushMessage[];
  auth?: string;
}

function world(opts: { ticket?: (m: PushMessage) => unknown; dir?: string; token?: string } = {}) {
  const dir = opts.dir ?? tempDir();
  const store = Store.open(dir);
  const rooms = new Map<string, Room>();
  let n = 1000;
  const clock = { now: 1_000_000 };
  const sent: Sent[] = [];
  const hub = new GroupHub({
    store,
    rooms,
    createRoom: (host, game) => {
      const r = new Room(String(++n), host, game);
      rooms.set(r.code, r);
      return r;
    },
    fetch: async (url, init) => {
      const body = JSON.parse(String(init.body)) as PushMessage[];
      sent.push({ url, body, auth: (init.headers as Record<string, string>).Authorization });
      return Response.json({ data: body.map((m) => opts.ticket?.(m) ?? { status: 'ok', id: `t-${m.to}` }) });
    },
    now: () => clock.now,
    presenceDelayMs: 5,
    expoAccessToken: opts.token,
    log: quiet,
  });

  class Phone {
    ws = new FakeSock();
    errors: string[] = [];
    player: PlayerInfo;
    constructor(id: string, name: string) {
      this.player = { id, name, avatar: 'cat', color: '#E2475F' };
    }
    get sock() {
      return this.ws as unknown as Sock;
    }
    /** `status`: what the phone sends in its hello (an older app sends none) */
    connect(status?: MyStatus) {
      this.ws = new FakeSock();
      this.ws.data.player = this.player;
      hub.hello(this.sock, this.player, status);
      return this;
    }
    close() {
      this.ws.closed = true;
      const { code } = this.ws.data;
      if (code) rooms.get(code)?.disconnect(this.player.id, this.sock);
      hub.closed(this.sock);
    }
    /** like server/index.ts: route a message, errors become toasts */
    send(msg: ClientMsg) {
      try {
        if (msg.t === 'groups' || msg.t === 'group' || msg.t === 'push' || msg.t === 'status') hub.handle(this.sock, this.player, msg);
        else if (msg.t === 'room') this.room()?.roomAction(this.player.id, msg.action);
        else if (msg.t === 'join') {
          const target = rooms.get(msg.code)!;
          const cur = this.room();
          if (cur && cur !== target) cur.leave(this.player.id);
          target.join(this.player, this.sock);
        } else if (msg.t === 'leave') this.room()?.leave(this.player.id);
      } catch (e) {
        if (e instanceof GameError) this.errors.push(e.message);
        else throw e;
      }
      const err = this.ws.msgs.filter((m) => m.t === 'error').map((m) => (m as { message: string }).message);
      this.errors.push(...err.filter((e) => !this.errors.includes(e)));
    }
    roomAction(action: RoomAction) {
      this.send({ t: 'room', action });
    }
    room() {
      return this.ws.data.code ? rooms.get(this.ws.data.code) : undefined;
    }
    view() {
      return this.last('state')?.room ?? null;
    }
    last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
      return this.ws.msgs.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
    }
    all<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
      return this.ws.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
    }
    groups(): GroupInfo[] {
      return this.last('groups')?.groups ?? [];
    }
    clear() {
      this.ws.msgs = [];
      this.errors = [];
    }
  }

  const phone = (id: string, name = id, status?: MyStatus) => new Phone(id, name).connect(status);
  const settle = async () => {
    await Bun.sleep(15); // presence debounce
    await Promise.all([...hub.inFlight]);
  };
  return { store, rooms, hub, clock, sent, phone, settle, dir };
}

/** Create a group with `a` and have the others join it. */
function family(w: ReturnType<typeof world>, ...names: string[]) {
  const phones = names.map((n) => w.phone(n));
  phones[0].send({ t: 'group', a: 'create', name: 'العائلة' });
  const g = phones[0].last('group')!.group;
  for (const p of phones.slice(1)) p.send({ t: 'group', a: 'join', code: g.code.toLowerCase() });
  return { phones, g };
}

/* ------------------------------------------------------------------ */

test('codes: normalized from what people type, unambiguous alphabet', () => {
  expect(normalizeGroupCode('abcdef')).toBe('ABCDEF');
  expect(normalizeGroupCode(' ab-cd ef ')).toBe('ABCDEF');
  expect(normalizeGroupCode('٢٣٤xyz')).toBe('234XYZ');
  expect(normalizeGroupCode('ABCDE0')).toBe(''); // 0 and O, 1 and I are not used
  expect(normalizeGroupCode('ABCDEI')).toBe('');
  expect(normalizeGroupCode('ABCDE')).toBe('');
  expect(normalizeGroupCode(42)).toBe('');
  expect(typingGroupCode('ab0c-d۹ezz')).toBe('ABCD9E');
  for (const ch of '0O1I') expect(GROUP_CODE_ALPHABET).not.toContain(ch);
  expect(cleanGroupName('  العائلة   الكبيرة ')).toBe('العائلة الكبيرة');
  expect([...cleanGroupName('أ'.repeat(50))].length).toBe(30);
  expect(isExpoPushToken('ExponentPushToken[abc123_-XYZ]')).toBe(true);
  expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
  expect(isExpoPushToken('fcm:abc')).toBe(false);
});

test('storage: the data folder comes from DATA_DIR or the Railway volume', () => {
  expect(dataLocation({ DATA_DIR: '/d', RAILWAY_VOLUME_MOUNT_PATH: '/v' })).toEqual({ dir: '/d', persistent: true });
  expect(dataLocation({ RAILWAY_VOLUME_MOUNT_PATH: '/v' })).toEqual({ dir: '/v', persistent: true });
  expect(dataLocation({})).toEqual({ dir: './data', persistent: false });
});

test('create: a 6-letter code, the creator as first member', () => {
  const w = world();
  const a = w.phone('p-amal', 'أمل');
  a.send({ t: 'group', a: 'create', name: '  العائلة  ' });
  const g = a.last('group')!.group;
  expect(g.name).toBe('العائلة');
  expect(g.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  expect(g.createdBy).toBe('p-amal');
  expect(g.members.map((m) => [m.id, m.name, m.online])).toEqual([['p-amal', 'أمل', true]]);
  expect(g.playing).toBeNull();
  expect(a.groups().map((x) => x.id)).toEqual([g.id]);

  a.clear();
  a.send({ t: 'group', a: 'create', name: '   ' });
  expect(a.last('error')).toEqual({ t: 'error', code: 'group', message: 'اكتب اسماً للمجموعة' });
});

test('join: by code (any case), idempotent, wrong code refused, members told', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b');
  const [a, b] = phones;
  expect(b.last('group')!.a).toBe('join');
  expect(b.last('group')!.group.id).toBe(g.id);
  expect(a.groups()[0].members.map((m) => m.id)).toEqual(['p-a', 'p-b']);

  b.send({ t: 'group', a: 'join', code: g.code });
  expect(w.store.members(g.id).length).toBe(2);
  expect(b.last('group')!.group.members.length).toBe(2);

  const c = w.phone('p-c');
  c.send({ t: 'group', a: 'join', code: 'ZZZZZZ' });
  expect(c.last('error')).toEqual({ t: 'error', code: 'group', message: 'الرمز غير صحيح' });
  c.send({ t: 'group', a: 'join', code: '12' });
  expect(c.all('error').length).toBe(2);
  expect(c.groups()).toEqual([]);
});

test('limits: 20 groups per phone, 30 members per group', () => {
  const w = world();
  const a = w.phone('p-a');
  for (let i = 0; i < 20; i++) a.send({ t: 'group', a: 'create', name: `مجموعة ${i}` });
  expect(w.store.groupsOf('p-a').length).toBe(20);
  a.clear();
  a.send({ t: 'group', a: 'create', name: 'واحدة أخرى' });
  expect(a.last('error')?.message).toContain('20');
  expect(w.store.groupsOf('p-a').length).toBe(20);

  const code = w.store.groupsOf('p-a')[0].code;
  for (let i = 1; i < 30; i++) w.phone(`m-${i}`).send({ t: 'group', a: 'join', code });
  const gid = w.store.groupsOf('p-a')[0].id;
  expect(w.store.countMembers(gid)).toBe(30);
  const late = w.phone('m-late');
  late.send({ t: 'group', a: 'join', code });
  expect(late.last('error')?.message).toContain('ممتلئة');
  expect(w.store.countMembers(gid)).toBe(30);

  // a phone already in 20 groups can't join a 21st
  const b = w.phone('p-b');
  b.send({ t: 'group', a: 'create', name: 'أخرى' });
  a.clear();
  a.send({ t: 'group', a: 'join', code: b.last('group')!.group.code });
  expect(a.last('error')?.message).toContain('20');
});

test('leave: the creator hands over, the last one out deletes the group', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  a.send({ t: 'group', a: 'leave', id: g.id });
  expect(a.groups()).toEqual([]);
  expect(w.store.group(g.id)!.createdBy).toBe('p-b');
  expect(b.groups()[0].createdBy).toBe('p-b');
  expect(c.groups()[0].members.map((m) => m.id)).toEqual(['p-b', 'p-c']);

  a.send({ t: 'group', a: 'leave', id: g.id });
  expect(a.last('error')?.message).toBe('لست في هذه المجموعة');

  b.send({ t: 'group', a: 'leave', id: g.id });
  c.send({ t: 'group', a: 'leave', id: g.id });
  expect(w.store.group(g.id)).toBeNull();
  expect(w.store.members(g.id)).toEqual([]);
});

test('rename: any member, every member sees it', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b');
  const [a, b] = phones;
  b.send({ t: 'group', a: 'rename', id: g.id, name: 'بيت الجدّة' });
  expect(a.groups()[0].name).toBe('بيت الجدّة');
  expect(w.store.group(g.id)!.name).toBe('بيت الجدّة');
  b.send({ t: 'group', a: 'rename', id: g.id, name: '' });
  expect(b.last('error')?.code).toBe('group');
  const stranger = w.phone('p-x');
  stranger.send({ t: 'group', a: 'rename', id: g.id, name: 'هجوم' });
  expect(stranger.last('error')?.message).toBe('لست في هذه المجموعة');
  expect(w.store.group(g.id)!.name).toBe('بيت الجدّة');
});

test('remove: creator only; the removed phone loses the group', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  b.send({ t: 'group', a: 'remove', id: g.id, player: 'p-c' });
  expect(b.last('error')?.code).toBe('group');
  expect(w.store.isMember(g.id, 'p-c')).toBe(true);

  a.send({ t: 'group', a: 'remove', id: g.id, player: 'p-c' });
  expect(w.store.isMember(g.id, 'p-c')).toBe(false);
  expect(c.groups()).toEqual([]);
  expect(b.groups()[0].members.map((m) => m.id)).toEqual(['p-a', 'p-b']);
  // not themselves (that's «leave»)
  a.send({ t: 'group', a: 'remove', id: g.id, player: 'p-a' });
  expect(w.store.isMember(g.id, 'p-a')).toBe(true);
});

test('persistence: groups survive reopening the database', () => {
  const dir = tempDir();
  const w1 = world({ dir });
  const { g } = family(w1, 'p-a', 'p-b');
  w1.phone('p-a').send({ t: 'push', token: 'ExponentPushToken[aaa]' });
  w1.hub.stop();
  w1.store.close();

  const w2 = world({ dir });
  const back = w2.store.group(g.id)!;
  expect(back.code).toBe(g.code);
  expect(w2.store.members(g.id).map((m) => m.id)).toEqual(['p-a', 'p-b']);
  expect(w2.store.pushToken('p-a')).toBe('ExponentPushToken[aaa]');
  // migrating again changes nothing
  migrate(w2.store.db);
  expect((w2.store.db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(4); // 4: statuses
  expect((w2.store.db.query('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
  const b = w2.phone('p-b');
  b.send({ t: 'groups' });
  expect(b.groups()[0].name).toBe('العائلة');
});

test('presence: members see who has the app open (debounced), profile changes too', async () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b');
  const [a, b] = phones;
  await w.settle();
  expect(a.groups()[0].members.every((m) => m.online)).toBe(true);

  b.close();
  expect(a.groups()[0].members.find((m) => m.id === 'p-b')!.online).toBe(true); // not yet: debounced
  await w.settle();
  expect(a.groups()[0].members.find((m) => m.id === 'p-b')!.online).toBe(false);

  // two phones... the same phone with two sockets: online while one is open
  const b1 = w.phone('p-b');
  const b2 = w.phone('p-b');
  await w.settle();
  b1.close();
  await w.settle();
  expect(a.groups()[0].members.find((m) => m.id === 'p-b')!.online).toBe(true);
  b2.close();
  await w.settle();
  expect(a.groups()[0].members.find((m) => m.id === 'p-b')!.online).toBe(false);

  // a new name reaches the group on the next hello
  const b3 = w.phone('p-b', 'بلال');
  await w.settle();
  expect(a.groups()[0].members.find((m) => m.id === 'p-b')!.name).toBe('بلال');
  expect(w.store.members(g.id)[1].name).toBe('بلال');
  b3.send({ t: 'groups' });
  expect(b3.groups()[0].members.find((m) => m.id === 'p-b')!.online).toBe(true);
});

test('play: a room for the group, a call to those online, a push to those offline', async () => {
  const w = world({ token: 'secret' });
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c', 'p-d');
  const [a, b, c, d] = phones;
  c.send({ t: 'push', token: 'ExponentPushToken[ccc]' });
  b.send({ t: 'push', token: 'ExponentPushToken[bbb]' }); // online: gets the in-app call, no push
  c.close(); // offline with a token → push
  d.close(); // offline without a token → nothing
  await w.settle();
  b.clear();

  a.send({ t: 'group', a: 'play', id: g.id });
  const room = a.room()!;
  expect(room).toBeDefined();
  expect(room.hostId).toBe('p-a');
  expect(room.game).toBe('imposter');
  const v = a.view()!;
  expect(v.group!.id).toBe(g.id);
  expect(v.group!.waiting).toBe(true);
  expect(v.group!.by).toBe('p-a');
  expect(v.group!.expected.map((e) => [e.id, e.inRoom, e.online, !!e.notified])).toEqual([
    ['p-a', true, true, false],
    ['p-b', false, true, false],
    ['p-c', false, false, true],
    ['p-d', false, false, false],
  ]);

  const call = b.last('groupCall')!;
  expect(call).toEqual({ t: 'groupCall', group: { id: g.id, name: 'العائلة' }, code: room.code, by: a.player });
  // the group card says «يلعبون الآن» before the call arrives
  const order = b.ws.msgs.map((m) => m.t);
  expect(order.indexOf('groups')).toBeLessThan(order.indexOf('groupCall'));
  expect(b.groups()[0].playing).toEqual({ code: room.code, by: 'p-a', since: w.clock.now });
  expect(a.last('groupCall')).toBeUndefined();

  await w.settle();
  expect(w.sent.length).toBe(1);
  expect(w.sent[0].url).toBe('https://exp.host/--/api/v2/push/send');
  expect(w.sent[0].auth).toBe('Bearer secret');
  expect(w.sent[0].body).toEqual([
    {
      to: 'ExponentPushToken[ccc]',
      title: 'ألعاب العائلة',
      body: 'دعوة من p-a: «العائلة» تلعب الآن — ادخل!',
      data: { kind: 'groupCall', code: room.code, groupId: g.id },
      channelId: 'group-calls',
      priority: 'high',
      sound: 'default',
    },
  ]);
});

test('play again: the second tap joins the same room, without a second call', async () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  a.send({ t: 'group', a: 'play', id: g.id });
  const code = a.room()!.code;
  b.send({ t: 'group', a: 'play', id: g.id });
  expect(b.room()!.code).toBe(code);
  expect(w.rooms.size).toBe(1);
  expect(c.all('groupCall').length).toBe(1);
  a.send({ t: 'group', a: 'play', id: g.id });
  expect(a.room()!.code).toBe(code);
  expect(c.all('groupCall').length).toBe(1);
});

test('waiting: start is blocked until everyone is in, then it clears by itself', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  a.send({ t: 'group', a: 'play', id: g.id });
  const code = a.room()!.code;
  // picking the game and settings is fine while waiting
  a.roomAction({ type: 'game', game: 'names' });
  expect(a.room()!.game).toBe('names');
  b.send({ t: 'join', code });
  expect(a.view()!.group!.waiting).toBe(true);
  a.roomAction({ type: 'start' });
  expect(a.errors).toContain('بانتظار بقية المجموعة — أو اضغط «ابدأ بالموجودين»');
  expect(a.room()!.status).toBe('lobby');

  c.send({ t: 'group', a: 'play', id: g.id }); // from the group card: «يلعبون الآن — ادخل»
  expect(c.room()!.code).toBe(code);
  expect(a.view()!.group!.waiting).toBe(false);
  expect(a.view()!.group!.expected.every((e) => e.inRoom)).toBe(true);
  a.roomAction({ type: 'start' });
  expect(a.room()!.status).toBe('playing');
});

test('«ابدأ بالموجودين»: the caller or the host only; late members still join', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c', 'p-d');
  const [a, b, c, d] = phones;
  b.send({ t: 'group', a: 'play', id: g.id }); // b calls (b is host)
  const room = b.room()!;
  a.send({ t: 'join', code: room.code });
  c.send({ t: 'join', code: room.code });
  c.roomAction({ type: 'groupGo' }); // neither caller nor host
  expect(room.group!.waiting).toBe(true);
  b.roomAction({ type: 'groupGo' });
  expect(room.group!.waiting).toBe(false);
  expect(a.view()!.group!.waiting).toBe(false);
  b.roomAction({ type: 'start' });
  expect(room.status).toBe('playing');
  d.send({ t: 'join', code: room.code });
  expect(room.players.map((p) => p.id)).toContain('p-d');
});

test('a member leaving the group is no longer waited for', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  a.send({ t: 'group', a: 'play', id: g.id });
  b.send({ t: 'join', code: a.room()!.code });
  expect(a.view()!.group!.waiting).toBe(true);
  c.send({ t: 'group', a: 'leave', id: g.id });
  expect(a.view()!.group!.expected.map((e) => e.id)).toEqual(['p-a', 'p-b']);
  expect(a.view()!.group!.waiting).toBe(false);
});

test('the room emptying ends «playing»; calls are limited to one a minute', async () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  c.send({ t: 'push', token: 'ExponentPushToken[ccc]' });
  c.close();
  await w.settle();

  a.send({ t: 'group', a: 'play', id: g.id });
  const first = a.room()!.code;
  expect(b.all('groupCall').length).toBe(1);
  a.send({ t: 'leave' });
  w.hub.tick();
  expect(b.groups()[0].playing).toBeNull();

  // within the minute: a new room, but nobody is called again
  w.clock.now += 10_000;
  a.send({ t: 'group', a: 'play', id: g.id });
  expect(a.room()!.code).not.toBe(first);
  expect(b.all('groupCall').length).toBe(1);
  await w.settle();
  expect(w.sent.length).toBe(1);
  expect(b.groups()[0].playing?.code).toBe(a.room()!.code);

  // a minute later: called again
  a.send({ t: 'leave' });
  w.hub.tick();
  w.clock.now += CALL_COOLDOWN_MS;
  a.send({ t: 'group', a: 'play', id: g.id });
  expect(b.all('groupCall').length).toBe(2);
  await w.settle();
  expect(w.sent.length).toBe(2);
});

test('a room everyone lost the connection to stops counting after a grace period', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b');
  const [a, b] = phones;
  a.send({ t: 'group', a: 'play', id: g.id });
  a.close();
  w.hub.tick();
  expect(w.hub.groupsFor('p-b')[0].playing).not.toBeNull();
  w.clock.now += IDLE_ROOM_MS;
  w.hub.tick();
  expect(b.groups()[0].playing).toBeNull();
  // the room is gone from the server: same result
  const a2 = w.phone('p-a');
  w.clock.now += CALL_COOLDOWN_MS;
  a2.send({ t: 'group', a: 'play', id: g.id });
  w.rooms.clear();
  w.hub.tick();
  expect(b.groups()[0].playing).toBeNull();
});

test('a group remembers the last game it started', () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b');
  const [a, b] = phones;
  a.send({ t: 'group', a: 'play', id: g.id });
  a.roomAction({ type: 'game', game: 'names' });
  b.send({ t: 'join', code: a.room()!.code });
  a.roomAction({ type: 'start' });
  expect(w.store.group(g.id)!.lastGame).toBe('names');
  a.send({ t: 'leave' });
  b.send({ t: 'leave' });
  w.hub.tick();
  w.clock.now += CALL_COOLDOWN_MS;
  b.send({ t: 'group', a: 'play', id: g.id });
  expect(b.room()!.game).toBe('names');
});

test('push tokens: format checked, dead tokens dropped', async () => {
  const w = world({ ticket: (m) => (m.to === 'ExponentPushToken[dead]' ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : null) });
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  a.send({ t: 'push', token: 'not-a-token' });
  expect(w.store.pushToken('p-a')).toBeNull();
  b.send({ t: 'push', token: 'ExponentPushToken[dead]' });
  c.send({ t: 'push', token: 'ExponentPushToken[live]' });
  // a token moves with the phone: the same token under a new id replaces the old entry
  w.phone('p-c2').send({ t: 'push', token: 'ExponentPushToken[live]' });
  expect(w.store.pushToken('p-c')).toBeNull();
  c.send({ t: 'push', token: 'ExponentPushToken[live]' });
  b.close();
  c.close();
  await w.settle();
  a.send({ t: 'group', a: 'play', id: g.id });
  await w.settle();
  expect(w.sent[0].body.map((m) => m.to)).toEqual(['ExponentPushToken[dead]', 'ExponentPushToken[live]']);
  expect(w.store.pushToken('p-b')).toBeNull();
  expect(w.store.pushToken('p-c')).toBe('ExponentPushToken[live]');
});

test('push failures never break «لنلعب»', async () => {
  const dir = tempDir();
  const store = Store.open(dir);
  const rooms = new Map<string, Room>();
  const warnings: string[] = [];
  const hub = new GroupHub({
    store,
    rooms,
    createRoom: (host, game) => {
      const r = new Room('7777', host, game);
      rooms.set(r.code, r);
      return r;
    },
    fetch: async () => {
      throw new Error('network down');
    },
    log: { log() {}, error() {}, warn: (...a: unknown[]) => warnings.push(a.join(' ')) },
  });
  const sock = new FakeSock();
  const me: PlayerInfo = { id: 'p-a', name: 'أ', avatar: 'cat', color: '#E2475F' };
  hub.hello(sock as unknown as Sock, me);
  hub.handle(sock as unknown as Sock, me, { t: 'group', a: 'create', name: 'ع' });
  const g = (sock.msgs.find((m) => m.t === 'group') as { group: GroupInfo }).group;
  store.addMember(g.id, { id: 'p-b', name: 'ب', avatar: 'cat', color: '#E2475F' }, 1);
  store.setPushToken('p-b', 'ExponentPushToken[bbb]', 1);
  hub.handle(sock as unknown as Sock, me, { t: 'group', a: 'play', id: g.id });
  expect(rooms.get('7777')!.players.length).toBe(1);
  await Promise.all([...hub.inFlight]);
  expect(warnings.join('\n')).toContain('network down');
});

/* ------------------------------------------------------------------ */
/* Through the real server: the wire messages, and a restart            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Status («حالتي»)                                                     */
/* ------------------------------------------------------------------ */

const memberOf = (p: { groups(): GroupInfo[] }, id: string) => p.groups()[0].members.find((m) => m.id === id)!;
/** What the others can see of a member (everything but who they are). */
const looks = (m: GroupInfo['members'][number]) => ({ online: m.online, status: m.status, playing: m.playing });

test('status: the automatic «بعيد» never overrides a chosen status, and ends when the person is back', () => {
  const on = { active: true, idleMs: 0 };
  expect(effectiveStatus('available', on)).toBe('available');
  expect(effectiveStatus('available', { active: false, idleMs: 0 })).toBe('away'); // in the background
  expect(effectiveStatus('available', { active: true, idleMs: AUTO_AWAY_MS - 1 })).toBe('available');
  expect(effectiveStatus('available', { active: true, idleMs: AUTO_AWAY_MS })).toBe('away'); // untouched
  // back (touched / foreground again): «متاح» by itself
  expect(effectiveStatus('available', on)).toBe('available');
  // chosen by hand: stays, whatever happens
  for (const chosen of ['away', 'busy', 'invisible'] as const) {
    expect(effectiveStatus(chosen, on)).toBe(chosen);
    expect(effectiveStatus(chosen, { active: false, idleMs: 0 })).toBe(chosen);
    expect(effectiveStatus(chosen, { active: true, idleMs: AUTO_AWAY_MS * 3 })).toBe(chosen);
  }
  expect(cleanStatus('busy')).toBe('busy');
  for (const bad of ['offline', 'BUSY', '', 'sleeping', 3, null, undefined, {}, ['busy']]) expect(cleanStatus(bad)).toBeNull();
});

test('status: older phones are «متاح»; changes reach the group (debounced) and are remembered; bad values ignored', async () => {
  const w = world();
  const { phones } = family(w, 'p-a', 'p-b');
  const [a, b] = phones;
  await w.settle();
  // no status in the hello (an older app): available
  expect(looks(memberOf(a, 'p-b'))).toEqual({ online: true, status: 'available', playing: undefined });

  b.send({ t: 'status', status: 'busy' });
  expect(memberOf(a, 'p-b').status).toBe('available'); // not yet: debounced
  await w.settle();
  expect(looks(memberOf(a, 'p-b'))).toEqual({ online: true, status: 'busy', playing: undefined });
  expect(w.store.status('p-b')).toBe('busy');
  b.send({ t: 'status', status: 'away' });
  await w.settle();
  expect(memberOf(a, 'p-b').status).toBe('away');

  // the same status again, or a bad value: nothing changes, nothing is sent
  a.clear();
  b.send({ t: 'status', status: 'away' });
  for (const bad of ['offline', 'sleeping', 7, null, { s: 'busy' }]) b.send({ t: 'status', status: bad as never });
  await w.settle();
  expect(a.all('groups').length).toBe(0);
  expect(b.errors).toEqual([]);
  expect(w.store.status('p-b')).toBe('away');

  // a status in the hello; a bad one counts as none
  b.close();
  await w.settle();
  expect(memberOf(a, 'p-b').status).toBe('offline');
  const b2 = w.phone('p-b', 'p-b', 'busy');
  await w.settle();
  expect(memberOf(a, 'p-b').status).toBe('busy');
  b2.close();
  w.phone('p-b', 'p-b', 'nap' as never);
  await w.settle();
  expect(memberOf(a, 'p-b').status).toBe('available');
  // a status from a socket that never said hello is ignored
  const stranger = new FakeSock() as unknown as Sock;
  w.hub.setStatus(stranger, b.player, 'busy');
  await w.settle();
  expect(memberOf(a, 'p-b').status).toBe('available');
});

test('status: «غير مرئي» looks exactly like a closed app — member list, waiting list, «في لعبة», «أُرسل إشعار»', async () => {
  const w = world();
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c', 'p-d');
  const [a, b, c, d] = phones;
  b.send({ t: 'push', token: 'ExponentPushToken[bbb]' });
  c.send({ t: 'push', token: 'ExponentPushToken[ccc]' });
  await w.settle();
  expect(memberOf(a, 'p-b').online).toBe(true);

  b.send({ t: 'status', status: 'invisible' });
  c.close(); // the app closed, for comparison
  await w.settle();
  expect(looks(memberOf(a, 'p-b'))).toEqual({ online: false, status: 'offline', playing: undefined });
  expect(looks(memberOf(a, 'p-b'))).toEqual(looks(memberOf(a, 'p-c')));
  // they still use the app: their own list arrives
  b.send({ t: 'groups' });
  expect(b.groups()[0].members.length).toBe(4);

  // closing the app while invisible, or opening it invisible: the others are told nothing
  a.clear();
  b.close();
  await w.settle();
  const b2 = w.phone('p-b', 'p-b', 'invisible');
  await w.settle();
  expect(a.all('groups').length).toBe(0);
  a.send({ t: 'groups' });
  expect(looks(memberOf(a, 'p-b'))).toEqual(looks(memberOf(a, 'p-c')));

  // playing somewhere else: no «في لعبة» either
  const other = new Room('5555', d.player, 'xo');
  w.rooms.set(other.code, other);
  d.send({ t: 'join', code: '5555' });
  b2.send({ t: 'join', code: '5555' });
  d.roomAction({ type: 'start' });
  expect(other.status).toBe('playing');
  w.hub.tick();
  await w.settle();
  expect(memberOf(a, 'p-d').playing).toBe(true);
  expect(memberOf(a, 'p-b').playing).toBeUndefined();
  expect(looks(memberOf(a, 'p-b'))).toEqual({ online: false, status: 'offline', playing: undefined });

  // «لنلعب»: the waiting list shows them like the closed app (a push went to both)
  b2.send({ t: 'leave' });
  a.send({ t: 'group', a: 'play', id: g.id });
  const ex = a.view()!.group!.expected;
  const strip = (e: (typeof ex)[number]) => ({ online: e.online, inRoom: e.inRoom, notified: e.notified, status: e.status, playing: e.playing });
  expect(strip(ex.find((e) => e.id === 'p-b')!)).toEqual({ online: false, inRoom: false, notified: true, status: 'offline', playing: undefined });
  expect(strip(ex.find((e) => e.id === 'p-b')!)).toEqual(strip(ex.find((e) => e.id === 'p-c')!));
  expect(ex.find((e) => e.id === 'p-d')!.playing).toBe(true);
  // ...and they still got the invitation, in the app and as a push
  expect(b2.last('groupCall')?.code).toBe(a.room()!.code);
  await w.settle();
  expect(w.sent.flatMap((x) => x.body.map((m) => m.to)).sort()).toEqual(['ExponentPushToken[bbb]', 'ExponentPushToken[ccc]']);
  // coming into the room shows them, as anyone in the room
  b2.send({ t: 'join', code: a.room()!.code });
  const inRoom = a.view()!.group!.expected.find((e) => e.id === 'p-b')!;
  expect([inRoom.inRoom, inRoom.online, inRoom.status]).toEqual([true, true, 'available']);
});

test('status: «مشغول» gets no call and no push and shows as busy in the waiting list, even with the app closed', async () => {
  const dir = tempDir();
  const w = world({ dir });
  const { phones, g } = family(w, 'p-a', 'p-b', 'p-c', 'p-d', 'p-e');
  const [a, b, c, d, e] = phones;
  for (const p of [b, c, d, e]) p.send({ t: 'push', token: `ExponentPushToken[${p.player.id}]` });
  b.send({ t: 'status', status: 'busy' }); // busy, app open
  c.send({ t: 'status', status: 'busy' });
  c.close(); // busy, then closed the app
  d.send({ t: 'status', status: 'away' }); // away: the call and a push
  await w.settle();
  for (const p of [b, d, e]) p.clear();

  a.send({ t: 'group', a: 'play', id: g.id });
  const code = a.room()!.code;
  const ex = a.view()!.group!.expected.map((x) => [x.id, x.online, x.status, !!x.notified]);
  expect(ex).toEqual([
    ['p-a', true, 'available', false],
    ['p-b', true, 'busy', false],
    ['p-c', false, 'busy', false],
    ['p-d', true, 'away', true],
    ['p-e', true, 'available', false],
  ]);
  expect(b.last('groupCall')).toBeUndefined();
  expect(d.last('groupCall')?.code).toBe(code);
  expect(e.last('groupCall')?.code).toBe(code);
  await w.settle();
  expect(w.sent.flatMap((x) => x.body.map((m) => m.to))).toEqual(['ExponentPushToken[p-d]']);
  // they still see the group playing, and the caller can start without them
  expect(b.groups()[0].playing?.code).toBe(code);
  a.roomAction({ type: 'groupGo' });
  expect(a.view()!.group!.waiting).toBe(false);
  // a busy member can still come in
  b.send({ t: 'join', code });
  expect(b.room()?.code).toBe(code);

  // «مشغول» with the app closed survives a restart of the server
  w.hub.stop();
  w.store.close();
  const w2 = world({ dir });
  expect(w2.store.status('p-c')).toBe('busy');
  expect(w2.hub.isBusy('p-c')).toBe(true);
  // ...until the phone comes back with another status
  w2.phone('p-c', 'p-c', 'available');
  expect(w2.hub.isBusy('p-c')).toBe(false);
});

test('«في لعبة»: set while the person\'s room is playing, cleared after (and when they drop out)', async () => {
  const w = world();
  const { phones } = family(w, 'p-a', 'p-b', 'p-c');
  const [a, b, c] = phones;
  const room = new Room('6666', b.player, 'xo');
  w.rooms.set(room.code, room);
  b.send({ t: 'join', code: '6666' });
  c.send({ t: 'join', code: '6666' });
  w.hub.tick();
  await w.settle();
  expect(memberOf(a, 'p-b').playing).toBeUndefined(); // in the room's lobby: not yet

  b.roomAction({ type: 'start' });
  w.hub.tick();
  await w.settle();
  expect([memberOf(a, 'p-b').playing, memberOf(a, 'p-c').playing, memberOf(a, 'p-a').playing]).toEqual([true, true, undefined]);
  // busy and playing: both shown
  c.send({ t: 'status', status: 'busy' });
  await w.settle();
  expect(looks(memberOf(a, 'p-c'))).toEqual({ online: true, status: 'busy', playing: true });

  // c's connection drops: no longer in a game (and offline)
  c.close();
  w.hub.tick();
  await w.settle();
  expect(looks(memberOf(a, 'p-c'))).toEqual({ online: false, status: 'offline', playing: undefined });

  // back to the room's lobby: the hint goes
  b.roomAction({ type: 'lobby' });
  w.hub.tick();
  await w.settle();
  expect(memberOf(a, 'p-b').playing).toBeUndefined();
});

async function freePort() {
  const s = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = s.port!;
  s.stop(true);
  return port;
}

async function startServer(port: number, dataDir: string): Promise<Subprocess> {
  const proc = Bun.spawn(['bun', 'run', `${import.meta.dir}/index.ts`], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdout: 'ignore',
    stderr: 'inherit',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return proc;
    } catch {}
    await Bun.sleep(100);
  }
  proc.kill();
  throw new Error('server did not start');
}

class WirePhone {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(
    readonly port: number,
    readonly id: string,
    readonly name: string,
  ) {}
  async connect(status?: unknown) {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
    await new Promise<void>((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
    });
    this.ws.onmessage = (ev) => this.msgs.push(JSON.parse(String(ev.data)));
    const hello = { t: 'hello', player: { id: this.id, name: this.name, avatar: 'cat', color: '#2FB67C' } } as ClientMsg;
    this.send(status === undefined ? hello : ({ ...hello, status } as ClientMsg));
    await this.until('welcome');
    return this;
  }
  send(msg: ClientMsg) {
    this.ws.send(JSON.stringify(msg));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.msgs.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
  async until<T extends ServerMsg['t']>(t: T, ok: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true) {
    for (let i = 0; i < 100; i++) {
      const m = this.msgs.filter((x) => x.t === t).reverse().find((x) => ok(x as Extract<ServerMsg, { t: T }>));
      if (m) return m as Extract<ServerMsg, { t: T }>;
      await Bun.sleep(30);
    }
    throw new Error(`no ${t} for ${this.id}`);
  }
}

test('wire: create, join, presence, «لنلعب», groupGo — and the groups are still there after a restart', async () => {
  const dataDir = tempDir();
  const port = await freePort();
  let proc = await startServer(port, dataDir);
  try {
    const a = await new WirePhone(port, 'wire-a', 'سارة').connect();
    const b = await new WirePhone(port, 'wire-b', 'يوسف').connect();
    a.send({ t: 'group', a: 'create', name: 'العائلة' });
    const g = (await a.until('group')).group;
    b.send({ t: 'group', a: 'join', code: g.code.toLowerCase() });
    expect((await b.until('group')).group.id).toBe(g.id);
    await a.until('groups', (m) => m.groups[0]?.members.length === 2 && m.groups[0].members.every((x) => x.online));
    b.send({ t: 'group', a: 'join', code: 'QQQQQQ' });
    expect((await b.until('error')).message).toBe('الرمز غير صحيح');

    a.send({ t: 'group', a: 'play', id: g.id });
    const st = await a.until('state', (m) => !!m.room.group);
    expect(st.room.group!.waiting).toBe(true);
    const call = await b.until('groupCall');
    expect(call.code).toBe(st.room.code);
    expect(call.by.name).toBe('سارة');
    a.send({ t: 'room', action: { type: 'start' } });
    expect((await a.until('error')).message).toContain('بانتظار بقية المجموعة');
    a.send({ t: 'room', action: { type: 'groupGo' } });
    await a.until('state', (m) => m.room.group?.waiting === false);
    b.send({ t: 'join', code: call.code });
    await b.until('state', (m) => m.room.code === call.code);
    a.ws.close();
    b.ws.close();
  } finally {
    proc.kill();
    await proc.exited;
  }

  proc = await startServer(port, dataDir);
  try {
    const b = await new WirePhone(port, 'wire-b', 'يوسف').connect();
    b.send({ t: 'groups' });
    const list = await b.until('groups');
    expect(list.groups.map((x) => [x.name, x.members.length, x.playing])).toEqual([['العائلة', 2, null]]);
    b.ws.close();
  } finally {
    proc.kill();
    await proc.exited;
  }
}, 30_000);

test('wire: the status in the hello and in its own message; an older app is «متاح»; bad values ignored', async () => {
  const dataDir = tempDir();
  const port = await freePort();
  const proc = await startServer(port, dataDir);
  try {
    const a = await new WirePhone(port, 'wire-sa', 'سارة').connect('available');
    const b = await new WirePhone(port, 'wire-sb', 'يوسف').connect('busy');
    a.send({ t: 'group', a: 'create', name: 'العائلة' });
    const g = (await a.until('group')).group;
    b.send({ t: 'group', a: 'join', code: g.code });
    await a.until('groups', (m) => m.groups[0]?.members.find((x) => x.id === 'wire-sb')?.status === 'busy');
    b.send({ t: 'status', status: 'invisible' });
    await a.until('groups', (m) => m.groups[0]?.members.find((x) => x.id === 'wire-sb')?.online === false);
    b.send({ t: 'status', status: 'bogus' } as never);
    b.send({ t: 'status', status: 'away' });
    const seen = await a.until('groups', (m) => m.groups[0]?.members.find((x) => x.id === 'wire-sb')?.status === 'away');
    expect(seen.groups[0].members.find((x) => x.id === 'wire-sb')!.online).toBe(true);
    // an older app: no status at all
    b.ws.close();
    const old = await new WirePhone(port, 'wire-sb', 'يوسف').connect();
    await a.until('groups', (m) => {
      const x = m.groups[0]?.members.find((y) => y.id === 'wire-sb');
      return x?.online === true && x.status === 'available';
    });
    const bad = await new WirePhone(port, 'wire-sc', 'ليلى').connect({ evil: true });
    expect(bad.last('welcome')).toBeDefined();
    a.ws.close();
    old.ws.close();
    bad.ws.close();
  } finally {
    proc.kill();
    await proc.exited;
  }
}, 30_000);
