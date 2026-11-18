/**
 * «من سيربح المليون؟» — the bots: how often they know an answer (by the room's bot strength and the
 * question's level), what they do in the hot seat, how they vote in the audience and answer a friend's call.
 *
 * A bot never looks at anything a person couldn't see: in the seat it "knows" the answer with its chance
 * (rolled once per question) and otherwise works only from what is on the screen — the answers left after
 * 50:50, the audience's chart, the friend's answer. Lifelines like a sensible player: when unsure, the
 * audience early on, 50:50, the friend for the later questions; with no help left at a high rung, it
 * sometimes walks away rather than gamble a big drop.
 */
import type { BotLevel } from '../src/shared/protocol';
import { prizeAt, safePrize, type MillionCall, type MillionLifeline } from '../src/shared/games/million';
import { quizDelay, readChars, readMs } from './ai/social-quiz';
import { clamp, randInt } from './util';

export type Rnd = () => number;

/** Chance to know the answer of a question of level 1 … 5. */
const KNOW: Record<BotLevel, number[]> = {
  easy: [0.85, 0.65, 0.45, 0.3, 0.18],
  smart: [0.93, 0.8, 0.62, 0.45, 0.3],
  expert: [0.97, 0.9, 0.78, 0.6, 0.45],
};

export function knowChance(level: BotLevel, lv: number): number {
  return KNOW[level][clamp(Math.round(lv), 1, 5) - 1];
}

/** How readily a bot with no help left walks away from a big drop. */
const WALK: Record<BotLevel, number> = { easy: 0.3, smart: 0.6, expert: 0.85 };

export interface BotQuestion {
  text: string;
  options: string[];
  correct: number;
  lv: number;
}

/** What the bot privately "knows" about the question (rolled once). */
export interface Mind {
  key: string;
  knows: boolean;
  /** its hunch when it doesn't know */
  lean: number;
}

export function makeMind(level: BotLevel, key: string, q: BotQuestion, rnd: Rnd = Math.random): Mind {
  return { key, knows: rnd() < knowChance(level, q.lv), lean: Math.floor(rnd() * q.options.length) };
}

const alive = (removed: number[]) => [0, 1, 2, 3].filter((i) => !removed.includes(i));
const pickOf = <T>(list: T[], rnd: Rnd): T => list[Math.floor(rnd() * list.length)];

/** One answer from the audience or a friend: right with the bot's chance, else one of the answers left. */
export function botAnswer(level: BotLevel, q: BotQuestion, removed: number[], rnd: Rnd = Math.random, bonus = 0): { choice: number; knows: boolean } {
  if (rnd() < knowChance(level, q.lv) + bonus) return { choice: q.correct, knows: true };
  const wrong = alive(removed).filter((i) => i !== q.correct);
  // a guess can still land on the right answer
  const guesses = [...wrong, q.correct];
  return { choice: pickOf(guesses, rnd), knows: false };
}

export interface SeatSituation {
  level: BotLevel;
  step: number;
  won: number;
  q: BotQuestion;
  mind: Mind;
  removed: number[];
  used: Record<MillionLifeline, boolean>;
  canAudience: boolean;
  canFriend: boolean;
  poll: number[] | null;
  call: MillionCall | null;
}

export type SeatMove = { type: 'final'; choice: number } | { type: 'walk' } | { type: 'fifty' } | { type: 'audience' } | { type: 'friend' };

/** The bot's next move in the hot seat. */
export function seatMove(sit: SeatSituation, rnd: Rnd = Math.random): SeatMove {
  const { q, mind, removed } = sit;
  if (mind.knows) return { type: 'final', choice: q.correct };
  const left = alive(removed);
  // what the helpers said
  const friend = sit.call?.done && sit.call.answer !== null && left.includes(sit.call.answer) ? sit.call : null;
  if (friend?.sure) return { type: 'final', choice: friend.answer! };
  let top: number | null = null;
  let share = 0;
  if (sit.poll) {
    const total = sit.poll.reduce((a, b) => a + b, 0);
    if (total > 0) {
      top = left.reduce((best, i) => (sit.poll![i] > sit.poll![best] ? i : best), left[0]);
      share = sit.poll[top] / total;
    }
  }
  if (top !== null && share >= 0.5) return { type: 'final', choice: top };

  // still unsure: a lifeline (an easy bot sometimes forgets it has one)
  const can = (l: MillionLifeline) => !sit.used[l] && (l === 'fifty' || (l === 'audience' ? sit.canAudience : sit.canFriend));
  const order: MillionLifeline[] = sit.step < 7 ? ['audience', 'fifty', 'friend'] : ['fifty', 'friend', 'audience'];
  const forget = sit.level === 'easy' ? 0.25 : 0;
  for (const l of order) if (can(l) && rnd() >= forget) return { type: l };

  // no more help: the best hunch, or walk away from a big drop
  const hunch = friend ? friend.answer! : top !== null && share >= 0.3 ? top : left.includes(mind.lean) ? mind.lean : pickOf(left, rnd);
  const chance = friend || (top !== null && share >= 0.3) ? 0.55 : 1 / left.length;
  const drop = prizeAt(sit.won) - safePrize(sit.won);
  if (sit.step >= 6 && drop >= 4000 && chance <= 0.55 && rnd() < WALK[sit.level]) return { type: 'walk' };
  return { type: 'final', choice: hunch };
}

/** How long the bot in the seat takes (ms): reading the question first, then a short think. */
export function seatDelay(level: BotLevel, q: BotQuestion, first: boolean, sure: boolean, timerMs: number): number {
  const read = first ? readMs(readChars(q.text, q.options)) * (level === 'easy' ? 1.4 : 1.15) : 0;
  const think = sure ? randInt(1500, 3500) : randInt(2500, 5500);
  const ms = read + think;
  return Math.round(timerMs ? Math.min(ms, timerMs * 0.7) : Math.min(ms, 16_000));
}

/** When an audience bot answers (ms). */
export function audienceDelay(level: BotLevel, q: BotQuestion, timerSec: number, knows: boolean): number {
  return quizDelay(level, timerSec || 30, readChars(q.text, q.options), knows);
}

/** When a friend bot answers the call (ms). */
export function friendDelay(level: BotLevel): number {
  const [lo, hi] = level === 'easy' ? [5000, 11000] : level === 'smart' ? [4000, 9000] : [3000, 7000];
  return randInt(lo, hi);
}

/** Whether a friend bot says «متأكد». */
export function friendSure(level: BotLevel, knows: boolean, rnd: Rnd = Math.random): boolean {
  if (knows) return level === 'easy' ? rnd() < 0.85 : true;
  return rnd() < (level === 'easy' ? 0.3 : 0.1);
}
