/**
 * «البلوط» — the expert bots (Saudi and Moroccan rules) and the «الباقي لنا» check.
 *
 * A bot only uses what its own phone shows: its hand, the cards played (who played what), the bids,
 * the face-up card the buyer took, the projects / announcements shown, «بلوط» said. From the play it
 * deduces voids and «no higher trump» (a duty that was not met means the player could not meet it).
 * Card play is determinized Monte-Carlo: deals of the unknown cards consistent with all that (biased
 * towards the buyer holding the big trumps, away from those who passed on the trump suit) are played
 * out with a quick policy (the last 5 tricks solved exactly), and the card with the best average hand
 * score wins; cards clearly behind are dropped early so the close calls get the samples.
 * Purchases: the plain, fitted reading of the hand (./baloot-bid.ts) blended with whole-hand
 * simulations of each contract and of passing (deals consistent with the passes so far); doubling
 * simulates the same way.
 */
import type { BalootOption, BalootRaise, BCard, BSide } from '../../src/shared/games/baloot';
import { B_SUITS, scoreHand } from '../../src/shared/baloot-rules';
import { sunStrength } from '../baloot-bot';
import { BAD_VALUE, BUY_RULE, hokmEval, hokmWhy } from './baloot-bid';
import { MA_BELOTE, maScoreHand } from '../../src/shared/baloot-morocco';
import type { State } from '../games/baloot';
import { cardsOf, claimCertain, ci, ddValue, maskOf, NT, popcount, POW, rollout, Sim, trumpIndex, VAL } from './baloot-engine';

export type MindLevel = 'smart' | 'expert';

const now = () => performance.now();
/** the simulations are played «blind»: each player sees only its own hand (closer to real games) */
const BLIND_PLAY = true;
const BLIND_BID = true;
const seatOf = (s: State, id: string) => s.seats.indexOf(id);
const sideKey = (team: number): BSide => (team === 0 ? 'A' : 'B');

/* ------------------------------------------------------------------ */
/* What a seat knows                                                   */
/* ------------------------------------------------------------------ */

export interface Know {
  me: number;
  mine: number;
  /** cards each seat holds now */
  need: number[];
  /** cards known to be in another seat's hand */
  fixed: number[];
  /** suits (bit per suit) each seat has shown it lacks */
  voids: number[];
  /** the highest trump power each seat may still hold (8: no limit) */
  cap: number[];
  /** cards whose place is unknown */
  pool: number;
  /** soft inference from the bids: how likely a seat is to hold a card (1 = no idea) */
  weight: (seat: number, card: number) => number;
}

/** What the duties tell about the players of one trick (voids, «no trump above X»). */
function inferTrick(plays: { seat: number; card: number }[], boss: boolean, t: number, ma: boolean, voids: number[], cap: number[]) {
  if (!plays.length) return;
  const T = t * 32;
  const led = plays[0].card >> 3;
  for (let k = 1; k < plays.length; k++) {
    const { seat: p, card: c } = plays[k];
    const cs = c >> 3;
    if (cs !== led) voids[p] |= 1 << led;
    if (t === NT) continue;
    let top = 0;
    let hold = 0;
    for (let j = 0; j < k; j++) {
      const x = plays[j].card;
      if (x >> 3 === t && POW[T + x] > top) top = POW[T + x];
      const a = plays[hold].card;
      if (j > 0 && ((x >> 3 === a >> 3 && POW[T + x] > POW[T + a]) || (x >> 3 === t && a >> 3 !== t))) hold = j;
    }
    const partnerHolds = k >= 2 && hold === k - 2;
    const capAt = (v: number) => {
      cap[p] = Math.min(cap[p], v);
    };
    if (led === t) {
      if (cs === t && POW[T + c] <= top && (ma || !partnerHolds)) capAt(top);
      continue;
    }
    if (cs === led) continue;
    if (ma ? partnerHolds : partnerHolds && (k === 3 || boss)) continue;
    if (cs !== t) {
      if (top > 0) capAt(top);
      else voids[p] |= 1 << t;
    } else if (top > 0 && POW[T + c] <= top) capAt(top);
  }
}

export function know(s: State, id: string, weights = true): Know {
  const me = seatOf(s, id);
  const c = s.contract!;
  const t = trumpIndex(c.trump);
  const ma = s.settings.mode === 'morocco';
  const voids = [0, 0, 0, 0];
  const cap = [8, 8, 8, 8];
  const log = s.log ?? [];
  for (const tr of log) inferTrick(tr.plays.map((p) => ({ seat: seatOf(s, p.by), card: ci(p.card) })), tr.boss, t, ma, voids, cap);
  inferTrick(s.trick.map((p) => ({ seat: seatOf(s, p.by), card: ci(p.card) })), s.leadBoss, t, ma, voids, cap);
  const gone = maskOf(s.played) | maskOf(s.trick.map((p) => p.card));
  const mine = maskOf(s.hands[id]);
  const fixed = [0, 0, 0, 0];
  const put = (by: string, cards: BCard[]) => {
    const p = seatOf(s, by);
    if (p < 0 || p === me) return;
    fixed[p] |= maskOf(cards) & ~gone & ~mine;
  };
  if (s.upCard) put(c.buyer, [s.upCard]);
  if (!ma && s.shown) for (const d of s.shown.items) put(d.by, d.project.cards);
  if (ma && s.maShown) for (const d of s.maShown.items) put(d.by, d.ann.cards);
  if (ma && s.balootHolder && s.balootPlayed === 1 && c.trump) put(s.balootHolder, [{ id: `K${c.trump}`, suit: c.trump, rank: 'K' }, { id: `Q${c.trump}`, suit: c.trump, rank: 'Q' }]);
  // a card fixed for two seats can't happen; keep the first
  for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) fixed[q] &= ~fixed[p];
  const need = s.seats.map((x) => s.hands[x].length);
  let known = mine | gone;
  for (const f of fixed) known |= f;
  const pool = ~known;
  const buyer = seatOf(s, c.buyer);
  const T = t * 32;
  // who passed on the trump suit before the buyer took it (a player who passes rarely holds its J / 9)
  let declined = 0;
  if (s.bid && t < NT) {
    const order = s.bid.order.map((x) => seatOf(s, x));
    for (const p of order.slice(0, order.indexOf(buyer))) if (s.bid.calls[s.seats[p]]?.call === 'pass') declined |= 1 << p;
  }
  const weight = (seat: number, card: number) => {
    if (!weights) return 1;
    if (t < NT) {
      if (card >> 3 !== t) return 1;
      const pw = POW[T + card];
      if (seat === buyer) return pw >= 6 ? 2.6 : 1.5;
      const d = declined & (1 << seat) && pw >= 7 ? 0.6 : 1;
      if (seat === ((buyer + 2) & 3)) return 1.1 * d;
      return (pw >= 6 ? 0.75 : 0.9) * d;
    }
    // صن: the buyer tends to hold the aces and tens
    if (seat === buyer && VAL[T + card] >= 10) return 1.8;
    return 1;
  };
  return { me, mine, need, fixed, voids, cap, pool, weight };
}

