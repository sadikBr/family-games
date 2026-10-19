/** «المنقلة» — Kalah rules, bots and leaving. */
import { expect, test } from 'bun:test';

import type { MancalaLevel } from '../src/shared/games/mancala';
import { mancala } from './games/mancala';
import { legalPits, mancalaBotPit, searchPit, sow } from './mancala-rules';

const fakeCtx = (bot: (by: string, a: any) => void = () => {}, fx: string[] = []): any => ({
  now: 0,
  fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: (by: string, _k: string, _d: number, a: any) => bot(by, a),
});

const total = (b: number[]) => b.reduce((x, y) => x + y, 0);

test('mancala: sowing goes round, skips the opponent store, last seed in own store = extra turn', () => {
  const start = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
  const r = sow(start, 0, 2); // 4 seeds: 3, 4, 5, store
  expect(r.path).toEqual([3, 4, 5, 6]);
  expect(r.extra).toBe(true);
  expect(r.board[2]).toBe(0);
  expect(r.board[6]).toBe(1);
  // side 1 with a big pit: passes its own store, skips side 0's store (6)
  const big = [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 9, 0];
  const r2 = sow(big, 1, 12);
  expect(r2.path).toEqual([13, 0, 1, 2, 3, 4, 5, 7, 8]);
  expect(r2.board[6]).toBe(0);
  expect(r2.extra).toBe(false);
  expect(total(r2.board)).toBe(total(big));
  // 13 seeds from pit 0 come all the way round back to pit 0
  const lap = [13, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0];
  const r3 = sow(lap, 0, 0);
  expect(r3.path.length).toBe(13);
  expect(r3.path).not.toContain(13);
});

test('mancala: last seed in an empty own pit takes the opposite pit (only if it has seeds)', () => {
  const b = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 5, 3, 3, 0];
  const r = sow(b, 0, 0); // lands in pit 1 (empty); opposite = 11 (3 seeds)
  expect(r.capture).toEqual({ pit: 1, opposite: 11, seeds: 4 });
  expect(r.board[6]).toBe(4);
  expect(r.board[1]).toBe(0);
  expect(r.board[11]).toBe(0);
  const e = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 5, 0, 3, 0];
  const r2 = sow(e, 0, 0); // opposite empty: no capture
  expect(r2.capture).toBeNull();
  expect(r2.board[1]).toBe(1);
  // landing in the opponent's empty pit never captures
  const o = [0, 0, 0, 0, 0, 1, 0, 0, 3, 3, 3, 3, 3, 0];
  const r3 = sow(o, 0, 5); // to store: extra turn… with side 0 empty the game ends
  expect(r3.over).toBe(true);
});

test('mancala: the game ends when a side is empty and the rest goes to its owner', () => {
  const fx: string[] = [];
  const ctx = fakeCtx(() => {}, fx);
  const s = mancala.start(ctx, ['a', 'b'], { seeds: 4, level: 'easy' });
  const [p0] = s.seats;
  s.board = [0, 0, 0, 0, 0, 1, 20, 2, 0, 0, 0, 0, 3, 22];
  mancala.act(ctx, s, p0, { type: 'sow', pit: 5 });
  expect(s.phase).toBe('final');
  expect(s.board).toEqual([0, 0, 0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 27]);
  expect(s.winner).toBe(1);
  expect(s.reason).toBe('empty');
  expect(s.score[s.seats[1]]).toBe(1);
  expect(fx).toContain(`win:${s.seats[1]}`);
  expect(mancala.turnOf!(s)).toEqual([]);
});

test('mancala: turns, extra turns and refused moves', () => {
  const ctx = fakeCtx();
  const s = mancala.start(ctx, ['a', 'b'], { seeds: 4, level: 'easy' });
  const [p0, p1] = s.seats;
  expect(mancala.turnOf!(s)).toEqual([p0]);
  expect(() => mancala.act(ctx, s, p1, { type: 'sow', pit: 7 })).toThrow(); // not p1's turn
  expect(() => mancala.act(ctx, s, p0, { type: 'sow', pit: 8 })).toThrow(); // not p0's side
  mancala.act(ctx, s, p0, { type: 'sow', pit: 2 }); // ends in the store
  expect(mancala.turnOf!(s)).toEqual([p0]);
  expect(s.last).toMatchObject({ seq: 1, side: 0, from: 2, extra: true });
  expect(() => mancala.act(ctx, s, p0, { type: 'sow', pit: 2 })).toThrow(); // empty pit
  mancala.act(ctx, s, p0, { type: 'sow', pit: 0 });
  expect(mancala.turnOf!(s)).toEqual([p1]);
  const v0 = mancala.view(ctx, s, p0);
  const v1 = mancala.view(ctx, s, p1);
  expect((v0 as { mySide: number }).mySide).toBe(0);
  expect((v1 as { mySide: number }).mySide).toBe(1);
  expect(total(s.board)).toBe(48);
});

