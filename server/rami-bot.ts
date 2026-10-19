/**
 * «الرامي» bots, at the room's three strengths:
 * - easy: plays legal, simple moves (keeps pairs and neighbours, now and then throws a random loose
 *   card, rarely takes the discard, never swaps a joker back);
 * - smart: lays down as soon as it can, adds to the table, swaps jokers back, keeps the cards that sit
 *   well together and never throws a card that fits a meld on the table;
 * - expert: counts the cards it has seen (both decks) to value each loose card by how many cards could
 *   still complete it, keeps its jokers off the table (an opponent could swap them out), watches what
 *   the next player picks up and throws away and never feeds them, takes the discard only when it
 *   really helps (سامبل), and waits one turn for a «رامي سيك» when two cards stand between it and
 *   going out at once and no one is close to going out.
 * Everything works on a `Seat`: what that player may know (their hand and the public table).
 */
import type { RCard, RMeld } from '../src/shared/games/rami';
import type { BotLevel } from '../src/shared/protocol';
import { R_SUITS, addToMeld, findLay, fitsTable, isJoker, slotValue, swapIndex } from '../src/shared/rami-rules';

export type BotAction = { type: string; [k: string]: unknown };

/** What one player knows at their turn. */
export interface Seat {
  me: string;
  hand: RCard[];
  melds: RMeld[];
  /** players down this round → their first laydown */
  openings: Record<string, number>;
  counts: Record<string, number>;
  talaj: boolean;
  /** least value of a first laydown now (Infinity in سامبل) */
  need: number;
  /** the card taken from the discard pile this turn */
  taken: string | null;
  /** التلّاج: that card must still go down */
  mustUse: boolean;
  top: RCard | null;
  /** the discard may be taken now (all the rules checked) */
  canTake: boolean;
  /** the player after me (the only one who can take what I throw) */
  next: string;
  others: string[];
  /** cards each player took from the discard pile this round */
  picked: Record<string, RCard[]>;
  /** cards each player threw this round */
  thrown: Record<string, RCard[]>;
  /** the cards in the discard pile now */
  pile: RCard[];
  stockLeft: number;
}

const opened = (b: Seat) => b.me in b.openings;
const keyOf = (suit: string | null, rank: number) => `${suit}${rank === 14 ? 1 : rank}`;

/** How many copies of each card (suit + rank) are still unseen by this player (two decks: 0–2). */
function unseenCounter(b: Seat): (suit: string, rank: number) => number {
  const seen = new Map<string, number>();
  const ids = new Set<string>();
  const add = (c: RCard) => {
    if (ids.has(c.id) || isJoker(c)) return;
    ids.add(c.id);
    const k = keyOf(c.suit, c.rank);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  };
  b.hand.forEach(add);
  b.pile.forEach(add);
  for (const m of b.melds) for (const s of m.slots) add(s.card);
  for (const id of b.others) (b.picked[id] ?? []).forEach(add);
  return (suit, rank) => (rank < 1 || rank > 14 ? 0 : Math.max(0, 2 - (seen.get(keyOf(suit, rank)) ?? 0)));
}

/** Simple: how well a card sits with the rest of the hand (pairs, neighbours). Used by easy and smart. */
export function keepScore(card: RCard, hand: RCard[]): number {
  if (isJoker(card)) return 100;
  let k = 0;
  for (const c of hand) {
    if (c.id === card.id || isJoker(c)) continue;
    if (c.rank === card.rank && c.suit !== card.suit) k += 3;
    if (c.suit === card.suit) {
      const d = Math.min(Math.abs(c.rank - card.rank), card.rank === 1 ? Math.abs(c.rank - 14) : 99, c.rank === 1 ? Math.abs(14 - card.rank) : 99);
      if (d === 1) k += 3;
      else if (d === 2) k += 1;
    }
  }
  return k;
}

