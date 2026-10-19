/**
 * الكونكان — the strong bot.
 * - The hand is split into melds by an exact search (the split that leaves the fewest penalty points);
 *   loose cards that fit a meld on the table are laid off.
 * - A hand is judged by how far it is from going out: loose cards first (melded cards are done), then
 *   live two-card starts (pairs / neighbours whose third card is still unseen: not in its hand, on the
 *   table or in the discard pile — everything thrown was shown), then penalty points, which weigh more
 *   as an opponent gets close to going out.
 * - It takes the face-up card only when it goes into a meld, never throws a card that fits a meld on the
 *   table, keeps away from what the next player picked up (closer to what they threw), and prefers
 *   throwing cards whose partners are already in sight.
 * - Melds stay in the hand (nobody can add to them) until it can go out in one go, unless an opponent
 *   is close to going out, the stock is running low or the hand is getting expensive.
 * Sees only what its own phone shows (plus what everybody saw thrown and picked up).
 */
import { RANKS, SUITS, isKonkanMeld, rankIndex, type Card } from '../../src/shared/cards';
import type { BotLevel, GameAction, KonkanMeld } from '../../src/shared/protocol';

export const konkanValue = (c: Card) => (c.rank <= 7 ? c.rank : 10);

export interface KonkanKnowledge {
  me: string;
  step: 'draw' | 'play';
  hand: Card[];
  melds: KonkanMeld[];
  discard: Card[];
  takenDiscard: string | null;
  /** players still in, in seat order starting after me */
  next: string[];
  handCounts: Record<string, number>;
  stockLeft: number;
  reshuffles: number;
  maxReshuffles: number;
  /** public history of this hand: who took which face-up card, who threw what */
  log: { by: string; card: Card; kind: 'take' | 'throw' }[];
}

/** Every meld that can be made from these cards (sets of 3–4, runs of 3+). */
export function allMelds(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  const byRank = new Map<number, Card[]>();
  const bySuit = new Map<string, Card[]>();
  for (const c of cards) {
    byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
    bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
  }
  for (const g of byRank.values()) {
    if (g.length >= 3) out.push(g.slice(0, 4));
    if (g.length === 4) for (let skip = 0; skip < 4; skip++) out.push(g.filter((_, j) => j !== skip));
  }
  for (const g of bySuit.values()) {
    const s = g.slice().sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && rankIndex(s[j + 1].rank) === rankIndex(s[j].rank) + 1) j++;
      for (let a = i; a <= j; a++) for (let b = a + 2; b <= j; b++) out.push(s.slice(a, b + 1));
      i = j;
    }
  }
  // de-duplicate
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = m.map((c) => c.id).sort().join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface Split {
  melds: Card[][];
  dead: Card[];
  deadValue: number;
}

/** The meld split with the fewest penalty points left (ties: more cards melded). */
export function bestSplit(cards: Card[]): Split {
  const n = cards.length;
  const melds = allMelds(cards).map((m) => {
    let mask = 0;
    for (const c of m) mask |= 1 << cards.indexOf(c);
    return { m, mask };
  });
  const memo = new Map<number, { v: number; pick: number[] }>();
  const solve = (used: number): { v: number; pick: number[] } => {
    const hit = memo.get(used);
    if (hit) return hit;
    let first = -1;
    for (let i = 0; i < n; i++) if (!(used & (1 << i))) {
      first = i;
      break;
    }
    if (first < 0) return { v: 0, pick: [] };
    // the first free card is either loose…
    const loose = solve(used | (1 << first));
    let best = { v: loose.v + konkanValue(cards[first]), pick: loose.pick };
    // …or in a meld
    for (let k = 0; k < melds.length; k++) {
      const { mask } = melds[k];
      if (!(mask & (1 << first)) || mask & used) continue;
      const r = solve(used | mask);
      if (r.v < best.v) best = { v: r.v, pick: [k, ...r.pick] };
    }
    memo.set(used, best);
    return best;
  };
  const r = solve(0);
  const chosen = r.pick.map((k) => melds[k].m);
  const inMeld = new Set(chosen.flat().map((c) => c.id));
  const dead = cards.filter((c) => !inMeld.has(c.id));
  return { melds: chosen, dead, deadValue: r.v };
}

