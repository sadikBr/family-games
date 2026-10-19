/** «الأسرع» — the mini-games' content, scoring by reaction time, the round flow, hidden answers, bots, leaving. */
import { expect, test } from 'bun:test';

import { FAST_DIRS, FAST_KINDS, type FastContent, type FastKind, type FastView } from '../src/shared/games/fast';
import { dealKinds, levelFor, makeFastItem, optionCount, scatter } from './fast-content';
import {
  BOT_BASE_MS,
  FAST_GRACE_MS,
  FAST_INTRO_MS,
  FAST_LIMIT_MS,
  FAST_MIN_MS,
  FAST_REVEAL_MS,
  FAST_SKEW_MS,
  botReactionMs,
  fast,
  parseAnswer,
  scoreRound,
  startFast,
  type FastState,
} from './games/fast';
import type { GameCtx } from './types';
import { FAST_NONE, FAST_VOICE, voiceFastest } from './voice-calls-fast';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Said = { text: string; by?: string; voice?: string };

function fakeCtx(bots: string[] = [], level: 'easy' | 'smart' | 'expert' = 'expert') {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const said: Said[] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; fxs: typeof fxs; said: Said[]; offline: Set<string> } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    say: (text, by, voice) => said.push({ text, by, voice }),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    fxs,
    said,
    offline,
  };
  return ctx;
}

/** A small seeded random (mulberry32), so a test can be replayed. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P = ['a', 'b', 'c'];
const view = (ctx: GameCtx, s: FastState, me: string) => fast.view(ctx, s, me) as FastView;
/** Jump to the moment the stimulus appears. */
const toShow = (ctx: GameCtx, s: FastState, after = 0) => {
  ctx.now = s.cur.showAt + after;
};
const answer = (ctx: GameCtx, s: FastState, by: string, ans: unknown, ms: number) => fast.act(ctx, s, by, { type: 'answer', round: s.round + 1, answer: ans, ms });

/** The right answer of the current round, read from the content the phones get (not from the state). */
function solve(c: FastContent): number | number[] {
  switch (c.kind) {
    case 'green':
      return 0;
    case 'odd': {
      const key = (i: number) => JSON.stringify(c.cells[i]);
      return c.cells.findIndex((_, i) => c.cells.filter((_, j) => key(j) === key(i)).length === 1);
    }
    case 'stars':
      return c.options.indexOf(c.stars.length);
    case 'stroop':
      return c.options.indexOf(c.ink);
    case 'biggest':
      return c.numbers.indexOf(Math.max(...c.numbers));
    case 'arrow':
      return FAST_DIRS.indexOf(c.dir);
    case 'match':
      return c.options.indexOf(c.target);
    case 'sum':
      return c.options.indexOf(c.op === '+' ? c.a + c.b : c.a - c.b);
    case 'order':
      return c.labels.map((_, k) => c.labels.indexOf(k + 1));
  }
}

