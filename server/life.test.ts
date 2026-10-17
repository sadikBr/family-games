/** «مشوار الحياة» — moves, forks, paydays, loans, retirement scoring, bots and leaving. */
import { expect, test } from 'bun:test';

import { LIFE_RULES as R, type LifeChoice, type LifeSettings } from '../src/shared/games/life';
import { LIFE_STOPS, lifeBoard, lifeStepsLeft } from '../src/shared/life-board';
import { botHouse, life, scoreOf, walk, type LifeState } from './games/life';
import { HOUSES, WORK_JOBS } from './life-content';

const fakeCtx = (bot: (by: string, a: any, delay: number) => void = () => {}, fx: string[] = []): any => ({
  now: 0,
  fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: (by: string, _k: string, d: number, a: any) => bot(by, a, d),
});

/** Read without TypeScript's narrowing from earlier assignments in the test. */
const phaseOf = (s: LifeState): string => s.phase;
const choiceOf = (s: LifeState): LifeChoice | null => s.choice;

const settings = (over: Partial<LifeSettings> = {}): LifeSettings => ({ length: 'normal', startCash: 20000, ...over });

/** A game with a fixed turn order. */
function game(ids = ['a', 'b'], over: Partial<LifeSettings> = {}) {
  const ctx = fakeCtx();
  const s = life.start(ctx, ids, settings(over));
  s.players.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
  return { ctx, s };
}

/** Roll a chosen number (Math.random is pinned for the duration of the roll). */
function rollAs(ctx: any, s: LifeState, by: string, d: number) {
  const r = Math.random;
  Math.random = () => (d - 1) / 6 + 0.01;
  try {
    life.act(ctx, s, by, { type: 'roll' });
  } finally {
    Math.random = r;
  }
}

test('life: the board is a connected road with two forks, ending at retirement', () => {
  for (const len of ['short', 'normal'] as const) {
    const b = lifeBoard(len);
    expect(b.nodes[0].kind).toBe('start');
    expect(b.nodes[b.fork1].next.length).toBe(2);
    expect(b.nodes[b.fork2].next.length).toBe(2);
    expect(b.nodes.filter((n) => n.next.length > 1).length).toBe(2);
    const ends = b.nodes.filter((n) => !n.next.length);
    expect(ends.map((n) => n.kind)).toEqual(['retire']);
    // every space is reachable, each has exactly one way in except the merges and the start
    const into = new Map<number, number>();
    for (const n of b.nodes) for (const j of n.next) into.set(j, (into.get(j) ?? 0) + 1);
    expect(b.nodes.filter((n) => n.i !== 0 && !into.get(n.i)).length).toBe(0);
    expect([...into.values()].filter((v) => v === 2).length).toBe(2);
    // the house is on the shared road: nobody can skip it
    const house = b.nodes.find((n) => n.kind === 'house')!;
    expect(house.zone).toBe('career');
    expect(b.nodes.filter((n) => n.kind === 'grad').length).toBe(1);
    // inside the board
    for (const n of b.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(b.width);
      expect(n.y).toBeLessThan(b.height);
    }
  }
  expect(lifeStepsLeft(lifeBoard('short'), 0)).toBeLessThan(lifeStepsLeft(lifeBoard('normal'), 0));
});

test('life: rolling moves the pawn, the turn passes, the walk stops at the first fork', () => {
  const { ctx, s } = game();
  const b = lifeBoard('normal');
  expect(life.turnOf!(s)).toEqual(['a']);
  expect(() => life.act(ctx, s, 'b', { type: 'roll' })).toThrow();
  rollAs(ctx, s, 'a', 2);
  expect(s.players[0].pos).toBe(2);
  expect(s.move!.path).toEqual([1, 2]);
  expect(s.dice).toBe(2);
  // the space was resolved (school event or family) and the turn moved on
  expect(phaseOf(s)).toBe('roll');
  expect(life.turnOf!(s)).toEqual(['b']);
  // a big roll stops at the fork and asks which road
  s.players[1].pos = b.fork1 - 1;
  rollAs(ctx, s, 'b', 6);
  expect(s.players[1].pos).toBe(b.fork1);
  expect(phaseOf(s)).toBe('choose');
  expect(s.choice).toEqual({ kind: 'fork', fork: 1 });
  expect(life.turnOf!(s)).toEqual(['b']);
});

