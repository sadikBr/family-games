/**
 * «سرعة اللعب»: the games' own pauses (a finished trick on the table, a take, a reveal, the end of a
 * hand) follow the room's pace through `paced(ctx, ms)` — longer when the room plays slowly
 * (ctx.pace() ≈ 1.7) than when it plays fast (1), and never shorter than their base values.
 */
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { BCard, BRank, BSuit } from '../src/shared/games/baloot';
import type { Card } from '../src/shared/cards';
import { balootClaim } from './ai/baloot-mind';
import { baloot, CLAIM_REVEAL_MS, HAND_END_MS, playable, TRICK_PAUSE_MS, type State } from './games/baloot';
import { mancala } from './games/mancala';
import { quiz } from './games/quiz';
import { ronda, TAKE_LOOK_MS } from './games/ronda';
import { paced, type GameCtx } from './types';

const SLOW = 1.7;
const FAST = 1;
const P = ['p0', 'p1', 'p2', 'p3'];

let realRandom = Math.random;
beforeEach(() => {
  realRandom = Math.random;
  Math.random = () => 0.5; // the bots' own thinking time is the same in both runs
});
afterEach(() => {
  Math.random = realRandom;
});

function fakeCtx(pace: number) {
  const jobs: { by: string; delay: number; a: any }[] = [];
  const ctx: GameCtx = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by, _k, delay, a) => void jobs.push({ by, delay, a }),
    botLevel: () => 'easy',
    pace: () => pace,
  };
  return { ctx, jobs };
}

test('paced: the base value at pace 1 (and without a pace, e.g. in tests), longer at a slower pace', () => {
  const { ctx } = fakeCtx(SLOW);
  expect(paced(ctx, 1000)).toBe(1700);
  expect(paced(fakeCtx(FAST).ctx, 1000)).toBe(1000);
  expect(paced({ ...ctx, pace: undefined }, 1000)).toBe(1000);
});

const c = (id: string): BCard => ({ id, suit: id.slice(-1) as BSuit, rank: id.slice(0, -1) as BRank });

/** Saudi صن, two cards left each, سارة (p0) to lead. */
function balootPosition(pace: number, hands: string[]) {
  const f = fakeCtx(pace);
  const s = baloot.start(f.ctx, P, { mode: 'saudi', target: 152, timer: 0, doubling: false, level: 2 }) as State;
  s.phase = 'play';
  s.bid = null;
  s.faceUp = null;
  s.contract = { mode: 'sun', trump: null, buyer: 'p0', caller: 'p0', call: 'sun', mult: 1, gahwa: false };
  s.hands = Object.fromEntries(P.map((id, i) => [id, hands[i].split(' ').map(c)]));
  s.trick = [];
  s.trickNo = 7;
  s.turn = 'p0';
  s.pauseUntil = null;
  s.leadBoss = false;
  for (const id of P) {
    s.avail[id] = [];
    s.declared[id] = [];
    s.maAvail[id] = [];
    s.maDeclared[id] = [];
  }
  return { ...f, s };
}

/** How long a finished trick stays on the table. */
function balootTrickPause(pace: number) {
  const g = balootPosition(pace, ['AS 7C', 'KS 8C', 'QS 9C', 'JS 10C']);
  for (let i = 0; i < 4; i++) {
    const id = g.s.turn!;
    baloot.act(g.ctx, g.s, id, { type: 'play', card: playable(g.s, id)[0].id });
  }
  expect(g.s.trick.length).toBe(4);
  return g.s.pauseUntil! - g.ctx.now;
}

test('Baloot: a finished trick stays longer on the table at a slow pace', () => {
  const fast = balootTrickPause(FAST);
  const slow = balootTrickPause(SLOW);
  expect(fast).toBe(TRICK_PAUSE_MS);
  expect(TRICK_PAUSE_MS).toBeGreaterThanOrEqual(2600);
  expect(slow).toBe(Math.round(TRICK_PAUSE_MS * SLOW));
});

