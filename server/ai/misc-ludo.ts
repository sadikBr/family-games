/**
 * لودو bots. Only the public board is used (every token is visible to everyone).
 *
 * easy   — the old greedy policy: capture > finish > bring out > advance, plus noise.
 * smart  — the expert evaluation with some noise.
 * expert — every distinct move is played out, then the next opponent's six possible rolls (each answered
 *          with its own best move), and the resulting boards are scored:
 *   · each token is worth its progress, plus a bonus for being out of the base and for being safe
 *     (home column / safe squares / finished);
 *   · minus the chance it is hit before our next turn (every opponent token 1–6 squares behind it,
 *     7–12 behind with a 6 first, and fresh tokens leaving their base) times what it would lose;
 *   · plus the chance our tokens catch an opponent ahead of them on our next roll;
 *   · minus the opponents' own token values (so captures, and blocking their progress, count);
 *   · plus the value of the extra roll a capture or a finish gives.
 */
import { FINISH, LAST_TRACK, SAFE, START, trackIndex } from '../../src/shared/ludo';
import type { BotLevel, LudoColor } from '../../src/shared/protocol';

export interface LudoSeat {
  id: string;
  color: LudoColor;
}

export interface LudoBoard {
  seats: LudoSeat[];
  tokens: Record<string, number[]>;
  /** players already finished (ignored as threats / targets) */
  ranking?: string[];
}

function movable(tokens: number[], dice: number, exitOnOne: boolean): number[] {
  const out: number[] = [];
  tokens.forEach((p, i) => {
    if (p >= FINISH) return;
    if (p < 0) {
      if (dice === 6 || (exitOnOne && dice === 1)) out.push(i);
      return;
    }
    if (p + dice <= FINISH) out.push(i);
  });
  return out;
}

/** The old bot (kept as «سهل»). */
export function ludoEasyMove(b: LudoBoard, me: string, dice: number, exitOnOne: boolean, rand: () => number = Math.random): number {
  const color = b.seats.find((x) => x.id === me)!.color;
  const can = movable(b.tokens[me], dice, exitOnOne);
  const score = (t: number) => {
    const from = b.tokens[me][t];
    const to = from < 0 ? 0 : from + dice;
    const at = trackIndex(color, to);
    let v = to / 10;
    if (to === FINISH) v += 40;
    if (from < 0) v += 25;
    if (at !== null && !SAFE.includes(at)) {
      for (const seat of b.seats) if (seat.id !== me && b.tokens[seat.id].some((p) => trackIndex(seat.color, p) === at)) v += 50;
    }
    if (at !== null && SAFE.includes(at)) v += 6;
    return v + rand();
  };
  return can.map((t) => ({ t, v: score(t) })).sort((x, y) => y.v - x.v)[0].t;
}

/* ---------------- expert ---------------- */

/** Weights in squares (tuned in bot-vs-bot series). */
export const LUDO_W = {
  out: 20, // a token on the board instead of waiting for a 6
  home: 8, // in the home column: can never be hit again
  done: 14, // finished
  extra: 7, // another roll is worth about a move and a bit
  threat: 1, // our chances to hit someone next turn
  risk: 0.7, // the chance of being hit times what we would lose
  opp: 1, // with two players, everything they gain is our loss
  oppMany: 0.6,
};

/** What a token at `p` is worth to its owner (in squares). */
function tokenValue(p: number): number {
  if (p < 0) return 0;
  if (p >= FINISH) return FINISH + LUDO_W.out + LUDO_W.home + LUDO_W.done;
  return p + LUDO_W.out + (p > LAST_TRACK ? LUDO_W.home : 0);
}

/** Probability of a die (with the 6-and-roll-again rule) covering `d` squares in one turn. */
function reachProb(d: number): number {
  if (d >= 1 && d <= 5) return 1 / 6;
  if (d === 6) return 1 / 6; // a 6 lands too (and then rolls on)
  if (d >= 7 && d <= 11) return 1 / 36;
  if (d === 12) return 1 / 36;
  return 0;
}

interface Hunter {
  /** absolute track square */
  at: number;
  /** owner's progress (how far it may still travel on the shared track) */
  p: number;
}

/** The chance that some token of `hunters` hits the square `at` on its owner's next turn. */
function hitChance(at: number, hunters: Hunter[], baseCount: number, start: number): number {
  let miss = 1;
  const dists = new Set<number>();
  for (const h of hunters) {
    const d = (at - h.at + 52) % 52;
    if (d === 0 || d > 12) continue;
    if (h.p + d > LAST_TRACK) continue; // it turns into its home column before reaching us
    dists.add(d);
  }
  // one die roll: different distances are exclusive outcomes, so add them up
  let p = 0;
  for (const d of dists) p += reachProb(d);
  miss *= 1 - Math.min(0.95, p);
  // a token leaving the base with a 6 lands on its (safe) start square and rolls again
  if (baseCount > 0) {
    const d = (at - start + 52) % 52;
    if (d >= 1 && d <= 6) miss *= 1 - 1 / 36;
  }
  return 1 - miss;
}

