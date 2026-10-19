/**
 * «الكذّاب» — the strong bot.
 * Card counting: every card is dealt, so a rank-r card the bot can't place (its own hand, piles put aside,
 * cards it saw go to someone in a «كذّاب!») is in another player's hand. From that it works out how
 * likely a claim is (hypergeometric odds that the player held that many), weighs it with what the
 * player's revealed plays showed about their honesty, and shouts «كذّاب!» when the expected cards won
 * beat the expected cards taken — always on an impossible claim or on someone's last cards.
 * Lies are calibrated the same way: a bluff is made only when the chance of being caught (each
 * opponent's observed call rate, and the chance that one of them holds enough of the rank to know)
 * times the pile it would cost is smaller than the card it sheds. It never ends its hand on a lie.
 * Sees only what its own seat could know.
 */
import type { Card } from '../../src/shared/cards';
import type { BotLevel, GameAction } from '../../src/shared/protocol';

export interface KdabKnow {
  /** cards known to be in another player's hand */
  held: Record<string, string[]>;
  /** cards probably in another player's hand: n of rank r (claims in a pile they picked up, unseen) */
  soft: Record<string, Record<number, number>>;
  /** cards known / probably out of the game (piles put aside) */
  gone: string[];
  goneSoft: Record<number, number>;
  /** cards known to be in the current pile, and the unseen claims of the others in it */
  pile: string[];
  pileSoft: { play: number; by: string; rank: number; n: number }[];
  /** what of the last claim is backed by cards the claimant was known (or thought) to hold */
  support: { play: number; exact: number; soft: number } | null;
}

export interface KdabHabits {
  calls: Record<string, number>;
  chances: Record<string, number>;
  lies: Record<string, number>;
  shown: Record<string, number>;
}

export const newKnow = (): KdabKnow => ({ held: {}, soft: {}, gone: [], goneSoft: {}, pile: [], pileSoft: [], support: null });
export const newHabits = (): KdabHabits => ({ calls: {}, chances: {}, lies: {}, shown: {} });

const rankOf = (id: string) => Number(id.split('-')[1]);
const add = (m: Record<number, number>, r: number, n: number) => {
  m[r] = Math.max(0, (m[r] ?? 0) + n);
};

/** Seat `me` sees `by` play `ids` face down, claiming `n` cards of `rank`. */
export function knowPlay(k: KdabKnow, me: string, by: string, play: number, ids: string[], rank: number, left: number) {
  if (me === by) {
    k.pile.push(...ids);
    return;
  }
  const n = ids.length;
  const held = k.held[by] ?? [];
  const exact = held.filter((id) => rankOf(id) === rank).slice(0, n);
  k.held[by] = held.filter((id) => !exact.includes(id));
  k.pile.push(...exact);
  const soft = (k.soft[by] ??= {});
  const sf = Math.min(soft[rank] ?? 0, n - exact.length);
  add(soft, rank, -sf);
  k.pileSoft.push({ play, by, rank, n: n - exact.length });
  k.support = { play, exact: exact.length, soft: sf };
  // the rest of the play may have been cards this seat knew about (a lie): never "know" more cards
  // than the player still holds — forget the beliefs first, then the oldest sightings
  let over = (k.held[by] ?? []).length + Object.values(soft).reduce((t, v) => t + v, 0) - left;
  for (const r of Object.keys(soft)) {
    while (over > 0 && soft[Number(r)] > 0) {
      soft[Number(r)]--;
      over--;
    }
  }
  if (over > 0) k.held[by] = (k.held[by] ?? []).slice(over);
}

/** «كذّاب!»: the last play (`shown`) is turned over and the whole pile goes to `taker`. */
export function knowReveal(k: KdabKnow, me: string, taker: string, play: number, shown: string[]) {
  for (const who of Object.keys(k.held)) k.held[who] = k.held[who].filter((id) => !shown.includes(id));
  if (me !== taker) {
    const cards = [...new Set([...shown, ...k.pile])];
    k.held[taker] = [...new Set([...(k.held[taker] ?? []), ...cards])];
    const soft = (k.soft[taker] ??= {});
    for (const e of k.pileSoft) if (e.play !== play) add(soft, e.rank, e.n);
  }
  k.pile = [];
  k.pileSoft = [];
  k.support = null;
}

