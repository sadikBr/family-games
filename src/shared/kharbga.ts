/**
 * «الخربقة» — the traditional Moroccan board game. 7×7 board, 24 pieces each, centre (الملحة) left empty.
 * Setting: players place two pieces per turn until only the centre is empty (the attacker starts).
 * Moving: one square up/down/left/right into an empty square; the attacker's first move must enter the centre.
 * An enemy piece sandwiched between the moved piece and another of yours (in a line) is captured;
 * after a capture the same piece keeps moving while it can capture again. Moving between two enemies is safe.
 */
export const N = 7;
export const CENTER = 24;
export const PIECES = 24;
export type Side = 1 | 2; // 1 = attacker (المهاجم), 2 = defender (المدافع)

const DIRS = [-N, N, -1, 1];
const step = (i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= N * N) return -1;
  if ((d === -1 || d === 1) && Math.floor(j / N) !== Math.floor(i / N)) return -1;
  return j;
};
export const other = (s: Side): Side => (s === 1 ? 2 : 1);

/** Pieces captured if `side` has just moved a piece onto `to`. */
export function capturesAt(b: number[], to: number, side: Side): number[] {
  const out: number[] = [];
  for (const d of DIRS) {
    const n1 = step(to, d);
    if (n1 < 0 || b[n1] !== other(side)) continue;
    const n2 = step(n1, d);
    if (n2 >= 0 && b[n2] === side) out.push(n1);
  }
  return out;
}

export interface KMove {
  from: number;
  to: number;
}

/** Legal moves. During a capture chain only `chainFrom` may move, and only to capture again. */
export function movesFor(b: number[], side: Side, chainFrom: number | null = null, firstMove = false): KMove[] {
  const out: KMove[] = [];
  for (let i = 0; i < N * N; i++) {
    if (b[i] !== side || (chainFrom !== null && i !== chainFrom)) continue;
    for (const d of DIRS) {
      const to = step(i, d);
      if (to < 0 || b[to] !== 0) continue;
      if (firstMove && to !== CENTER) continue;
      if (chainFrom !== null) {
        const nb = b.slice();
        nb[i] = 0;
        nb[to] = side;
        if (!capturesAt(nb, to, side).length) continue;
      }
      out.push({ from: i, to });
    }
  }
  return out;
}

export function applyMove(b: number[], m: KMove, side: Side): { board: number[]; captured: number[] } {
  const nb = b.slice();
  nb[m.from] = 0;
  nb[m.to] = side;
  const captured = capturesAt(nb, m.to, side);
  for (const c of captured) nb[c] = 0;
  return { board: nb, captured };
}

/** Bot move: most captures now, minus the best capture the other side could answer with. */
export function botMove(b: number[], side: Side, chainFrom: number | null, firstMove: boolean, level: 1 | 2): KMove | null {
  const moves = movesFor(b, side, chainFrom, firstMove);
  if (!moves.length) return null;
  const scored = moves.map((m) => {
    const { board, captured } = applyMove(b, m, side);
    let threat = 0;
    if (level === 2) for (const r of movesFor(board, other(side))) threat = Math.max(threat, applyMove(board, r, other(side)).captured.length);
    return { m, v: captured.length * 10 - threat * 8 + Math.random() * (level === 1 ? 12 : 2) };
  });
  scored.sort((x, y) => y.v - x.v);
  return scored[0].m;
}

/** Bot placement: random free square, slightly preferring squares next to its own pieces. */
export function botPlace(b: number[], side: Side): number {
  const free = b.map((v, i) => (v === 0 && i !== CENTER ? i : -1)).filter((i) => i >= 0);
  const near = free.filter((i) => DIRS.some((d) => step(i, d) >= 0 && b[step(i, d)] === side));
  const pool = near.length && Math.random() < 0.6 ? near : free;
  return pool[Math.floor(Math.random() * pool.length)];
}