/** Cards that can go on the table melds, one after another (a run can grow card by card). */
export function layoffs(cards: Card[], melds: KonkanMeld[]): { card: Card; meld: number }[] {
  const table = melds.map((m) => ({ id: m.id, cards: m.cards.slice() }));
  const left = cards.slice();
  const out: { card: Card; meld: number }[] = [];
  let moved = true;
  while (moved) {
    moved = false;
    for (const c of left) {
      const m = table.find((t) => isKonkanMeld([...t.cards, c]));
      if (m) {
        m.cards.push(c);
        out.push({ card: c, meld: m.id });
        left.splice(left.indexOf(c), 1);
        moved = true;
        break;
      }
    }
  }
  return out;
}

interface Ctx {
  live: Card[];
  melds: KonkanMeld[];
  danger: (c: Card) => number;
}

/** Penalty left after melds and lay-offs, minus the live chances of the loose cards (lower = better). */
function judge(hand: Card[], cx: Ctx, pointsWeight: number): number {
  const sp = bestSplit(hand);
  const off = layoffs(sp.dead, cx.melds);
  const offIds = new Set(off.map((o) => o.card.id));
  const dead = sp.dead.filter((c) => !offIds.has(c.id));
  let points = 0;
  for (const c of dead) points += konkanValue(c);
  if (!dead.length) return 0;
  // how far from going out: loose cards paired into live two-card starts (one card away each), the
  // rest alone (two cards away); and how many live cards help at all
  const liveFor = (a: Card, b: Card) => {
    let k = 0;
    for (const u of cx.live) if (isKonkanMeld([a, b, u])) k++;
    return k;
  };
  const pairOuts: number[][] = dead.map(() => dead.map(() => 0));
  for (let i = 0; i < dead.length; i++)
    for (let j = i + 1; j < dead.length; j++) pairOuts[i][j] = pairOuts[j][i] = liveFor(dead[i], dead[j]);
  let bestPairs = 0;
  let bestOuts = 0;
  const used = new Array(dead.length).fill(false);
  const match = (i: number, pairs: number, outs: number) => {
    while (i < dead.length && used[i]) i++;
    if (i >= dead.length) {
      if (pairs > bestPairs || (pairs === bestPairs && outs > bestOuts)) {
        bestPairs = pairs;
        bestOuts = outs;
      }
      return;
    }
    used[i] = true;
    match(i + 1, pairs, outs);
    for (let j = i + 1; j < dead.length; j++) {
      if (used[j] || !pairOuts[i][j]) continue;
      used[j] = true;
      match(i + 1, pairs + 1, outs + pairOuts[i][j]);
      used[j] = false;
    }
    used[i] = false;
  };
  match(0, 0, 0);
  // a loose card that would grow one of the hand's melds with a live card is close too
  let grow = 0;
  for (const u of cx.live) if (sp.melds.some((m) => isKonkanMeld([...m, u]))) grow++;
  // fewer loose cards first (melded cards are done), live pairs next, then their chances and points
  return 6 * dead.length - 4 * bestPairs - 0.5 * bestOuts - 0.3 * grow + pointsWeight * points;
}

