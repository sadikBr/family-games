/**
 * «البلوط» — the PREVIOUS expert / smart bots, frozen (as of the commit before the bidding rewrite).
 * Kept only as the reference the strength tests and scripts/baloot-selfplay.ts measure the new bots
 * against; the game never uses it.
 */
import type { BalootOption, BalootRaise, BCard, BSide } from '../../../src/shared/games/baloot';
import { B_SUITS, scoreHand } from '../../../src/shared/baloot-rules';
import { hokmStrength, sunStrength } from './bot';
import { MA_BELOTE, maScoreHand } from '../../../src/shared/baloot-morocco';
import type { State } from '../../games/baloot';
import { cardsOf, ci, ddValue, maskOf, NT, popcount, POW, rollout, Sim, trumpIndex, VAL } from './engine';

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
  const weight = (seat: number, card: number) => {
    if (!weights) return 1;
    if (t < NT) {
      if (card >> 3 !== t) return 1;
      const pw = POW[T + card];
      if (seat === buyer) return pw >= 6 ? 2.6 : 1.5;
      if (seat === ((buyer + 2) & 3)) return 1.1;
      return pw >= 6 ? 0.75 : 0.9;
    }
    // صن: the buyer tends to hold the aces and tens
    if (seat === buyer && VAL[T + card] >= 10) return 1.8;
    return 1;
  };
  return { me, mine, need, fixed, voids, cap, pool, weight };
}

