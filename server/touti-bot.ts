/**
 * «التوتي» — the bots: bidding from an estimate of what the hand (and an average partner) will take
 * with its best trump suit, pairs included; choosing that suit as the trump; card play that wins
 * cheaply, feeds points to a partner who holds the trick, pulls the opponents' trumps when buying,
 * never leads a 3 while its ace is out, and keeps a pair that can still be sung.
 */
import { SUITS, makeDeck, type Card, type Suit } from '../src/shared/cards';
import { cardPoints, power, singable, trickLeader, BID_MAX, BID_MIN, BID_STEP, SING_PLAIN_BID, SING_TRUMP_BID, PAIR, TRUMP_PAIR } from '../src/shared/touti-rules';

const DECK = makeDeck();

/**
 * About how many points (cards, the last trick and the pairs) the bidding team takes when this
 * hand bids with `trump`, assuming an average partner. Calibrated on bot-only deals (see touti.test.ts).
 */
export function handValue(hand: Card[], trump: Suit): number {
  let v = 30;
  const tr = hand.filter((c) => c.suit === trump);
  const has = (suit: Suit, rank: number) => hand.some((c) => c.suit === suit && c.rank === rank);
  // trumps: length and the top ones
  v += tr.length * 6;
  if (tr.length >= 4) v += (tr.length - 3) * 5;
  if (has(trump, 1)) v += 12;
  if (has(trump, 3)) v += has(trump, 1) ? 10 : tr.length >= 3 ? 6 : 3;
  if (has(trump, 12)) v += 2;
  if (has(trump, 11)) v += 1.5;
  for (const suit of SUITS) {
    if (suit === trump) continue;
    const cs = hand.filter((c) => c.suit === suit);
    if (has(suit, 1)) v += 11;
    if (has(suit, 3)) v += has(suit, 1) ? 8 : cs.length >= 3 ? 2 : 0;
    if (!cs.length && tr.length >= 2) v += 6;
    else if (cs.length === 1 && tr.length >= 3 && !has(suit, 1)) v += 2;
  }
  // pairs: a plain one with a bid of 80+, the trump one with 90+ (it takes tricks to sing them)
  for (const suit of SUITS) if (has(suit, 12) && has(suit, 11)) v += suit === trump ? TRUMP_PAIR * 0.8 : PAIR * 0.7;
  return v;
}

/** The best trump suit for a hand and what it is worth. */
export function bestTrump(hand: Card[]): { suit: Suit; value: number } {
  return SUITS.map((suit) => ({ suit, value: handValue(hand, suit) })).sort((a, b) => b.value - a.value)[0];
}

/**
 * A bot's call: the highest bid it believes in, in steps of 10, but only one step over the current
 * bid (so the auction climbs as it does at the table). Beginners are noisier and bolder.
 */
export function botBid(hand: Card[], bids: number[], level: number, noise: number, partnerHigh = false): number | 'pass' {
  if (!bids.length) return 'pass';
  const { suit, value } = bestTrump(hand);
  // a little under the estimate (a failed bid gives its value away); beginners are noisier and bolder
  const worth = value - 4 + (level < 2 ? noise * 12 + 6 : 0);
  const cap = Math.min(BID_MAX, Math.floor(worth / BID_STEP) * BID_STEP);
  const lowest = bids[0];
  if (cap < Math.max(BID_MIN, lowest)) return 'pass';
  // over the partner's bid only with a clearly better hand
  if (partnerHigh && cap < lowest + 2 * BID_STEP) return 'pass';
  // a hand counting on its pairs bids high enough to sing them (80 for a plain pair, 90 for the trump one)
  const pair = (s: Suit) => hand.some((c) => c.suit === s && c.rank === 12) && hand.some((c) => c.suit === s && c.rank === 11);
  if (pair(suit) && lowest < SING_TRUMP_BID && cap >= SING_TRUMP_BID) return SING_TRUMP_BID;
  if (SUITS.some((s) => s !== suit && pair(s)) && lowest < SING_PLAIN_BID && cap >= SING_PLAIN_BID) return SING_PLAIN_BID;
  return lowest;
}

export interface PlayInfo {
  hand: Card[];
  legal: Card[];
  trick: { by: string; card: Card }[];
  trump: Suit;
  /** cards of the tricks already finished this hand */
  played: Card[];
  /** my team bought */
  bidders: boolean;
  /** the contract (for the pairs still to sing) */
  bid: number;
  /** suits already sung by my team */
  sung: Suit[];
  level: number;
  /** a random number in [0, 1) */
  roll: number;
}

