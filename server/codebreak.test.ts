/** «فك الشيفرة» — marks, guesses, scoring, the race, bots, leaving, settings. */
import { expect, test } from 'bun:test';

import { CODEBREAK_DEFAULTS, codebreakMarks, type CodebreakSettings, type CodebreakView } from '../src/shared/games/codebreak';
import { allCodes, botGuess, consistent } from './codebreak-bot';
import { codebreak, codebreakPoints, FIRST_BONUS, HURRY_MS, REVEAL_MS, ROUND_MS, type CodebreakState } from './games/codebreak';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
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

const settings = (p: Partial<CodebreakSettings> = {}): CodebreakSettings => ({ ...CODEBREAK_DEFAULTS, ...p });

function setup(players: string[], p: Partial<CodebreakSettings> = {}, bots: string[] = []) {
  const ctx = fakeCtx(bots);
  const s = codebreak.start(ctx, players, settings(p));
  s.code = [0, 1, 2, 3].slice(0, s.settings.pegs);
  if (s.settings.pegs === 5) s.code.push(4);
  return { ctx, s };
}

const guess = (ctx: GameCtx, s: CodebreakState, by: string, code: number[]) => codebreak.act(ctx, s, by, { type: 'guess', code });

/** Run bots on a fake clock until the final screen. */
function runBots(ctx: ReturnType<typeof fakeCtx>, s: CodebreakState, bots: string[], maxSteps = 200_000) {
  let steps = 0;
  codebreak.botPlan!(ctx, s, bots);
  while (s.phase !== 'final' && steps++ < maxSteps) {
    ctx.now += 500;
    const due = ctx.jobs.filter((j) => j.at <= ctx.now).sort((a, b) => a.at - b.at);
    for (const j of due) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        codebreak.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
    }
    codebreak.tick!(ctx, s);
    codebreak.botPlan!(ctx, s, bots);
  }
  return steps;
}

