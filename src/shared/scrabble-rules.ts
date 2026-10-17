/**
 * «شبكة الكلمات» — the board, the tile set and the scoring, shared by the server (which also checks the
 * words in the dictionary) and the app (which shows the score a move would make before it is sent).
 *
 * The board is 15×15, stored row by row: cell = row * 15 + col. Arabic is read right to left, so
 * column 0 is drawn on the RIGHT: an across word starts at its smallest column and its letters are read
 * in increasing column order; a down word is read in increasing row order.
 */
import type { ScrabbleCell, ScrabblePlacement, ScrabbleTile } from './games/scrabble';

export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const CENTER = 7 * SIZE + 7;
export const RACK = 7;
export const BINGO = 50;

export const rowOf = (cell: number) => Math.floor(cell / SIZE);
export const colOf = (cell: number) => cell % SIZE;
export const at = (r: number, c: number) => r * SIZE + c;

/**
 * Tile set: the letters as the dictionary writes them (see norm() in src/shared/arabic.ts: أ إ آ → ا,
 * ة → ه, ى → ي, ؤ → و, ئ → ي), so the 28 basic letters plus one ء (it stays ء in the dictionary:
 * «ماء», «سماء», «ضوء»). There is no ة tile: ه stands for it, as in the dictionary.
 * Counts and points follow how often each letter appears in Arabic words (the dictionary's own letter
 * counts, with the article «ال» in mind): common letters many and cheap, rare ones single and dear.
 *
 *   letter  count  points        letter  count  points
 *   ا        10      1           ق        3      3
 *   ل         8      1           ح        2      3
 *   ي         6      1           ج        2      4
 *   و         6      1           ش        2      4
 *   م         6      1           ص        2      4
 *   ن         6      1           ط        2      4
 *   ت         6      1           ز        2      5
 *   ر         5      1           خ        1      6
 *   ب         4      2           ض        1      6
 *   ه         4      2           غ        1      7
 *   س         3      2           ء        1      7
 *   د         3      2           ذ        1      8
 *   ع         3      2           ث        1      8
 *   ك         3      3           ظ        1     10
 *   ف         3      3           blank    2      0
 *                                                    total 100 tiles
 */
export const TILE_SET: readonly { l: string; n: number; v: number }[] = [
  { l: 'ا', n: 10, v: 1 },
  { l: 'ل', n: 8, v: 1 },
  { l: 'ي', n: 6, v: 1 },
  { l: 'و', n: 6, v: 1 },
  { l: 'م', n: 6, v: 1 },
  { l: 'ن', n: 6, v: 1 },
  { l: 'ت', n: 6, v: 1 },
  { l: 'ر', n: 5, v: 1 },
  { l: 'ب', n: 4, v: 2 },
  { l: 'ه', n: 4, v: 2 },
  { l: 'س', n: 3, v: 2 },
  { l: 'د', n: 3, v: 2 },
  { l: 'ع', n: 3, v: 2 },
  { l: 'ك', n: 3, v: 3 },
  { l: 'ف', n: 3, v: 3 },
  { l: 'ق', n: 3, v: 3 },
  { l: 'ح', n: 2, v: 3 },
  { l: 'ج', n: 2, v: 4 },
  { l: 'ش', n: 2, v: 4 },
  { l: 'ص', n: 2, v: 4 },
  { l: 'ط', n: 2, v: 4 },
  { l: 'ز', n: 2, v: 5 },
  { l: 'خ', n: 1, v: 6 },
  { l: 'ض', n: 1, v: 6 },
  { l: 'غ', n: 1, v: 7 },
  { l: 'ء', n: 1, v: 7 },
  { l: 'ذ', n: 1, v: 8 },
  { l: 'ث', n: 1, v: 8 },
  { l: 'ظ', n: 1, v: 10 },
  { l: '', n: 2, v: 0 },
];

/** The letters a tile can show, in alphabetical order (for the blank picker). */
export const LETTERS = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي', 'ء'];

export const VALUE: Record<string, number> = Object.fromEntries(TILE_SET.filter((t) => t.l).map((t) => [t.l, t.v]));

/** All 100 tiles in table order (the server shuffles them). */
export function makeTiles(): ScrabbleTile[] {
  const out: ScrabbleTile[] = [];
  for (const t of TILE_SET) for (let i = 0; i < t.n; i++) out.push({ id: out.length + 1, l: t.l, v: t.v });
  return out;
}

/** A letter as the dictionary writes it (hamza seats and ة folded), or '' if it isn't a tile letter. */
export function normLetter(ch: string): string {
  const l = ch.replace(/[أإآٱ]/g, 'ا').replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي');
  return LETTERS.includes(l) ? l : '';
}

export const rackValue = (tiles: readonly ScrabbleTile[]) => tiles.reduce((t, x) => t + x.v, 0);

/* ------------------------------------------------------------------ */
/* Premium squares                                                     */
/* ------------------------------------------------------------------ */

export type Premium = '' | 'dl' | 'tl' | 'dw' | 'tw' | 'star';

/**
 * Our own layout, drawn for one quarter (rows/cols 0–7, the centre lines included) and mirrored
 * both ways: T = word ×3, D = word ×2, t = letter ×3, d = letter ×2, * = the centre star (word ×2).
 */