/** A start whose first round is `kind`. */
function startWith(ctx: GameCtx, kind: FastKind, ids = P, rounds = 8, seed = 7) {
  for (let i = 0; i < 500; i++) {
    const s = startFast(ctx, ids, { rounds }, seeded(seed + i));
    if (s.cur.kind === kind) return s;
  }
  throw new Error(`no ${kind} start`);
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: every mini-game, at every level, has valid content and exactly one right answer', () => {
  const rnd = seeded(1);
  for (const kind of FAST_KINDS) {
    for (let level = 0; level <= 2; level++) {
      for (let k = 0; k < 150; k++) {
        const { content: c, answer } = makeFastItem(kind, level, rnd);
        expect(c.kind).toBe(kind);
        expect(solve(c)).toEqual(answer);
        const n = optionCount(c);
        if (c.kind === 'odd') {
          expect(c.cells.length).toBe(c.cols * c.cols);
          // all identical but one
          const counts = new Map<string, number>();
          for (const cell of c.cells) counts.set(JSON.stringify(cell), (counts.get(JSON.stringify(cell)) ?? 0) + 1);
          expect([...counts.values()].sort((x, y) => x - y)).toEqual([1, c.cells.length - 1]);
        }
        if (c.kind === 'stars') {
          expect(new Set(c.options).size).toBe(4);
          expect(c.options.filter((o) => o === c.stars.length).length).toBe(1);
          expect(Math.min(...c.options)).toBeGreaterThanOrEqual(1);
        }
        if (c.kind === 'stroop') {
          expect(c.word).not.toBe(c.ink);
          expect(new Set(c.options).size).toBe(4);
          expect(c.options).toContain(c.word); // the trap is always there
        }
        if (c.kind === 'biggest') {
          expect(new Set(c.numbers).size).toBe(6);
          expect(c.numbers.filter((x) => x === Math.max(...c.numbers)).length).toBe(1);
        }
        if (c.kind === 'match') {
          expect(new Set(c.options).size).toBe(c.options.length);
          expect(c.options.filter((o) => o === c.target).length).toBe(1);
        }
        if (c.kind === 'sum') {
          expect(new Set(c.options).size).toBe(4);
          const v = c.op === '+' ? c.a + c.b : c.a - c.b;
          expect(c.options.filter((o) => o === v).length).toBe(1);
          expect(Math.min(...c.options)).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(21);
        }
        if (c.kind === 'order') {
          expect([...c.labels].sort((x, y) => x - y)).toEqual(Array.from({ length: c.labels.length }, (_, i) => i + 1));
        }
        if (typeof answer === 'number') expect(answer >= 0 && answer < n).toBe(true);
      }
    }
  }
});

test('content: scattered spots (stars, numbers) never overlap and stay inside the stage', () => {
  const rnd = seeded(3);
  for (let k = 0; k < 300; k++) {
    const spots = scatter(rnd, 6, 3, 3, 0.25);
    for (const [x, y] of spots) expect(x > 0.05 && x < 0.95 && y > 0.05 && y < 0.95).toBe(true);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const dx = (spots[i][0] - spots[j][0]) * 3;
        const dy = (spots[i][1] - spots[j][1]) * 3;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(0.45); // at least half a cell apart
      }
  }
});

