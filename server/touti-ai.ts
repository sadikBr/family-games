/**
 * «التوتي» — the expert bot and the «الباقي لنا» check.
 *
 * - What a bot may know: its own hand, every card played (who played what), the auction, the pairs
 *   sung (those two cards are known to be in the singer's hand), and what the duties reveal: a player
 *   who did not follow is void in that suit; one who neither followed nor trumped (when it was due) has
 *   no trump; one who trumped under a trump on the table (when going over was due) has no higher trump.
 * - Play (expert): determinized Monte-Carlo — deal the unseen cards to the others many times in ways
 *   that fit everything known, try each legal card in each deal and finish the hand with a fast
 *   double-dummy policy (an exact search once only a few cards are left), and keep the card that wins
 *   the contract most often (the points as a tie-break). Under a time budget.
 * - Auction (expert): the same deals, a hand played out with each suit as the trump, gives how often
 *   each bid would be reached; the partner's calls move the threshold.
 * - «الباقي لنا»: with every hand known (the server), an exact search says whether a team takes every
 *   remaining trick whatever the others play (skipped when the tree is too big).
 */
import { SUITS, makeDeck, type Card, type Suit } from '../src/shared/cards';
import type { ToutiSingBy } from '../src/shared/games/touti';
import { BID_STEP, SING_PLAIN_BID, SING_TRUMP_BID, T_LAST, cardPoints, legalCards, power, singable, trickLeader } from '../src/shared/touti-rules';

const DECK = makeDeck();
const now = () => performance.now();

/** The expert's thinking budget per card: milliseconds, and at least / at most this many deals (tests fix it for repeatable games). */
const BUDGET = { ms: 25, min: 4, max: 32 };
export function setExpertBudget(ms: number, min: number, max: number) {
  Object.assign(BUDGET, { ms, min, max });
}

/** A table where every hand is known (a real one on the server, or one dealt by a bot's guess). Seats 0..3, teams = seat % 2. */
export interface Sim {
  hands: Card[][];
  trick: { s: number; card: Card }[];
  turn: number;
  trump: Suit;
  partnerFree: boolean;
  /** tricks still to be completed, the current one included */
  left: number;
  /** card points taken (the last trick's 10 included), per team */
  pts: [number, number];
  /** the bidding team, its bid, the pairs it sang so far and who may sing */
  bidTeam: number;
  bid: number;
  sung: Suit[];
  sungPts: number;
  singBy: ToutiSingBy;
}

const cloneSim = (x: Sim): Sim => ({ ...x, hands: x.hands.map((h) => h.slice()), trick: x.trick.slice(), pts: [x.pts[0], x.pts[1]], sung: x.sung.slice() });
const legalOf = (x: Sim, seat: number) => legalCards(x.hands[seat], x.trick.map((t) => ({ card: t.card })), x.trump, { partnerFree: x.partnerFree });