/** Everybody passed: the pile is put aside. */
export function knowGone(k: KdabKnow) {
  k.gone.push(...k.pile);
  for (const e of k.pileSoft) add(k.goneSoft, e.rank, e.n);
  k.pile = [];
  k.pileSoft = [];
  k.support = null;
}

export interface KdabKnowledge {
  me: string;
  order: string[];
  hand: Card[];
  handCounts: Record<string, number>;
  maxPlay: number;
  rank: number | null;
  pileCount: number;
  pileClaimed: number;
  last: { id: number; by: string; count: number; rank: number } | null;
  /** the last play started the pile (its rank was chosen freely) */
  lastStarted: boolean;
  /** the last player has no cards left: if nobody shouts, they win */
  finishing: boolean;
  know: KdabKnow;
  habits: KdabHabits;
}

/** C(n, k) as a float. */
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(at least `need` of the `good` cards among `draw` cards taken from `pool`). */
function atLeast(pool: number, good: number, draw: number, need: number): number {
  if (need <= 0) return 1;
  const total = comb(pool, draw);
  if (!total) return 0;
  let p = 0;
  for (let x = need; x <= Math.min(good, draw); x++) p += (comb(good, x) * comb(pool - good, draw - x)) / total;
  return Math.min(1, p);
}

const callRate = (h: KdabHabits, id: string) => ((h.calls[id] ?? 0) + 1) / ((h.chances[id] ?? 0) + 6);

/**
 * Where this seat can place the cards of a rank, leaving out what `except` holds: `exact` = cards seen,
 * `soft` = unseen claims believed. `hidden` = copies whose place nobody showed (soft counted as placed).
 */
function count(k: KdabKnowledge, rank: number, except?: string, skipPlay?: number) {
  const K = k.know;
  const mine = k.hand.filter((c) => c.rank === rank).length;
  let exact = 0;
  for (const id of [...K.gone, ...K.pile]) if (rankOf(id) === rank) exact++;
  for (const [who, ids] of Object.entries(K.held)) {
    if (who === except || who === k.me) continue;
    for (const id of ids) if (rankOf(id) === rank) exact++;
  }
  let soft = K.goneSoft[rank] ?? 0;
  for (const e of K.pileSoft) if (e.rank === rank && e.play !== skipPlay) soft += e.n;
  for (const [who, m] of Object.entries(K.soft)) if (who !== except && who !== k.me) soft += m[rank] ?? 0;
  const hiddenExact = Math.max(0, 4 - mine - exact);
  return { mine, hiddenExact, hidden: Math.max(0, hiddenExact - soft) };
}

/** Cards in the other hands nobody has placed (neither seen nor believed). */
function unplaced(k: KdabKnowledge): number {
  const K = k.know;
  const known = new Set([...K.gone, ...K.pile, ...Object.entries(K.held).filter(([w]) => w !== k.me).flatMap(([, v]) => v)]);
  let soft = 0;
  for (const v of Object.values(K.goneSoft)) soft += v;
  for (const e of K.pileSoft) soft += e.n;
  for (const [who, m] of Object.entries(K.soft)) if (who !== k.me) for (const v of Object.values(m)) soft += v;
  return Math.max(0, 40 - k.hand.length - known.size - soft);
}

/** How many of a player's cards this seat can't place. */
function unknownPart(k: KdabKnowledge, who: string, extra = 0): number {
  const K = k.know;
  let soft = 0;
  for (const v of Object.values(K.soft[who] ?? {})) soft += v;
  return Math.max(0, (k.handCounts[who] ?? 0) + extra - (K.held[who] ?? []).length - soft);
}