/** Deal the unknown cards to the other seats, every known fact respected (relaxed only if it can't be). */
export function sampleDeal(k: Know, t: number, rnd: () => number = Math.random): number[] | null {
  return makeSampler(k, t)(rnd);
}

/**
 * A dealer of the unknown cards for many samples of the same position: what may go where (voids, «no
 * trump above X»), the soft weights and the dealing order are worked out once.
 */
export function makeSampler(k: Know, t: number): (rnd?: () => number) => number[] | null {
  const cards: number[] = [];
  let m = k.pool;
  while (m) {
    const b = m & -m;
    cards.push(31 - Math.clz32(b));
    m ^= b;
  }
  const T = t * 32;
  const need = [0, 0, 0, 0];
  let total = 0;
  let bad = false;
  for (let p = 0; p < 4; p++) {
    if (p === k.me) continue;
    need[p] = k.need[p] - popcount(k.fixed[p]);
    if (need[p] < 0) bad = true;
    total += need[p];
  }
  if (bad || total !== cards.length) return () => null;
  // ok[relax][card]: bit per seat that may hold the card (relax 1: «no trump above» dropped, 2: voids too)
  const ok = [new Int32Array(32), new Int32Array(32), new Int32Array(32)];
  const w = new Float64Array(4 * 32);
  for (const c of cards) {
    for (let p = 0; p < 4; p++) {
      if (p === k.me || need[p] <= 0) continue;
      const voidOk = !(k.voids[p] & (1 << (c >> 3)));
      const capOk = !(c >> 3 === t && POW[T + c] > k.cap[p]);
      if (voidOk && capOk) ok[0][c] |= 1 << p;
      if (voidOk) ok[1][c] |= 1 << p;
      ok[2][c] |= 1 << p;
      w[p * 32 + c] = k.weight(p, c);
    }
  }
  // the most constrained cards first (ties shuffled each time)
  const orders = ok.map((o) => cards.slice().sort((a, b) => popcount(o[a]) - popcount(o[b])));
  const widths = ok.map((o, r) => orders[r].map((c) => popcount(o[c])));
  const order = new Array<number>(cards.length);
  return (rnd = Math.random) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const relax = attempt >= 30 ? 2 : attempt >= 20 ? 1 : 0;
      const okr = ok[relax];
      // shuffle inside each group of equal width
      const src = orders[relax];
      const wid = widths[relax];
      for (let i = 0; i < src.length; i++) order[i] = src[i];
      for (let i = 0; i < order.length; ) {
        let j = i;
        while (j < order.length && wid[j] === wid[i]) j++;
        for (let q = j - 1; q > i; q--) {
          const r = i + Math.floor(rnd() * (q - i + 1));
          const tmp = order[q];
          order[q] = order[r];
          order[r] = tmp;
        }
        i = j;
      }
      const h = [0, 0, 0, 0];
      const left = need.slice();
      for (let p = 0; p < 4; p++) h[p] = p === k.me ? k.mine : k.fixed[p];
      let fail = false;
      for (let i = 0; i < order.length; i++) {
        const c = order[i];
        const bits = okr[c];
        let tot = 0;
        const ws = [0, 0, 0, 0];
        for (let p = 0; p < 4; p++) {
          if (!(bits & (1 << p)) || left[p] <= 0) continue;
          ws[p] = left[p] * w[p * 32 + c];
          tot += ws[p];
        }
        if (tot <= 0) {
          fail = true;
          break;
        }
        let r = rnd() * tot;
        let p = 0;
        for (; p < 3; p++) {
          r -= ws[p];
          if (r < 0 && ws[p] > 0) break;
        }
        while (ws[p] <= 0) p = (p + 1) & 3;
        h[p] |= 1 << c;
        left[p] -= 1;
      }
      if (!fail) return h;
    }
    return null;
  };
}

/* ------------------------------------------------------------------ */
/* Hand scoring from one team's side                                   */
/* ------------------------------------------------------------------ */

interface Scorer {
  /** my team's hand points minus theirs, for final card points and tricks per team */
  (pts: number[], tr: number[]): number;
}

