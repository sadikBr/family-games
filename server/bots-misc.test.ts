/**
 * Smarter bots for لودو, العقارات, الحج, شبكة الكلمات, كلمة السر, حروف مبعثرة, فك الشيفرة, الذاكرة, سودوكو:
 * the expert bot against the old one (kept as «سهل») in seeded series, known positions, decision time,
 * and only legal moves.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';

import type { BotLevel, GameAction } from '../src/shared/protocol';
import { codebreakMarks } from '../src/shared/games/codebreak';
import type { ZadKind } from '../src/shared/islamic';
import { generateSudoku } from '../src/shared/sudoku';
import { markGuess, normWord } from '../src/shared/wordle';
import { expertAccepts, expertAuctionMax } from './ai/misc-estate';
import { cardGain, hajjCardChoice } from './ai/misc-hajj';
import { memoryBotFlip } from './ai/misc-memory';
import { ludoBotMove, type LudoBoard } from './ai/misc-ludo';
import { solveSudoku, sudokuNextStep } from './ai/misc-sudoku';
import { WORDLE_SEARCH, wordleCandidates, wordleExpertGuess } from './ai/misc-wordle';
import { CODEBREAK_SEARCH, allCodes, botGuess } from './codebreak-bot';
import { WORDLE_WORDS } from './content-games2';
import { boggle } from './games/boggle';
import { codebreak } from './games/codebreak';
import { estate } from './games/estate';
import { hajj } from './games/hajj';
import { memory } from './games/memory';
import { ludo } from './games/ludo';
import { botAction, scrabble } from './games/scrabble';
import { sudoku } from './games/sudoku';
import { VALID_GUESSES, wordle } from './games/wordle';
import { SCRABBLE_SEARCH, leaveValue } from './scrabble-bot';
import type { GameCtx, GameModule } from './types';

/* ---------------- harness ---------------- */

/** Bot delays follow BOT_SPEED like in a room (timers in the games follow it too). */
const SPEED = Number(process.env.BOT_SPEED ?? 1) || 1;
const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});
// searches are cut by a fixed amount of work only (not the wall clock): a busy machine changes nothing
beforeAll(() => {
  SCRABBLE_SEARCH.clock = CODEBREAK_SEARCH.clock = WORDLE_SEARCH.clock = false;
});
afterAll(() => {
  SCRABBLE_SEARCH.clock = CODEBREAK_SEARCH.clock = WORDLE_SEARCH.clock = true;
});