/** Probability that the last claim is a lie, from this seat. */
export function lieChance(k: KdabKnowledge): number {
  const last = k.last!;
  const r = last.rank;
  const sup = k.know.support && k.know.support.play === last.id ? k.know.support : { exact: 0, soft: 0 };
  // the claimant's own earlier claims of this rank in the pile are already counted as placed
  const { hiddenExact, hidden } = count(k, r, last.by, last.id);
  const need = last.count - sup.exact - sup.soft;
  if (need > hiddenExact) return 1;
  if (need > hidden) return 0.9;
  // the claimant's unseen cards before the play: a draw from the cards nobody placed
  const draw = unknownPart(k, last.by, last.count - sup.exact - sup.soft);
  // fewer unseen cards than the claim needs: a lie, unless what this seat remembers is out of date
  if (draw < need) return 0.85;
  const pool = Math.max(unplaced(k) + need, draw);
  let truth = atLeast(pool, hidden, draw, need);
  if (k.lastStarted) {
    // a pile is started with a rank the player holds: condition on holding at least one
    const one = atLeast(pool, hidden, draw, Math.min(1, need));
    truth = one > 0 ? Math.min(1, truth / one) : truth;
  }
  const b = 0.15;
  const lie = (1 - truth) * b;
  return lie / (lie + truth * (1 - b) + 1e-9);
}

/** Shout «كذّاب!» about the last play? */
export function kdabCall(k: KdabKnowledge, level: BotLevel): boolean {
  const last = k.last;
  if (!last || last.by === k.me) return false;
  const pLie = lieChance(k);
  if (pLie >= 0.999) return true;
  if (k.finishing) return level === 'expert' ? pLie > 0.02 : Math.random() < 0.8;
  // the odds from counting are sharp when a claim is (nearly) impossible, but a plain «unlikely» claim
  // is usually true — players with nothing to play mostly pass — so the middle is shrunk hard
  const pAdj = pLie >= 0.9 ? pLie : 0.05 + 0.25 * pLie;
  const P = k.pileCount;
  const others = k.order.filter((id) => id !== k.me && (k.handCounts[id] ?? 0) > 0);
  const leader = others.every((id) => (k.handCounts[id] ?? 0) >= (k.handCounts[last.by] ?? 0));
  const w = others.length <= 1 ? 1 : leader ? 0.8 : 0.5;
  const gain = pAdj * (w * P + 2); // the liar takes the pile, I start the next one
  const cost = (1 - pAdj) * P;
  if (level === 'smart') return gain - cost + (Math.random() - 0.5) * P > 0;
  return gain > cost;
}

/** Chance that a lie claiming `claim` cards of `rank` gets called. */
function catchChance(k: KdabKnowledge, rank: number, claim: number): number {
  const others = k.order.filter((id) => id !== k.me && (k.handCounts[id] ?? 0) > 0);
  const already = k.rank === rank ? k.pileClaimed : 0;
  // publicly impossible: more claimed in this pile than there are
  if (already + claim > 4) return 1;
  const pool = unplaced(k);
  let safe = 1;
  for (const o of others) {
    const { hidden } = count(k, rank, o);
    const known = (k.know.held[o] ?? []).filter((id) => rankOf(id) === rank).length + (k.know.soft[o]?.[rank] ?? 0);
    const unknown = unknownPart(k, o);
    // the opponent sees the lie when what they hold of the rank plus what was claimed passes four
    const needToSee = 5 - claim - already - known;
    const sees = needToSee <= 0 ? 1 : atLeast(Math.max(pool, unknown), hidden, unknown, needToSee);
    const rate = Math.min(0.9, callRate(k.habits, o) * (1 + 0.35 * (claim - 1)));
    safe *= 1 - (sees + (1 - sees) * rate);
  }
  return 1 - safe;
}

const RANK_LIST = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/**
 * In a duel the other hand is (nearly) known: every card not in my hand, not seen elsewhere and not
 * believed to be in a pile put aside. Returns its count per rank, or null when that doesn't add up.
 */