test('marks: black and white, with repeated colours', () => {
  expect(codebreakMarks([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ black: 4, white: 0 });
  expect(codebreakMarks([3, 2, 1, 0], [0, 1, 2, 3])).toEqual({ black: 0, white: 4 });
  expect(codebreakMarks([4, 5, 4, 5], [0, 1, 2, 3])).toEqual({ black: 0, white: 0 });
  // repeats: a colour is counted only as often as it is in the code
  expect(codebreakMarks([0, 1, 0, 0], [0, 0, 1, 2])).toEqual({ black: 1, white: 2 });
  expect(codebreakMarks([1, 2, 1, 2], [1, 1, 1, 1])).toEqual({ black: 2, white: 0 });
  expect(codebreakMarks([1, 1, 1, 1], [1, 2, 3, 4])).toEqual({ black: 1, white: 0 });
  expect(codebreakMarks([2, 2, 1, 1], [1, 1, 2, 2])).toEqual({ black: 0, white: 4 });
  expect(codebreakMarks([5, 5, 5, 0], [0, 5, 3, 3])).toEqual({ black: 1, white: 1 });
  expect(codebreakMarks([0, 1, 2, 3, 4], [4, 1, 2, 3, 0])).toEqual({ black: 3, white: 2 });
});

test('all codes: counts with and without repeats', () => {
  expect(allCodes(4, 6, true).length).toBe(1296);
  expect(allCodes(4, 6, false).length).toBe(360);
  expect(allCodes(5, 8, true).length).toBe(32768);
  expect(allCodes(5, 8, false).length).toBe(6720);
  expect(allCodes(4, 6, false).every((c) => new Set(c).size === 4)).toBe(true);
});

test('a guess is checked: length, colours, repeats, already tried', () => {
  const { ctx, s } = setup(['a', 'b'], { repeats: false });
  expect(() => guess(ctx, s, 'a', [0, 1, 2])).toThrow(GameError);
  expect(() => guess(ctx, s, 'a', [0, 1, 2, 6])).toThrow(GameError);
  expect(() => guess(ctx, s, 'a', [0, 1, 2, 1.5])).toThrow(GameError);
  expect(() => guess(ctx, s, 'a', [0, 0, 1, 2])).toThrow(GameError);
  guess(ctx, s, 'a', [3, 2, 1, 0]);
  expect(s.rows.a[0]).toEqual({ guess: [3, 2, 1, 0], black: 0, white: 4 });
  expect(() => guess(ctx, s, 'a', [3, 2, 1, 0])).toThrow(GameError);
  // repeats allowed
  const r = setup(['a'], { repeats: true });
  guess(r.ctx, r.s, 'a', [0, 0, 0, 0]);
  expect(r.s.rows.a[0]).toMatchObject({ black: 1, white: 0 });
  // a guess for an earlier round (a late bot) is ignored
  guess(ctx, s, 'b', [0, 1, 2, 4]);
  codebreak.act(ctx, s, 'b', { type: 'guess', code: [5, 4, 2, 1], round: 7 });
  expect(s.rows.b.length).toBe(1);
});

test('scoring: tries, speed and the first-solver bonus', () => {
  expect(codebreakPoints(10, 1, 0, false)).toBe(1000 + 100);
  expect(codebreakPoints(10, 10, ROUND_MS, false)).toBe(100);
  expect(codebreakPoints(10, 5, ROUND_MS / 2, true)).toBe(600 + 50 + FIRST_BONUS);
  expect(codebreakPoints(8, 4, 0, false)).toBeLessThan(codebreakPoints(12, 4, 0, false));
});

test('the race: first to crack it gets the bonus, the round ends when everyone is done', () => {
  const { ctx, s } = setup(['a', 'b', 'c'], { rounds: 2 });
  guess(ctx, s, 'a', [1, 0, 2, 3]);
  ctx.now += 30_000;
  guess(ctx, s, 'b', [0, 1, 2, 3]); // b cracks it first, in 1 try
  expect(s.solved.b).toEqual({ order: 0, ms: 30_000 });
  // half are done (1 of 3 is not half): no hurry yet
  expect(s.hurried).toBe(false);
  ctx.now += 30_000;
  guess(ctx, s, 'a', [0, 1, 2, 3]); // a second, in 2 tries
  expect(s.hurried).toBe(true);
  expect(s.endsAt).toBe(ctx.now + HURRY_MS);
  expect(codebreak.turnOf!(s)).toEqual(['c']);
  // c runs out of tries
  const wrong = allCodes(4, 6, false).filter((c) => c.join() !== '0,1,2,3');
  for (let i = 0; i < s.settings.maxTries; i++) guess(ctx, s, 'c', wrong[i]);
  expect(s.phase).toBe('reveal');
  const res = Object.fromEntries(s.results!.map((r) => [r.id, r]));
  expect(res.b.first).toBe(true);
  expect(res.b.points).toBe(codebreakPoints(10, 1, 30_000, true));
  expect(res.a.points).toBe(codebreakPoints(10, 2, 60_000, false));
  expect(res.c).toMatchObject({ tries: null, points: 0 });
  expect(s.scores).toEqual({ a: res.a.points, b: res.b.points, c: 0 });
  expect(codebreak.turnOf!(s)).toEqual([]);
  // next round, then the final
  ctx.now += REVEAL_MS;
  codebreak.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(2);
  ctx.now += ROUND_MS;
  codebreak.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(ctx.fxs.at(-1)).toEqual(['win', 'b']);
});

test('view: the code and the others colours stay hidden', () => {
  const { ctx, s } = setup(['a', 'b']);
  guess(ctx, s, 'a', [3, 2, 1, 0]);
  const vb = codebreak.view(ctx, s, 'b') as CodebreakView;
  expect(vb.code).toBeNull();
  expect(vb.others[0]).toEqual({ id: 'a', rows: [{ black: 0, white: 4 }], solved: false, done: false });
  expect(JSON.stringify(vb.others)).not.toContain('guess');
  guess(ctx, s, 'a', [0, 1, 2, 3]);
  expect((codebreak.view(ctx, s, 'a') as CodebreakView).code).toEqual([0, 1, 2, 3]); // done: may see it
  expect((codebreak.view(ctx, s, 'b') as CodebreakView).code).toBeNull();
});

test('bots: every hard guess fits the clues; easy bots slip now and then', () => {
  const opts = { pegs: 4, colors: 6, repeats: true, level: 'hard' as const };
  const codes = allCodes(4, 6, true);
  let total = 0;
  for (let game = 0; game < 30; game++) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    const rows: { guess: number[]; black: number; white: number }[] = [];
    while (rows.length < 12) {
      const g = botGuess(rows, opts);
      expect(consistent([g], rows).length).toBe(1);
      rows.push({ guess: g, ...codebreakMarks(g, code) });
      if (rows.at(-1)!.black === 4) break;
    }
    expect(rows.at(-1)!.black).toBe(4);
    total += rows.length;
  }
  expect(total / 30).toBeLessThan(6.5);
  // easy: some guesses ignore a clue
  let slips = 0;
  for (let game = 0; game < 30; game++) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    const rows: { guess: number[]; black: number; white: number }[] = [];
    while (rows.length < 10) {
      const g = botGuess(rows, { ...opts, level: 'easy' });
      if (consistent([g], rows).length === 0) slips++;
      rows.push({ guess: g, ...codebreakMarks(g, code) });
      if (rows.at(-1)!.black === 4) break;
    }
  }
  expect(slips).toBeGreaterThan(0);
});

