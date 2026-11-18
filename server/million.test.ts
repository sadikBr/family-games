/**
 * «من سيربح المليون؟» — the ladder and the safe levels, the walk-away, each lifeline (once only; the
 * audience's chart = the audience's real answers; the friend's call and its timeout), the question's clock,
 * topics and rising difficulty, no question twice in a game, no leak of the right answer before the reveal
 * (contestant, audience, friend), the hot seat's rotation, bots, leaving, settings, the final places.
 */
import { expect, test } from 'bun:test';

import {
  MILLION_DEFAULTS,
  MILLION_FRIEND_MS,
  MILLION_LADDER,
  MILLION_POLL_MS,
  MILLION_STEP_LEVEL,
  formatMoney,
  prizeAt,
  safePrize,
  type MillionSettings,
  type MillionView,
} from '../src/shared/games/million';
import type { BotLevel } from '../src/shared/protocol';
import { QUESTIONS } from './content-islamic';
import { TRIVIA } from './content-trivia';
import { MILLION_AWAY_MS, MILLION_INTRO_MS, MILLION_TURN_END_MS, drawQuestion, lockMs, million, sanitizeMillion, startMillion, type MillionState } from './games/million';
import { knowChance, seatMove, type Mind } from './million-bot';
import { MILLION_EXTRA, millionPools } from './million-content';
import { ratedLevel } from './million-levels';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; keys: Set<string>; said: string[]; offline: Set<string>; fxs: string[] };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k) => ctx.fxs.push(k),
    say: (text) => ctx.said.push(text),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    keys,
    said: [],
    offline,
    fxs: [],
  };
  return ctx;
}

const settings = (o: Partial<MillionSettings> = {}): MillionSettings => ({ ...MILLION_DEFAULTS, ...o });
const act = (ctx: Ctx, s: MillionState, by: string, a: Record<string, unknown>) => million.act(ctx, s, by, a as never);
const view = (ctx: Ctx, s: MillionState, me: string) => million.view(ctx, s, me) as MillionView;

/** Move the clock and tick once. */
function wait(ctx: Ctx, s: MillionState, ms: number) {
  ctx.now += ms;
  million.tick!(ctx, s);
}

/** A game past the intro, the first question on screen. */
function begin(ids: string[], o: Partial<MillionSettings> = {}, ctx = fakeCtx()) {
  const s = startMillion(ctx, ids, settings(o));
  wait(ctx, s, MILLION_INTRO_MS + 10);
  return { s, ctx };
}

const wrongOf = (s: MillionState) => [0, 1, 2, 3].find((i) => i !== s.q!.correct && !s.removed.includes(i))!;

/** The contestant answers (final) and the reveal runs; returns after the next question appears (or the turn ends). */
function answer(ctx: Ctx, s: MillionState, right: boolean) {
  act(ctx, s, s.hot!, { type: 'final', choice: right ? s.q!.correct : wrongOf(s) });
  expect(s.phase).toBe('lock');
  wait(ctx, s, lockMs(14) + 10);
  expect(s.phase).toBe('reveal');
  wait(ctx, s, 5000);
}

