/**
 * «الممالك الخمس» — the cards, the points and the arrangement solver, shared by the server (scoring,
 * going out, the bots) and the app (nothing here imports React Native or server code).
 *
 * The solver finds the arrangement of a hand that leaves the fewest points unplaced: books (3+ of a rank,
 * any suits) and runs (3+ consecutive ranks of one suit, 3…K, no wrap), wilds (jokers and the round's
 * rank) standing in for anything; a group may even be all wilds. It is an exact search over the natural
 * cards (memoised on the cards still free, the wilds left and how many spare wilds the groups made so far
 * can still take), so it is fast enough for every move of a 14-card hand.
 */
import { REALM_SUITS, type RealmCard, type RealmGroup, type RealmSuit } from './games/realms';

export const MIN_RANK = 3;
export const MAX_RANK = 13;
/** the longest run: 3…K */
const MAX_RUN = MAX_RANK - MIN_RANK + 1;

export const isJoker = (c: RealmCard) => c.rank === 0 || !c.suit;
/** A joker, or a card of the round's wild rank. */
export const isWild = (c: RealmCard, wild: number) => isJoker(c) || c.rank === wild;

/** 116 cards: two copies of 5 suits × 3…K, and 6 jokers. */
export function makeRealmsDeck(): RealmCard[] {
  const out: RealmCard[] = [];
  for (const copy of ['a', 'b']) {
    for (const suit of REALM_SUITS) for (let r = MIN_RANK; r <= MAX_RANK; r++) out.push({ id: `${copy}-${suit}-${r}`, suit, rank: r });
  }
  for (let i = 1; i <= 6; i++) out.push({ id: `J${i}`, suit: null, rank: 0 });
  return out;
}

/** Points of a card left unplaced at the end of a round: face value (J 11, Q 12, K 13), the round's wilds 20, jokers 50. */
export const cardPoints = (c: RealmCard, wild: number) => (isJoker(c) ? 50 : c.rank === wild ? 20 : c.rank);

export const rankLabel = (r: number) => (r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : r === 0 ? '★' : String(r));
const RANK_AR: Record<number, string> = { 11: 'ولد', 12: 'ملكة', 13: 'ملك' };
export const SUIT_AR: Record<RealmSuit, string> = { fire: 'نار', sun: 'شمس', leaf: 'غصن', water: 'ماء', star: 'نجمة' };
/** «7 نار», «ملكة شمس», «جوكر» */
export function realmCardName(c: RealmCard): string {
  if (isJoker(c)) return 'جوكر';
  return `${RANK_AR[c.rank] ?? c.rank} ${SUIT_AR[c.suit!]}`;
}
/** «الخمسات», «الأولاد»… the wild rank of a round, for the round line (plain «5» is clearer on cards). */
export const wildLabel = (r: number) => rankLabel(r);

const SUIT_ORDER: Record<RealmSuit, number> = { fire: 0, sun: 1, leaf: 2, water: 3, star: 4 };

/** By suit then rank (wilds last), or by rank then suit. */
export function sortRealms(cards: RealmCard[], wild: number, by: 'suit' | 'rank' = 'suit'): RealmCard[] {
  return cards.slice().sort((a, b) => {
    const wa = isWild(a, wild) ? 1 : 0;
    const wb = isWild(b, wild) ? 1 : 0;
    if (wa !== wb) return wa - wb;
    if (wa) return Number(isJoker(a)) - Number(isJoker(b)) || a.id.localeCompare(b.id);
    if (by === 'suit') return SUIT_ORDER[a.suit!] - SUIT_ORDER[b.suit!] || a.rank - b.rank || a.id.localeCompare(b.id);
    return a.rank - b.rank || SUIT_ORDER[a.suit!] - SUIT_ORDER[b.suit!] || a.id.localeCompare(b.id);
  });
}

/**
 * Is this one valid group? (Checked directly from the rule, independently of the solver: used to
 * validate, and by the tests as the reference.) 3+ cards; all wilds; or the naturals all of one rank
 * (a book); or all of one suit with distinct ranks fitting in a window as long as the group, ≤ 11 (a run).
 */
export function isGroup(cards: RealmCard[], wild: number): boolean {
  if (cards.length < 3) return false;
  const nat = cards.filter((c) => !isWild(c, wild));
  if (!nat.length) return true;
  if (nat.every((c) => c.rank === nat[0].rank)) return true;
  if (cards.length > MAX_RUN) return false;
  if (!nat.every((c) => c.suit === nat[0].suit)) return false;
  const ranks = nat.map((c) => c.rank);
  if (new Set(ranks).size !== ranks.length) return false;
  return Math.max(...ranks) - Math.min(...ranks) + 1 <= cards.length;
}

