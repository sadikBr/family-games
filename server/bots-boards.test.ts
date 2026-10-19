/**
 * The board-game bots (server/ai/boards-*.ts): the room's «خبير» level against the old bots (kept as
 * «سهل»), tactical positions, decision time and legality over whole games.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { BN, botShot, randomFleet } from '../src/shared/battleship';
import { START_FEN, botMove as chessOld, fromFen, legalMoves as chessLegal, makeMove, perft, repKey, resultOf, evaluate as chessEval, type Pos } from '../src/shared/chess';
import { bestColumn, dropRow, winLine, type Disc } from '../src/shared/connect4';
import { xoBest, xoWinner, type Mark } from '../src/shared/xo';
import { battleshipExpert } from './ai/boards-battleship';
import { Engine, chessBot } from './ai/boards-chess';
import { c4Bot } from './ai/boards-connect4';
import { damaBot } from './ai/boards-dama';
import { kharbgaBot } from './ai/boards-kharbga';
import { mancalaExpert } from './ai/boards-mancala';
import { BUDGET, seeded } from './ai/boards-search';
import { xoBot } from './ai/boards-xo';
import { dotsBotLine, emptyLines, closesCount } from './dots-ai';
import { battleship } from './games/battleship';
import { blocks } from './games/blocks';
import { chess } from './games/chess';
import { connect4 } from './games/connect4';
import { dama } from './games/dama';
import { dots } from './games/dots';
import { kharbga } from './games/kharbga';
import { mancala } from './games/mancala';
import { xo } from './games/xo';
import { mancalaBotPit, sow } from './mancala-rules';
import type { GameModule } from './types';
import type { BotLevel } from '../src/shared/protocol';

const realRandom = Math.random;
const budget = { ...BUDGET };
/** Series run on a work budget instead of the clock: the same games however busy the machine is. */
const testBudget = () => Object.assign(BUDGET, { expert: 5000, smart: 5000, maxNodes: 1500 });
beforeAll(testBudget);
afterAll(() => {
  Math.random = realRandom;
  Object.assign(BUDGET, budget);
  delete BUDGET.maxNodes;
});

/** CPU milliseconds spent in f (process-wide, so it includes GC). */
function cpu<T>(f: () => T): { v: T; ms: number } {
  const c0 = process.cpuUsage();
  const v = f();
  const c = process.cpuUsage(c0);
  return { v, ms: (c.user + c.system) / 1000 };
}

/**
 * Bot-only games through a game module, seat A at level `a` and seat B at level `b` (each bot reads the
 * room level through ctx.botLevel). Every bot action goes through act(), which rejects illegal moves.
 */
function series(mod: GameModule<any, any>, settings: unknown, games: number, a: BotLevel, b: BotLevel, seed: number) {
  Math.random = seeded(seed);
  const out = { a: 0, b: 0, draw: 0 };
  for (let g = 0; g < games; g++) {
    const q: { by: string; a: any }[] = [];
    let current = '';
    const lv: Record<string, BotLevel> = { A: a, B: b };
    const ctx: any = {
      now: 0,
      fx() {},
      isConnected: () => true,
      isBot: () => true,
      playerName: (id: string) => id,
      memo: new Map(),
      bot: (by: string, _k: string, _d: number, act: any) => q.push({ by, a: act }),
      botLevel: () => lv[current],
    };
    const s: any = mod.start(ctx, ['A', 'B'], settings);
    for (let k = 0; k < 6000 && s.phase !== 'final'; k++) {
      q.length = 0;
      current = mod.turnOf!(s)[0];
      mod.botPlan!(ctx, s, ['A', 'B']);
      const batch = q.splice(0);
      for (const z of batch) mod.act(ctx, s, z.by, z.a); // throws on an illegal move
      if (!batch.length) {
        ctx.now += 2000;
        mod.tick?.(ctx, s);
      }
    }
    expect(s.phase).toBe('final');
    const first = mod.result!(s)?.places[0] ?? [];
    if (first.length === 1 && first[0] === 'A') out.a++;
    else if (first.length === 1 && first[0] === 'B') out.b++;
    else out.draw++;
  }
  Math.random = realRandom;
  return out;
}