/** Run like the room: bots act when due, the game ticks, bots plan after every change. */
function runRoom(ctx: Ctx, s: MillionState, bots: string[], maxMs = 3_000_000) {
  let t = 0;
  million.botPlan!(ctx, s, bots);
  while (s.phase !== 'final' && t < maxMs) {
    ctx.now += 250;
    t += 250;
    let changed = million.tick!(ctx, s);
    const due = ctx.jobs.filter((j) => j.at <= ctx.now);
    ctx.jobs = ctx.jobs.filter((j) => j.at > ctx.now);
    for (const j of due) {
      try {
        million.act(ctx, s, j.by, j.a as never);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
      changed = true;
    }
    if (changed) million.botPlan!(ctx, s, bots);
  }
}

/* ------------------------------------------------------------------ */

test('the ladder: 15 rungs to the million, safe at 1,000 and 32,000', () => {
  expect(MILLION_LADDER).toHaveLength(15);
  expect(MILLION_LADDER[14]).toBe(1_000_000);
  expect(prizeAt(0)).toBe(0);
  expect(prizeAt(5)).toBe(1000);
  expect(prizeAt(15)).toBe(1_000_000);
  expect([0, 4, 5, 9, 10, 14].map(safePrize)).toEqual([0, 0, 1000, 1000, 32000, 32000]);
  expect(formatMoney(1_000_000)).toBe('1,000,000');
  expect(formatMoney(125000)).toBe('125,000');
  expect(formatMoney(500)).toBe('500');
  // the rungs get harder, never easier
  for (let i = 1; i < 15; i++) expect(MILLION_STEP_LEVEL[i]).toBeGreaterThanOrEqual(MILLION_STEP_LEVEL[i - 1]);
});

test('settings are sanitised and patched within their options', () => {
  expect(sanitizeMillion({ rounds: 7, timer: 45, topic: 'x' as never })).toEqual(MILLION_DEFAULTS);
  expect(sanitizeMillion({ rounds: 2, timer: 30, topic: 'islamic' })).toEqual({ rounds: 2, timer: 30, topic: 'islamic' });
  const st = { ...MILLION_DEFAULTS };
  million.patchSettings!(st, { rounds: 2, timer: 60, topic: 'general' });
  expect(st).toEqual({ rounds: 2, timer: 60, topic: 'general' });
  million.patchSettings!(st, { rounds: 3, timer: 10, topic: 'sport' });
  expect(st).toEqual({ rounds: 2, timer: 60, topic: 'general' });
});

test('a turn: intro, then question 1; right answers climb the ladder; a wrong one drops to the safe level', () => {
  const ctx = fakeCtx();
  const s = startMillion(ctx, ['a', 'b', 'c'], settings());
  expect(s.phase).toBe('intro');
  expect(s.hot).toBe('a');
  expect(view(ctx, s, 'a').question).toBeNull();
  wait(ctx, s, MILLION_INTRO_MS + 10);
  expect(s.phase).toBe('ask');
  for (let i = 0; i < 6; i++) answer(ctx, s, true);
  expect(s.won).toBe(6);
  expect(s.step).toBe(6);
  expect(s.phase).toBe('ask');
  answer(ctx, s, false);
  expect(s.phase).toBe('turnEnd');
  expect(s.history[0]).toMatchObject({ id: 'a', won: 6, prize: 1000, outcome: 'wrong' });
  expect(s.prizes.a).toBe(1000);
  wait(ctx, s, MILLION_TURN_END_MS + 10);
  expect(s.phase).toBe('intro');
  expect(s.hot).toBe('b');
});

test('a wrong answer before question 5 leaves nothing; after question 10 it keeps 32,000', () => {
  const { s, ctx } = begin(['a', 'b']);
  answer(ctx, s, true);
  answer(ctx, s, false);
  expect(s.history[0].prize).toBe(0);
  wait(ctx, s, MILLION_TURN_END_MS + 10);
  wait(ctx, s, MILLION_INTRO_MS + 10);
  expect(s.hot).toBe('b');
  for (let i = 0; i < 12; i++) answer(ctx, s, true);
  answer(ctx, s, false);
  expect(s.history[1]).toMatchObject({ id: 'b', won: 12, prize: 32000 });
});

test('fifteen right answers: the million', () => {
  const { s, ctx } = begin(['a']);
  for (let i = 0; i < 15; i++) answer(ctx, s, true);
  expect(s.phase).toBe('turnEnd');
  expect(s.history[0]).toMatchObject({ prize: 1_000_000, outcome: 'million', won: 15 });
  expect(ctx.said.some((t) => t.includes('المليون'))).toBe(true);
});

test('walking away keeps the prize reached; the right answer is then shown', () => {
  const { s, ctx } = begin(['a', 'b']);
  for (let i = 0; i < 8; i++) answer(ctx, s, true);
  act(ctx, s, 'b', { type: 'walk' }); // not in the seat: ignored
  expect(s.phase).toBe('ask');
  act(ctx, s, 'a', { type: 'walk' });
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'b');
  expect(v.outcome).toBe('walk');
  expect(v.correct).toBe(s.q!.correct);
  wait(ctx, s, 5000);
  expect(s.history[0]).toMatchObject({ prize: 8000, outcome: 'walk' });
});

test('50:50 removes two wrong answers, once per turn; a removed answer cannot be chosen', () => {
  const { s, ctx } = begin(['a', 'b']);
  act(ctx, s, 'a', { type: 'fifty' });
  expect(s.removed).toHaveLength(2);
  expect(s.removed).not.toContain(s.q!.correct);
  expect(view(ctx, s, 'a').removed).toEqual(s.removed);
  expect(view(ctx, s, 'a').used.fifty).toBe(true);
  expect(() => act(ctx, s, 'a', { type: 'final', choice: s.removed[0] })).toThrow(GameError);
  answer(ctx, s, true);
  expect(s.removed).toEqual([]);
  act(ctx, s, 'a', { type: 'fifty' });
  expect(s.removed).toEqual([]);
});

