/**
 * «هزّ 2» bots, by the room's strength:
 * - easy: any card that fits, any suit now and then — a relaxed opponent;
 * - smart: sheds heavy cards, stays in its long suit, keeps the 7 for later, attacks a player close
 *   to going out;
 * - expert: everything a sharp player at the table does, with public information only —
 *   counts the cards (what is unseen = not in its hand, not on the pile), remembers who had to draw
 *   on which suit / number and without a 7 (they are void until they draw a card that could change
 *   it), plans its whole turn through 1 / 10 (and 12 with two players) chains, keeps 7s and 2s for
 *   the moment they matter, picks the suit it holds most and the next player lacks, stacks 2s and
 *   skips with 12 on whoever is about to go out, never ends up holding a lone 10, and sheds its
 *   heavy cards when the round is about to end.
 */
import { SUITS, type Card, type Suit } from '../src/shared/cards';
import { hez2Points } from '../src/shared/games/hez2';
import type { GameAction, BotLevel } from '../src/shared/protocol';
import { hez2, type State } from './games/hez2';

/** What a player is known to lack since their last draw (public: everyone saw them draw). */
export interface Void {
  suits: Suit[];
  ranks: number[];
  no7: boolean;
}

const cur = (s: State) => s.seats[s.turnIdx];
const topOf = (s: State): Card | null => s.discard[s.discard.length - 1] ?? null;
const isReplay = (c: Card, players: number) => c.rank === 1 || c.rank === 10 || (c.rank === 12 && players === 2);

/** May this card go on (suit, rank) with `pending` cards to draw, from a hand of `handSize`? */
function fits(c: Card, suit: Suit, rank: number | null, pending: number, handSize: number): boolean {
  if (c.rank === 10 && handSize === 1) return false;
  if (pending > 0) return c.rank === 2;
  return c.rank === 7 || c.suit === suit || c.rank === rank;
}

const handPts = (cs: Card[]) => cs.reduce((t, c) => t + hez2Points(c), 0);

/* —— easy / smart —————————————————————————————————————————————————————————————————— */

/** The suit held most (ties: the heavier cards). */
export function longSuit(hand: Card[]): Suit {
  const score = (suit: Suit) => {
    const cs = hand.filter((c) => c.suit === suit && c.rank !== 7);
    return cs.length * 100 + handPts(cs);
  };
  return [...SUITS].sort((a, b) => score(b) - score(a))[0];
}