export function mulberry(seed: number): () => number {
  // mix the seed: nearby seeds would otherwise start with similar numbers (and e.g. the same seat order)
  let a = Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sim<S> {
  s: S;
  ctx: GameCtx;
  /** botPlan call times (ms of CPU) */
  times: number[];
  errors: string[];
}

/**
 * Play a whole game with bots only, each with its own level (botPlan is called per bot, with the room
 * level set to that bot's and only that bot seen as a bot). Bot actions run on a simulated clock;
 * refused actions are recorded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function play<S>(mod: GameModule<S, any>, levels: Record<string, BotLevel>, settings: unknown, seed: number, opts: { maxSteps?: number; done?: (s: S) => boolean } = {}): Sim<S> {
  Math.random = mulberry(seed);
  let level: BotLevel = 'expert';
  // while one bot plans, only it counts as a bot, so it plans its own moves at its own level
  let planning: string | null = null;
  const queue: { by: string; at: number; a: GameAction; n: number }[] = [];
  const keys = new Set<string>();
  let n = 0;
  const ctx: GameCtx = {
    now: 1_000_000,
    fx: () => {},
    isConnected: () => true,
    isBot: (id) => (planning ? id === planning : id in levels),
    playerName: (id) => id,
    memo: new Map(),
    bot: (by, key, delay, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      queue.push({ by, at: ctx.now + delay * SPEED, a, n: n++ });
    },
    say: () => {},
    botLevel: () => level,
  };
  const ids = Object.keys(levels);
  const s = mod.start(ctx, ids, settings);
  const sim: Sim<S> = { s, ctx, times: [], errors: [] };
  const over = opts.done ?? ((x: S) => mod.result?.(x) != null);
  for (let step = 0; step < (opts.maxSteps ?? 20000) && !over(s); step++) {
    for (const b of ids) {
      level = levels[b];
      planning = b;
      const t0 = process.cpuUsage();
      mod.botPlan?.(ctx, s, [b]);
      const d = process.cpuUsage(t0);
      sim.times.push((d.user + d.system) / 1000);
      planning = null;
    }
    queue.sort((x, y) => x.at - y.at || x.n - y.n);
    const next = queue.length ? Math.min(queue[0].at, ctx.now + 250) : ctx.now + 250;
    ctx.now = Math.max(ctx.now, next);
    while (queue.length && queue[0].at <= ctx.now) {
      const q = queue.shift()!;
      try {
        mod.act(ctx, s, q.by, q.a);
      } catch (e) {
        sim.errors.push(`${q.by} ${JSON.stringify(q.a)}: ${(e as Error).message}`);
      }
    }
    mod.tick?.(ctx, s);
  }
  Math.random = realRandom;
  return sim;
}

/** Share of games won by `who` (first place, alone or tied) over a seeded series. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function series<S>(mod: GameModule<S, any>, levels: Record<string, BotLevel>, settings: unknown, games: number, who: string, seed0 = 1) {
  let wins = 0, unfinished = 0;
  const errors: string[] = [];
  const times: number[] = [];
  for (let g = 0; g < games; g++) {
    const sim = play(mod, levels, settings, seed0 + g * 7919);
    const r = mod.result?.(sim.s);
    if (!r) unfinished++;
    if (r?.places[0]?.includes(who)) wins++;
    for (const t of sim.times) times.push(t);
    errors.push(...sim.errors);
  }
  times.sort((x, y) => x - y);
  // the 99th percentile: a lone garbage-collection pause in a long series says nothing about the bot
  if (unfinished) errors.push(`${unfinished} unfinished game(s)`);
  return { rate: wins / games, slowest: times[Math.floor(times.length * 0.99)] ?? 0, errors };
}

/* ---------------- لودو ---------------- */

test('ludo: the expert bot beats the old bot (2 players)', () => {
  // seats alternate so neither side always starts first
  const a = series(ludo, { e: 'expert', o: 'easy' }, { exitOnOne: false }, 400, 'e', 11);
  const b = series(ludo, { o: 'easy', e: 'expert' }, { exitOnOne: false }, 400, 'e', 23);
  const rate = (a.rate + b.rate) / 2;
  console.log(`ludo expert vs easy: ${(rate * 100).toFixed(1)} %`);
  expect(rate).toBeGreaterThanOrEqual(0.62);
  expect([...a.errors, ...b.errors]).toEqual([]);
  expect(Math.max(a.slowest, b.slowest)).toBeLessThan(60);
}, 60_000);

test('ludo: takes the capture, runs from danger, and finishes when it can', () => {
  const board = (mine: number[], theirs: number[]): LudoBoard => ({
    seats: [
      { id: 'me', color: 'red' },
      { id: 'op', color: 'yellow' },
    ],
    tokens: { me: mine, op: theirs },
  });
  // red token at 10 with a 5: square 15 holds a yellow token (yellow progress 41 → abs 15): capture it
  expect(ludoBotMove(board([10, 30, -1, -1], [41, -1, -1, -1]), 'me', 5, false, 'expert')).toBe(0);
  // red token at 20 has a yellow token 2 behind (abs 18 = yellow 44): move it away rather than the safe one
  expect(ludoBotMove(board([20, 51, -1, -1], [44, -1, -1, -1]), 'me', 1, false, 'expert')).toBe(0);
  // a 4 finishes the token at 52
  expect(ludoBotMove(board([52, 3, -1, -1], [-1, -1, -1, -1]), 'me', 4, false, 'expert')).toBe(0);
});

test('ludo: decisions stay fast', () => {
  const b: LudoBoard = {
    seats: [
      { id: 'a', color: 'red' },
      { id: 'b', color: 'green' },
      { id: 'c', color: 'yellow' },
      { id: 'd', color: 'blue' },
    ],
    tokens: { a: [3, 17, 30, 45], b: [5, 12, 40, -1], c: [8, 22, 33, 50], d: [1, 19, 28, 44] },
  };
  ludoBotMove(b, 'a', 3, false, 'expert');
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) ludoBotMove(b, 'a', 1 + (i % 6), false, 'expert');
  expect((performance.now() - t0) / 100).toBeLessThan(20);
});

/* ---------------- الذاكرة ---------------- */

