/**
 * «البلوط» — the Moroccan rules (النمط المغربي), shared by the server and the app. The cards are the
 * same 32 as in the Saudi game, shown as the Moroccan deck without the 2s and 3s: 1 = A, 4 = 7, 5 = 8,
 * 6 = 9, 7 = 10, 10 = J (ولد), 11 = Q (كابال), 12 = K (راي), and the suits شباضا (♠), الكوباص (♥),
 * أوروص (♦), الباسطوص (♣). Card order and points are the Saudi حكم ones (J 20, 9 14, A 11, 10 10, K 4,
 * Q 3 in the trump suit); what differs: the play duties, the announcements (الإعلانات) and the scoring.
 */
import { SUIT_INFO, type Card, type Suit } from './cards';
import { B_RANKS, B_SUITS, power, trickLeader } from './baloot-rules';
import type { BCard, BRank, BSide, BSuit, MAnnKind } from './games/baloot';

/** the Spanish suit each card suit is shown as */
export const MA_SUIT: Record<BSuit, Suit> = { S: 'swords', H: 'cups', D: 'coins', C: 'clubs' };
/** the number printed on the Moroccan card */
export const MA_RANK: Record<BRank, number> = { A: 1, '7': 4, '8': 5, '9': 6, '10': 7, J: 10, Q: 11, K: 12 };

/** points of a whole hand (152 in the tricks + 10 for the last one, «ديكس دي دير») */
export const MA_TOTAL = 162;
/** كابو: all 8 tricks (instead of the 162, the last trick's 10 not added) */
export const MA_CAPOT = 252;
/** بلوط-ريبلوط */
export const MA_BELOTE = 20;
export const MA_LAST = 10;

/** The Moroccan card for a card (to draw it with the Moroccan deck). */
export const toSpanish = (c: BCard): Card => ({ id: `${MA_SUIT[c.suit]}-${MA_RANK[c.rank]}`, suit: MA_SUIT[c.suit], rank: MA_RANK[c.rank] });

/** «الكوباص» */
export const maSuitName = (s: BSuit) => SUIT_INFO[MA_SUIT[s]].name;
/** «7 كوباص» — after a number the article is dropped */
export const maCardLabel = (c: BCard) => `${MA_RANK[c.rank]} ${SUIT_INFO[MA_SUIT[c.suit]].short}`;

/**
 * The cards I may play (Moroccan rules):
 * - follow suit if you can; trump led: a higher trump if you can, otherwise any trump;
 * - void in the suit led: your partner holds the trick → any card; otherwise trump if you can, and
 *   over a trump already on the table if you can (if you can't go over it, any card).
 */
export function maLegal(hand: BCard[], trick: { card: BCard }[], trump: BSuit): BCard[] {
  if (!trick.length) return hand;
  const led = trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  const top = Math.max(0, ...trick.filter((t) => t.card.suit === trump).map((t) => power(t.card, trump)));
  if (led === trump) {
    if (!follow.length) return hand;
    const over = follow.filter((c) => power(c, trump) > top);
    return over.length ? over : follow;
  }
  if (follow.length) return follow;
  const pos = trick.length;
  if (pos >= 2 && trickLeader(trick, trump) === pos - 2) return hand;
  const trumps = hand.filter((c) => c.suit === trump);
  if (!trumps.length) return hand;
  if (top > 0) {
    const over = trumps.filter((c) => power(c, trump) > top);
    return over.length ? over : hand;
  }
  return trumps;
}

/* ------------------------------------------------------------------ */
/* Announcements (الإعلانات)                                           */
/* ------------------------------------------------------------------ */

export const ANN_NAME: Record<MAnnKind, string> = { tierce: 'تيرس', quarte: 'كارت', quinte: 'سانك', carre: 'كاري' };

export interface Ann {
  kind: MAnnKind;
  cards: BCard[];
  /** a sequence's top card, or the rank of the four */
  top: BRank;
  /** a sequence's suit (null for a كاري) */
  suit: BSuit | null;
  points: number;
}

/** كاري: Jacks 200, 9s 150, A / 10 / K / Q 100 (8s and 7s don't count) */
const CARRE: Partial<Record<BRank, number>> = { J: 200, '9': 150, A: 100, '10': 100, K: 100, Q: 100 };
/** between two كاري of 100: A > 10 > K > Q */
const CARRE_ORDER: BRank[] = ['J', '9', 'A', '10', 'K', 'Q'];

export const annKey = (a: Ann) => `${a.kind}-${a.cards.map((c) => c.id).join('.')}`;

/**
 * Comparable strength: any كاري beats any sequence; then the longer sequence, then the higher top card
 * (natural order 7 8 9 10 J Q K A), then a sequence in the trump suit.
 */
export function annStrength(a: Ann, trump: BSuit | null): number {
  if (a.kind === 'carre') return 100_000 + (CARRE_ORDER.length - CARRE_ORDER.indexOf(a.top));
  return a.cards.length * 1000 + (B_RANKS.length - B_RANKS.indexOf(a.top)) * 10 + (a.suit === trump ? 1 : 0);
}

