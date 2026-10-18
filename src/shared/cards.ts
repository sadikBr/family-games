/** The Moroccan / Spanish 40-card deck (ورق اللعب). Shared by app and server. */

export type Suit = 'coins' | 'cups' | 'swords' | 'clubs';

export interface Card {
  id: string; // e.g. "coins-7"
  suit: Suit;
  rank: number; // 1..7, 10, 11, 12
}

export const SUITS: Suit[] = ['coins', 'cups', 'swords', 'clubs'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/**
 * The suits by their traditional Moroccan names (kept as they are said, like «روندا»): `name` for a label
 * («حكم الكوباص», legends), `short` after a number («7 كوباص»).
 */
export const SUIT_INFO: Record<Suit, { name: string; short: string; emoji: string; color: string }> = {
  coins: { name: 'أوروص', short: 'أوروص', emoji: '🪙', color: '#C98A00' },
  cups: { name: 'الكوباص', short: 'كوباص', emoji: '🏆', color: '#D7263D' },
  swords: { name: 'شباضا', short: 'شباضا', emoji: '🗡️', color: '#2563EB' },
  clubs: { name: 'الباسطوص', short: 'باسطوص', emoji: '🪵', color: '#15803D' },
};

export const FIGURES: Record<number, { name: string; emoji: string }> = {
  10: { name: 'الخادم', emoji: '🧒' },
  11: { name: 'الفارس', emoji: '🐎' },
  12: { name: 'الملك', emoji: '👑' },
};

/** «7 كوباص», «الملك شباضا» */
export function cardName(c: Card): string {
  const r = FIGURES[c.rank]?.name ?? String(c.rank);
  return `${r} ${SUIT_INFO[c.suit].short}`;
}

export function makeDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })));
}

/** Position of a rank in the natural sequence (7 is followed by 10). */
export function rankIndex(rank: number): number {
  return RANKS.indexOf(rank);
}

/** Sort for displaying a hand: by suit, then rank. */
export function sortHand(cards: Card[]): Card[] {
  return cards
    .slice()
    .sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || rankIndex(a.rank) - rankIndex(b.rank));
}

/** Konkan meld: 3–4 cards of the same number, or 3+ consecutive cards of one suit. */
export function isKonkanMeld(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  if (cards.every((c) => c.rank === cards[0].rank)) return cards.length <= 4;
  if (!cards.every((c) => c.suit === cards[0].suit)) return false;
  const idx = cards.map((c) => rankIndex(c.rank)).sort((a, b) => a - b);
  return idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
}
