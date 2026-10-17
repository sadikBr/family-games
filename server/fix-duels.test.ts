/** Tests for the 1-vs-1 fixes: fair rematches, resigning, maximum capture, kharbga setup helpers, memory leavers. */
import { expect, test } from 'bun:test';

import { battleship } from './games/battleship';
import { chess } from './games/chess';
import { connect4 } from './games/connect4';
import { dama, legalMoves, pickMove } from './games/dama';
import { kharbga } from './games/kharbga';
import { memory } from './games/memory';
import { xo } from './games/xo';

const fakeCtx = (memo = new Map<string, unknown>()): any => {
  const fx: { kind: string; target?: string }[] = [];
  return {
    now: 0,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    fxs: fx,
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => id,
    memo,
    bot: () => {},
  };
};

test('duels: who starts alternates between games in the same room, and the series score is kept', () => {
  const memo = new Map<string, unknown>();
  const games = [
    { m: chess, first: (s: any) => s.white, settings: { level: 1 } },
    { m: dama, first: (s: any) => s.white, settings: { flyingKings: true, backCapture: true, maxCapture: true } },
    { m: connect4, first: (s: any) => s.red, settings: { level: 1 } },
    { m: kharbga, first: (s: any) => s.attacker, settings: { level: 1 } },
    { m: battleship, first: (s: any) => s.players[s.turnIdx], settings: { level: 1 } },
    { m: xo, first: (s: any) => s.x, settings: { level: 1 } },
  ];
  for (const g of games) {
    const firsts: string[] = [];
    for (let k = 0; k < 4; k++) firsts.push(g.first((g.m as any).start(fakeCtx(memo), ['a', 'b'], g.settings)));
    expect(firsts[1]).not.toBe(firsts[0]);
    expect(firsts[2]).toBe(firsts[0]);
    expect(firsts[3]).toBe(firsts[1]);
  }
  // a resign counts in the series and the score survives the next game
  const ctx = fakeCtx(memo);
  const s1: any = chess.start(ctx, ['a', 'b'], { level: 1 });
  chess.act(ctx, s1, s1.white, { type: 'resign' });
  expect(s1.score[s1.black]).toBe(1);
  expect(ctx.fxs.at(-1)).toEqual({ kind: 'win', target: s1.black });
  const s2: any = chess.start(ctx, ['a', 'b'], { level: 1 });
  expect(s2.white).toBe(s1.black);
  expect((chess.view(ctx, s2, 'a') as any).score[s1.black]).toBe(1);
  // a different pair starts a fresh series
  const s3: any = chess.start(ctx, ['a', 'c'], { level: 1 });
  expect(s3.score).toEqual({ a: 0, c: 0 });
});

test('battleship: resigning (even during setup) gives the game to the other player', () => {
  const ctx = fakeCtx();
  const s: any = battleship.start(ctx, ['a', 'b'], { level: 1 });
  battleship.act(ctx, s, 'a', { type: 'resign' });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('b');
  expect(s.score).toEqual({ a: 0, b: 1 });
  expect((battleship.view(ctx, s, 'b') as any).resigned).toBe(true);
  expect(ctx.fxs.at(-1)).toEqual({ kind: 'win', target: 'b' });
  const s2: any = battleship.start(ctx, ['a', 'b'], { level: 1 });
  battleship.act(ctx, s2, 'b', { type: 'ready' });
  battleship.act(ctx, s2, 'a', { type: 'ready' });
  battleship.act(ctx, s2, 'b', { type: 'resign' });
  expect(s2.score).toEqual({ a: 1, b: 1 });
});

test('dama: the sequence that captures the most pieces is compulsory', () => {
  const b = new Array(64).fill(0);
  b[5 * 8 + 0] = 1; // white man A: can take one (r4c1)
  b[4 * 8 + 1] = -1;
  b[5 * 8 + 4] = 1; // white man B: can take two (r4c5 then r2c5)
  b[4 * 8 + 5] = -1;
  b[2 * 8 + 5] = -1;
  const opts = { flyingKings: true, backCapture: true, maxCapture: true };
  const best = legalMoves(b, 1, opts);
  expect(best.length).toBeGreaterThan(0);
  expect(best.every((m) => m.from === 44 && m.captures.length === 2)).toBe(true);
  expect(legalMoves(b, 1, { ...opts, maxCapture: false }).some((m) => m.from === 40)).toBe(true);

  const ctx = fakeCtx();
  const s: any = dama.start(ctx, ['a', 'b'], opts);
  s.board = b;
  expect(() => dama.act(ctx, s, s.white, { type: 'move', from: 40, to: 26 })).toThrow('أكبر عدد');
  dama.act(ctx, s, s.white, { type: 'move', from: 44, to: 12 });
  expect(s.board[37]).toBe(0);
  expect(s.board[21]).toBe(0);
  expect(s.board[33]).toBe(-1);
  expect(s.lastMove.captures.sort()).toEqual([21, 37]);

  // two paths ending on the same square: the one that captures more wins
  const short = { from: 0, path: [18], captures: [9] };
  const long = { from: 0, path: [18, 36, 18], captures: [9, 27, 45] };
  expect(pickMove(b, [short, long])).toBe(long);
});

