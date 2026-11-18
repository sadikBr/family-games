/**
 * «الروابط» — how a bot plays its own board in a race (bots don't play in «تعاون»).
 *
 * A bot sees only its own board: the groups it hasn't found yet. Each check it aims at one of them (the easy
 * colours more often) and sees it with a chance set by its strength and the group's colour (yellow easiest,
 * purple hardest; easier with only two groups left, certain with one). When it doesn't see it, it checks a
 * plausible wrong four instead (usually three right and one from another group, so «ينقص واحد!»), never the
 * same wrong four twice. Its time to think grows with the colour, like a person's.
 */
import type { RawabitColor } from '../src/shared/games/rawabit';
import type { BotLevel } from '../src/shared/protocol';

export type Rnd = () => number;

/** A group the bot hasn't found yet: its index, colour and tile ids. */
export interface BotGroup {
  group: number;
  color: RawabitColor;
  ids: number[];
}

/** Chance to see a green group, and the time to think about one ([fastest, slowest] ms), by strength. */
export const RAWABIT_BOT: Record<BotLevel, { see: number; ms: [number, number] }> = {
  easy: { see: 0.5, ms: [16_000, 30_000] },
  smart: { see: 0.68, ms: [11_000, 22_000] },
  expert: { see: 0.84, ms: [7_000, 15_000] },
};
/** How much easier (or harder) each colour is to see. */
const EASE: Record<RawabitColor, number> = { yellow: 0.15, green: 0, blue: -0.1, purple: -0.2 };
/** How much longer each colour takes. */
const SLOW: Record<RawabitColor, number> = { yellow: 0.8, green: 1, blue: 1.2, purple: 1.45 };
/** Which group a bot tries first: the easy colours more often. */
const AIM: Record<RawabitColor, number> = { yellow: 4, green: 3, blue: 2, purple: 1 };

export const guessKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');

function pick<T>(list: T[], rnd: Rnd): T {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

/** The chance to see this group now. */
export function seeChance(level: BotLevel, color: RawabitColor, left: number): number {
  if (left <= 1) return 1;
  return Math.max(0.05, Math.min(0.97, RAWABIT_BOT[level].see + EASE[color] + (left === 2 ? 0.2 : 0)));
}

/** The bot's next check: four tile ids, whether they are a group, and how long it thinks first. */
export function botGuess(level: BotLevel, left: BotGroup[], tried: ReadonlySet<string>, rnd: Rnd): { ids: number[]; right: boolean; delay: number } {
  const total = left.reduce((t, g) => t + AIM[g.color], 0);
  let r = rnd() * total;
  let target = left[left.length - 1];
  for (const g of left) {
    r -= AIM[g.color];
    if (r < 0) {
      target = g;
      break;
    }
  }
  const [lo, hi] = RAWABIT_BOT[level].ms;
  const delay = Math.round((lo + rnd() * (hi - lo)) * SLOW[target.color] * (left.length <= 1 ? 0.5 : 1));
  if (rnd() < seeChance(level, target.color, left.length)) return { ids: [...target.ids], right: true, delay };
  const wrong = wrongFour(target, left, tried, rnd);
  return wrong ? { ids: wrong, right: false, delay } : { ids: [...target.ids], right: true, delay };
}

/** A wrong four close to `target` (three of it and one other, sometimes two and two) not tried before. */
export function wrongFour(target: BotGroup, left: BotGroup[], tried: ReadonlySet<string>, rnd: Rnd): number[] | null {
  const others = left.filter((g) => g !== target).flatMap((g) => g.ids);
  if (!others.length) return null;
  for (let t = 0; t < 30; t++) {
    const mine = [...target.ids].sort(() => rnd() - 0.5);
    const theirs = [...others].sort(() => rnd() - 0.5);
    const keep = rnd() < 0.75 ? 3 : 2;
    const ids = [...mine.slice(0, keep), ...theirs.slice(0, 4 - keep)];
    if (!tried.has(guessKey(ids))) return ids;
  }
  return null;
}