/** Would this card take the trick as it stands? */
function wins(trick: { card: Card }[], card: Card, trump: Suit) {
  return trickLeader([...trick, { card }], trump) === trick.length;
}

export function botPlay(x: PlayInfo): Card {
  const { hand, legal, trick, trump } = x;
  if (legal.length === 1) return legal[0];
  if (x.level < 2 && x.roll < 0.25) return legal[Math.floor(x.roll * 1000) % legal.length];
  const seen = new Set([...x.played, ...trick.map((t) => t.card), ...hand].map((c) => c.id));
  const unknown = DECK.filter((c) => !seen.has(c.id));
  // the highest card still out in its suit (mine included)
  const boss = (c: Card) => !unknown.some((u) => u.suit === c.suit && power(u) > power(c));
  const plain = (cs: Card[]) => cs.filter((c) => c.suit !== trump);
  // a pair I may still sing: keep both cards in hand while there is a choice
  const keep = new Set(x.bidders ? singable(hand, trump, x.bid, x.sung).flatMap((p) => hand.filter((c) => c.suit === p.suit && (c.rank === 12 || c.rank === 11)).map((c) => c.id)) : []);
  const kept = (cs: Card[]) => {
    const free = cs.filter((c) => !keep.has(c.id));
    return free.length ? free : cs;
  };
  const cheapest = (cs: Card[]) =>
    kept(cs)
      .slice()
      .sort((a, b) => cardPoints(a) - cardPoints(b) || Number(a.suit === trump) - Number(b.suit === trump) || power(a) - power(b))[0];

  const enemyTrumps = unknown.filter((c) => c.suit === trump).length;
  if (!trick.length) {
    // bidders pull trumps with the top trump
    if (x.bidders && enemyTrumps > 0) {
      const top = legal.find((c) => c.suit === trump && boss(c));
      if (top && !keep.has(top.id)) return top;
    }
    // a sure winner in a plain suit (an ace, or a 3 once the ace has gone)
    const sure = plain(legal)
      .filter((c) => boss(c) && !keep.has(c.id))
      .sort((a, b) => cardPoints(b) - cardPoints(a));
    if (sure.length && (enemyTrumps === 0 || x.bidders || sure[0].rank === 1)) return sure[0];
    // otherwise something cheap from a long plain suit; never a lone 3 / 1 that isn't the boss
    const pool = kept(plain(legal).length ? plain(legal) : legal);
    const len = (c: Card) => hand.filter((h) => h.suit === c.suit).length;
    const risky = (c: Card) => (cardPoints(c) >= 10 && !boss(c) ? 1 : 0);
    return pool.slice().sort((a, b) => risky(a) - risky(b) || cardPoints(a) - cardPoints(b) || len(b) - len(a) || power(a) - power(b))[0];
  }

  const pos = trick.length;
  const holder = trickLeader(trick, trump);
  const partnerHolds = pos >= 2 && holder === pos - 2;
  const last = pos === 3;
  const holderCard = trick[holder].card;
  const enemyCanTrump = holderCard.suit !== trump && enemyTrumps > 0;
  const partnerSafe = partnerHolds && (last || (boss(holderCard) && !enemyCanTrump) || (holderCard.suit === trump && boss(holderCard)));
  if (partnerSafe) {
    // feed points to the partner, but keep the big trumps
    const feed = kept(legal.filter((c) => c.suit !== trump || cardPoints(c) < 10));
    const pool = feed.length ? feed : legal;
    const giving = pool.filter((c) => !boss(c) || c.suit === trick[0].card.suit);
    return (giving.length ? giving : pool).slice().sort((a, b) => cardPoints(b) - cardPoints(a) || power(a) - power(b))[0];
  }
  const winners = legal.filter((c) => wins(trick, c, trump));
  const onTable = trick.reduce((t, p) => t + cardPoints(p.card), 0);
  if (winners.length && !(partnerHolds && !last && onTable < 10)) {
    const byCost = (cs: Card[]) =>
      kept(cs)
        .slice()
        .sort((a, b) => Number(a.suit === trump) - Number(b.suit === trump) || power(a) - power(b));
    if (last) return byCost(winners)[0];
    const sure = winners.filter((c) => boss(c) && (c.suit === trump || !enemyCanTrump));
    if (sure.length) return byCost(sure)[0];
    if (onTable >= 10) return winners.slice().sort((a, b) => power(b) - power(a))[0];
  }
  return cheapest(legal);
}