test('content: the kinds are dealt evenly, never the same twice in a row; difficulty grows by thirds', () => {
  for (const rounds of [8, 12, 16]) {
    for (let seed = 0; seed < 50; seed++) {
      const kinds = dealKinds(rounds, seeded(seed));
      expect(kinds.length).toBe(rounds);
      for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
      const counts = FAST_KINDS.map((k) => kinds.filter((x) => x === k).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  }
  expect([0, 1, 2, 3, 4, 5, 6, 7].map((r) => levelFor(r, 8))).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
});

test('answers: a phone may only send an answer the content allows', () => {
  const odd = makeFastItem('odd', 0, seeded(2)).content;
  expect(parseAnswer(3, odd)).toBe(3);
  expect(parseAnswer(9, odd)).toBeNull();
  expect(parseAnswer(-1, odd)).toBeNull();
  expect(parseAnswer(1.5, odd)).toBeNull();
  expect(parseAnswer('2', odd)).toBeNull();
  const order = makeFastItem('order', 0, seeded(2)).content;
  expect(parseAnswer([0, 1, 2, 3], order)).toEqual([0, 1, 2, 3]);
  expect(parseAnswer([0, 1, 1, 3], order)).toBeNull();
  expect(parseAnswer([0, 1, 2], order)).toBeNull();
  expect(parseAnswer(2, order)).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

test('scoring: ranked by reaction time, 5 / 3 / 2 then 1; equal times share a rank; wrong −1, never below 0', () => {
  const A = (ms: number | null, correct: boolean, early = false) => ({ answer: correct || ms !== null ? 0 : null, ms, early, correct });
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const res = scoreRound(
    ids,
    { a: A(520, true), b: A(310, true), c: A(700, true), d: A(400, true), e: A(250, false), f: A(null, false, true), g: A(900, true) },
    { e: 4, f: 0 },
  );
  const by = Object.fromEntries(res.map((r) => [r.id, r]));
  expect([by.b.rank, by.d.rank, by.a.rank, by.c.rank, by.g.rank]).toEqual([1, 2, 3, 4, 5]);
  expect([by.b.points, by.d.points, by.a.points, by.c.points, by.g.points]).toEqual([5, 3, 2, 1, 1]);
  // the fastest tap was wrong: it costs a point, it wins nothing
  expect(by.e).toMatchObject({ correct: false, rank: null, points: -1 });
  // too early with 0 points: stays at 0
  expect(by.f).toMatchObject({ early: true, points: 0 });
  // no answer: nothing
  expect(by.h).toMatchObject({ answer: null, ms: null, points: 0 });

  const tie = scoreRound(['a', 'b', 'c'], { a: A(400, true), b: A(400, true), c: A(450, true) }, {});
  expect(tie.map((r) => [r.rank, r.points])).toEqual([
    [1, 5],
    [1, 5],
    [3, 2],
  ]);
});

/* ------------------------------------------------------------------ */
/* Round flow                                                          */
/* ------------------------------------------------------------------ */

test('flow: intro, then the stimulus at showAt; reveal as soon as everyone answered; points and the fastest announced', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'arrow');
  expect(s.cur.startAt).toBe(ctx.now + FAST_INTRO_MS);
  expect(s.cur.showAt).toBe(s.cur.startAt);
  expect(ctx.fxs[0][0]).toBe('start');
  expect(ctx.said.at(-1)).toEqual({ text: '', by: undefined, voice: FAST_VOICE.arrow });
  const right = solve(s.cur.content) as number;
  toShow(ctx, s, 600);
  answer(ctx, s, 'b', right, 480);
  answer(ctx, s, 'a', right, 455);
  expect(s.phase).toBe('play');
  answer(ctx, s, 'a', (right + 1) % 4, 100); // a second answer is ignored
  answer(ctx, s, 'c', (right + 1) % 4, 300);
  expect(s.phase).toBe('reveal');
  expect(s.scores).toEqual({ a: 5, b: 3, c: 0 });
  expect(ctx.said.at(-1)).toEqual({ text: 'الأسرع: a (0.46 ث)', by: 'a', voice: voiceFastest('a') });
  expect(view(ctx, s, 'c').best).toEqual({ id: 'a', ms: 455, kind: 'arrow' });
  // the reveal stays, then the next round starts by itself
  ctx.now += FAST_REVEAL_MS - 1;
  expect(fast.tick!(ctx, s)).toBe(false);
  ctx.now += 1;
  expect(fast.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(1);
});

test('flow: the round ends at the time limit (plus the network grace) without everyone', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'sum');
  toShow(ctx, s, 900);
  answer(ctx, s, 'a', solve(s.cur.content), 850);
  ctx.now = s.cur.limitAt + FAST_GRACE_MS - 1;
  expect(fast.tick!(ctx, s)).toBe(false);
  ctx.now += 1;
  expect(fast.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  expect(s.results!.map((r) => [r.id, r.points])).toEqual([
    ['a', 5],
    ['b', 0],
    ['c', 0],
  ]);
  // nobody right at all: said so
  const ctx2 = fakeCtx();
  const s2 = startWith(ctx2, 'odd');
  ctx2.now = s2.cur.limitAt + FAST_GRACE_MS;
  fast.tick!(ctx2, s2);
  expect(ctx2.said.at(-1)).toEqual({ text: 'لا إجابة صحيحة في هذه الجولة', by: undefined, voice: FAST_NONE });
});

test('flow: a disconnected player is not waited for; the host can skip the reveal', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'match');
  ctx.offline.add('c');
  toShow(ctx, s, 500);
  answer(ctx, s, 'a', solve(s.cur.content), 400);
  answer(ctx, s, 'b', solve(s.cur.content), 420);
  expect(s.phase).toBe('reveal');
  fast.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('play');
  expect(fast.hostOnly).toContain('next');
});