test('ask the audience: the chart is the audience’s real answers; it waits for them, once per turn', () => {
  const ctx = fakeCtx();
  const { s } = begin(['a', 'b', 'c', 'd'], {}, ctx);
  const c = s.q!.correct;
  const w = wrongOf(s);
  act(ctx, s, 'b', { type: 'answer', choice: c });
  act(ctx, s, 'b', { type: 'answer', choice: w }); // one answer only
  expect(s.answers.b).toBe(c);
  // the contestant can't answer as the audience
  act(ctx, s, 'a', { type: 'answer', choice: c });
  expect(s.answers.a).toBeUndefined();
  expect(view(ctx, s, 'a').poll).toBeNull();
  act(ctx, s, 'a', { type: 'audience' });
  expect(s.phase).toBe('poll');
  expect(million.turnOf!(s).sort()).toEqual(['c', 'd']);
  act(ctx, s, 'c', { type: 'answer', choice: w });
  expect(s.phase).toBe('poll');
  act(ctx, s, 'd', { type: 'answer', choice: c });
  expect(s.phase).toBe('ask');
  const expected = [0, 0, 0, 0];
  expected[c] = 2;
  expected[w] = 1;
  expect(view(ctx, s, 'a').poll).toEqual(expected);
  act(ctx, s, 'a', { type: 'audience' });
  expect(s.phase).toBe('ask');
  // audience points at the reveal: b and d were right
  answer(ctx, s, true);
  expect(s.audiencePts).toMatchObject({ b: 1, c: 0, d: 1, a: 0 });
});

test('the poll closes after its wait even if someone never votes', () => {
  const { s, ctx } = begin(['a', 'b', 'c']);
  act(ctx, s, 'b', { type: 'answer', choice: s.q!.correct });
  act(ctx, s, 'a', { type: 'audience' });
  wait(ctx, s, MILLION_POLL_MS + 10);
  expect(s.phase).toBe('ask');
  expect(s.poll!.reduce((x, y) => x + y, 0)).toBe(1);
});

test('a player alone: no audience, no friend', () => {
  const { s, ctx } = begin(['a']);
  const v = view(ctx, s, 'a');
  expect(v.canAudience).toBe(false);
  expect(v.canFriend).toBe(false);
  expect(() => act(ctx, s, 'a', { type: 'audience' })).toThrow(GameError);
  expect(() => act(ctx, s, 'a', { type: 'friend', to: 'b' })).toThrow(GameError);
  answer(ctx, s, false);
  wait(ctx, s, MILLION_TURN_END_MS + 10);
  expect(s.phase).toBe('final');
  expect(million.result!(s)).toEqual({ places: [['a']] });
});

test('phone a friend: the friend sees the question and answers; once per turn; the clock waits', () => {
  const { s, ctx } = begin(['a', 'b', 'c'], { timer: 30 });
  ctx.now += 10_000;
  expect(() => act(ctx, s, 'a', { type: 'friend', to: 'a' })).toThrow(GameError); // not oneself
  expect(() => act(ctx, s, 'a', { type: 'friend', to: 'zz' })).toThrow(GameError);
  act(ctx, s, 'a', { type: 'friend', to: 'c' });
  expect(s.phase).toBe('call');
  expect(million.turnOf!(s)).toEqual(['c']);
  const vc = view(ctx, s, 'c');
  expect(vc.call?.friend).toBe('c');
  expect(vc.question?.text).toBe(s.q!.text);
  expect(vc.correct).toBeNull();
  expect(vc.pausedLeft).toBe(20_000);
  // the clock doesn't run during the call
  wait(ctx, s, 25_000);
  expect(s.phase).toBe('call');
  act(ctx, s, 'b', { type: 'tell', choice: 0, sure: true }); // not the friend
  expect(s.call!.done).toBe(false);
  act(ctx, s, 'c', { type: 'tell', choice: s.q!.correct, sure: true });
  expect(s.phase).toBe('ask');
  expect(view(ctx, s, 'a').call).toMatchObject({ friend: 'c', answer: s.q!.correct, sure: true, done: true });
  expect(s.clockEnds).toBe(ctx.now + 20_000);
  act(ctx, s, 'a', { type: 'friend', to: 'b' });
  expect(s.phase).toBe('ask');
});