test('memory: the expert bot (perfect recall) beats the old bot', () => {
  const a = series(memory, { e: 'expert', o: 'easy' }, { pairs: 12 }, 120, 'e', 5);
  const b = series(memory, { o: 'easy', e: 'expert' }, { pairs: 12 }, 120, 'e', 9);
  const rate = (a.rate + b.rate) / 2;
  console.log(`memory expert vs easy: ${(rate * 100).toFixed(1)} %`);
  expect(rate).toBeGreaterThanOrEqual(0.7);
  expect(Math.max(a.slowest, b.slowest)).toBeLessThan(60);
  expect([...a.errors, ...b.errors]).toEqual([]);
}, 60_000);

test('memory: takes a known pair, matches the first card, and never turns a hidden card twice', () => {
  const deck = ['a', 'b', 'a', 'c', 'b', 'c'];
  const base = { deck, owners: deck.map(() => null), flipped: [] as number[] };
  // both «a» were seen: take them
  expect([0, 2]).toContain(memoryBotFlip({ ...base, seen: { 0: 'a', 2: 'a', 3: 'c' } }, 'expert'));
  // «b» turned first, the other «b» was seen before
  expect(memoryBotFlip({ ...base, flipped: [1], seen: { 1: 'b', 4: 'b' } }, 'expert')).toBe(4);
  // nothing known: an unseen card first
  for (let i = 0; i < 20; i++) expect([0, 1, 2, 3, 4, 5]).toContain(memoryBotFlip({ ...base, seen: {} }, 'expert'));
  // the first card is new, three singles are known and four cards are unseen: a known card is safer
  const deck8 = ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd'];
  const pick = memoryBotFlip({ deck: deck8, owners: deck8.map(() => null), flipped: [3], seen: { 0: 'a', 1: 'b', 2: 'c', 3: 'd' } }, 'expert');
  expect([0, 1, 2]).toContain(pick);
});

/* ---------------- شبكة الكلمات ---------------- */

test('scrabble: the expert bot (points + rack leave) beats the old bot', () => {
  const a = series(scrabble, { e: 'expert', o: 'easy' }, { seconds: 0, level: 1 }, 8, 'e', 3);
  console.log(`scrabble expert vs easy: ${(a.rate * 100).toFixed(0)} %`);
  expect(a.rate).toBeGreaterThanOrEqual(0.8);
  expect(a.errors).toEqual([]);
}, 120_000);