test('green: a tap on red is too early (the phone says so, or the server sees it before the green)', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'green');
  expect(s.cur.showAt - s.cur.startAt).toBeGreaterThanOrEqual(1500);
  expect(s.cur.showAt - s.cur.startAt).toBeLessThanOrEqual(4500);
  s.scores.a = 3;
  ctx.now = s.cur.startAt + 200;
  fast.act(ctx, s, 'a', { type: 'answer', round: 1, early: true });
  // the phone claims a good tap, but it reached the server a second before the green
  ctx.now = s.cur.showAt - 1000;
  answer(ctx, s, 'b', 0, 250);
  toShow(ctx, s, 400);
  answer(ctx, s, 'c', 0, 330);
  expect(s.phase).toBe('reveal');
  const by = Object.fromEntries(s.results!.map((r) => [r.id, r]));
  expect(by.a).toMatchObject({ early: true, correct: false, points: -1 });
  expect(by.b).toMatchObject({ early: true, correct: false, points: 0 });
  expect(by.c).toMatchObject({ correct: true, rank: 1, points: 5, ms: 330 });
  expect(s.scores).toEqual({ a: 2, b: 0, c: 5 });
});

test('times: absurd reported times are capped; a time the server could not have seen is cut down', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'biggest');
  const right = solve(s.cur.content);
  toShow(ctx, s, 300);
  answer(ctx, s, 'a', right, 5); // faster than any person
  answer(ctx, s, 'b', right, 999_999); // more than the time there was
  fast.act(ctx, s, 'c', { type: 'answer', round: 1, answer: right }); // no time: the server's own view
  expect(s.answers.a.ms).toBe(FAST_MIN_MS);
  expect(s.answers.b.ms).toBe(300 + FAST_SKEW_MS);
  expect(s.answers.c.ms).toBe(300);
  // nothing before the stimulus is on the screens; nothing after the limit
  const ctx2 = fakeCtx();
  const s2 = startWith(ctx2, 'stroop');
  ctx2.now = s2.cur.showAt - 1000;
  answer(ctx2, s2, 'a', solve(s2.cur.content), 200);
  expect(s2.answers.a).toBeUndefined();
  ctx2.now = s2.cur.limitAt + FAST_GRACE_MS + 1;
  answer(ctx2, s2, 'a', solve(s2.cur.content), 200);
  expect(s2.answers.a).toBeUndefined();
  // an answer for another round is ignored
  toShow(ctx2, s2, 100);
  fast.act(ctx2, s2, 'a', { type: 'answer', round: 5, answer: solve(s2.cur.content), ms: 300 });
  expect(s2.answers.a).toBeUndefined();
  expect(FAST_LIMIT_MS.stroop).toBeGreaterThan(1000);
});

test('order: the taps in the right order win; one swap is wrong', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'order');
  const right = solve(s.cur.content) as number[];
  toShow(ctx, s, 2000);
  answer(ctx, s, 'a', right, 1800);
  answer(ctx, s, 'b', [right[1], right[0], ...right.slice(2)], 1500);
  answer(ctx, s, 'c', right, 1900);
  const by = Object.fromEntries(s.results!.map((r) => [r.id, r]));
  expect(by.a.points).toBe(5);
  expect(by.b.correct).toBe(false);
  expect(by.c.points).toBe(3);
});