test('phone a friend: no answer within 30 seconds ends the call', () => {
  const { s, ctx } = begin(['a', 'b']);
  act(ctx, s, 'a', { type: 'friend', to: 'b' });
  wait(ctx, s, MILLION_FRIEND_MS + 10);
  expect(s.phase).toBe('ask');
  expect(s.call).toMatchObject({ friend: 'b', answer: null, done: true });
  act(ctx, s, 'b', { type: 'tell', choice: 0, sure: true });
  expect(s.call!.answer).toBeNull();
});

test('the timer: an unanswered question ends the turn with the prize reached', () => {
  const { s, ctx } = begin(['a', 'b'], { timer: 30 });
  answer(ctx, s, true);
  answer(ctx, s, true);
  expect(view(ctx, s, 'a').endsAt).toBe(s.clockEnds);
  expect(view(ctx, s, 'a').timerTotal).toBe(30_000);
  wait(ctx, s, 30_000);
  expect(s.phase).toBe('reveal');
  expect(s.outcome).toBe('time');
  wait(ctx, s, 5000);
  expect(s.history[0]).toMatchObject({ prize: 200, outcome: 'time' });
});

test('no timer: a contestant away for a minute walks away', () => {
  const { s, ctx } = begin(['a', 'b']);
  answer(ctx, s, true);
  ctx.offline.add('a');
  wait(ctx, s, 1000);
  wait(ctx, s, MILLION_AWAY_MS);
  expect(s.outcome).toBe('away');
  wait(ctx, s, 5000);
  expect(s.history[0]).toMatchObject({ prize: 100, outcome: 'away' });
});

test('no leak: nobody sees the right answer or another audience answer before the reveal', () => {
  const { s, ctx } = begin(['a', 'b', 'c']);
  act(ctx, s, 'b', { type: 'answer', choice: s.q!.correct });
  act(ctx, s, 'a', { type: 'friend', to: 'c' });
  for (const me of ['a', 'b', 'c']) {
    const v = view(ctx, s, me);
    expect(v.correct).toBeNull();
    expect(v.audienceRight).toBeNull();
    expect(v.poll).toBeNull();
    expect(v.myAnswer).toBe(me === 'b' ? s.q!.correct : null);
    expect(v.answered).toEqual(['b']);
    expect(JSON.stringify(v)).not.toContain('"answers"');
  }
  act(ctx, s, 'c', { type: 'tell', choice: wrongOf(s), sure: false });
  act(ctx, s, 'a', { type: 'final', choice: s.q!.correct });
  // locked: lit for everyone, still not revealed
  for (const me of ['a', 'b', 'c']) {
    const v = view(ctx, s, me);
    expect(v.locked).toBe(s.q!.correct);
    expect(v.correct).toBeNull();
  }
  wait(ctx, s, lockMs(0) + 10);
  expect(view(ctx, s, 'c').correct).toBe(s.q!.correct);
  expect(view(ctx, s, 'c').audienceRight).toEqual(['b']);
});

test('the hot seat turns: every player in seat order, twice with two rounds', () => {
  const ctx = fakeCtx();
  const s = startMillion(ctx, ['a', 'b', 'c'], settings({ rounds: 2 }));
  const seats: string[] = [];
  while (s.phase !== 'final') {
    seats.push(s.hot!);
    expect(view(ctx, s, 'a').audience).toEqual(['a', 'b', 'c'].filter((p) => p !== s.hot));
    wait(ctx, s, MILLION_INTRO_MS + 10);
    answer(ctx, s, false);
    million.act(ctx, s, 'a', { type: 'next' });
  }
  expect(seats).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  expect(view(ctx, s, 'a').turns).toBe(6);
});

test('topics and difficulty: questions from the chosen quiz, harder rung by rung', () => {
  const ctx = fakeCtx();
  const isl = new Set(QUESTIONS.map((q) => q.q));
  const gen = new Set([...TRIVIA.map((q) => q.q), ...MILLION_EXTRA.map((q) => q.q)]);
  const sums = Array(15).fill(0);
  const N = 30;
  for (let n = 0; n < N; n++) {
    const used = new Set<string>();
    for (let step = 0; step < 15; step++) {
      const g = drawQuestion(ctx, 'general', step, used);
      expect(gen.has(g.text)).toBe(true);
      const i = drawQuestion(ctx, 'islamic', step, used);
      expect(isl.has(i.text)).toBe(true);
      const m = drawQuestion(ctx, 'mixed', step, used);
      expect(gen.has(m.text) || isl.has(m.text)).toBe(true);
      for (const q of [g, i, m]) {
        expect(q.lv).toBe(MILLION_STEP_LEVEL[step]);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        for (const k of q.keys) used.add(k);
      }
      sums[step] += g.lv;
    }
  }
  expect(sums[14] / N).toBeGreaterThan(sums[0] / N + 3);
});