/** Play a card; when it completes the trick, score it (and the pair the bidding team sings after it). */
function play(x: Sim, seat: number, card: Card) {
  const h = x.hands[seat];
  h.splice(h.findIndex((c) => c.id === card.id), 1);
  x.trick.push({ s: seat, card });
  if (x.trick.length < 4) {
    x.turn = (seat + 1) % 4;
    return;
  }
  const w = x.trick[trickLeader(x.trick, x.trump)].s;
  const team = w % 2;
  x.pts[team] += x.trick.reduce((t, p) => t + cardPoints(p.card), 0) + (x.left === 1 ? T_LAST : 0);
  x.left -= 1;
  x.trick = [];
  x.turn = w;
  if (team === x.bidTeam && x.left > 0) {
    for (const who of x.singBy === 'team' ? [w, (w + 2) % 4] : [w]) {
      const pair = singable(x.hands[who], x.trump, x.bid, x.sung)[0];
      if (pair) {
        x.sung.push(pair.suit);
        x.sungPts += pair.points;
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* A fast double-dummy policy (for play-outs)                          */
/* ------------------------------------------------------------------ */

const cheapest = (cs: Card[], trump: Suit) =>
  cs.reduce((b, c) => {
    const k = (z: Card) => cardPoints(z) * 100 + (z.suit === trump ? 50 : 0) + power(z);
    return k(c) < k(b) ? c : b;
  });

/** Can any later player of the other team beat this trick if it stands like this? */
function beatable(x: Sim, trick: { s: number; card: Card }[], team: number): boolean {
  const led = trick[0].card.suit;
  const best = trick[trickLeader(trick, x.trump)].card;
  for (let k = trick.length; k < 4; k++) {
    const s = (trick[0].s + k) % 4;
    if (s % 2 === team) continue;
    const h = x.hands[s];
    const hasLed = h.some((c) => c.suit === led);
    for (const c of h) {
      if (hasLed && c.suit !== led) continue;
      if (c.suit === best.suit ? power(c) > power(best) : c.suit === x.trump) return true;
    }
  }
  return false;
}

export function fastPick(x: Sim, seat: number): Card {
  const legal = legalOf(x, seat);
  if (legal.length === 1) return legal[0];
  const team = seat % 2;
  const trump = x.trump;
  if (!x.trick.length) {
    // a card no one can beat, the most points first (the trumps the bidders pull first)
    let pick: Card | null = null;
    for (const c of legal) {
      if (beatable(x, [{ s: seat, card: c }], team)) continue;
      const v = cardPoints(c) + (c.suit === trump ? (team === x.bidTeam ? 30 : -30) : 0);
      if (!pick || v > cardPoints(pick) + (pick.suit === trump ? (team === x.bidTeam ? 30 : -30) : 0)) pick = c;
    }
    if (pick) return pick;
    const plain = legal.filter((c) => c.suit !== trump);
    return cheapest(plain.length ? plain : legal, trump);
  }
  const holder = x.trick[trickLeader(x.trick, trump)].s;
  if (holder % 2 === team && !beatable(x, x.trick, team)) {
    // the partner takes it: give it points (no trump if possible)
    const plain = legal.filter((c) => c.suit !== trump);
    const pool = plain.length ? plain : legal;
    return pool.reduce((b, c) => (cardPoints(c) > cardPoints(b) || (cardPoints(c) === cardPoints(b) && power(c) < power(b)) ? c : b));
  }
  const winners = legal.filter((c) => trickLeader([...x.trick, { s: seat, card: c }], trump) === x.trick.length);
  if (winners.length) {
    const safe = winners.filter((c) => !beatable(x, [...x.trick, { s: seat, card: c }], team));
    if (safe.length) return cheapest(safe, trump);
    const onTable = x.trick.reduce((t, p) => t + cardPoints(p.card), 0);
    if (onTable >= 10 && holder % 2 !== team) return winners.reduce((b, c) => (power(c) > power(b) ? c : b));
  }
  return cheapest(legal, trump);
}

export function rollout(x: Sim) {
  while (x.left > 0) play(x, x.turn, fastPick(x, x.turn));
}

/** What a finished (or searched) table is worth to `team`: the contract first, the points as a tie-break. */
function worth(x: Sim, team: number): number {
  const made = x.pts[x.bidTeam] + x.sungPts;
  const success = made >= x.bid;
  const mine = team === x.bidTeam ? success : !success;
  return (mine ? 100 : 0) + 0.4 * (x.pts[team] - x.pts[1 - team]) / 13;
}

/** Exact minimax (alpha-beta) of the rest of the hand, for small endings. */
function exact(x: Sim, team: number, alpha: number, beta: number): number {
  if (x.left === 0) return worth(x, team);
  const seat = x.turn;
  const maxing = seat % 2 === team;
  let best = maxing ? -Infinity : Infinity;
  for (const c of legalOf(x, seat)) {
    const y = cloneSim(x);
    play(y, seat, c);
    const v = exact(y, team, alpha, beta);
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* «الباقي لنا»: does `team` take every remaining trick for sure?       */
/* ------------------------------------------------------------------ */

/**
 * true: certain; false: not certain, or the tree was too big to be sure (capped in nodes, so the
 * same on every machine). `chooser` = -1: both partners choose their cards; a seat: only that player
 * does, the partner's cards could be any (the claim is certain from that one hand).
 */
export function takesAll(x: Sim, team: number, chooser = -1, budget = 3000): boolean {
  let nodes = 0;
  // the same cards left (in any order of discards) answer the same: few distinct positions in an ending
  const memo = new Map<string, boolean>();
  const keyOf = (y: Sim) =>
    `${y.turn}|${y.trick.map((t) => t.card.id).join(',')}|${y.hands.map((h) => h.map((c) => c.id).sort().join(',')).join('/')}`;
  const go = (y: Sim): boolean => {
    if (y.left === 0) return true;
    const key = keyOf(y);
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (++nodes > budget) throw new Error('budget');
    const res = step(y);
    memo.set(key, res);
    return res;
  };
  const step = (y: Sim): boolean => {
    const seat = y.turn;
    const ours = seat % 2 === team && (chooser < 0 || seat === chooser);
    for (const c of legalOf(y, seat)) {
      const z = cloneSim(y);
      const before = z.left;
      play(z, seat, c);
      // a trick just went to the other team: this line fails
      const lost = z.left < before && z.turn % 2 !== team;
      const ok = !lost && go(z);
      if (ours && ok) return true;
      if (!ours && !ok) return false;
    }
    return !ours;
  };
  try {
    return go(cloneSim(x));
  } catch {
    return false;
  }
}

/** Who may claim: the first player of the team (in play order) whose own hand makes it certain, else both hands shown. */
export function findClaim(x: Sim): { seat: number; team: number; reveal: number[] } | null {
  if (x.left < 2) return null;
  for (const team of [0, 1]) {
    if (!takesAll(x, team, -1, 3000)) continue;
    const order = [0, 1, 2, 3].map((k) => (x.turn + k) % 4).filter((seat) => seat % 2 === team);
    // only one player's own cards, whatever the partner plays: no offer that needs both partners
    for (const seat of order) if (takesAll(x, team, seat, 30_000)) return { seat, team, reveal: [seat] };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* What a bot knows, and deals that fit it                             */
/* ------------------------------------------------------------------ */

export interface Knowledge {
  /** my seat (0..3) and my hand */
  me: number;
  hand: Card[];
  trump: Suit;
  partnerFree: boolean;
  /** finished tricks and the current one, by seat */
  done: { s: number; card: Card }[][];
  trick: { s: number; card: Card }[];
  /** cards still in each seat's hand */
  counts: number[];
  /** pairs sung: those 12 and 11 are known to be with the singer (until played) */
  sung: { s: number; suit: Suit }[];
  bidTeam: number;
  bid: number;
  singBy: ToutiSingBy;
}

/** Voids and trump caps from the duties. */
function constraints(k: Knowledge) {
  const void_ = [0, 1, 2, 3].map(() => new Set<Suit>());
  // the strongest trump a seat may still hold (power), 99 = no limit
  const cap = [99, 99, 99, 99];
  for (const t of [...k.done, k.trick]) {
    if (!t.length) continue;
    const led = t[0].card.suit;
    for (let i = 1; i < t.length; i++) {
      const { s, card } = t[i];
      if (card.suit === led) continue;
      void_[s].add(led);
      const before = t.slice(0, i);
      // with «partnerFree», a player whose partner held the trick may have played anything
      if (k.partnerFree && i >= 2 && trickLeader(before, k.trump) === i - 2) continue;
      if (led === k.trump) continue;
      if (card.suit !== k.trump) void_[s].add(k.trump);
      else {
        const top = Math.max(0, ...before.filter((p) => p.card.suit === k.trump).map((p) => power(p.card)));
        if (top > 0 && power(card) < top) cap[s] = Math.min(cap[s], top);
      }
    }
  }
  return { void_, cap };
}

/** Deal the unseen cards to the others so that everything known holds (null if it can't be done quickly). */
export function sampleDeal(k: Knowledge, rnd: () => number = Math.random): Card[][] | null {
  const seen = new Set([...k.hand, ...k.done.flat().map((p) => p.card), ...k.trick.map((p) => p.card)].map((c) => c.id));
  const hands: Card[][] = [[], [], [], []];
  hands[k.me] = k.hand.slice();
  const need = k.counts.slice();
  need[k.me] = 0;
  // the sung pairs still in hand
  for (const p of k.sung) {
    if (p.s === k.me) continue;
    for (const r of [12, 11]) {
      const c = DECK.find((d) => d.suit === p.suit && d.rank === r)!;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      hands[p.s].push(c);
      need[p.s] -= 1;
    }
  }
  const pool = DECK.filter((c) => !seen.has(c.id));
  const { void_, cap } = constraints(k);
  const others = [0, 1, 2, 3].filter((s) => s !== k.me);
  const ok = (s: number, c: Card) => !void_[s].has(c.suit) && !(c.suit === k.trump && power(c) > cap[s]);
  for (let attempt = 0; attempt < 40; attempt++) {
    const strict = attempt < 30;
    const left = need.slice();
    const out = hands.map((h) => h.slice());
    const cards = pool.slice();
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const elig = (c: Card) => others.filter((s) => left[s] > 0 && (!strict || ok(s, c)));
    cards.sort((a, b) => others.filter((s) => !strict || ok(s, a)).length - others.filter((s) => !strict || ok(s, b)).length);
    let failed = false;
    for (const c of cards) {
      const e = elig(c);
      if (!e.length) {
        failed = true;
        break;
      }
      const total = e.reduce((t, s) => t + left[s], 0);
      let r = rnd() * total;
      let pick = e[e.length - 1];
      for (const s of e) {
        r -= left[s];
        if (r < 0) {
          pick = s;
          break;
        }
      }
      out[pick].push(c);
      left[pick] -= 1;
    }
    if (!failed && others.every((s) => left[s] === 0)) return out;
  }
  return null;
}

function simFrom(k: Knowledge, hands: Card[][], pts: [number, number], sungPts: number, sungSuits: Suit[]): Sim {
  return {
    hands: hands.map((h) => h.slice()),
    trick: k.trick.slice(),
    turn: k.trick.length ? (k.trick[0].s + k.trick.length) % 4 : k.me,
    trump: k.trump,
    partnerFree: k.partnerFree,
    // the seats still to play this trick hold one card more than the others
    left: Math.max(...hands.map((h) => h.length)),
    pts: [pts[0], pts[1]],
    bidTeam: k.bidTeam,
    bid: k.bid,
    sung: sungSuits.slice(),
    sungPts,
    singBy: k.singBy,
  };
}

/** The expert's card: determinized Monte-Carlo under a time budget (exact play-outs near the end). */
export function expertCard(k: Knowledge, legal: Card[], pts: [number, number], sungPts: number, rnd: () => number = Math.random): Card {
  if (legal.length === 1) return legal[0];
  const t0 = now();
  const team = k.me % 2;
  const total = new Map<string, number>(legal.map((c) => [c.id, 0]));
  const sungSuits = k.sung.map((p) => p.suit);
  const small = k.hand.length <= 3;
  let deals = 0;
  for (; deals < BUDGET.max && (deals < BUDGET.min || now() - t0 < BUDGET.ms); deals++) {
    const hands = sampleDeal(k, rnd);
    if (!hands) break;
    const base = simFrom(k, hands, pts, sungPts, sungSuits);
    for (const c of legal) {
      const y = cloneSim(base);
      play(y, k.me, c);
      let v: number;
      if (small) v = exact(y, team, -Infinity, Infinity);
      else {
        rollout(y);
        v = worth(y, team);
      }
      total.set(c.id, total.get(c.id)! + v);
    }
  }
  if (!deals) return legal[0];
  // ties: the cheaper card
  return legal.reduce((b, c) => {
    const d = total.get(c.id)! - total.get(b.id)!;
    return d > 1e-9 || (Math.abs(d) <= 1e-9 && cardPoints(c) * 100 + power(c) < cardPoints(b) * 100 + power(b)) ? c : b;
  });
}

/* ------------------------------------------------------------------ */
/* The auction and the trump (expert)                                  */
/* ------------------------------------------------------------------ */

export interface BidOutlook {
  /** for each suit as the trump: the play-outs' totals with their plain / trump pairs kept apart */
  suits: { suit: Suit; outs: { cards: number; plain: number; trump: number }[] }[];
}

/**
 * Deal the others' hands at random and play the hand out double-dummy with each suit as the trump,
 * me as the bidder leading from `leadSeat` (the dealer's right).
 */
export function outlook(hand: Card[], me: number, leadSeat: number, singBy: ToutiSingBy, partnerFree: boolean, deals = 12, rnd: () => number = Math.random): BidOutlook {
  const mine = new Set(hand.map((c) => c.id));
  const suits = SUITS.map((suit) => ({ suit, outs: [] as { cards: number; plain: number; trump: number }[] }));
  for (let d = 0; d < deals; d++) {
    const pool = DECK.filter((c) => !mine.has(c.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const hands: Card[][] = [[], [], [], []];
    hands[me] = hand.slice();
    let k = 0;
    for (let s = 0; s < 4; s++) if (s !== me) hands[s] = pool.slice(k, (k += 10));
    for (const x of suits) {
      const sim: Sim = {
        hands: hands.map((h) => h.slice()),
        trick: [],
        turn: leadSeat,
        trump: x.suit,
        partnerFree,
        left: 10,
        pts: [0, 0],
        bidTeam: me % 2,
        // play-outs as if every pair could be sung; the bid decides afterwards which ones count
        bid: SING_TRUMP_BID,
        sung: [],
        sungPts: 0,
        singBy,
      };
      rollout(sim);
      const trumpPair = sim.sung.includes(x.suit) ? 40 : 0;
      x.outs.push({ cards: sim.pts[me % 2], plain: sim.sungPts - trumpPair, trump: trumpPair });
    }
  }
  return { suits };
}

/** How often `bid` is reached with this suit as the trump. */
export function chance(o: BidOutlook['suits'][number], bid: number): number {
  let n = 0;
  for (const r of o.outs) if (r.cards + (bid >= SING_PLAIN_BID ? r.plain : 0) + (bid >= SING_TRUMP_BID ? r.trump : 0) >= bid) n++;
  return n / Math.max(1, o.outs.length);
}

/**
 * The expert's call: the bid with the best chance among the next one, 80 and 90 (the levels that let
 * the pairs be sung), while that chance stays over a threshold the partner's calls move.
 */
export function expertBid(
  o: BidOutlook,
  bids: number[],
  partner: 'bid' | 'pass' | 'none',
  high: { by: 'partner' | 'them'; bid: number } | null,
  estimate?: (b: number) => number,
): number | 'pass' {
  if (!bids.length) return 'pass';
  const lowest = bids[0];
  // how often a bid is reached: the play-outs' rate blended with the calibrated hand estimate, nudged
  // by the partner's calls (a partner who bid holds strength the random deals don't know of; one who passed is weak)
  const shift = partner === 'bid' ? 0.1 : partner === 'pass' ? -0.05 : 0;
  const reach = (b: number) => {
    const sim = Math.max(...o.suits.map((x) => chance(x, b)));
    const p = estimate ? (sim + estimate(b)) / 2 : sim;
    return Math.min(1, Math.max(0, p + shift));
  };
  // a contract is worth its bid to whoever wins it: compare bidding with letting the current bid stand
  // (the opponents' contract succeeds about 60 % of the time, the partner's about 65 %)
  const standing = !high ? 0 : high.by === 'them' ? -0.2 * high.bid : 0.3 * high.bid;
  let best: { bid: number; ev: number } | null = null;
  for (const b of [lowest, SING_PLAIN_BID, SING_TRUMP_BID]) {
    if (b < lowest || !bids.includes(b)) continue;
    const ev = (2 * reach(b) - 1) * b;
    if (!best || ev > best.ev) best = { bid: b, ev };
  }
  if (!best || best.ev <= standing) return 'pass';
  return best.bid;
}

/** The expert's trump once the contract is won: the suit that reaches it most often. */
export function expertTrump(o: BidOutlook, bid: number): Suit {
  return o.suits
    .map((x) => ({ suit: x.suit, p: chance(x, bid), m: x.outs.reduce((t, r) => t + r.cards + r.plain + r.trump, 0) }))
    .sort((a, b) => b.p - a.p || b.m - a.m)[0].suit;
}
