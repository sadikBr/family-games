/** «القطع الملونة» — piece set, placement rules, scoring, passing, bots and leaving. */
import { expect, test } from 'bun:test';

import {
  ORIENTS,
  PIECES,
  PIECE_COUNT,
  TOTAL_SQUARES,
  anchors,
  checkPlacement,
  flipT,
  hasMove,
  legalMoves,
  normalize,
  orient,
  rotateT,
  scoreOf,
  snapPlacement,
  startCells,
  type SeatCtx,
} from '../src/shared/blocks-rules';
import type { BlocksView } from '../src/shared/games/blocks';
import { blocksBotMove } from './blocks-bot';
import { blocks } from './games/blocks';

const fakeCtx = (fx: string[] = []): any => ({
  now: 0,
  fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: () => {},
});

const key = (cells: [number, number][]) => normalize(cells).map(([r, c]) => `${r},${c}`).join(';');
const canon = (p: number) => ORIENTS[p].map((o) => key(o.cells)).sort()[0];
const ctxOf = (s: any, seat: number): SeatCtx => ({ board: s.board, n: s.n, seat, start: s.starts[seat], first: s.left[seat].length === PIECE_COUNT });

test('blocks: the piece set is the 21 free polyominoes, 89 squares, 91 fixed orientations', () => {
  expect(PIECE_COUNT).toBe(21);
  expect(TOTAL_SQUARES).toBe(89);
  const bySize = [1, 2, 3, 4, 5].map((k) => PIECES.filter((p) => p.length === k).length);
  expect(bySize).toEqual([1, 1, 2, 5, 12]);
  // all different as free shapes (no two pieces are rotations / mirror images of each other)
  expect(new Set(PIECES.map((_, p) => canon(p))).size).toBe(21);
  // each piece is connected
  for (const cells of PIECES) {
    const seen = new Set(['0']);
    const stack = [0];
    while (stack.length) {
      const [r, c] = cells[stack.pop()!];
      cells.forEach(([r2, c2], j) => {
        if (!seen.has(String(j)) && Math.abs(r - r2) + Math.abs(c - c2) === 1) {
          seen.add(String(j));
          stack.push(j);
        }
      });
    }
    expect(seen.size).toBe(cells.length);
  }
  expect(ORIENTS.reduce((a, o) => a + o.length, 0)).toBe(91);
  expect(ORIENTS[0].length).toBe(1); // 1-square
  expect(ORIENTS[8].length).toBe(1); // 2×2
  expect(ORIENTS[18].length).toBe(1); // X
  expect(ORIENTS[10].length).toBe(2); // straight 5
  expect(ORIENTS[9].length).toBe(8); // F
});

test('blocks: rotations and flips', () => {
  // the 4-L: [0,0],[1,0],[2,0],[2,1]
  expect(orient(5, 0)).toEqual([[0, 0], [1, 0], [2, 0], [2, 1]]);
  expect(orient(5, 1)).toEqual([[0, 0], [0, 1], [0, 2], [1, 0]]); // a quarter turn clockwise
  expect(orient(5, 4)).toEqual([[0, 1], [1, 1], [2, 0], [2, 1]]); // mirrored
  for (let p = 0; p < PIECE_COUNT; p++) {
    for (let t = 0; t < 8; t++) {
      // four quarter turns come back; flipping twice comes back
      expect(rotateT(rotateT(rotateT(rotateT(t))))).toBe(t);
      expect(flipT(flipT(t))).toBe(t);
      // the flip button mirrors what is on screen left↔right
      const shown = orient(p, t);
      const w = Math.max(...shown.map((q) => q[1]));
      expect(orient(p, flipT(t))).toEqual(normalize(shown.map(([r, c]) => [r, w - c])));
      // the rotate button turns what is on screen clockwise
      expect(orient(p, rotateT(t))).toEqual(normalize(shown.map(([r, c]) => [c, -r])));
    }
  }
});

test('blocks: boards and start squares', () => {
  const ctx = fakeCtx();
  const two = blocks.start(ctx, ['a', 'b'], { level: 'easy' });
  expect(two.n).toBe(14);
  expect(two.starts).toEqual([4 * 14 + 4, 9 * 14 + 9]);
  const three = blocks.start(ctx, ['a', 'b', 'c'], { level: 'easy' });
  expect(three.n).toBe(20);
  expect(three.starts).toEqual([0, 19, 399]);
  expect(startCells(20, 4)).toEqual([0, 19, 399, 380]);
});

