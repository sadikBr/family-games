/**
 * «الدومينو» — the bots' choice of a tile, from what a player at the table may know: their own hand, the
 * line on the table, how many tiles each hand holds, and the numbers a player is known to lack (they
 * passed, or had to draw, while those numbers were open — see settle() in games/domino.ts). Never another
 * hand or the boneyard's order.
 *
 * - easy: a random legal tile.
 * - smart: the heaviest playable tile, doubles first when it's close (a double fits only one number).
 * - expert: counts the pips of each number already seen (on the table + in hand), keeps a varied hand that
 *   can follow up, sheds weight, locks numbers nobody else can hold, leaves ends the next opponent lacks,
 *   and in team mode keeps ends the partner can play.
 */
import { endsOf, fits, isDouble, legalEnds, orient, pipsOf, tileSum, type DominoEnd, type DominoPlaced, type DominoTileId } from '../src/shared/games/domino';
import type { BotLevel } from '../src/shared/protocol';

export type Rnd = () => number;

export interface DominoBotInfo {
  me: string;
  hand: DominoTileId[];
  line: DominoPlaced[];
  /** the only tile allowed (a round's opening), or null */
  opening: DominoTileId | null;
  seats: string[];
  partner: string | null;
  counts: Record<string, number>;
  /** numbers each player is known to lack */
  lacks: Record<string, number[]>;
}

export interface DominoChoice {
  tile: DominoTileId;
  end: DominoEnd;
}

/** Every legal move (a tile that fits two equal ends is listed once). */
export function legalMoves(hand: readonly DominoTileId[], line: readonly DominoPlaced[], opening: DominoTileId | null): DominoChoice[] {
  const ends = endsOf(line);
  const out: DominoChoice[] = [];
  for (const tile of hand) {
    if (opening && tile !== opening) continue;
    const at = legalEnds(tile, ends);
    if (ends && at.length === 2 && ends[0] === ends[1]) {
      out.push({ tile, end: 'R' });
      continue;
    }
    for (const end of at) out.push({ tile, end });
  }
  return out;
}

/** The ends once `m` is played. */
function endsAfter(m: DominoChoice, line: readonly DominoPlaced[]): [number, number] {
  const ends = endsOf(line);
  const [l, r] = orient(m.tile, m.end, ends);
  if (!ends) return [l, r];
  return m.end === 'L' ? [l, ends[1]] : [ends[0], r];
}

/** How many of a number's 7 tiles are still unseen by this player (not on the table, not in hand). */
function unseen(n: number, line: readonly DominoPlaced[], hand: readonly DominoTileId[]): number {
  let seen = 0;
  for (const p of line) if (p.l === n || p.r === n) seen++;
  for (const t of hand) if (fits(t, n)) seen++;
  return 7 - seen;
}

function smartScore(m: DominoChoice): number {
  return tileSum(m.tile) + (isDouble(m.tile) ? 2.5 : 0);
}

function expertScore(info: DominoBotInfo, m: DominoChoice): number {
  const after = info.hand.filter((t) => t !== m.tile);
  if (!after.length) return 1000; // domino
  const [l, r] = pipsOf(m.tile);
  const placed: DominoPlaced[] = [...info.line, { id: m.tile, l, r, by: info.me, seq: 0 }];
  const [a, b] = endsAfter(m, info.line);
  let s = tileSum(m.tile) * 0.9;
  if (isDouble(m.tile)) s += 3;

  // a hand that can follow up, with variety
  const follow = after.filter((t) => fits(t, a) || fits(t, b)).length;
  s += 1.6 * Math.min(follow, 3);
  if (follow === 0) s -= 3;
  const nums = new Set<number>();
  for (const t of after) for (const n of pipsOf(t)) nums.add(n);
  s += 0.5 * nums.size;

  const i = info.seats.indexOf(info.me);
  const nextOpp = info.seats[(i + 1) % info.seats.length];
  const oppLacks = new Set(info.lacks[nextOpp] ?? []);
  const partnerLacks = new Set(info.partner ? (info.lacks[info.partner] ?? []) : []);
  // the fewer tiles the next player holds, the more blocking them matters
  const urgency = 1 + 3 / Math.max(1, info.counts[nextOpp] ?? 7);
  for (const e of a === b ? [a] : [a, b]) {
    if (oppLacks.has(e)) s += 2.2 * urgency;
    if (info.partner && partnerLacks.has(e)) s -= 1.6;
    const mine = after.some((t) => fits(t, e));
    const left = unseen(e, placed, after);
    // nobody else can hold this number: an end only I can answer
    if (left === 0) s += mine ? 2.5 : -0.5;
    else if (mine) s += 0.6 / left;
  }
  // in team mode, help the partner when they're nearly out: keep their numbers open
  if (info.partner && (info.counts[info.partner] ?? 7) <= 2) {
    for (const e of [a, b]) if (!partnerLacks.has(e)) s += 0.8;
  }
  return s;
}

/** The bot's move (null: nothing legal). */
export function chooseDominoMove(level: BotLevel, info: DominoBotInfo, rnd: Rnd = Math.random): DominoChoice | null {
  const moves = legalMoves(info.hand, info.line, info.opening);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  if (level === 'easy') return moves[Math.floor(rnd() * moves.length)];
  const score = level === 'smart' ? smartScore : (m: DominoChoice) => expertScore(info, m);
  let best = moves[0];
  let bestS = -Infinity;
  for (const m of moves) {
    // a hair of noise so equal choices vary
    const v = score(m) + rnd() * 0.01;
    if (v > bestS) {
      bestS = v;
      best = m;
    }
  }
  return best;
}

/** A bot's thinking time by strength: [fastest, slowest] in ms. */
export const DOMINO_BOT_MS: Record<BotLevel, [number, number]> = { easy: [1500, 3200], smart: [1200, 2700], expert: [1100, 2500] };