function makeScorer(
  s: State,
  myTeam: number,
  extra: { projects?: Record<BSide, number>; baloot?: Record<BSide, number>; mult?: number } = {},
): Scorer {
  const c = s.contract!;
  const buyerSide = sideKey(seatOf(s, c.buyer) & 1);
  const mine = sideKey(myTeam);
  const theirs = sideKey(myTeam ^ 1);
  const projects = extra.projects ?? { ...s.projPoints };
  const ma = s.settings.mode === 'morocco';
  const baloot = extra.baloot ?? knownBaloot(s, myTeam);
  const mult = extra.mult ?? c.mult;
  if (ma) {
    return (pts, tr) => {
      const out = maScoreHand({ buyerSide, cards: { A: pts[0], B: pts[1] }, tricks: { A: tr[0], B: tr[1] }, ann: projects, belote: baloot, pot: s.pot });
      return out.points[mine] - out.points[theirs];
    };
  }
  return (pts, tr) => {
    const out = scoreHand({ mode: c.mode, buyerSide, abnat: { A: pts[0], B: pts[1] }, tricks: { A: tr[0], B: tr[1] }, projects, baloot, mult });
    const d = out.points[mine] - out.points[theirs];
    return c.gahwa ? d * 4 : d;
  };
}

/** «بلوت» / بلوط-ريبلوط points a seat can count on: those said, the one said halfway (Moroccan), my own. */
function knownBaloot(s: State, myTeam: number): Record<BSide, number> {
  const ma = s.settings.mode === 'morocco';
  const per = ma ? MA_BELOTE : 2;
  const out: Record<BSide, number> = { A: 0, B: 0 };
  for (const id of s.baloot) out[sideKey(seatOf(s, id) & 1)] += per;
  const h = s.balootHolder;
  if (h && !s.baloot.includes(h)) {
    const team = seatOf(s, h) & 1;
    // the holder is public once «بلوط» was said (Moroccan); my own team's holder I may know (me)
    if ((ma && s.balootPlayed === 1) || team === myTeam) out[sideKey(team)] += per;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Card play                                                           */
/* ------------------------------------------------------------------ */

const BUDGET: Record<MindLevel, { ms: number; max: number; min: number; dd: number }> = {
  expert: { ms: 45, max: 1000, min: 24, dd: 20 },
  smart: { ms: 6, max: 24, min: 8, dd: 0 },
};

/** Tests: fixed sample counts instead of the time budget (repeatable, quick); null restores the budget. */
let fixed: { play: number; bid: number } | null = null;
export function setMindBudget(b: { play: number; bid: number } | null) {
  fixed = b;
}

/** The current hand as a simulation (the other seats' cards still to be filled in). */
function baseSim(s: State): Sim {
  const c = s.contract!;
  const x = new Sim(trumpIndex(c.trump), s.settings.mode === 'morocco');
  x.n = s.trick.length;
  for (let k = 0; k < x.n; k++) {
    x.tc[k] = ci(s.trick[k].card);
    x.ts[k] = seatOf(s, s.trick[k].by);
  }
  x.turn = seatOf(s, s.turn!);
  x.lb = s.leadBoss;
  x.pts = [s.abnat.A, s.abnat.B];
  x.tr = [s.tricks.A, s.tricks.B];
  x.left = s.seats.reduce((t, id) => t + s.hands[id].length, 0);
  return x;
}

/** card points still to be won (cards in hands + on the table + the last trick's 10) */
function pointsLeft(x: Sim): number {
  const T = x.t * 32;
  let v = 0;
  let m = x.h[0] | x.h[1] | x.h[2] | x.h[3];
  while (m) {
    const b = m & -m;
    v += VAL[T + (31 - Math.clz32(b))];
    m ^= b;
  }
  for (let k = 0; k < x.n; k++) v += VAL[T + x.tc[k]];
  return v + (x.left > 0 ? 10 : 0);
}

/** Score of one sampled continuation after my card: played out by the policy, or solved exactly near the end. */
function finish(y: Sim, buyer: number, myTeam: number, score: Scorer, exact: boolean): number {
  if (exact && y.left > 0) {
    const tricksLeft = (y.left + y.n) / 4;
    const total = pointsLeft(y);
    try {
      const f = ddValue(y, myTeam, 60_000);
      const myPts = Math.floor(f / 16);
      const myTr = f % 16;
      const pts = y.pts.slice();
      const tr = y.tr.slice();
      pts[myTeam] += myPts;
      pts[myTeam ^ 1] += total - myPts;
      tr[myTeam] += myTr;
      tr[myTeam ^ 1] += tricksLeft - myTr;
      return score(pts, tr);
    } catch {
      // too big: play it out
    }
  }
  rollout(y, buyer, BLIND_PLAY);
  return score(y.pts, y.tr);
}

/**
 * The expert / smart card: the legal card with the best average score over sampled deals (the same
 * deals for every card, so the comparison is paired). Cards that are clearly worse than the leader
 * (paired difference below 0 by more than 3 standard errors) stop being simulated: the budget goes to
 * the close calls. With fixed sample counts (tests, the self-play script) the work is counted in
 * simulated continuations, so the pruning buys more deals for the cards still in the race.
 */
export function mindPlay(s: State, id: string, legal: BCard[], level: MindLevel): BCard {
  if (legal.length === 1) return legal[0];
  const b = fixed ? { ms: Infinity, max: fixed.play * legal.length, min: fixed.play, dd: BUDGET[level].dd } : BUDGET[level];
  const t0 = now();
  const me = seatOf(s, id);
  const myTeam = me & 1;
  const buyer = seatOf(s, s.contract!.buyer) & 1;
  const k = know(s, id, level === 'expert');
  const base = baseSim(s);
  base.vd = k.voids.slice();
  const score = makeScorer(s, myTeam);
  const cands = legal.map(ci);
  const m = cands.length;
  const exact = b.dd > 0 && base.left <= b.dd;
  // the exact solves of the last 5 tricks cost more per deal: fewer deals are required before the clock decides
  const minN = exact && !fixed ? Math.min(b.min, 14) : b.min;
  const work = fixed ? fixed.play * m : Infinity;
  const scores = new Float64Array(b.max * m);
  const total = new Float64Array(m);
  const active = new Array<boolean>(m).fill(true);
  let alive = m;
  let done = 0;
  const sample = makeSampler(k, base.t);
  let n = 0;
  for (; n < b.max && done < work && alive > 1 && (n < minN || now() - t0 < b.ms); n++) {
    const deal = sample();
    if (!deal) break;
    const x = base.clone();
    x.h = deal;
    for (let i = 0; i < m; i++) {
      if (!active[i]) continue;
      const y = x.clone();
      y.play(cands[i]);
      const v = finish(y, buyer, myTeam, score, exact);
      scores[n * m + i] = v;
      total[i] += v;
      done++;
    }
    if (n >= 15 && (n + 1) % 8 === 0) alive = prune(scores, total, active, n + 1, m);
    if (now() - t0 > b.ms * 2.2) break;
  }
  if (!n) return legal[0];
  let best = -1;
  const T = base.t * 32;
  for (let i = 0; i < m; i++) {
    if (!active[i]) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const d = total[i] - total[best];
    // equal scores: keep the cheaper card
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && VAL[T + cands[i]] * 20 + POW[T + cands[i]] < VAL[T + cands[best]] * 20 + POW[T + cands[best]])) best = i;
  }
  return legal[best];
}