test('mancala: the first player alternates; seeds setting is used and validated', () => {
  const ctx = fakeCtx();
  const a = mancala.start(ctx, ['a', 'b'], { seeds: 3, level: 'easy' });
  const b = mancala.start(ctx, ['a', 'b'], { seeds: 6, level: 'easy' });
  expect(a.seats[0]).not.toBe(b.seats[0]);
  expect(total(a.board)).toBe(36);
  expect(total(b.board)).toBe(72);
  const st = { seeds: 4, level: 'medium' as MancalaLevel };
  mancala.patchSettings!(st, { seeds: 9, level: 'x' });
  expect(st).toEqual({ seeds: 4, level: 'medium' });
  mancala.patchSettings!(st, { seeds: 5, level: 'hard' });
  expect(st).toEqual({ seeds: 5, level: 'hard' });
});

test('mancala: resigning or leaving gives the win to the other player', () => {
  const ctx = fakeCtx();
  const s = mancala.start(ctx, ['a', 'b'], { seeds: 4, level: 'easy' });
  mancala.act(ctx, s, s.seats[0], { type: 'resign' });
  expect(s.winner).toBe(1);
  expect(s.reason).toBe('forfeit');
  const t = mancala.start(ctx, ['a', 'b'], { seeds: 4, level: 'easy' });
  mancala.onLeave!(ctx, t, t.seats[1]);
  expect(t.winner).toBe(0);
  expect(t.phase).toBe('final');
});

test('mancala bots: take a capture or an extra turn when it is clearly best', () => {
  // pit 2 has 4 seeds → lands in the store; the hard bot should take the extra turn
  const b = [0, 3, 4, 0, 0, 0, 10, 1, 1, 1, 1, 1, 1, 10];
  expect(searchPit(b, 0, 8, 200)).toBe(2);
  // a big capture: pit 0 (1 seed) → empty pit 1, opposite pit 11 has 9 seeds
  const c = [1, 0, 0, 0, 0, 2, 0, 1, 1, 1, 1, 9, 1, 0];
  expect(searchPit(c, 0, 8, 200)).toBe(0);
});

/** The room-wide bot level that plays like each of the old per-game levels. */
const ROOM_LEVEL = { easy: 'easy', medium: 'smart', hard: 'expert' } as const;

/** A whole game with bots only; every move must be legal. */
function botGame(levels: Record<string, MancalaLevel>, seeds = 4) {
  const q: { by: string; a: { type: string; pit: number } }[] = [];
  const ctx = fakeCtx((by, a) => q.push({ by, a }));
  const ids = Object.keys(levels);
  let who = '';
  ctx.botLevel = () => ROOM_LEVEL[levels[who]];
  const s = mancala.start(ctx, ids, { seeds, level: 'easy' });
  for (let k = 0; k < 400 && s.phase === 'play'; k++) {
    q.length = 0;
    who = s.seats[s.turn];
    mancala.botPlan!(ctx, s, ids);
    expect(q.length).toBe(1);
    expect(q[0].by).toBe(who);
    expect(legalPits(s.board, s.turn)).toContain(q[0].a.pit); // never an illegal pit
    mancala.act(ctx, s, q[0].by, q[0].a);
    ctx.now += 1000;
  }
  return s;
}

test('mancala: bot-only games finish (every level, every seed count)', () => {
  for (const seeds of [3, 4, 5, 6]) {
    for (const level of ['easy', 'medium'] as MancalaLevel[]) {
      const s = botGame({ a: level, b: level }, seeds);
      expect(s.phase).toBe('final');
      expect(total(s.board)).toBe(seeds * 12);
      expect(s.board[6] + s.board[13]).toBe(seeds * 12);
    }
  }
  const h = botGame({ a: 'hard', b: 'hard' }, 4);
  expect(h.phase).toBe('final');
}, 60000);

test('mancala: the expert bot beats the easy one', () => {
  let wins = 0;
  for (let g = 0; g < 6; g++) {
    const s = botGame({ h: 'hard', e: 'easy' }, 4);
    if (s.winner !== 'draw' && s.seats[s.winner as 0 | 1] === 'h') wins += 1;
  }
  expect(wins).toBeGreaterThanOrEqual(5);
}, 60000);

test('mancala: the hard bot answers within its time cap', () => {
  const b = [6, 6, 6, 6, 6, 6, 0, 6, 6, 6, 6, 6, 6, 0];
  const t0 = performance.now();
  const p = mancalaBotPit(b, 0, 'hard');
  expect(performance.now() - t0).toBeLessThan(400);
  expect(legalPits(b, 0)).toContain(p);
});