/** The ranks a card can stand at in a run (an ace: low and high). */
const posOf = (c: RCard) => (c.rank === 1 ? [1, 14] : [c.rank]);

/**
 * Expert: what a loose card is worth keeping — its links with the other loose cards, weighed by how
 * many cards that would complete them are still unseen, and whether it extends a meld in hand.
 */
function expertKeep(card: RCard, loose: RCard[], melds: RCard[][], b: Seat, unseen: (s: string, r: number) => number): number {
  if (isJoker(card)) return 1000;
  const s = card.suit!;
  const jokers = b.hand.filter(isJoker).length;
  let k = 0;
  // a set in the making
  const mates = loose.filter((c) => c.id !== card.id && !isJoker(c) && c.rank === card.rank && c.suit !== s);
  const suits = new Set([s, ...mates.map((c) => c.suit!)]);
  if (suits.size >= 2) {
    const outs = R_SUITS.filter((x) => !suits.has(x)).reduce((t, x) => t + unseen(x, card.rank), 0);
    k += 2 + 0.9 * outs + (jokers ? 2 : 0);
  }
  // a run in the making
  for (const p of posOf(card)) {
    for (const c of loose) {
      if (c.id === card.id || isJoker(c) || c.suit !== s) continue;
      for (const q of posOf(c)) {
        const d = Math.abs(p - q);
        if (d === 1) {
          const lo = Math.min(p, q);
          const outs = unseen(s, lo - 1) + unseen(s, lo + 2);
          k += 2 + 0.9 * outs + (jokers ? 2 : 0);
        } else if (d === 2) {
          k += 1 + 0.9 * unseen(s, Math.min(p, q) + 1) + (jokers ? 1.5 : 0);
        }
      }
    }
  }
  // it extends one of my melds (it goes down as soon as I'm down)
  for (const m of melds) {
    const slots = m.map((c) => ({ card: c, rank: c.rank, suit: c.suit }));
    const kind = m.every((c) => isJoker(c) || c.rank === m.find((x) => !isJoker(x))!.rank) ? 'set' : 'run';
    if (kind === 'set' && m.length < 4 && !m.some((c) => c.suit === s) && card.rank === m.find((x) => !isJoker(x))!.rank) k += 5;
    if (kind === 'run' && slots.some((x) => x.suit === s)) {
      const ranks = m.filter((c) => !isJoker(c)).flatMap(posOf);
      if (posOf(card).some((p) => ranks.some((r) => Math.abs(r - p) === 1))) k += 3;
    }
  }
  // before the first laydown of التلّاج, high cards help reach 71
  if (b.talaj && !opened(b)) k += slotValue('set', card.rank) / 4;
  return k;
}

/** Expert: how much the next player would like this card (higher = never throw it). */
function danger(card: RCard, b: Seat): number {
  const n = b.next;
  const theirs = b.counts[n] ?? 14;
  let d = 0;
  if (n in b.openings && theirs > 1 && fitsTable(card, b.melds)) d += 4 + (theirs <= 4 ? 4 : 0);
  for (const p of b.picked[n] ?? []) {
    if (isJoker(p)) continue;
    if (p.rank === card.rank && p.suit !== card.suit) d += 2.5;
    if (p.suit === card.suit && Math.abs(p.rank - card.rank) <= 2 && p.rank !== card.rank) d += 2;
  }
  for (const t of b.thrown[n] ?? []) {
    if (isJoker(t)) continue;
    if (t.rank === card.rank) d -= 1;
    else if (t.suit === card.suit && Math.abs(t.rank - card.rank) === 1) d -= 0.5;
  }
  if (theirs <= 4) d *= 1.5;
  return Math.max(-1.5, d);
}