/** Deal the unknown cards to the other seats, every known fact respected (relaxed only if it can't be). */
export function sampleDeal(k: Know, t: number, rnd: () => number = Math.random): number[] | null {
  const cards: number[] = [];
  let m = k.pool;
  while (m) {
    const b = m & -m;
    cards.push(31 - Math.clz32(b));
    m ^= b;
  }
  const T = t * 32;
  for (let attempt = 0; attempt < 40; attempt++) {
    const relax = attempt >= 30 ? 2 : attempt >= 20 ? 1 : 0;
    const h = [0, 0, 0, 0];
    const left = [0, 0, 0, 0];
    let total = 0;
    for (let p = 0; p < 4; p++) {
      if (p === k.me) {
        h[p] = k.mine;
        continue;
      }
      h[p] = k.fixed[p];
      left[p] = k.need[p] - popcount(k.fixed[p]);
      if (left[p] < 0) return null;
      total += left[p];
    }
    if (total !== cards.length) return null;
    const ok = (p: number, c: number) => {
      if (p === k.me || left[p] <= 0) return false;
      if (relax < 2 && k.voids[p] & (1 << (c >> 3))) return false;
      if (relax < 1 && c >> 3 === t && POW[T + c] > k.cap[p]) return false;
      return true;
    };
    // shuffle, then the most constrained cards first
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const width = (c: number) => {
      let n = 0;
      for (let p = 0; p < 4; p++) if (ok(p, c)) n++;
      return n;
    };
    const order = cards.map((c) => ({ c, w: width(c) })).sort((a, b) => a.w - b.w);
    let fail = false;
    for (const { c } of order) {
      let tot = 0;
      const ws = [0, 0, 0, 0];
      for (let p = 0; p < 4; p++) {
        if (!ok(p, c)) continue;
        ws[p] = left[p] * k.weight(p, c);
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
  expert: { ms: 28, max: 600, min: 24, dd: 12 },
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

/** The expert / smart card: the legal card with the best average score over sampled deals. */
export function mindPlay(s: State, id: string, legal: BCard[], level: MindLevel): BCard {
  if (legal.length === 1) return legal[0];
  const b = fixed ? { ms: Infinity, max: fixed.play, min: fixed.play, dd: BUDGET[level].dd } : BUDGET[level];
  const t0 = now();
  const me = seatOf(s, id);
  const myTeam = me & 1;
  const buyer = seatOf(s, s.contract!.buyer) & 1;
  const k = know(s, id, level === 'expert');
  const base = baseSim(s);
  base.vd = k.voids.slice();
  const score = makeScorer(s, myTeam);
  const cands = legal.map(ci);
  const total = new Float64Array(cands.length);
  const exact = b.dd > 0 && base.left <= b.dd;
  let n = 0;
  for (; n < b.max && (n < b.min || now() - t0 < b.ms); n++) {
    const deal = sampleDeal(k, base.t);
    if (!deal) break;
    const x = base.clone();
    x.h = deal;
    for (let i = 0; i < cands.length; i++) {
      const y = x.clone();
      y.play(cands[i]);
      total[i] += finish(y, buyer, myTeam, score, exact);
    }
    if (now() - t0 > b.ms * 2.2) break;
  }
  if (!n) return legal[0];
  let best = 0;
  const T = base.t * 32;
  for (let i = 1; i < cands.length; i++) {
    const d = total[i] - total[best];
    // equal scores: keep the cheaper card
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && VAL[T + cands[i]] * 20 + POW[T + cands[i]] < VAL[T + cands[best]] * 20 + POW[T + cands[best]])) best = i;
  }
  return legal[best];
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

/** my team's points minus theirs for one played deal */
function dealScore(r: ReturnType<typeof playDeal>, k: Contract, ma: boolean, myTeam: number, mult: number, pot: number): number {
  const buyerSide = sideKey(k.buyer & 1);
  const projects = { A: r.proj[0], B: r.proj[1] };
  const bal = { A: r.bal[0], B: r.bal[1] };
  const mine = sideKey(myTeam);
  const theirs = sideKey(myTeam ^ 1);
  if (ma) {
    const out = maScoreHand({ buyerSide, cards: { A: r.pts[0], B: r.pts[1] }, tricks: { A: r.tr[0], B: r.tr[1] }, ann: projects, belote: bal, pot });
    return out.points[mine] - out.points[theirs];
  }
  const out = scoreHand({ mode: k.t === NT ? 'sun' : 'hokm', buyerSide, abnat: { A: r.pts[0], B: r.pts[1] }, tricks: { A: r.tr[0], B: r.tr[1] }, projects, baloot: bal, mult });
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

/**
 * Expected score (my team minus theirs) of each contract, over the same sampled deals: during the
 * bidding I know my 5 cards and the face-up card; the buyer takes it + 2, the others get 3 more.
 */
function bidValues(s: State, me: number, contracts: Contract[], samples0: number, ms0: number): number[] {
  const samples = fixed ? fixed.bid : samples0;
  const ms = fixed ? Infinity : ms0;
  const ma = s.settings.mode === 'morocco';
  const mine = maskOf(s.hands[s.seats[me]]);
  const up = ci(s.faceUp!);
  const unknown: number[] = [];
  for (let c = 0; c < 32; c++) if (!(mine & (1 << c)) && c !== up) unknown.push(c);
  const leader = (s.dealer + 1) % 4;
  const out = contracts.map(() => 0);
  const t0 = now();
  let n = 0;
  for (; n < samples && (n < 12 || now() - t0 < ms); n++) {
    const perm = shuffled(unknown);
    const five = [0, 0, 0, 0];
    five[me] = mine;
    let p = 0;
    for (let seat = 0; seat < 4; seat++) {
      if (seat === me) continue;
      for (let i = 0; i < 5; i++) five[seat] |= 1 << perm[p++];
    }
    const stock = perm.slice(p);
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
      // calibrated on played hands: the simulations underrate صن for its buyers by a few points
      if (!ma && k.t === NT) v += (k.buyer & 1) === (me & 1) ? SUN_BONUS : -SUN_BONUS;
      out[ki] += v;
    });
  }
  return out.map((v) => v / Math.max(1, n));
}

const SUN_BONUS = 3;

/** the contract «pass» stands for: decided in each sampled deal by what the next players would say */
const PASS: Contract = { t: -1, buyer: -1 };

/**
 * If I pass: what the others would most likely buy with the cards of this sample (a plain reading of
 * their hands: صن with aces and tens, حكم with the J / 9 of trumps), or null when everyone passes.
 */
function passOutcome(s: State, me: number, five: number[]): Contract | null {
  const ma = s.settings.mode === 'morocco';
  const b = s.bid!;
  const up = s.faceUp!;
  const ut = trumpIndex(up.suit);
  const order = b.order.map((id) => seatOf(s, id));
  const after = order.slice(order.indexOf(me) + 1);
  const hand = (seat: number) => [...cardsOf(five[seat]), up];
  const round2 = (players: number[]): Contract | null => {
    for (const p of players) {
      const h = hand(p);
      if (!ma && sunStrength(h) >= 8.5) return { t: NT, buyer: p };
      let best = -1;
      let bv = -1;
      for (let t = 0; t < 4; t++) {
        if (t === ut) continue;
        const v = hokmStrength(h, B_SUITS[t]);
        if (v > bv) {
          bv = v;
          best = t;
        }
      }
      if (bv >= 6.9) return { t: best, buyer: p };
    }
    return null;
  };
  if (b.round === 2) return round2(after);
  let best: Contract | null = b.best ? { t: trumpIndex(b.best.suit), buyer: seatOf(s, b.best.by) } : null;
  for (const p of after) {
    const h = hand(p);
    if (!ma && sunStrength(h) >= 8.5) return { t: NT, buyer: p };
    if (!best && hokmStrength(h, up.suit) >= 6.6) {
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

/** The expert's bid: each contract it may name is simulated; the best one is named when it is worth it. */
export function mindBid(s: State, id: string, options: BalootOption[], level: MindLevel): { call: BalootOption['call']; suit?: string } {
  const me = seatOf(s, id);
  const ma = s.settings.mode === 'morocco';
  if (options.length === 1) return { call: options[0].call };
  const partner = (me + 2) & 3;
  const up = s.faceUp!;
  const choices: { call: BalootOption['call']; suit?: string; k: Contract }[] = [];
  for (const o of options) {
    if (o.call === 'hokm' || o.call === 'confirm') {
      const suit = o.call === 'confirm' ? s.bid!.best!.suit : up.suit;
      choices.push({ call: o.call, k: { t: trumpIndex(suit), buyer: me } });
    } else if (o.call === 'sun') choices.push({ call: 'sun', k: { t: NT, buyer: me } });
    else if (o.call === 'ashkal') choices.push({ call: 'ashkal', k: { t: NT, buyer: partner } });
    else if (o.call === 'hokm2') for (const suit of o.suits ?? []) choices.push({ call: 'hokm2', suit, k: { t: trumpIndex(suit), buyer: me } });
  }
  // passing in the «صن?» window leaves the حكم already bought
  const b = s.bid!;
  const standing: Contract | null = b.stage === 'confirm' && b.best && options.some((o) => o.call === 'pass') ? { t: trumpIndex(b.best.suit), buyer: seatOf(s, b.best.by) } : null;
  const ks = choices.map((c) => c.k);
  const canPass = options.some((o) => o.call === 'pass');
  // what passing leads to: the حكم already bought («صن?» window), or what the next players would buy
  if (canPass) ks.push(standing ?? PASS);
  const samples = level === 'expert' ? 160 : 40;
  const vals = bidValues(s, me, ks, samples, level === 'expert' ? 30 : 8);
  const margin = buyMargin(s, me, ma);
  // a plain reading of the hand guards the simulations against their blind spots: no صن without
  // aces and tens, no حكم without real trumps (my cards + the face-up card; for أشكل the partner's unknown)
  const withUp = [...s.hands[id], up];
  const GATE_SUN = 7.5;
  const GATE_HOKM = 5.8;
  const sane = (i: number) => {
    const k = choices[i].k;
    if (k.buyer !== me) return true;
    if (k.t === NT) return sunStrength(withUp) >= GATE_SUN;
    return hokmStrength(withUp, B_SUITS[k.t]) >= GATE_HOKM;
  };
  let best = -1;
  for (let i = 0; i < choices.length; i++) if ((!canPass || sane(i)) && (best < 0 || vals[i] > vals[best])) best = i;
  let buy = false;
  if (best >= 0) buy = !canPass || vals[best] > vals[vals.length - 1] + margin;
  if (buy) {
    return { call: choices[best].call, suit: choices[best].suit };
  }
  return { call: 'pass' };
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
  const t0 = now();
  let n = 0;
  let buyerWins = 0;
  const ev = [0, 0, 0, 0, 0];
  for (; n < samples && (n < 12 || now() - t0 < ms); n++) {
    const deal = sampleDeal(kn, k.t);
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

