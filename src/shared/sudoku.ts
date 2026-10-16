/** «سودوكو» — 9×9 puzzles with a unique solution. Cells are 0 (empty) or 1..9. */
export type SudokuLevel = 'easy' | 'medium' | 'hard';
export const GIVENS: Record<SudokuLevel, number> = { easy: 40, medium: 32, hard: 27 };

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Cells that share a row, column or box with `i`. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter((j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))),
);

function candidates(g: number[], i: number): number[] {
  const used = new Set(PEERS[i].map((j) => g[j]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !used.has(v));
}

/** Count solutions up to `limit` (backtracking, fewest candidates first). */
export function countSolutions(grid: number[], limit = 2): number {
  const g = grid.slice();
  let count = 0;
  const solve = (): boolean => {
    let best = -1, bestC: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const c = candidates(g, i);
      if (!c.length) return false;
      if (best < 0 || c.length < bestC.length) {
        best = i;
        bestC = c;
        if (c.length === 1) break;
      }
    }
    if (best < 0) {
      count++;
      return count >= limit;
    }
    for (const v of bestC) {
      g[best] = v;
      if (solve()) return true;
    }
    g[best] = 0;
    return false;
  };
  solve();
  return count;
}

function shuffled<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function fullGrid(): number[] {
  const g = Array(81).fill(0);
  const fill = (i: number): boolean => {
    if (i === 81) return true;
    for (const v of shuffled(candidates(g, i))) {
      g[i] = v;
      if (fill(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  fill(0);
  return g;
}

export function generateSudoku(level: SudokuLevel): { puzzle: number[]; solution: number[] } {
  const solution = fullGrid();
  const puzzle = solution.slice();
  let filled = 81;
  for (const i of shuffled(Array.from({ length: 81 }, (_, k) => k))) {
    if (filled <= GIVENS[level]) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep;
    else filled--;
  }
  return { puzzle, solution };
}

/** Cells whose value repeats in their row, column or box (for highlighting). */
export function conflicts(g: number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) if (g[i] && PEERS[i].some((j) => g[j] === g[i])) out.add(i);
  return out;
}
