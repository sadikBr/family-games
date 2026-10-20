/** «صح أم خطأ» — the hidden truth, scoring with speed, balance, the reveal, the final, bots, settings. */
import { expect, test } from 'bun:test';

import type { TruefalseView } from '../src/shared/games/truefalse';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { SQ_POINTS, SQ_SPEED_POINTS, speedPoints } from './games/speedquiz';
import { TF_BOT_KNOWS, sanitizeTruefalse, startTruefalse, truefalse, truefalseBotAnswer, type TruefalseState } from './games/truefalse';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';
import { KNOW_VOICE, voiceFastestRight } from './voice-calls-knowledge';

const P = ['a', 'b', 'c'];
const view = (ctx: TestCtx, s: TruefalseState, me: string) => truefalse.view(ctx, s, me) as TruefalseView;
const tap = (ctx: TestCtx, s: TruefalseState, by: string, yes: boolean) => truefalse.act(ctx, s, by, { type: 'answer', round: s.round + 1, choice: yes ? 0 : 1 });
const truth = (s: TruefalseState) => s.items[s.round].q.t;

test('truefalse: settings snap to 10/15/20 rounds and 8/12/15 seconds', () => {
  expect(sanitizeTruefalse(DEFAULT_SETTINGS.truefalse)).toEqual(DEFAULT_SETTINGS.truefalse);
  expect(sanitizeTruefalse({ rounds: 13, seconds: 9 })).toEqual({ rounds: 15, seconds: 8 });
  expect(sanitizeTruefalse({ rounds: 'x' as never })).toEqual({ rounds: 10, seconds: 12 });
  const s = { rounds: 10, seconds: 12 };
  truefalse.patchSettings!(s, { rounds: 100, seconds: 14 });
  expect(s).toEqual({ rounds: 20, seconds: 15 });
});

test('truefalse: each game has half true and half false statements, all different', () => {
  for (const rounds of [10, 15, 20]) {
    const ctx = fakeCtx();
    const s = startTruefalse(ctx, P, { rounds, seconds: 12 });
    expect(s.items.length).toBe(rounds);
    expect(new Set(s.items.map((i) => i.q)).size).toBe(rounds);
    const yes = s.items.filter((i) => i.q.t).length;
    expect(Math.abs(yes - (rounds - yes))).toBeLessThanOrEqual(1);
    for (const it of s.items) expect(it.correct).toBe(it.q.t ? 0 : 1);
  }
});

test('truefalse: the truth and the explanation stay on the server until the reveal', () => {
  const ctx = fakeCtx();
  const s = startTruefalse(ctx, P, { rounds: 10, seconds: 12 });
  tap(ctx, s, 'a', true);
  for (const me of P) {
    const v = view(ctx, s, me);
    expect(v.truth).toBeNull();
    expect(v.why).toBeNull();
    expect(v.results).toBeNull();
    expect(JSON.stringify(v).includes(s.items[0].q.why)).toBe(false);
  }
  expect(view(ctx, s, 'a').mine).toBe(true);
  expect(view(ctx, s, 'b').mine).toBeNull();
});

test('truefalse: a right answer scores 500 + speed; a wrong one 0; one tap each; bad taps refused', () => {
  expect(speedPoints(true, 0, 12000)).toBe(SQ_POINTS + SQ_SPEED_POINTS);
  expect(speedPoints(true, 6000, 12000)).toBe(750);
  expect(speedPoints(true, 12000, 12000)).toBe(500);
  expect(speedPoints(false, 100, 12000)).toBe(0);
  const ctx = fakeCtx();
  const s = startTruefalse(ctx, P, { rounds: 10, seconds: 12 });
  const t0 = ctx.now;
  truefalse.act(ctx, s, 'a', { type: 'answer', choice: 2 });
  truefalse.act(ctx, s, 'a', { type: 'answer', choice: 0.5 });
  truefalse.act(ctx, s, 'a', { type: 'answer', choice: '0' });
  expect(s.answers.a).toBeUndefined();
  ctx.now = t0 + 3000;
  tap(ctx, s, 'a', truth(s));
  tap(ctx, s, 'a', !truth(s)); // can't change
  ctx.now = t0 + 6000;
  tap(ctx, s, 'b', truth(s));
  tap(ctx, s, 'c', !truth(s));
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.a.points).toBe(875);
  expect(r.b.points).toBe(750);
  expect(r.c.points).toBe(0);
  expect(s.rights).toEqual({ a: 1, b: 1 });
  const v = view(ctx, s, 'c');
  expect(v.truth).toBe(truth(s));
  expect(v.why).toBe(s.items[0].q.why);
  expect(v.results?.find((x) => x.id === 'c')?.answer).toBe(!truth(s));
  expect(ctx.said[ctx.said.length - 1].voice).toBe(voiceFastestRight('a'));
});

