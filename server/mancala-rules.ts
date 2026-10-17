/**
 * «المنقلة» — Kalah rules and the bots.
 * Side 0: pits 0..5, store 6. Side 1: pits 7..12, store 13. Sowing goes up the indices and skips the
 * opponent's store. Last seed in your store: play again. Last seed in an empty pit of yours with
 * seeds opposite: both go to your store. A side with no seeds ends the game; each player then banks
 * what is left on their own side.
 */
import { mancalaOpposite, mancalaStore, type MancalaLevel } from '../src/shared/games/mancala';

export interface Sown {
  board: number[];
  path: number[];
  extra: boolean;
  capture: { pit: number; opposite: number; seeds: number } | null;
  over: boolean;
}

export const pitsOf = (side: 0 | 1) => [0, 1, 2, 3, 4, 5].map((j) => side * 7 + j);

export function legalPits(board: number[], side: 0 | 1) {
  return pitsOf(side).filter((p) => board[p] > 0);
}

export const sideEmpty = (board: number[], side: 0 | 1) => pitsOf(side).every((p) => board[p] === 0);

/** Move the seeds left in the pits into each owner's store (end of the game). */
export function sweep(board: number[]) {
  for (const side of [0, 1] as const) {
    for (const p of pitsOf(side)) {
      board[mancalaStore(side)] += board[p];
      board[p] = 0;
    }
  }
}

/** Play `pit` for `side` on a copy of the board. The pit must be the mover's and not empty. */
export function sow(start: number[], side: 0 | 1, pit: number, trackPath = true): Sown {
  const board = start.slice();
  const skip = mancalaStore(side === 0 ? 1 : 0);
  let seeds = board[pit];
  board[pit] = 0;
  let i = pit;
  const path: number[] = [];
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === skip) continue;
    board[i] += 1;
    seeds -= 1;
    if (trackPath) path.push(i);
  }
  const store = mancalaStore(side);
  const extra = i === store;
  let capture: Sown['capture'] = null;
  const mine = side === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12;
  if (mine && board[i] === 1 && board[mancalaOpposite(i)] > 0) {
    const opposite = mancalaOpposite(i);
    capture = { pit: i, opposite, seeds: board[opposite] + 1 };
    board[store] += capture.seeds;
    board[i] = 0;
    board[opposite] = 0;
  }
  const over = sideEmpty(board, 0) || sideEmpty(board, 1);
  if (over) sweep(board);
  return { board, path, extra: extra && !over, capture, over };
}

// ---------- bots ----------

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Store difference from `me`'s point of view; a finished game counts the result first. */
function evaluate(board: number[], me: 0 | 1, over: boolean) {
  const diff = board[mancalaStore(me)] - board[mancalaStore(me === 0 ? 1 : 0)];
  if (over) return (diff > 0 ? 1000 : diff < 0 ? -1000 : 0) + diff;
  return diff;
}

class OutOfTime extends Error {}

function search(board: number[], toMove: 0 | 1, me: 0 | 1, depth: number, alpha: number, beta: number, deadline: number, stats: { nodes: number }): number {
  if (++stats.nodes % 512 === 0 && performance.now() > deadline) throw new OutOfTime();
  if (depth === 0) return evaluate(board, me, false);
  const moves = legalPits(board, toMove);
  const maxing = toMove === me;
  let best = maxing ? -Infinity : Infinity;
  // try the moves that earn another turn first: better pruning
  const store = mancalaStore(toMove);
  moves.sort((a, b) => Number((b + board[b]) % 13 === store % 13) - Number((a + board[a]) % 13 === store % 13));
  for (const p of moves) {
    const r = sow(board, toMove, p, false);
    const v = r.over ? evaluate(r.board, me, true) : search(r.board, r.extra ? toMove : toMove === 0 ? 1 : 0, me, depth - 1, alpha, beta, deadline, stats);
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/** Best pit by iterative-deepening alpha-beta, stopping at `maxDepth` or when time runs out. */
export function searchPit(board: number[], side: 0 | 1, maxDepth: number, timeMs: number) {
  const moves = legalPits(board, side);
  if (moves.length === 1) return moves[0];
  const deadline = performance.now() + timeMs;
  let best = moves[0];
  const stats = { nodes: 0 };
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let bestHere = -Infinity;
      let picks: number[] = [];
      for (const p of moves) {
        const r = sow(board, side, p, false);
        const v = r.over ? evaluate(r.board, side, true) : search(r.board, r.extra ? side : side === 0 ? 1 : 0, side, depth - 1, -Infinity, Infinity, deadline, stats);
        if (v > bestHere) {
          bestHere = v;
          picks = [p];
        } else if (v === bestHere) picks.push(p);
      }
      best = pick(picks);
    } catch (e) {
      if (e instanceof OutOfTime) break;
      throw e;
    }
  }
  return best;
}

/** The pit a bot plays. `side` must have a legal move. */
export function mancalaBotPit(board: number[], side: 0 | 1, level: MancalaLevel): number {
  const moves = legalPits(board, side);
  if (level === 'easy') {
    if (Math.random() < 0.45) return pick(moves);
    // greedy: what this move banks now (another turn is worth a bit more)
    const gain = (p: number) => {
      const r = sow(board, side, p, false);
      return r.board[mancalaStore(side)] - board[mancalaStore(side)] + (r.extra ? 1.5 : 0);
    };
    const top = Math.max(...moves.map(gain));
    return pick(moves.filter((p) => gain(p) === top));
  }
  if (level === 'medium') return searchPit(board, side, 3, 50);
  return searchPit(board, side, 9, 150);
}