test('dama: a win plays the win sound for the winner and counts in the series', () => {
  const ctx = fakeCtx();
  const s: any = dama.start(ctx, ['a', 'b'], { flyingKings: true, backCapture: true, maxCapture: true });
  const b = new Array(64).fill(0);
  b[5 * 8 + 2] = 1;
  b[4 * 8 + 3] = -1;
  s.board = b;
  dama.act(ctx, s, s.white, { type: 'move', from: 42, to: 28 });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('white');
  expect(s.score[s.white]).toBe(1);
  expect(ctx.fxs.at(-1)).toEqual({ kind: 'win', target: s.white });
});

test('kharbga: undo a placement this turn, and drop the rest at random', () => {
  const ctx = fakeCtx();
  const s: any = kharbga.start(ctx, ['a', 'b'], { level: 1 });
  const A = s.attacker, D = s.defender;
  expect(() => kharbga.act(ctx, s, A, { type: 'undo' })).toThrow();
  kharbga.act(ctx, s, A, { type: 'place', cell: 0 });
  expect((kharbga.view(ctx, s, A) as any).canUndo).toBe(true);
  expect((kharbga.view(ctx, s, D) as any).canUndo).toBe(false);
  kharbga.act(ctx, s, A, { type: 'undo' });
  expect(s.board[0]).toBe(0);
  expect(s.toPlace[1]).toBe(24);
  expect(s.turn).toBe(1);
  kharbga.act(ctx, s, A, { type: 'place', cell: 0 });
  kharbga.act(ctx, s, A, { type: 'place', cell: 1 });
  expect(s.turn).toBe(2);
  expect(() => kharbga.act(ctx, s, A, { type: 'placeRandom' })).toThrow(); // not my turn
  expect(() => kharbga.act(ctx, s, D, { type: 'undo' })).toThrow(); // nothing of mine placed this turn

  kharbga.act(ctx, s, D, { type: 'place', cell: 2 });
  kharbga.act(ctx, s, D, { type: 'placeRandom' });
  expect(s.toPlace[2]).toBe(0);
  expect(s.board.filter((v: number) => v === 2).length).toBe(24);
  expect(s.board[24]).toBe(0); // the centre stays empty
  expect(s.turn).toBe(1);

  // the defender is done: the attacker keeps placing until its pieces are all down
  let guard = 0;
  while (s.phase === 'place' && guard++ < 30) {
    expect(s.turn).toBe(1);
    const cell = s.board.findIndex((v: number, i: number) => v === 0 && i !== 24);
    kharbga.act(ctx, s, A, { type: 'place', cell });
  }
  expect(s.phase).toBe('move');
  expect(s.board.filter((v: number) => v === 1).length).toBe(24);
  expect(s.board.filter((v: number) => v === 0).length).toBe(1);
});

test('kharbga: random placement in one go when nobody has placed yet', () => {
  const ctx = fakeCtx();
  const s: any = kharbga.start(ctx, ['a', 'b'], { level: 1 });
  kharbga.act(ctx, s, s.attacker, { type: 'placeRandom' });
  kharbga.act(ctx, s, s.defender, { type: 'placeRandom' });
  expect(s.phase).toBe('move');
  expect(s.board[24]).toBe(0);
});

test('memory: a leaver on turn takes their face-up cards and the pending flip-back with them', () => {
  const ctx = fakeCtx();
  const s: any = memory.start(ctx, ['a', 'b', 'c'], { pairs: 8 });
  s.order = ['a', 'b', 'c'];
  s.turnIdx = 0;
  const x = 0;
  const y = s.deck.findIndex((f: string, i: number) => i !== x && f !== s.deck[x]);
  memory.act(ctx, s, 'a', { type: 'flip', card: x });
  memory.act(ctx, s, 'a', { type: 'flip', card: y });
  expect(s.peekUntil).not.toBeNull();
  memory.onLeave!(ctx, s, 'a');
  expect(s.flipped).toEqual([]);
  expect(s.peekUntil).toBeNull();
  expect(s.order[s.turnIdx]).toBe('b');
  ctx.now += 5000;
  expect(memory.tick!(ctx, s)).toBe(false); // b is not skipped
  expect(s.order[s.turnIdx]).toBe('b');

  // one card turned over, then the player leaves: the next player does not inherit it
  memory.act(ctx, s, 'b', { type: 'flip', card: x });
  memory.onLeave!(ctx, s, 'b');
  expect(s.flipped).toEqual([]);
  expect(s.order).toEqual(['c']);
  expect(s.order[s.turnIdx]).toBe('c');

  // someone who is not on turn leaves: the current player keeps the turn and their card
  const t: any = memory.start(ctx, ['a', 'b', 'c'], { pairs: 8 });
  t.order = ['a', 'b', 'c'];
  t.turnIdx = 2;
  memory.act(ctx, t, 'c', { type: 'flip', card: 0 });
  memory.onLeave!(ctx, t, 'a');
  expect(t.order[t.turnIdx]).toBe('c');
  expect(t.flipped).toEqual([0]);
});