const rand = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** The card to throw away. */
export function botDiscard(b: Seat, level: BotLevel): RCard {
  const hand = b.hand;
  const pool = hand.filter((c) => c.id !== b.taken || hand.length === 1);
  const throwable = pool.some((c) => !isJoker(c)) ? pool.filter((c) => !isJoker(c)) : pool;
  if (level === 'easy') {
    const sorted = throwable.slice().sort((x, y) => keepScore(x, hand) - keepScore(y, hand));
    return Math.random() < 0.35 ? rand(throwable) : rand(sorted.slice(0, 3));
  }
  const fits = (c: RCard) => fitsTable(c, b.melds);
  const early = b.talaj && !opened(b);
  if (level === 'smart') {
    return throwable
      .slice()
      .sort(
        (x, y) =>
          Number(fits(x)) - Number(fits(y)) ||
          keepScore(x, hand) - keepScore(y, hand) ||
          (early ? slotValue('set', x.rank) - slotValue('set', y.rank) : 0) ||
          x.id.localeCompare(y.id),
      )[0];
  }
  // expert: the loose cards (outside the best melds in hand) first, by what they're worth keeping
  const unseen = unseenCounter(b);
  const melds = findLay(hand, { opened: true, need: 0 }) ?? [];
  const inMeld = new Set(melds.flat().map((c) => c.id));
  const loose = hand.filter((c) => !inMeld.has(c.id));
  const looseThrowable = throwable.filter((c) => !inMeld.has(c.id));
  const pick = looseThrowable.length ? looseThrowable : throwable;
  const score = (c: RCard) => expertKeep(c, inMeld.has(c.id) ? hand : loose, melds, b, unseen) + (inMeld.has(c.id) ? 8 : 0) + danger(c, b);
  return pick.slice().sort((x, y) => score(x) - score(y) || x.id.localeCompare(y.id))[0];
}

/** Draw from the stock or take the discard? */
export function botDraw(b: Seat, level: BotLevel): 'drawStock' | 'drawDiscard' {
  if (!b.canTake || !b.top) return 'drawStock';
  const top = b.top;
  if (level === 'easy') return b.talaj && Math.random() < 0.5 ? 'drawDiscard' : 'drawStock';
  if (b.talaj) {
    if (level === 'smart') return 'drawDiscard';
    // expert: before the first laydown, only if laying down now is wise (not when waiting for a «رامي سيك»)
    if (!opened(b)) {
      const lay = findLay([...b.hand, top], { opened: false, need: b.need, mustInclude: top.id });
      return lay && !holdForSec(b, [...b.hand, top], lay) ? 'drawDiscard' : 'drawStock';
    }
    // once down: a card that only fits by putting a joker on the table isn't worth it
    if (fitsTable(top, b.melds)) return 'drawDiscard';
    const lay = findLay([...b.hand, top], { opened: true, need: 0, mustInclude: top.id });
    return lay && lay.some((g) => g.some((c) => c.id === top.id) && !g.some(isJoker)) ? 'drawDiscard' : 'drawStock';
  }
  // سامبل: take it when it goes out now, or clearly beats my weakest card
  if (findLay([...b.hand, top], { opened: false, need: Infinity, mustInclude: top.id })) return 'drawDiscard';
  if (isJoker(top)) return 'drawDiscard';
  if (level === 'smart') return keepScore(top, b.hand) >= 6 ? 'drawDiscard' : 'drawStock';
  const hand = [...b.hand, top];
  const unseen = unseenCounter({ ...b, hand });
  const melds = findLay(hand, { opened: true, need: 0 }) ?? [];
  const inMeld = new Set(melds.flat().map((c) => c.id));
  const loose = hand.filter((c) => !inMeld.has(c.id));
  if (inMeld.has(top.id)) return 'drawDiscard';
  const worth = (c: RCard) => expertKeep(c, loose, melds, { ...b, hand }, unseen);
  const weakest = Math.min(...loose.filter((c) => c.id !== top.id && !isJoker(c)).map(worth));
  return worth(top) > weakest + 4 ? 'drawDiscard' : 'drawStock';
}