function candidates(hand: BCard[]): Ann[] {
  const out: Ann[] = [];
  for (const suit of B_SUITS) {
    // natural order, highest first: A K Q J 10 9 8 7
    const idx = hand.filter((c) => c.suit === suit).map((c) => B_RANKS.indexOf(c.rank)).sort((a, b) => a - b);
    for (let i = 0; i < idx.length; i++) {
      for (let j = i + 2; j < idx.length && idx[j] - idx[i] === j - i; j++) {
        const ranks = idx.slice(i, j + 1).map((k) => B_RANKS[k]);
        const len = ranks.length;
        out.push({
          kind: len === 3 ? 'tierce' : len === 4 ? 'quarte' : 'quinte',
          cards: ranks.map((r) => hand.find((c) => c.suit === suit && c.rank === r)!),
          top: ranks[0],
          suit,
          points: len === 3 ? 20 : len === 4 ? 50 : 100,
        });
      }
    }
  }
  for (const rank of CARRE_ORDER) {
    const four = hand.filter((c) => c.rank === rank);
    if (four.length === 4) out.push({ kind: 'carre', cards: four, top: rank, suit: null, points: CARRE[rank]! });
  }
  return out;
}

/** The best announcements in a hand: no card in two of them; the most points, then the strongest one. */
export function findAnnouncements(hand: BCard[], trump: BSuit | null): Ann[] {
  const all = candidates(hand);
  let best: Ann[] = [];
  let score = [0, 0];
  const walk = (from: number, used: Set<string>, chosen: Ann[]) => {
    const pts = chosen.reduce((t, a) => t + a.points, 0);
    const top = Math.max(0, ...chosen.map((a) => annStrength(a, trump)));
    if (pts > score[0] || (pts === score[0] && top > score[1])) {
      best = chosen.slice();
      score = [pts, top];
    }
    for (let i = from; i < all.length; i++) {
      const a = all[i];
      if (a.cards.some((c) => used.has(c.id))) continue;
      const next = new Set(used);
      for (const c of a.cards) next.add(c.id);
      walk(i + 1, next, [...chosen, a]);
    }
  };
  walk(0, new Set(), []);
  return best.sort((a, b) => annStrength(b, trump) - annStrength(a, trump));
}

/**
 * The team that scores its announcements: the one with the best single announcement; equal ones go to
 * the player closest to the dealer's right (`order`: dealer's right first).
 */
export function bestAnnSide(declared: { by: string; ann: Ann }[], order: string[], trump: BSuit | null, sideOf: (id: string) => BSide): BSide | null {
  let best: { by: string; ann: Ann } | null = null;
  for (const d of declared) {
    if (!best) best = d;
    else {
      const a = annStrength(d.ann, trump);
      const b = annStrength(best.ann, trump);
      if (a > b || (a === b && order.indexOf(d.by) < order.indexOf(best.by))) best = d;
    }
  }
  return best ? sideOf(best.by) : null;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export interface MaScoreInput {
  buyerSide: BSide;
  /** card points taken, the last trick's 10 included */
  cards: Record<BSide, number>;
  tricks: Record<BSide, number>;
  /** announcement points (only the best team has some) */
  ann: Record<BSide, number>;
  /** بلوط-ريبلوط points */
  belote: Record<BSide, number>;
  /** ليتيج points waiting from earlier hands */
  pot: number;
}

export interface MaScoreOutput {
  points: Record<BSide, number>;
  /** دخل: the taker's team did not score more than the opponents */
  failed: boolean;
  kaboot: BSide | null;
  /** ليتيج: equal totals */
  litige: boolean;
  /** the team that won the hand (null on a ليتيج) */
  winner: BSide | null;
  /** the waiting points this hand's winner took */
  potWon: number;
  /** the points still waiting after this hand */
  pot: number;
}

const other = (s: BSide): BSide => (s === 'A' ? 'B' : 'A');

/**
 * The points each team adds after a hand (raw points, no conversion):
 * - the taker's team scores more (tricks + announcements + belote): each team keeps its own points;
 * - otherwise (دخل): the opponents take 162 + every announcement, the taker's team keeps its belote;
 * - كابو: the team with all 8 tricks scores 252 + its announcements (all of them when it is the opponents', a دخل);
 * - ليتيج (equal totals): the opponents keep their points, the taker's points (belote aside) wait for the
 *   winner of the next decided hand; ties in a row add up.
 */
export function maScoreHand(x: MaScoreInput): MaScoreOutput {
  const buyer = x.buyerSide;
  const def = other(buyer);
  const allAnn = x.ann.A + x.ann.B;
  const points: Record<BSide, number> = { A: 0, B: 0 };
  const kaboot: BSide | null = x.tricks.A === 8 ? 'A' : x.tricks.B === 8 ? 'B' : null;
  let winner: BSide | null;
  let failed = false;
  let litige = false;
  let pot = x.pot;
  if (kaboot === buyer) {
    points[buyer] = MA_CAPOT + x.ann[buyer] + x.belote[buyer];
    points[def] = x.ann[def] + x.belote[def];
    winner = buyer;
  } else if (kaboot === def) {
    points[def] = MA_CAPOT + allAnn + x.belote[def];
    points[buyer] = x.belote[buyer];
    winner = def;
    failed = true;
  } else {
    const total = (s: BSide) => x.cards[s] + x.ann[s] + x.belote[s];
    if (total(buyer) > total(def)) {
      points[buyer] = total(buyer);
      points[def] = total(def);
      winner = buyer;
    } else if (total(buyer) < total(def)) {
      points[def] = MA_TOTAL + allAnn + x.belote[def];
      points[buyer] = x.belote[buyer];
      winner = def;
      failed = true;
    } else {
      points[def] = total(def);
      points[buyer] = x.belote[buyer];
      pot += x.cards[buyer] + x.ann[buyer];
      winner = null;
      litige = true;
    }
  }
  let potWon = 0;
  if (winner && pot > 0) {
    potWon = pot;
    points[winner] += pot;
    pot = 0;
  }
  return { points, failed, kaboot, litige, winner, potWon, pot };
}
