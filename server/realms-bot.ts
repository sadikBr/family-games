/**
 * «الممالك الخمس» — the bots. Every decision is made from what the bot may know: its own hand, the
 * round's wild, the face-up pile (every thrown card was seen by all), and whether someone already went
 * out (its last turn).
 *
 * A hand is judged with the exact arrangement solver (src/shared/realms-rules.ts), counting pairs one
 * card short of a group at a share of their points and spare wilds almost free (they nearly always find
 * a place).
 * - expert: looks one draw ahead — for its best few throws, the judgement it can expect after the next
 *   card from the deck, over every card it hasn't seen (weighted by how many are left); takes the
 *   face-up card only when it beats that expectation; the pairs' share grows as the round goes on (late
 *   in a round only finished groups are safe); goes out at once; on its last turn (someone went out)
 *   only the real points count.
 * - smart: the same solver with a fixed judgement and no look ahead; takes the face-up card only for a
 *   wild or a card that finishes a group.
 * - easy: keeps the wilds and usually goes out when it can, but takes and throws cards loosely (often
 *   the dearest card that fits nowhere, sometimes any card).
 * All of it stays well under 200 ms (the solver is exact and memoised).
 */
import { REALM_SUITS, type RealmCard } from '../src/shared/games/realms';
import type { BotLevel } from '../src/shared/protocol';
import { MAX_RANK, MIN_RANK, arrange, cardPoints, isJoker, isWild, leftPoints, outCards, type SolveOptions } from '../src/shared/realms-rules';

export interface Seat {
  hand: RealmCard[];
  wild: number;
  top: RealmCard | null;
  /** someone went out: this is the bot's last turn */
  last: boolean;
  /** turns this bot already played this round */
  turns: number;
  /** cards dealt this round */
  dealt: number;
  /** the cards thrown face up this round (all players saw them) */
  seen?: RealmCard[];
  /** the cards this bot threw or took from the pile this round (it never takes one of them again: no endless swaps) */
  thrown?: string[];
}

export type BotMove = { type: 'drawDeck' } | { type: 'drawDiscard' } | { type: 'discard'; card: string } | { type: 'out'; card: string };

/** The smart bot's fixed judgement (exported for the tuning runs). */
export const SMART = { pair: 0.6, wildKeep: 0.3 };

/** The expert's tuning (exported for the tuning runs). */
export const EXPERT = { base: 0.4, grow: 0.18, max: 0.85, run: 0, gap: 0, wildKeep: 0.15, margin: 0.25, look: 6, budget: 80 };

/** The expert's judgement of a hand: how strongly a pair still counts against it. */
function pairShare(seat: Seat): number {
  // early in a round a pair is worth keeping; after a few turns (more for big hands) it's a liability
  const t = seat.turns / Math.max(2, seat.dealt / 2);
  return Math.min(EXPERT.max, EXPERT.base + EXPERT.grow * t);
}

function judge(level: BotLevel, seat: Seat): SolveOptions {
  if (seat.last) return { pair: 1, wildKeep: 1 };
  if (level !== 'expert') return { pair: SMART.pair, wildKeep: SMART.wildKeep };
  const p = pairShare(seat);
  return { pair: p, pairRun: Math.min(1, p + EXPERT.run), pairGap: Math.min(1, p + EXPERT.gap), wildKeep: EXPERT.wildKeep };
}

const dearest = (cards: RealmCard[], wild: number) => cards.slice().sort((a, b) => cardPoints(b, wild) - cardPoints(a, wild) || a.id.localeCompare(b.id))[0];

/* —— looking one draw ahead (expert) ————————————————————————————————————————————————— */

interface Unseen {
  /** natural card kinds still unseen, with how many */
  kinds: { card: RealmCard; n: number }[];
  /** wilds still unseen (the round's rank and the jokers) */
  wilds: number;
  total: number;
}

/** What may still come from the deck: the 116 cards minus my hand and the face-up pile. */
function unseen(seat: Seat, hand: RealmCard[]): Unseen {
  const { wild } = seat;
  const seenCount = new Map<string, number>();
  let seenWilds = 0;
  for (const c of [...hand, ...(seat.seen ?? [])]) {
    if (isWild(c, wild)) seenWilds++;
    else seenCount.set(`${c.suit}-${c.rank}`, (seenCount.get(`${c.suit}-${c.rank}`) ?? 0) + 1);
  }
  const kinds: Unseen['kinds'] = [];
  let total = 0;
  for (const suit of REALM_SUITS) {
    for (let r = MIN_RANK; r <= MAX_RANK; r++) {
      if (r === wild) continue;
      const n = Math.max(0, 2 - (seenCount.get(`${suit}-${r}`) ?? 0));
      if (n) kinds.push({ card: { id: `probe-${suit}-${r}`, suit, rank: r }, n });
      total += n;
    }
  }
  const wildRankCards = wild >= MIN_RANK && wild <= MAX_RANK ? 10 : 0;
  const wilds = Math.max(0, wildRankCards + 6 - seenWilds);
  return { kinds, wilds, total: total + wilds };
}