test('the pools: almost every question rated, enough of each level, the added questions well-formed', () => {
  const all = [...TRIVIA, ...QUESTIONS];
  const rated = all.filter((q) => ratedLevel(q.q) !== null).length;
  expect(rated / all.length).toBeGreaterThan(0.95);
  const pools = millionPools();
  for (const topic of ['general', 'islamic', 'mixed'] as const) {
    for (let lv = 1; lv <= 5; lv++) expect(pools[topic][lv].length).toBeGreaterThanOrEqual(25);
    // more than any game can ask (10 players × 2 turns × 15 questions)
    expect(pools[topic].flat().length).toBeGreaterThan(300);
  }
  for (const q of MILLION_EXTRA) {
    expect([4, 5]).toContain(q.lv);
    expect(new Set([q.a, ...q.w]).size).toBe(4);
    expect(q.q.trim()).toBe(q.q);
  }
  const texts = [...TRIVIA.map((q) => q.q), ...MILLION_EXTRA.map((q) => q.q)];
  expect(new Set(texts).size).toBe(texts.length);
});

test('no question twice in a game, even ten players with two turns each going all the way', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const ctx = fakeCtx();
  const s = startMillion(ctx, ids, settings({ rounds: 2, topic: 'general' }));
  const seen: string[] = [];
  while (s.phase !== 'final') {
    wait(ctx, s, MILLION_INTRO_MS + 10);
    for (let i = 0; i < 15; i++) {
      seen.push(s.q!.text);
      answer(ctx, s, true);
    }
    million.act(ctx, s, 'a', { type: 'next' });
  }
  expect(seen).toHaveLength(300);
  expect(new Set(seen).size).toBe(300);
});

test('final places: the prizes, ties broken by audience points', () => {
  const { s } = begin(['a', 'b', 'c']);
  s.prizes = { a: 1000, b: 1000, c: 32000 };
  s.audiencePts = { a: 3, b: 5, c: 0 };
  s.phase = 'final';
  expect(million.result!(s)).toEqual({ places: [['c'], ['b'], ['a']] });
  s.audiencePts.a = 5;
  expect(million.result!(s)).toEqual({ places: [['c'], ['a', 'b']] });
});

test('leaving: the contestant mid-turn (next turn), the friend during a call, an audience member during the poll', () => {
  const { s, ctx } = begin(['a', 'b', 'c', 'd'], { rounds: 2 });
  answer(ctx, s, true);
  million.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('intro');
  expect(s.hot).toBe('b');
  expect(s.participants).toEqual(['b', 'c', 'd']);
  expect(s.history).toEqual([]);
  wait(ctx, s, MILLION_INTRO_MS + 10);
  act(ctx, s, 'b', { type: 'friend', to: 'c' });
  million.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('ask');
  expect(s.call).toMatchObject({ answer: null, done: true });
  expect(view(ctx, s, 'b').audience).toEqual(['d']);
  act(ctx, s, 'b', { type: 'audience' });
  expect(s.phase).toBe('poll');
  million.onLeave!(ctx, s, 'd');
  expect(s.phase).toBe('ask');
  // b plays on alone; a's second turn is skipped
  answer(ctx, s, false);
  wait(ctx, s, MILLION_TURN_END_MS + 10);
  expect(s.hot).toBe('b');
  wait(ctx, s, MILLION_INTRO_MS + 10);
  answer(ctx, s, false);
  wait(ctx, s, MILLION_TURN_END_MS + 10);
  expect(s.phase).toBe('final');
  expect(million.result!(s)).toEqual({ places: [['b']] });
  million.onLeave!(ctx, s, 'b');
  expect(million.result!(s)).toBeNull();
});