/** Drop the cards clearly worse than the leader (paired over the `n` deals all active cards shared); how many stay. */
function prune(scores: Float64Array, total: Float64Array, active: boolean[], n: number, m: number): number {
  let lead = -1;
  for (let i = 0; i < m; i++) if (active[i] && (lead < 0 || total[i] > total[lead])) lead = i;
  let alive = 0;
  for (let i = 0; i < m; i++) {
    if (!active[i]) continue;
    if (i !== lead) {
      let sum = 0;
      let sq = 0;
      for (let j = 0; j < n; j++) {
        const d = scores[j * m + i] - scores[j * m + lead];
        sum += d;
        sq += d * d;
      }
      const mean = sum / n;
      const se = Math.sqrt(Math.max(0, sq / n - mean * mean) / n);
      if (mean + 3 * se < 0) active[i] = false;
    }
    if (active[i]) alive++;
  }
  return alive;
}

/* ------------------------------------------------------------------ */
/* Projects / announcements, quickly (bidding simulations)             */
/* ------------------------------------------------------------------ */

/** Saudi projects of an 8-card hand: points (game points) and the best project's rank. */
function quickProjects(h: number, sun: boolean): { pts: number; rank: number } {
  let pts = 0;
  let rank = 0;
  const add = (kind: number, top: number, p: number) => {
    pts += p;
    rank = Math.max(rank, kind * 10 + (8 - top));
  };
  for (let s = 0; s < 4; s++) {
    const bits = (h >>> (s * 8)) & 0xff;
    let i = 0;
    while (i < 8) {
      if (!(bits & (1 << i))) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < 8 && bits & (1 << (j + 1))) j++;
      let len = j - i + 1;
      let top = i;
      while (len >= 3) {
        const l = Math.min(len, 5);
        if (l === 5) add(3, top, sun ? 20 : 10);
        else if (l === 4) add(2, top, sun ? 10 : 5);
        else add(1, top, sun ? 4 : 2);
        len -= l;
        top += l;
      }
      i = j + 1;
    }
  }
  // fours: A K Q J 10 are ranks 0..4
  for (let r = 0; r < 5; r++) {
    if ((h >>> r) & 1 && (h >>> (8 + r)) & 1 && (h >>> (16 + r)) & 1 && (h >>> (24 + r)) & 1) {
      if (r === 0 && sun) add(5, r, 40);
      else add(4, r, sun ? 20 : 10);
    }
  }
  return { pts, rank };
}

/** Moroccan announcements of an 8-card hand: points and the best one's strength. */
function quickAnn(h: number, t: number): { pts: number; rank: number } {
  let pts = 0;
  let rank = 0;
  for (let s = 0; s < 4; s++) {
    const bits = (h >>> (s * 8)) & 0xff;
    let i = 0;
    while (i < 8) {
      if (!(bits & (1 << i))) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < 8 && bits & (1 << (j + 1))) j++;
      const len = j - i + 1;
      if (len >= 3) {
        pts += len === 3 ? 20 : len === 4 ? 50 : 100;
        rank = Math.max(rank, Math.min(len, 5) * 1000 + (8 - i) * 10 + (s === t ? 1 : 0));
      }
      i = j + 1;
    }
  }
  // كاري: J 200, 9 150, A / 10 / K / Q 100 (ranks: A0 K1 Q2 J3 10:4 9:5)
  const CARRE: [number, number, number][] = [
    [3, 200, 6],
    [5, 150, 5],
    [0, 100, 4],
    [4, 100, 3],
    [1, 100, 2],
    [2, 100, 1],
  ];
  for (const [r, p, o] of CARRE) {
    if ((h >>> r) & 1 && (h >>> (8 + r)) & 1 && (h >>> (16 + r)) & 1 && (h >>> (24 + r)) & 1) {
      pts += p;
      rank = Math.max(rank, 100_000 + o);
    }
  }
  return { pts, rank };
}

