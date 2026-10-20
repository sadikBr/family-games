/** «كم تقدّر؟» — start, guesses, the hidden answer, scoring by distance, the reveal, the final, bots, settings. */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import type { EstimateView } from '../src/shared/games/estimate';
import { ESTIMATE } from './estimate-content';
import {
  BOT_SIGMA,
  ESTIMATE_REVEAL_MS,
  botDelay,
  botGuess,
  estimate,
  humanRound,
  isExact,
  readGuess,
  sanitizeEstimate,
  scoreGuesses,
  startEstimate,
  type EstimateState,
} from './games/estimate';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';
import { KNOW_VOICE, voiceClosestTo, voiceExact } from './voice-calls-knowledge';

const P = ['a', 'b', 'c'];
const view = (ctx: TestCtx, s: EstimateState, me: string) => estimate.view(ctx, s, me) as EstimateView;
const guess = (ctx: TestCtx, s: EstimateState, by: string, g: unknown) => estimate.act(ctx, s, by, { type: 'answer', round: s.round + 1, guess: g });

function start(ctx: TestCtx, ids = P, rounds = 5, seconds = 30) {
  return startEstimate(ctx, ids, { rounds, seconds }, seeded(1));
}

test('estimate: the default settings are valid and odd values snap to the allowed ones', () => {
  expect(sanitizeEstimate(DEFAULT_SETTINGS.estimate)).toEqual(DEFAULT_SETTINGS.estimate);
  expect(sanitizeEstimate({ rounds: 12, seconds: 99 })).toEqual({ rounds: 10, seconds: 45 });
  expect(sanitizeEstimate({ rounds: 'x' as never, seconds: undefined })).toEqual({ rounds: 10, seconds: 30 });
  expect(sanitizeEstimate(undefined)).toEqual({ rounds: 10, seconds: 30 });
  const s = { rounds: 10, seconds: 30 };
  estimate.patchSettings!(s, { rounds: 4, seconds: 21 });
  expect(s).toEqual({ rounds: 5, seconds: 20 });
  estimate.patchSettings!(s, { rounds: 'many', seconds: null });
  expect(s).toEqual({ rounds: 5, seconds: 20 });
});

test('estimate: a game deals the chosen number of different questions', () => {
  for (const rounds of [5, 10, 15]) {
    const ctx = fakeCtx();
    const s = start(ctx, P, rounds);
    expect(s.items.length).toBe(rounds);
    expect(new Set(s.items).size).toBe(rounds);
    expect(view(ctx, s, 'a').rounds).toBe(rounds);
  }
});

test('estimate: the answer and the fact never reach a phone before the reveal', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  const q = s.items[0];
  guess(ctx, s, 'a', 100);
  for (const me of P) {
    const v = view(ctx, s, me);
    expect(v.phase).toBe('ask');
    expect(v.answer).toBeNull();
    expect(v.fact).toBeNull();
    expect(v.results).toBeNull();
    expect(JSON.stringify(v).includes(q.fact)).toBe(false);
  }
  // my own guess is mine only
  expect(view(ctx, s, 'a').mine).toBe(100);
  expect(view(ctx, s, 'b').mine).toBeNull();
  expect(view(ctx, s, 'b').answered).toEqual(['a']);
});

test('estimate: guesses — numbers or typed text with Arabic-Indic digits; one each; bad ones refused', () => {
  expect(readGuess(210)).toBe(210);
  expect(readGuess('٢١٠')).toBe(210);
  expect(readGuess('1,500')).toBe(1500);
  expect(readGuess(-1)).toBeNull();
  expect(readGuess(NaN)).toBeNull();
  expect(readGuess(Infinity)).toBeNull();
  expect(readGuess(1e21)).toBeNull();
  expect(readGuess('abc')).toBeNull();
  expect(readGuess(null)).toBeNull();
  const ctx = fakeCtx();
  const s = start(ctx);
  guess(ctx, s, 'a', 'nope');
  expect(s.answers.a).toBeUndefined();
  guess(ctx, s, 'a', '٥٠');
  expect(s.answers.a.guess).toBe(50);
  guess(ctx, s, 'a', 70); // no second guess
  expect(s.answers.a.guess).toBe(50);
  guess(ctx, s, 'zz', 70); // not playing
  expect(s.answers.zz).toBeUndefined();
  estimate.act(ctx, s, 'b', { type: 'answer', round: 2, guess: 5 }); // another round's guess
  expect(s.answers.b).toBeUndefined();
});

test('estimate: places by distance (ties share), 3 / 2 / 1, exact +2, approximate within 1%', () => {
  const q = { a: 100, approx: false };
  const r = scoreGuesses(q, ['a', 'b', 'c', 'd', 'e'], { a: 100, b: 90, c: 110, d: 150, e: undefined });
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  expect(by.a).toMatchObject({ place: 1, exact: true, points: 5 });
  expect(by.b).toMatchObject({ place: 2, points: 2, diff: 10 });
  expect(by.c).toMatchObject({ place: 2, points: 2, diff: 10 });
  expect(by.d).toMatchObject({ place: 4, points: 0 });
  expect(by.e).toMatchObject({ guess: null, place: null, points: 0 });
  // approximate: 1% counts as exact
  expect(isExact({ a: 1000, approx: true }, 1009)).toBe(true);
  expect(isExact({ a: 1000, approx: true }, 1011)).toBe(false);
  expect(isExact({ a: 1000, approx: false }, 1001)).toBe(false);
  expect(isExact({ a: 42.195 }, 42.195)).toBe(true);
  // nobody exact: the closest still gets 3
  const r2 = scoreGuesses({ a: 50 }, ['a', 'b'], { a: 70, b: 10 });
  expect(r2.map((x) => x.points)).toEqual([3, 2]);
});

