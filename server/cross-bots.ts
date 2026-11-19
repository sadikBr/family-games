/**
 * «الكلمات المتقاطعة» — how a bot solves.
 *
 * A bot doesn't read the answers: for each clue it either "knows" the word or not, a chance by its strength
 * and the clue's difficulty, rolled once — and rolled again (with better odds) each time more letters of
 * that word are written in its grid by the crossings, the way a person sees a word once a few letters are
 * in. It then writes a word it knows after a pause by its strength (shorter when letters are already in).
 * Easy bots are slow and miss many words; experts are quick and miss few. In «تعاوني» the pace is calmer
 * and the bots together take at most about 40% of the words, so the people play.
 */
import type { BotLevel } from '../src/shared/protocol';
import type { CrossGrid } from './games/cross';
import type { CrossPuzzle, Rnd } from './cross-gen';

export interface BotMind {
  /** planned words so far (the key of the next one) */
  step: number;
  /** per clue: does it know the word */
  know: Record<number, boolean>;
  /** per clue: letters in the word when it last thought about it */
  rolledAt: Record<number, number>;
}

interface Level {
  /** ms for a word: [fastest, slowest] */
  ms: [number, number];
  /** the chance to know an easy / a medium clue */
  e: number;
  m: number;
}

export const CROSS_BOT: Record<'race' | 'coop', Record<BotLevel, Level>> = {
  race: {
    easy: { ms: [20_000, 38_000], e: 0.5, m: 0.3 },
    smart: { ms: [12_000, 23_000], e: 0.75, m: 0.6 },
    expert: { ms: [6_500, 12_500], e: 0.95, m: 0.88 },
  },
  coop: {
    easy: { ms: [32_000, 52_000], e: 0.5, m: 0.3 },
    smart: { ms: [26_000, 42_000], e: 0.75, m: 0.6 },
    expert: { ms: [20_000, 34_000], e: 0.95, m: 0.88 },
  },
};

/** Co-op: the first bot word comes no sooner (the people start). */
export const CROSS_BOT_COOP_FIRST_MS = 15_000;

/** Co-op: words the bots may take together. */
export const botShare = (words: number) => Math.max(1, Math.round(words * 0.4));

/** The next word a bot writes and when, or null (it knows none of the words left, for now). */
export function botTarget(level: BotLevel, coop: boolean, p: CrossPuzzle, g: CrossGrid, mind: BotMind, rnd: Rnd, elapsed: number): { clue: number; delay: number } | null {
  const L = CROSS_BOT[coop ? 'coop' : 'race'][level];
  const known: { clue: number; filled: number; len: number }[] = [];
  p.slots.forEach((sl, clue) => {
    if (g.solved[clue] !== null) return;
    const len = sl.cells.length;
    // letters it can see in the word (whoever wrote them)
    const filled = sl.cells.filter((c) => g.letters[c]).length;
    if (mind.know[clue] === undefined || (!mind.know[clue] && filled > (mind.rolledAt[clue] ?? 0))) {
      const base = sl.diff === 'm' ? L.m : L.e;
      mind.know[clue] = rnd() < base + (1 - base) * 0.6 * (filled / len);
      mind.rolledAt[clue] = filled;
    }
    if (mind.know[clue]) known.push({ clue, filled, len });
  });
  if (!known.length) return null;
  // a word with letters in already comes to mind first
  const weights = known.map((k) => 1 + 2 * (k.filled / k.len));
  let x = rnd() * weights.reduce((a, b) => a + b, 0);
  let pick = known[0];
  for (let i = 0; i < known.length; i++) {
    x -= weights[i];
    if (x <= 0) {
      pick = known[i];
      break;
    }
  }
  const [lo, hi] = L.ms;
  let delay = (lo + rnd() * (hi - lo)) * (0.55 + 0.45 * (1 - pick.filled / pick.len)) * (0.75 + 0.25 * (pick.len / 5));
  if (coop) delay = Math.max(delay, CROSS_BOT_COOP_FIRST_MS - elapsed);
  return { clue: pick.clue, delay: Math.round(delay) };
}
