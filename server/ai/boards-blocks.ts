/**
 * «القطع الملونة» — the expert bot. Two passes within a time budget:
 * 1. every legal placement gets a quick score: big (and awkward) pieces early, new corners it opens for
 *    us, our corners it spoils, the opponents' corners it covers, heading for the open middle early;
 * 2. the best few are looked at properly: after the move, how much usable room is around each of our
 *    corners versus each opponent's (their corners we sit on or fence off count for us), so the bot
 *    grows into open space and cuts the others off instead of just dropping big pieces.
 */
import { PIECE_COUNT, anchors, legalMoves, type Move, type SeatCtx } from '../../src/shared/blocks-rules';
import type { BotInput } from '../blocks-bot';
import { BUDGET } from './boards-search';

/** Awkward shapes are worth getting rid of first (X, W, F, the long ones…), beyond their size. */
const AWKWARD = [0, 0, 0, 0, 0.5, 0.3, 0.4, 0.5, 0.2, 1.4, 1.0, 0.9, 1.0, 0.4, 1.0, 1.0, 1.0, 1.3, 1.6, 0.9, 1.2];

const ctxOf = (b: BotInput, board: readonly number[], seat: number): SeatCtx => ({
  board,
  n: b.n,
  seat,
  start: b.starts[seat],
  first: b.left[seat].length === PIECE_COUNT,
});

/** Usable room around each corner: empty cells within two steps that `seat` could still cover. */
function room(board: readonly number[], n: number, seat: number, corners: number[]): number {
  const own = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && board[r * n + c] === seat;
  let total = 0;
  for (const a of corners) {
    const ar = Math.floor(a / n), ac = a % n;
    let k = 0;
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const r = ar + dr, c = ac + dc;
        if (r < 0 || c < 0 || r >= n || c >= n || board[r * n + c] !== -1) continue;
        if (own(r - 1, c) || own(r + 1, c) || own(r, c - 1) || own(r, c + 1)) continue;
        k++;
      }
    total += 2 + Math.min(k, 14);
  }
  return total;
}

export function blocksExpert(b: BotInput, timeMs: number = BUDGET.expert): Move | null {
  const t0 = performance.now();
  const { n, board, seat } = b;
  const me = ctxOf(b, board, seat);
  const moves = legalMoves(me, b.left[seat]);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const placed = PIECE_COUNT - b.left[seat].length;
  const early = Math.max(0, 1 - placed / 9);
  const mid = (n - 1) / 2;
  const myAnchor = new Uint8Array(n * n);
  for (const a of anchors(me)) myAnchor[a] = 1;
  const theirs = new Uint8Array(n * n);
  const opponents = b.live.filter((s) => s !== seat);
  for (const s of opponents) for (const a of anchors(ctxOf(b, board, s))) theirs[a] += 1;

  // pass 1: quick scores
  const stamp = new Int32Array(n * n);
  const scores = new Float64Array(moves.length);
  const ownOrMove = (r: number, c: number, id: number) => r >= 0 && c >= 0 && r < n && c < n && (board[r * n + c] === seat || stamp[r * n + c] === id);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const id = i + 1;
    for (const x of m.cells) stamp[x] = id;
    let fresh = 0, dist = 0, blocked = 0;
    for (const x of m.cells) {
      const r = Math.floor(x / n), c = x % n;
      dist += Math.max(Math.abs(r - mid), Math.abs(c - mid));
      blocked += theirs[x];
      for (let dr = -1; dr <= 1; dr += 2)
        for (let dc = -1; dc <= 1; dc += 2) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          const j = rr * n + cc;
          if (board[j] !== -1 || stamp[j] === id || myAnchor[j]) continue;
          if (ownOrMove(rr - 1, cc, id) || ownOrMove(rr + 1, cc, id) || ownOrMove(rr, cc - 1, id) || ownOrMove(rr, cc + 1, id)) continue;
          fresh++;
        }
    }
    const size = m.cells.length;
    scores[i] = size * (8 + 6 * early) + AWKWARD[m.piece] * (4 + 6 * early) + fresh * 2.5 + blocked * 3 - (dist / size) * (1.5 * early + 0.2);
  }
  const order = Array.from(moves.keys()).sort((x, y) => scores[y] - scores[x]);
  // pass 2: the room left to us and to them after the best candidates
  const K = Math.min(order.length, 20);
  const work = board.slice();
  let best = order[0], bestV = -Infinity;
  for (let k = 0; k < K; k++) {
    if (k > 2 && performance.now() - t0 > timeMs) break;
    const i = order[k];
    const m = moves[i];
    for (const x of m.cells) work[x] = seat;
    const left = b.left.map((l, s) => (s === seat ? l.filter((p) => p !== m.piece) : l));
    const after = { ...b, left };
    const mine = room(work, n, seat, anchors(ctxOf(after, work, seat)));
    let them = 0;
    for (const s of opponents) them += room(work, n, s, anchors(ctxOf(after, work, s)));
    // shutting the others out counts double what our own room does (tuned in bot-vs-bot series)
    const v = scores[i] + mine * 0.6 - (them / Math.max(1, opponents.length)) * 1.2 * (opponents.length > 1 ? 0.8 : 1);
    for (const x of m.cells) work[x] = -1;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return moves[best];
}