test('views: no right answer and no one else’s answer before the reveal; everything after', () => {
  const ctx = fakeCtx();
  for (const kind of FAST_KINDS) {
    const s = startWith(ctx, kind);
    toShow(ctx, s, 400);
    answer(ctx, s, 'a', solve(s.cur.content), 380);
    const vb = view(ctx, s, 'b');
    expect(vb.answer).toBeNull();
    expect(vb.results).toBeNull();
    expect(vb.mine).toBeNull();
    expect(vb.answered).toEqual(['a']);
    expect(view(ctx, s, 'a').mine).toEqual({ answer: solve(s.cur.content), ms: 380, early: false });
    // the content itself never carries a field named for the answer
    expect(JSON.stringify(vb.content)).not.toMatch(/answer|correct|right/);
    answer(ctx, s, 'b', solve(s.cur.content), 500);
    answer(ctx, s, 'c', solve(s.cur.content), 600);
    const after = view(ctx, s, 'b');
    expect(after.phase).toBe('reveal');
    expect(after.answer).toEqual(solve(s.cur.content));
    expect(after.results!.length).toBe(3);
  }
});

test('turnOf: everyone answers at once — no «your turn» alert', () => {
  const ctx = fakeCtx();
  const s = startFast(ctx, P, { rounds: 8 });
  expect(fast.turnOf!(s)).toEqual([]);
});

test('settings: 8, 12 or 16 rounds', () => {
  const st = { rounds: 8 };
  fast.patchSettings!(st, { rounds: 12 });
  expect(st.rounds).toBe(12);
  fast.patchSettings!(st, { rounds: 100 });
  expect(st.rounds).toBe(16);
  fast.patchSettings!(st, { rounds: 9 });
  expect(st.rounds).toBe(8);
  fast.patchSettings!(st, { rounds: 'x' });
  expect(st.rounds).toBe(8);
  expect(startFast(fakeCtx(), P, { rounds: 13 }).kinds.length).toBe(12);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: human reaction times by strength, with spread, never instantaneous', () => {
  const rnd = seeded(11);
  const green = makeFastItem('green', 0, rnd).content;
  const sum = makeFastItem('sum', 1, rnd).content;
  const sample = (lvl: 'easy' | 'smart' | 'expert', c: FastContent) => Array.from({ length: 400 }, () => botReactionMs(lvl, c, rnd));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const e = sample('easy', green);
  const m = sample('smart', green);
  const x = sample('expert', green);
  expect(avg(e)).toBeGreaterThan(800);
  expect(avg(e)).toBeLessThan(1000);
  expect(avg(m)).toBeGreaterThan(500);
  expect(avg(m)).toBeLessThan(650);
  expect(avg(x)).toBeGreaterThan(330);
  expect(avg(x)).toBeLessThan(420);
  expect(Math.min(...x)).toBeGreaterThanOrEqual(BOT_BASE_MS.expert[0] * 0.8);
  expect(new Set(x).size).toBeGreaterThan(100); // natural variance
  // a sum takes longer than a simple green tap
  expect(avg(sample('expert', sum))).toBeGreaterThan(avg(x) + 300);
});

test('bots: easy bots slip now and then, expert bots almost never', () => {
  const tally = (level: 'easy' | 'expert') => {
    let wrong = 0;
    let total = 0;
    for (let g = 0; g < 40; g++) {
      const ctx = fakeCtx(['b1', 'b2'], level);
      const s = startFast(ctx, ['b1', 'b2'], { rounds: 16 }, seeded(100 + g));
      while (s.phase !== 'final') {
        fast.botPlan!(ctx, s, ['b1', 'b2']);
        for (const j of ctx.jobs.splice(0)) {
          ctx.now = Math.max(ctx.now, j.at);
          fast.act(ctx, s, j.by, j.a);
        }
        if (s.phase === 'play') {
          ctx.now = s.cur.limitAt + FAST_GRACE_MS;
          fast.tick!(ctx, s);
        }
        if (s.phase === 'reveal') {
          for (const r of s.results!) {
            total++;
            if (!r.correct) wrong++;
          }
          fast.act(ctx, s, 'b1', { type: 'next' });
        }
      }
    }
    return wrong / total;
  };
  const easy = tally('easy');
  const expert = tally('expert');
  expect(easy).toBeGreaterThan(0.06);
  expect(easy).toBeLessThan(0.3);
  expect(expert).toBeLessThan(0.05);
});