/* ------------------------------------------------------------------ */
/* The solver                                                          */
/* ------------------------------------------------------------------ */

export interface SolveOptions {
  /**
   * For the bots' judgement of a hand (not the score): two natural cards that need one more card to
   * become a group (a pair of a rank, or two of a suit 1–2 apart) count only this share of their points.
   */
  pair?: number;
  /** The same for two of a suit in a row (fewer cards finish them than a pair of a rank), and two apart. */
  pairRun?: number;
  pairGap?: number;
  /** For the bots: the share of points of wilds that fit nowhere yet (they almost always will). */
  wildKeep?: number;
  /** One card may be left out for free (a hand with one card too many: the card that will be thrown). */
  drop?: boolean;
}

type Move =
  | { t: 'left' }
  | { t: 'book'; with: number[]; need: number }
  | { t: 'run'; with: number[]; need: number; lo: number; hi: number }
  | { t: 'pair'; with: number };

interface Ctx {
  nat: RealmCard[];
  pts: number[];
  /** the wilds' points, cheapest first */
  wildPts: number[];
  wildPrefix: number[];
  memo: Map<number, number>;
  memoDrop: Map<number, number>;
  pair: number;
  pairRun: number;
  pairGap: number;
  wildKeep: number;
}

const lowBit = (m: number) => {
  let i = 0;
  while (!((m >>> i) & 1)) i++;
  return i;
};

/** The cost of the wilds still free once every natural card is placed or not. */
function leftoverWilds(cx: Ctx, wl: number, cap: number): number {
  if (wl === 0 || wl >= 3) return 0; // none, or a book of wilds
  const k = Math.max(0, wl - cap); // the groups take `cap` of them (the dearest: what stays free is the cheapest)
  return cx.wildPrefix[k] * cx.wildKeep;
}

/** Every move for the lowest free natural card (index i), with the state it leads to. */
function moves(cx: Ctx, mask: number, wl: number, visit: (m: Move, mask: number, wl: number, capAdd: number, cost: number) => void) {
  const { nat } = cx;
  const i = lowBit(mask);
  const c = nat[i];
  const rest = mask & ~(1 << i);
  // 1. it stays in hand
  visit({ t: 'left' }, rest, wl, 0, cx.pts[i]);
  // 2. a book with any of the other free cards of its rank
  const same: number[] = [];
  for (let j = i + 1; j < nat.length; j++) if ((rest >>> j) & 1 && nat[j].rank === c.rank) same.push(j);
  const subsets = 1 << same.length;
  for (let s = 0; s < subsets; s++) {
    const pick: number[] = [];
    let m = rest;
    for (let k = 0; k < same.length; k++) {
      if ((s >>> k) & 1) {
        pick.push(same[k]);
        m &= ~(1 << same[k]);
      }
    }
    const need = Math.max(0, 3 - 1 - pick.length);
    if (need <= wl) visit({ t: 'book', with: pick, need }, m, wl - need, 2, 0);
  }
  // 3. a run of its suit starting at it (at least two naturals: one natural + 2 wilds is the book above)
  const byRank: number[] = [];
  for (let j = i + 1; j < nat.length; j++) {
    const d = nat[j];
    if ((rest >>> j) & 1 && d.suit === c.suit && d.rank > c.rank && byRank[d.rank] === undefined) byRank[d.rank] = j;
  }
  const ranks: number[] = [];
  for (let r = c.rank + 1; r <= MAX_RANK; r++) if (byRank[r] !== undefined) ranks.push(r);
  const chosen: number[] = [];
  const dfs = (from: number, m: number) => {
    for (let k = from; k < ranks.length; k++) {
      const r = ranks[k];
      const span = r - c.rank + 1;
      const gaps = span - (chosen.length + 2);
      if (gaps > wl) break; // further ranks only need more wilds
      const j = byRank[r];
      chosen.push(j);
      const m2 = m & ~(1 << j);
      const need = gaps + Math.max(0, 3 - span);
      if (need <= wl) visit({ t: 'run', with: chosen.slice(), need, lo: c.rank, hi: r }, m2, wl - need, Math.min(2, MAX_RUN - Math.max(3, span)), 0);
      dfs(k + 1, m2);
      chosen.pop();
    }
  };
  dfs(0, rest);
  // 4. (the bots' judgement) a pair one card short of a group
  if (cx.pair < 1 || cx.pairRun < 1 || cx.pairGap < 1) {
    for (let j = i + 1; j < nat.length; j++) {
      if (!((rest >>> j) & 1)) continue;
      const d = nat[j];
      const gap = d.suit === c.suit ? Math.abs(d.rank - c.rank) : 0;
      const share = d.rank === c.rank ? cx.pair : gap === 1 ? cx.pairRun : gap === 2 ? cx.pairGap : 1;
      if (share < 1) visit({ t: 'pair', with: j }, rest & ~(1 << j), wl, 0, (cx.pts[i] + cx.pts[j]) * share);
    }
  }
}

