/**
 * «الكلمات المتقاطعة» — the grid generator.
 *
 * A freeform mini crossword (5×5 to 7×7 with black cells) built from the bank (server/cross-words.ts):
 * a first word, then, one at a time, the placement that crosses the grid best (letters must match). After
 * every placement each run of two or more letters, across and down, must be a word of the bank and appear
 * only once — so a letter that lands next to another never makes a run that isn't a word, and every white
 * cell belongs to at least one word. Several tries with the same random source; the densest grid with 6 to
 * 12 words wins. Seeded: the same `rnd` gives the same grid.
 *
 * Coordinates: index = row * cols + col, col 0 is the RIGHT edge (an across word reads with growing col).
 * Numbers go row by row from the top, each row from the right.
 */
import type { CrossDir, CrossLevel } from '../src/shared/games/cross';
import { CROSS_BY_KEY, keyLetters, type CrossDiff, type CrossWord } from './cross-words';

export type Rnd = () => number;

export interface CrossSlot {
  num: number;
  dir: CrossDir;
  /** the cells in reading order */
  cells: number[];
  key: string;
  word: string;
  clue: string;
  diff: CrossDiff;
}

export interface CrossPuzzle {
  rows: number;
  cols: number;
  /** each cell's letter, '' = black */
  sol: string[];
  nums: number[];
  slots: CrossSlot[];
}

export interface GenOptions {
  level: CrossLevel;
  /** words to keep out if possible (the room's last grids) */
  avoid?: ReadonlySet<string>;
  /** tries (each a whole grid); the best one is kept */
  tries?: number;
}

export const GEN_MIN_WORDS = 6;
export const GEN_MAX_WORDS = 12;
const MAX_SIDE = 7;
const MIN_SIDE = 5;
/** Runs of two letters allowed in a grid (they are words, but short ones). */
const MAX_TWO = 2;