test('bots: the planned answer arrives after the stimulus, by the planned time', () => {
  const ctx = fakeCtx(['b'], 'smart');
  const s = startWith(ctx, 'arrow', ['h', 'b']);
  fast.botPlan!(ctx, s, ['b']);
  expect(ctx.jobs.length).toBe(1);
  const j = ctx.jobs[0];
  expect(j.at - s.cur.showAt).toBe(j.a.ms as number);
  expect(j.a.ms as number).toBeGreaterThan(300);
  // planned once per round
  fast.botPlan!(ctx, s, ['b']);
  expect(ctx.jobs.length).toBe(1);
});

test('bots: a whole game with three bots and one silent person reaches the final, with a result', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const bots = ['b1', 'b2', 'b3'];
    const ctx = fakeCtx(bots, level);
    const ids = ['h', ...bots];
    const s = fast.start(ctx, ids, { rounds: 12 });
    let steps = 0;
    while (s.phase !== 'final' && steps++ < 10_000) {
      fast.botPlan!(ctx, s, bots);
      const due = ctx.jobs.filter((j) => j.at <= ctx.now);
      for (const j of due) {
        ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
        fast.act(ctx, s, j.by, j.a);
      }
      ctx.now += 100;
      fast.tick!(ctx, s);
    }
    expect(s.phase).toBe('final');
    expect(s.round).toBe(11);
    const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(12 * 5);
    const r = fast.result!(s)!;
    expect(r.places.flat().sort()).toEqual([...ids].sort());
    expect(s.scores[r.places[0][0]]).toBe(Math.max(...Object.values(s.scores)));
    expect(ctx.fxs.at(-1)![0]).toBe('win');
  }
});

test('result: null while playing; places by score with ties sharing a place', () => {
  const ctx = fakeCtx();
  const s = startFast(ctx, P, { rounds: 8 });
  expect(fast.result!(s)).toBeNull();
  s.round = 7;
  s.phase = 'reveal';
  s.scores = { a: 10, b: 14, c: 10 };
  fast.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase as string).toBe('final');
  expect(fast.result!(s)).toEqual({ places: [['b'], ['a', 'c']] });
  expect(ctx.fxs.at(-1)).toEqual(['win', 'b']);
  expect(ctx.said.at(-1)!.voice).toBe('الفَوْزُ لِb');
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('leaving: the round goes on without them (and reveals if they were the last one awaited); too few ends the game', () => {
  const ctx = fakeCtx();
  const s = startWith(ctx, 'stroop', ['a', 'b', 'c', 'd']);
  toShow(ctx, s, 300);
  answer(ctx, s, 'a', solve(s.cur.content), 300);
  answer(ctx, s, 'b', solve(s.cur.content), 350);
  answer(ctx, s, 'c', solve(s.cur.content), 360);
  fast.onLeave!(ctx, s, 'd');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b', 'c']);
  expect('d' in s.scores).toBe(false);
  fast.onLeave!(ctx, s, 'a');
  expect(s.results!.map((r) => r.id)).toEqual(['b', 'c']);
  expect(view(ctx, s, 'b').best).toBeNull(); // the fastest left
  fast.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(fast.result!(s)).toEqual({ places: [['c']] });
  // someone not in the game leaving changes nothing
  fast.onLeave!(ctx, s, 'zz');
  expect(s.phase).toBe('final');
});

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

test('voice: short vowelled calls, Arabic letters and spaces only', () => {
  const CALL = /^[ء-غف-يً-ْ]+( [ء-غف-يً-ْ]+)*$/;
  for (const v of [...Object.values(FAST_VOICE), FAST_NONE, voiceFastest('بابا')]) {
    expect(v).toMatch(CALL);
    expect(v.split(' ').length).toBeLessThanOrEqual(5);
  }
  for (const v of [...Object.values(FAST_VOICE), FAST_NONE]) expect(v).toMatch(/[ً-ْ]/);
  expect(Object.keys(FAST_VOICE).sort()).toEqual([...FAST_KINDS].sort());
});