function duelOpponent(k: KdabKnowledge, opp: string): number[] | null {
  const K = k.know;
  const exact = new Set([...k.hand.map((c) => c.id), ...K.gone, ...K.pile, ...Object.entries(K.held).filter(([w]) => w !== opp).flatMap(([, v]) => v)]);
  const counts = RANK_LIST.map((r) => {
    let n = 0;
    for (const suit of ['coins', 'cups', 'swords', 'clubs']) if (!exact.has(`${suit}-${r}`)) n++;
    n -= K.goneSoft[r] ?? 0;
    for (const e of K.pileSoft) if (e.rank === r && e.by !== opp) n -= e.n;
    // the opponent's own unseen claims in the current pile are in the pile, not in their hand
    for (const e of K.pileSoft) if (e.rank === r && e.by === opp) n -= e.n;
    return n;
  });
  if (counts.some((n) => n < 0)) return null;
  if (counts.reduce((t, n) => t + n, 0) !== (k.handCounts[opp] ?? -1)) return null;
  return counts;
}

/**
 * Exact search of the truthful duel (both hands known): who wins with best play. Moves: start a pile
 * with 1..max cards of a rank, follow with more of the rank, or pass (the pile goes away and the last
 * player starts). Emptying the hand truthfully wins. Returns the winning first move, or null.
 */