/* ------------------------------------------------------------------ */
/* Whole-hand simulations (bidding, doubling)                          */
/* ------------------------------------------------------------------ */

interface Contract {
  /** trump index, NT for صن */
  t: number;
  /** buyer seat */
  buyer: number;
}

/** Play a whole dealt hand out; card points, tricks, project and baloot points per team (A = team 0). */
function playDeal(hands: number[], k: Contract, ma: boolean, leader: number) {
  const x = new Sim(k.t, ma);
  x.h = hands.slice();
  x.turn = leader;
  x.left = 32;
  rollout(x, k.buyer & 1, BLIND_BID);
  // projects: only the team with the best one scores (ties: earlier in the first trick)
  const proj = [0, 0];
  let best = -1;
  let bestTeam = -1;
  const side = [0, 0];
  for (let i = 0; i < 4; i++) {
    const seat = (leader + i) & 3;
    const q = ma ? quickAnn(hands[seat], k.t) : quickProjects(hands[seat], k.t === NT);
    side[seat & 1] += q.pts;
    if (q.pts > 0 && q.rank > best) {
      best = q.rank;
      bestTeam = seat & 1;
    }
  }
  if (bestTeam >= 0) proj[bestTeam] = side[bestTeam];
  const bal = [0, 0];
  if (k.t < NT) {
    const kq = (1 << (k.t * 8 + 1)) | (1 << (k.t * 8 + 2));
    for (let seat = 0; seat < 4; seat++) if ((hands[seat] & kq) === kq) bal[seat & 1] += ma ? MA_BELOTE : 2;
  }
  return { pts: x.pts, tr: x.tr, proj, bal };
}

/** my team's points minus theirs for one played deal; `failed`: the buyers' contract failed */
let lastFailed = false;
function dealScore(r: ReturnType<typeof playDeal>, k: Contract, ma: boolean, myTeam: number, mult: number, pot: number): number {
  const buyerSide = sideKey(k.buyer & 1);
  const projects = { A: r.proj[0], B: r.proj[1] };
  const bal = { A: r.bal[0], B: r.bal[1] };
  const mine = sideKey(myTeam);
  const theirs = sideKey(myTeam ^ 1);
  if (ma) {
    const out = maScoreHand({ buyerSide, cards: { A: r.pts[0], B: r.pts[1] }, tricks: { A: r.tr[0], B: r.tr[1] }, ann: projects, belote: bal, pot });
    lastFailed = out.failed;
    return out.points[mine] - out.points[theirs];
  }
  const out = scoreHand({ mode: k.t === NT ? 'sun' : 'hokm', buyerSide, abnat: { A: r.pts[0], B: r.pts[1] }, tricks: { A: r.tr[0], B: r.tr[1] }, projects, baloot: bal, mult });
  lastFailed = out.failed;
  return out.points[mine] - out.points[theirs];
}