/** A small fast seeded generator (mulberry32). */
export function seededRnd(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* The pool of words for a level                                       */
/* ------------------------------------------------------------------ */

interface Pool {
  /** every key a run may be */
  dict: Set<string>;
  letters: Map<string, string[]>;
  /** letter → [key, index of the letter] of the words that may be placed (3+ letters) */
  index: Map<string, [string, number][]>;
  /** placeable keys (3+ letters) */
  keys: string[];
  /** medium keys (for «متوسط») */
  medium: Set<string>;
}

const pools = new Map<CrossLevel, Pool>();

/** The entries a level may use for a key. */
function entriesFor(key: string, level: CrossLevel): CrossWord[] {
  const all = CROSS_BY_KEY.get(key) ?? [];
  return level === 'easy' ? all.filter((w) => w.diff === 'e') : all;
}

function poolFor(level: CrossLevel): Pool {
  const cached = pools.get(level);
  if (cached) return cached;
  const dict = new Set<string>();
  const letters = new Map<string, string[]>();
  const index = new Map<string, [string, number][]>();
  const keys: string[] = [];
  const medium = new Set<string>();
  for (const key of CROSS_BY_KEY.keys()) {
    const es = entriesFor(key, level);
    if (!es.length) continue;
    const ls = keyLetters(key);
    if (ls.length < 2 || ls.length > MAX_SIDE) continue;
    dict.add(key);
    letters.set(key, ls);
    if (es.every((e) => e.diff === 'm')) medium.add(key);
    if (ls.length < 3) continue;
    keys.push(key);
    ls.forEach((l, i) => {
      let list = index.get(l);
      if (!list) index.set(l, (list = []));
      list.push([key, i]);
    });
  }
  const p = { dict, letters, index, keys, medium };
  pools.set(level, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Building one grid                                                   */
/* ------------------------------------------------------------------ */

interface Build {
  R: number;
  C: number;
  g: string[];
  runs: Set<string>;
}

/** Every run of 2+ letters (across, then down) as keys, or null if one isn't a word / comes twice. */
function allRuns(b: Build, dict: Set<string>): Set<string> | null {
  const { R, C, g } = b;
  const out = new Set<string>();
  const take = (s: string) => {
    if ([...s].length < 2) return true;
    if (!dict.has(s) || out.has(s)) return false;
    out.add(s);
    return true;
  };
  for (let r = 0; r < R; r++) {
    let cur = '';
    for (let c = 0; c <= C; c++) {
      const ch = c < C ? g[r * C + c] : '';
      if (ch) cur += ch;
      else {
        if (!take(cur)) return null;
        cur = '';
      }
    }
  }
  for (let c = 0; c < C; c++) {
    let cur = '';
    for (let r = 0; r <= R; r++) {
      const ch = r < R ? g[r * C + c] : '';
      if (ch) cur += ch;
      else {
        if (!take(cur)) return null;
        cur = '';
      }
    }
  }
  return out;
}

interface Cand {
  key: string;
  dir: CrossDir;
  r: number;
  c: number;
  score: number;
  runs: Set<string>;
}

/** Try `key` from (r, c) in `dir`: null if it doesn't fit, else the runs after it and its crossings. */
function tryPlace(b: Build, pool: Pool, key: string, dir: CrossDir, r: number, c: number, first: boolean): { runs: Set<string>; cross: number } | null {
  const ls = pool.letters.get(key)!;
  const n = ls.length;
  const dr = dir === 'd' ? 1 : 0;
  const dc = dir === 'a' ? 1 : 0;
  const { R, C, g } = b;
  if (r < 0 || c < 0 || r + dr * (n - 1) >= R || c + dc * (n - 1) >= C) return null;
  const at = (rr: number, cc: number) => (rr < 0 || cc < 0 || rr >= R || cc >= C ? '' : g[rr * C + cc]);
  if (at(r - dr, c - dc) || at(r + dr * n, c + dc * n)) return null;
  if (b.runs.has(key)) return null;
  let cross = 0;
  let fresh = 0;
  let prevOld = false;
  for (let i = 0; i < n; i++) {
    const ch = g[(r + dr * i) * C + (c + dc * i)];
    if (ch) {
      if (ch !== ls[i]) return null;
      // two letters side by side already there are a word of this direction: it would be swallowed
      if (prevOld) return null;
      cross++;
      prevOld = true;
    } else {
      fresh++;
      prevOld = false;
    }
  }
  if (!fresh || (!first && !cross)) return null;
  // the runs across this word through its new letters: each one a new word (or a lone letter)
  const added = [key];
  const pr = dc, pc = dr;
  for (let i = 0; i < n; i++) {
    const rr = r + dr * i, cc = c + dc * i;
    if (g[rr * C + cc]) continue;
    let before = 0, after = 0;
    while (at(rr - pr * (before + 1), cc - pc * (before + 1))) before++;
    while (at(rr + pr * (after + 1), cc + pc * (after + 1))) after++;
    if (!before && !after) continue;
    // a word already there would grow into another one
    if (before >= 2 || after >= 2) return null;
    let s = '';
    for (let k = -before; k <= after; k++) s += k === 0 ? ls[i] : at(rr + pr * k, cc + pc * k);
    if (!pool.dict.has(s) || b.runs.has(s) || added.includes(s)) return null;
    added.push(s);
  }
  const runs = new Set(b.runs);
  for (const s of added) runs.add(s);
  return { runs, cross };
}

const twoCount = (runs: Set<string>, pool: Pool) => [...runs].filter((k) => pool.letters.get(k)!.length === 2).length;

function buildOnce(rnd: Rnd, pool: Pool, opts: GenOptions): Build | null {
  const R = MIN_SIDE + Math.floor(rnd() * (MAX_SIDE - MIN_SIDE + 1));
  const C = MIN_SIDE + Math.floor(rnd() * (MAX_SIDE - MIN_SIDE + 1));
  const b: Build = { R, C, g: Array(R * C).fill(''), runs: new Set() };
  const avoid = opts.avoid ?? new Set<string>();
  const medium = opts.level === 'medium';

  // the first word: long, across or down, somewhere in the grid
  const dir0: CrossDir = rnd() < 0.5 ? 'a' : 'd';
  const side = dir0 === 'a' ? C : R;
  const firsts = pool.keys.filter((k) => {
    const n = pool.letters.get(k)!.length;
    return n >= Math.min(5, side) && n <= side && !avoid.has(k) && (!medium || pool.medium.has(k) || rnd() < 0.3);
  });
  if (!firsts.length) return null;
  const k0 = firsts[Math.floor(rnd() * firsts.length)];
  const n0 = pool.letters.get(k0)!.length;
  const across = dir0 === 'a';
  const r0 = across ? Math.floor(rnd() * R) : Math.floor(rnd() * (R - n0 + 1));
  const c0 = across ? Math.floor(rnd() * (C - n0 + 1)) : Math.floor(rnd() * C);
  const p0 = tryPlace(b, pool, k0, dir0, r0, c0, true);
  if (!p0) return null;
  placeLetters(b, pool, k0, dir0, r0, c0);
  b.runs = p0.runs;

  while (b.runs.size < GEN_MAX_WORDS) {
    let best: Cand | null = null;
    for (let idx = 0; idx < R * C; idx++) {
      const ch = b.g[idx];
      if (!ch) continue;
      const rr = Math.floor(idx / C), cc = idx % C;
      for (const [key, i] of pool.index.get(ch) ?? []) {
        if (b.runs.has(key)) continue;
        for (const dir of ['a', 'd'] as const) {
          const r = dir === 'd' ? rr - i : rr;
          const c = dir === 'a' ? cc - i : cc;
          if (r < 0 || c < 0) continue;
          const p = tryPlace(b, pool, key, dir, r, c, false);
          if (!p) continue;
          const added = p.runs.size - b.runs.size;
          const twos = twoCount(p.runs, pool);
          if (twos > MAX_TWO || p.runs.size > GEN_MAX_WORDS) continue;
          const n = pool.letters.get(key)!.length;
          let score = 4 * p.cross + 3 * (added - 1) + 0.6 * n + rnd() * 3.5;
          if (avoid.has(key)) score -= 6;
          if (medium && pool.medium.has(key)) score += 2.5;
          score -= 2 * (twos - twoCount(b.runs, pool));
          if (!best || score > best.score) best = { key, dir, r, c, score, runs: p.runs };
        }
      }
    }
    if (!best) break;
    placeLetters(b, pool, best.key, best.dir, best.r, best.c);
    b.runs = best.runs;
  }
  return b;
}

function placeLetters(b: Build, pool: Pool, key: string, dir: CrossDir, r: number, c: number) {
  const ls = pool.letters.get(key)!;
  ls.forEach((l, i) => {
    b.g[(r + (dir === 'd' ? i : 0)) * b.C + (c + (dir === 'a' ? i : 0))] = l;
  });
}

/* ------------------------------------------------------------------ */
/* The finished grid                                                   */
/* ------------------------------------------------------------------ */

/** The grid cut to its letters, numbered, with a clue for every word. */
function finish(b: Build, rnd: Rnd, level: CrossLevel): CrossPuzzle {
  let r0 = b.R, r1 = -1, c0 = b.C, c1 = -1;
  b.g.forEach((ch, i) => {
    if (!ch) return;
    const r = Math.floor(i / b.C), c = i % b.C;
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  });
  const rows = r1 - r0 + 1, cols = c1 - c0 + 1;
  const sol: string[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) sol.push(b.g[r * b.C + c]);
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= rows || c >= cols ? '' : sol[r * cols + c]);
  const nums = Array(rows * cols).fill(0);
  const slots: CrossSlot[] = [];
  let n = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!at(r, c)) continue;
      const a = !at(r, c - 1) && !!at(r, c + 1);
      const d = !at(r - 1, c) && !!at(r + 1, c);
      if (!a && !d) continue;
      nums[r * cols + c] = ++n;
      for (const dir of (a && d ? ['a', 'd'] : a ? ['a'] : ['d']) as CrossDir[]) {
        const cells: number[] = [];
        for (let i = 0; ; i++) {
          const rr = dir === 'd' ? r + i : r, cc = dir === 'a' ? c + i : c;
          if (!at(rr, cc)) break;
          cells.push(rr * cols + cc);
        }
        const key = cells.map((x) => sol[x]).join('');
        const es = entriesFor(key, level);
        const pref = level === 'medium' ? es.filter((e) => e.diff === 'm') : [];
        const list = pref.length ? pref : es;
        const e = list[Math.floor(rnd() * list.length)];
        slots.push({ num: n, dir, cells, key, word: e.word, clue: e.clue, diff: e.diff });
      }
    }
  return { rows, cols, sol, nums, slots };
}

