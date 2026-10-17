/**
 * «القطع الملونة» — bot moves.
 * easy: a random legal placement, bigger pieces more likely.
 * hard: scores every legal placement — big pieces early, new corners for itself, opponents' corners
 * covered, heading for the middle early on — within a time budget.
 */
import { PIECE_COUNT, anchors, legalMoves, type Move, type SeatCtx } from '../src/shared/blocks-rules';
import type { BlocksLevel } from '../src/shared/games/blocks';

export interface BotInput {
  board: readonly number[];
  n: number;
  seat: number;
  starts: readonly number[];
  left: readonly (readonly number[])[];
  /** seats still placing pieces (not stuck, not gone) */
  live: readonly number[];
  level: BlocksLevel;
  /** time budget for the hard bot, ms */
  budget?: number;
}

const seatCtx = (b: BotInput, seat: number): SeatCtx => ({
  board: b.board,
  n: b.n,
  seat,
  start: b.starts[seat],
  first: b.left[seat].length === PIECE_COUNT,
});

function weightedPick(moves: Move[]): Move {
  const w = moves.map((m) => m.cells.length ** 3);
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < moves.length; i++) {
    x -= w[i];
    if (x <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

export function blocksBotMove(b: BotInput): Move | null {
  const t0 = Date.now();
  const me = seatCtx(b, b.seat);
  const moves = legalMoves(me, b.left[b.seat]);
  if (!moves.length) return null;
  if (b.level === 'easy') return weightedPick(moves);

  const { n, board, seat } = b;
  const budget = b.budget ?? 250;
  const placed = PIECE_COUNT - b.left[seat].length;
  const early = Math.max(0, 1 - placed / 8); // 1 at the start, 0 after eight pieces
  const mid = (n - 1) / 2;
  const myAnchors = new Set(anchors(me));
  // each live opponent's corner spots: covering them shuts them out there
  const theirs = new Map<number, number>();
  for (const s of b.live) {
    if (s === seat) continue;
    for (const a of anchors(seatCtx(b, s))) theirs.set(a, (theirs.get(a) ?? 0) + 1);
  }

  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (let i = 0; i < moves.length; i++) {
    if ((i & 63) === 63 && Date.now() - t0 > budget) break;
    const m = moves[i];
    const mine = new Set(m.cells);
    const touchesMine = (r: number, c: number) => {
      const at = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < n && cc < n && (board[rr * n + cc] === seat || mine.has(rr * n + cc));
      return at(r - 1, c) || at(r + 1, c) || at(r, c - 1) || at(r, c + 1);
    };
    // new corners this piece opens for me, and my old ones it spoils
    const fresh = new Set<number>();
    let dist = 0;
    for (const i2 of m.cells) {
      const r = Math.floor(i2 / n), c = i2 % n;
      dist += Math.max(Math.abs(r - mid), Math.abs(c - mid));
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const j = rr * n + cc;
        if (board[j] !== -1 || mine.has(j) || myAnchors.has(j) || touchesMine(rr, cc)) continue;
        fresh.add(j);
      }
    }
    let spoilt = 0;
    for (const a of myAnchors) {
      if (mine.has(a)) spoilt += 1;
      else if (touchesMine(Math.floor(a / n), a % n)) spoilt += 1;
    }
    let blocked = 0;
    for (const j of m.cells) blocked += theirs.get(j) ?? 0;
    const size = m.cells.length;
    const score =
      size * (8 + 6 * early) + // big pieces first
      fresh.size * 2.5 - // room to grow
      spoilt * 0.8 +
      blocked * 3 - // get in the others' way
      (dist / size) * (1.5 * early + 0.2) + // head for the middle early on
      Math.random() * 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