const QUARTER = [
  'T...d..T',
  '.D...t..',
  '..D...d.',
  '...D...d',
  'd...D...',
  '.t...t..',
  '..d...d.',
  'T..d...*',
];
const CODE: Record<string, Premium> = { T: 'tw', D: 'dw', t: 'tl', d: 'dl', '*': 'star', '.': '' };

export const PREMIUM: readonly Premium[] = Array.from({ length: CELLS }, (_, i) => {
  const r = Math.min(rowOf(i), SIZE - 1 - rowOf(i));
  const c = Math.min(colOf(i), SIZE - 1 - colOf(i));
  return CODE[QUARTER[r][c]];
});

export const letterMult = (p: Premium) => (p === 'tl' ? 3 : p === 'dl' ? 2 : 1);
export const wordMult = (p: Premium) => (p === 'tw' ? 3 : p === 'dw' || p === 'star' ? 2 : 1);

/* ------------------------------------------------------------------ */
/* Checking and scoring a move                                         */
/* ------------------------------------------------------------------ */

export interface FormedWord {
  /** the letters in reading order */
  w: string;
  cells: number[];
  score: number;
}

export type Analysis =
  | { ok: true; words: FormedWord[]; score: number; bingo: boolean }
  | { ok: false; error: string };

type Grid = readonly (ScrabbleCell | null)[];

/**
 * Is this placement a legal move on the board (one line, no gaps, connected, first word on the star)?
 * If so: every word it forms and the score. The words are NOT checked in the dictionary here.
 */
export function analyse(board: Grid, placements: readonly ScrabblePlacement[]): Analysis {
  if (!placements.length) return { ok: false, error: 'ضع حرفاً واحداً على الأقل على اللوحة' };
  if (placements.length > RACK) return { ok: false, error: 'سبعة أحرف على الأكثر في الدور' };
  const placed = new Map<number, ScrabbleCell>();
  for (const p of placements) {
    if (!Number.isInteger(p.cell) || p.cell < 0 || p.cell >= CELLS) return { ok: false, error: 'مربع غير موجود' };
    if (board[p.cell] || placed.has(p.cell)) return { ok: false, error: 'هذا المربع مشغول' };
    if (!LETTERS.includes(p.l)) return { ok: false, error: 'حرف غير معروف' };
    placed.set(p.cell, { l: p.l, v: p.blank ? 0 : VALUE[p.l] });
  }
  const get = (cell: number) => placed.get(cell) ?? board[cell] ?? null;
  const cells = [...placed.keys()].sort((a, b) => a - b);
  const sameRow = cells.every((c) => rowOf(c) === rowOf(cells[0]));
  const sameCol = cells.every((c) => colOf(c) === colOf(cells[0]));
  if (!sameRow && !sameCol) return { ok: false, error: 'ضع أحرفك في سطر واحد: أفقياً أو عمودياً' };

  const first = !board.some(Boolean);
  if (first) {
    if (!placed.has(CENTER)) return { ok: false, error: 'الكلمة الأولى يجب أن تمر بالنجمة في وسط اللوحة' };
    if (cells.length < 2) return { ok: false, error: 'الكلمة الأولى تحتاج حرفين على الأقل' };
  }

  // the direction of the main word: a single tile goes the way it has a neighbour
  const hasH = (c: number) => (colOf(c) > 0 && !!get(c - 1)) || (colOf(c) < SIZE - 1 && !!get(c + 1));
  const across = cells.length > 1 ? sameRow : hasH(cells[0]);
  const step = across ? 1 : SIZE;

  for (let c = cells[0]; c <= cells[cells.length - 1]; c += step) {
    if (!get(c)) return { ok: false, error: 'لا تترك فراغاً بين أحرفك' };
  }

  const wordThrough = (cell: number, st: number): number[] => {
    const same = (a: number, b: number) => (st === 1 ? rowOf(a) === rowOf(b) : true);
    let s = cell;
    while (s - st >= 0 && same(s - st, cell) && get(s - st)) s -= st;
    const out: number[] = [];
    for (let c = s; c < CELLS && same(c, cell) && get(c); c += st) out.push(c);
    return out;
  };

  const spans: number[][] = [];
  const main = wordThrough(cells[0], step);
  if (main.length >= 2) spans.push(main);
  const cross = across ? SIZE : 1;
  for (const c of cells) {
    const w = wordThrough(c, cross);
    if (w.length >= 2) spans.push(w);
  }
  if (!spans.length) return { ok: false, error: 'الكلمة تحتاج حرفين على الأقل' };

  if (!first) {
    const touches = spans.some((span) => span.some((c) => !placed.has(c)));
    if (!touches) return { ok: false, error: 'يجب أن تتصل كلمتك بالأحرف الموجودة على اللوحة' };
  }

  const words = spans.map((span): FormedWord => {
    let sum = 0, mult = 1;
    for (const c of span) {
      const t = get(c)!;
      if (placed.has(c)) {
        sum += t.v * letterMult(PREMIUM[c]);
        mult *= wordMult(PREMIUM[c]);
      } else sum += t.v;
    }
    return { w: span.map((c) => get(c)!.l).join(''), cells: span, score: sum * mult };
  });
  const bingo = placements.length === RACK;
  return { ok: true, words, bingo, score: words.reduce((t, w) => t + w.score, 0) + (bingo ? BINGO : 0) };
}
