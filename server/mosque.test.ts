/** «ابنِ المسجد» — question pool, bricks and pieces, rounds, bots and leaving. */
import { expect, test } from 'bun:test';

import { MOSQUE_DEFAULTS, MOSQUE_PIECES, MOSQUE_ROUNDS, type MosqueLevel, type MosqueSettings, type MosqueView } from '../src/shared/games/mosque';
import { MOSQUE_BUILT_MS, MOSQUE_POOL, MOSQUE_REVEAL_MS, mosque, mosqueBricks, mosqueCost, type MosqueState } from './games/mosque';
import { MOSQUE_FACTS } from './mosque-facts';
import { QUESTIONS } from './content-islamic';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: any;
}

function fakeCtx(bots: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; keys: Set<string>; fxs: typeof fxs; offline: Set<string> } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    keys,
    fxs,
    offline,
  };
  return ctx;
}

const settings = (patch: Partial<MosqueSettings> = {}): MosqueSettings => ({ ...MOSQUE_DEFAULTS, ...patch });
const view = (ctx: GameCtx, s: MosqueState, me = 'a') => mosque.view(ctx, s, me) as MosqueView;
const right = (s: MosqueState) => s.items[s.round - 1].correct;
const wrong = (s: MosqueState) => (right(s) + 1) % s.items[s.round - 1].options.length;

/** Everyone in `who` answers (right or wrong), then the reveal runs out. */
function round(ctx: ReturnType<typeof fakeCtx>, s: MosqueState, who: Record<string, boolean>, wait = 0) {
  ctx.now += wait;
  for (const [id, ok] of Object.entries(who)) mosque.act(ctx, s, id, { type: 'answer', choice: ok ? right(s) : wrong(s) });
}
function nextRound(ctx: ReturnType<typeof fakeCtx>, s: MosqueState) {
  ctx.now += MOSQUE_BUILT_MS;
  mosque.tick!(ctx, s);
}

test('pool: the Islamic bank plus mosque facts, each with one right answer among distinct options', () => {
  expect(MOSQUE_POOL.length).toBe(QUESTIONS.length + MOSQUE_FACTS.length);
  for (const q of MOSQUE_FACTS) {
    expect(q.w.length).toBe(3);
    expect(new Set([q.a, ...q.w]).size).toBe(4);
    expect(q.w).not.toContain(q.a);
  }
  // the extra facts don't repeat a bank question
  const bank = new Set(QUESTIONS.map((q) => q.q));
  for (const q of MOSQUE_FACTS) expect(bank.has(q.q)).toBe(false);
  expect(MOSQUE_PIECES.length).toBe(9);
});

test('rounds follow the level and questions do not repeat inside a game', () => {
  for (const level of ['easy', 'normal', 'hard'] as MosqueLevel[]) {
    const ctx = fakeCtx();
    const s = mosque.start(ctx, ['a'], settings({ level }));
    expect(s.items.length).toBe(MOSQUE_ROUNDS[level]);
    expect(new Set(s.items.map((i) => i.text)).size).toBe(s.items.length);
    for (const i of s.items) expect(i.correct).toBeGreaterThanOrEqual(0);
  }
});

test('bricks: 3 for a right answer, +1 in the first half of the timer; a piece costs 4 per player', () => {
  expect(mosqueBricks(true, true)).toBe(4);
  expect(mosqueBricks(true, false)).toBe(3);
  expect(mosqueBricks(false, true)).toBe(0);
  expect(mosqueCost(1)).toBe(4);
  expect(mosqueCost(8)).toBe(32);

  const ctx = fakeCtx();
  const s = mosque.start(ctx, ['a', 'b'], settings({ seconds: 20 }));
  round(ctx, s, { a: true }, 2000); // fast
  ctx.now += 12_000;
  round(ctx, s, { b: true }); // slow (14 s of 20)
  expect(s.phase).toBe('reveal');
  expect(s.results!.map((r) => [r.id, r.correct, r.fast, r.bricks])).toEqual([
    ['a', true, true, 4],
    ['b', true, false, 3],
  ]);
  expect(s.earned).toBe(7);
  expect(s.built).toBe(0);
  expect(s.bricks).toBe(7);
  nextRound(ctx, s);
  round(ctx, s, { a: true, b: false }, 1000);
  expect(s.built).toBe(1); // 7 + 4 = 11 ≥ 8: a piece, 3 carried over
  expect(s.bricks).toBe(3);
  expect(s.justBuilt).toEqual([0]);
  expect(ctx.fxs.at(-1)![0]).toBe('reveal'); // a finished piece is celebrated
  expect(s.stats).toEqual({ a: { right: 2, bricks: 8 }, b: { right: 1, bricks: 3 } });
});

test('a perfect family finishes the mosque in nine rounds', () => {
  const ctx = fakeCtx();
  const s = mosque.start(ctx, ['a', 'b', 'c'], settings({ level: 'hard' }));
  for (let r = 0; r < 9; r++) {
    expect(s.phase).toBe('ask');
    round(ctx, s, { a: true, b: true, c: true }, 500);
    expect(s.built).toBe(r + 1);
    nextRound(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(s.completed).toBe(true);
  expect(view(ctx, s).completed).toBe(true);
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]); // a team win: no single winner
});

