/**
 * «المراحل العشر» — pure rules shared by the server (validation, bots) and the app (hints, previews).
 * No React Native or server imports here.
 */
import { P10_COLORS, P10_PHASES, type P10Card, type P10Color, type P10GroupKind, type P10Req } from './games/phase10';

export const isNatural = (c: P10Card) => c.kind === 'num';
export const isWild = (c: P10Card) => c.kind === 'wild';
export const isSkip = (c: P10Card) => c.kind === 'skip';

export const P10_COLOR_NAME: Record<P10Color, string> = { orange: 'برتقالي', purple: 'بنفسجي', teal: 'فيروزي', pink: 'وردي' };

export function p10CardName(c: P10Card): string {
  if (c.kind === 'wild') return 'جوكر';
  if (c.kind === 'skip') return 'تخطَّ';
  return `${c.n} ${P10_COLOR_NAME[c.color!]}`;
}

/** Penalty points for a card left in hand. */
export function cardPoints(c: P10Card): number {
  if (c.kind === 'wild') return 25;
  if (c.kind === 'skip') return 15;
  return (c.n ?? 0) <= 9 ? 5 : 10;
}

/** 108 cards: 1–12 in four colours twice (96), 8 wilds, 4 skips. */
export function makeP10Deck(): P10Card[] {
  const deck: P10Card[] = [];
  for (const color of P10_COLORS) {
    for (let n = 1; n <= 12; n++) {
      for (let copy = 1; copy <= 2; copy++) deck.push({ id: `${color}-${n}-${copy}`, kind: 'num', n, color });
    }
  }
  for (let i = 1; i <= 8; i++) deck.push({ id: `wild-${i}`, kind: 'wild' });
  for (let i = 1; i <= 4; i++) deck.push({ id: `skip-${i}`, kind: 'skip' });
  return deck;
}

export const phaseReqs = (phase: number): P10Req[] => P10_PHASES[phase - 1] ?? [];

/**
 * Can these cards be one group of this kind, with at least `min` cards?
 * Wilds stand for anything, but a group needs at least one real number card; skips never fit.
 */
export function groupOk(kind: P10GroupKind, cards: P10Card[], min = 1): boolean {
  if (cards.length < min || cards.some(isSkip)) return false;
  const nat = cards.filter(isNatural);
  if (!nat.length) return false;
  if (kind === 'set') return nat.every((c) => c.n === nat[0].n);
  if (kind === 'color') return nat.every((c) => c.color === nat[0].color);
  if (cards.length > 12) return false;
  const ns = nat.map((c) => c.n!);
  if (new Set(ns).size !== ns.length) return false;
  return Math.max(...ns) - Math.min(...ns) + 1 <= cards.length;
}

const COLOR_ORDER: Record<P10Color, number> = { orange: 0, purple: 1, teal: 2, pink: 3 };

/** Cards of a group in reading order; in a run each wild sits where it counts (with the number it stands for). */
export function arrangeGroup(kind: P10GroupKind, cards: P10Card[]): { card: P10Card; value?: number }[] {
  const nat = cards.filter(isNatural);
  const wilds = cards.filter(isWild);
  if (kind !== 'run' || !nat.length) {
    const sorted = nat
      .slice()
      .sort((a, b) => (kind === 'set' ? COLOR_ORDER[a.color!] - COLOR_ORDER[b.color!] : a.n! - b.n!) || a.id.localeCompare(b.id));
    return [...sorted.map((card) => ({ card })), ...wilds.map((card) => ({ card }))];
  }
  const ns = nat.map((c) => c.n!);
  const L = cards.length;
  const start = Math.max(1, Math.min(Math.min(...ns), 13 - L));
  const out: { card: P10Card; value?: number }[] = [];
  let w = 0;
  for (let v = start; v < start + L; v++) {
    const c = nat.find((x) => x.n === v);
    if (c) out.push({ card: c });
    else if (w < wilds.length) out.push({ card: wilds[w++], value: v });
  }
  return out;
}

/** Can `cards` be added to a group already on the table? */
export function canHit(kind: P10GroupKind, group: P10Card[], cards: P10Card[]): boolean {
  return cards.length > 0 && groupOk(kind, [...group, ...cards], 1);
}

/**
 * Split exactly these cards into the phase's groups (in requirement order), or null.
 * Used by the app to offer «ضع المرحلة» as soon as the selected cards fit.
 */
