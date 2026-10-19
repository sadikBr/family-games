/**
 * «التريس» — the expert bots and the «الباقي لنا» check. A card is a number suit × 10 + k, where k is
 * its strength inside the suit (0 = the 3, the strongest … 9 = the 4); a hand is 4 suit masks of 10 bits.
 * The bots use only what their phone shows (their hand, every card played and by whom, so the voids
 * shown); each move is a determinized Monte-Carlo search: deals of the unknown cards consistent with
 * the voids are played out by a quick policy in which each player sees only its own hand, and the card
 * with the best average result is played.
 */
import { SUITS, type Card } from '../../src/shared/cards';

const STRENGTH = [3, 2, 1, 12, 11, 10, 7, 6, 5, 4];
/** thirds of a point per card (index k): 3, 2 → ⅓; 1 → 1; 12, 11, 10 → ⅓ */
const THIRDS = [1, 1, 3, 1, 1, 1, 0, 0, 0, 0];
export const tcode = (c: Card) => SUITS.indexOf(c.suit) * 10 + STRENGTH.indexOf(c.rank);
export const tcard = (i: number): Card => {
  const suit = SUITS[Math.floor(i / 10)];
  const rank = STRENGTH[i % 10];
  return { id: `${suit}-${rank}`, suit, rank };
};
const thirdsOf = (i: number) => THIRDS[i % 10];
const lowBit = (m: number) => 31 - Math.clz32(m & -m);
function pop(m: number) {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** One hand being played with every card known (a real deal, or one sampled by a bot). Team = seat & 1. */
export class TSim {
  /** [seat * 4 + suit]: the 10-bit mask of that suit in that hand (bit 0 = the 3) */
  h = new Int32Array(16);
  tc = [0, 0, 0, 0];
  ts = [0, 0, 0, 0];
  n = 0;
  turn = 0;
  /** thirds of a point and tricks per team */
  pts = [0, 0];
  tr = [0, 0];
  left = 0;
  last = -1;
  /** suits each seat has shown it lacks */
  vd = [0, 0, 0, 0];

  clone(): TSim {
    const x = new TSim();
    x.h.set(this.h);
    x.tc = this.tc.slice();
    x.ts = this.ts.slice();
    x.n = this.n;
    x.turn = this.turn;
    x.pts = this.pts.slice();
    x.tr = this.tr.slice();
    x.left = this.left;
    x.last = this.last;
    x.vd = this.vd.slice();
    return x;
  }

  add(seat: number, c: number) {
    this.h[seat * 4 + Math.floor(c / 10)] |= 1 << c % 10;
  }

  holder(): number {
    let best = 0;
    for (let i = 1; i < this.n; i++) {
      const a = this.tc[best];
      const b = this.tc[i];
      if (Math.floor(b / 10) === Math.floor(a / 10) && b % 10 < a % 10) best = i;
    }
    return best;
  }

  /** the cards the player to play may play */
  legal(): number[] {
    const out: number[] = [];
    const base = this.turn * 4;
    if (this.n) {
      const led = Math.floor(this.tc[0] / 10);
      let m = this.h[base + led];
      if (m) {
        while (m) {
          out.push(led * 10 + lowBit(m));
          m &= m - 1;
        }
        return out;
      }
    }
    for (let s = 0; s < 4; s++) {
      let m = this.h[base + s];
      while (m) {
        out.push(s * 10 + lowBit(m));
        m &= m - 1;
      }
    }
    return out;
  }

  play(c: number) {
    const s = this.turn;
    const suit = Math.floor(c / 10);
    this.h[s * 4 + suit] &= ~(1 << c % 10);
    if (this.n && suit !== Math.floor(this.tc[0] / 10)) this.vd[s] |= 1 << Math.floor(this.tc[0] / 10);
    this.tc[this.n] = c;
    this.ts[this.n] = s;
    this.n += 1;
    this.left -= 1;
    if (this.n < 4) {
      this.turn = (s + 1) & 3;
      return;
    }
    const w = this.ts[this.holder()];
    let v = thirdsOf(this.tc[0]) + thirdsOf(this.tc[1]) + thirdsOf(this.tc[2]) + thirdsOf(this.tc[3]);
    if (this.left === 0) v += 3;
    this.pts[w & 1] += v;
    this.tr[w & 1] += 1;
    this.n = 0;
    this.turn = w;
    this.last = w;
  }
}

/** unseen cards of a suit (the three other hands) */
const unseenSuit = (x: TSim, me: number, s: number) => {
  let m = 0;
  for (let p = 0; p < 4; p++) if (p !== me) m |= x.h[p * 4 + s];
  return m;
};

/**
 * A quick move with only what the player knows: cash a card nobody can beat, give points to a partner
 * who surely holds the trick, win cheaply when it is worth it, otherwise play low.
 */
export function trisPolicy(x: TSim): number {
  const legal = x.legal();
  if (legal.length === 1) return legal[0];
  const me = x.turn;
  const op1 = (me + 1) & 3;
  // c is the best card left in its suit (no higher one in any other hand)
  const boss = (c: number) => {
    const s = Math.floor(c / 10);
    return (unseenSuit(x, me, s) & ((1 << c % 10) - 1)) === 0;
  };
  const value = (c: number) => thirdsOf(c);
  if (!x.n) {
    let best = -1;
    let bv = -1;
    for (const c of legal) {
      if (!boss(c)) continue;
      // a boss that also pulls points out: more unseen cards of the suit is better
      const v = value(c) * 4 + pop(unseenSuit(x, me, Math.floor(c / 10)));
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    if (best >= 0) return best;
    // a low card from the longest suit (keep the ace and the cards that guard it)
    let pick = -1;
    let pv = 1e9;
    for (const c of legal) {
      const s = Math.floor(c / 10);
      const len = pop(x.h[me * 4 + s]);
      let v = value(c) * 30 - (c % 10) - len * 3;
      if (c % 10 === 2) v += 40;
      if (v < pv) {
        pv = v;
        pick = c;
      }
    }
    return pick;
  }
  const led = Math.floor(x.tc[0] / 10);
  const hp = x.holder();
  const hc = x.tc[hp];
  const partnerHolds = x.ts[hp] === ((me + 2) & 3);
  const last = x.n === 3;
  let tv = 0;
  for (let k = 0; k < x.n; k++) tv += thirdsOf(x.tc[k]);
  /** may the opponent still to play beat card c of the suit led? (only what I know: unseen higher cards, its voids) */
  const higherUnseen = (c: number) => !last && !(x.vd[op1] & (1 << led)) && (unseenSuit(x, me, led) & ((1 << c % 10) - 1)) !== 0;
  const following = Math.floor(legal[0] / 10) === led;
  if (partnerHolds && (last || !higherUnseen(hc))) {
    // smear: the most points, but keep a boss of another suit
    let best = -1;
    let bv = -1e9;
    for (const c of legal) {
      let v = value(c) * 10 - (9 - (c % 10)) * 0.1;
      if (!following && boss(c) && value(c) < 3) v -= 15;
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    return best;
  }
  if (following) {
    const winners = legal.filter((c) => c % 10 < hc % 10);
    if (winners.length) {
      // the weakest winner when last or when it can't be beaten any more
      const weakest = (cs: number[]) => cs.reduce((a, b) => (b % 10 > a % 10 ? b : a));
      if (last) return weakest(winners);
      const sure = winners.filter((c) => !higherUnseen(c));
      if (sure.length) return weakest(sure);
      if (!partnerHolds && tv >= 3) return winners.reduce((a, b) => (b % 10 < a % 10 ? b : a));
    }
  }
  // the cheapest card: fewest points, then the weakest; on a void, from a suit with no boss
  let pick = -1;
  let pv = 1e9;
  for (const c of legal) {
    let v = value(c) * 30 - (c % 10);
    if (!following && boss(c)) v += 20;
    if (v < pv) {
      pv = v;
      pick = c;
    }
  }
  return pick;
}

export function trisRollout(x: TSim) {
  while (x.left > 0) x.play(trisPolicy(x));
}

/* ------------------------------------------------------------------ */
/* What a seat knows, and the sampled deals                            */
/* ------------------------------------------------------------------ */

export interface TrisSeen {
  seats: string[];
  hands: Record<string, Card[]>;
  /** the tricks collected this hand, then the trick on the table */
  log: { by: string; card: Card }[][];
  trick: { by: string; card: Card }[];
  turn: string;
  /** thirds and tricks per side ('A' = seats 0 & 2) */
  thirds: Record<string, number>;
  tricks: Record<string, number>;
}

/** Deal the unknown cards to the three other seats (voids respected; relaxed if impossible). */
function sampleTris(me: number, mine: number[], need: number[], voids: number[], pool: number[]): number[][] | null {
  const slots = need.reduce((t, n, p) => (p === me ? t : t + n), 0);
  for (let attempt = 0; attempt < 30; attempt++) {
    const relax = attempt >= 20;
    let cards = pool.slice();
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    // more unknown cards than places (a history that was not kept): some of them are simply gone
    if (cards.length > slots) cards = cards.slice(0, slots);
    const left = need.slice();
    left[me] = 0;
    const ok = (p: number, c: number) => p !== me && left[p] > 0 && (relax || !(voids[p] & (1 << Math.floor(c / 10))));
    const width = (c: number) => [0, 1, 2, 3].filter((p) => ok(p, c)).length;
    const order = cards.map((c) => ({ c, w: width(c) })).sort((a, b) => a.w - b.w);
    const out: number[][] = [[], [], [], []];
    out[me] = mine;
    let fail = false;
    for (const { c } of order) {
      let tot = 0;
      for (let p = 0; p < 4; p++) if (ok(p, c)) tot += left[p];
      if (!tot) {
        fail = true;
        break;
      }
      let r = Math.random() * tot;
      let p = 0;
      for (; p < 4; p++) {
        if (!ok(p, c)) continue;
        r -= left[p];
        if (r < 0) break;
      }
      if (p > 3) p = [0, 1, 2, 3].find((q) => ok(q, c))!;
      out[p].push(c);
      left[p] -= 1;
    }
    if (!fail) return out;
  }
  return null;
}

const TRIS_BUDGET = { expert: { ms: 25, max: 500, min: 24 }, smart: { ms: 6, max: 24, min: 8 } };
/** Tests: a fixed number of sampled deals instead of the time budget (repeatable, quick); null restores it. */
let fixedSamples: number | null = null;
export function setTrisBudget(n: number | null) {
  fixedSamples = n;
}

/** The expert / smart move: the legal card with the best average result over sampled deals. */
export function trisMindPlay(v: TrisSeen, me: string, legal: Card[], level: 'expert' | 'smart'): Card {
  if (legal.length === 1) return legal[0];
  const b = fixedSamples ? { ms: Infinity, max: fixedSamples, min: fixedSamples } : TRIS_BUDGET[level];
  const t0 = performance.now();
  const seat = v.seats.indexOf(me);
  const team = seat & 1;
  const voids = [0, 0, 0, 0];
  const seen = new Set<number>();
  for (const trick of [...v.log, v.trick]) {
    if (!trick.length) continue;
    const led = trick[0].card.suit;
    for (const p of trick) {
      seen.add(tcode(p.card));
      if (p.card.suit !== led) voids[v.seats.indexOf(p.by)] |= 1 << SUITS.indexOf(led);
    }
  }
  const mine = v.hands[me].map(tcode);
  for (const c of mine) seen.add(c);
  const pool: number[] = [];
  for (let c = 0; c < 40; c++) if (!seen.has(c)) pool.push(c);
  const need = v.seats.map((id) => v.hands[id].length);
  const base = new TSim();
  base.n = v.trick.length;
  v.trick.forEach((p, k) => {
    base.tc[k] = tcode(p.card);
    base.ts[k] = v.seats.indexOf(p.by);
  });
  base.turn = seat;
  base.pts = [v.thirds.A ?? 0, v.thirds.B ?? 0];
  base.tr = [v.tricks.A ?? 0, v.tricks.B ?? 0];
  base.left = need.reduce((a, c) => a + c, 0);
  base.vd = voids.slice();
  const cands = legal.map(tcode);
  const total = new Float64Array(cands.length);
  const score = (x: TSim) => Math.floor(x.pts[team] / 3) - Math.floor(x.pts[team ^ 1] / 3) + 0.15 * (x.pts[team] - x.pts[team ^ 1]);
  let n = 0;
  for (; n < b.max && (n < b.min || performance.now() - t0 < b.ms); n++) {
    const deal = sampleTris(seat, mine, need, voids, pool);
    if (!deal) break;
    const x = base.clone();
    deal.forEach((cs, p) => cs.forEach((c) => x.add(p, c)));
    for (let i = 0; i < cands.length; i++) {
      const y = x.clone();
      y.play(cands[i]);
      trisRollout(y);
      total[i] += score(y);
    }
    if (performance.now() - t0 > b.ms * 2.2) break;
  }
  let best = 0;
  for (let i = 1; i < cands.length; i++) {
    const d = total[i] - total[best];
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && thirdsOf(cands[i]) * 20 + (9 - (cands[i] % 10)) < thirdsOf(cands[best]) * 20 + (9 - (cands[best] % 10)))) best = i;
  }
  return legal[best];
}

/* ------------------------------------------------------------------ */
/* «الباقي لنا»                                                        */
/* ------------------------------------------------------------------ */

class Budget extends Error {}

/** Does `team` take every remaining trick whatever the others play? (`solo`: only that seat chooses). Null: too big. */
export function trisCertain(x0: TSim, team: number, solo = -1, limit = 25_000): boolean | null {
  if (x0.left === 0) return false;
  const x = x0.clone();
  const memo = new Map<string, boolean>();
  let nodes = 0;
  const go = (): boolean => {
    if (x.left === 0) return true;
    if (++nodes > limit) throw new Budget();
    let key = '';
    if (x.n === 0) {
      key = `${x.h[0]},${x.h[1]},${x.h[2]},${x.h[3]},${x.h[4]},${x.h[5]},${x.h[6]},${x.h[7]},${x.h[8]},${x.h[9]},${x.h[10]},${x.h[11]},${x.h[12]},${x.h[13]},${x.h[14]},${x.h[15]}|${x.turn}`;
      const e = memo.get(key);
      if (e !== undefined) return e;
    }
    const choose = solo >= 0 ? x.turn === solo : (x.turn & 1) === team;
    let res = !choose;
    // strongest first: the winning tries (and the refutations) come first
    const moves = x.legal().sort((a, b) => (a % 10) - (b % 10));
    for (const c of moves) {
      const n0 = x.n;
      const turn = x.turn;
      const p0 = x.pts[0];
      const p1 = x.pts[1];
      const t0 = x.tr[0];
      const t1 = x.tr[1];
      const last = x.last;
      const v0 = x.vd[turn];
      const c0 = x.tc[0];
      const c1 = x.tc[1];
      const c2 = x.tc[2];
      const s0 = x.ts[0];
      const s1 = x.ts[1];
      const s2 = x.ts[2];
      x.play(c);
      const ok = n0 === 3 ? (x.last & 1) === team && go() : go();
      x.h[turn * 4 + Math.floor(c / 10)] |= 1 << c % 10;
      x.left += 1;
      x.n = n0;
      x.turn = turn;
      x.pts[0] = p0;
      x.pts[1] = p1;
      x.tr[0] = t0;
      x.tr[1] = t1;
      x.last = last;
      x.vd[turn] = v0;
      x.tc[0] = c0;
      x.tc[1] = c1;
      x.tc[2] = c2;
      x.ts[0] = s0;
      x.ts[1] = s1;
      x.ts[2] = s2;
      if (choose && ok) {
        res = true;
        break;
      }
      if (!choose && !ok) {
        res = false;
        break;
      }
    }
    if (key) memo.set(key, res);
    return res;
  };
  try {
    return go();
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
}

/** The real hand as a simulation (every card known: the server). `trick` complete → the next one. */
export function trisSimOf(seats: string[], hands: Record<string, Card[]>, trick: { by: string; card: Card }[], turn: string): TSim {
  const x = new TSim();
  seats.forEach((id, p) => hands[id].forEach((c) => x.add(p, tcode(c))));
  x.left = seats.reduce((t, id) => t + hands[id].length, 0);
  x.n = trick.length;
  trick.forEach((p, k) => {
    x.tc[k] = tcode(p.card);
    x.ts[k] = seats.indexOf(p.by);
  });
  x.turn = seats.indexOf(turn);
  return x;
}

/** Is `team` certain to take every remaining trick from here (both partners choosing)? For tests. */
export const trisTeamCertain = (x: TSim, team: number) => trisCertain(x, team, -1, 1_000_000) === true;

/** Who may claim «الباقي لنا» (and whose hands to show), or null. */
export function trisClaim(x: TSim, seats: string[]): { by: string; side: 'A' | 'B'; reveal: string[] } | null {
  if ((x.left + x.n) / 4 < 2) return null;
  // capped in nodes (a few ms of work, the same on every machine): a position too big is asked again after the next card
  for (const team of [0, 1]) {
    if (trisCertain(x, team, -1, 3000) !== true) continue;
    const order = [0, 1, 2, 3].map((k) => (x.turn + k) & 3).filter((p) => (p & 1) === team);
    const side = team === 0 ? 'A' : 'B';
    // only one player's own cards, whatever the partner plays (see balootClaim): no offer that needs both partners
    for (const p of order) if (trisCertain(x, team, p, 20_000) === true) return { by: seats[p], side, reveal: [seats[p]] };
  }
  return null;
}