test('scrabble: the rack leave beats playing the best score alone (seeded, full search)', () => {
  // a full search (no time cut) keeps the series reproducible
  const ctx = { now: 0, fx() {}, isConnected: () => true, isBot: () => true, playerName: (x: string) => x, memo: new Map(), bot() {}, say() {} } as unknown as GameCtx;
  let wins = 0, margin = 0;
  const N = 8;
  for (let g = 0; g < N; g++) {
    Math.random = mulberry(1000 + g);
    const ids = g % 2 ? ['e', 's'] : ['s', 'e'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = scrabble.start(ctx, ids, { seconds: 0, level: 1 });
    for (let t = 0; t < 200 && s.phase === 'play'; t++) scrabble.act(ctx, s, s.turn, botAction(s, s.turn, s.turn === 'e' ? 'expert' : 'smart', 5000));
    const d = s.scores.e - s.scores.s;
    margin += d;
    if (d > 0) wins++;
  }
  Math.random = realRandom;
  console.log(`scrabble expert vs best-score: ${wins}/${N}, average margin ${(margin / N).toFixed(1)}`);
  expect(margin).toBeGreaterThan(0);
}, 120_000);

/** CPU time of one call (ms): wall-clock time means little on a busy test machine. */
function cpuMs(f: () => void): number {
  const t0 = process.cpuUsage();
  f();
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / 1000;
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

test('scrabble: the rack leave prefers a blank and «ال», and hates a clogged rack', () => {
  const t = (l: string, v = 1, id = 0) => ({ id, l, v });
  expect(leaveValue([t(''), t('ا'), t('ل')], 50)).toBeGreaterThan(leaveValue([t('ظ', 10), t('ث', 8), t('ذ', 8)], 50));
  expect(leaveValue([t('ا'), t('ل')], 50)).toBeGreaterThan(leaveValue([t('ن'), t('ن')], 50));
  // the bag is empty: tiles kept cost their value, going out is worth something
  expect(leaveValue([], 0)).toBeGreaterThan(0);
  expect(leaveValue([t('ظ', 10)], 0)).toBeLessThan(-20);
});

test('scrabble: an expert move takes well under the budget', () => {
  Math.random = mulberry(77);
  const ctx = { now: 0, fx() {}, isConnected: () => true, isBot: () => true, playerName: (x: string) => x, memo: new Map(), bot() {}, say() {} } as unknown as GameCtx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = scrabble.start(ctx, ['a', 'b'], { seconds: 0, level: 1 });
  const times: number[] = [];
  for (let k = 0; k < 24 && s.phase === 'play'; k++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let act: any;
    times.push(cpuMs(() => (act = botActionOf(s))));
    scrabble.act(ctx, s, s.turn, act);
  }
  console.log(`scrabble expert move: p95 ${p95(times).toFixed(1)} ms CPU`);
  expect(p95(times)).toBeLessThan(120); // generous: CPU time still varies on a busy machine
}, 60_000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const botActionOf = (s: any) => {
  let a: unknown;
  scrabble.botPlan!({ now: 0, isBot: () => true, bot: (_b: string, _k: string, _d: number, x: unknown) => void (a = x), botLevel: () => 'expert' } as unknown as GameCtx, s, [s.turn]);
  return a;
};

/* ---------------- فك الشيفرة ---------------- */

const CB = { rounds: 3, pegs: 4, colors: 6, repeats: false, maxTries: 10, level: 'medium' as const };

test('codebreak: the expert bot (entropy) beats the old bot', () => {
  const a = series(codebreak, { e: 'expert', o: 'easy' }, CB, 30, 'e', 1);
  const b = series(codebreak, { e: 'expert', o: 'easy' }, { ...CB, pegs: 5, colors: 8, repeats: true, maxTries: 12 }, 10, 'e', 2);
  console.log(`codebreak expert vs easy: ${(a.rate * 100).toFixed(0)} % (4×6), ${(b.rate * 100).toFixed(0)} % (5×8 with repeats)`);
  expect(a.rate).toBeGreaterThanOrEqual(0.7);
  expect(b.rate).toBeGreaterThanOrEqual(0.7);
  expect([...a.errors, ...b.errors]).toEqual([]);
}, 120_000);

test('codebreak: fewer tries than the old bot, the last code when one is left, fast', () => {
  const rand = mulberry(5);
  const avg = (level: 'easy' | 'expert', pegs: number, colors: number, repeats: boolean, codes: number[][], times: number[]) => {
    let total = 0;
    for (const code of codes) {
      const rows: { guess: number[]; black: number; white: number }[] = [];
      while (rows.length < 15) {
        let g2: number[] = [];
        times.push(cpuMs(() => (g2 = botGuess(rows, { pegs, colors, repeats, level }, rand))));
        expect(rows.some((r) => r.guess.join() === g2.join())).toBe(false);
        rows.push({ guess: g2, ...codebreakMarks(g2, code) });
        if (rows.at(-1)!.black === pegs) break;
      }
      total += rows.length;
    }
    return total / codes.length;
  };
  const t: number[] = [];
  // every one of the 360 codes of 4 pegs / 6 colours, and 12 random codes of 5 pegs / 8 colours with repeats
  const all46 = allCodes(4, 6, false);
  const some58 = Array.from({ length: 12 }, () => Array.from({ length: 5 }, () => Math.floor(rand() * 8)));
  const e46 = avg('expert', 4, 6, false, all46, t), o46 = avg('easy', 4, 6, false, all46, []);
  const e58 = avg('expert', 5, 8, true, some58, t), o58 = avg('easy', 5, 8, true, some58, []);
  console.log(`codebreak tries: 4×6 expert ${e46.toFixed(2)} / old ${o46.toFixed(2)}; 5×8+ expert ${e58.toFixed(2)} / old ${o58.toFixed(2)}; p95 ${p95(t).toFixed(1)} ms`);
  expect(e46).toBeLessThan(4.1);
  expect(e46).toBeLessThan(o46 - 0.1);
  expect(e58).toBeLessThan(o58);
  expect(p95(t)).toBeLessThan(60);
  // only [0,1,2,4] and [0,1,2,5] fit: guess one of them
  const rows = [
    { guess: [0, 1, 2, 3], black: 3, white: 0 },
    { guess: [0, 1, 2, 4], black: 3, white: 0 },
  ];
  expect(['0,1,2,5']).toContain(botGuess(rows, { pegs: 4, colors: 6, repeats: false, level: 'expert' }).join());
}, 60_000);

/* ---------------- كلمة السر ---------------- */

test('wordle: the expert bot (entropy) beats the old bot', () => {
  const a = series(wordle, { e: 'expert', o: 'easy' }, { rounds: 3, words: 'general' }, 12, 'e', 3);
  const b = series(wordle, { e: 'expert', o: 'easy' }, { rounds: 3, words: 'mix', hint: false }, 8, 'e', 4);
  console.log(`wordle expert vs easy: ${(a.rate * 100).toFixed(0)} % (general), ${(b.rate * 100).toFixed(0)} % (mix, no hint)`);
  expect((a.rate * 12 + b.rate * 8) / 20).toBeGreaterThanOrEqual(0.7);
  expect([...a.errors, ...b.errors]).toEqual([]);
}, 120_000);

test('wordle: the expert always solves within 6, in about 3 tries, under budget', () => {
  const pool = [...new Set(WORDLE_WORDS.map(normWord))];
  const rand = mulberry(9);
  let total = 0;
  const times: number[] = [];
  wordleExpertGuess(pool, VALID_GUESSES, [], 'general'); // the opener is worked out once
  for (let k = 0; k < 60; k++) {
    const ans = pool[Math.floor(rand() * pool.length)];
    const rows: { guess: string; marks: ReturnType<typeof markGuess> }[] = [];
    while (rows.length < 6) {
      let g: string | null = null;
      times.push(cpuMs(() => (g = wordleExpertGuess(pool, VALID_GUESSES, rows, 'general', rand))));
      expect(VALID_GUESSES.has(g!)).toBe(true);
      rows.push({ guess: g!, marks: markGuess(g!, ans) });
      if (g === ans) break;
    }
    expect(rows.at(-1)!.guess).toBe(ans);
    total += rows.length;
  }
  console.log(`wordle expert: ${(total / 60).toFixed(2)} tries, p95 ${p95(times).toFixed(1)} ms`);
  expect(total / 60).toBeLessThan(3.4);
  expect(p95(times)).toBeLessThan(60);
  // the candidates are exactly the words that would have shown the same colours
  const rows = [{ guess: pool[0], marks: markGuess(pool[0], pool[5]) }];
  expect(wordleCandidates(pool, rows)).toEqual(pool.filter((w) => markGuess(pool[0], w).join() === rows[0].marks.join()));
}, 60_000);

/* ---------------- سودوكو ---------------- */

test('sudoku: the expert bot (deductions, quick on easy cells) beats the old bot', () => {
  const r = series(sudoku, { e: 'expert', o: 'easy' }, { level: 'easy' }, 6, 'e', 2);
  console.log(`sudoku expert vs easy: ${(r.rate * 100).toFixed(0)} %`);
  expect(r.rate).toBeGreaterThanOrEqual(0.8);
  expect(r.errors).toEqual([]);
}, 60_000);

test('sudoku: every step is a right number, found from the bot’s own grid', () => {
  const { puzzle, solution } = generateSudoku('hard');
  expect(solveSudoku(puzzle)).toEqual(solution);
  const grid = puzzle.slice();
  for (let k = 0; k < 81; k++) {
    const st = sudokuNextStep(grid);
    if (!st) break;
    expect(grid[st.cell]).toBe(0);
    expect(st.value).toBe(solution[st.cell]);
    grid[st.cell] = st.value;
  }
  expect(grid).toEqual(solution);
});

/* ---------------- حروف مبعثرة ---------------- */

test('boggle: the expert bot (more, longer words) beats the old bot', () => {
  const r = series(boggle, { e: 'expert', o: 'easy' }, { rounds: 2, size: 4, seconds: 120, unique: true, level: 'medium' }, 10, 'e', 4);
  console.log(`boggle expert vs easy: ${(r.rate * 100).toFixed(0)} %`);
  expect(r.rate).toBeGreaterThanOrEqual(0.8);
  expect(r.errors).toEqual([]);
}, 60_000);

/* ---------------- الحج ---------------- */

test('hajj: the expert bot (card values, more right answers) beats the old bot', () => {
  const n = 150;
  const r = series(hajj, { e: 'expert', o: 'easy' }, { questions: true }, n, 'e', 6);
  const r2 = series(hajj, { o: 'easy', e: 'expert' }, { questions: true }, n, 'e', 8);
  const rate = (r.rate + r2.rate) / 2;
  console.log(`hajj expert vs easy: ${(rate * 100).toFixed(0)} %`);
  expect(rate).toBeGreaterThanOrEqual(0.6);
  expect([...r.errors, ...r2.errors]).toEqual([]);
}, 120_000);

test('hajj: «الدليل» right before a station, no +2 next to one, keep cards otherwise', () => {
  const hand = (...kinds: ZadKind[]) => kinds.map((kind, id) => ({ id, kind }));
  const others = [{ id: 'x', pos: 2 }];
  // one square before station 8: the guide passes it
  expect(hajjCardChoice(hand('dalil', 'talbiya'), { pos: 7 }, others, 44, 3, 'expert')?.card).toBe(0);
  // +2 is useless one square before a station, and the guide is not in hand: keep the cards
  expect(hajjCardChoice(hand('talbiya'), { pos: 7 }, others, 44, 3, 'expert')).toBeNull();
  // right after a station, far from the next: +2 helps
  expect(cardGain('talbiya', 8, 44, [2])).toBeGreaterThan(cardGain('talbiya', 10, 44, [2]));
});

/* ---------------- ملك العقار ---------------- */

test('estate: the expert bot (valuation, reserve, sets, trades) beats the old bot', () => {
  const S = { startCash: 1500, rounds: 15 };
  const a = series(estate, { e: 'expert', o: 'easy' }, S, 60, 'e', 1);
  const b = series(estate, { o: 'easy', e: 'expert' }, S, 60, 'e', 2);
  const c = series(estate, { o: 'easy', e: 'expert', p: 'easy' }, S, 60, 'e', 3);
  // a longer game: colour sets and houses have time to pay off
  const d = series(estate, { e: 'expert', o: 'easy' }, { startCash: 1500, rounds: 30 }, 30, 'e', 4);
  const two = (a.rate + b.rate) / 2;
  console.log(`estate expert vs easy: ${(two * 100).toFixed(0)} % (2 players, 15 rounds), ${(c.rate * 100).toFixed(0)} % (3 players, 1 expert), ${(d.rate * 100).toFixed(0)} % (30 rounds)`);
  expect(two).toBeGreaterThanOrEqual(0.58);
  expect(c.rate).toBeGreaterThanOrEqual(0.45); // a fair share is 33 %
  expect(d.rate).toBeGreaterThanOrEqual(0.58);
  expect([...a.errors, ...b.errors, ...c.errors, ...d.errors]).toEqual([]);
  expect(Math.max(a.slowest, b.slowest, c.slowest, d.slowest)).toBeLessThan(60);
}, 120_000);

test('estate: trades that hand a rival a colour set are refused; a set-finishing auction is worth more', () => {
  const t = {
    players: [
      { id: 'me', pos: 0, cash: 1500, jail: null, jailCards: 0, bankrupt: false },
      { id: 'op', pos: 20, cash: 1500, jail: null, jailCards: 0, bankrupt: false },
    ],
    props: { 1: { owner: 'op', houses: 0, mortgaged: false }, 3: { owner: 'me', houses: 0, mortgaged: false }, 37: { owner: 'me', houses: 0, mortgaged: false } },
    round: 2,
    settings: { rounds: 15 },
  };
  // the old bot's offer: 1.7 × the price for the brown deed that finishes its set
  expect(expertAccepts(t, { id: 1, from: 'op', to: 'me', give: { props: [], cash: 100 }, get: { props: [3], cash: 0 }, endsAt: 0 })).toBe(false);
  // a fair price for a lone deed that helps nobody is fine
  expect(expertAccepts(t, { id: 2, from: 'op', to: 'me', give: { props: [], cash: 600 }, get: { props: [37], cash: 0 }, endsAt: 0 })).toBe(true);
  // the brown deed finishing my set is worth more to me at auction than a random one
  expect(expertAuctionMax(t, 'me', 1)).toBeGreaterThan(expertAuctionMax(t, 'me', 6));
});

/* ---------------- every level ---------------- */

test('smart bots play every game to the end with legal moves only', () => {
  const games: [GameModule<unknown, unknown>, unknown][] = [
    [ludo as never, { exitOnOne: true }],
    [memory as never, { pairs: 8 }],
    [estate as never, { startCash: 1500, rounds: 8 }],
    [hajj as never, { questions: true }],
    [scrabble as never, { seconds: 0, level: 1 }],
    [wordle as never, { rounds: 2, words: 'quran', hint: true }],
    [codebreak as never, { ...CB, rounds: 2, repeats: true }],
    [sudoku as never, { level: 'easy' }],
    [boggle as never, { rounds: 1, size: 5, seconds: 120, unique: false, level: 'medium' }],
  ];
  for (const [mod, settings] of games) {
    const sim = play(mod, { a: 'smart', b: 'expert', c: 'easy' }, settings, 42);
    expect(mod.result?.(sim.s)).not.toBeNull();
    expect(sim.errors).toEqual([]);
  }
}, 120_000);
