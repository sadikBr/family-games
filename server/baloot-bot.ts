/**
 * «البلوط» — the simple bots (easy level, timeouts): hand strengths (the purchases themselves are in
 * ./ai/baloot-mind.ts), doubling only with a strong hand, and card play that follows the partner, wins cheaply, feeds points to a partner
 * who holds the trick, keeps its trumps and pulls the opponents' trumps when it buys.
 */
import type { BCard, BalootRaise, BMode, BSuit } from '../src/shared/games/baloot';
import { B_SUITS, cardValue, findProjects, isBoss, makeBalootDeck, power, projectPoints, trickLeader, type Played } from '../src/shared/baloot-rules';

const DECK = makeBalootDeck();

/** How good a hand is for a حكم in `trump` (the simple doubling decisions; purchases: ./ai/baloot-bid.ts). */
export function hokmStrength(cards: BCard[], trump: BSuit): number {
  const tr = cards.filter((c) => c.suit === trump);
  let s = 0;
  const TV: Record<string, number> = { J: 4, '9': 3, A: 2, '10': 1.5, K: 1, Q: 1, '8': 0.6, '7': 0.6 };
  for (const c of tr) s += TV[c.rank];
  if (tr.length >= 3) s += (tr.length - 2) * 0.8;
  if (tr.length <= 1) s -= 2;
  for (const c of cards) {
    if (c.suit === trump) continue;
    if (c.rank === 'A') s += 1.5;
    else if (c.rank === '10') s += cards.some((x) => x.suit === c.suit && x.rank === 'A') ? 0.8 : 0.3;
  }
  for (const p of findProjects(cards, 'hokm')) s += projectPoints(p.kind, 'hokm') * 0.3;
  return s;
}

/** How good a hand is for صن (about 9 is worth buying). */
export function sunStrength(cards: BCard[]): number {
  let s = 0;
  for (const suit of B_SUITS) {
    const cs = cards.filter((c) => c.suit === suit);
    const has = (r: string) => cs.some((c) => c.rank === r);
    if (has('A')) s += 3;
    if (has('10')) s += has('A') ? 2 : cs.length >= 3 ? 0.8 : 0.3;
    if (has('K')) s += has('A') || has('10') ? 0.7 : 0.2;
    if (cs.length >= 4 && has('A')) s += 1;
  }
  for (const p of findProjects(cards, 'sun')) s += projectPoints(p.kind, 'sun') * 0.25;
  return s;
}

/** Strength of a defender against a حكم (for «دبل» / «فور»). */
function defenceStrength(cards: BCard[], trump: BSuit): number {
  let s = 0;
  const TV: Record<string, number> = { J: 3, '9': 2.5, A: 1.5, '10': 1, K: 0.7, Q: 0.7, '8': 0.7, '7': 0.7 };
  for (const c of cards) s += c.suit === trump ? TV[c.rank] : c.rank === 'A' ? 1.2 : 0;
  return s;
}

export function botRaise(hand: BCard[], mode: BMode, trump: BSuit | null, step: BalootRaise, level: number): boolean {
  if (level < 2 && step !== 'double') return false;
  if (mode === 'sun') return step === 'double' && sunStrength(hand) >= (level < 2 ? 18 : 15);
  const t = trump!;
  if (step === 'double') return defenceStrength(hand, t) >= (level < 2 ? 9 : 7);
  if (step === 'triple') return hokmStrength(hand, t) >= 13;
  if (step === 'four') return defenceStrength(hand, t) >= 9.5;
  return hokmStrength(hand, t) >= 17;
}

export interface PlayInfo {
  hand: BCard[];
  legal: BCard[];
  trick: Played[];
  trump: BSuit | null;
  /** cards of the tricks already finished this hand */
  played: BCard[];
  /** my team bought */
  buyers: boolean;
  level: number;
  /** a random number in [0, 1) */
  roll: number;
}

const cheapest = (cs: BCard[], trump: BSuit | null) =>
  cs.slice().sort((a, b) => cardValue(a, trump) - cardValue(b, trump) || Number(a.suit === trump) - Number(b.suit === trump) || power(a, trump) - power(b, trump))[0];