/** The judgement to expect after one more card from the deck (and the best throw then). */
function afterDraw(hand: RealmCard[], seat: Seat, opts: SolveOptions, u: Unseen): number {
  const { wild } = seat;
  const base = leftPoints(hand, wild, opts);
  if (!u.total) return base;
  const drop = { ...opts, drop: true };
  const nats = hand.filter((c) => !isWild(c, wild));
  let sum = 0;
  for (const k of u.kinds) {
    const x = k.card;
    // a card that pairs with nothing is simply thrown back: the hand stays as it is
    const related = nats.some((c) => c.rank === x.rank || (c.suit === x.suit && Math.abs(c.rank - x.rank) <= 2));
    sum += k.n * (related ? leftPoints([...hand, x], wild, drop) : base);
  }
  if (u.wilds) {
    const probe: RealmCard = wild >= MIN_RANK && wild <= MAX_RANK ? { id: 'probe-wild', suit: 'sun', rank: wild } : { id: 'probe-joker', suit: null, rank: 0 };
    sum += u.wilds * leftPoints([...hand, probe], wild, drop);
  }
  return sum / u.total;
}

/* —— the moves ——————————————————————————————————————————————————————————————————— */

/** Draw from the deck or take the face-up card? */
export function botDraw(seat: Seat, level: BotLevel, rand: () => number = Math.random): BotMove {
  const { hand, wild, top } = seat;
  if (!top || seat.thrown?.includes(top.id)) return { type: 'drawDeck' };
  if (isWild(top, wild)) return level === 'easy' && rand() < 0.2 ? { type: 'drawDeck' } : { type: 'drawDiscard' };
  if (level === 'easy') {
    const match = hand.some((c) => !isWild(c, wild) && (c.rank === top.rank || (c.suit === top.suit && Math.abs(c.rank - top.rank) === 1)));
    return match && rand() < 0.6 ? { type: 'drawDiscard' } : { type: 'drawDeck' };
  }
  const withTop = [...hand, top];
  if (level === 'smart' || seat.last) {
    // only a card that makes the real points go down (the face-up card can't be thrown straight back)
    let exact = Infinity;
    for (const c of hand) exact = Math.min(exact, leftPoints(withTop.filter((x) => x !== c), wild));
    return exact < leftPoints(hand, wild) - 1e-9 ? { type: 'drawDiscard' } : { type: 'drawDeck' };
  }
  const opts = judge(level, seat);
  let after = Infinity;
  for (const c of hand) after = Math.min(after, leftPoints(withTop.filter((x) => x !== c), wild, opts));
  const deck = afterDraw(hand, seat, opts, unseen(seat, withTop));
  return after < deck - EXPERT.margin ? { type: 'drawDiscard' } : { type: 'drawDeck' };
}

/** Which card to throw (or go out with). `taken`: the card just taken from the discard pile, if any. */
export function botThrow(seat: Seat, level: BotLevel, taken: string | null = null, rand: () => number = Math.random): BotMove {
  const { hand, wild } = seat;
  const outs = outCards(hand, wild).filter((id) => id !== taken);
  if (outs.length && !(level === 'easy' && !seat.last && rand() < 0.25)) {
    // a natural card if possible (a wild thrown would help the next player), the dearest
    const list = hand.filter((c) => outs.includes(c.id));
    const card = dearest(list.some((c) => !isWild(c, wild)) ? list.filter((c) => !isWild(c, wild)) : list, wild);
    return { type: 'out', card: card.id };
  }
  if (level === 'easy') {
    const natural = hand.filter((c) => !isWild(c, wild) && c.id !== taken);
    const pool = natural.length ? natural : hand.filter((c) => c.id !== taken);
    if (rand() < 0.3) return { type: 'discard', card: pool[Math.floor(rand() * pool.length)].id };
    // the dearest card that fits nowhere (or the dearest natural card)
    const loose = arrange(hand, wild).left.filter((c) => pool.includes(c));
    return { type: 'discard', card: dearest(loose.length ? loose : pool, wild).id };
  }
  const opts = judge(level, seat);
  // never throw back the card just taken (it was taken to be kept), nor a wild while a natural card can go
  const free = hand.filter((c) => c.id !== taken);
  const pool = free.filter((c) => !isWild(c, wild));
  const candidates = pool.length ? pool : free;
  // one card of each kind (the two copies of a card, two jokers: the same throw)
  const kinds = new Map<string, RealmCard>();
  for (const c of candidates) {
    const k = isJoker(c) ? 'J' : `${c.suit}-${c.rank}`;
    if (!kinds.has(k)) kinds.set(k, c);
  }
  const ranked = [...kinds.values()]
    .map((c) => ({ c, v: leftPoints(hand.filter((x) => x !== c), wild, opts) }))
    .sort((a, b) => a.v - b.v || cardPoints(b.c, wild) - cardPoints(a.c, wild));
  if (level !== 'expert' || seat.last || ranked.length < 2) return { type: 'discard', card: ranked[0].c.id };
  // expert: the best few throws, judged by what the next card from the deck should make of the hand
  const u = unseen(seat, hand);
  let pick = ranked[0];
  let best = Infinity;
  const t0 = Date.now();
  for (const r of ranked.slice(0, EXPERT.look)) {
    // (a time budget: a busy server still answers fast; the first candidates are the likeliest)
    if (best < Infinity && Date.now() - t0 > EXPERT.budget) break;
    const v = afterDraw(hand.filter((x) => x !== r.c), seat, opts, u);
    if (v < best - 1e-9) {
      best = v;
      pick = r;
    }
  }
  return { type: 'discard', card: pick.c.id };
}
