/**
 * «التوتي» — the rules shared by the server and the app: card order and points, what may be played,
 * who takes a trick, the «غناء» pairs and the scoring of a hand. The cards are the 40 of the Moroccan
 * deck (src/shared/cards.ts): 1–7, 10 (الخادم), 11 (الفارس), 12 (الملك) in the four suits.
 */
import { SUITS, SUIT_INFO, type Card, type Suit } from './cards';

/** order inside every suit, trump or not: 1 > 3 > 12 > 11 > 10 > 7 > 6 > 5 > 4 > 2 */
export const T_ORDER = [1, 3, 12, 11, 10, 7, 6, 5, 4, 2];
/** card points: 1 = 11, 3 = 10, 12 = 4, 11 = 3, 10 = 2, the rest 0 (120 in the deck) */
export const T_POINTS: Record<number, number> = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };
/** the last trick («الدير») */
export const T_LAST = 10;
/** 120 in the cards + 10 for the last trick */
export const T_TABLE = 130;
export const BID_MIN = 70;
export const BID_MAX = 230;
export const BID_STEP = 10;
/** a pair of 12 + 11 of one suit; of the trump suit it is worth 40 */
export const PAIR = 20;
export const TRUMP_PAIR = 40;
/** the bid needed to sing a plain pair / the trump pair */
export const SING_PLAIN_BID = 80;
export const SING_TRUMP_BID = 90;
export const TRICKS = 10;

export type TSide = 'A' | 'B';

/** strength inside a suit (higher wins) */
export const power = (c: Card) => T_ORDER.length - T_ORDER.indexOf(c.rank);
export const cardPoints = (c: Card) => T_POINTS[c.rank] ?? 0;
export const suitName = (s: Suit) => SUIT_INFO[s].name;
/** «7 كوباص» — after a number the article is dropped */
export const cardLabel = (c: Card) => `${c.rank} ${SUIT_INFO[c.suit].short}`;

/** My hand for display: by suit (trumps first), strongest first. */
export function sortTouti(hand: Card[], trump: Suit | null): Card[] {
  const order = trump ? [trump, ...SUITS.filter((s) => s !== trump)] : SUITS;
  return hand.slice().sort((a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || power(b) - power(a));
}

/** Index (in `trick`) of the card that holds the trick: the highest trump, otherwise the highest of the suit led. */
export function trickLeader(trick: { card: Card }[], trump: Suit | null): number {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const a = trick[i].card;
    const b = trick[best].card;
    if (a.suit === b.suit ? power(a) > power(b) : a.suit === trump) best = i;
  }
  return best;
}

export interface LegalRules {
  /** when the partner holds the trick, a player without the suit led may play anything */
  partnerFree: boolean;
}

/**
 * The cards I may play: follow the suit led if you can (any card of it); without it you must trump,
 * and over a trump already on the table if you can (a lower trump if you can't); with neither the suit
 * nor a trump, any card. With `partnerFree`, a player without the suit led plays anything while their
 * partner holds the trick.
 */
export function legalCards(hand: Card[], trick: { card: Card }[], trump: Suit, rules: LegalRules): Card[] {
  if (!trick.length) return hand;
  const led = trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  if (follow.length) return follow;
  const trumps = hand.filter((c) => c.suit === trump);
  if (!trumps.length) return hand;
  const pos = trick.length;
  if (rules.partnerFree && pos >= 2 && trickLeader(trick, trump) === pos - 2) return hand;
  const top = Math.max(0, ...trick.filter((t) => t.card.suit === trump).map((t) => power(t.card)));
  if (top > 0) {
    const over = trumps.filter((c) => power(c) > top);
    if (over.length) return over;
  }
  return trumps;
}

/** Why a card may not be played (the duty in words). */
export function illegalReason(hand: Card[], trick: { card: Card }[], trump: Suit): string {
  const led = trick[0]?.card.suit;
  if (led && hand.some((c) => c.suit === led)) return 'يجب أن تتبع الشكل المطلوب';
  const trumpOnTable = trick.some((t) => t.card.suit === trump);
  return trumpOnTable ? 'يجب أن تقطع بطرونفو أعلى إن استطعت' : 'يجب أن تقطع بالطرونفو';
}

/* ------------------------------------------------------------------ */
/* «الغناء»: 12 + 11 of one suit                                       */
/* ------------------------------------------------------------------ */

export interface Pair {
  suit: Suit;
  points: number;
}

/** The pairs a player of the bidding team may sing now (both cards still in hand, not sung yet, the bid high enough). */
export function singable(hand: Card[], trump: Suit, bid: number, sung: Suit[]): Pair[] {
  const out: Pair[] = [];
  for (const suit of SUITS) {
    if (sung.includes(suit)) continue;
    if (!hand.some((c) => c.suit === suit && c.rank === 12) || !hand.some((c) => c.suit === suit && c.rank === 11)) continue;
    if (suit === trump ? bid < SING_TRUMP_BID : bid < SING_PLAIN_BID) continue;
    out.push({ suit, points: suit === trump ? TRUMP_PAIR : PAIR });
  }
  return out.sort((a, b) => b.points - a.points);
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export interface ToutiScore {
  /** what the bidding team made: card points + the last trick + the pairs sung */
  made: number;
  /** the bid was reached */
  success: boolean;
  /** what each team adds to its score: the bid, to the bidders or (failed) to the defenders */
  points: Record<TSide, number>;
}

export function scoreHand(x: { bidSide: TSide; bid: number; cards: Record<TSide, number>; sung: number }): ToutiScore {
  const made = x.cards[x.bidSide] + x.sung;
  const success = made >= x.bid;
  const def: TSide = x.bidSide === 'A' ? 'B' : 'A';
  const points: Record<TSide, number> = { A: 0, B: 0 };
  points[success ? x.bidSide : def] = x.bid;
  return { made, success, points };
}