/** «سوا»: the claimer's cards shown, then the end-of-hand sheet before the next hand deals itself. */
function balootClaimAndHandEnd(pace: number) {
  const g = balootPosition(pace, ['AS AH', 'QH 10H', '7H 8H', 'QS 9H']);
  g.s.claim = balootClaim(g.s);
  baloot.act(g.ctx, g.s, 'p0', { type: 'claim' });
  const reveal = g.s.pauseUntil! - g.ctx.now;
  g.ctx.now = g.s.pauseUntil!;
  baloot.tick!(g.ctx, g.s);
  expect(g.s.phase).toBe('handEnd');
  return { reveal, handEnd: g.s.nextAt! - g.ctx.now };
}

test('Baloot: the claim reveal and the end-of-hand sheet last longer at a slow pace', () => {
  const fast = balootClaimAndHandEnd(FAST);
  const slow = balootClaimAndHandEnd(SLOW);
  expect(fast).toEqual({ reveal: CLAIM_REVEAL_MS, handEnd: HAND_END_MS });
  expect(slow.reveal).toBeGreaterThan(fast.reveal);
  expect(slow.handEnd).toBe(Math.round(HAND_END_MS * SLOW));
});

const rc = (suit: Card['suit'], rank: number): Card => ({ id: `${suit}-${rank}`, suit, rank });

/** The next bot's wait right after a take (the «last play» panel shows the cards taken). */
function rondaWait(pace: number, took: boolean) {
  const { ctx, jobs } = fakeCtx(pace);
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 99 });
  s.turnIdx = s.seats.indexOf('b');
  s.lastPlay = { by: 'a', card: rc('coins', 5), took: took ? [rc('cups', 5)] : [] };
  ronda.botPlan!(ctx, s, ['a', 'b']);
  expect(jobs.length).toBe(1);
  return jobs[0].delay;
}

test('Ronda: a take is shown longer before the next bot plays, more so at a slow pace', () => {
  const plain = rondaWait(FAST, false);
  const fast = rondaWait(FAST, true);
  const slow = rondaWait(SLOW, true);
  expect(fast - plain).toBe(TAKE_LOOK_MS);
  expect(slow - plain).toBe(Math.round(TAKE_LOOK_MS * SLOW));
  expect(slow).toBeGreaterThan(fast);
});

/** How long the right answer (and everyone's) stays up after a question. */
function quizReveal(pace: number) {
  const { ctx } = fakeCtx(pace);
  const s: any = quiz.start(ctx, ['a', 'b'], { rounds: 3, seconds: 10, category: 'all' });
  ctx.now = s.endsAt;
  quiz.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  return s.endsAt - ctx.now;
}

test('quiz: the reveal stays longer at a slow pace', () => {
  const fast = quizReveal(FAST);
  const slow = quizReveal(SLOW);
  expect(fast).toBeGreaterThanOrEqual(3000);
  expect(slow).toBe(Math.round(fast * SLOW));
});

/** Mancala: the bot waits for the seeds to land on the phones, then looks at the board a moment. */
function mancalaWait(pace: number) {
  const { ctx, jobs } = fakeCtx(pace);
  const s: any = mancala.start(ctx, ['a', 'b'], { seeds: 4, level: 'easy' } as any);
  const first = s.seats[s.turn];
  const pit = s.turn === 0 ? 2 : 9;
  mancala.act(ctx, s, first, { type: 'sow', pit });
  jobs.length = 0;
  mancala.botPlan!(ctx, s, ['a', 'b']);
  return jobs.at(-1)?.delay ?? 0;
}

test('Mancala: the look after the sowing follows the pace (the sowing itself is the phones\' animation)', () => {
  const fast = mancalaWait(FAST);
  const slow = mancalaWait(SLOW);
  expect(fast).toBeGreaterThan(0);
  expect(slow).toBeGreaterThan(fast);
});