test('life: university costs tuition (with a loan if needed) and leads to graduation', () => {
  const { ctx, s } = game(['a', 'b'], { startCash: 10000 });
  const b = lifeBoard('normal');
  const a = s.players[0];
  a.pos = b.fork1;
  s.phase = 'choose';
  s.choice = { kind: 'fork', fork: 1 };
  life.act(ctx, s, 'a', { type: 'fork', way: 0 });
  // 10,000 − 20,000 → one loan
  expect(a.money).toBe(0);
  expect(a.loans).toBe(1);
  expect(phaseOf(s)).toBe('roll');
  expect(s.turnIdx).toBe(1);
  // walking the university road: no job yet, then the graduation space stops the pawn
  s.turnIdx = 0;
  rollAs(ctx, s, 'a', 6);
  const grad = b.nodes.find((n) => n.kind === 'grad')!;
  expect(b.nodes[a.pos].zone).toBe('uni');
  a.pos = grad.i - 1;
  s.phase = 'roll';
  s.turnIdx = 0;
  rollAs(ctx, s, 'a', 5);
  expect(a.pos).toBe(grad.i);
  expect(choiceOf(s)?.kind).toBe('job');
  const jc = choiceOf(s);
  if (jc?.kind !== 'job') throw new Error();
  expect(jc.cards.length).toBe(3);
  expect(jc.cards.every((j) => j.degree)).toBe(true);
  const best = [...jc.cards].sort((x, y) => y.salary - x.salary)[0];
  expect(() => life.act(ctx, s, 'a', { type: 'job', id: 'nope' })).toThrow();
  life.act(ctx, s, 'a', { type: 'job', id: best.id });
  expect(a.job?.id).toBe(best.id);
  expect(a.salary).toBe(best.salary);
  expect(a.degree).toBe(true);
  expect(phaseOf(s)).toBe('roll');
});

test('life: working straight away gives a job card choice right at the fork', () => {
  const { ctx, s } = game();
  const b = lifeBoard('normal');
  const a = s.players[0];
  a.pos = b.fork1;
  s.phase = 'choose';
  s.choice = { kind: 'fork', fork: 1 };
  life.act(ctx, s, 'a', { type: 'fork', way: 1 });
  expect(a.money).toBe(20000);
  expect(phaseOf(s)).toBe('choose');
  expect(choiceOf(s)?.kind).toBe('job');
  const jc = choiceOf(s);
  if (jc?.kind !== 'job') throw new Error();
  expect(jc.cards.every((j) => !j.degree)).toBe(true);
  life.act(ctx, s, 'a', { type: 'job', id: jc.cards[0].id });
  expect(a.job).not.toBeNull();
  // the next roll goes down the work road
  s.turnIdx = 0;
  rollAs(ctx, s, 'a', 1);
  expect(b.nodes[a.pos].zone).toBe('work');
  expect(a.pos).toBe(b.nodes[b.fork1].next[1]);
});

test('life: paydays pay when passing or landing, minus the interest on loans', () => {
  const { ctx, s } = game();
  const b = lifeBoard('normal');
  const a = s.players[0];
  a.job = WORK_JOBS[0];
  a.salary = 6000;
  a.money = 0;
  a.ways[b.fork1] = 1;
  const firstWork = b.nodes[b.fork1].next[1];
  expect(b.nodes[firstWork].kind).toBe('payday');
  // pass it (land two spaces later)
  a.pos = b.fork1;
  const path = walk(ctx, s, a, 2);
  expect(path[0]).toBe(firstWork);
  expect(a.money).toBe(6000);
  // with two loans: 6,000 − 2,000 interest
  a.loans = 2;
  a.money = 0;
  a.pos = b.fork1;
  walk(ctx, s, a, 1);
  expect(a.money).toBe(4000);
  expect(s.card?.kind).toBe('payday');
  expect(s.card?.amount).toBe(4000);
});

