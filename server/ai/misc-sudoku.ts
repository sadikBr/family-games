/**
 * «سودوكو» bots: which cell a bot fills next, worked out from its own grid like a person would.
 * A naked single (one number fits the cell) is the quickest to see, a hidden single (the only place
 * for a number in a row, column or box) a little slower; when neither exists the bot finds the cell
 * with the fewest options and works it out (a full solve of its own grid: the puzzle has one solution).
 */

const ROW = (i: number) => Math.floor(i / 9);
const COL = (i: number) => i % 9;
const BOX = (i: number) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

/** The 27 units (rows, columns, boxes) as cell lists, and each cell's peers. */
const UNITS: number[][] = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) UNITS.push(Array.from({ length: 81 }, (_, i) => i).filter((i) => BOX(i) === b));
const PEERS: number[][] = Array.from({ length: 81 }, (_, i) =>
  [...new Set(UNITS.filter((u) => u.includes(i)).flat())].filter((j) => j !== i),
);

/** Bit mask of the numbers (bit v for 1…9) that fit cell i. */
function options(grid: readonly number[], i: number): number {
  let used = 0;
  for (const j of PEERS[i]) if (grid[j]) used |= 1 << grid[j];
  return 0b1111111110 & ~used;
}

const bits = (m: number) => {
  let n = 0;
  for (let v = 1; v <= 9; v++) if (m & (1 << v)) n++;
  return n;
};
const only = (m: number) => {
  for (let v = 1; v <= 9; v++) if (m === 1 << v) return v;
  return 0;
};

/** Solve a grid (0 = empty) by constraint propagation and search. Returns null if it has no solution. */
export function solveSudoku(grid: readonly number[]): number[] | null {
  const g = grid.slice();
  const rec = (): boolean => {
    let best = -1, bestN = 10, bestM = 0;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = options(g, i);
      const n = bits(m);
      if (n === 0) return false;
      if (n < bestN) (bestN = n), (best = i), (bestM = m);
      if (n === 1) break;
    }
    if (best < 0) return true;
    for (let v = 1; v <= 9; v++) {
      if (!(bestM & (1 << v))) continue;
      g[best] = v;
      if (rec()) return true;
    }
    g[best] = 0;
    return false;
  };
  return rec() ? g : null;
}

export interface SudokuStep {
  cell: number;
  value: number;
  /** how it was found: the time a person needs grows with it */
  kind: 'naked' | 'hidden' | 'hard';
}

/** The next cell a bot fills in its own grid, or null when the grid is full. */
export function sudokuNextStep(grid: readonly number[], rand: () => number = Math.random): SudokuStep | null {
  const empty = grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return null;
  const opts = new Map(empty.map((i) => [i, options(grid, i)]));
  // naked singles, in a random order (a person scans the grid, not cell by cell)
  const naked = empty.filter((i) => bits(opts.get(i)!) === 1);
  if (naked.length) {
    const i = naked[Math.floor(rand() * naked.length)];
    return { cell: i, value: only(opts.get(i)!), kind: 'naked' };
  }
  // hidden singles
  const hidden: SudokuStep[] = [];
  for (const u of UNITS) {
    for (let v = 1; v <= 9; v++) {
      const spots = u.filter((i) => !grid[i] && opts.get(i)! & (1 << v));
      if (spots.length === 1) hidden.push({ cell: spots[0], value: v, kind: 'hidden' });
    }
  }
  if (hidden.length) return hidden[Math.floor(rand() * hidden.length)];
  // nothing simple: the most constrained cell, worked out by solving the grid
  const solved = solveSudoku(grid);
  const cell = empty.reduce((a, b) => (bits(opts.get(b)!) < bits(opts.get(a)!) ? b : a));
  return { cell, value: solved ? solved[cell] : only(opts.get(cell)!) || 1, kind: 'hard' };
}