export function fitsExactly(reqs: P10Req[], cards: P10Card[]): P10Card[][] | null {
  if (!reqs.length) return null;
  if (reqs.length === 1) return groupOk(reqs[0].kind, cards, reqs[0].size) ? [cards] : null;
  const n = cards.length;
  if (n > 16 || n < reqs[0].size + reqs[1].size) return null;
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const a: P10Card[] = [];
    const b: P10Card[] = [];
    for (let i = 0; i < n; i++) ((mask >> i) & 1 ? a : b).push(cards[i]);
    if (groupOk(reqs[0].kind, a, reqs[0].size) && groupOk(reqs[1].kind, b, reqs[1].size)) return [a, b];
  }
  return null;
}

/** One way to build a requirement from a pool: the real cards it uses and how many wilds it still needs. */
interface Option {
  nat: P10Card[];
  wilds: number;
}

function optionsFor(req: P10Req, pool: P10Card[]): Option[] {
  const nat = pool.filter(isNatural);
  const out: Option[] = [];
  if (req.kind === 'set' || req.kind === 'color') {
    const keys = new Map<string, P10Card[]>();
    for (const c of nat) {
      const k = req.kind === 'set' ? String(c.n) : c.color!;
      keys.set(k, [...(keys.get(k) ?? []), c]);
    }
    for (const list of keys.values()) {
      const use = list.slice(0, req.size);
      out.push({ nat: use, wilds: req.size - use.length });
    }
  } else {
    for (let s = 1; s + req.size - 1 <= 12; s++) {
      const use: P10Card[] = [];
      for (let v = s; v < s + req.size; v++) {
        const c = nat.find((x) => x.n === v);
        if (c) use.push(c);
      }
      if (use.length) out.push({ nat: use, wilds: req.size - use.length });
    }
  }
  if (!out.length) out.push({ nat: [], wilds: req.size });
  return out;
}

function without(pool: P10Card[], used: P10Card[]): P10Card[] {
  const ids = new Set(used.map((c) => c.id));
  return pool.filter((c) => !ids.has(c.id));
}

/** Every combination of options for the phase's groups (at most a couple of hundred). */
function combos(reqs: P10Req[], hand: P10Card[]): Option[][] {
  if (!reqs.length) return [];
  const first = optionsFor(reqs[0], hand);
  if (reqs.length === 1) return first.map((o) => [o]);
  const out: Option[][] = [];
  for (const o of first) for (const p of optionsFor(reqs[1], without(hand, o.nat))) out.push([o, p]);
  return out;
}

/**
 * Pick cards from a hand that complete the phase (fewest wilds), in requirement order, or null.
 * Groups use exactly the required size; spare cards can be added afterwards.
 */
export function solvePhase(reqs: P10Req[], hand: P10Card[]): P10Card[][] | null {
  const wilds = hand.filter(isWild);
  let best: P10Card[][] | null = null;
  let bestWilds = Infinity;
  for (const combo of combos(reqs, hand)) {
    const need = combo.reduce((t, o) => t + o.wilds, 0);
    if (need > wilds.length || need >= bestWilds || combo.some((o) => !o.nat.length)) continue;
    let w = 0;
    best = combo.map((o) => [...o.nat, ...wilds.slice(w, (w += o.wilds))]);
    bestWilds = need;
  }
  return best;
}

/** How many cards the hand still lacks to complete the phase (0 = it can be laid now). */
export function deficit(reqs: P10Req[], hand: P10Card[]): number {
  const wilds = hand.filter(isWild).length;
  let best = Infinity;
  for (const combo of combos(reqs, hand)) {
    const need = combo.reduce((t, o) => t + o.wilds, 0);
    const bare = combo.filter((o) => !o.nat.length).length;
    best = Math.min(best, Math.max(need - wilds, bare, 0));
  }
  return best === Infinity ? reqs.reduce((t, r) => t + r.size, 0) : best;
}

/** Sort a hand by number (then colour) or by colour (then number); wilds and skips go last. */
export function sortP10(cards: P10Card[], by: 'number' | 'color'): P10Card[] {
  const rank = (c: P10Card) => (c.kind === 'num' ? 0 : c.kind === 'wild' ? 1 : 2);
  return cards.slice().sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r || a.kind !== 'num') return r || a.id.localeCompare(b.id);
    const byN = a.n! - b.n!;
    const byC = COLOR_ORDER[a.color!] - COLOR_ORDER[b.color!];
    return (by === 'number' ? byN || byC : byC || byN) || a.id.localeCompare(b.id);
  });
}
