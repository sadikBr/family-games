/**
 * «سلسلة الذاكرة» — how bots remember. Each bot gets, once per game, a memory span drawn from its level's
 * range (easy 5–8, smart 9–13, expert 14–20). The chance of repeating a whole chain of length L falls off
 * around that span (a soft logistic curve, so a bot sometimes slips a little earlier or holds on a little
 * longer), and it is spread over the chain's steps: each step has a small error chance that grows with L.
 * Taps come at a human rhythm: a short pause before the first one, then 300–700 ms between taps.
 */
import type { BotLevel } from '../src/shared/protocol';

export type Rnd = () => number;

/** The memory span's range for each level. */
export const SILSILA_BOT_SPAN: Record<BotLevel, [number, number]> = { easy: [5, 8], smart: [9, 13], expert: [14, 20] };

/** A bot's memory span for one game. */
export function botSpan(level: BotLevel, rnd: Rnd): number {
  const [lo, hi] = SILSILA_BOT_SPAN[level];
  return lo + rnd() * (hi - lo);
}

/** The chance a bot with this span repeats a whole chain of length `len`. */
export function chainOk(len: number, span: number): number {
  return 1 / (1 + Math.exp((len - span - 0.5) / 0.85));
}

/** The chance of a slip on one step of a chain of length `len` (grows with the length). */
export function stepError(len: number, span: number): number {
  return 1 - Math.pow(chainOk(len, span), 1 / Math.max(1, len));
}

/** The pad a bot taps for step `i`: the right one, or (a slip) another one. */
export function botPad(seq: readonly number[], i: number, pads: number, span: number, rnd: Rnd): number {
  const want = seq[i];
  if (rnd() >= stepError(seq.length, span)) return want;
  const other = Math.floor(rnd() * (pads - 1));
  return other >= want ? other + 1 : other;
}

/** The wait before a bot's tap: a short look before the first one, then a human rhythm. */
export function botTapDelay(i: number, rnd: Rnd): number {
  return i === 0 ? 450 + Math.round(rnd() * 650) : 300 + Math.round(rnd() * 400);
}
