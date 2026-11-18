/**
 * «رتّب الأحداث» — dealing the rounds and the bots' orders.
 *
 * How hard a round is depends on how close its dates are, measured on a "felt time" scale `feltYear`:
 * ten years apart is a lot in the last decades and little two thousand years ago. One unit is about
 * 11 years today, 20 years around 1900, 90 years around the year 1000 and 200 years in antiquity.
 * A round's difficulty is the smallest gap between two neighbouring cards on that scale: easy rounds
 * (4 cards) keep every pair far apart, medium and hard rounds (5 cards) bring some dates close.
 * Two cards of the same year never share a round.
 *
 * Bots place each card where they "feel" its date to be, with noise by level: an expert rarely swaps
 * dates far apart but can swap close ones; an easy bot mixes up more.
 */
import type { BotLevel } from '../src/shared/protocol';
import type { TartibLevel, TartibTopic } from '../src/shared/games/tartib';
import type { TartibItem } from './tartib-content';
import { TARTIB_ITEMS } from './tartib-content';

const NOW = 2026;

/** The year on the "felt time" scale (increasing with the year). */
export function feltYear(year: number): number {
  return -12.5 * Math.log(10 + 0.08 * (NOW - year));
}

/** The smallest felt gap between two neighbouring cards (after sorting by year). */
export function minGap(items: readonly { year: number }[]): number {
  const ys = items.map((i) => i.year).sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < ys.length; i++) g = Math.min(g, feltYear(ys[i]) - feltYear(ys[i - 1]));
  return g;
}

/** The felt gap each level aims for. */
export const LEVEL_TARGET: Record<TartibLevel, number> = { easy: 3.2, medium: 1.4, hard: 0.6 };
/** Closer than this is too close even for a hard round (a few years apart in recent times). */
export const GAP_FLOOR = 0.2;
export const LEVEL_CARDS: Record<TartibLevel, number> = { easy: 4, medium: 5, hard: 5 };

/** The level of each round: the first third easy, then medium, the last third hard. */
export function roundLevels(rounds: number): TartibLevel[] {
  return Array.from({ length: rounds }, (_, i) => {
    const t = i / rounds;
    return t < 0.34 ? 'easy' : t < 0.67 ? 'medium' : 'hard';
  });
}

export function topicPool(topic: TartibTopic): TartibItem[] {
  return topic === 'mix' ? TARTIB_ITEMS : TARTIB_ITEMS.filter((i) => i.cat === topic);
}

/** `n` items of `from` at random, all of different years (null if impossible). */
function sampleDistinct(from: readonly TartibItem[], n: number, rnd: () => number, first?: TartibItem): TartibItem[] | null {
  const out: TartibItem[] = first ? [first] : [];
  const years = new Set(out.map((i) => i.year));
  const rest = from.filter((i) => i !== first);
  for (let k = rest.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [rest[k], rest[j]] = [rest[j], rest[k]];
  }
  for (const it of rest) {
    if (out.length >= n) break;
    if (years.has(it.year)) continue;
    years.add(it.year);
    out.push(it);
  }
  return out.length === n ? out : null;
}

/**
 * The cards of one round: `n` items of different years from `pool`, whose smallest felt gap is as
 * close as possible to the level's target. Tries random sets over the whole pool and sets around a
 * random anchor (windowed, so that close dates can be found), and keeps the best.
 */
export function dealRound(pool: readonly TartibItem[], n: number, level: TartibLevel, rnd: () => number = Math.random): TartibItem[] {
  const target = LEVEL_TARGET[level];
  const score = (set: TartibItem[]) => {
    const g = minGap(set);
    if (g < GAP_FLOOR) return 100 + (GAP_FLOOR - g);
    // easy: any gap above the target is just as good
    if (level === 'easy' && g >= target) return 0;
    return Math.abs(Math.log(g / target));
  };
  let best: TartibItem[] | null = null;
  let bestScore = Infinity;
  const width = target * (n - 1) * 1.6;
  for (let k = 0; k < 160 && bestScore > 0.08; k++) {
    let set: TartibItem[] | null;
    if (k % 2 === 0) set = sampleDistinct(pool, n, rnd);
    else {
      const anchor = pool[Math.floor(rnd() * pool.length)];
      const a = feltYear(anchor.year);
      set = sampleDistinct(
        pool.filter((i) => Math.abs(feltYear(i.year) - a) <= width),
        n,
        rnd,
        anchor,
      );
    }
    if (!set) continue;
    const sc = score(set);
    if (sc < bestScore) {
      best = set;
      bestScore = sc;
    }
  }
  return best ?? sampleDistinct(pool, Math.min(n, new Set(pool.map((i) => i.year)).size), rnd) ?? pool.slice(0, n);
}

/** Shuffle the round's cards so that they are never already in the right order; `correct` = indexes, oldest first. */
export function shuffleCards(items: readonly TartibItem[], rnd: () => number = Math.random): { cards: TartibItem[]; correct: number[] } {
  const sorted = [...items].sort((a, b) => a.year - b.year);
  let cards = [...sorted];
  for (let tries = 0; tries < 20 && cards.every((c, i) => c === sorted[i]); tries++) {
    for (let k = cards.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [cards[k], cards[j]] = [cards[j], cards[k]];
    }
  }
  if (cards.every((c, i) => c === sorted[i])) cards = [...cards.slice(1), cards[0]];
  return { cards, correct: sorted.map((it) => cards.indexOf(it)) };
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** How blurry a bot's sense of dates is, in felt units. */
export const BOT_NOISE: Record<BotLevel, number> = { easy: 2.2, smart: 1.2, expert: 0.6 };

function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A bot's order (card indexes, oldest first): each card at its felt date plus noise. */
export function botOrder(cards: readonly { year: number }[], level: BotLevel, rnd: () => number = Math.random): number[] {
  const sigma = BOT_NOISE[level];
  const est = cards.map((c) => feltYear(c.year) + gauss(rnd) * sigma);
  return cards.map((_, i) => i).sort((a, b) => est[a] - est[b]);
}

/** When a bot confirms: reading the cards and tapping them in, slower for weaker bots, never at the buzzer. */
export function botDelay(cards: readonly { text: string }[], level: BotLevel, timerMs: number, rnd: () => number = Math.random): number {
  const chars = cards.reduce((t, c) => t + c.text.length, 0);
  const base = 2500 + chars * 35 + cards.length * 1500;
  const factor = level === 'easy' ? 1.6 : level === 'smart' ? 1.25 : 1;
  const ms = base * factor * (0.8 + rnd() * 0.45);
  return Math.round(Math.max(2500, Math.min(ms, timerMs * 0.9 - 600)));
}
