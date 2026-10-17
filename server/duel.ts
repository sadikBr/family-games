/**
 * Fair rematches for the 1-vs-1 games: whoever started the last game in this room plays second
 * in the next one, and a series score is kept per room (and per game) while the same two play.
 */
import type { GameCtx } from './types';
import { shuffle } from './util';

export interface Duel {
  /** Moves first (white, red, X, the attacker, the first shooter…). */
  first: string;
  second: string;
  /** Games won in this series — shared with ctx.memo, so wins recorded here persist between games. */
  score: Record<string, number>;
}

interface Memo {
  pair: string;
  lastFirst: string;
  score: Record<string, number>;
}

/** Pick the seats for a new game: alternates who starts between games of `game` in the same room. */
export function startDuel(ctx: GameCtx, game: string, participants: string[]): Duel {
  const two = participants.slice(0, 2);
  const pair = two.slice().sort().join('|');
  const key = `duel:${game}`;
  const memo = ctx.memo.get(key) as Memo | undefined;
  const prev = memo && memo.pair === pair ? memo : null; // a new pair starts a new series
  let [first, second] = shuffle(two);
  if (prev) [first, second] = prev.lastFirst === two[0] ? [two[1], two[0]] : [two[0], two[1]];
  const score = prev ? prev.score : Object.fromEntries(two.map((p) => [p, 0]));
  ctx.memo.set(key, { pair, lastFirst: first, score } satisfies Memo);
  return { first, second, score };
}

/** Count a win in the series and play the win sound for the winner (a lose sound for the other phone). */
export function duelWin(ctx: GameCtx, score: Record<string, number>, winner: string) {
  score[winner] = (score[winner] ?? 0) + 1;
  ctx.fx('win', winner);
}