/* ------------------------------------------------------------------ chess */

test('chess engine: move generation matches the reference perft counts', () => {
  const start = fromFen(START_FEN);
  expect(new Engine(start).perft(3)).toBe(perft(start, 3));
  const kiwi = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  expect(new Engine(kiwi).perft(2)).toBe(2039);
  const ep = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  expect(new Engine(ep).perft(4)).toBe(43238);
  const promo = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  expect(new Engine(promo).perft(2)).toBe(1486);
});

/** After `m`, every reply allows a mate in one. */
function mateInTwo(p: Pos, m: { from: number; to: number; promo?: string }) {
  const after = makeMove(p, chessLegal(p).find((x) => x.from === m.from && x.to === m.to && (x.promo ?? 'q') === (m.promo ?? 'q'))!);
  const replies = chessLegal(after);
  if (!replies.length) return true;
  return replies.every((r) => {
    const q = makeMove(after, r);
    return chessLegal(q).some((x) => resultOf(makeMove(q, x), {})?.reason === 'mate');
  });
}

test('chess expert: mates in one and two, wins a hanging queen', () => {
  const m1 = fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  expect(chessBot(m1, {}, 'expert')).toMatchObject({ from: 59, to: 3 }); // Rd8#
  const scholar = fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  expect(chessBot(scholar, {}, 'expert')).toMatchObject({ from: 31, to: 13 }); // Qxf7#
  const m2 = fromFen('r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1');
  const m = chessBot(m2, {}, 'expert', { timeMs: 60000, maxNodes: 300000 })!;
  expect(mateInTwo(m2, m)).toBe(true);
  const queen = fromFen('4k3/8/8/3q4/8/2N5/4P3/4K3 w - - 0 1');
  expect(chessBot(queen, {}, 'expert')).toMatchObject({ from: 42, to: 27 }); // Nxd5
});

test('chess expert: beats the old bot', () => {
  Math.random = seeded(21);
  let score = 0;
  for (let g = 0; g < 4; g++) {
    let pos = fromFen(START_FEN);
    const reps: Record<string, number> = { [repKey(pos)]: 1 };
    const expertWhite = g % 2 === 0;
    let res = null;
    for (let ply = 0; ply < 160 && !res; ply++) {
      const expert = (pos.turn === 'w') === expertWhite;
      const m = expert ? chessBot(pos, reps, 'expert', { maxNodes: 4000, timeMs: 5000 }) : chessOld(pos, 1);
      pos = makeMove(pos, m!);
      reps[repKey(pos)] = (reps[repKey(pos)] ?? 0) + 1;
      res = resultOf(pos, reps);
    }
    if (res) score += res.winner === 'draw' ? 0.5 : (res.winner === 'w') === expertWhite ? 1 : 0;
    else score += chessEval(pos.b) * (expertWhite ? 1 : -1) > 300 ? 1 : 0.5; // adjudicated on material
  }
  Math.random = realRandom;
  expect(score).toBeGreaterThanOrEqual(3.5);
}, 60000);

test('chess: the expert plays whole games through the module without an illegal move', () => {
  const r = series(chess, { level: 1 }, 1, 'expert', 'smart', 5);
  expect(r.a + r.b + r.draw).toBe(1);
}, 60000);

/* ------------------------------------------------------------------ connect 4 */

const c4 = (cells: Record<number, Disc>) => {
  const b: Disc[] = Array(42).fill(0);
  for (const [i, v] of Object.entries(cells)) b[Number(i)] = v;
  return b;
};

test('connect4 expert: wins now, blocks, never plays under their threat', () => {
  expect(c4Bot(c4({ 35: 1, 36: 1, 37: 1, 28: 2, 29: 2, 30: 2 }), 1, 'expert')).toBe(3);
  expect(c4Bot(c4({ 35: 1, 36: 1, 37: 1, 29: 2, 30: 2, 22: 2 }), 2, 'expert')).toBe(3);
  // they have three on row 5 from the bottom's second row (cells 29–31); dropping in column 4 would hand them 32
  const under = c4({ 35: 1, 36: 1, 37: 2, 38: 1, 28: 1, 29: 2, 30: 2, 31: 2 });
  for (let k = 0; k < 5; k++) expect(c4Bot(under, 1, 'expert')).not.toBe(4);
});