/**
 * Expert: hold a first laydown back one more turn, hoping for a «رامي سيك»? Only when two cards stand
 * between it and going out at once, those two can still be completed, and nobody is close to going out.
 */
function holdForSec(b: Seat, hand: RCard[], lay: RCard[][]): boolean {
  const used = new Set(lay.flat().map((c) => c.id));
  const left = hand.filter((c) => !used.has(c.id));
  if (left.length !== 2 || b.mustUse) return false;
  if (b.stockLeft < 12) return false;
  if (b.others.some((id) => id in b.openings && (b.counts[id] ?? 14) <= 6)) return false;
  const unseen = unseenCounter({ ...b, hand });
  const [x, y] = left;
  if (isJoker(x) || isJoker(y)) return true;
  if (x.rank === y.rank && x.suit !== y.suit) return R_SUITS.filter((s) => s !== x.suit && s !== y.suit).reduce((t, s) => t + unseen(s, x.rank), 0) >= 2;
  if (x.suit === y.suit) {
    const d = Math.abs(x.rank - y.rank);
    const lo = Math.min(x.rank, y.rank);
    if (d === 1) return unseen(x.suit!, lo - 1) + unseen(x.suit!, lo + 2) >= 2;
    if (d === 2) return unseen(x.suit!, lo + 1) >= 2;
  }
  return false;
}

/** The bot's next move in its play step (null: time to discard). */
export function botPlay(b: Seat, level: BotLevel): BotAction | null {
  const hand = b.hand;
  const must = b.mustUse ? b.taken : null;
  if (opened(b)) {
    // the taken card first: in place of a joker, onto the table, or in a new meld
    if (must) {
      const card = hand.find((c) => c.id === must)!;
      const sw = b.melds.find((m) => swapIndex(m, card) >= 0);
      if (sw) return { type: 'swap', meld: sw.id, card: card.id };
      const add = b.melds.find((m) => addToMeld(m, [card]) !== null);
      if (add) return { type: 'add', meld: add.id, cards: [card.id] };
      const lay = findLay(hand, { opened: true, need: 0, mustInclude: must });
      if (lay) return { type: 'lay', groups: lay.map((g) => g.map((c) => c.id)) };
      return { type: 'forfeit' };
    }
    // a joker comes back to the hand when a natural card can take its place
    if (level !== 'easy') {
      for (const c of hand) {
        const m = b.melds.find((x) => swapIndex(x, c) >= 0);
        if (m) return { type: 'swap', meld: m.id, card: c.id };
      }
    }
    const lay = findLay(hand, { opened: true, need: 0 });
    if (lay) {
      // expert: a joker stays in hand while nobody is close to going out (on the table anyone could swap it out)
      const calm = b.others.every((id) => (b.counts[id] ?? 14) >= 6);
      const groups = level === 'expert' && calm && hand.length - lay.flat().length > 1 ? lay.filter((g) => !g.some(isJoker)) : lay;
      if (groups.length) return { type: 'lay', groups: groups.map((g) => g.map((c) => c.id)) };
    }
    // add cards to the table (easy: only to its own melds); a joker only to go out
    const order = hand.slice().sort((x, y) => Number(isJoker(x)) - Number(isJoker(y)));
    for (const c of order) {
      if (isJoker(c) && hand.length > 2) continue;
      const m = b.melds.find((x) => (level !== 'easy' || x.owner === b.me) && addToMeld(x, [c]) !== null);
      if (m && (hand.length > 1 || c.id !== b.taken)) return { type: 'add', meld: m.id, cards: [c.id] };
    }
    return null;
  }
  const lay = findLay(hand, { opened: false, need: b.need, mustInclude: must });
  if (lay) {
    if (level === 'expert' && !must && holdForSec(b, hand, lay)) return null;
    return { type: 'lay', groups: lay.map((g) => g.map((c) => c.id)) };
  }
  if (must) return { type: 'forfeit' };
  return null;
}