test('blocks: the first piece must cover the start square', () => {
  const ctx = fakeCtx();
  const s = blocks.start(ctx, ['a', 'b', 'c', 'd'], { level: 'easy' });
  const p = s.seats[0];
  expect(() => blocks.act(ctx, s, s.seats[1], { type: 'place', piece: 0, t: 0, r: 0, c: 19 })).toThrow('ماشي دورك');
  expect(() => blocks.act(ctx, s, p, { type: 'place', piece: 10, t: 0, r: 1, c: 0 })).toThrow('مربع البداية');
  expect(() => blocks.act(ctx, s, p, { type: 'place', piece: 10, t: 0, r: 0, c: 16 })).toThrow('تخرج');
  blocks.act(ctx, s, p, { type: 'place', piece: 10, t: 0, r: 0, c: 0 }); // the 5-straight along the top
  expect(s.board.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
  expect(s.left[0]).not.toContain(10);
  expect(blocks.turnOf!(s)).toEqual([s.seats[1]]);
  const v = blocks.view(ctx, s, p) as BlocksView;
  expect(v.last).toEqual({ seat: 0, piece: 10, cells: [0, 1, 2, 3, 4] });
  expect(v.left[0].length).toBe(20);
  expect(v.me).toBe(0);
});

test('blocks: later pieces touch your colour at a corner, never along an edge', () => {
  const ctx = fakeCtx();
  const s = blocks.start(ctx, ['a', 'b', 'c', 'd'], { level: 'easy' });
  const [p, q, r, w] = s.seats;
  blocks.act(ctx, s, p, { type: 'place', piece: 8, t: 0, r: 0, c: 0 }); // 2×2 in the top-left
  blocks.act(ctx, s, q, { type: 'place', piece: 0, t: 0, r: 0, c: 19 });
  blocks.act(ctx, s, r, { type: 'place', piece: 0, t: 0, r: 19, c: 19 });
  blocks.act(ctx, s, w, { type: 'place', piece: 0, t: 0, r: 19, c: 0 });
  // edge contact with the 2×2
  expect(() => blocks.act(ctx, s, p, { type: 'place', piece: 1, t: 0, r: 2, c: 0 })).toThrow('الجانب');
  // no contact at all
  expect(() => blocks.act(ctx, s, p, { type: 'place', piece: 1, t: 0, r: 5, c: 5 })).toThrow('الركن');
  // on top of a piece
  expect(() => blocks.act(ctx, s, p, { type: 'place', piece: 1, t: 0, r: 1, c: 1 })).toThrow('مشغول');
  // a used piece
  expect(() => blocks.act(ctx, s, p, { type: 'place', piece: 8, t: 0, r: 2, c: 2 })).toThrow('من قبل');
  expect(s.moveNo).toBe(4);
  // the corner (2,2) is fine
  blocks.act(ctx, s, p, { type: 'place', piece: 1, t: 0, r: 2, c: 2 });
  expect(s.board[2 * 20 + 2]).toBe(0);
  expect(s.board[2 * 20 + 3]).toBe(0);
  // touching other colours along an edge is allowed: q's single square at (0,19), q places at (1,18) by its corner
  blocks.act(ctx, s, q, { type: 'place', piece: 1, t: 1, r: 1, c: 18 }); // vertical domino (1,18)-(2,18)
  expect(s.board[1 * 20 + 18]).toBe(1);
  // the helpers agree
  const x = ctxOf(s, 0);
  expect(anchors(x)).toContain(3 * 20 + 4);
  expect(anchors(x)).not.toContain(2 * 20 + 4); // edge-adjacent to the domino
  for (const m of legalMoves(x, s.left[0])) expect(checkPlacement(x, m)).toBeNull();
});

test('blocks: snapping a tapped square to a legal spot', () => {
  const ctx = fakeCtx();
  const s = blocks.start(ctx, ['a', 'b'], { level: 'easy' });
  const x = ctxOf(s, 0);
  const at = s.starts[0];
  for (let t = 0; t < 8; t++) {
    const pos = snapPlacement(x, 9, t, at);
    expect(checkPlacement(x, { piece: 9, t, ...pos })).toBeNull();
  }
  // nowhere legal: the piece is centred on the tap and kept on the board
  const pos = snapPlacement(x, 10, 0, 13 * 14 + 13);
  expect(pos).toEqual({ r: 13, c: 9 });
});

test('blocks: scoring — squares left, +15 for all, +5 more when the 1-square went last', () => {
  expect(scoreOf(Array.from({ length: 21 }, (_, i) => i), null)).toEqual({ squares: 89, bonus: 0, total: -89 });
  expect(scoreOf([0, 3], 10)).toEqual({ squares: 4, bonus: 0, total: -4 });
  expect(scoreOf([], 5)).toEqual({ squares: 0, bonus: 15, total: 15 });
  expect(scoreOf([], 0)).toEqual({ squares: 0, bonus: 20, total: 20 });
});

test('blocks: a colour with no legal move is passed automatically; the game ends when nobody can move', () => {
  const fx: string[] = [];
  const ctx = fakeCtx(fx);
  const s = blocks.start(ctx, ['a', 'b', 'c'], { level: 'easy' });
  const [p, q, r] = s.seats;
  // q's start corner (0,19) is already covered: q can never start
  s.board[19] = 2;
  blocks.act(ctx, s, p, { type: 'place', piece: 0, t: 0, r: 0, c: 0 });
  expect(s.done[1]).toBe(true);
  expect(s.passed).toEqual([1]);
  expect(fx).toContain(`skip:${q}`);
  expect(blocks.turnOf!(s)).toEqual([r]);
  const v = blocks.view(ctx, s, q) as BlocksView;
  expect(v.passed).toEqual([1]);
  // p has one piece left and no room: fill the board but p's last piece, leave r stuck too
  s.left[0] = [10];
  s.left[2] = [10];
  for (let i = 0; i < s.board.length; i++) if (s.board[i] === -1) s.board[i] = 1;
  s.board[18 * 20 + 18] = 2; // r already has a piece here…
  s.board[399] = -1; // …and one free corner: only a 1-square fits
  s.left[2] = [0, 10];
  blocks.act(ctx, s, r, { type: 'place', piece: 0, t: 0, r: 19, c: 19 });
  expect(s.phase).toBe('final');
  expect(s.reason).toBe('blocked');
  // p: −5, q: −89, r: −5 → p and r tie
  expect(s.winners!.sort()).toEqual([p, r].sort());
  expect(blocks.turnOf!(s)).toEqual([]);
});

test('blocks: placing every piece ends that colour, the bonus counts and the single winner gets the win', () => {
  const fx: string[] = [];
  const ctx = fakeCtx(fx);
  const s = blocks.start(ctx, ['a', 'b'], { level: 'easy' });
  const [p] = s.seats;
  // p has only the 1-square left, with a corner spot ready
  s.left[0] = [0];
  s.board[s.starts[0]] = 0;
  s.left[1] = [10];
  // block the other colour completely
  for (let i = 0; i < s.board.length; i++) if (s.board[i] === -1 && i !== s.starts[0] + 15) s.board[i] = 1;
  expect(hasMove(ctxOf(s, 0), [0])).toBe(true);
  blocks.act(ctx, s, p, { type: 'place', piece: 0, t: 0, r: 5, c: 5 });
  expect(s.phase).toBe('final');
  const v = blocks.view(ctx, s, p) as BlocksView;
  expect(v.scores[0]).toEqual({ squares: 0, bonus: 20, total: 20 });
  expect(v.scores[1].total).toBe(-5);
  expect(s.winners).toEqual([p]);
  expect(s.series[p]).toBe(1);
  expect(fx).toContain(`win:${p}`);
});

test('blocks: leaving — the pieces stay, the colour is skipped, one player left ends the game', () => {
  const ctx = fakeCtx();
  const s = blocks.start(ctx, ['a', 'b', 'c'], { level: 'easy' });
  const [p, q, r] = s.seats;
  blocks.act(ctx, s, p, { type: 'place', piece: 0, t: 0, r: 0, c: 0 });
  blocks.onLeave!(ctx, s, p);
  expect(s.board[0]).toBe(0); // still there
  expect(blocks.turnOf!(s)).toEqual([q]);
  blocks.onLeave!(ctx, s, q); // it was q's turn
  expect(s.phase).toBe('final');
  expect(s.reason).toBe('forfeit');
  expect(s.winners).toEqual([r]);
  // leaving on someone else's turn keeps the turn
  const t = blocks.start(ctx, ['a', 'b', 'c', 'd'], { level: 'easy' });
  blocks.onLeave!(ctx, t, t.seats[2]);
  expect(blocks.turnOf!(t)).toEqual([t.seats[0]]);
  blocks.act(ctx, t, t.seats[0], { type: 'place', piece: 0, t: 0, r: 0, c: 0 });
  blocks.act(ctx, t, t.seats[1], { type: 'place', piece: 0, t: 0, r: 0, c: 19 });
  expect(blocks.turnOf!(t)).toEqual([t.seats[3]]);
  expect(() => blocks.act(ctx, t, t.seats[2], { type: 'place', piece: 0, t: 0, r: 19, c: 19 })).not.toThrow(); // ignored
  expect(t.board[399]).toBe(-1);
});

test('blocks: settings are validated', () => {
  const st = { level: 'easy' as const } as any;
  blocks.patchSettings!(st, { level: 'hard' });
  expect(st.level).toBe('hard');
  blocks.patchSettings!(st, { level: 'insane' });
  expect(st.level).toBe('hard');
});

test('blocks: the hard bot answers within the time budget on a busy board', () => {
  const ctx = fakeCtx();
  const s = blocks.start(ctx, ['a', 'b', 'c', 'd'], { level: 'hard' });
  let worst = 0;
  for (let k = 0; k < 40 && s.phase === 'play'; k++) {
    const seat = s.turn;
    const t0 = performance.now();
    const m = blocksBotMove({ board: s.board, n: s.n, seat, starts: s.starts, left: s.left, live: [0, 1, 2, 3], level: 'hard' });
    worst = Math.max(worst, performance.now() - t0);
    blocks.act(ctx, s, s.seats[seat], { type: 'place', piece: m!.piece, t: m!.t, r: m!.r, c: m!.c });
  }
  expect(worst).toBeLessThan(300);
});

/** Plays a whole game with bots only: every move must be legal, and the game must reach the end. */
function botGame(players: string[], level: 'easy' | 'hard') {
  const ctx: any = fakeCtx();
  const jobs: { by: string; a: any }[] = [];
  ctx.bot = (by: string, _k: string, _d: number, a: any) => jobs.push({ by, a });
  const s = blocks.start(ctx, players, { level });
  let guard = 0;
  while (s.phase === 'play' && guard++ < 500) {
    blocks.botPlan!(ctx, s, players);
    const job = jobs.shift();
    expect(job).toBeDefined();
    const seat = s.seats.indexOf(job!.by);
    expect(seat).toBe(s.turn);
    expect(checkPlacement(ctxOf(s, seat), job!.a)).toBeNull();
    blocks.act(ctx, s, job!.by, job!.a);
    jobs.length = 0;
  }
  expect(s.phase).toBe('final');
  expect(s.reason).toBe('blocked');
  // nobody can move at the end
  for (let i = 0; i < s.seats.length; i++) expect(s.left[i].length === 0 || !hasMove(ctxOf(s, i), s.left[i])).toBe(true);
  // every square on the board belongs to a placed piece
  const placed = s.seats.map((_, i) => s.board.filter((x) => x === i).length);
  s.seats.forEach((_, i) => expect(placed[i] + s.left[i].reduce((a, p) => a + PIECES[p].length, 0)).toBe(89));
  expect(s.winners!.length).toBeGreaterThan(0);
  return s;
}

test('blocks: full bot games reach the end with legal moves only (2, 3 and 4 players, both levels)', () => {
  botGame(['a', 'b'], 'easy');
  botGame(['a', 'b'], 'hard');
  botGame(['a', 'b', 'c'], 'easy');
  botGame(['a', 'b', 'c', 'd'], 'hard');
  botGame(['a', 'b', 'c', 'd'], 'easy');
});

test('blocks: the hard bot beats the easy bot most of the time', () => {
  let hardWins = 0;
  for (let g = 0; g < 10; g++) {
    const ctx: any = fakeCtx();
    const s = blocks.start(ctx, ['h', 'e'], { level: 'hard' });
    while (s.phase === 'play') {
      const seat = s.turn;
      const level = s.seats[seat] === 'h' ? 'hard' : 'easy';
      const m = blocksBotMove({ board: s.board, n: s.n, seat, starts: s.starts, left: s.left, live: [0, 1], level, budget: 5000 })!;
      blocks.act(ctx, s, s.seats[seat], { type: 'place', piece: m.piece, t: m.t, r: m.r, c: m.c });
    }
    if (s.winners?.length === 1 && s.winners[0] === 'h') hardWins++;
  }
  expect(hardWins).toBeGreaterThanOrEqual(6); // ~95% in long runs
});