test('connect4 expert: beats the old bot (casual and strong)', () => {
  Math.random = seeded(7);
  const play = (oldLevel: 1 | 2, games: number, nodes: number) => {
    let w = 0, l = 0;
    for (let g = 0; g < games; g++) {
      const b: Disc[] = Array(42).fill(0);
      let turn: 1 | 2 = 1;
      const expertFirst = g % 2 === 0;
      for (let k = 0; k < 42; k++) {
        const expert = (turn === 1) === expertFirst;
        const c = expert ? c4Bot(b, turn, 'expert', { maxNodes: nodes, timeMs: 5000 }) : bestColumn(b, turn, oldLevel);
        const r = dropRow(b, c);
        expect(r).toBeGreaterThanOrEqual(0);
        b[r * 7 + c] = turn;
        if (winLine(b, r * 7 + c)) {
          if (expert) w++;
          else l++;
          break;
        }
        turn = turn === 1 ? 2 : 1;
      }
    }
    return { w, l };
  };
  const casual = play(1, 8, 4000);
  expect(casual.w).toBeGreaterThanOrEqual(7);
  const strong = play(2, 4, 15000);
  expect(strong.l).toBe(0);
  expect(strong.w).toBeGreaterThanOrEqual(2);
  Math.random = realRandom;
}, 60000);

/* ------------------------------------------------------------------ XO */

const xoBoard = (n: number, cells: Record<number, Mark>) => {
  const b: Mark[] = Array(n * n).fill('');
  for (const [i, v] of Object.entries(cells)) b[Number(i)] = v;
  return b;
};

test('xo expert: wins, blocks, stops an open three on 7×7; perfect on 3×3', () => {
  expect([21, 26]).toContain(xoBot(xoBoard(7, { 22: 'x', 23: 'x', 24: 'x', 25: 'x', 0: 'o', 6: 'o', 48: 'o' }), 'x', 'expert'));
  expect(xoBot(xoBoard(7, { 22: 'x', 23: 'x', 24: 'x', 25: 'x', 21: 'o', 0: 'o', 6: 'o' }), 'o', 'expert')).toBe(26);
  expect([21, 22, 26, 27]).toContain(xoBot(xoBoard(7, { 23: 'x', 24: 'x', 25: 'x', 0: 'o', 48: 'o' }), 'o', 'expert'));
  // 3×3 against random play: never loses
  Math.random = seeded(3);
  for (let g = 0; g < 30; g++) {
    const b: Mark[] = Array(9).fill('');
    let turn: 'x' | 'o' = 'x';
    const ex = g % 2 ? 'x' : 'o';
    while (!xoWinner(b, 3, 3) && b.some((v) => !v)) {
      const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      const c = turn === ex ? xoBot(b, turn, 'expert') : free[Math.floor(Math.random() * free.length)];
      b[c] = turn;
      turn = turn === 'x' ? 'o' : 'x';
    }
    expect(xoWinner(b, 3, 3)?.mark ?? ex).toBe(ex);
  }
  Math.random = realRandom;
});

test('xo expert: beats the old bot on the bigger boards', () => {
  Math.random = seeded(5);
  let w = 0, l = 0, games = 0;
  for (const n of [5, 6, 7, 9]) {
    for (let g = 0; g < 4; g++) {
      const b: Mark[] = Array(n * n).fill('');
      let turn: 'x' | 'o' = 'x';
      const ex = g % 2 ? 'x' : 'o';
      games++;
      for (;;) {
        const c = turn === ex ? xoBot(b, turn, 'expert', { maxNodes: 2500, timeMs: 5000 }) : xoBest(b, turn, 1);
        expect(b[c]).toBe('');
        b[c] = turn;
        const win = xoWinner(b, n);
        if (win) {
          if (win.mark === ex) w++;
          else l++;
          break;
        }
        if (b.every(Boolean)) break;
        turn = turn === 'x' ? 'o' : 'x';
      }
    }
  }
  Math.random = realRandom;
  expect(l).toBe(0);
  expect(w / games).toBeGreaterThanOrEqual(0.7);
}, 60000);

