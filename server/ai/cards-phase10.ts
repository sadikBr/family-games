/**
 * «المراحل العشر» — the strong bot.
 * - Before laying its phase it keeps the hand that is fewest cards away from the phase; among those, the
 *   cards that fit together, then the most live chances (unseen cards — not in its hand, on the table or
 *   thrown — that would bring it a card closer). Skips are thrown at once, on whoever is closest to
 *   going out (in a duel that is a turn more for itself).
 * - It never feeds the next player: no card that fits a group on the table once they are down, nothing
 *   like the cards they picked up, rather what they threw themselves; wilds are never thrown.
 * - After laying it hits everything it can and throws its most expensive card.
 * Sees only what its own phone shows (plus what everybody saw picked up and thrown).
 */
import type { P10Card, P10Group } from '../../src/shared/games/phase10';
import { canHit, cardPoints, deficit, isNatural, isSkip, isWild, phaseReqs, solvePhase } from '../../src/shared/phase10-rules';
import { P10_COLORS } from '../../src/shared/games/phase10';
import type { BotLevel, GameAction } from '../../src/shared/protocol';

export interface P10Knowledge {
  me: string;
  step: 'draw' | 'play';
  hand: P10Card[];
  /** the phase number I'm on (null: all done) */
  phase: number | null;
  laid: string[];
  groups: P10Group[];
  discard: P10Card[];
  /** players still in, in turn order starting after me */
  next: string[];
  counts: Record<string, number>;
  phaseOf: Record<string, number | null>;
  skipped: string[];
  log: { by: string; card: P10Card; kind: 'take' | 'throw' }[];
}

/** How well a card sits with the rest of the hand for this phase (higher = keep). */
function keepScore(card: P10Card, hand: P10Card[], phase: number): number {
  if (!isNatural(card)) return 0;
  const kinds = new Set(phaseReqs(phase).map((r) => r.kind));
  let k = 0;
  for (const c of hand) {
    if (c.id === card.id || !isNatural(c)) continue;
    if (kinds.has('set') && c.n === card.n) k += 3;
    if (kinds.has('color') && c.color === card.color) k += 2;
    if (kinds.has('run')) {
      const d = Math.abs(c.n! - card.n!);
      if (d === 0) k -= 1;
      else if (d <= 2) k += 3 - d;
    }
  }
  return k;
}
const key = (c: P10Card) => (c.kind === 'num' ? `${c.n}:${c.color}` : c.kind);

/** Unseen copies of each card type (2 of each number/colour, 8 wilds), from this seat. */
function unseen(k: P10Knowledge): Map<string, { card: P10Card; n: number }> {
  const m = new Map<string, { card: P10Card; n: number }>();
  for (const color of P10_COLORS) for (let n = 1; n <= 12; n++) m.set(`${n}:${color}`, { card: { id: `x-${n}-${color}`, kind: 'num', n, color }, n: 2 });
  m.set('wild', { card: { id: 'x-wild', kind: 'wild' }, n: 8 });
  const seen = [...k.hand, ...k.groups.flatMap((g) => g.cards), ...k.discard];
  for (const c of seen) {
    const e = m.get(key(c));
    if (e) e.n = Math.max(0, e.n - 1);
  }
  return m;
}

/** How a hand stands toward the phase: cards missing, then live outs (more is better). */
function standing(k: P10Knowledge, hand: P10Card[], live: Map<string, { card: P10Card; n: number }>): [number, number] {
  const reqs = phaseReqs(k.phase!);
  const d = deficit(reqs, hand);
  if (d === 0) return [0, 0];
  let outs = 0;
  for (const { card, n } of live.values()) {
    if (!n) continue;
    if (isWild(card)) {
      outs += n;
      continue;
    }
    if (deficit(reqs, [...hand, card]) < d) outs += n;
  }
  return [d, outs];
}

/** How much a thrown card would help the next player. */
function feeds(k: P10Knowledge, c: P10Card): number {
  if (isSkip(c)) return 0;
  if (isWild(c)) return 100;
  const nxt = k.next[0];
  if (!nxt) return 0;
  if (k.laid.includes(nxt)) return k.groups.some((g) => canHit(g.kind, g.cards, [c])) ? 8 : 0;
  const phase = k.phaseOf[nxt];
  if (!phase) return 0;
  const kinds = new Set(phaseReqs(phase).map((r) => r.kind));
  let f = 0;
  for (const e of k.log) {
    if (e.by !== nxt || !isNatural(e.card)) continue;
    const sign = e.kind === 'take' ? 1 : -0.5;
    if (kinds.has('set') && e.card.n === c.n) f += 3 * sign;
    if (kinds.has('color') && e.card.color === c.color) f += 2 * sign;
    if (kinds.has('run') && Math.abs(e.card.n! - c.n!) <= 2) f += (e.card.n === c.n ? 1 : 2) * sign;
  }
  return Math.max(0, f);
}