test('life: money below zero becomes loans; loans can be repaid on your turn', () => {
  const { ctx, s } = game();
  const a = s.players[0];
  a.money = 3000;
  // an event that costs 25,000 → three loans
  s.life = { draw: () => ({ title: 'x', text: 'x', fx: { t: 'money', amount: -25000 } }) } as any;
  const b = lifeBoard('normal');
  const ev = b.nodes.find((n) => n.kind === 'event' && n.zone === 'career')!;
  a.pos = ev.i - 1;
  rollAs(ctx, s, 'a', 1);
  expect(a.pos).toBe(ev.i);
  expect(a.loans).toBe(3);
  expect(a.money).toBe(3000 - 25000 + 30000);
  s.turnIdx = 0;
  expect(() => life.act(ctx, s, 'a', { type: 'repay' })).toThrow(); // 8,000 < 10,000
  a.money = 12000;
  life.act(ctx, s, 'a', { type: 'repay' });
  expect(a.loans).toBe(2);
  expect(a.money).toBe(2000);
  expect(phaseOf(s)).toBe('roll'); // still my turn to roll
  expect(life.turnOf!(s)).toEqual(['a']);
});

test('life: insurance pays for accidents; gifts never force a loan', () => {
  const { ctx, s } = game(['a', 'b', 'c']);
  const [a, bb, c] = s.players;
  const b = lifeBoard('normal');
  const ins = b.nodes.find((n) => n.kind === 'insure')!;
  a.pos = ins.i - 1;
  rollAs(ctx, s, 'a', 1);
  expect(s.choice).toEqual({ kind: 'insure', price: R.insurance });
  life.act(ctx, s, 'a', { type: 'insure', yes: true });
  expect(a.insured).toBe(true);
  expect(a.money).toBe(20000 - R.insurance);
  // an accident: free with insurance
  s.life = { draw: () => ({ title: 'x', text: 'x', fx: { t: 'insured', amount: -4000 } }) } as any;
  const ev = b.nodes.find((n) => n.kind === 'event' && n.zone === 'career' && n.i > ins.i)!;
  s.turnIdx = 0;
  a.pos = ev.i - 1;
  rollAs(ctx, s, 'a', 1);
  expect(a.money).toBe(20000 - R.insurance);
  // family space: a token, and a gift from each player who can afford it
  bb.money = 500;
  c.money = 5000;
  const fam = b.nodes.find((n) => n.kind === 'family' && n.zone === 'career')!;
  s.turnIdx = 0;
  a.pos = fam.i - 1;
  rollAs(ctx, s, 'a', 1);
  expect(a.tokens.length).toBe(1);
  expect(bb.money).toBe(500);
  expect(bb.loans).toBe(0);
  expect(c.money).toBe(5000 - R.gift);
  expect(a.money).toBe(20000 - R.insurance + R.gift);
});

