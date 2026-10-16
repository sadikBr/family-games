/**
 * Ludo board geometry on a 15×15 grid (row, col from the top-left).
 * Track: 52 squares clockwise; red starts at index 0, green 13, yellow 26, blue 39.
 * Token progress: -1 = base, 0..50 = track (relative to its start), 51..55 = home column, 56 = finished.
 */
import type { LudoColor } from './protocol';

export const LUDO_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
export const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
export const FINISH = 56;
export const LAST_TRACK = 50;

/** The 52 track squares as [row, col]. */
export const TRACK: [number, number][] = (() => {
  const t: [number, number][] = [];
  for (let c = 1; c <= 5; c++) t.push([6, c]); // 0-4
  for (let r = 5; r >= 0; r--) t.push([r, 6]); // 5-10
  t.push([0, 7]); // 11
  for (let r = 0; r <= 5; r++) t.push([r, 8]); // 12-17
  for (let c = 9; c <= 14; c++) t.push([6, c]); // 18-23
  t.push([7, 14]); // 24
  for (let c = 14; c >= 9; c--) t.push([8, c]); // 25-30
  for (let r = 9; r <= 14; r++) t.push([r, 8]); // 31-36
  t.push([14, 7]); // 37
  for (let r = 14; r >= 9; r--) t.push([r, 6]); // 38-43
  for (let c = 5; c >= 0; c--) t.push([8, c]); // 44-49
  t.push([7, 0]); // 50
  t.push([6, 0]); // 51
  return t;
})();

/** Home column squares (5) for each colour, from the entry toward the centre. */
export const HOME_COL: Record<LudoColor, [number, number][]> = {
  red: [1, 2, 3, 4, 5].map((c) => [7, c] as [number, number]),
  green: [1, 2, 3, 4, 5].map((r) => [r, 7] as [number, number]),
  yellow: [13, 12, 11, 10, 9].map((c) => [7, c] as [number, number]),
  blue: [13, 12, 11, 10, 9].map((r) => [r, 7] as [number, number]),
};

/** Where the 4 tokens wait in the base (centres of the 4 circles). */
export const BASE: Record<LudoColor, [number, number][]> = {
  red: [[2, 2], [2, 4], [4, 2], [4, 4]],
  green: [[2, 11], [2, 13], [4, 11], [4, 13]],
  yellow: [[11, 11], [11, 13], [13, 11], [13, 13]],
  blue: [[11, 2], [11, 4], [13, 2], [13, 4]],
};

/** Finished tokens gather in their triangle near the centre. */
export const GOAL: Record<LudoColor, [number, number]> = {
  red: [7, 6.2],
  green: [6.2, 7],
  yellow: [7, 7.8],
  blue: [7.8, 7],
};

/** Absolute track index for a token, or null if it's not on the shared track. */
export function trackIndex(color: LudoColor, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (START[color] + progress) % 52;
}

/** Grid cell (centre, in cell units) for a token. `slot` picks the base circle. */
export function cellOf(color: LudoColor, progress: number, slot: number): [number, number] {
  if (progress < 0) return BASE[color][slot];
  if (progress >= FINISH) return GOAL[color];
  if (progress > LAST_TRACK) {
    const [r, c] = HOME_COL[color][progress - LAST_TRACK - 1];
    return [r + 0.5, c + 0.5];
  }
  const [r, c] = TRACK[(START[color] + progress) % 52];
  return [r + 0.5, c + 0.5];
}

/** Seat colours by number of players (2 players sit opposite). */
export function seatColors(n: number): LudoColor[] {
  if (n === 2) return ['red', 'yellow'];
  if (n === 3) return ['red', 'green', 'yellow'];
  return LUDO_COLORS;
}