function best(cx: Ctx, mask: number, wl: number, cap: number): number {
  if (mask === 0) return leftoverWilds(cx, wl, cap);
  const key = (mask * 32 + wl) * 3 + cap;
  const hit = cx.memo.get(key);
  if (hit !== undefined) return hit;
  let v = Infinity;
  moves(cx, mask, wl, (_m, m2, w2, capAdd, cost) => {
    if (cost >= v) return;
    const t = cost + best(cx, m2, w2, Math.min(2, cap + capAdd));
    if (t < v) v = t;
  });
  cx.memo.set(key, v);
  return v;
}

/** As best(), with one card that may still be left out for free. */
function bestDrop(cx: Ctx, mask: number, wl: number, cap: number): number {
  if (mask === 0) return wl > 0 ? Math.min(leftoverWilds(cx, wl, cap), leftoverWilds(cx, wl - 1, cap)) : 0;
  const key = (mask * 32 + wl) * 3 + cap;
  const hit = cx.memoDrop.get(key);
  if (hit !== undefined) return hit;
  // leave the lowest free natural card out (and nothing else for free), or don't
  let v = best(cx, mask & ~(1 << lowBit(mask)), wl, cap);
  moves(cx, mask, wl, (_m, m2, w2, capAdd, cost) => {
    if (cost >= v) return;
    const t = cost + bestDrop(cx, m2, w2, Math.min(2, cap + capAdd));
    if (t < v) v = t;
  });
  cx.memoDrop.set(key, v);
  return v;
}

function makeCtx(cards: RealmCard[], wild: number, opts: SolveOptions = {}): { cx: Ctx; wilds: RealmCard[] } {
  const nat = cards.filter((c) => !isWild(c, wild)).sort((a, b) => a.rank - b.rank || SUIT_ORDER[a.suit!] - SUIT_ORDER[b.suit!] || a.id.localeCompare(b.id));
  const wilds = cards.filter((c) => isWild(c, wild)).sort((a, b) => cardPoints(a, wild) - cardPoints(b, wild) || a.id.localeCompare(b.id));
  const wildPts = wilds.map((c) => cardPoints(c, wild));
  const wildPrefix = [0];
  for (const p of wildPts) wildPrefix.push(wildPrefix[wildPrefix.length - 1] + p);
  if (nat.length > 24) throw new Error('hand too big');
  return {
    cx: { nat, pts: nat.map((c) => cardPoints(c, wild)), wildPts, wildPrefix, memo: new Map(), memoDrop: new Map(), pair: opts.pair ?? 1, pairRun: opts.pairRun ?? opts.pair ?? 1, pairGap: opts.pairGap ?? opts.pair ?? 1, wildKeep: opts.wildKeep ?? 1 },
    wilds,
  };
}

/** The fewest points this hand leaves unplaced (0 = every card fits in a group). */
export function leftPoints(cards: RealmCard[], wild: number, opts?: SolveOptions): number {
  const { cx, wilds } = makeCtx(cards, wild, opts);
  return (opts?.drop ? bestDrop : best)(cx, (1 << cx.nat.length) - 1, wilds.length, 0);
}

export interface Arrangement {
  groups: RealmGroup[];
  left: RealmCard[];
  points: number;
}

