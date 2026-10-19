/**
 * End-to-end tests: spins up the real server and plays every game with fake phones.
 *   bun test server
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Subprocess } from 'bun';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  BattleshipView,
  KharbgaView,
  MemoryView,
  SudokuView,
  XoView,
  ChessView,
  Connect4View,
  KdabView,
  WaveView,
  WordleView,
  HajjView,
  HuroofView,
  LaddersView,
  McqView,
  WhoisView,
  EstateView,
  ClientMsg,
  GameAction,
  HeadsUpView,
  ImposterView,
  KanzaView,
  KonkanView,
  NamesView,
  PotatoView,
  RondaView,
  RoomView,
  ServerMsg,
  TabooView,
  TrisView,
  UnoView,
  CodenamesView,
  DamaView,
  DrawView,
  LudoView,
  WerewolfView,
} from '../src/shared/protocol';
import { colorsOf } from '../src/shared/uno';

const PORT = 5799;
let proc: Subprocess;
/** the groups database goes to a throw-away folder */
const DATA_DIR = mkdtempSync(join(tmpdir(), 'fg-server-test-'));

beforeAll(async () => {
  proc = Bun.spawn(['bun', 'run', `${import.meta.dir}/index.ts`], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, BOT_SPEED: process.env.BOT_SPEED ?? '1', AUTOPILOT_MS: '1500', HOST_HANDOVER_MS: '1200' },
    stdout: 'ignore',
    stderr: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return;
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
  errors: string[] = [];
  other: ServerMsg[] = []; // voice messages
  constructor(public id: string, public name: string) {}

  async connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise<void>((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      if (msg.t === 'state') this.room = msg.room;
      if (msg.t === 'error') this.errors.push(msg.message);
      if (msg.t === 'left') this.room = null;
      if (msg.t === 'signal' || msg.t === 'voiceConfig') this.other.push(msg);
    };
    this.send({ t: 'hello', player: { id: this.id, name: this.name, avatar: '🦊', color: '#FF0000' } });
  }
  send(msg: ClientMsg) {
    this.ws.send(JSON.stringify(msg));
  }
  act(action: GameAction) {
    this.send({ t: 'act', action });
  }
  view<T>() {
    return this.room?.view as T;
  }
}

const settle = (ms = 80) => Bun.sleep(ms);

async function makeRoom(n: number, game: RoomView['game']) {
  const phones = Array.from({ length: n }, (_, i) => new Phone(`player-${game}-${i}`, `لاعب ${i}`));
  for (const p of phones) await p.connect();
  phones[0].send({ t: 'create', game });
  await settle();
  const code = phones[0].room!.code;
  expect(code).toMatch(/^\d{4}$/);
  for (const p of phones.slice(1)) p.send({ t: 'join', code });
  await settle();
  for (const p of phones) expect(p.room?.players.length).toBe(n);
  return { phones, host: phones[0], code };
}

test('join errors for a wrong code', async () => {
  const p = new Phone('lonely-phone', 'x');
  await p.connect();
  p.send({ t: 'join', code: '0000' });
  await settle();
  expect(p.errors.length).toBe(1);
});

test('imposter: full round, secrets are private', async () => {
  const { phones, host } = await makeRoom(5, 'imposter');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const views = phones.map((p) => p.view<ImposterView>());
  const imposters = views.filter((v) => v.secret?.role === 'imposter');
  const civilians = views.filter((v) => v.secret?.role === 'civilian');
  expect(imposters.length).toBe(1);
  expect(civilians.length).toBe(4);
  const words = new Set(civilians.map((v) => (v.secret as { word: string }).word));
  expect(words.size).toBe(1);
  // imposter's view never contains the word
  expect(JSON.stringify(imposters[0])).not.toContain([...words][0]);
  // first clue giver is a civilian
  const impId = phones[views.indexOf(imposters[0])].id;
  expect(views[0].order[0]).not.toBe(impId);

  for (const p of phones) p.act({ type: 'ready' });
  await settle();
  expect(host.view<ImposterView>().phase).toBe('clues');
  host.act({ type: 'toVote' });
  await settle();
  // everyone votes the imposter (imposter votes someone else)
  for (const p of phones) p.act({ type: 'vote', target: p.id === impId ? phones.find((x) => x.id !== impId)!.id : impId });
  await settle();
  expect(host.view<ImposterView>().phase).toBe('guess');
  const impPhone = phones.find((p) => p.id === impId)!;
  const opts = impPhone.view<ImposterView>().guessOptions!;
  expect(opts).toContain([...words][0]);
  // only the accused imposter sees the options
  expect(phones.find((p) => p.id !== impId)!.view<ImposterView>().guessOptions).toBeNull();
  impPhone.act({ type: 'guess', word: opts.find((w) => w !== [...words][0])! });
  await settle();
  const r = host.view<ImposterView>().result!;
  expect(r.winners).toBe('civilians');
  expect(host.view<ImposterView>().scores[impId]).toBe(0);
  host.act({ type: 'next' });
  await settle();
  expect(host.view<ImposterView>().round).toBe(2);
});

test('heads up: countdown, marking from other phones, stale taps ignored', async () => {
  const { phones, host } = await makeRoom(3, 'headsup');
  host.send({ t: 'room', action: { type: 'settings', game: 'headsup', patch: { seconds: 30 } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<HeadsUpView>();
  expect(v.phase).toBe('ready');
  const guesser = phones.find((p) => p.id === v.guesserId)!;
  guesser.act({ type: 'start' });
  await Bun.sleep(3800);
  v = host.view<HeadsUpView>();
  expect(v.phase).toBe('play');
  const idx = v.card!.index;
  const watchers = phones.filter((p) => p !== guesser);
  // two phones tap "correct" on the same card at once -> counted once
  watchers[0].act({ type: 'mark', index: idx, ok: true });
  watchers[1].act({ type: 'mark', index: idx, ok: true });
  await settle();
  v = host.view<HeadsUpView>();
  expect(v.history.length).toBe(1);
  expect(v.scores[guesser.id]).toBe(1);
  host.act({ type: 'endTurn' });
  await settle();
  expect(host.view<HeadsUpView>().phase).toBe('turnEnd');
  host.act({ type: 'next' });
  await settle();
  expect(host.view<HeadsUpView>().turn).toBe(2);
}, 10000);

test('taboo: teammates cannot see the card, opponents can buzz', async () => {
  const { phones, host } = await makeRoom(4, 'taboo');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  host.act({ type: 'begin' });
  await settle();
  let v = host.view<TabooView>();
  expect(v.phase).toBe('ready');
  const describer = phones.find((p) => p.id === v.describerId)!;
  describer.act({ type: 'start' });
  await settle();
  v = describer.view<TabooView>();
  const team = v.teams[v.activeTeam];
  const mate = phones.find((p) => team.includes(p.id) && p !== describer)!;
  const opp = phones.find((p) => !team.includes(p.id))!;
  expect(describer.view<TabooView>().card).not.toBeNull();
  expect(mate.view<TabooView>().card).toBeNull();
  expect(opp.view<TabooView>().card?.word).toBe(describer.view<TabooView>().card!.word);
  // teammate cannot buzz, opponent can
  mate.act({ type: 'buzz', index: v.card!.index });
  await settle();
  expect(host.view<TabooView>().history.length).toBe(0);
  opp.act({ type: 'buzz', index: v.card!.index });
  await settle();
  expect(host.view<TabooView>().teamScores[v.activeTeam]).toBe(-1);
  describer.act({ type: 'ok', index: describer.view<TabooView>().card!.index });
  await settle();
  expect(host.view<TabooView>().teamScores[v.activeTeam]).toBe(0);
});

test('hot potato: throwing rules and explosion', async () => {
  const { phones, host } = await makeRoom(3, 'potato');
  host.send({ t: 'room', action: { type: 'settings', game: 'potato', patch: { minFuse: 5, maxFuse: 10, rounds: 1 } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<PotatoView>();
  const holder = () => phones.find((p) => p.id === host.view<PotatoView>().holderId)!;
  holder().act({ type: 'start' });
  await settle();
  expect(host.view<PotatoView>().phase).toBe('play');
  // throwing instantly is refused
  const h1 = holder();
  const target = phones.find((p) => p !== h1)!;
  h1.act({ type: 'throw', to: target.id });
  await settle();
  expect(h1.errors.at(-1)).toContain('قل كلمة');
  await Bun.sleep(750);
  h1.act({ type: 'throw', to: target.id });
  await settle();
  expect(host.view<PotatoView>().holderId).toBe(target.id);
  // cannot throw straight back with 3 players
  await Bun.sleep(750);
  target.act({ type: 'throw', to: h1.id });
  await settle();
  expect(host.view<PotatoView>().holderId).toBe(target.id);
  await Bun.sleep(10500);
  v = host.view<PotatoView>();
  expect(v.phase).toBe('boom');
  expect(v.burns[v.loserId!]).toBe(1);
  host.act({ type: 'next' });
  await settle();
  expect(host.view<PotatoView>().phase).toBe('final');
}, 20000);

test('werewolf: narrator sees everything, players only their role', async () => {
  const { phones, host } = await makeRoom(7, 'werewolf');
  const narrator = phones[2];
  host.send({ t: 'room', action: { type: 'settings', game: 'werewolf', patch: { narratorId: narrator.id, hunter: true } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const nv = narrator.view<WerewolfView>();
  expect(nv.narrator).not.toBeNull();
  expect(nv.myRole).toBeNull();
  expect(Object.keys(nv.narrator!.roles).length).toBe(6);
  const roles = nv.narrator!.roles;
  const wolves = Object.keys(roles).filter((id) => roles[id] === 'wolf');
  expect(wolves.length).toBe(2);
  for (const p of phones) {
    if (p === narrator) continue;
    const v = p.view<WerewolfView>();
    expect(v.narrator).toBeNull();
    expect(v.revealed).toBeNull();
    expect(v.myRole).toBe(roles[p.id]);
    if (v.myRole === 'wolf') expect(v.wolfPack).toEqual(wolves.filter((w) => w !== p.id));
    else expect(v.wolfPack).toBeNull();
  }
  // non-narrator cannot control
  host.act({ type: 'next' });
  await settle();
  expect(host.errors.at(-1)).toContain('الراوي');

  const villagers = Object.keys(roles).filter((id) => roles[id] !== 'wolf' && roles[id] !== 'hunter');
  const step = () => narrator.view<WerewolfView>().narrator!.step;
  narrator.act({ type: 'next' }); // sleep -> wolves
  await settle();
  expect(step()).toBe('wolves');
  narrator.act({ type: 'pick', target: villagers[0] });
  await settle();
  while (step() !== 'wake') {
    narrator.act({ type: 'next' });
    await settle(40);
  }
  narrator.act({ type: 'next' });
  await settle();
  const pv = phones[0].view<WerewolfView>();
  expect(pv.phase).toBe('day');
  // doctor may or may not have saved (no pick) -> victim died
  expect(pv.lastDeaths).toEqual([villagers[0]]);
  expect(pv.alive[villagers[0]]).toBe(false);
  narrator.act({ type: 'next' }); // announce -> vote
  await settle();
  // village votes out both wolves over two days
  narrator.act({ type: 'eliminate', target: wolves[0] });
  await settle();
  expect(narrator.view<WerewolfView>().phase).toBe('night');
  narrator.act({ type: 'end' });
  await settle();
  const over = phones[0].view<WerewolfView>();
  expect(over.phase).toBe('over');
  expect(over.revealed).not.toBeNull();
});

test('reconnect keeps your seat, leaving transfers host', async () => {
  const { phones, host, code } = await makeRoom(3, 'imposter');
  phones[1].ws.close();
  await settle(150);
  expect(host.room!.players.find((p) => p.id === phones[1].id)?.connected).toBe(false);
  await phones[1].connect();
  phones[1].send({ t: 'join', code });
  await settle();
  expect(host.room!.players.length).toBe(3);
  expect(host.room!.players.find((p) => p.id === phones[1].id)?.connected).toBe(true);
  host.send({ t: 'leave' });
  await settle();
  expect(phones[1].room!.hostId).toBe(phones[1].id);
});

/* ------------------------------------------------------------------ */
/* Bots & اسم ولد اسم بنت                                              */
/* ------------------------------------------------------------------ */

async function roomWithBots(humans: number, bots: number, game: RoomView['game']) {
  const { phones, host, code } = await makeRoom(humans, game);
  for (let i = 0; i < bots; i++) host.send({ t: 'room', action: { type: 'addBot' } });
  await settle();
  expect(host.room!.players.filter((p) => p.bot).length).toBe(bots);
  return { phones, host, code };
}

test('only the host can add bots; bots never play Heads Up', async () => {
  const { phones, host } = await makeRoom(2, 'headsup');
  phones[1].send({ t: 'room', action: { type: 'addBot' } });
  await settle();
  expect(host.room!.players.length).toBe(2);
  host.send({ t: 'room', action: { type: 'addBot' } });
  host.send({ t: 'room', action: { type: 'addBot' } });
  await settle();
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const v = host.view<HeadsUpView>();
  expect(v.participants.length).toBe(2); // bots sit this one out
  expect(v.participants.every((id) => !id.startsWith('bot-'))).toBe(true);
});

test('imposter with bots: bots get ready, give clues and vote', async () => {
  const { host } = await roomWithBots(1, 3, 'imposter');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  host.act({ type: 'ready' });
  await Bun.sleep(3800);
  let v = host.view<ImposterView>();
  expect(v.phase).toBe('clues');
  expect(Object.keys(v.botClues).length).toBe(3);
  for (const c of Object.values(v.botClues)) expect(c.length).toBeGreaterThan(0);
  host.act({ type: 'toVote' });
  await settle();
  host.act({ type: 'vote', target: v.participants.find((id) => id !== host.id)! });
  // bots vote; a caught bot imposter then has time to guess the word
  for (let i = 0; i < 160 && host.view<ImposterView>().phase !== 'result'; i++) await Bun.sleep(250);
  v = host.view<ImposterView>();
  expect(v.phase).toBe('result');
  expect(Object.keys(v.result!.votes).length).toBe(4);
}, 60000);

test('hot potato with bots: bots throw and shout a word', async () => {
  const { host } = await roomWithBots(1, 2, 'potato');
  host.send({ t: 'room', action: { type: 'settings', game: 'potato', patch: { minFuse: 30, maxFuse: 30 } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  // host can always start
  host.act({ type: 'start' });
  let words = 0;
  let passes = 0;
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(250);
    const v = host.view<PotatoView>();
    if (v.holderId === host.id && v.phase === 'play') {
      await Bun.sleep(750);
      host.act({ type: 'throw', to: v.participants.find((id) => id !== host.id && id !== v.fromId)! });
    }
    if (v.lastWord) words++;
    passes = v.passes;
  }
  expect(passes).toBeGreaterThanOrEqual(3);
  expect(words).toBeGreaterThan(0);
}, 20000);

test('werewolf with bots: bot roles act automatically, bots accuse in the day', async () => {
  const { host } = await roomWithBots(1, 5, 'werewolf');
  // «سهل» bots all speak up in the day (smart / expert villagers stay quiet until they have a reason)
  host.send({ t: 'room', action: { type: 'botLevel', level: 'easy' } });
  host.send({ t: 'room', action: { type: 'settings', game: 'werewolf', patch: { hunter: false } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<WerewolfView>();
  expect(v.narratorId).toBe(host.id); // a bot can never narrate
  const step = () => host.view<WerewolfView>().narrator!.step;
  host.act({ type: 'next' }); // -> wolves
  await settle();
  expect(host.view<WerewolfView>().narrator!.wolvesTarget).not.toBeNull();
  expect(host.view<WerewolfView>().narrator!.auto.wolves).toBe(true);
  while (step() !== 'wake') {
    host.act({ type: 'next' });
    await settle(40);
    const n = host.view<WerewolfView>().narrator!;
    if (n.step === 'doctor') expect(n.doctorSave).not.toBeNull();
    if (n.step === 'seer') expect(n.seerCheck).not.toBeNull();
  }
  host.act({ type: 'next' });
  await settle();
  v = host.view<WerewolfView>();
  if (v.phase === 'day') {
    const aliveBots = v.participants.filter((id) => v.alive[id]);
    // bots speak up one after another, a few seconds apart
    for (let t = 0; t < 120 && host.view<WerewolfView>().accusations.length < aliveBots.length; t++) await Bun.sleep(250);
    expect(host.view<WerewolfView>().accusations.length).toBe(aliveBots.length);
  }
}, 45000);

test('اسم ولد اسم بنت: stop, review, reject and score 10 / 5 / 0', async () => {
  const { phones, host } = await makeRoom(3, 'names');
  // placeholder answers like «كboyA»: the dictionary check would flag them all
  host.send({ t: 'room', action: { type: 'settings', game: 'names', patch: { seconds: 60, rounds: 2, dict: 'off' } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<NamesView>();
  expect(v.phase).toBe('spin');
  await Bun.sleep(3500);
  v = host.view<NamesView>();
  expect(v.phase).toBe('write');
  expect(v.board).toBeNull();
  const L = v.letter;
  const cats = ['boy', 'girl', 'animal', 'plant', 'thing', 'country', 'job'];
  const [A, B, C] = phones;
  // A: all unique; B: same as A for "boy", wrong letter for "girl"; C: only one answer
  for (const cat of cats) A.act({ type: 'answer', cat, text: `${L}${cat}A` });
  B.act({ type: 'answer', cat: 'boy', text: `${L}boyA` });
  B.act({ type: 'answer', cat: 'girl', text: 'zzz' });
  C.act({ type: 'answer', cat: 'animal', text: `${L}zebra` });
  // C cannot stop with empty boxes
  C.act({ type: 'stop' });
  await settle();
  expect(C.errors.at(-1)).toContain('املأ');
  expect(host.view<NamesView>().progress[A.id]).toBe(7);
  A.act({ type: 'stop' });
  await settle();
  v = host.view<NamesView>();
  expect(v.phase).toBe('stopping');
  expect(v.stoppedBy).toBe(A.id);
  // late answer during the grace period still counts
  C.act({ type: 'answer', cat: 'plant', text: `${L}rose` });
  await Bun.sleep(3300);
  v = host.view<NamesView>();
  expect(v.phase).toBe('review');
  expect(v.board![B.id].girl.verdict).toBe('letter');
  expect(v.board![C.id].plant.text).toBe(`${L}rose`);
  // B and C vote out A's "thing"
  B.act({ type: 'reject', player: A.id, cat: 'thing' });
  C.act({ type: 'reject', player: A.id, cat: 'thing' });
  await settle();
  expect(host.view<NamesView>().board![A.id].thing.verdict).toBe('rejected');
  host.act({ type: 'score' });
  await settle();
  v = host.view<NamesView>();
  expect(v.phase).toBe('results');
  expect(v.board![A.id].boy.points).toBe(5); // shared with B
  expect(v.board![B.id].boy.points).toBe(5);
  expect(v.board![A.id].girl.points).toBe(10);
  expect(v.board![A.id].thing.points).toBe(0); // rejected
  expect(v.board![B.id].girl.points).toBe(0); // wrong letter
  expect(v.roundPoints![A.id]).toBe(5 + 10 + 10 + 10 + 0 + 10 + 10);
  expect(v.roundPoints![C.id]).toBe(20);
  host.act({ type: 'next' });
  await settle();
  v = host.view<NamesView>();
  expect(v.round).toBe(2);
  expect(v.letter).not.toBe(L);
}, 15000);

test('اسم ولد اسم بنت with «ستوب» off: finishing early waits for the others', async () => {
  const { phones, host } = await makeRoom(2, 'names');
  host.send({ t: 'room', action: { type: 'settings', game: 'names', patch: { seconds: 60, stop: false } } });
  await settle();
  expect(host.room!.settings.names.stop).toBe(false);
  host.send({ t: 'room', action: { type: 'start' } });
  await Bun.sleep(3500);
  const L = host.view<NamesView>().letter;
  const cats = ['boy', 'girl', 'animal', 'plant', 'thing', 'country', 'job'];
  const [A, B] = phones;
  for (const cat of cats) A.act({ type: 'answer', cat, text: `${L}${cat}x` });
  await settle();
  A.act({ type: 'stop' });
  await settle();
  let v = host.view<NamesView>();
  expect(v.phase).toBe('write'); // nobody is stopped
  expect(v.done).toEqual([A.id]);
  for (const cat of cats) B.act({ type: 'answer', cat, text: `${L}${cat}yy` });
  await settle();
  B.act({ type: 'stop' });
  await settle();
  v = host.view<NamesView>();
  expect(v.phase).toBe('stopping'); // everyone is done
}, 15000);

test('اسم ولد اسم بنت with bots: bots fill answers from the dictionary', async () => {
  const { host } = await roomWithBots(1, 3, 'names');
  host.send({ t: 'room', action: { type: 'settings', game: 'names', patch: { seconds: 30 } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await Bun.sleep(3500 + 30000 * 0.8);
  const v = host.view<NamesView>();
  const bots = v.participants.filter((id) => id !== host.id);
  const filled = bots.reduce((n, id) => n + v.progress[id], 0);
  expect(filled).toBeGreaterThan(3);
}, 40000);

/* ------------------------------------------------------------------ */
/* Card games                                                          */
/* ------------------------------------------------------------------ */

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Play whenever it's the human's turn, using `move`; stop when `done` or timeout. */
async function autoplay(p: Phone, move: (v: any) => GameAction | null, done: (v: any) => boolean, ms = 25000, check?: (v: any) => void) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await Bun.sleep(30);
    const v = p.view<any>();
    if (!v) continue;
    check?.(v);
    if (done(v)) return v;
    const m = move(v);
    if (m) {
      p.act(m);
      await Bun.sleep(40);
    }
  }
  throw new Error('autoplay timeout: ' + JSON.stringify(p.view<any>()?.phase));
}

test('ronda: 4 cards each, no table cards, every card accounted for', async () => {
  const { host } = await roomWithBots(1, 1, 'ronda');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<RondaView>();
  expect(v.myHand.length).toBe(4);
  expect(v.table.length).toBe(0);
  expect(v.deckLeft).toBe(32);
  v = await autoplay(
    host,
    (x: RondaView) => (x.phase === 'play' && x.turn === host.id && x.myHand.length ? { type: 'play', card: x.myHand[0].id } : null),
    (x: RondaView) => x.phase !== 'play',
    40000,
    (x: RondaView) => {
      if (x.phase === 'play') expect(sum(x.capturedCounts) + x.table.length + x.deckLeft + sum(x.handCounts)).toBe(40);
    },
  );
  if (v.phase === 'handEnd') {
    expect(v.handSummary!.reduce((t, r) => t + r.cards, 0)).toBe(40);
  }
}, 45000);

test('kanza: captures must make 15; full hand with a bot', async () => {
  const { host } = await roomWithBots(1, 1, 'kanza');
  host.send({ t: 'room', action: { type: 'settings', game: 'kanza', patch: { hands: 1 } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<KanzaView>();
  // the bot may already have played its first card, so count every card instead of the table alone
  expect(sum(v.capturedCounts) + v.table.length + v.deckLeft + sum(v.handCounts)).toBe(40);
  expect(v.myHand.length).toBe(3);
  // wait for my turn, then try an illegal capture
  v = await autoplay(host, () => null, (x: KanzaView) => x.turn === host.id, 8000);
  const bad = v.table.find((t) => t.rank + v.myHand[0].rank !== 15);
  if (bad) {
    host.act({ type: 'play', card: v.myHand[0].id, take: [bad.id] });
    await settle();
    expect(host.errors.at(-1)).toContain('15');
  }
  v = await autoplay(
    host,
    (x: KanzaView) => {
      if (x.phase !== 'play' || x.turn !== host.id || !x.myHand.length) return null;
      for (const card of x.myHand) {
        const one = x.table.find((t) => t.rank + card.rank === 15);
        if (one) return { type: 'play', card: card.id, take: [one.id] };
      }
      return { type: 'play', card: x.myHand[0].id, take: [] };
    },
    (x: KanzaView) => x.phase !== 'play',
    40000,
    (x: KanzaView) => {
      if (x.phase === 'play') expect(sum(x.capturedCounts) + x.table.length + x.deckLeft + sum(x.handCounts)).toBe(40);
    },
  );
  expect(v.phase).toBe('final');
  expect(v.handSummary!.reduce((t, r) => t + r.points, 0)).toBe(110);
}, 50000);

test('tris: 4 seats needed, follow suit enforced, a hand is worth 10–11 points', async () => {
  const small = await roomWithBots(1, 2, 'tris');
  small.host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  expect(small.host.errors.at(-1)).toContain('4');
  const { host } = await roomWithBots(1, 3, 'tris');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<TrisView>();
  expect(v.myHand.length).toBe(10);
  expect(v.sides.length).toBe(2);
  v = await autoplay(
    host,
    (x: TrisView) => {
      if (x.phase !== 'play' || x.turn !== host.id) return null;
      if (x.trick.length) {
        // an illegal card is refused
        const illegal = x.myHand.find((c) => !x.playable.includes(c.id));
        if (illegal && Math.random() < 0.3) return { type: 'play', card: illegal.id };
      }
      return { type: 'play', card: x.playable[0] };
    },
    (x: TrisView) => x.phase === 'handEnd' || x.phase === 'final',
    60000,
  );
  const pts = v.handSummary!.reduce((t, r) => t + r.points, 0);
  expect([10, 11]).toContain(pts);
  expect(sum(v.tricksWon)).toBe(10);
}, 65000);

test('konkan: draw / discard / bots meld, a hand finishes', async () => {
  const { host } = await roomWithBots(1, 2, 'konkan');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<KonkanView>();
  expect(v.myHand.length).toBe(8);
  expect(v.discardTop).not.toBeNull();
  v = await autoplay(
    host,
    (x: KonkanView) => {
      if (x.phase !== 'play' || x.turn !== host.id) return null;
      if (x.step === 'draw') return { type: 'drawStock' };
      return { type: 'discard', card: x.myHand[x.myHand.length - 1].id };
    },
    (x: KonkanView) => x.phase !== 'play',
    60000,
  );
  expect(['handEnd', 'final']).toContain(v.phase);
  if (v.handWinner) expect(v.handSummary!.find((r) => r.id === v.handWinner)!.points).toBe(0);
}, 65000);

/** A simple Uno player: pick a colour, say UNO, play the first legal card, else draw / pass. */
function unoMove(p: Phone) {
  return (x: UnoView): GameAction | null => {
    if (x.phase !== 'play') return null;
    if (x.choosing === p.id) return { type: 'color', color: colorsOf(x.side)[0] };
    if (x.catchable && x.catchable !== p.id) return { type: 'catch' };
    if (x.turn !== p.id || x.choosing) return null;
    if (x.myHand.length === 2 && x.playable.length && !x.unoSaid.includes(p.id)) return { type: 'uno' };
    if (x.playable.length) return { type: 'play', card: x.playable[0] };
    if (x.canPass) return { type: 'pass' };
    return { type: 'draw' };
  };
}

test('uno flip: private hands, the other side is visible to the others, a round ends with scores', async () => {
  const { phones, host } = await makeRoom(3, 'unoflip');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const views = phones.map((p) => p.view<UnoView>());
  for (const v of views) {
    expect(v.myHand.length).toBe(7);
    expect(v.side).toBe('light');
    expect(v.top.kind).toBe('num');
  }
  // I never see my own backs; the others' backs match their hand sizes and are dark faces
  const v0 = views[0];
  expect(v0.backs[host.id]).toBeUndefined();
  for (const p of phones.slice(1)) {
    expect(v0.backs[p.id].length).toBe(7);
    for (const f of v0.backs[p.id]) expect(f.color === null || ['pink', 'teal', 'orange', 'purple'].includes(f.color)).toBe(true);
  }
  expect(v0.deckLeft).toBe(112 - 21 - 1);
  // a card I can't play is refused
  const turnPhone = phones.find((p) => p.id === v0.turn)!;
  const tv = turnPhone.view<UnoView>();
  const bad = tv.myHand.find((c) => !tv.playable.includes(c.id));
  if (bad) {
    turnPhone.act({ type: 'play', card: bad.id });
    await settle();
    expect(turnPhone.errors.length).toBeGreaterThan(0);
  }
  // play it out: everyone runs the simple strategy
  let sawFlip = false;
  const end = Date.now() + 40000;
  let v = host.view<UnoView>();
  while (Date.now() < end && v.phase === 'play') {
    for (const p of phones) {
      const m = unoMove(p)(p.view<UnoView>());
      if (m) p.act(m);
    }
    await Bun.sleep(25);
    v = host.view<UnoView>();
    if (v.side === 'dark') sawFlip = true;
    const total = Object.values(v.handCounts).reduce((a, b) => a + b, 0);
    expect(total + v.deckLeft).toBeLessThanOrEqual(112);
  }
  expect(['roundEnd', 'final']).toContain(v.phase);
  const rs = v.roundSummary!;
  expect(v.handCounts[rs.winner]).toBe(0);
  expect(rs.points).toBe(rs.hands.reduce((t, h) => t + h.points, 0));
  expect(v.scores[rs.winner]).toBe(rs.points);
  console.log('uno round', { flipped: sawFlip, points: rs.points });
}, 45000);

test('uno flip with bots: bots play, pick colours and finish a round', async () => {
  const { host } = await roomWithBots(1, 3, 'unoflip');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const v = await autoplay(host, unoMove(host), (x: UnoView) => x.phase !== 'play', 90000);
  expect(['roundEnd', 'final']).toContain(v.phase);
  expect(v.roundSummary).not.toBeNull();
}, 95000);

test('codenames: spymasters see the key, others only revealed cards; clue, guesses, win', async () => {
  const { phones, host } = await makeRoom(4, 'codenames');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<CodenamesView>();
  expect(v.phase).toBe('teams');
  expect(v.teams.red.length).toBe(2);
  host.act({ type: 'begin' });
  await settle();
  const views = () => phones.map((p) => p.view<CodenamesView>());
  v = host.view<CodenamesView>();
  expect(v.phase).toBe('clue');
  expect(v.words.length).toBe(25);
  for (const pv of views()) {
    const seen = pv.colors.filter((c) => c !== null).length;
    expect(seen).toBe(pv.amSpymaster ? 25 : 0);
  }
  // play until someone wins: spymaster gives a clue, an operative reveals one of their own cards (or a wrong one)
  for (let turn = 0; turn < 40 && host.view<CodenamesView>().phase !== 'final'; turn++) {
    v = host.view<CodenamesView>();
    const team = v.turn;
    const spy = phones.find((p) => p.id === v.spymasters[team])!;
    const sv = spy.view<CodenamesView>();
    // a word from the grid is refused as a clue
    if (turn === 0) {
      spy.act({ type: 'clue', word: sv.words[0], n: 1 });
      await settle();
      expect(spy.errors.length).toBeGreaterThan(0);
    }
    spy.act({ type: 'clue', word: 'تلميح', n: 2 });
    await settle();
    const op = phones.find((p) => p.id !== spy.id && p.view<CodenamesView>().myTeam === team)!;
    expect(op.view<CodenamesView>().clue?.word).toBe('تلميح');
    const target = sv.colors.findIndex((c, i) => c === team && !sv.revealed[i]);
    op.act({ type: 'point', index: target });
    await settle();
    expect(host.view<CodenamesView>().proposals[op.id]).toBe(target);
    op.act({ type: 'reveal', index: target });
    await settle();
    if (host.view<CodenamesView>().phase === 'guess') {
      op.act({ type: 'pass' });
      await settle();
    }
  }
  v = host.view<CodenamesView>();
  expect(v.phase).toBe('final');
  expect(v.reason).toBe('words');
  expect(v.colors.every((c) => c !== null)).toBe(true);
}, 30000);

test('draw & guess: choose, live strokes, close and correct guesses, scores', async () => {
  const { phones, host } = await makeRoom(3, 'draw');
  host.send({ t: 'room', action: { type: 'settings', game: 'draw', patch: { rounds: 1, seconds: 40 } } });
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<DrawView>();
  const drawer = phones.find((p) => p.id === v.drawer)!;
  const guessers = phones.filter((p) => p !== drawer);
  expect(drawer.view<DrawView>().options!.length).toBe(3);
  expect(guessers[0].view<DrawView>().options).toBeNull();
  const word = drawer.view<DrawView>().options![1];
  drawer.act({ type: 'choose', word });
  await settle();
  expect(guessers[0].view<DrawView>().word).toBeNull();
  expect(guessers[0].view<DrawView>().hint.replace(/[_ ]/g, '')).toBe('');
  drawer.act({ type: 'stroke', id: 's1', c: '#E2475F', w: 10, pts: [10, 10, 200, 200] });
  drawer.act({ type: 'stroke', id: 's1', pts: [300, 250] });
  await settle();
  const st = guessers[0].view<DrawView>().strokes;
  expect(st.length).toBe(1);
  expect(st[0].pts).toEqual([10, 10, 200, 200, 300, 250]);
  // guessers can't draw
  guessers[0].act({ type: 'stroke', id: 'x', pts: [1, 1] });
  // a wrong guess shows in the feed
  guessers[0].act({ type: 'guess', text: 'شيء خاطئ' });
  await settle();
  expect(host.view<DrawView>().feed.some((f) => f.text === 'شيء خاطئ')).toBe(true);
  expect(host.view<DrawView>().strokes.length).toBe(1);
  // correct guess (with alef/taa marbuta differences tolerated)
  guessers[0].act({ type: 'guess', text: word.replace(/ة$/, 'ه') });
  await settle();
  v = guessers[0].view<DrawView>();
  expect(v.guessed).toContain(guessers[0].id);
  expect(v.word).toBe(word);
  guessers[1].act({ type: 'guess', text: word });
  await settle();
  v = host.view<DrawView>();
  expect(v.phase).toBe('reveal');
  expect(v.roundPoints![guessers[0].id]).toBeGreaterThan(v.roundPoints![guessers[1].id]);
  expect(v.roundPoints![drawer.id]).toBeGreaterThan(0);
  host.act({ type: 'next' });
  await settle();
  expect(host.view<DrawView>().drawer).not.toBe(drawer.id);
}, 20000);

test('ludo with bots: a full game finishes', async () => {
  const { host } = await roomWithBots(1, 1, 'ludo');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<LudoView>();
  expect(v.seats.length).toBe(2);
  expect(Object.values(v.tokens).flat().every((p) => p === -1)).toBe(true);
  v = await autoplay(
    host,
    (x: LudoView) => {
      if (x.phase === 'final' || x.turn !== host.id) return null;
      if (x.phase === 'roll') return { type: 'roll' };
      return x.movable.length ? { type: 'move', token: x.movable[0] } : null;
    },
    (x: LudoView) => x.phase === 'final',
    120000,
  );
  expect(v.winner).not.toBeNull();
}, 125000);

test('dama with a bot: illegal moves refused, the game ends', async () => {
  const { host } = await roomWithBots(1, 1, 'dama');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<DamaView>();
  expect(v.counts).toEqual({ white: 12, black: 12 });
  if (v.turn === v.myColor) {
    host.act({ type: 'move', from: 0, to: 9 });
    await settle();
    expect(host.errors.length).toBeGreaterThan(0);
  }
  v = await autoplay(
    host,
    (x: DamaView) => (x.phase === 'play' && x.turn === x.myColor && x.moves.length ? { type: 'move', from: x.moves[0].from, to: x.moves[0].path[x.moves[0].path.length - 1] } : null),
    (x: DamaView) => x.phase === 'final',
    90000,
  );
  expect(v.winner).not.toBeNull();
}, 95000);

test('estate with bots: buy, trade offers answered, game ends by round limit', async () => {
  const { host } = await roomWithBots(1, 2, 'estate');
  host.send({ t: 'room', action: { type: 'settings', game: 'estate', patch: { rounds: 10, startCash: 1000 } } });
  await settle();
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<EstateView>();
  expect(v.players.length).toBe(3);
  // a bot may already have rolled; the host hasn't moved yet
  const me = v.players.find((p) => p.id === host.id)!;
  expect(me.cash === 1000 && me.pos === 0).toBe(true);
  // not my turn → refused
  if (v.turn !== host.id) {
    host.act({ type: 'roll' });
    await settle();
    expect(host.errors.length).toBeGreaterThan(0);
  }
  let offered = false;
  v = await autoplay(
    host,
    (x: EstateView) => {
      if (x.phase === 'final') return null;
      if (x.trade?.to === host.id) return { type: 'tradeDecline' };
      if (x.turn !== host.id) return null;
      if (x.phase === 'roll') {
        // try one trade with a bot that owns something
        const theirs = Object.entries(x.props).find(([, p]) => p.owner !== host.id && !p.houses);
        if (!offered && theirs && !x.trade) {
          offered = true;
          return { type: 'trade', to: theirs[1].owner, give: { props: [], cash: 900 }, get: { props: [Number(theirs[0])], cash: 0 } };
        }
        return x.trade ? null : { type: 'roll' };
      }
      if (x.phase === 'buy') return { type: x.players.find((p) => p.id === host.id)!.cash >= 400 ? 'buy' : 'skip' };
      if (x.phase === 'debt') return { type: 'bankrupt' };
      return x.trade ? null : { type: 'end' };
    },
    (x: EstateView) => x.phase === 'final',
    150000,
  );
  expect(v.winner).not.toBeNull();
  expect(Object.keys(v.worth).length).toBe(3);
}, 160000);

test('islamic quiz and surah with bots: answers, reveal, final scores', async () => {
  for (const game of ['quiz', 'surah'] as const) {
    const { host } = await roomWithBots(1, 2, game);
    host.send({ t: 'room', action: { type: 'settings', game, patch: { rounds: 5, seconds: 10 } } });
    await settle();
    host.send({ t: 'room', action: { type: 'start' } });
    await settle();
    const v0 = host.view<McqView>();
    expect(v0.phase).toBe('ask');
    expect(v0.options.length).toBe(4);
    expect(v0.correct).toBeNull(); // not leaked while asking
    const v = await autoplay(
      host,
      (x: McqView) => (x.phase === 'ask' && x.myAnswer === null ? { type: 'answer', choice: 0 } : null),
      (x: McqView) => x.phase === 'final',
      60000,
      (x: McqView) => {
        if (x.phase === 'reveal') {
          expect(x.correct).not.toBeNull();
          if (game === 'surah') expect(x.ref).toContain('الآية');
        }
      },
    );
    expect(Object.keys(v.scores).length).toBe(3);
    host.ws.close();
  }
}, 130000);

test('whois with bots: one guess each, clues appear, round reveals', async () => {
  const { host } = await roomWithBots(1, 2, 'whois');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<WhoisView>();
  expect(v.clues.length).toBe(1);
  expect(v.options.length).toBe(6);
  host.act({ type: 'guess', choice: 2 });
  await settle();
  host.act({ type: 'guess', choice: 3 }); // second guess ignored
  await settle();
  v = host.view<WhoisView>();
  expect(v.myGuess).toBe(2);
  v = await autoplay(host, () => null, (x: WhoisView) => x.phase === 'reveal', 40000);
  expect(v.answer).not.toBeNull();
  expect(v.results!.length).toBe(3);
}, 45000);

test('huroof with a bot team: picks, answers, a team connects its sides', async () => {
  const { host } = await roomWithBots(1, 1, 'huroof');
  host.send({ t: 'room', action: { type: 'settings', game: 'huroof', patch: { seconds: 10 } } });
  await settle();
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const v0 = host.view<HuroofView>();
  expect(v0.cells.length).toBe(25);
  const mine = v0.teams.red.includes(host.id) ? 'red' : 'green';
  let tried = '';
  let typed = '';
  const v = await autoplay(
    host,
    (x: HuroofView) => {
      if (x.phase === 'pick' && x.turn === mine) return { type: 'pick', cell: x.cells.findIndex((c) => !c.owner) };
      if (x.phase === 'question' && x.question && x.canAnswer.includes(mine) && tried !== x.question.text + x.canAnswer.length) {
        tried = x.question.text + x.canAnswer.length;
        return { type: 'buzz' };
      }
      if (x.phase === 'answer' && x.buzzer === host.id && typed !== tried) {
        typed = tried;
        return { type: 'answer', text: 'لا أعرف' };
      }
      return null;
    },
    (x: HuroofView) => x.phase === 'final',
    120000,
  );
  expect(v.winner).not.toBeNull();
}, 125000);

test('hajj and ladders with bots: full races finish', async () => {
  for (const game of ['hajj', 'ladders'] as const) {
    const { host } = await roomWithBots(1, 1, game);
    host.send({ t: 'room', action: { type: 'start' } });
    await settle();
    const v = await autoplay(
      host,
      (x: HajjView | LaddersView) => {
        if (x.game === 'hajj' && x.phase === 'quiz' && x.quiz && x.quiz.myAnswer === null && x.quiz.correct === null) return { type: 'quiz', choice: 0 };
        if (x.phase === 'final' || x.turn !== host.id) {
          if (x.game === 'hajj' && x.phase === 'question' && x.question?.for === host.id) return { type: 'answer', choice: 0 };
          return null;
        }
        if (x.phase === 'roll') return { type: 'roll' };
        if (x.game === 'hajj' && x.phase === 'question') return { type: 'answer', choice: 0 };
        return null;
      },
      (x: HajjView | LaddersView) => x.phase === 'final',
      150000,
    );
    expect(v.winner).not.toBeNull();
    host.ws.close();
  }
}, 320000);

test('connect4 and chess against a bot: illegal moves refused, games finish', async () => {
  const { host } = await roomWithBots(1, 1, 'connect4');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = await autoplay(
    host,
    (x: Connect4View) => {
      if (x.phase !== 'play' || x.turn !== x.myDisc) return null;
      const free = [3, 2, 4, 1, 5, 0, 6].filter((c) => x.board[c] === 0);
      return { type: 'drop', col: free[0] };
    },
    (x: Connect4View) => x.phase === 'final',
    30000,
  );
  expect(v.winner).not.toBeNull();
  host.ws.close();

  const c = await roomWithBots(1, 1, 'chess');
  c.host.send({ t: 'room', action: { type: 'settings', game: 'chess', patch: { level: 1 } } });
  await settle();
  c.host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const cv = c.host.view<ChessView>();
  expect(cv.board.filter(Boolean).length).toBe(32);
  if (cv.myColor === 'w') {
    c.host.act({ type: 'move', from: 52, to: 36 }); // e2-e4
    await settle();
    expect(c.host.view<ChessView>().board[36]).toBe('P');
  }
  // a few more moves each side, then resign
  let moves = 0;
  await autoplay(
    c.host,
    (x: ChessView) => {
      if (x.phase !== 'play' || x.turn !== x.myColor) return null;
      if (moves++ >= 6) return { type: 'resign' };
      const m = x.moves[Math.floor(Math.random() * x.moves.length)];
      return { type: 'move', from: m.from, to: m.to, promo: m.promo };
    },
    (x: ChessView) => x.phase === 'final',
    60000,
  );
  expect(c.host.view<ChessView>().reason).toBe('resign');
}, 100000);

test('kdab with bots: plays, calls, someone empties their hand', async () => {
  const { host } = await roomWithBots(1, 2, 'kdab');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let v = host.view<KdabView>();
  expect(Object.values(v.handCounts).reduce((a, b) => a + b, 0)).toBe(40);
  let called = false;
  v = await autoplay(
    host,
    (x: KdabView) => {
      if (x.phase !== 'play') return null;
      if (x.canCall && !called && x.last && x.last.count >= 2) {
        called = true;
        return { type: 'call' };
      }
      if (x.turn !== host.id) return null;
      const card = x.myHand[0];
      if (!card) return null;
      return x.rank === null ? { type: 'play', cards: [card.id], rank: card.rank } : { type: 'play', cards: [card.id] };
    },
    (x: KdabView) => x.phase === 'final',
    150000,
  );
  expect(v.winner).not.toBeNull();
}, 160000);

test('wordle with a bot, and wave between two people', async () => {
  const { host } = await roomWithBots(1, 1, 'wordle');
  host.send({ t: 'room', action: { type: 'settings', game: 'wordle', patch: { rounds: 1 } } });
  await settle();
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  host.act({ type: 'guess', word: 'ابجد' }); // too short → refused
  await settle();
  expect(host.errors.length).toBeGreaterThan(0);
  host.act({ type: 'guess', word: 'سجتحخ' }); // gibberish → refused
  await settle();
  expect(host.errors.at(-1)).toContain('القاموس');
  expect(host.view<WordleView>().myRows.length).toBe(0);
  const tries = ['سيارة', 'مدرسة', 'طاولة', 'حديقة', 'مكتبة', 'نافذة'];
  const w = await autoplay(
    host,
    (x: WordleView) => (x.phase === 'play' && x.myRows.length < 6 && !x.myRows.some((r) => r.marks.every((m) => m === 'g')) ? { type: 'guess', word: tries[x.myRows.length] } : null),
    (x: WordleView) => x.phase === 'reveal' || x.phase === 'final',
    60000,
  );
  expect(w.answer).not.toBeNull();
  host.ws.close();

  const { phones } = await makeRoom(2, 'wave');
  const [a, b] = phones;
  a.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const va = a.view<WaveView>();
  const psychic = va.psychic === a.id ? a : b;
  const guesser = psychic === a ? b : a;
  expect(guesser.view<WaveView>().target).toBeNull();
  const target = psychic.view<WaveView>().target!;
  psychic.act({ type: 'clue', text: 'قهوة الصباح' });
  await settle();
  guesser.act({ type: 'guess', value: target });
  await settle();
  const r = guesser.view<WaveView>();
  expect(r.phase).toBe('reveal');
  expect(r.scores[guesser.id]).toBe(4);
}, 80000);

test('xo, kharbga and battleship against a bot', async () => {
  const { host } = await roomWithBots(1, 1, 'xo');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const x = await autoplay(
    host,
    (v: XoView) => (v.phase === 'play' && v.turn === v.mine ? { type: 'mark', cell: v.board.findIndex((c) => !c) } : null),
    (v: XoView) => v.phase === 'final',
    20000,
  );
  expect(x.winner).not.toBeNull();
  host.ws.close();

  const k = await roomWithBots(1, 1, 'kharbga');
  k.host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  let placed = 0;
  const kv = await autoplay(
    k.host,
    (v: KharbgaView) => {
      if (v.turn !== v.mySide) return null;
      if (v.phase === 'place') {
        const cell = v.board.findIndex((c, i) => !c && i !== 24);
        placed++;
        return { type: 'place', cell };
      }
      if (v.phase === 'move') return v.moves.length ? { type: 'resign' } : null;
      return null;
    },
    (v: KharbgaView) => v.phase === 'final',
    60000,
  );
  expect(placed).toBe(24);
  expect(kv.reason).toBe('resign');
  k.host.ws.close();

  const b = await roomWithBots(1, 1, 'battleship');
  b.host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const before = JSON.stringify(b.host.view<BattleshipView>().myFleet);
  b.host.act({ type: 'shuffle' });
  await settle();
  expect(JSON.stringify(b.host.view<BattleshipView>().myFleet)).not.toBe(before);
  b.host.act({ type: 'ready' });
  let next = 0;
  const bv = await autoplay(
    b.host,
    (v: BattleshipView) => {
      if (v.phase !== 'play' || v.turn !== b.host.id) return null;
      while (v.myShots[next]) next++;
      return { type: 'fire', cell: next };
    },
    (v: BattleshipView) => v.phase === 'final',
    120000,
  );
  expect(bv.enemyFleet).not.toBeNull();
  expect(bv.myFleet.length).toBe(5);
}, 200000);

test('sudoku race and memory with bots', async () => {
  const { host } = await roomWithBots(1, 1, 'sudoku');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const sv = host.view<SudokuView>();
  expect(sv.givens.filter(Boolean).length).toBe(40);
  const cell = sv.givens.findIndex((v) => !v);
  host.act({ type: 'set', cell, value: 10 }); // out of range → ignored
  await settle();
  expect(host.view<SudokuView>().mistakes).toBe(0);
  host.act({ type: 'giveup' });
  await settle();
  expect(host.view<SudokuView>().finished.some((f) => f.id === host.id)).toBe(true);
  host.ws.close();

  const m = await roomWithBots(1, 2, 'memory');
  m.host.send({ t: 'room', action: { type: 'settings', game: 'memory', patch: { pairs: 8 } } });
  await settle();
  m.host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const mv = await autoplay(
    m.host,
    (v: MemoryView) => {
      if (v.phase !== 'play' || v.turn !== m.host.id || v.peek) return null;
      const free = v.faces.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
      return free.length ? { type: 'flip', card: free[0] } : null;
    },
    (v: MemoryView) => v.phase === 'final',
    120000,
  );
  expect(mv.size).toBe(16);
  expect(Object.values(mv.pairs as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(8);
  expect(mv.winner!.length).toBeGreaterThan(0);
}, 150000);

test('trivia with a bot', async () => {
  const { host } = await roomWithBots(1, 1, 'trivia');
  host.send({ t: 'room', action: { type: 'settings', game: 'trivia', patch: { rounds: 5, category: 'sport' } } });
  await settle();
  expect(host.room!.settings.trivia.category).toBe('sport');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const v = await autoplay(
    host,
    (x: McqView) => (x.phase === 'ask' && x.myAnswer === null ? { type: 'answer', choice: 0 } : null),
    (x: McqView) => x.phase === 'final',
    120000,
  );
  expect(v.rounds).toBe(5);
}, 130000);

test('an offline player is played by a bot, the host role moves on, kicked players stay out', async () => {
  const { phones, host } = await makeRoom(2, 'xo');
  const [, guest] = phones;
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  // the guest's phone goes to sleep: after a moment a bot plays their turns
  guest.ws.close();
  await Bun.sleep(1900);
  expect(host.room!.players.find((p) => p.id === guest.id)?.auto).toBe(true);
  const v = await autoplay(
    host,
    (x: XoView) => (x.phase === 'play' && x.turn === x.mine ? { type: 'mark', cell: x.board.findIndex((c) => !c) } : null),
    (x: XoView) => x.phase === 'final',
    20000,
  );
  expect(v.winner).not.toBeNull();
  // the guest comes back and plays again themselves
  await guest.connect();
  guest.send({ t: 'join', code: host.room!.code });
  await settle(150);
  expect(host.room!.players.find((p) => p.id === guest.id)?.auto).toBeFalsy();
  // now the host's phone sleeps: the guest becomes host
  host.ws.close();
  await Bun.sleep(1800);
  expect(guest.room!.hostId).toBe(guest.id);
  await host.connect();
  host.send({ t: 'join', code: guest.room!.code });
  await settle(150);
  // the new host removes the old one, who can't come back
  guest.send({ t: 'room', action: { type: 'kick', id: host.id } });
  await settle(150);
  expect(host.room).toBeNull();
  host.send({ t: 'join', code: guest.room!.code });
  await settle(150);
  expect(host.room).toBeNull();
  expect(host.errors.at(-1)).toContain('أخرجك');
}, 40000);

test('ronda: a player who leaves is replaced by a bot and the hand goes on', async () => {
  const { phones, host } = await makeRoom(2, 'ronda');
  host.send({ t: 'room', action: { type: 'start' } });
  await settle();
  const guest = phones[1];
  guest.send({ t: 'leave' } as ClientMsg);
  await settle(200);
  const seat = host.room!.players.find((p) => p.id === guest.id);
  expect(seat?.bot).toBe(true);
  expect(host.view<RondaView>().phase).not.toBe('final');
  host.ws.close();
}, 20000);

test('voice: join, mute, signals only between voice members, gone on disconnect', async () => {
  const { phones } = await makeRoom(3, 'xo');
  const [A, B, C] = phones;
  A.send({ t: 'voice', a: 'join' });
  B.send({ t: 'voice', a: 'join', muted: true });
  await settle(200);
  expect(A.other.some((m) => m.t === 'voiceConfig' && m.iceServers.length > 0)).toBe(true);
  expect(C.room!.voice).toEqual(expect.arrayContaining([{ id: A.id, muted: false }, { id: B.id, muted: true }]));
  expect(C.room!.voice.length).toBe(2);
  // A ↔ B pass messages; C (not in voice) can neither send nor receive
  A.send({ t: 'signal', to: B.id, data: { description: { type: 'offer', sdp: 'v=0' } } });
  C.send({ t: 'signal', to: A.id, data: { candidate: { candidate: 'x' } } });
  A.send({ t: 'signal', to: C.id, data: { restart: true } });
  A.send({ t: 'signal', to: B.id, data: { evil: 1 } as never }); // malformed: dropped
  await settle();
  expect(B.other.filter((m) => m.t === 'signal')).toEqual([{ t: 'signal', from: A.id, data: { description: { type: 'offer', sdp: 'v=0' } } }]);
  expect(A.other.filter((m) => m.t === 'signal').length).toBe(0);
  expect(C.other.length).toBe(0);
  B.send({ t: 'voice', a: 'mute', muted: false });
  await settle();
  expect(C.room!.voice.find((v) => v.id === B.id)!.muted).toBe(false);
  // a phone that drops out leaves the voice chat (it rejoins itself when back)
  B.ws.close();
  await settle(200);
  expect(A.room!.voice.map((v) => v.id)).toEqual([A.id]);
  A.send({ t: 'voice', a: 'leave' });
  await settle();
  expect(C.room!.voice).toEqual([]);
});