/** Would this card take the trick as it stands? */
function wins(trick: Played[], card: BCard, trump: BSuit | null) {
  return trickLeader([...trick, { by: '', card }], trump) === trick.length;
}

export function botPlay(x: PlayInfo): BCard {
  const { hand, legal, trick, trump } = x;
  if (legal.length === 1) return legal[0];
  // the easy level slips now and then the way people do (a card played without counting, a wrong
  // guess of who holds what) — never by throwing away the J / 9 of trumps or a side ace that takes the trick
  if (x.level < 2 && x.roll < 0.2) {
    const slips = legal.filter((c) => !(c.suit === trump && (c.rank === 'J' || c.rank === '9')) && !(c.suit !== trump && c.rank === 'A' && (!trick.length || wins(trick, c, trump))));
    if (slips.length) return slips[Math.floor(x.roll * 5000) % slips.length];
  }
  const seen = new Set([...x.played, ...trick.map((t) => t.card), ...hand].map((c) => c.id));
  const unknown = DECK.filter((c) => !seen.has(c.id));
  const boss = (c: BCard) => isBoss(c, [...unknown, ...hand], trump);
  const plain = (cs: BCard[]) => cs.filter((c) => c.suit !== trump);

  if (!trick.length) {
    const enemyTrumps = trump ? unknown.filter((c) => c.suit === trump).length : 0;
    // buyers pull trumps with the top trump
    if (trump && x.buyers && enemyTrumps > 0) {
      const top = legal.find((c) => c.suit === trump && boss(c));
      if (top) return top;
    }
    // a sure winner in a plain suit (an ace, or «إكة»)
    const sure = plain(legal).filter(boss).sort((a, b) => cardValue(b, trump) - cardValue(a, trump));
    if (sure.length && (!trump || enemyTrumps === 0 || x.buyers || sure[0].rank === 'A')) return sure[0];
    // otherwise something cheap from a long plain suit, keeping unguarded tens
    const pool = plain(legal).length ? plain(legal) : legal;
    const len = (c: BCard) => hand.filter((h) => h.suit === c.suit).length;
    return pool
      .slice()
      .sort((a, b) => cardValue(a, trump) - cardValue(b, trump) || len(b) - len(a) || power(a, trump) - power(b, trump))[0];
  }

  const pos = trick.length;
  const holder = trickLeader(trick, trump);
  const partnerHolds = pos >= 2 && holder === pos - 2;
  const last = pos === 3;
  const holderCard = trick[holder].card;
  const enemyCanTrump = !!trump && holderCard.suit !== trump && unknown.some((c) => c.suit === trump);
  const partnerSafe = partnerHolds && (last || (boss(holderCard) && !enemyCanTrump));
  if (partnerSafe) {
    // feed points to the partner, but keep the big trumps
    const feed = legal.filter((c) => c.suit !== trump || cardValue(c, trump) < 10);
    const pool = feed.length ? feed : legal;
    const giving = pool.filter((c) => !boss(c) || c.suit === trick[0].card.suit);
    return (giving.length ? giving : pool).slice().sort((a, b) => cardValue(b, trump) - cardValue(a, trump) || power(a, trump) - power(b, trump))[0];
  }
  const winners = legal.filter((c) => wins(trick, c, trump));
  const onTable = trick.reduce((t, p) => t + cardValue(p.card, trump), 0);
  if (winners.length && !(partnerHolds && !last && onTable < 10)) {
    const byCost = (cs: BCard[]) => cs.slice().sort((a, b) => Number(a.suit === trump) - Number(b.suit === trump) || power(a, trump) - power(b, trump));
    if (last) return byCost(winners)[0];
    const sure = winners.filter((c) => boss(c) && (c.suit === trump || !enemyCanTrump));
    if (sure.length) return byCost(sure)[0];
    if (onTable >= 10) return winners.slice().sort((a, b) => power(b, trump) - power(a, trump))[0];
  }
  return cheapest(legal, trump);
}