test('estimate: the round is revealed as soon as everyone answered, scores add up, the next round follows', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  const a = s.items[0].a;
  guess(ctx, s, 'a', a);
  guess(ctx, s, 'b', a * 2);
  expect(s.phase).toBe('ask');
  guess(ctx, s, 'c', a * 4);
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'b');
  expect(v.answer).toBe(a);
  expect(v.fact).toBe(s.items[0].fact);
  expect(v.results?.find((r) => r.id === 'a')?.points).toBe(5);
  expect(s.scores).toEqual({ a: 5, b: 2, c: 1 });
  expect(s.wins).toEqual({ a: 1 });
  // the say names the best guess, with its voice
  const last = ctx.said[ctx.said.length - 1];
  expect(last.voice).toBe(voiceExact('a'));
  expect(last.by).toBe('a');
  // the reveal moves on by itself
  ctx.now = s.endsAt!;
  estimate.tick!(ctx, s);
  expect(s.phase).toBe('ask');
  expect(s.round).toBe(1);
  expect(view(ctx, s, 'a').mine).toBeNull();
});

test('estimate: the timer reveals with whoever answered; the host can skip the reveal', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  guess(ctx, s, 'b', s.items[0].a * 1.5 + 1);
  ctx.now = s.endsAt! - 1;
  expect(estimate.tick!(ctx, s)).toBe(false);
  ctx.now = s.endsAt!;
  expect(estimate.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  expect(s.results?.find((r) => r.id === 'a')?.guess).toBeNull();
  expect(ctx.said[ctx.said.length - 1].voice).toBe(voiceClosestTo('b'));
  expect(estimate.hostOnly).toContain('next');
  estimate.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('ask');
  // nobody answers: «لا تقديرات»
  ctx.now = s.endsAt!;
  estimate.tick!(ctx, s);
  expect(ctx.said[ctx.said.length - 1].voice).toBe(KNOW_VOICE.noGuess);
});

test('estimate: after the last round, the final with the places', () => {
  const ctx = fakeCtx();
  const s = start(ctx, ['a', 'b'], 5);
  for (let r = 0; r < 5; r++) {
    guess(ctx, s, 'a', s.items[r].a);
    guess(ctx, s, 'b', s.items[r].a * 3 + 1);
    expect(s.phase).toBe('reveal');
    expect(estimate.result!(s)).toBeNull();
    ctx.now = s.endsAt!;
    estimate.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(estimate.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(ctx.fxs.some(([k, t]) => k === 'win' && t === 'a')).toBe(true);
  expect(ctx.said[ctx.said.length - 1].voice).toBe('الفَوْزُ لِa');
  expect(view(ctx, s, 'b').phase).toBe('final');
});

test('estimate: someone leaving: the round goes on without them; the last one alone ends nothing early', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  guess(ctx, s, 'a', 1);
  guess(ctx, s, 'b', 2);
  estimate.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b']);
  expect(s.scores.c).toBeUndefined();
  // an offline player isn't waited for
  ctx.now = s.endsAt!;
  estimate.tick!(ctx, s);
  ctx.offline.add('b');
  guess(ctx, s, 'a', 5);
  expect(s.phase).toBe('reveal');
});

test('estimate: bots — the expert is closer than the smart, the smart than the easy; a human pace', () => {
  const rnd = seeded(5);
  const err = (level: 'easy' | 'smart' | 'expert') => {
    let sum = 0;
    let n = 0;
    for (let k = 0; k < 6; k++) {
      for (const q of ESTIMATE) {
        const g = botGuess(level, q, rnd);
        expect(Number.isFinite(g)).toBe(true);
        expect(g).toBeGreaterThanOrEqual(0);
        sum += Math.min(3, Math.abs(g - q.a) / q.a);
        n++;
      }
    }
    return sum / n;
  };
  const e = { easy: err('easy'), smart: err('smart'), expert: err('expert') };
  expect(e.expert).toBeLessThan(e.smart);
  expect(e.smart).toBeLessThan(e.easy);
  // an expert isn't perfect
  expect(e.expert).toBeGreaterThan(0.02);
  expect(BOT_SIGMA.expert[0]).toBeLessThan(BOT_SIGMA.easy[0]);
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (let k = 0; k < 50; k++) {
      const d = botDelay(level, 30, rnd);
      expect(d).toBeGreaterThan(2000);
      expect(d).toBeLessThan(30000);
    }
  }
  expect(humanRound(36_812_345, 36_800_000)).toBe(37_000_000);
  expect(humanRound(29.46, 29.5)).toBe(29.5);
  expect(humanRound(7.4, 7)).toBe(7);
});

test('estimate: bots at every level play a whole game; nothing leaks before a reveal', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const bots = ['b1', 'b2', 'b3'];
    const ctx = fakeCtx(bots, level);
    const s = startEstimate(ctx, bots, { rounds: 10, seconds: 20 }, seeded(11));
    playOut(estimate as never, ctx, s, bots, (st) => {
      if (st.phase === 'ask') {
        const v = view(ctx, st, 'b1');
        expect(v.answer).toBeNull();
        expect(v.results).toBeNull();
      }
    });
    expect(s.phase).toBe('final');
    expect(s.round).toBe(9);
    expect(Object.values(s.scores).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(estimate.result!(s)?.places.flat().sort()).toEqual(bots);
    // every bot answered every round
    expect(ctx.jobs.length).toBe(30);
  }
});

test('estimate: the reveal lasts at the room pace', () => {
  const ctx = fakeCtx();
  ctx.pace = () => 1.5;
  const s = start(ctx, ['a']);
  guess(ctx, s, 'a', 1);
  expect(s.endsAt).toBe(ctx.now + ESTIMATE_REVEAL_MS * 1.5);
});
