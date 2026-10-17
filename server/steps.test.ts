/** «رتّب الخطوات» — content integrity, scoring, round flow, bots, leaving, a full bot game. */
import { expect, test } from 'bun:test';

import { STEPS_CATEGORIES, stepsPoints, stepsRight, type StepsSettings, type StepsView } from '../src/shared/games/steps';
import { botOrder, sanitizeSteps, shuffleSteps, steps, stepsPool, STEPS_REVEAL_MS, type StepsState } from './games/steps';
import { STEP_SEQS } from './steps-content';
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

const SETTINGS: StepsSettings = { rounds: 4, seconds: 60, category: 'all', level: 'medium' };
const view = (ctx: GameCtx, s: StepsState, me: string) => steps.view(ctx, s, me) as StepsView;
const submit = (ctx: GameCtx, s: StepsState, by: string, order: number[]) => steps.act(ctx, s, by, { type: 'submit', order });

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 25+ sequences, 4–8 distinct steps each, unique ids, every category filled', () => {
  expect(STEP_SEQS.length).toBeGreaterThanOrEqual(25);
  expect(new Set(STEP_SEQS.map((q) => q.id)).size).toBe(STEP_SEQS.length);
  for (const q of STEP_SEQS) {
    expect(q.steps.length, q.id).toBeGreaterThanOrEqual(4);
    expect(q.steps.length, q.id).toBeLessThanOrEqual(8);
    expect(new Set(q.steps).size, q.id).toBe(q.steps.length);
    expect(q.title.trim().length, q.id).toBeGreaterThan(0);
    for (const st of q.steps) expect(st.trim(), q.id).toBe(st);
  }
  for (const c of STEPS_CATEGORIES) {
    if (c.key === 'all') continue;
    expect(stepsPool(c.key).length, c.key).toBeGreaterThanOrEqual(8);
  }
});

test('content: a few well-known orders are exactly right', () => {
  const by = (id: string) => STEP_SEQS.find((q) => q.id === id)!.steps;
  expect(by('wudu-fard')).toEqual(['غسل الوجه', 'غسل اليدين إلى المرفقين', 'مسح الرأس', 'غسل الرجلين إلى الكعبين']);
  expect(by('rashidun')).toEqual(['أبو بكر الصديق', 'عمر بن الخطاب', 'عثمان بن عفان', 'علي بن أبي طالب']);
  expect(by('ulul-azm')).toEqual(['نوح', 'إبراهيم', 'موسى', 'عيسى', 'محمد ﷺ']);
  expect([...by('months-1'), ...by('months-2')]).toHaveLength(12);
  expect(by('ghazawat').slice(0, 3)).toEqual(['بدر', 'أحد', 'الخندق']);
  expect(by('arkan-islam')).toHaveLength(5);
  expect(by('arkan-iman')).toHaveLength(6);
});