function chooseDiscard(hand: Card[], k: KonkanKnowledge, cx: Ctx, level: BotLevel): Card {
  const throwable = hand.length > 1 ? hand.filter((c) => c.id !== k.takenDiscard) : hand;
  let best = throwable[0];
  let bestV = Infinity;
  // penalty points matter more once someone is close to going out
  const minOpp = Math.min(...k.next.map((id) => k.handCounts[id] ?? 10));
  const pw = minOpp <= 3 ? 2 : minOpp <= 5 ? 1 : 0.4;
  for (const c of throwable) {
    const rest = hand.filter((x) => x !== c);
    let v = judge(rest, cx, pw) + cx.danger(c);
    if (level === 'smart') v += Math.random() * 3;
    if (v < bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/** One action for the bot's turn. */
export function konkanBotAction(k: KonkanKnowledge, level: BotLevel): GameAction {
  const all = new Set([...k.hand, ...k.melds.flatMap((m) => m.cards), ...k.discard].map((c) => c.id));
  const live: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) if (!all.has(`${suit}-${rank}`)) live.push({ id: `${suit}-${rank}`, suit, rank });
  const nextP = k.next[0];
  const takes = k.log.filter((e) => e.by === nextP && e.kind === 'take').map((e) => e.card);
  const throws = k.log.filter((e) => e.by === nextP && e.kind === 'throw').map((e) => e.card);
  const near = (a: Card, b: Card, d: number) => a.suit === b.suit && Math.abs(rankIndex(a.rank) - rankIndex(b.rank)) <= d;
  const danger = (c: Card) => {
    let d = 0;
    if (k.melds.some((m) => isKonkanMeld([...m.cards, c]))) d += 6; // the next player lays it off at once
    for (const t of takes) {
      if (t.rank === c.rank) d += 3;
      if (near(t, c, 2) && t.id !== c.id) d += 2.5;
    }
    for (const t of throws) {
      if (t.rank === c.rank) d -= 1;
      if (near(t, c, 1)) d -= 0.5;
    }
    // how much the card can still do for someone else: its live partners (unseen same number, unseen
    // neighbours in its suit) — a card whose partners are all in sight is a safe throw
    const W = 0.3;
    for (const u of live) {
      if (u.rank === c.rank) d += W;
      else if (near(u, c, 1)) d += W;
      else if (near(u, c, 2)) d += W / 2;
    }
    return d;
  };
  const cx: Ctx = { live, melds: k.melds, danger };

  if (k.step === 'draw') {
    const top = k.discard[k.discard.length - 1];
    if (!top) return { type: 'drawStock' };
    const now = bestSplit(k.hand);
    const withTop = [...k.hand, top];
    // the best the hand can be after taking it (it can't be thrown straight back)
    let bestAfter = Infinity;
    for (const c of k.hand) {
      const rest = withTop.filter((x) => x !== c);
      const sp = bestSplit(rest);
      const off = layoffs(sp.dead, k.melds);
      const offIds = new Set(off.map((o) => o.card.id));
      const dv = sp.dead.filter((x) => !offIds.has(x.id)).reduce((t, x) => t + konkanValue(x), 0);
      bestAfter = Math.min(bestAfter, dv);
    }
    const offNow = new Set(layoffs(now.dead, k.melds).map((o) => o.card.id));
    const dvNow = now.dead.filter((x) => !offNow.has(x.id)).reduce((t, x) => t + konkanValue(x), 0);
    // take it if it goes into a meld (or onto one) and lowers the loose points clearly
    const inMeld = bestSplit(withTop).melds.some((m) => m.includes(top)) || k.melds.some((m) => isKonkanMeld([...m.cards, top]));
    const gain = dvNow - bestAfter;
    if (bestAfter === 0 || (inMeld && gain >= Math.min(4, konkanValue(top)))) return { type: 'drawDiscard' };
    return { type: 'drawStock' };
  }

  // play step
  const hand = k.hand;
  const sp = bestSplit(hand);
  const off = layoffs(sp.dead, k.melds);
  const offIds = new Set(off.map((o) => o.card.id));
  const loose = sp.dead.filter((c) => !offIds.has(c.id));
  // can go out this turn: everything melded / laid off but at most one card to throw
  // (the card just taken may be thrown when it is the very last one)
  const canOut = loose.length <= 1;
  if (sp.melds.length && (canOut || shouldLay(k, sp))) return { type: 'meld', cards: sp.melds[0].map((c) => c.id) };
  // shed loose cards onto the table melds (always: fewer points in hand, closer to going out)
  if (off.length) return { type: 'layoff', cards: [off[0].card.id], meld: off[0].meld };
  if (hand.length === 1) return { type: 'discard', card: hand[0].id };
  return { type: 'discard', card: chooseDiscard(hand, k, cx, level).id };
}

/** Lay the hand's melds down now? (Holding them keeps others from adding to them.) */
function shouldLay(k: KonkanKnowledge, sp: Split): boolean {
  if (!sp.melds.length) return false;
  const minOpp = Math.min(...k.next.map((id) => k.handCounts[id] ?? 10));
  const inMelds = sp.melds.flat().reduce((t, c) => t + konkanValue(c), 0);
  if (minOpp <= 4) return true;
  if (inMelds + sp.deadValue >= 45) return true;
  if (k.reshuffles >= k.maxReshuffles && k.stockLeft < 8) return true;
  return false;
}