/** The board from `me`'s point of view after a move (higher is better). */
export function ludoEval(b: LudoBoard, me: string): number {
  const done = new Set(b.ranking ?? []);
  const opps = b.seats.filter((x) => x.id !== me && !done.has(x.id));
  const mine = b.seats.find((x) => x.id === me)!;
  const huntersOf = (seat: LudoSeat): Hunter[] =>
    b.tokens[seat.id].flatMap((p) => {
      const at = trackIndex(seat.color, p);
      return at === null ? [] : [{ at, p }];
    });
  const oppHunters = opps.map((o) => ({ seat: o, hunters: huntersOf(o), base: b.tokens[o.id].filter((p) => p < 0).length }));

  let v = 0;
  for (const p of b.tokens[me]) {
    let val = tokenValue(p);
    const at = trackIndex(mine.color, p);
    if (at !== null && !SAFE.includes(at)) {
      // survive every opponent's turn before ours
      let survive = 1;
      for (const o of oppHunters) survive *= 1 - hitChance(at, o.hunters, o.base, START[o.seat.color]);
      val -= LUDO_W.risk * (1 - survive) * tokenValue(p);
    }
    v += val;
  }
  // my threats on our next roll (discounted: they move first)
  const myHunters = huntersOf(mine);
  const myBase = b.tokens[me].filter((p) => p < 0).length;
  for (const o of opps) {
    let theirs = 0;
    for (const p of b.tokens[o.id]) {
      theirs += tokenValue(p);
      const at = trackIndex(o.color, p);
      if (at === null || SAFE.includes(at)) continue;
      v += LUDO_W.threat * hitChance(at, myHunters, myBase, START[mine.color]) * tokenValue(p);
    }
    v -= theirs * (opps.length === 1 ? LUDO_W.opp : LUDO_W.oppMany);
  }
  return v;
}

/** Play token `t` on a copy of the board. Returns the board and whether the move earns another roll. */
function apply(b: LudoBoard, me: string, t: number, dice: number): { board: LudoBoard; again: boolean } {
  const tokens: Record<string, number[]> = {};
  for (const k of Object.keys(b.tokens)) tokens[k] = b.tokens[k].slice();
  const color = b.seats.find((x) => x.id === me)!.color;
  const from = tokens[me][t];
  const to = from < 0 ? 0 : from + dice;
  tokens[me][t] = to;
  let captured = false;
  const at = trackIndex(color, to);
  if (at !== null && !SAFE.includes(at)) {
    for (const seat of b.seats) {
      if (seat.id === me) continue;
      tokens[seat.id] = tokens[seat.id].map((p) => {
        if (trackIndex(seat.color, p) === at) {
          captured = true;
          return -1;
        }
        return p;
      });
    }
  }
  const allDone = tokens[me].every((p) => p >= FINISH);
  return { board: { ...b, tokens }, again: !allDone && (captured || to === FINISH) };
}

/** The best 1-ply move for `who` (by its own evaluation), or null when nothing can move. */
function greedy(b: LudoBoard, who: string, dice: number, exitOnOne: boolean): LudoBoard | null {
  const can = movable(b.tokens[who], dice, exitOnOne);
  let best: LudoBoard | null = null, bestV = -Infinity;
  const seen = new Set<number>();
  for (const t of can) {
    if (seen.has(b.tokens[who][t])) continue;
    seen.add(b.tokens[who][t]);
    const { board, again } = apply(b, who, t, dice);
    const v = ludoEval(board, who) + (again ? LUDO_W.extra : 0);
    if (v > bestV) (bestV = v), (best = board);
  }
  return best;
}

/** After our move: the next opponent rolls each number and answers with its best move; our average evaluation. */
function lookahead(b: LudoBoard, me: string, exitOnOne: boolean): number {
  const done = new Set(b.ranking ?? []);
  const i = b.seats.findIndex((x) => x.id === me);
  let next: string | null = null;
  for (let k = 1; k < b.seats.length; k++) {
    const id = b.seats[(i + k) % b.seats.length].id;
    if (!done.has(id)) {
      next = id;
      break;
    }
  }
  if (!next) return ludoEval(b, me);
  let sum = 0;
  for (let d = 1; d <= 6; d++) sum += ludoEval(greedy(b, next, d, exitOnOne) ?? b, me);
  return sum / 6;
}

/** The bot's token for this roll. */
export function ludoBotMove(b: LudoBoard, me: string, dice: number, exitOnOne: boolean, level: BotLevel, rand: () => number = Math.random): number {
  const can = movable(b.tokens[me], dice, exitOnOne);
  if (can.length <= 1) return can[0];
  if (level === 'easy') return ludoEasyMove(b, me, dice, exitOnOne, rand);
  const seen = new Set<number>();
  let best = can[0], bestV = -Infinity;
  for (const t of can) {
    if (seen.has(b.tokens[me][t])) continue; // stacked tokens make the same move
    seen.add(b.tokens[me][t]);
    const { board, again } = apply(b, me, t, dice);
    let v = (level === 'expert' ? lookahead(board, me, exitOnOne) : ludoEval(board, me)) + (again ? LUDO_W.extra : 0);
    if (board.tokens[me].every((p) => p >= FINISH)) v += 1000;
    if (level === 'smart') v += (rand() - 0.5) * 6;
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  return best;
}