/** The best arrangement of a hand: its groups (cards in display order) and the cards left over. */
export function arrange(cards: RealmCard[], wild: number): Arrangement {
  const { cx, wilds } = makeCtx(cards, wild);
  const full = (1 << cx.nat.length) - 1;
  const points = best(cx, full, wilds.length, 0);
  // follow the best moves again, recording them
  type Plan = { kind: 'book' | 'run'; nat: RealmCard[]; need: number; lo: number; hi: number };
  const plans: Plan[] = [];
  const left: RealmCard[] = [];
  let mask = full;
  let wl = wilds.length;
  let cap = 0;
  while (mask) {
    const target = best(cx, mask, wl, cap);
    let done = false;
    const i = lowBit(mask);
    moves(cx, mask, wl, (m, m2, w2, capAdd, cost) => {
      if (done || m.t === 'pair') return;
      const c2 = Math.min(2, cap + capAdd);
      if (Math.abs(cost + best(cx, m2, w2, c2) - target) > 1e-9) return;
      done = true;
      const c = cx.nat[i];
      if (m.t === 'left') left.push(c);
      else if (m.t === 'book') plans.push({ kind: 'book', nat: [c, ...m.with.map((j) => cx.nat[j])], need: m.need, lo: c.rank, hi: c.rank });
      else plans.push({ kind: 'run', nat: [c, ...m.with.map((j) => cx.nat[j])], need: m.need, lo: m.lo, hi: m.hi });
      mask = m2;
      wl = w2;
      cap = c2;
    });
    if (!done) throw new Error('arrange: no move matches');
  }
  // the wilds: the dearest go into the groups first, then the spares make a book of their own (3 or
  // more) or join groups with room (books first); what stays free is the cheapest
  const pool = wilds.slice().reverse();
  const taken: RealmCard[][] = plans.map((p) => pool.splice(0, p.need));
  const wildBook = pool.length >= 3 ? pool.splice(0) : null;
  const order = plans.map((_, k) => k).sort((a, b) => Number(plans[a].kind === 'run') - Number(plans[b].kind === 'run'));
  for (const k of order) {
    const p = plans[k];
    let room = p.kind === 'book' ? Infinity : MAX_RUN - Math.max(3, p.hi - p.lo + 1);
    while (pool.length && room > 0) {
      taken[k].push(pool.shift()!);
      room--;
    }
  }
  const groups = plans.map((p, k) => layOut(p.kind, p.nat, taken[k], p.lo, p.hi, wild));
  if (wildBook) groups.push({ kind: 'book', cards: wildBook, ranks: wildBook.map(() => 0) });
  left.push(...pool);
  return { groups, left: sortRealms(left, wild, 'rank'), points };
}

/** A group in display order: a run low to high with each wild where it counts, a book with its wilds after. */
function layOut(kind: 'book' | 'run', nat: RealmCard[], wilds: RealmCard[], lo: number, hi: number, wild: number): RealmGroup {
  if (kind === 'book') {
    const ns = sortRealms(nat, wild, 'suit');
    return { kind, cards: [...ns, ...wilds], ranks: [...ns, ...wilds].map(() => lo) };
  }
  const byRank = new Map(nat.map((c) => [c.rank, c]));
  const free = wilds.slice();
  const cards: RealmCard[] = [];
  const ranks: number[] = [];
  for (let r = lo; r <= hi; r++) {
    const c = byRank.get(r) ?? free.shift()!;
    cards.push(c);
    ranks.push(r);
  }
  // the spare wilds extend the run upwards, then downwards
  let top = hi;
  let bottom = lo;
  while (free.length) {
    const c = free.shift()!;
    if (top < MAX_RANK) {
      top++;
      cards.push(c);
      ranks.push(top);
    } else {
      bottom--;
      cards.unshift(c);
      ranks.unshift(bottom);
    }
  }
  return { kind, cards, ranks };
}

/**
 * With one card too many (after drawing): the cards that can be thrown so that everything else is laid
 * down. Empty when the hand can't go out.
 */
export function outCards(hand: RealmCard[], wild: number): string[] {
  const out: string[] = [];
  const seen = new Map<string, boolean>();
  for (const c of hand) {
    // two copies of a card (or two jokers, two wilds of the same worth) give the same answer
    const kind = isJoker(c) ? 'J' : `${c.suit}-${c.rank}`;
    let ok = seen.get(kind);
    if (ok === undefined) {
      ok = leftPoints(hand.filter((x) => x !== c), wild) === 0;
      seen.set(kind, ok);
    }
    if (ok) out.push(c.id);
  }
  return out;
}

/** The throw that leaves the fewest points (ties: throw the dearest card), and those points. `keep`: a card that can't be thrown (just taken). */
export function bestThrow(hand: RealmCard[], wild: number, opts?: SolveOptions, keep: string | null = null): { card: RealmCard; points: number } {
  const free = hand.filter((c) => c.id !== keep);
  let pick = free[0];
  let bestV = Infinity;
  const seen = new Map<string, number>();
  for (const c of free) {
    const kind = isJoker(c) ? 'J' : `${c.suit}-${c.rank}`;
    let v = seen.get(kind);
    if (v === undefined) {
      v = leftPoints(hand.filter((x) => x !== c), wild, opts);
      seen.set(kind, v);
    }
    if (v < bestV - 1e-9 || (Math.abs(v - bestV) <= 1e-9 && cardPoints(c, wild) > cardPoints(pick, wild))) {
      bestV = v;
      pick = c;
    }
  }
  return { card: pick, points: bestV };
}

/** «3 نار، 4 نار، جوكر» — a group read out (for accessibility labels). */
export const groupName = (g: RealmGroup) => (g.kind === 'book' ? 'مجموعة' : 'متتالية');
