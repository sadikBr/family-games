/**
 * Reactions («التفاعلات»): only keys from the fixed list, a rate limit per person, relayed to everyone in
 * the room (and only that room), never kept in the room's view.
 *   bun test server/reactions.test.ts
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Subprocess } from 'bun';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClientMsg, PlayerInfo, RoomView, ServerMsg } from '../src/shared/protocol';
import { REACTION_KEYS, reactionAllowed, reactionWait } from '../src/shared/reactions';
import { Room, type Sock } from './room';

class FakeSock {
  data: { player: PlayerInfo | null; code: string | null } = { player: null, code: null };
  msgs: ServerMsg[] = [];
  send(raw: string) {
    this.msgs.push(JSON.parse(raw));
  }
  close() {}
  reactions() {
    return this.msgs.filter((m): m is Extract<ServerMsg, { t: 'reaction' }> => m.t === 'reaction');
  }
}

const person = (id: string): PlayerInfo => ({ id, name: id, avatar: 'cat', color: '#E2475F' });

function makeRoom(code: string, ids: string[]) {
  const r = new Room(code, person(ids[0]), 'quiz');
  const socks = new Map<string, FakeSock>();
  for (const id of ids) {
    const s = new FakeSock();
    socks.set(id, s);
    r.join(person(id), s as unknown as Sock);
  }
  return { r, socks };
}

test('the rate rule: one every 3 s, at most 3 in 15 s', () => {
  let times: number[] = [];
  const at = (now: number) => {
    const res = reactionAllowed(times, now);
    times = res.times;
    return res.ok;
  };
  expect(at(0)).toBe(true);
  expect(at(1000)).toBe(false); // too soon
  expect(at(2999)).toBe(false);
  expect(at(3000)).toBe(true);
  expect(at(6000)).toBe(true);
  expect(reactionWait(times, 9000)).toBe(6000); // 3 in the window: wait until the first leaves it
  expect(at(9000)).toBe(false); // a 4th within 15 s
  expect(at(14999)).toBe(false);
  expect(at(15000)).toBe(true);
  expect(reactionWait(times, 15000)).toBe(3000);
  expect(reactionWait(times, 40000)).toBe(0);
});

test('a valid reaction goes to everyone in the room, the sender too', () => {
  const { r, socks } = makeRoom('1111', ['mama', 'baba', 'sara']);
  expect(r.react('baba', 'heart', 10_000)).toBe(true);
  for (const s of socks.values()) {
    const got = s.reactions();
    expect(got).toHaveLength(1);
    expect(got[0].by).toBe('baba');
    expect(got[0].key).toBe('heart');
  }
  // every key of the fixed list is accepted (one per person, spaced out)
  let now = 100_000;
  for (const k of REACTION_KEYS) {
    now += 6000;
    expect(r.react('mama', k, now)).toBe(true);
  }
  expect(socks.get('sara')!.reactions()).toHaveLength(1 + REACTION_KEYS.length);
  // ids grow, so a phone can tell two of the same apart
  const ids = socks.get('sara')!.reactions().map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('unknown keys and free text are refused', () => {
  const { r, socks } = makeRoom('2222', ['mama', 'baba']);
  for (const bad of ['', 'kiss', 'HEART', 'برافو!', '<script>', 42, null, undefined, { key: 'heart' }, ['heart']]) {
    expect(r.react('mama', bad, 10_000)).toBe(false);
  }
  expect(socks.get('baba')!.reactions()).toHaveLength(0);
  // a refused key doesn't count against the limit
  expect(r.react('mama', 'fire', 10_000)).toBe(true);
});

test('the rate limit is per person and enforced by the server', () => {
  const { r, socks } = makeRoom('3333', ['mama', 'baba']);
  expect(r.react('mama', 'laugh', 0)).toBe(true);
  expect(r.react('mama', 'laugh', 500)).toBe(false);
  expect(r.react('baba', 'laugh', 500)).toBe(true); // someone else isn't held back
  expect(r.react('mama', 'clap', 3000)).toBe(true);
  expect(r.react('mama', 'clap', 6000)).toBe(true);
  expect(r.react('mama', 'clap', 9500)).toBe(false); // 4th within 15 s
  expect(r.react('mama', 'clap', 15000)).toBe(true);
  expect(socks.get('baba')!.reactions().filter((m) => m.by === 'mama')).toHaveLength(4);
});

test('only people in the room: not other rooms, not bots, not someone who left', () => {
  const a = makeRoom('4444', ['mama', 'baba']);
  const b = makeRoom('5555', ['khalid', 'nora']);
  a.r.roomAction('mama', { type: 'addBot' });
  const bot = a.r.players.find((p) => p.bot)!;
  expect(a.r.react('mama', 'party', 0)).toBe(true);
  for (const s of b.socks.values()) expect(s.reactions()).toHaveLength(0);
  expect(a.r.react(bot.id, 'party', 10_000)).toBe(false);
  expect(a.r.react('khalid', 'party', 10_000)).toBe(false); // not a member of this room
  a.r.leave('baba');
  expect(a.r.react('baba', 'party', 20_000)).toBe(false);
  expect(a.socks.get('mama')!.reactions()).toHaveLength(1);
});

test('a reaction is not part of the room view (nothing to replay on reconnect)', () => {
  const { r, socks } = makeRoom('6666', ['mama', 'baba']);
  r.roomAction('mama', { type: 'start' });
  const before = JSON.stringify(r.viewFor('baba'));
  const states = socks.get('baba')!.msgs.filter((m) => m.t === 'state').length;
  expect(r.react('mama', 'bravo', 0)).toBe(true);
  // no new state was broadcast for it, and the view doesn't mention it
  expect(socks.get('baba')!.msgs.filter((m) => m.t === 'state').length).toBe(states);
  const after = JSON.stringify(r.viewFor('baba'));
  expect(after.includes('bravo')).toBe(false);
  expect(after.includes('reaction')).toBe(false);
  expect(after.length).toBe(before.length);
  // coming back: the state that is sent carries no reaction
  const again = new FakeSock();
  r.join(person('baba'), again as unknown as Sock);
  expect(again.reactions()).toHaveLength(0);
  expect(JSON.stringify(again.msgs).includes('bravo')).toBe(false);
});

/* ---------------------------------------------------------------- */
/* Through the real server                                           */
/* ---------------------------------------------------------------- */