/* ------------------------------------------------------------------ dama */

const DAMA = { flyingKings: true, backCapture: true, maxCapture: true };

test('dama expert: never walks into a double capture', () => {
  const b = Array(64).fill(0);
  b[26] = -1; // a black man that would jump twice
  b[1] = -1;
  b[3] = -1;
  b[42] = 1;
  b[53] = 1;
  b[49] = 1;
  for (let k = 0; k < 3; k++) {
    const m = damaBot(b, 1, DAMA, 'expert')!;
    const to = m.path[m.path.length - 1];
    expect([35, 33]).not.toContain(to); // 42→35 or 42→33 lose two men
  }
  // a capture on the board is compulsory and taken
  const c = Array(64).fill(0);
  c[35] = 1;
  c[26] = -1;
  c[0 + 1] = -1;
  const cap = damaBot(c, 1, DAMA, 'expert')!;
  expect(cap.captures).toEqual([26]);
});

test('dama expert: beats the old bot', () => {
  const r = series(dama, DAMA, 4, 'expert', 'easy', 11);
  expect(r.a).toBeGreaterThanOrEqual(3);
  expect(r.b).toBe(0);
  const noFly = series(dama, { flyingKings: false, backCapture: false, maxCapture: false }, 2, 'expert', 'easy', 12);
  expect(noFly.a).toBeGreaterThanOrEqual(1);
  expect(noFly.b).toBe(0);
}, 60000);

/* ------------------------------------------------------------------ kharbga */

test('kharbga expert: takes the sandwich capture', () => {
  const b = Array(49).fill(0);
  b[10] = 1;
  b[17] = 2;
  b[31] = 1;
  b[0] = 2;
  b[6] = 1;
  expect(kharbgaBot(b, 1, null, false, 'expert')).toEqual({ from: 31, to: 24 });
});

test('kharbga expert: beats the old bot (setting and moving)', () => {
  const r = series(kharbga, { level: 1 }, 4, 'expert', 'easy', 13);
  expect(r.a).toBeGreaterThanOrEqual(3);
}, 60000);

/* ------------------------------------------------------------------ mancala */

test('mancala expert: takes the big capture, beats the old bots', () => {
  expect(mancalaExpert([1, 0, 0, 0, 0, 2, 0, 1, 1, 1, 1, 9, 1, 0], 0)).toBe(0);
  Math.random = seeded(9);
  const play = (old: 'medium', games: number) => {
    let w = 0, l = 0;
    for (let g = 0; g < games; g++) {
      const seeds = 3 + (g % 4);
      let b = Array(14).fill(seeds);
      b[6] = b[13] = 0;
      let turn: 0 | 1 = 0;
      const ex = (g >> 1) % 2;
      for (;;) {
        const p = turn === ex ? mancalaExpert(b, turn, { maxNodes: 20000, timeMs: 5000 }) : mancalaBotPit(b, turn, old);
        const r = sow(b, turn, p);
        b = r.board;
        if (r.over) break;
        if (!r.extra) turn = turn ? 0 : 1;
      }
      const me = b[ex ? 13 : 6], them = b[ex ? 6 : 13];
      if (me > them) w++;
      else if (me < them) l++;
    }
    return { w, l };
  };
  const medium = play('medium', 8); // the old default
  expect(medium.w).toBeGreaterThanOrEqual(6);
  Math.random = realRandom;
}, 60000);

test('mancala: whole games through the module, every level', () => {
  const r = series(mancala, { seeds: 4, level: 'easy' }, 4, 'expert', 'easy', 14);
  expect(r.a).toBeGreaterThanOrEqual(3);
  series(mancala, { seeds: 5, level: 'easy' }, 1, 'smart', 'expert', 15);
}, 60000);