test('life: the house is a stop space; buying with a loan; bots pick a house worth it', () => {
  const { ctx, s } = game();
  const b = lifeBoard('normal');
  const a = s.players[0];
  const house = b.nodes.find((n) => n.kind === 'house')!;
  a.pos = house.i - 2;
  a.money = 30000;
  rollAs(ctx, s, 'a', 6);
  expect(a.pos).toBe(house.i);
  expect(choiceOf(s)?.kind).toBe('house');
  const hc = choiceOf(s);
  if (hc?.kind !== 'house') throw new Error();
  const pricey = hc.cards[hc.cards.length - 1];
  life.act(ctx, s, 'a', { type: 'house', id: pricey.id });
  expect(a.house?.id).toBe(pricey.id);
  expect(a.money - a.loans * R.loan).toBe(30000 - pricey.price);
  expect(a.money).toBeGreaterThanOrEqual(0);
  // skipping is allowed
  const bb = s.players[1];
  bb.pos = house.i - 1;
  rollAs(ctx, s, 'b', 3);
  life.act(ctx, s, 'b', { type: 'house', id: null });
  expect(bb.house).toBeNull();
  // bot: a cheap good deal beats a villa on eight loans
  const villa = HOUSES.find((h) => h.id === 'villa')!;
  const flat = HOUSES.find((h) => h.id === 'flat')!;
  expect(botHouse(s, { ...a, pos: house.i, money: 40000, house: null }, [flat, villa])?.id).toBe('flat');
  expect(botHouse(s, { ...a, pos: house.i, money: 200000, house: null }, [flat, villa])?.id).toBe('villa');
});

test('life: retirement sells the house, repays loans, gives the order bonus; richest wins', () => {
  const fx: string[] = [];
  const ctx = fakeCtx(() => {}, fx);
  const s = life.start(ctx, ['a', 'b'], settings({ length: 'short' }));
  s.players.sort((x, y) => x.id.localeCompare(y.id));
  const b = lifeBoard('short');
  const retire = b.nodes.find((n) => n.kind === 'retire')!;
  const [a, bb] = s.players;
  a.money = 50000;
  a.loans = 2;
  a.house = HOUSES[0]; // sells 45,000
  a.tokens = ['family', 'pet'];
  a.pos = retire.i - 1;
  rollAs(ctx, s, 'a', 4);
  expect(a.retired).toBe(1);
  expect(a.bonus).toBe(R.retireBonus[0]);
  expect(a.score).toEqual({ money: 70000, house: 45000, tokens: 20000, loans: 20000, total: 115000 });
  expect(phaseOf(s)).toBe('roll');
  expect(s.turnIdx).toBe(1);
  // a retired player is skipped
  bb.money = 200000;
  bb.pos = retire.i - 1;
  rollAs(ctx, s, 'b', 1);
  expect(bb.retired).toBe(2);
  expect(bb.score!.total).toBe(200000 + R.retireBonus[1]);
  expect(phaseOf(s)).toBe('final');
  expect(s.winner).toBe('b');
  expect(fx).toContain('win:b');
  expect(life.turnOf!(s)).toEqual([]);
  expect(scoreOf(a).total).toBe(115000);
});

test('life: risky project rolls the die', () => {
  const { ctx, s } = game();
  const b = lifeBoard('normal');
  const a = s.players[0];
  a.ways[b.fork2] = 0;
  const risk = b.nodes.find((n) => n.kind === 'risk')!;
  a.pos = risk.i - 1;
  rollAs(ctx, s, 'a', 1);
  expect(choiceOf(s)?.kind).toBe('risk');
  const r = Math.random;
  Math.random = () => 0.99; // a six
  life.act(ctx, s, 'a', { type: 'risk', go: true });
  Math.random = r;
  expect(a.money).toBe(20000 + R.risk[2]);
  expect(s.dice).toBe(6);
  expect(phaseOf(s)).toBe('roll');
});

test('life: patchSettings validates', () => {
  const st = settings();
  life.patchSettings!(st, { length: 'short', startCash: 123456 });
  expect(st).toEqual({ length: 'short', startCash: 50000 });
  life.patchSettings!(st, { length: 'long', startCash: 'x' });
  expect(st).toEqual({ length: 'short', startCash: 50000 });
  life.patchSettings!(st, { startCash: 10200 });
  expect(st.startCash).toBe(10000);
});