test('truefalse: the timer, the host skipping, nobody right, the final', () => {
  const ctx = fakeCtx();
  const s = startTruefalse(ctx, ['a', 'b'], { rounds: 10, seconds: 8 });
  tap(ctx, s, 'a', !truth(s));
  ctx.now = s.endsAt!;
  truefalse.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(ctx.said[ctx.said.length - 1].voice).toBe(KNOW_VOICE.noRight);
  // an answer after the time is refused
  truefalse.act(ctx, s, 'b', { type: 'answer', choice: 0 });
  expect(s.answers.b).toBeUndefined();
  truefalse.act(ctx, s, 'b', { type: 'next' });
  expect(s.round).toBe(1);
  for (let r = 1; r < 10; r++) {
    tap(ctx, s, 'a', truth(s));
    tap(ctx, s, 'b', !truth(s));
    ctx.now = s.endsAt!;
    truefalse.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(truefalse.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(view(ctx, s, 'a').rights).toEqual({ a: 9 });
});

test('truefalse: bots know more at each level, never all of it; they read before answering', () => {
  const rnd = seeded(4);
  const rate = (level: 'easy' | 'smart' | 'expert') => {
    const ctx = fakeCtx();
    const s = startTruefalse(ctx, ['x'], { rounds: 20, seconds: 12 }, rnd);
    let right = 0;
    let n = 0;
    for (let k = 0; k < 150; k++) {
      s.round = k % s.items.length;
      const { choice, delay } = truefalseBotAnswer(level, s);
      expect(delay).toBeGreaterThan(500);
      expect(delay).toBeLessThan(12000);
      if (choice === s.items[s.round].correct) right++;
      n++;
    }
    return right / n;
  };
  const r = { easy: rate('easy'), smart: rate('smart'), expert: rate('expert') };
  expect(r.expert).toBeGreaterThan(r.smart);
  expect(r.smart).toBeGreaterThan(r.easy);
  expect(r.expert).toBeLessThan(0.99);
  expect(r.easy).toBeGreaterThan(0.5);
  expect(TF_BOT_KNOWS.expert[1]).toBeLessThan(TF_BOT_KNOWS.expert[0]);
});

test('truefalse: bots at every level play a whole game', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const bots = ['b1', 'b2'];
    const ctx = fakeCtx(bots, level);
    const s = startTruefalse(ctx, bots, { rounds: 15, seconds: 8 }, seeded(2));
    playOut(truefalse as never, ctx, s, bots, (st) => {
      if (st.phase === 'ask') expect(view(ctx, st, 'b1').truth).toBeNull();
    });
    expect(s.phase).toBe('final');
    expect(ctx.jobs.length).toBe(30);
    expect(truefalse.result!(s)).not.toBeNull();
  }
});

test('truefalse: leaving mid-round reveals when the others are done', () => {
  const ctx = fakeCtx();
  const s = startTruefalse(ctx, P, { rounds: 10, seconds: 12 });
  tap(ctx, s, 'a', true);
  tap(ctx, s, 'b', false);
  truefalse.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b']);
});

test('knowledge voice calls: vowelled Arabic, noun-first, no verb about a player', async () => {
  const { KNOW_VOICE: V, voiceClosestTo, voiceExact, voiceFastestRight: fastest } = await import('./voice-calls-knowledge');
  const calls = [...Object.values(V), voiceClosestTo('بابا'), voiceExact('بابا'), fastest('ماما'), voiceExact('الحسن')];
  for (const v of calls) {
    expect(v).toMatch(/^[ء-غف-يً-ْ]+( [ء-غف-يً-ْ]+)*$/);
    expect(v).toMatch(/[ً-ْ]/);
    expect(v.split(' ').length).toBeLessThanOrEqual(5);
  }
  expect(voiceExact('الحسن')).toBe('إِصَابَةٌ تَامَّةٌ لِلحسن');
  expect(voiceClosestTo('بابا')).toBe('الأَقْرَبُ بابا');
});