test('when the rounds run out the mosque stays unfinished', () => {
  const ctx = fakeCtx();
  const s = mosque.start(ctx, ['a'], settings({ level: 'hard' }));
  for (let r = 0; r < MOSQUE_ROUNDS.hard; r++) {
    ctx.now += s.seconds * 1000; // nobody answers in time
    mosque.tick!(ctx, s);
    expect(s.phase).toBe('reveal');
    ctx.now += MOSQUE_REVEAL_MS;
    mosque.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(s.completed).toBe(false);
  expect(s.built).toBe(0);
  expect(ctx.fxs.at(-1)![0]).toBe('skip');
});

test('answers: one per player, only valid options; the answer stays hidden until the reveal', () => {
  const ctx = fakeCtx();
  const s = mosque.start(ctx, ['a', 'b'], settings());
  mosque.act(ctx, s, 'a', { type: 'answer', choice: 7 });
  mosque.act(ctx, s, 'z', { type: 'answer', choice: 0 });
  expect(s.answers).toEqual({});
  mosque.act(ctx, s, 'a', { type: 'answer', choice: 0 });
  mosque.act(ctx, s, 'a', { type: 'answer', choice: 1 });
  expect(s.answers.a.choice).toBe(0);
  const v = view(ctx, s, 'a');
  expect(v.correct).toBeNull();
  expect(v.results).toBeNull();
  expect(v.myAnswer).toBe(0);
  expect(view(ctx, s, 'b').myAnswer).toBeNull();
  expect(mosque.turnOf!(s)).toEqual(['b']);
  ctx.now += s.seconds * 1000;
  mosque.tick!(ctx, s);
  expect(view(ctx, s).correct).toBe(right(s));
});

test('settings: level must be known, seconds clamped to 10–30', () => {
  const s = { ...MOSQUE_DEFAULTS };
  mosque.patchSettings!(s, { level: 'hard', seconds: 99 });
  expect(s).toEqual({ level: 'hard', seconds: 30 });
  mosque.patchSettings!(s, { level: 'legendary', seconds: 2 });
  expect(s).toEqual({ level: 'hard', seconds: 10 });
});

test('onLeave: the leaver does not hold up the round; fewer builders make pieces cheaper', () => {
  const ctx = fakeCtx();
  const s = mosque.start(ctx, ['a', 'b', 'c'], settings());
  round(ctx, s, { a: true, b: true }, 500); // 8 bricks, a piece costs 12
  mosque.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.built).toBe(1); // now a piece costs 8
  expect(s.bricks).toBe(0);
  expect(s.results!.map((r) => r.id)).toEqual(['a', 'b']); // the leaver is out of the round
  nextRound(ctx, s);
  expect(view(ctx, s).cost).toBe(8);
  mosque.onLeave!(ctx, s, 'a');
  mosque.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(s.completed).toBe(false);
});

test('bot team-mates let the people answer first', () => {
  const ctx = fakeCtx(['bot']);
  const s = mosque.start(ctx, ['a', 'bot'], settings());
  mosque.botPlan!(ctx, s, ['bot']);
  expect(ctx.jobs.length).toBe(1);
  expect(ctx.jobs[0].at - ctx.now).toBeGreaterThanOrEqual(Math.min(2500, s.seconds * 250));
  ctx.now += 12_000; // the person answers after reading the question (long questions take ~10 s to read)
  mosque.act(ctx, s, 'a', { type: 'answer', choice: 0 });
  mosque.botPlan!(ctx, s, ['bot']);
  expect(ctx.jobs[1].at - ctx.now).toBeLessThanOrEqual(1600);
});

function runBotGame(n: number, level: MosqueLevel) {
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const ctx = fakeCtx(ids);
  const s = mosque.start(ctx, ids, settings({ level }));
  const plan = () => mosque.botPlan!(ctx, s, ids);
  plan();
  let guard = 0;
  const phases = new Set<string>();
  while (s.phase !== 'final' && guard++ < 20_000) {
    ctx.now += 250;
    let changed = mosque.tick!(ctx, s);
    const due = ctx.jobs.filter((j) => j.at <= ctx.now);
    for (const j of due) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        mosque.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
      changed = true;
    }
    if (changed) plan();
    phases.add(s.phase);
    expect(s.built).toBeLessThanOrEqual(MOSQUE_PIECES.length);
  }
  return { s, ctx, phases };
}

test('full bot games reach the final screen (1, 4 and 8 players, every level)', () => {
  const done: Record<MosqueLevel, number> = { easy: 0, normal: 0, hard: 0 };
  for (const level of ['easy', 'normal', 'hard'] as MosqueLevel[]) {
    for (const n of [1, 4, 8, 2, 6]) {
      const { s, ctx, phases } = runBotGame(n, level);
      expect(s.phase).toBe('final');
      expect(phases.has('reveal')).toBe(true);
      const v = view(ctx, s, 'bot0');
      expect(v.completed).toBe(s.built === MOSQUE_PIECES.length);
      if (v.completed) done[level]++;
      else expect(s.round).toBe(MOSQUE_ROUNDS[level]);
      const total = Object.values(s.stats).reduce((t, x) => t + x.bricks, 0);
      expect(total).toBeGreaterThan(0);
    }
  }
  expect(done.easy).toBeGreaterThan(0); // bots alone (all answering fast once nobody waits) finish an easy mosque
});