/** A whole game with bots only (plays every scheduled bot action in time order). */
function botGame(ids: string[], length: 'short' | 'normal') {
  const q: { at: number; by: string; a: any }[] = [];
  const ctx = fakeCtx((by, a, d) => q.push({ at: ctx.now + d, by, a }));
  const s = life.start(ctx, ids, settings({ length }));
  let steps = 0;
  life.botPlan!(ctx, s, ids);
  while (s.phase !== 'final' && steps++ < 2000) {
    expect(q.length).toBe(1); // exactly one bot is asked to act at a time
    q.sort((x, y) => x.at - y.at);
    const job = q.shift()!;
    ctx.now = job.at;
    expect(job.by).toBe(life.turnOf!(s)[0]);
    life.act(ctx, s, job.by, job.a);
    life.tick?.(ctx, s);
    life.botPlan!(ctx, s, ids);
  }
  return s;
}

test('life: bot-only games reach the end (2–6 players, both lengths)', () => {
  for (const length of ['short', 'normal'] as const) {
    for (const n of [2, 4, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
      const s = botGame(ids, length);
      expect(phaseOf(s)).toBe('final');
      expect(s.players.every((p) => p.retired !== null && p.score !== null)).toBe(true);
      expect(new Set(s.players.map((p) => p.retired)).size).toBe(n);
      expect(s.winner).toBe([...s.players].sort((x, y) => y.score!.total - x.score!.total)[0].id);
      // every bot found a job
      expect(s.players.every((p) => p.job)).toBe(true);
      for (const p of s.players) expect(p.money).toBeGreaterThanOrEqual(0);
    }
  }
}, 30000);

test('life: stop spaces are never walked past', () => {
  for (let g = 0; g < 20; g++) {
    const s = botGame(['x', 'y', 'z'], g % 2 ? 'short' : 'normal');
    expect(phaseOf(s)).toBe('final');
  }
  const b = lifeBoard('normal');
  const ctx = fakeCtx();
  const { s } = game();
  const a = s.players[0];
  a.pos = 0;
  const path = walk(ctx, s, a, 50);
  expect(b.nodes[path[path.length - 1]].kind).toBe('fork');
  expect(path.slice(0, -1).every((i) => !LIFE_STOPS.includes(b.nodes[i].kind))).toBe(true);
});

test('life: onLeave removes the leaver; the game goes on or ends with a result', () => {
  const { ctx, s } = game(['a', 'b', 'c']);
  // b leaves while it's a's turn
  life.onLeave!(ctx, s, 'b');
  expect(s.players.map((p) => p.id)).toEqual(['a', 'c']);
  expect(life.turnOf!(s)).toEqual(['a']);
  // a leaves in the middle of a choice: c plays next
  s.phase = 'choose';
  s.choice = { kind: 'insure', price: R.insurance };
  life.onLeave!(ctx, s, 'a');
  expect(phaseOf(s)).toBe('final');
  expect(s.winner).toBe('c');
  expect(s.players[0].score).not.toBeNull();

  // the current player leaves while others remain
  const g = game(['a', 'b', 'c']);
  g.s.turnIdx = 1;
  g.s.phase = 'choose';
  g.s.choice = { kind: 'risk', title: 't' };
  life.onLeave!(g.ctx, g.s, 'b');
  expect(phaseOf(g.s)).toBe('roll');
  expect(g.s.choice).toBeNull();
  expect(life.turnOf!(g.s)).toEqual(['c']);
  // c leaves too: only a remains, the game ends
  life.onLeave!(g.ctx, g.s, 'c');
  expect(phaseOf(g.s)).toBe('final');

  // everyone else has retired: the leaver's departure ends the game
  const h = game(['a', 'b', 'c']);
  h.s.players[0].retired = 1;
  h.s.players[0].score = scoreOf(h.s.players[0]);
  h.s.players[1].retired = 2;
  h.s.turnIdx = 2;
  life.onLeave!(h.ctx, h.s, 'c');
  expect(phaseOf(h.s)).toBe('final');
  expect(h.s.winner).not.toBeNull();
});