/* ------------------------------------------------------------------ dots */

test('dots expert: the double-cross, and eating when nothing is left to control', () => {
  const n = 3;
  const H = n * (n + 1);
  const h = (r: number, c: number) => r * n + c;
  const v = (r: number, c: number) => H + r * (n + 1) + c;
  const lines = emptyLines(n);
  for (const e of [h(0, 0), h(0, 1), h(0, 2), h(1, 0), h(1, 1), h(1, 2), h(2, 0), h(2, 1), h(3, 0), h(3, 1), h(3, 2), v(0, 0), v(0, 1), v(1, 3), v(2, 3)]) lines[e] = true;
  expect(dotsBotLine(n, lines, 'expert')).toBe(v(0, 3)); // hand over 2, they must open the 6-chain
  const end = lines.map((d, e) => d || (e !== v(0, 2) && e !== v(0, 3)));
  expect(dotsBotLine(n, end, 'expert')).toBe(v(0, 2));
});

test('dots expert: beats the old bots (the old default and the old hard)', () => {
  Math.random = seeded(4);
  const play = (old: 'medium' | 'hard', n: number, games: number) => {
    let w = 0;
    for (let g = 0; g < games; g++) {
      const lines = emptyLines(n);
      const pts = [0, 0];
      let turn = 0;
      const ex = g % 2;
      while (lines.some((x) => !x)) {
        const e = turn === ex ? dotsBotLine(n, lines, 'expert') : dotsBotLine(n, lines, old);
        expect(lines[e]).toBe(false);
        const k = closesCount(n, lines, e);
        lines[e] = true;
        pts[turn] += k;
        if (!k) turn ^= 1;
      }
      if (pts[ex] > pts[1 - ex]) w++;
    }
    return w;
  };
  expect(play('medium', 4, 8)).toBeGreaterThanOrEqual(6);
  expect(play('hard', 5, 6)).toBeGreaterThanOrEqual(4);
  Math.random = realRandom;
}, 60000);

test('dots: whole games through the module (2 players)', () => {
  const r = series(dots, { size: 4, level: 'easy' }, 3, 'expert', 'easy', 16);
  expect(r.a).toBeGreaterThanOrEqual(2);
}, 60000);

/* ------------------------------------------------------------------ battleship */

test('battleship expert: fewer shots than the old bots, never wastes a shot next to a sunk ship', () => {
  Math.random = seeded(1);
  const shotsToSink = (pick: (shots: Record<number, 'hit' | 'miss'>, sunk: number[][]) => number, fleets: number[][][], strict = false) => {
    let total = 0;
    for (const fleet of fleets) {
      const shots: Record<number, 'hit' | 'miss'> = {};
      for (;;) {
        const sunk = fleet.filter((sh) => sh.every((c) => shots[c] === 'hit'));
        if (sunk.length === fleet.length) break;
        const c = pick(shots, sunk);
        expect(shots[c]).toBeUndefined();
        // a cell touching a sunk ship can't hold a ship
        if (strict) for (const ship of sunk) for (const x of ship) expect(Math.max(Math.abs(Math.floor(x / BN) - Math.floor(c / BN)), Math.abs((x % BN) - (c % BN)))).toBeGreaterThan(1);
        shots[c] = fleet.some((sh) => sh.includes(c)) ? 'hit' : 'miss';
        total++;
      }
    }
    return total / fleets.length;
  };
  const fleets = Array.from({ length: 30 }, () => randomFleet());
  const expert = shotsToSink(battleshipExpert, fleets, true);
  const oldStrong = shotsToSink((s, k) => botShot(s, k, 2), fleets);
  const oldCasual = shotsToSink((s, k) => botShot(s, k, 1), fleets);
  Math.random = realRandom;
  expect(expert).toBeLessThan(oldStrong - 3);
  expect(expert).toBeLessThan(oldCasual - 15);
  expect(expert).toBeLessThan(46);
});

