/**
 * «أكبر أم أصغر؟» — which two items make a question, and the order of a game's questions.
 *
 * A pair: two items of the same group whose values are at least the group's `minRatio` apart (never
 * under AKBAR_MIN_RATIO = 1.1). For a year question the gap is measured on the ages (2026 − year, so
 * 1889 against 1931 is 137 years against 95) and the two years must also be AKBAR_MIN_YEARS apart.
 *
 * A game rises in difficulty: the first question aims at a ratio of about 4 (the population of India
 * against Tunisia), the last at about 1.15 (Morocco against Canada); each question takes, in a group
 * the game hasn't used much, one of the pairs closest to that aim. An item comes up once per game, and
 * the room remembers the items already seen so the next games show others first.
 */
import type { AkbarTopic, Side } from '../src/shared/games/akbar';
import { AKBAR_GROUPS, type AkbarGroup, type AkbarItem } from './akbar-content';
import type { GameCtx } from './types';

export const AKBAR_MIN_RATIO = 1.1;
/** Two years of a year question are at least this far apart. */
export const AKBAR_MIN_YEARS = 5;
/** The year the ages of a year question are counted from. */
export const AKBAR_REF_YEAR = 2026;
/** The aimed ratio of the first and the last question. */
export const AKBAR_EASY_RATIO = 4;
export const AKBAR_HARD_RATIO = 1.15;

type Rnd = () => number;

export interface AkbarPair {
  group: AkbarGroup;
  a: AkbarItem;
  b: AkbarItem;
  /** bigger / smaller (≥ 1) of what is compared (ages for a year question) */
  ratio: number;
}

/** What a question compares: the value, or for a year question its age. */
export function magnitude(g: AkbarGroup, v: number): number {
  return g.older ? AKBAR_REF_YEAR - v : v;
}

/** bigger / smaller of the two compared magnitudes (Infinity when one is 0). */
export function ratioOf(g: AkbarGroup, x: number, y: number): number {
  const p = magnitude(g, x);
  const q = magnitude(g, y);
  const lo = Math.min(p, q);
  return lo <= 0 ? Infinity : Math.max(p, q) / lo;
}

/** Whether two values of this group may be asked together. */
export function fairPair(g: AkbarGroup, x: number, y: number): boolean {
  if (g.older && Math.abs(x - y) < AKBAR_MIN_YEARS) return false;
  const r = ratioOf(g, x, y);
  return Number.isFinite(r) && r >= Math.max(AKBAR_MIN_RATIO, g.minRatio);
}

/** The side that answers the question: the bigger value, or the smaller year for «أيهما أقدم؟». */
export function winnerSide(g: AkbarGroup, a: number, b: number): Side {
  if (g.older) return a <= b ? 0 : 1;
  return a >= b ? 0 : 1;
}

const PAIRS = new Map<string, AkbarPair[]>();
/** Every fair pair of a group (computed once). */
export function groupPairs(g: AkbarGroup): AkbarPair[] {
  let list = PAIRS.get(g.id);
  if (list) return list;
  list = [];
  for (let i = 0; i < g.items.length; i++) {
    for (let j = i + 1; j < g.items.length; j++) {
      const a = g.items[i];
      const b = g.items[j];
      if (fairPair(g, a.value, b.value)) list.push({ group: g, a, b, ratio: ratioOf(g, a.value, b.value) });
    }
  }
  PAIRS.set(g.id, list);
  return list;
}

export function topicGroups(topic: AkbarTopic): AkbarGroup[] {
  return AKBAR_GROUPS.filter((g) => topic === 'mix' || g.topic === topic);
}

/** The ratio question `i` (0-based) of `n` aims at: from AKBAR_EASY_RATIO down to AKBAR_HARD_RATIO, evenly in log. */
export function targetRatio(i: number, n: number): number {
  const t = n <= 1 ? 0 : i / (n - 1);
  return Math.exp(Math.log(AKBAR_EASY_RATIO) + t * (Math.log(AKBAR_HARD_RATIO) - Math.log(AKBAR_EASY_RATIO)));
}

/**
 * The questions of a game: `n` pairs from the topic's groups, no item twice, the groups spread out (the
 * least used first, never the same twice in a row when another one is left), the difficulty rising.
 * `seen` = items the room has already shown (avoided while others are left). Sides are shuffled.
 */
export function dealPairs(topic: AkbarTopic, n: number, rnd: Rnd = Math.random, seen: ReadonlySet<string> = new Set()): AkbarPair[] {
  const groups = topicGroups(topic).filter((g) => groupPairs(g).length > 0);
  const used = new Set<string>();
  const uses = new Map<string, number>();
  const out: AkbarPair[] = [];
  let last: string | null = null;
  // a group's weight: bigger groups come up a little more often
  const weight = (g: AkbarGroup) => Math.sqrt(g.items.length);
  for (let i = 0; i < n; i++) {
    const aim = Math.log(targetRatio(i, n));
    const open = groups.filter((g) => groupPairs(g).some((p) => !used.has(p.a.id) && !used.has(p.b.id)));
    if (!open.length) break;
    const fewest = Math.min(...open.map((g) => uses.get(g.id) ?? 0));
    let pool = open.filter((g) => (uses.get(g.id) ?? 0) === fewest && g.id !== last);
    if (!pool.length) pool = open.filter((g) => g.id !== last);
    if (!pool.length) pool = open;
    // a weighted draw among the least used groups
    const total = pool.reduce((s, g) => s + weight(g), 0);
    let r = rnd() * total;
    let g = pool[pool.length - 1];
    for (const x of pool) {
      r -= weight(x);
      if (r <= 0) {
        g = x;
        break;
      }
    }
    // the free pairs closest to the aim (an item already seen in the room counts as farther)
    const scored = groupPairs(g)
      .filter((p) => !used.has(p.a.id) && !used.has(p.b.id))
      .map((p) => ({ p, d: Math.abs(Math.log(p.ratio) - aim) + (seen.has(p.a.id) ? 0.6 : 0) + (seen.has(p.b.id) ? 0.6 : 0) + rnd() * 0.08 }))
      .sort((x, y) => x.d - y.d);
    const pick = scored[Math.floor(rnd() * Math.min(4, scored.length))].p;
    used.add(pick.a.id);
    used.add(pick.b.id);
    uses.set(g.id, (uses.get(g.id) ?? 0) + 1);
    last = g.id;
    out.push(rnd() < 0.5 ? pick : { ...pick, a: pick.b, b: pick.a });
  }
  return out;
}

const SEEN_KEY = 'akbar:seen';

/** The room's items already shown (ctx.memo), forgotten once most of the topic's items have come up. */
export function roomSeen(ctx: GameCtx, topic: AkbarTopic): Set<string> {
  let seen = ctx.memo.get(SEEN_KEY) as Set<string> | undefined;
  if (!seen) {
    seen = new Set();
    ctx.memo.set(SEEN_KEY, seen);
  }
  const ids = topicGroups(topic).flatMap((g) => g.items.map((it) => it.id));
  const left = ids.filter((id) => !seen.has(id)).length;
  if (left < ids.length * 0.3) for (const id of ids) seen.delete(id);
  return seen;
}
