/**
 * «الأسرع» — the mini-games' content. Each generator returns what the phones draw and the one right
 * answer (kept on the server until the reveal). `level` 0..2 grows over the game: a little harder each
 * third (more cells, bigger numbers, more stars…), always simple enough for a six-year-old.
 */
import {
  FAST_ANIMALS,
  FAST_COLORS,
  FAST_DIRS,
  FAST_KINDS,
  FAST_SHAPES,
  FAST_TURNABLE,
  type FastAnswer,
  type FastContent,
  type FastKind,
  type FastShape,
  type FastSpot,
} from '../src/shared/games/fast';

export type Rnd = () => number;

export interface FastItem {
  content: FastContent;
  answer: FastAnswer;
}

const int = (rnd: Rnd, min: number, max: number) => Math.floor(min + rnd() * (max - min + 1));
const pickOne = <T>(rnd: Rnd, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
function shuffled<T>(rnd: Rnd, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `answer` and three other distinct whole numbers near it (never below `min`), shuffled. */
function numberOptions(rnd: Rnd, answer: number, spread: number, min = 0, count = 4): number[] {
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < count && guard++ < 200) {
    const d = int(rnd, 1, spread) * (rnd() < 0.5 ? -1 : 1);
    if (answer + d >= min) set.add(answer + d);
  }
  for (let v = answer + 1; set.size < count; v++) set.add(v);
  return shuffled(rnd, [...set]);
}

/**
 * `n` spots that never overlap: one per cell of a jittered grid (cols × rows), each kept away from
 * its cell's edges. Fractions of the stage (0..1).
 */
export function scatter(rnd: Rnd, n: number, cols: number, rows: number, margin = 0.22): FastSpot[] {
  const cells = shuffled(
    rnd,
    Array.from({ length: cols * rows }, (_, i) => i),
  ).slice(0, n);
  return cells.map((c) => {
    const cx = c % cols;
    const cy = Math.floor(c / cols);
    const x = (cx + margin + rnd() * (1 - 2 * margin)) / cols;
    const y = (cy + margin + rnd() * (1 - 2 * margin)) / rows;
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  });
}

/* —— the mini-games ——————————————————————————————————————————————————————————————— */

function green(): FastItem {
  return { content: { kind: 'green' }, answer: 0 };
}

/** A grid of identical shapes, one different by its colour, its shape or (later) turned upside down. */
function odd(rnd: Rnd, level: number): FastItem {
  const cols = level === 0 ? 3 : 4;
  const n = cols * cols;
  const ways: ('color' | 'shape' | 'rot')[] = level === 0 ? ['color', 'shape'] : level === 1 ? ['color', 'shape', 'shape'] : ['shape', 'rot', 'color'];
  const way = pickOne(rnd, ways);
  const shapeKind = way === 'rot' ? pickOne(rnd, FAST_TURNABLE) : pickOne(rnd, FAST_SHAPES);
  const base: FastShape = { shape: shapeKind, color: pickOne(rnd, FAST_COLORS), rot: 0 };
  let other: FastShape;
  if (way === 'color') other = { ...base, color: pickOne(rnd, FAST_COLORS.filter((c) => c !== base.color)) };
  else if (way === 'shape') other = { ...base, shape: pickOne(rnd, FAST_SHAPES.filter((s) => s !== base.shape)) };
  else other = { ...base, rot: 180 };
  const at = int(rnd, 0, n - 1);
  const cells = Array.from({ length: n }, (_, i) => (i === at ? other : { ...base }));
  return { content: { kind: 'odd', cols, cells }, answer: at };
}

/** A few stars for 2 s, then the count among 4 buttons. */
function stars(rnd: Rnd, level: number): FastItem {
  const [lo, hi] = level === 0 ? [3, 6] : level === 1 ? [4, 8] : [6, 10];
  const count = int(rnd, lo, hi);
  const spots = scatter(rnd, count, 4, 3, 0.18);
  const options = numberOptions(rnd, count, 2, 1);
  return { content: { kind: 'stars', stars: spots, options, showMs: 2000 }, answer: options.indexOf(count) };
}

/** A colour's name written in another colour: tap the colour of the writing. */
function stroop(rnd: Rnd): FastItem {
  const [ink, word] = shuffled(rnd, FAST_COLORS);
  const others = shuffled(
    rnd,
    FAST_COLORS.filter((c) => c !== ink && c !== word),
  ).slice(0, 2);
  const options = shuffled(rnd, [ink, word, ...others]);
  return { content: { kind: 'stroop', word, ink, options }, answer: options.indexOf(ink) };
}

/** Six different numbers: tap the biggest. */
function biggest(rnd: Rnd, level: number): FastItem {
  const [lo, hi] = level === 0 ? [1, 20] : level === 1 ? [10, 60] : [10, 99];
  const set = new Set<number>();
  if (level === 2) {
    // close numbers: the same tens for most of them
    const top = int(rnd, 30, 99);
    set.add(top);
    let guard = 0;
    while (set.size < 6 && guard++ < 300) {
      const v = top - int(rnd, 1, 14);
      if (v >= lo) set.add(v);
    }
  }
  while (set.size < 6) set.add(int(rnd, lo, hi));
  const numbers = shuffled(rnd, [...set]);
  return { content: { kind: 'biggest', numbers }, answer: numbers.indexOf(Math.max(...numbers)) };
}

function arrow(rnd: Rnd): FastItem {
  const dir = pickOne(rnd, FAST_DIRS);
  return { content: { kind: 'arrow', dir }, answer: FAST_DIRS.indexOf(dir) };
}

/** An animal, and 4 (later 6) to choose from: tap the same one. */
function match(rnd: Rnd, level: number): FastItem {
  const options = shuffled(rnd, FAST_ANIMALS).slice(0, level === 2 ? 6 : 4);
  const answer = int(rnd, 0, options.length - 1);
  return { content: { kind: 'match', target: options[answer], options }, answer };
}

/** An easy sum (a subtraction now and then near the end) with 4 answers. */
function sum(rnd: Rnd, level: number): FastItem {
  let a: number;
  let b: number;
  let op: '+' | '-' = '+';
  if (level === 0) {
    a = int(rnd, 1, 5);
    b = int(rnd, 1, 5);
  } else if (level === 1) {
    a = int(rnd, 2, 9);
    b = int(rnd, 2, 9);
  } else if (rnd() < 0.5) {
    op = '-';
    a = int(rnd, 6, 15);
    b = int(rnd, 2, a - 1);
  } else {
    a = int(rnd, 4, 12);
    b = int(rnd, 3, 9);
  }
  const value = op === '+' ? a + b : a - b;
  const options = numberOptions(rnd, value, 3, 0);
  return { content: { kind: 'sum', a, b, op, options }, answer: options.indexOf(value) };
}

/** 1, 2, 3… scattered on the stage: tap them in order. */
function order(rnd: Rnd, level: number): FastItem {
  const n = level === 0 ? 4 : level === 1 ? 5 : 6;
  const spots = scatter(rnd, n, 3, 3, 0.25);
  const labels = shuffled(
    rnd,
    Array.from({ length: n }, (_, i) => i + 1),
  );
  // the right taps: the spot of 1, then the spot of 2…
  const answer = Array.from({ length: n }, (_, k) => labels.indexOf(k + 1));
  return { content: { kind: 'order', labels, spots }, answer };
}

export function makeFastItem(kind: FastKind, level: number, rnd: Rnd = Math.random): FastItem {
  switch (kind) {
    case 'green':
      return green();
    case 'odd':
      return odd(rnd, level);
    case 'stars':
      return stars(rnd, level);
    case 'stroop':
      return stroop(rnd);
    case 'biggest':
      return biggest(rnd, level);
    case 'arrow':
      return arrow(rnd);
    case 'match':
      return match(rnd, level);
    case 'sum':
      return sum(rnd, level);
    case 'order':
      return order(rnd, level);
  }
}

/** How many options (cells, buttons, spots) an answer index may point at. */
export function optionCount(c: FastContent): number {
  switch (c.kind) {
    case 'green':
      return 1;
    case 'odd':
      return c.cells.length;
    case 'stars':
    case 'sum':
      return c.options.length;
    case 'stroop':
      return c.options.length;
    case 'biggest':
      return c.numbers.length;
    case 'arrow':
      return FAST_DIRS.length;
    case 'match':
      return c.options.length;
    case 'order':
      return c.labels.length;
  }
}

/**
 * The game's mini-games: every kind once in a shuffled order, again and again, never the same kind
 * twice in a row.
 */
export function dealKinds(rounds: number, rnd: Rnd = Math.random): FastKind[] {
  const out: FastKind[] = [];
  while (out.length < rounds) {
    let pack = shuffled(rnd, FAST_KINDS);
    if (out.length && pack[0] === out[out.length - 1]) pack = [...pack.slice(1), pack[0]];
    out.push(...pack);
  }
  return out.slice(0, rounds);
}

/** 0, 1 or 2: each third of the game a little harder. */
export const levelFor = (round: number, rounds: number) => Math.min(2, Math.floor((3 * round) / Math.max(1, rounds)));