/** The skip's target: whoever is closest to going out (down, fewest cards), else the furthest along. */
function skipTarget(k: P10Knowledge): string | undefined {
  const targets = k.next.filter((id) => !k.skipped.includes(id));
  return targets.sort(
    (a, b) =>
      Number(k.laid.includes(b)) - Number(k.laid.includes(a)) ||
      (k.counts[a] ?? 10) - (k.counts[b] ?? 10) ||
      (k.phaseOf[b] ?? 99) - (k.phaseOf[a] ?? 99),
  )[0];
}

function chooseDiscard(k: P10Knowledge, level: BotLevel): P10Card {
  const hand = k.hand;
  const skip = hand.find(isSkip);
  const iLaid = k.laid.includes(k.me) || k.phase === null;
  // a skip goes at once: held, it is a dead card in the hand (and 15 points); thrown, it costs the
  // target a turn (in a duel: a turn more for me)
  if (skip) return skip;
  const pool = hand.filter((c) => !isWild(c) && !isSkip(c));
  if (!pool.length) return skip ?? hand[0];
  if (iLaid) {
    // down: throw the most expensive card nobody can use
    return pool.slice().sort((a, b) => cardPoints(b) - cardPoints(a) + 0.4 * (feeds(k, a) - feeds(k, b)) || b.n! - a.n!)[0];
  }
  const live = unseen(k);
  let best = pool[0];
  let bestV = Infinity;
  for (const c of pool) {
    const rest = hand.filter((x) => x !== c);
    const [d, outs] = standing(k, rest, live);
    // cards missing first; then keep what fits the rest of the hand, then live chances, then points
    let v = d * 100 + 3 * keepScore(c, hand, k.phase!) - 0.3 * outs + 3 * feeds(k, c) - 0.1 * cardPoints(c);
    if (level === 'smart') v += Math.random() * 25;
    if (v < bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/** One card to hit onto the table (real cards first; wilds when that empties the hand or nothing else fits). */
function chooseHit(k: P10Knowledge): { card: P10Card; group: P10Group } | null {
  const hand = k.hand.slice().sort((a, b) => Number(isWild(a)) - Number(isWild(b)) || cardPoints(b) - cardPoints(a));
  for (const card of hand) {
    if (isSkip(card)) continue;
    const groups = isWild(card) ? k.groups.slice().sort((a, b) => Number(b.kind === 'run') - Number(a.kind === 'run')) : k.groups;
    const group = groups.find((g) => canHit(g.kind, g.cards, [card]));
    if (group) return { card, group };
  }
  return null;
}

export function p10BotAction(k: P10Knowledge, level: BotLevel): GameAction {
  const hand = k.hand;
  const iLaid = k.laid.includes(k.me);
  if (k.step === 'draw') {
    const top = k.discard[k.discard.length - 1];
    if (!top || isSkip(top)) return { type: 'drawDeck' };
    if (isWild(top)) return { type: 'drawDiscard' };
    if (iLaid || k.phase === null) return { type: k.groups.some((g) => canHit(g.kind, g.cards, [top])) ? 'drawDiscard' : 'drawDeck' };
    // take it when it brings the phase closer (after the throw that follows)
    const reqs = phaseReqs(k.phase);
    const d0 = deficit(reqs, hand);
    let bestD = Infinity;
    const withTop = [...hand, top];
    for (const c of hand) if (!isWild(c)) bestD = Math.min(bestD, deficit(reqs, withTop.filter((x) => x !== c)));
    if (bestD < d0) return { type: 'drawDiscard' };
    return { type: 'drawDeck' };
  }
  if (!iLaid && k.phase !== null) {
    const sol = solvePhase(phaseReqs(k.phase), hand);
    if (sol) return { type: 'lay', groups: sol.map((g) => g.map((c) => c.id)) };
  }
  if (iLaid) {
    const hit = chooseHit(k);
    if (hit) return { type: 'hit', group: hit.group.id, cards: [hit.card.id] };
  }
  const card = chooseDiscard(k, level);
  const target = isSkip(card) ? skipTarget(k) : undefined;
  return { type: 'discard', card: card.id, ...(target ? { target } : {}) };
}