test('bots: a whole game of bots ends, using lifelines and audience votes along the way', () => {
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    const ids = ['b1', 'b2', 'b3', 'b4'];
    const ctx = fakeCtx(ids, level);
    const s = startMillion(ctx, ids, settings({ rounds: 2, timer: 30 }));
    runRoom(ctx, s, ids);
    expect(s.phase).toBe('final');
    expect(s.history).toHaveLength(8);
    const lifelines = ctx.said.filter((t) => t.startsWith('حذف إجابتين') || t.startsWith('اسأل الجمهور') || t.startsWith('اتصال بصديق')).length;
    const polled = Object.values(s.audiencePts).reduce((a, b) => a + b, 0);
    expect(lifelines).toBeGreaterThan(0);
    expect(polled).toBeGreaterThan(0);
    expect(million.result!(s)!.places.flat().sort()).toEqual(ids);
  }
});

test('bots: a human contestant asks bots — they vote and answer the call by their level', () => {
  const ctx = fakeCtx(['b1', 'b2'], 'expert');
  const { s } = begin(['h', 'b1', 'b2'], {}, ctx);
  act(ctx, s, 'h', { type: 'audience' });
  runRoom(ctx, s, ['b1', 'b2'], 6000);
  expect(s.phase).toBe('ask');
  expect(s.poll!.reduce((a, b) => a + b, 0)).toBe(2);
  act(ctx, s, 'h', { type: 'friend', to: 'b1' });
  runRoom(ctx, s, ['b1', 'b2'], 15_000);
  expect(s.call).toMatchObject({ friend: 'b1', done: true });
  expect(s.call!.answer).not.toBeNull();
});

test('bots in the seat: the expert climbs higher than the easy bot on average; unsure at a high rung, some walk away', () => {
  const mean = (level: BotLevel) => {
    let total = 0;
    const N = 40;
    for (let n = 0; n < N; n++) {
      const ctx = fakeCtx(['b'], level);
      const s = startMillion(ctx, ['b'], settings());
      runRoom(ctx, s, ['b']);
      total += s.history[0].won;
    }
    return total / N;
  };
  expect(mean('expert')).toBeGreaterThan(mean('easy'));
  expect(knowChance('expert', 5)).toBeGreaterThan(knowChance('easy', 5));
  // nothing left to help at question 12 with 64,000 at stake: walk away more often than not (expert)
  const mind: Mind = { key: 'k', knows: false, lean: 0 };
  let walks = 0;
  for (let n = 0; n < 200; n++) {
    const m = seatMove({
      level: 'expert',
      step: 11,
      won: 11,
      q: { text: 'س', options: ['1', '2', '3', '4'], correct: 2, lv: 4 },
      mind,
      removed: [],
      used: { fifty: true, audience: true, friend: true },
      canAudience: true,
      canFriend: true,
      poll: null,
      call: null,
    });
    if (m.type === 'walk') walks++;
  }
  expect(walks).toBeGreaterThan(120);
  // unsure early: the audience first; later: 50:50 first
  const early = seatMove({ level: 'expert', step: 2, won: 2, q: { text: 'س', options: ['1', '2', '3', '4'], correct: 0, lv: 1 }, mind, removed: [], used: { fifty: false, audience: false, friend: false }, canAudience: true, canFriend: true, poll: null, call: null });
  expect(early.type).toBe('audience');
  const late = seatMove({ level: 'expert', step: 9, won: 9, q: { text: 'س', options: ['1', '2', '3', '4'], correct: 0, lv: 3 }, mind, removed: [], used: { fifty: false, audience: false, friend: false }, canAudience: true, canFriend: true, poll: null, call: null });
  expect(late.type).toBe('fifty');
});

test('a disconnected friend cannot be called; everyone leaving ends the game without a result', () => {
  const { s, ctx } = begin(['a', 'b', 'c']);
  ctx.offline.add('b');
  expect(() => act(ctx, s, 'a', { type: 'friend', to: 'b' })).toThrow(GameError);
  for (const p of ['a', 'b', 'c']) million.onLeave!(ctx, s, p);
  expect(s.phase).toBe('final');
  expect(million.result!(s)).toBeNull();
});

test('say lines are noun-first and never give away an answer before the reveal', () => {
  const { s, ctx } = begin(['a', 'b']);
  const right = s.q!.options[s.q!.correct];
  act(ctx, s, 'a', { type: 'fifty' });
  act(ctx, s, 'a', { type: 'friend', to: 'b' });
  for (const t of ctx.said) expect(t).not.toContain(right);
  expect(ctx.said[0]).toBe('الكرسي الساخن: اسم-a');
});