function shuffled(cards: number[]): number[] {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** the face-up card and the first player to speak (who also leads the first trick) */
const leaderOf = (s: State) => (s.dealer + 1) % 4;

/**
 * Would a sensible player holding `five` (+ the face-up card) buy `suit`? The «smart» rule of
 * ./baloot-bid.ts: used to read the others' passes and to guess what they buy after mine.
 */
function wouldBuy(s: State, seat: number, five: number, suit: number): boolean {
  const ma = s.settings.mode === 'morocco';
  const e = hokmEval([...cardsOf(five), s.faceUp!], B_SUITS[suit], ma, seat === leaderOf(s));
  const rule = BUY_RULE[ma ? 'morocco' : 'saudi'].smart;
  return e.value >= rule.min && e.fail <= rule.cap;
}

const wouldSun = (s: State, five: number) => s.settings.mode !== 'morocco' && sunStrength([...cardsOf(five), s.faceUp!]) >= 8.5;

/**
 * What the passes said so far: [seat, suits it declined (bits), declined صن]. In the 2nd round every
 * seat declined the face-up suit in the 1st one (nobody bought).
 */
function passes(s: State, me: number): [number, number, boolean][] {
  const b = s.bid!;
  const ut = trumpIndex(s.faceUp!.suit);
  const out = new Map<number, [number, number, boolean]>();
  const order = b.order.map((id) => seatOf(s, id));
  if (b.round === 2) for (const p of order) if (p !== me) out.set(p, [p, 1 << ut, true]);
  for (const [id, c] of Object.entries(b.calls)) {
    const p = seatOf(s, id);
    if (p === me || c.call !== 'pass') continue;
    const prev = out.get(p) ?? [p, 0, false];
    prev[1] |= b.round === 1 ? 1 << ut : 0xf & ~(1 << ut);
    prev[2] = true;
    out.set(p, prev);
  }
  return [...out.values()];
}

/**
 * Expected score (my team minus theirs) of each contract, over the same sampled deals: during the
 * bidding I know my 5 cards and the face-up card; the buyer takes it + 2, the others get 3 more.
 * The deals respect what the passes said (a player who passed rarely holds a hand that buys: such
 * deals are drawn again, softly — people do pass good hands sometimes). `fails[i]`: how often contract
 * i failed for its buyers.
 */
function bidValues(s: State, me: number, contracts: Contract[], samples0: number, ms0: number): { vals: number[]; fails: number[] } {
  const samples = fixed ? fixed.bid : samples0;
  const ms = fixed ? Infinity : ms0;
  const ma = s.settings.mode === 'morocco';
  const mine = maskOf(s.hands[s.seats[me]]);
  const up = ci(s.faceUp!);
  const unknown: number[] = [];
  for (let c = 0; c < 32; c++) if (!(mine & (1 << c)) && c !== up) unknown.push(c);
  const leader = leaderOf(s);
  const said = passes(s, me);
  const out = contracts.map(() => 0);
  const fails = contracts.map(() => 0);
  const t0 = now();
  let n = 0;
  for (; n < samples && (n < 12 || now() - t0 < ms); n++) {
    let perm: number[] = [];
    const five = [0, 0, 0, 0];
    for (let attempt = 0; attempt < 8; attempt++) {
      perm = shuffled(unknown);
      five.fill(0);
      five[me] = mine;
      let p = 0;
      for (let seat = 0; seat < 4; seat++) {
        if (seat === me) continue;
        for (let i = 0; i < 5; i++) five[seat] |= 1 << perm[p++];
      }
      const odd = said.some(([seat, suits, sun]) => {
        for (let t = 0; t < 4; t++) if (suits & (1 << t) && wouldBuy(s, seat, five[seat], t)) return true;
        return sun && wouldSun(s, five[seat]);
      });
      if (!odd || Math.random() < 0.2) break;
    }
    const stock = perm.slice(15);
    contracts.forEach((k0, ki) => {
      const k = k0.buyer < 0 ? passOutcome(s, me, five) : k0;
      if (!k) return; // everyone passes: a new deal, worth nothing
      const hands = five.slice();
      let q = 0;
      hands[k.buyer] |= (1 << up) | (1 << stock[q++]) | (1 << stock[q++]);
      for (let seat = 0; seat < 4; seat++) {
        if (seat === k.buyer) continue;
        for (let i = 0; i < 3; i++) hands[seat] |= 1 << stock[q++];
      }
      let v = dealScore(playDeal(hands, k, ma, leader), k, ma, me & 1, 1, s.pot);
      if (lastFailed) fails[ki]++;
      // calibrated on played hands: the simulations underrate صن for its buyers by a few points
      if (!ma && k.t === NT) v += (k.buyer & 1) === (me & 1) ? SUN_BONUS : -SUN_BONUS;
      out[ki] += v;
    });
  }
  const d = Math.max(1, n);
  return { vals: out.map((v) => v / d), fails: fails.map((v) => v / d) };
}

const SUN_BONUS = 3;

/** the contract «pass» stands for: decided in each sampled deal by what the next players would say */
const PASS: Contract = { t: -1, buyer: -1 };

/**
 * If I pass: what the others would most likely buy with the cards of this sample (the «smart» reading
 * of their hands, ./baloot-bid.ts; Saudi صن with aces and tens), or null when everyone passes.
 */
function passOutcome(s: State, me: number, five: number[]): Contract | null {
  const ma = s.settings.mode === 'morocco';
  const b = s.bid!;
  const ut = trumpIndex(s.faceUp!.suit);
  const order = b.order.map((id) => seatOf(s, id));
  const after = order.slice(order.indexOf(me) + 1);
  const round2 = (players: number[]): Contract | null => {
    for (const p of players) {
      if (wouldSun(s, five[p])) return { t: NT, buyer: p };
      let best = -1;
      let bv = -1e9;
      for (let t = 0; t < 4; t++) {
        if (t === ut || !wouldBuy(s, p, five[p], t)) continue;
        const v = hokmEval([...cardsOf(five[p]), s.faceUp!], B_SUITS[t], ma, p === leaderOf(s)).value;
        if (v > bv) {
          bv = v;
          best = t;
        }
      }
      if (best >= 0) return { t: best, buyer: p };
    }
    return null;
  };
  if (b.round === 2) return round2(after);
  let best: Contract | null = b.best ? { t: trumpIndex(b.best.suit), buyer: seatOf(s, b.best.by) } : null;
  for (const p of after) {
    if (wouldSun(s, five[p])) return { t: NT, buyer: p };
    if (!best && (wouldBuy(s, p, five[p], ut) || (ma && s.faceUp!.rank === 'J' && p === order[0]))) {
      if (ma) return { t: ut, buyer: p };
      best = { t: ut, buyer: p };
    }
  }
  return best ?? round2(order);
}

/** How much a hand must be worth before buying: more careful when ahead, bolder when the others are close. */
function buyMargin(s: State, me: number, ma: boolean): number {
  const mine = sideKey(me & 1);
  const theirs = sideKey((me & 1) ^ 1);
  const target = s.settings.target;
  let m = 0;
  const gap = ma ? 120 : 20;
  if (s.scores[theirs] >= target - gap) m -= ma ? 10 : 1.5;
  if (s.scores[mine] >= target - gap && s.scores[mine] > s.scores[theirs]) m += ma ? 6 : 1;
  return m;
}

/** the plain reading of buying `suit` with my 5 cards + the face-up card */
function readHokm(s: State, id: string, suit: string) {
  const ma = s.settings.mode === 'morocco';
  return hokmEval([...s.hands[id], s.faceUp!], suit as BCard['suit'], ma, seatOf(s, id) === leaderOf(s));
}

/** Why a bot would or would not buy `suit` now (the plain reading; for the self-play report). */
export function bidReason(s: State, id: string, suit: string): string {
  return hokmWhy(readHokm(s, id, suit));
}

/**
 * The smart / expert purchase.
 * 1. Every حكم it may name is first read plainly (./baloot-bid.ts, fitted on played hands): a suit
 *    whose estimate is clearly negative is never named, whatever the simulations say.
 * 2. The simulations (deals consistent with the passes so far, played out quickly) give each contract
 *    its expected score and failure rate, and «pass» its own (what the next players would buy).
 * 3. A حكم is named when the blended estimate (simulation + plain reading) clears the level's
 *    minimum, its failure risk is below the level's cap, and it beats passing by the margin.
 * Saudi صن keeps its plain gate (aces and tens) and the same simulations.
 */
export function mindBid(s: State, id: string, options: BalootOption[], level: MindLevel): { call: BalootOption['call']; suit?: string } {
  const me = seatOf(s, id);
  const ma = s.settings.mode === 'morocco';
  if (options.length === 1) return { call: options[0].call };
  const partner = (me + 2) & 3;
  const up = s.faceUp!;
  const rule = BUY_RULE[ma ? 'morocco' : 'saudi'][level];
  const canPass = options.some((o) => o.call === 'pass');
  const withUp = [...s.hands[id], up];
  type Choice = { call: BalootOption['call']; suit?: string; k: Contract; read?: ReturnType<typeof readHokm> };
  const choices: Choice[] = [];
  for (const o of options) {
    if (o.call === 'confirm') choices.push({ call: 'confirm', k: { t: trumpIndex(s.bid!.best!.suit), buyer: me } });
    else if (o.call === 'hokm' || o.call === 'hokm2') {
      for (const suit of o.call === 'hokm' ? [up.suit] : (o.suits ?? [])) {
        const read = readHokm(s, id, suit);
        // step 1: a clearly bad hand for this trump is not even simulated (when passing is allowed)
        if (canPass && read.value < BAD_VALUE[ma ? 'morocco' : 'saudi']) continue;
        choices.push({ call: o.call, suit: o.call === 'hokm2' ? suit : undefined, k: { t: trumpIndex(suit), buyer: me }, read });
      }
    } else if (o.call === 'sun') {
      if (!canPass || sunStrength(withUp) >= 7.5) choices.push({ call: 'sun', k: { t: NT, buyer: me } });
    } else if (o.call === 'ashkal') choices.push({ call: 'ashkal', k: { t: NT, buyer: partner } });
  }
  lastNote = '';
  if (!choices.length) return { call: canPass ? 'pass' : options[0].call };
  // passing in the «صن?» window leaves the حكم already bought
  const b = s.bid!;
  const standing: Contract | null = b.stage === 'confirm' && b.best && canPass ? { t: trumpIndex(b.best.suit), buyer: seatOf(s, b.best.by) } : null;
  const ks = choices.map((c) => c.k);
  if (canPass) ks.push(standing ?? PASS);
  const samples = level === 'expert' ? 160 : 48;
  const { vals, fails } = bidValues(s, me, ks, samples, level === 'expert' ? 30 : 8);
  if (!canPass) {
    let best = 0;
    for (let i = 1; i < choices.length; i++) if (vals[i] > vals[best]) best = i;
    return { call: choices[best].call, suit: choices[best].suit };
  }
  const passVal = vals[vals.length - 1];
  const margin = buyMargin(s, me, ma);
  let best = -1;
  let bestV = -Infinity;
  const notes: string[] = [];
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    let v = vals[i];
    if (c.read) {
      // the blend (step 3): the plain reading steadies the simulations' noise
      v = (v + c.read.value) / 2;
      const fail = (fails[i] + c.read.fail) / 2;
      const why = fail > rule.cap ? 'too risky' : v < rule.min + margin ? 'too little' : v - passVal < margin ? 'passing is as good' : 'buy';
      notes.push(`${c.suit ?? up.suit}: plain ${c.read.value.toFixed(0)}, sim ${vals[i].toFixed(0)} → ${v.toFixed(0)} (fail ${(fail * 100).toFixed(0)}%) vs pass ${passVal.toFixed(0)}: ${why}`);
      if (fail > rule.cap || v < rule.min + margin) continue;
    } else if (c.k.t === NT && c.k.buyer === me && v < 0) continue;
    if (v - passVal < margin) continue;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  lastNote = notes.join('; ');
  if (best < 0) return { call: 'pass' };
  return { call: choices[best].call, suit: choices[best].suit };
}

let lastNote = '';
/** How the last smart / expert purchase decision weighed its options (the self-play report). */
export const lastBidNote = () => lastNote;

/**
 * The purchase without simulations (the easy bots, and the old numeric levels): the plain reading of
 * ./baloot-bid.ts against the level's minimum. 'easy' adds noise (a person's mood) but never buys a
 * hand whose estimate is clearly negative, nor one above its failure cap.
 */
export function plainBid(s: State, id: string, options: BalootOption[], level: 'easy' | 'smart', rnd: () => number = Math.random): { call: BalootOption['call']; suit?: string } {
  if (options.length === 1) return { call: options[0].call };
  const ma = s.settings.mode === 'morocco';
  const rule = BUY_RULE[ma ? 'morocco' : 'saudi'][level];
  const can = (c: BalootOption['call']) => options.find((o) => o.call === c);
  const up = s.faceUp!;
  const withUp = [...s.hands[id], up];
  const noise = (rnd() + rnd() - 1) * rule.noise;
  const sun = sunStrength(withUp);
  const sunT = 8.5 + (level === 'easy' ? noise / 4 : 0);
  if (can('confirm')) return { call: sun >= Math.max(7.5, sunT + 1.5) ? 'sun' : 'confirm' };
  if (can('sun') && sun >= Math.max(7.5, sunT)) return { call: 'sun' };
  let best: { call: BalootOption['call']; suit?: string; v: number } | null = null;
  for (const o of options) {
    if (o.call !== 'hokm' && o.call !== 'hokm2') continue;
    for (const suit of o.call === 'hokm' ? [up.suit] : (o.suits ?? [])) {
      const e = readHokm(s, id, suit);
      if (e.value < BAD_VALUE[ma ? 'morocco' : 'saudi'] || e.fail > rule.cap || e.value + noise < rule.min) continue;
      if (!best || e.value > best.v) best = { call: o.call, suit: o.call === 'hokm2' ? suit : undefined, v: e.value };
    }
  }
  if (best) return { call: best.call, suit: best.suit };
  if (can('ashkal') && sunStrength(s.hands[id]) >= sunT - 1 && (up.rank === 'A' || up.rank === '10')) return { call: 'ashkal' };
  return { call: can('pass') ? 'pass' : options[0].call };
}

/**
 * The doubling window (Saudi): my 8 cards known, the buyer holds the face-up card. Raise when the
 * raised hand is worth clearly more to my team than the hand as it stands.
 */
export function mindRaise(s: State, id: string, step: BalootRaise, level: MindLevel): boolean {
  const me = seatOf(s, id);
  const c = s.contract!;
  const k: Contract = { t: trumpIndex(c.trump), buyer: seatOf(s, c.buyer) };
  const myTeam = me & 1;
  const kn = know(s, id, true);
  const samples = fixed ? fixed.bid : level === 'expert' ? 140 : 40;
  const ms = fixed ? Infinity : level === 'expert' ? 30 : 8;
  const leader = (s.dealer + 1) % 4;
  const sample = makeSampler(kn, k.t);
  const t0 = now();
  let n = 0;
  let buyerWins = 0;
  const ev = [0, 0, 0, 0, 0];
  for (; n < samples && (n < 12 || now() - t0 < ms); n++) {
    const deal = sample();
    if (!deal) break;
    const r = playDeal(deal, k, false, leader);
    for (const m of [1, 2, 3, 4]) ev[m] += dealScore(r, k, false, myTeam, m, 0);
    if (dealScore(r, k, false, k.buyer & 1, 1, 0) > 0) buyerWins++;
  }
  if (!n) return false;
  for (let m = 1; m <= 4; m++) ev[m] /= n;
  const pBuyer = buyerWins / n;
  const margin = level === 'expert' ? 2 : 4;
  if (step === 'double') return ev[2] > ev[1] + margin && (c.mode === 'sun' || ev[2] > 0);
  if (step === 'triple') return ev[3] > ev[2] + margin && pBuyer > 0.72;
  if (step === 'four') return ev[4] > ev[3] + margin && pBuyer < 0.28;
  // قهوة: the winner of this hand wins the game
  return pBuyer > 0.9;
}

/* ------------------------------------------------------------------ */
/* «الباقي لنا»                                                        */
/* ------------------------------------------------------------------ */

export interface ClaimInfo {
  /** who may claim (the button is on this phone) */
  by: string;
  side: BSide;
  /** whose hands are shown when it is claimed (the claimer's, and the partner's if it was needed) */
  reveal: string[];
}

/**
 * Is some team certain to take every remaining trick, whatever anyone plays? Exact (the server knows
 * every hand); null when not, or when the search would be too big this time.
 */
/** The real hand as a simulation (the server sees every hand); a complete trick → the next one. Null: nothing to play. */
function realSim(s: State): Sim | null {
  if (s.phase !== 'play' || !s.contract) return null;
  const x = new Sim(trumpIndex(s.contract.trump), s.settings.mode === 'morocco');
  x.h = s.seats.map((id) => maskOf(s.hands[id]));
  x.left = x.h.reduce((t, m) => t + popcount(m), 0);
  if (s.pauseUntil !== null) {
    if (!s.trickWinner || x.left === 0) return null;
    x.turn = seatOf(s, s.trickWinner);
  } else {
    if (!s.turn) return null;
    x.n = s.trick.length;
    for (let k = 0; k < x.n; k++) {
      x.tc[k] = ci(s.trick[k].card);
      x.ts[k] = seatOf(s, s.trick[k].by);
    }
    x.turn = seatOf(s, s.turn);
    x.lb = s.leadBoss;
  }
  return x;
}

/** Is `side` certain to take every remaining trick from here (both partners choosing)? For tests. */
export function sideCertain(s: State, side: BSide): boolean {
  const x = realSim(s);
  return !!x && claimCertain(x, side === 'A' ? 0 : 1, -1, 1_000_000) === true;
}

export function balootClaim(s: State): ClaimInfo | null {
  const x = realSim(s);
  if (!x || (x.left + x.n) / 4 < 2) return null;
  // the same position is asked again after a pause or a timer: answer from the cache
  const key = `${s.hand}|${x.h.join(',')}|${x.tc.slice(0, x.n).join(',')}|${x.turn}`;
  const memo = claimMemo.get(s);
  if (memo?.key === key) return memo.claim;
  const claim = findClaim(s, x);
  claimMemo.set(s, { key, claim });
  return claim;
}

const claimMemo = new WeakMap<State, { key: string; claim: ClaimInfo | null }>();

/**
 * «الباقي لنا» is offered only when ONE player's own cards take every remaining trick whatever the
 * three others play — the partner included (nobody can count on a partner playing the right card).
 * A team that needs both partners to play well gets no offer: the hand is played out.
 * The searches are capped (a few ms): a position too big for them is simply asked again after the next card.
 */
function findClaim(s: State, x: Sim): ClaimInfo | null {
  // capped in nodes (a few ms of work, the same on every machine)
  for (const team of [0, 1]) {
    if (claimCertain(x, team, -1, 3000) !== true) continue;
    const order = [0, 1, 2, 3].map((k) => (x.turn + k) & 3).filter((seat) => (seat & 1) === team);
    const side = sideKey(team);
    for (const seat of order) {
      if (claimCertain(x, team, seat, 20_000) === true) return { by: s.seats[seat], side, reveal: [s.seats[seat]] };
    }
  }
  return null;
}