function duelSearch(mine: number[], theirs: number[], k: KdabKnowledge, budget: number): GameAction | null {
  const max = k.maxPlay;
  const memo = new Map<string, boolean>();
  let nodes = 0;
  const pileRank0 = k.rank === null ? -1 : RANK_LIST.indexOf(k.rank);
  // side to move wins?
  const win = (a: number[], b: number[], pile: number, claimed: number, lastIsMe: boolean): boolean => {
    if (++nodes > budget) throw new Error('budget');
    const key = `${a.join('')}|${b.join('')}|${pile}|${claimed}|${lastIsMe ? 1 : 0}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let res = false;
    if (pile >= 0 && !lastIsMe) {
      // pass: the pile goes, the other (last) player starts
      if (!win(b, a, -1, 0, false)) res = true;
    }
    for (let r = 0; r < 10 && !res; r++) {
      if (!a[r] || (pile >= 0 && r !== pile)) continue;
      const room = pile >= 0 ? 4 - claimed : 4;
      for (let c = Math.min(a[r], max, room); c >= 1 && !res; c--) {
        a[r] -= c;
        const empty = a.every((x) => x === 0);
        if (empty) res = true;
        else if (!win(b, a, r, (pile >= 0 ? claimed : 0) + c, true)) res = true;
        a[r] += c;
      }
    }
    memo.set(key, res);
    return res;
  };
  try {
    const a = mine.slice();
    const pile = pileRank0;
    const claimed = k.rank === null ? 0 : k.pileClaimed;
    // root: try the moves in a sensible order and return the first that wins
    const tryMove = (r: number, c: number): boolean => {
      a[r] -= c;
      const ok = a.every((x) => x === 0) || !win(theirs.slice(), a, r, (pile >= 0 ? claimed : 0) + c, true);
      a[r] += c;
      return ok;
    };
    for (let r = 0; r < 10; r++) {
      if (!a[r] || (pile >= 0 && r !== pile)) continue;
      const room = pile >= 0 ? 4 - claimed : 4;
      for (let c = Math.min(a[r], max, room); c >= 1; c--) {
        if (tryMove(r, c)) {
          const cards = k.hand.filter((x) => x.rank === RANK_LIST[r]).slice(0, c).map((x) => x.id);
          return pile >= 0 ? { type: 'play', cards } : { type: 'play', cards, rank: RANK_LIST[r] };
        }
      }
    }
    if (pile >= 0 && !win(theirs.slice(), a, -1, 0, false)) return { type: 'pass' };
  } catch {
    return null;
  }
  return null;
}

const alive = (k: KdabKnowledge) => k.order.filter((id) => (k.handCounts[id] ?? 0) > 0).length;

/** The bot's move on its turn. */
export function kdabTurn(k: KdabKnowledge, level: BotLevel): GameAction {
  const hand = k.hand;
  const byRank = new Map<number, Card[]>();
  for (const c of hand) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  const smart = level === 'smart';

  // cards to slip in as lies: from the ranks that are hardest to get rid of truthfully (fewest held,
  // and with the most copies hidden elsewhere: nobody will start them for us)
  const fillers = (exclude: number) =>
    hand
      .filter((c) => c.rank !== exclude)
      .sort((a, b) => (byRank.get(a.rank)!.length - byRank.get(b.rank)!.length) || count(k, b.rank).hidden - count(k, a.rank).hidden);

  const withLies = (truth: Card[], rank: number, pileBefore: number) => {
    const play = truth.slice(0, k.maxPlay);
    const extra = fillers(rank);
    while (play.length < k.maxPlay && extra.length) {
      const next = extra[0];
      const claim = play.length + 1;
      const finishing = claim === hand.length;
      if (finishing) break; // never finish on a lie
      const pc = catchChance(k, rank, claim);
      // shed one more card if not caught; take back the pile (and these cards) if caught
      const ev = (1 - pc) * 1 - pc * (pileBefore + claim);
      if (ev <= (smart ? 0.15 : 0)) break;
      play.push(next);
      extra.shift();
    }
    return play;
  };

  // a duel with the other hand worked out: search it to the end
  const opps = k.order.filter((id) => id !== k.me && (k.handCounts[id] ?? 0) > 0);
  if (opps.length === 1 && level === 'expert' && !(k.last && k.last.by !== k.me && k.rank !== null && lieChance(k) >= 0.9)) {
    const theirs = duelOpponent(k, opps[0]);
    if (theirs) {
      const mine = RANK_LIST.map((r) => hand.filter((c) => c.rank === r).length);
      const move = duelSearch(mine, theirs, k, 40000);
      if (move) return move;
    }
  }

  if (k.rank === null) {
    // start a pile: a whole hand of one rank wins outright
    if (byRank.size === 1 && hand.length <= k.maxPlay) return { type: 'play', cards: hand.map((c) => c.id), rank: hand[0].rank };
    // a rank nobody else can follow keeps the start (they pass, or bluff and get caught); otherwise the
    // rank with the most cards and the fewest copies out of sight
    const score = (r: number, n: number) => {
      const h = count(k, r).hidden;
      return (h === 0 ? 10 : 0) + 2 * Math.min(n, k.maxPlay) - h;
    };
    const ranks = [...byRank.entries()].sort((a, b) => score(b[0], b[1].length) - score(a[0], a[1].length));
    const [rank, cards] = ranks[0];
    const play = withLies(cards, rank, 0);
    return { type: 'play', cards: play.map((c) => c.id), rank };
  }
  const rank = k.rank;
  const mine = byRank.get(rank) ?? [];
  if (mine.length) {
    if (mine.length === hand.length && hand.length <= k.maxPlay) return { type: 'play', cards: hand.map((c) => c.id) };
    const play = withLies(mine, rank, k.pileCount);
    return { type: 'play', cards: play.map((c) => c.id) };
  }
  // none of the rank: bluff, or pass. Passing hands the next pile to the last player (in a duel: to the
  // opponent, who starts it with a truthful handful); a bluff that goes through keeps the pile going and
  // may win the start back
  if (hand.length > 1) {
    const S = alive(k) <= 2 ? 1.5 : 0.6;
    let best: { n: number; ev: number } = { n: 0, ev: smart ? 0.4 : 0 };
    for (let n = 1; n <= Math.min(2, k.maxPlay, hand.length - 1); n++) {
      const pc = catchChance(k, rank, n);
      const ev = (1 - pc) * (n + 2 * S) - pc * (k.pileCount + n + S);
      if (ev > best.ev) best = { n, ev };
    }
    if (best.n) return { type: 'play', cards: fillers(rank).slice(0, best.n).map((c) => c.id) };
  }
  return { type: 'pass' };
}