const PORT = 5797;
let proc: Subprocess;
const DATA_DIR = mkdtempSync(join(tmpdir(), 'fg-reactions-test-'));

beforeAll(async () => {
  proc = Bun.spawn(['bun', 'run', `${import.meta.dir}/index.ts`], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdout: 'ignore',
    stderr: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error('server did not start');
});

afterAll(() => {
  proc.kill();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

class Phone {
  ws!: WebSocket;
  room: RoomView | null = null;
  msgs: ServerMsg[] = [];
  constructor(public id: string) {}
  async connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'state') this.room = m.room;
    };
    await new Promise((res) => (this.ws.onopen = res));
    this.send({ t: 'hello', player: person(this.id) });
  }
  send(m: ClientMsg | Record<string, unknown>) {
    this.ws.send(JSON.stringify(m));
  }
  reactions() {
    return this.msgs.filter((m): m is Extract<ServerMsg, { t: 'reaction' }> => m.t === 'reaction');
  }
}

async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await Bun.sleep(20);
  }
}

test('end to end: relayed in the room, refused outside it, limited, no error sent back', async () => {
  const mama = new Phone('r-mama');
  const baba = new Phone('r-baba');
  const other = new Phone('r-other');
  await Promise.all([mama.connect(), baba.connect(), other.connect()]);
  // outside any room: quietly ignored
  other.send({ t: 'react', key: 'heart' });
  mama.send({ t: 'create', game: 'quiz' });
  await until(() => !!mama.room);
  baba.send({ t: 'join', code: mama.room!.code });
  other.send({ t: 'create', game: 'xo' });
  await until(() => baba.room?.players.length === 2 && !!other.room);

  baba.send({ t: 'react', key: 'fire' });
  await until(() => mama.reactions().length === 1 && baba.reactions().length === 1);
  expect(mama.reactions()[0]).toMatchObject({ by: 'r-baba', key: 'fire' });

  // too soon, and a made-up key: nothing, and no error message either
  baba.send({ t: 'react', key: 'clap' });
  mama.send({ t: 'react', key: 'kiss' });
  mama.send({ t: 'react', key: 'برافو' });
  mama.send({ t: 'react' });
  mama.send({ t: 'react', key: 'mashallah' });
  await until(() => baba.reactions().length === 2);
  await Bun.sleep(200);
  expect(baba.reactions().map((m) => m.key)).toEqual(['fire', 'mashallah']);
  expect(mama.msgs.some((m) => m.t === 'error')).toBe(false);
  expect(baba.msgs.some((m) => m.t === 'error')).toBe(false);
  // the other room heard nothing
  expect(other.reactions()).toHaveLength(0);

  for (const p of [mama, baba, other]) p.ws.close();
});