function smartPick(s: State, bot: string, opts: Card[]): Card {
  const hand = s.hands[bot];
  const n = s.seats.length;
  const nextCount = s.hands[s.seats[(s.turnIdx + 1) % n]]?.length ?? 9;
  const perSuit: Record<Suit, number> = { coins: 0, cups: 0, swords: 0, clubs: 0 };
  for (const c of hand) if (c.rank !== 7) perSuit[c.suit] += 1;
  let best = opts[0];
  let bestV = -Infinity;
  for (const c of opts) {
    // shed the heavy cards first, and stay in a suit the hand holds more of
    let v = hez2Points(c) + (perSuit[c.suit] - (c.rank !== 7 ? 1 : 0)) * 1.5;
    if (c.rank === 7) v = hand.length <= 2 ? 40 : -20; // keep the joker for later
    else if (isReplay(c, n)) v += hand.some((x) => x.id !== c.id && (x.rank === 7 || x.suit === c.suit || x.rank === c.rank)) ? 12 : -4;
    else if (c.rank === 2) v += nextCount <= 2 ? 30 : 4;
    else if (c.rank === 12) v += nextCount <= 2 ? 25 : 3;
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/* —— expert ————————————————————————————————————————————————————————————————————————— */

/** Threat of a player by cards left: one card = about to go out. */
const threat = (k: number) => (k <= 1 ? 4 : k === 2 ? 2.5 : k === 3 ? 1.3 : 0.7);

/** Cards the bot can't see: not in its hand, not on the pile (they are in other hands or in the stock). */
function unseen(s: State, bot: string): Card[] {
  const known = new Set([...s.hands[bot], ...s.discard].map((c) => c.id));
  const out: Card[] = [];
  for (const id of s.seats) if (id !== bot) for (const c of s.hands[id]) if (!known.has(c.id)) out.push(c);
  for (const c of s.deck) if (!known.has(c.id)) out.push(c);
  return out;
}

/** Chance that a hand of `h` random cards out of `pool` holds at least one of `m` wanted ones. */
function chanceAny(pool: number, m: number, h: number): number {
  if (m <= 0 || h <= 0 || pool <= 0) return 0;
  let none = 1;
  for (let i = 0; i < h; i++) {
    if (pool - i <= 0) return 1;
    none *= Math.max(0, pool - m - i) / (pool - i);
  }
  return 1 - none;
}

interface Ctx {
  s: State;
  bot: string;
  pool: Card[];
  voids: Record<string, Void>;
  minOpp: number;
}

/** Chance that player `id` can put a card on (suit, rank, pending). */
function canAnswer(x: Ctx, id: string, suit: Suit, rank: number, pending: number): number {
  const h = x.s.hands[id]?.length ?? 0;
  if (!h) return 0;
  const v = x.voids[id];
  const wanted = x.pool.filter((c) => {
    if (pending > 0) return c.rank === 2;
    if (c.rank === 7) return !v?.no7;
    if (c.suit === suit && !v?.suits.includes(suit)) return true;
    return c.rank === rank && !v?.ranks.includes(rank);
  }).length;
  // a single 10 can't be the last card
  return chanceAny(x.pool.length, wanted, h) * (h === 1 && rank === 10 && pending === 0 ? 0.8 : 1);
}

/** How good it is to end my turn with `top` showing and `suit` to follow, holding `rest`. */
function endValue(x: Ctx, rest: Card[], top: Card, suit: Suit, pending: number, played: Card[], drawAfter: boolean): number {
  const { s } = x;
  const n = s.seats.length;
  const me = s.seats.indexOf(x.bot);
  const next = s.seats[(me + 1) % n];
  const after = s.seats[(me + 2) % n];
  const tAll = threat(x.minOpp);
  const shedPts = handPts(played);
  let v = played.length * 6 + shedPts * 0.55 * tAll;
  if (!rest.length) {
    // out (a last 2 still waits for its penalty to be drawn)
    v += top.rank === 2 && s.settings.lastTwo ? 700 : 1000;
    return v;
  }
  if (drawAfter) v -= 6 + 2.5 * tAll;
  if (rest.every((c) => c.rank === 10)) v -= rest.length === 1 ? 30 : 12; // a hand of 10s can't go out
  // the jokers and the 2s are worth keeping while the hand is long and nobody is close
  for (const c of played) {
    if (c.rank === 7) v -= rest.length >= 2 ? 10 + 6 / tAll : 3;
    if (c.rank === 2 && pending === 2 && played.length === 1) v -= rest.length >= 2 ? 3 : 0;
  }
  // my next turn: cards that will still fit (the suit or the number usually survives a round in 2p)
  const followers = rest.filter((c) => c.rank === 7 || c.suit === suit || c.rank === top.rank).length;
  v += Math.min(3, followers) * (n === 2 ? 2.2 : 1.2);
  // the pressure I put on the next player
  const tNext = threat(s.hands[next]?.length ?? 9);
  if (top.rank === 2 && pending > 0) {
    const p2 = canAnswer(x, next, suit, 2, pending);
    v += (1 - p2) * pending * (1.6 + tNext);
    // answered: the stack moves on — onto me with two players
    if (n === 2) v -= p2 * (pending + 2) * (rest.some((c) => c.rank === 2) ? 0.3 : 1.6);
    else v -= p2 * 0.6;
  } else if (top.rank === 12 && n > 2) {
    v += 3 + tNext * 4;
    v += (1 - canAnswer(x, after, suit, 12, 0)) * (2 + threat(s.hands[after]?.length ?? 9) * 4);
  } else {
    const p = canAnswer(x, next, suit, top.rank, 0);
    v += (1 - p) * (3 + tNext * 5);
  }
  return v;
}

interface Plan {
  cards: Card[];
  suit: Suit | null;
  value: number;
}

/** Every way to play out my turn (through replay cards), best first. */
function plans(x: Ctx): Plan[] {
  const { s } = x;
  const n = s.seats.length;
  const top0 = topOf(s);
  const out: Plan[] = [];
  let nodes = 0;
  const walk = (hand: Card[], suit: Suit, top: Card | null, pending: number, played: Card[]) => {
    if (++nodes > 400) return;
    const opts = hand.filter((c) => fits(c, suit, top?.rank ?? null, pending, hand.length));
    if (!opts.length) {
      // a replay with nothing to follow: I draw a card instead
      if (played.length) out.push({ cards: played, suit: null, value: endValue(x, hand, top!, suit, pending, played, true) });
      return;
    }
    for (const c of opts) {
      const rest = hand.filter((y) => y.id !== c.id);
      const nowPending = c.rank === 2 ? pending + 2 : 0;
      const p = [...played, c];
      if (rest.length && pending === 0 && isReplay(c, n)) {
        walk(rest, c.suit, c, 0, p);
        continue;
      }
      if (c.rank === 7 && rest.length) {
        for (const su of SUITS) out.push({ cards: p, suit: su, value: endValue(x, rest, c, su, 0, p, false) + rest.filter((y) => y.suit === su).length * 0.5 });
        continue;
      }
      out.push({ cards: p, suit: null, value: endValue(x, rest, c, c.suit, nowPending, p, false) });
    }
  };
  walk(s.hands[x.bot], s.suit, top0, s.pending, []);
  return out.sort((a, b) => b.value - a.value);
}

function expertCtx(s: State, bot: string, voids: Record<string, Void>): Ctx {
  const opp = s.seats.filter((id) => id !== bot).map((id) => s.hands[id]?.length ?? 9);
  return { s, bot, pool: unseen(s, bot), voids, minOpp: Math.min(...opp, 9) };
}

/** The best suit for my 7 (expert): what I hold, and what the next player is known to lack. */
function expertSuit(s: State, bot: string, voids: Record<string, Void>): Suit {
  const x = expertCtx(s, bot, voids);
  const hand = s.hands[bot];
  const top = topOf(s) ?? { id: 'x', suit: s.suit, rank: 7 };
  let best: Suit = longSuit(hand);
  let bestV = -Infinity;
  for (const su of SUITS) {
    const v = endValue(x, hand, top, su, 0, [], false) + hand.filter((c) => c.suit === su).length * 0.5;
    if (v > bestV) {
      bestV = v;
      best = su;
    }
  }
  return best;
}


/* —— expert: look-ahead by playing the round out many times ——————————————————————— */

/** Time and work limits for one expert decision (keeps a phone-sized server responsive). */
const BUDGET_MS = 24;
const MAX_ROLLOUTS = 90;
/** Tests that check a decision's quality set `timeless` so a busy machine doesn't cut the look-ahead short. */
export const hez2Tuning = { timeless: false };
const SIM_CTX = {
  now: 0,
  fx() {},
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map<string, unknown>(),
  bot() {},
};

/** A light copy of a game: only what a round needs (the history starts empty: the round's points land in it). */
function lightCopy(s: State): State {
  return {
    ...s,
    settings: { ...s.settings },
    seats: [...s.seats],
    scores: { ...s.scores },
    history: [],
    deck: [...s.deck],
    discard: [...s.discard],
    hands: Object.fromEntries(s.seats.map((id) => [id, [...s.hands[id]]])),
    drawn: s.drawn ? { ...s.drawn } : null,
    voids: { ...s.voids },
    event: null,
    roundSummary: null,
  };
}

/**
 * One possible world consistent with what the bot knows: the unseen cards dealt at random to the other
 * hands (their sizes kept, and nobody given a suit / number / 7 they were seen to lack) and the stock.
 */
function determinize(s: State, bot: string, rand: () => number): State {
  const w = lightCopy(s);
  const others = w.seats.filter((id) => id !== bot);
  const pool = [...w.deck, ...others.flatMap((id) => w.hands[id])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sizes = Object.fromEntries(others.map((id) => [id, w.hands[id].length]));
  for (const id of others) w.hands[id] = [];
  // the most constrained players first
  const order = [...others].sort((a, b) => (s.voids[b] ? 1 : 0) - (s.voids[a] ? 1 : 0));
  for (const id of order) {
    const v = s.voids[id];
    const ok = (c: Card) => !v || !(v.suits.includes(c.suit) || v.ranks.includes(c.rank) || (v.no7 && c.rank === 7));
    for (let k = 0; k < sizes[id]; k++) {
      let i = pool.findIndex(ok);
      if (i < 0) i = 0; // nothing fits what we believe: give any card
      w.hands[id].push(pool.splice(i, 1)[0]);
    }
  }
  w.deck = pool;
  return w;
}

/** Plays a copied world until the round is over (everyone on the «smart» policy); my result in it. */
function rollout(w: State, bot: string, first: GameAction, rand: () => number): number {
  hez2.act(SIM_CTX, w, bot, first);
  for (let steps = 0; w.phase === 'play' && steps < 200; steps++) {
    const id = w.choosing ?? cur(w);
    const a = decide(w, id, 'smart', rand);
    if (!a) break;
    hez2.act(SIM_CTX, w, id, a);
  }
  if (w.phase === 'play') return 0;
  const pts = w.history[0] ?? {};
  const others = w.seats.filter((id) => id !== bot);
  const mine = pts[bot] ?? 0;
  const theirs = others.map((id) => pts[id] ?? 0);
  // lowest total wins: my points against theirs (the leader's above all), and taking the round
  const lead = Math.min(...others.map((id) => w.scores[id] ?? 0));
  const leader = others.find((id) => (w.scores[id] ?? 0) === lead)!;
  return theirs.reduce((t, p) => t + p, 0) / Math.max(1, theirs.length) + 0.5 * (pts[leader] ?? 0) - 1.5 * mine + (w.roundWinner === bot ? 4 : 0);
}

/** The expert's choice among `cands`: the heuristic plan's pick breaks ties, rollouts decide. */
function lookAhead(s: State, bot: string, cands: GameAction[], prior: (a: GameAction) => number, rand: () => number): GameAction {
  if (cands.length === 1) return cands[0];
  const sum = cands.map(() => 0);
  const cnt = cands.map(() => 0);
  const t0 = performance.now();
  outer: for (let r = 0; r < MAX_ROLLOUTS; r++) {
    // the same world for every choice (common random numbers: the comparison is fair and steady)
    const world = determinize(s, bot, rand);
    for (let i = 0; i < cands.length; i++) {
      sum[i] += rollout(lightCopy(world), bot, cands[i], rand);
      cnt[i] += 1;
      // at least a few worlds for every choice, then stop on time
      if (r >= 3 && !hez2Tuning.timeless && performance.now() - t0 > BUDGET_MS) break outer;
    }
  }
  let best = 0;
  let bestV = -Infinity;
  cands.forEach((a, i) => {
    const v = sum[i] / Math.max(1, cnt[i]) + prior(a) * 0.02;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return cands[best];
}

/** The move for the bot whose turn it is (or who chooses a suit), at the room's strength. */
export function decide(s: State, bot: string, level: BotLevel, rand: () => number = Math.random): GameAction | null {
  if (s.phase !== 'play') return null;
  if (s.choosing) {
    if (s.choosing !== bot) return null;
    const hand = s.hands[bot];
    if (level === 'easy') return { type: 'suit', suit: rand() < 0.5 ? longSuit(hand) : SUITS[Math.floor(rand() * 4)] };
    if (level === 'smart') return { type: 'suit', suit: longSuit(hand) };
    const pick = expertSuit(s, bot, s.voids);
    return lookAhead(s, bot, SUITS.map((su) => ({ type: 'suit', suit: su })), (a) => (a.suit === pick ? 50 : 0), rand);
  }
  if (cur(s) !== bot) return null;
  const hand = s.hands[bot];
  const n = s.hands[bot].length;
  const drawn = s.drawn?.by === bot ? s.drawn.id : null;
  const opts = (drawn ? hand.filter((c) => c.id === drawn) : hand).filter((c) => fits(c, s.suit, topOf(s)?.rank ?? null, s.pending, n));
  if (!opts.length) return drawn ? { type: 'pass' } : { type: 'draw' };
  if (level === 'easy') return { type: 'play', card: opts[Math.floor(rand() * opts.length)].id };
  if (level === 'smart') return { type: 'play', card: smartPick(s, bot, opts).id };
  if (drawn) return { type: 'play', card: drawn };
  const ranked = plans(expertCtx(s, bot, s.voids));
  const prior = (a: GameAction) => ranked.find((p) => p.cards[0]?.id === a.card)?.value ?? 0;
  return lookAhead(s, bot, opts.map((c) => ({ type: 'play', card: c.id })), prior, rand);
}