test('a full bot game reaches the final (1, 3 and 6 bots; every level and size)', () => {
  const cases: [number, Partial<CodebreakSettings>][] = [
    [1, { rounds: 1, level: 'easy' }],
    [3, { rounds: 3, level: 'medium', repeats: true }],
    [6, { rounds: 2, level: 'hard', pegs: 5, colors: 8, repeats: true, maxTries: 12 }],
    [2, { rounds: 2, level: 'easy', pegs: 5, colors: 8, repeats: false, maxTries: 8 }],
  ];
  for (const [n, p] of cases) {
    const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
    const ctx = fakeCtx(ids);
    const s = codebreak.start(ctx, ids, settings(p));
    runBots(ctx, s, ids);
    expect(s.phase).toBe('final');
    expect(s.round).toBe(p.rounds!);
    expect(Object.values(s.scores).some((v) => v > 0)).toBe(true);
    expect(ctx.fxs.some(([k]) => k === 'win')).toBe(true);
  }
});

test('a person playing with bots: bots plan only for themselves', () => {
  const ctx = fakeCtx(['b1']);
  const s = codebreak.start(ctx, ['me', 'b1'], settings({ rounds: 1 }));
  codebreak.botPlan!(ctx, s, ['b1']);
  expect(ctx.jobs.map((j) => j.by)).toEqual(['b1']);
  expect(codebreak.turnOf!(s).sort()).toEqual(['b1', 'me']);
});

test('leaving: the others go on, the round ends if only finished players remain', () => {
  const { ctx, s } = setup(['a', 'b', 'c'], { rounds: 2 });
  guess(ctx, s, 'a', [0, 1, 2, 3]);
  guess(ctx, s, 'b', [0, 1, 2, 3]);
  expect(s.phase).toBe('play');
  codebreak.onLeave!(ctx, s, 'c');
  expect(s.players).toEqual(['a', 'b']);
  expect(s.phase).toBe('reveal');
  expect(s.scores.c).toBeUndefined();
  codebreak.onLeave!(ctx, s, 'a');
  codebreak.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
});

test('settings are validated and clamped', () => {
  const st = settings();
  codebreak.patchSettings!(st, { pegs: 7, colors: 9, maxTries: 40, rounds: 0, level: 'genius', repeats: 'yes' });
  expect(st).toEqual({ ...CODEBREAK_DEFAULTS, rounds: 1, maxTries: 12 });
  codebreak.patchSettings!(st, { pegs: 5, colors: 8, maxTries: 3, rounds: 4.4, level: 'hard', repeats: true });
  expect(st).toEqual({ rounds: 4, pegs: 5, colors: 8, repeats: true, maxTries: 8, level: 'hard' });
});