test('battleship expert: follows a line of hits', () => {
  // two hits side by side in row 4 (cells 44, 45): the next shot extends the line
  const shots: Record<number, 'hit' | 'miss'> = { 44: 'hit', 45: 'hit' };
  expect([43, 46]).toContain(battleshipExpert(shots, []));
  shots[43] = 'miss';
  expect(battleshipExpert(shots, [])).toBe(46);
});

test('battleship expert: wins most duels against the old bot', () => {
  const r = series(battleship, { level: 1 }, 10, 'expert', 'easy', 17);
  expect(r.a).toBeGreaterThanOrEqual(7);
}, 60000);

/* ------------------------------------------------------------------ blocks */

test('blocks expert: beats the old bots in two-player games', () => {
  const easy = series(blocks, { level: 'easy' }, 3, 'expert', 'easy', 18);
  expect(easy.a).toBeGreaterThanOrEqual(3);
  const hard = series(blocks, { level: 'easy' }, 6, 'expert', 'smart', 19); // smart = the old hard bot
  expect(hard.a).toBeGreaterThanOrEqual(4);
}, 60000);

/* ------------------------------------------------------------------ connect4 / xo modules, timing */

test('connect4 / xo: whole games through the modules at every level', () => {
  expect(series(connect4, { level: 1 }, 2, 'expert', 'easy', 20).a).toBe(2);
  series(connect4, { level: 1 }, 1, 'smart', 'easy', 21);
  for (const size of [3, 4, 6, 9]) series(xo, { level: 1, size }, 1, 'expert', 'smart', 22 + size);
}, 60000);

test('decision time: each expert decision stays within its budget at the real settings', () => {
  Object.assign(BUDGET, budget); // the production budgets
  delete BUDGET.maxNodes;
  const times: Record<string, number[]> = {};
  const add = (k: string, ms: number) => (times[k] ??= []).push(ms);
  // a few positions from the middle of games
  let pos = fromFen('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 8');
  for (let k = 0; k < 4; k++) {
    const { v, ms } = cpu(() => chessBot(pos, {}, 'expert'));
    add('chess', ms);
    pos = makeMove(pos, v!);
  }
  const c4b: Disc[] = Array(42).fill(0);
  for (const [i, c] of [3, 3, 2, 4, 4].entries()) c4b[dropRow(c4b, c) * 7 + c] = (i % 2 ? 2 : 1) as Disc;
  for (let k = 0; k < 3; k++) add('connect4', cpu(() => c4Bot(c4b, 2, 'expert')).ms);
  const big = xoBoard(9, { 40: 'x', 41: 'o', 31: 'x', 49: 'o', 30: 'x' });
  for (let k = 0; k < 3; k++) add('xo', cpu(() => xoBot(big, 'o', 'expert')).ms);
  for (let k = 0; k < 3; k++) add('mancala', cpu(() => mancalaExpert([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], 0)).ms);
  const d = dama.start({ now: 0, fx() {}, isConnected: () => true, isBot: () => true, playerName: (x: string) => x, memo: new Map(), bot() {} } as any, ['a', 'b'], DAMA);
  for (let k = 0; k < 3; k++) add('dama', cpu(() => damaBot(d.board, 1, DAMA, 'expert')).ms);
  const lines = emptyLines(5);
  Math.random = seeded(2);
  for (let k = 0; k < 30; k++) lines[Math.floor(Math.random() * lines.length)] = true;
  Math.random = realRandom;
  for (let k = 0; k < 3; k++) add('dots', cpu(() => dotsBotLine(5, lines, 'expert')).ms);
  for (let k = 0; k < 3; k++) add('battleship', cpu(() => battleshipExpert({ 44: 'hit', 12: 'miss', 77: 'miss' }, [])).ms);
  for (const [game, ms] of Object.entries(times)) {
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    // ~50 ms of thinking (a wall-clock deadline), plus the odd JIT warm-up or GC pause; process CPU time
    // also counts the GC's own threads, so leave room for a busy machine
    expect({ game, avg: avg < 90 }).toEqual({ game, avg: true });
    expect({ game, max: Math.max(...ms) < 300 }).toEqual({ game, max: true });
  }
  testBudget();
}, 60000);