/** How good a grid is: dense, crossed, with enough words. */
function rate(p: CrossPuzzle): number {
  const white = p.sol.filter(Boolean).length;
  const density = white / (p.rows * p.cols);
  const crossed = p.sol.filter((ch, i) => ch && p.slots.filter((s) => s.cells.includes(i)).length > 1).length / white;
  return density * 10 + crossed * 4 + Math.min(p.slots.length, 10) * 0.4;
}

/** Is it a grid we show? */
export function acceptable(p: CrossPuzzle): boolean {
  return p.slots.length >= GEN_MIN_WORDS && p.slots.length <= GEN_MAX_WORDS && p.rows >= MIN_SIDE && p.cols >= MIN_SIDE && p.rows <= MAX_SIDE && p.cols <= MAX_SIDE;
}

/** A new grid for this level. */
export function generateCross(rnd: Rnd, opts: GenOptions): CrossPuzzle {
  const pool = poolFor(opts.level);
  const tries = opts.tries ?? 20;
  let best: { p: CrossPuzzle; score: number } | null = null;
  for (let t = 0; t < tries || (!best && t < tries * 6); t++) {
    const b = buildOnce(rnd, pool, opts);
    if (!b) continue;
    // the whole grid read again: every run a word of the bank, each once (as built)
    const runs = allRuns(b, pool.dict);
    if (!runs || runs.size !== b.runs.size) continue;
    const p = finish(b, rnd, opts.level);
    if (!acceptable(p)) continue;
    const score = rate(p);
    if (!best || score > best.score) best = { p, score };
  }
  if (best) return best.p;
  // never expected: a plain grid without the words to avoid
  if (opts.avoid?.size) return generateCross(rnd, { ...opts, avoid: undefined });
  throw new Error('cross-gen: no grid');
}

/** For tests and the report: density and crossings of a grid. */
export function gridStats(p: CrossPuzzle) {
  const white = p.sol.filter(Boolean).length;
  return {
    words: p.slots.length,
    size: `${p.rows}×${p.cols}`,
    density: white / (p.rows * p.cols),
    crossed: p.sol.filter((ch, i) => ch && p.slots.filter((s) => s.cells.includes(i)).length > 1).length / white,
    twos: p.slots.filter((s) => s.cells.length === 2).length,
  };
}