test('content: no dialect words in player-facing text', () => {
  const DIALECT = /(?:^|\s)(?:ماشي|يلا|شفت|بزاف|واش|ديال|كاين|دابا|هادي|هاد|علاش|فين|كيفاش|إيه|مش|عشان|هيك|شو|ليش)(?=\s|$|[،.؟!])/;
  for (const q of STEP_SEQS) for (const t of [q.title, q.note ?? '', ...q.steps]) expect(DIALECT.test(t), t).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

test('scoring: per-position credit, speed bonus only for a perfect order', () => {
  expect(stepsRight([0, 1, 2, 3], [0, 1, 2, 3])).toBe(4);
  expect(stepsRight([1, 0, 2, 3], [0, 1, 2, 3])).toBe(2);
  expect(stepsRight([3, 0, 1, 2], [0, 1, 2, 3])).toBe(0);
  expect(stepsPoints(4, 4, 60_000, 60_000)).toBe(1000);
  expect(stepsPoints(4, 4, 30_000, 60_000)).toBe(800);
  expect(stepsPoints(4, 4, 0, 60_000)).toBe(600);
  expect(stepsPoints(2, 4, 60_000, 60_000)).toBe(300); // no speed bonus
  expect(stepsPoints(0, 4, 60_000, 60_000)).toBe(0);
  expect(stepsPoints(7, 8, 60_000, 60_000)).toBe(525);
});

test('shuffle: never already in order, and `correct` maps back to the steps', () => {
  for (const q of STEP_SEQS) {
    for (let k = 0; k < 20; k++) {
      const { items, correct } = shuffleSteps(q);
      expect(correct.map((i) => items[i])).toEqual(q.steps);
      expect(items).not.toEqual(q.steps);
      expect([...correct].sort((a, b) => a - b)).toEqual([...q.steps.keys()]);
    }
  }
});

test('settings: sanitize and patch clamp everything', () => {
  expect(sanitizeSteps({ rounds: 1 } as never)).toEqual({ rounds: 3, seconds: 60, category: 'all', level: 'medium' });
  const st = sanitizeSteps({});
  steps.patchSettings!(st, { rounds: 99, seconds: 7, category: 'quran', level: 'hard' });
  expect(st).toEqual({ rounds: 12, seconds: 30, category: 'quran', level: 'hard' });
  steps.patchSettings!(st, { category: 'nope', level: 'x', seconds: 84 });
  expect(st.category).toBe('quran');
  expect(st.level).toBe('hard');
  expect(st.seconds).toBe(80);
});

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

test('a round: hidden answer while playing, scores on reveal, next round, final', () => {
  const ctx = fakeCtx();
  const s = steps.start(ctx, ['a', 'b', 'c'], SETTINGS) as StepsState;
  expect(s.phase).toBe('play');
  expect(s.seqs).toHaveLength(4);
  let v = view(ctx, s, 'a');
  expect(v.correct).toBeNull();
  expect(v.note).toBeNull();
  expect(v.items).toHaveLength(s.seqs[0].steps.length);
  expect(steps.turnOf!(s)).toEqual(['a', 'b', 'c']);

  // invalid orders are ignored
  submit(ctx, s, 'a', [0, 0, 1, 2]);
  submit(ctx, s, 'a', [0]);
  steps.act(ctx, s, 'a', { type: 'submit', order: 'x' });
  steps.act(ctx, s, 'z', { type: 'submit', order: s.correct });
  expect(Object.keys(s.subs)).toEqual([]);

  ctx.now += 15_000; // a: perfect after 15 s of 60
  submit(ctx, s, 'a', s.correct);
  submit(ctx, s, 'a', [...s.correct].reverse()); // can't change after sending
  expect(s.subs.a.order).toEqual(s.correct);
  expect(steps.turnOf!(s)).toEqual(['b', 'c']);
  const swapped = s.correct.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  submit(ctx, s, 'b', swapped);
  expect(s.phase).toBe('play');
  expect(view(ctx, s, 'b').mine).toEqual(swapped);
  submit(ctx, s, 'c', s.correct);
  expect(s.phase).toBe('reveal'); // everyone sent
  v = view(ctx, s, 'a');
  expect(v.correct).toEqual(s.correct);
  const n = s.correct.length;
  const res = Object.fromEntries(v.results!.map((r) => [r.id, r]));
  expect(res.a.right).toBe(n);
  expect(res.a.points).toBe(600 + 300);
  expect(res.b.right).toBe(n - 2);
  expect(res.b.points).toBe(Math.round((600 * (n - 2)) / n));
  expect(res.c.points).toBe(900);
  expect(s.scores.a).toBe(900);

  // the host goes on; a player can't
  steps.act(ctx, s, 'b', { type: 'next' });
  expect(s.round).toBe(1);
  expect(s.phase).toBe('play');
  expect(view(ctx, s, 'a').mine).toBeNull();

  // time runs out: nobody sent
  ctx.now = s.endsAt! + 1;
  expect(steps.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  expect(s.results!.every((r) => r.points === 0 && r.order === null)).toBe(true);
  ctx.now += STEPS_REVEAL_MS;
  steps.tick!(ctx, s);
  expect(s.round).toBe(2);
  for (let r = 2; r < 4; r++) {
    ctx.now = s.endsAt! + 1;
    steps.tick!(ctx, s);
    ctx.now = s.endsAt! + 1;
    steps.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]); // a and c are tied
  expect(steps.tick!(ctx, s)).toBe(false);
});

test('a stale submit for an old round is ignored', () => {
  const ctx = fakeCtx();
  const s = steps.start(ctx, ['a', 'b'], SETTINGS) as StepsState;
  steps.act(ctx, s, 'a', { type: 'submit', round: 2, order: s.correct });
  expect(s.subs.a).toBeUndefined();
  steps.act(ctx, s, 'a', { type: 'submit', round: 1, order: s.correct });
  expect(s.subs.a).toBeDefined();
});

test('offline players are not waited for; leaving ends the round or the game cleanly', () => {
  const ctx = fakeCtx();
  const s = steps.start(ctx, ['a', 'b', 'c'], SETTINGS) as StepsState;
  ctx.offline.add('c');
  submit(ctx, s, 'a', s.correct);
  submit(ctx, s, 'b', s.correct);
  expect(s.phase).toBe('reveal');
  steps.act(ctx, s, 'a', { type: 'next' });

  submit(ctx, s, 'a', s.correct);
  ctx.offline.delete('c');
  expect(s.phase).toBe('play');
  steps.onLeave!(ctx, s, 'b');
  steps.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal'); // only a is left and has sent
  expect(s.participants).toEqual(['a']);
  expect('b' in s.scores).toBe(false);
  steps.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
});

test('selected category only deals its sequences, never twice in a game', () => {
  const ctx = fakeCtx();
  const s = steps.start(ctx, ['a'], { ...SETTINGS, rounds: 12, category: 'quran' }) as StepsState;
  expect(s.seqs.every((q) => q.cat === 'quran')).toBe(true);
  expect(new Set(s.seqs).size).toBe(s.seqs.length);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: hard is almost always right, easy makes a few mistakes', () => {
  const correct = [3, 0, 5, 1, 4, 2];
  const perfect = (level: 'easy' | 'medium' | 'hard') => {
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      const o = botOrder(correct, level);
      expect([...o].sort()).toEqual([...correct].sort());
      if (stepsRight(o, correct) === correct.length) n++;
    }
    return n / 2000;
  };
  const easy = perfect('easy');
  const medium = perfect('medium');
  const hard = perfect('hard');
  expect(hard).toBeGreaterThan(0.8);
  expect(medium).toBeGreaterThan(easy);
  expect(easy).toBeLessThan(0.4);
  expect(easy).toBeGreaterThan(0.1);
});

/** Run a whole game the way the room does: plan → due jobs → tick, on a fake clock. */
function runBotGame(ids: string[], humans: string[] = [], settings = SETTINGS) {
  const bots = ids.filter((i) => !humans.includes(i));
  const ctx = fakeCtx(bots);
  const s = steps.start(ctx, ids, settings) as StepsState;
  const plan = () => steps.botPlan!(ctx, s, bots);
  plan();
  const phases = new Set<string>();
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 100_000) {
    ctx.now += 250;
    let changed = steps.tick!(ctx, s);
    for (const j of ctx.jobs.filter((x) => x.at <= ctx.now)) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        steps.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
      changed = true;
    }
    if (changed) plan();
    phases.add(s.phase);
  }
  return { s, ctx, phases };
}

test('a full bot game reaches the final screen (1, 2, 6 and 12 players, each level)', () => {
  for (const [n, level] of [
    [1, 'easy'],
    [2, 'medium'],
    [6, 'hard'],
    [12, 'easy'],
  ] as const) {
    const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
    const { s, ctx, phases } = runBotGame(ids, [], { ...SETTINGS, rounds: 5, level });
    expect(s.phase).toBe('final');
    expect(phases.has('reveal')).toBe(true);
    expect(s.round).toBe(4);
    expect(Object.values(s.scores).some((x) => x > 0)).toBe(true);
    expect(ctx.fxs.filter(([k]) => k === 'win')).toHaveLength(1);
    const v = view(ctx, s, 'bot0');
    expect(v.phase).toBe('final');
  }
});

test('with a person who never answers, bots still finish every round on the clock', () => {
  const { s } = runBotGame(['me', 'bot1', 'bot2'], ['me']);
  expect(s.phase).toBe('final');
  expect(s.scores.me).toBe(0);
});
