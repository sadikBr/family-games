/**
 * «البلوط» — a fast card engine for the bots and for the «الباقي لنا» check. Cards are numbers 0..31
 * (suit × 8 + rank, in the B_SUITS × B_RANKS order of the deck), hands are 32-bit masks. It knows the
 * Saudi and the Moroccan play duties, who takes a trick, a quick play policy used inside simulations
 * (every hand known), a double-dummy solver for the last tricks and the exact claim search.
 */
import type { BCard, BSuit } from '../../../src/shared/games/baloot';
import { B_RANKS, B_SUITS, cardValue, power } from '../../../src/shared/baloot-rules';

export const DECK32: BCard[] = B_SUITS.flatMap((suit) => B_RANKS.map((rank) => ({ id: `${rank}${suit}`, suit, rank })));
const INDEX = new Map(DECK32.map((c, i) => [c.id, i]));
/** the card's number */
export const ci = (c: BCard) => INDEX.get(c.id)!;
export const maskOf = (cards: readonly BCard[]) => {
  let m = 0;
  for (const c of cards) m |= 1 << ci(c);
  return m;
};
export const cardsOf = (m: number): BCard[] => {
  const out: BCard[] = [];
  while (m) {
    const b = m & -m;
    out.push(DECK32[31 - Math.clz32(b)]);
    m ^= b;
  }
  return out;
};
export const SUIT_MASK = [0xff, 0xff00, 0xff0000, 0xff000000 | 0];
/** the trump index for صن */
export const NT = 4;
export const trumpIndex = (s: BSuit | null) => (s ? B_SUITS.indexOf(s) : NT);
export const low = (m: number) => 31 - Math.clz32(m & -m);
export function popcount(m: number) {
  m = m - ((m >>> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >>> 2) & 0x33333333);
  return (((m + (m >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** POW / VAL / HIGHER are indexed [trump * 32 + card]; ABOVE [trump * 9 + power]: trumps stronger than that power */
export const POW = new Int8Array(5 * 32);
export const VAL = new Int8Array(5 * 32);
export const HIGHER = new Int32Array(5 * 32);
const ABOVE = new Int32Array(5 * 9);
for (let t = 0; t <= NT; t++) {
  const ts = t < NT ? B_SUITS[t] : null;
  for (let i = 0; i < 32; i++) {
    POW[t * 32 + i] = power(DECK32[i], ts);
    VAL[t * 32 + i] = cardValue(DECK32[i], ts);
  }
  for (let i = 0; i < 32; i++) {
    let m = 0;
    for (let j = 0; j < 32; j++) if (j >> 3 === i >> 3 && POW[t * 32 + j] > POW[t * 32 + i]) m |= 1 << j;
    HIGHER[t * 32 + i] = m;
  }
  if (t < NT) {
    for (let p = 0; p <= 8; p++) {
      let m = 0;
      for (let j = t * 8; j < t * 8 + 8; j++) if (POW[t * 32 + j] > p) m |= 1 << j;
      ABOVE[t * 9 + p] = m;
    }
  }
}

/** The strongest card of a mask (power inside its suit; trumps first when `t` is a suit). */
export function strongest(m: number, t: number): number {
  let best = -1;
  let bv = -1;
  while (m) {
    const b = m & -m;
    const c = 31 - Math.clz32(b);
    m ^= b;
    const v = POW[t * 32 + c] + (c >> 3 === t ? 16 : 0);
    if (v > bv) {
      bv = v;
      best = c;
    }
  }
  return best;
}

/** One hand being played, every card known (a real deal, or one sampled by a bot). Seats 0..3, team = seat & 1. */
export class Sim {
  h = [0, 0, 0, 0];
  tc = [0, 0, 0, 0];
  ts = [0, 0, 0, 0];
  n = 0;
  turn = 0;
  /** the card led was the highest one left in its suit (Saudi duties) */
  lb = false;
  /** card points (the last trick's 10 included) and tricks per team */
  pts = [0, 0];
  tr = [0, 0];
  /** cards still in the hands */
  left = 0;
  last = -1;
  /** suits each seat has shown it lacks (bit per suit) */
  vd = [0, 0, 0, 0];
  constructor(
    public t: number,
    public ma: boolean,
  ) {}

  clone(): Sim {
    const x = new Sim(this.t, this.ma);
    x.h = this.h.slice();
    x.tc = this.tc.slice();
    x.ts = this.ts.slice();
    x.n = this.n;
    x.turn = this.turn;
    x.lb = this.lb;
    x.pts = this.pts.slice();
    x.tr = this.tr.slice();
    x.left = this.left;
    x.last = this.last;
    x.vd = this.vd.slice();
    return x;
  }

  /** index in the trick of the card that holds it */
  holder(): number {
    const T = this.t * 32;
    let best = 0;
    for (let i = 1; i < this.n; i++) {
      const a = this.tc[best];
      const b = this.tc[i];
      if (b >> 3 === a >> 3) {
        if (POW[T + b] > POW[T + a]) best = i;
      } else if (b >> 3 === this.t) best = i;
    }
    return best;
  }

  /** the cards the player to play may play */
  legal(): number {
    const hand = this.h[this.turn];
    const n = this.n;
    if (!n) return hand;
    const t = this.t;
    const led = this.tc[0] >> 3;
    const follow = hand & SUIT_MASK[led];
    if (t === NT) return follow || hand;
    const T = t * 32;
    let top = 0;
    for (let k = 0; k < n; k++) {
      const c = this.tc[k];
      if (c >> 3 === t && POW[T + c] > top) top = POW[T + c];
    }
    const trumps = hand & SUIT_MASK[t];
    const over = trumps & ABOVE[t * 9 + top];
    if (this.ma) {
      if (led === t) return follow ? over || follow : hand;
      if (follow) return follow;
      if (n >= 2 && this.holder() === n - 2) return hand;
      if (!trumps) return hand;
      if (top > 0) return over || hand;
      return trumps;
    }
    const partnerHolds = n >= 2 && this.holder() === n - 2;
    if (led === t) {
      if (!follow) return hand;
      if (partnerHolds) return follow;
      return over || follow;
    }
    if (follow) return follow;
    if (!trumps) return hand;
    if (partnerHolds && (n === 3 || this.lb)) return hand;
    return over || hand;
  }

  play(c: number) {
    const s = this.turn;
    if (!this.n) {
      const all = this.h[0] | this.h[1] | this.h[2] | this.h[3];
      this.lb = (all & HIGHER[this.t * 32 + c]) === 0;
    } else if (c >> 3 !== this.tc[0] >> 3) this.vd[s] |= 1 << (this.tc[0] >> 3);
    this.h[s] &= ~(1 << c);
    this.tc[this.n] = c;
    this.ts[this.n] = s;
    this.n += 1;
    this.left -= 1;
    if (this.n < 4) {
      this.turn = (s + 1) & 3;
      return;
    }
    const w = this.ts[this.holder()];
    const T = this.t * 32;
    let v = VAL[T + this.tc[0]] + VAL[T + this.tc[1]] + VAL[T + this.tc[2]] + VAL[T + this.tc[3]];
    if (this.left === 0) v += 10;
    this.pts[w & 1] += v;
    this.tr[w & 1] += 1;
    this.n = 0;
    this.turn = w;
    this.last = w;
  }
}

/* ------------------------------------------------------------------ */
/* The quick policy used inside simulations                            */
/* ------------------------------------------------------------------ */

/** cheapest card: fewest points, then not a trump, then the weakest */
function cheapest(m: number, t: number): number {
  let best = -1;
  let bv = 1e9;
  const T = t * 32;
  while (m) {
    const b = m & -m;
    const c = 31 - Math.clz32(b);
    m ^= b;
    const v = VAL[T + c] * 40 + (c >> 3 === t ? 20 : 0) + POW[T + c];
    if (v < bv) {
      bv = v;
      best = c;
    }
  }
  return best;
}

/** the weakest winner: a plain card before a trump, then the lowest power */
function weakestWinner(m: number, t: number): number {
  let best = -1;
  let bv = 1e9;
  const T = t * 32;
  while (m) {
    const b = m & -m;
    const c = 31 - Math.clz32(b);
    m ^= b;
    const v = (c >> 3 === t ? 20 : 0) + POW[T + c];
    if (v < bv) {
      bv = v;
      best = c;
    }
  }
  return best;
}

/** may a player holding `hm` beat card `c` in a trick led in `led`? */
function canBeat(x: Sim, hm: number, c: number, led: number): boolean {
  const t = x.t;
  const fol = hm & SUIT_MASK[led];
  if (fol) return c >> 3 === led && (fol & HIGHER[t * 32 + c]) !== 0;
  if (t === NT) return false;
  const tr = hm & SUIT_MASK[t];
  if (!tr) return false;
  return c >> 3 !== t || (tr & HIGHER[t * 32 + c]) !== 0;
}

/**
 * A good, quick move for the player to play, every hand known: buyers pull trumps with the master
 * trump, sure winners are cashed, a partner who surely holds the trick gets points, a trick is won
 * as cheaply as possible, otherwise the cheapest card goes.
 */
export function policy(x: Sim, buyer: number): number {
  const legal = x.legal();
  if ((legal & (legal - 1)) === 0) return low(legal);
  const me = x.turn;
  const t = x.t;
  const T = t * 32;
  const h = x.h;
  const o1 = h[(me + 1) & 3];
  const o3 = h[(me + 3) & 3];
  const part = h[(me + 2) & 3];
  const opp = o1 | o3;
  const others = opp | part;
  const trumpM = t < NT ? SUIT_MASK[t] : 0;
  if (!x.n) {
    if (t < NT) {
      const myTr = legal & trumpM;
      if ((me & 1) === buyer && opp & trumpM && myTr) {
        const top = strongest(myTr, t);
        if (!(others & HIGHER[T + top])) return top;
      }
    }
    // a sure winner in a plain suit that no opponent can ruff
    let best = -1;
    let bv = -1;
    let m = legal & ~trumpM;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      if (others & HIGHER[T + c]) continue;
      const s = c >> 3;
      if (t < NT && ((!(o1 & SUIT_MASK[s]) && o1 & trumpM) || (!(o3 & SUIT_MASK[s]) && o3 & trumpM))) continue;
      if (VAL[T + c] > bv) {
        bv = VAL[T + c];
        best = c;
      }
    }
    if (best >= 0) return best;
    // a small card towards the partner's master
    for (let s = 0; s < 4; s++) {
      if (s === t) continue;
      const mine = legal & SUIT_MASK[s];
      const ps = part & SUIT_MASK[s];
      if (!mine || !ps) continue;
      const pt = strongest(ps, t);
      if ((opp | mine) & HIGHER[T + pt]) continue;
      if (t < NT && ((!(o1 & SUIT_MASK[s]) && o1 & trumpM) || (!(o3 & SUIT_MASK[s]) && o3 & trumpM))) continue;
      return cheapest(mine, t);
    }
    const plain = legal & ~trumpM;
    if (!plain && (me & 1) === buyer) return strongest(legal, t);
    return cheapest(plain || legal, t);
  }
  const n = x.n;
  const led = x.tc[0] >> 3;
  const hp = x.holder();
  const hc = x.tc[hp];
  const partnerHolds = x.ts[hp] === ((me + 2) & 3);
  const last = n === 3;
  const later = n < 3 ? o1 : 0;
  let tv = 0;
  for (let k = 0; k < n; k++) tv += VAL[T + x.tc[k]];
  if (partnerHolds && (last || !canBeat(x, later, hc, led))) {
    // feed points to the partner: the most valuable card that would not win a trick later anyway
    let best = -1;
    let bv = -1e9;
    let m = legal;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      let v = VAL[T + c] * 4 - POW[T + c];
      if (c >> 3 === t) v -= POW[T + c] >= 6 ? 200 : 30;
      else if (c >> 3 !== led && !(others & HIGHER[T + c])) v -= 60;
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    return best;
  }
  let win = legal & HIGHER[T + hc];
  if (t < NT && hc >> 3 !== t) win |= legal & trumpM;
  if (win) {
    if (last) return weakestWinner(win, t);
    let sure = 0;
    let m = win;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      if (!canBeat(x, later, c, led)) sure |= b;
    }
    if (sure) return weakestWinner(sure, t);
    if (!partnerHolds && tv >= 10) return strongest(win, t);
  }
  return cheapest(legal, t);
}

/**
 * The same kind of play, but each player only uses what a real player knows: its own hand, the cards
 * gone, the voids shown. Used for the simulations (they then look like real games).
 */
export function blindPolicy(x: Sim, buyer: number): number {
  const legal = x.legal();
  if ((legal & (legal - 1)) === 0) return low(legal);
  const me = x.turn;
  const t = x.t;
  const T = t * 32;
  const mine = x.h[me];
  // every card I can't see (the others' hands)
  const unseen = (x.h[0] | x.h[1] | x.h[2] | x.h[3]) & ~mine;
  const trumpM = t < NT ? SUIT_MASK[t] : 0;
  const trumpsOut = (unseen & trumpM) !== 0;
  const op1 = (me + 1) & 3;
  const op3 = (me + 3) & 3;
  const ptn = (me + 2) & 3;
  const oppVoidTr = t < NT && x.vd[op1] & (1 << t) && x.vd[op3] & (1 << t);
  /** may an opponent trump a card of suit s? */
  const ruff = (s: number, who: number[] = [op1, op3]) => {
    if (t === NT || s === t || !trumpsOut || oppVoidTr) return false;
    for (const p of who) if (x.vd[p] & (1 << s) && !(x.vd[p] & (1 << t))) return true;
    // few cards of the suit left: someone is likely out of it
    return popcount(unseen & SUIT_MASK[s]) <= 1;
  };
  if (!x.n) {
    if (t < NT && (me & 1) === buyer && trumpsOut && !oppVoidTr) {
      const myTr = legal & trumpM;
      if (myTr) {
        const top = strongest(myTr, t);
        if (!(unseen & HIGHER[T + top])) return top;
        // partner bought: lead a small trump to pull them
        if (popcount(myTr) >= 2 && popcount(unseen & trumpM) >= 3) return cheapest(myTr, t);
      }
    }
    let best = -1;
    let bv = -1;
    let m = legal & ~trumpM;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      if (unseen & HIGHER[T + c]) continue;
      if (ruff(c >> 3)) continue;
      if (VAL[T + c] > bv) {
        bv = VAL[T + c];
        best = c;
      }
    }
    if (best >= 0) return best;
    // a suit the partner has shown to lack (and still has trumps for): let the partner trump it
    if (t < NT && (me & 1) === buyer) {
      for (let s = 0; s < 4; s++) {
        if (s === t || !(legal & SUIT_MASK[s])) continue;
        if (x.vd[ptn] & (1 << s) && !(x.vd[ptn] & (1 << t))) return cheapest(legal & SUIT_MASK[s], t);
      }
    }
    // the cheapest card of a suit where I hold no unguarded honour
    let pick = -1;
    let pv = 1e9;
    m = legal;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      const s = c >> 3;
      let v = VAL[T + c] * 40 + POW[T + c] + (s === t ? ((me & 1) === buyer ? 30 : 400) : 0);
      // keep a 10 / K that still needs its guard
      const mineS = mine & SUIT_MASK[s];
      if (s !== t && popcount(mineS) <= 2 && mineS & ~b && VAL[T + low(mineS & ~b)] >= 4 && unseen & HIGHER[T + low(mineS & ~b)]) v += 25;
      if (v < pv) {
        pv = v;
        pick = c;
      }
    }
    return pick;
  }
  const n = x.n;
  const led = x.tc[0] >> 3;
  const hp = x.holder();
  const hc = x.tc[hp];
  const partnerHolds = x.ts[hp] === ptn;
  const last = n === 3;
  let tv = 0;
  for (let k = 0; k < n; k++) tv += VAL[T + x.tc[k]];
  /** may the opponent still to play beat card c? (not known: assume yes when a higher card or a ruff is possible) */
  const beatable = (c: number) => {
    if (last) return false;
    const v1 = x.vd[op1];
    if (c >> 3 === led) {
      if (unseen & HIGHER[T + c] && !(v1 & (1 << led))) return true;
      return led !== t && ruff(led, [op1]);
    }
    // a trump on a plain suit: only an opponent out of the suit may go over it
    return (unseen & HIGHER[T + c]) !== 0 && (v1 & (1 << led)) !== 0 && !(v1 & (1 << t));
  };
  if (partnerHolds && !beatable(hc)) {
    let best = -1;
    let bv = -1e9;
    let m = legal;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      let v = VAL[T + c] * 4 - POW[T + c];
      if (c >> 3 === t) v -= POW[T + c] >= 6 ? 200 : 30;
      else if (c >> 3 !== led && !(unseen & HIGHER[T + c])) v -= 60;
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    return best;
  }
  let win = legal & HIGHER[T + hc];
  if (t < NT && hc >> 3 !== t) win |= legal & trumpM;
  if (win) {
    if (last) return weakestWinner(win, t);
    let sure = 0;
    let m = win;
    while (m) {
      const b = m & -m;
      const c = 31 - Math.clz32(b);
      m ^= b;
      if (!beatable(c)) sure |= b;
    }
    if (sure) return weakestWinner(sure, t);
    if (!partnerHolds && tv >= 10) return strongest(win, t);
  }
  return cheapest(legal, t);
}

/** Play the hand to its end with the quick policy (`blind`: each player sees only its own hand). */
export function rollout(x: Sim, buyer: number, blind = false) {
  if (blind) while (x.left > 0) x.play(blindPolicy(x, buyer));
  else while (x.left > 0) x.play(policy(x, buyer));
}

/* ------------------------------------------------------------------ */
/* Search helpers: play / undo                                         */
/* ------------------------------------------------------------------ */

/** per-ply buffers of the searches (they never run at the same time): moves, and the state to restore */
const MOVES = new Int32Array(34 * 8);
const SAVED = new Int32Array(34 * 14);

/** Write the cards of a mask at ply `d` in search order (trumps first, strongest first); returns how many. */
function ordered(m: number, t: number, d: number): number {
  const T = t * 32;
  const off = d * 8;
  let n = 0;
  while (m) {
    const b = m & -m;
    const c = 31 - Math.clz32(b);
    m ^= b;
    const k = POW[T + c] + (c >> 3 === t ? 16 : 0);
    let i = n++;
    while (i > 0) {
      const p = MOVES[off + i - 1];
      if (POW[T + p] + (p >> 3 === t ? 16 : 0) >= k) break;
      MOVES[off + i] = p;
      i--;
    }
    MOVES[off + i] = c;
  }
  return n;
}

function save(x: Sim, d: number) {
  const o = d * 14;
  SAVED[o] = x.n;
  SAVED[o + 1] = x.turn;
  SAVED[o + 2] = x.lb ? 1 : 0;
  SAVED[o + 3] = x.pts[0];
  SAVED[o + 4] = x.pts[1];
  SAVED[o + 5] = x.tr[0];
  SAVED[o + 6] = x.tr[1];
  SAVED[o + 7] = x.last;
  SAVED[o + 8] = x.tc[0];
  SAVED[o + 9] = x.tc[1];
  SAVED[o + 10] = x.tc[2];
  SAVED[o + 11] = x.ts[0];
  SAVED[o + 12] = x.ts[1];
  SAVED[o + 13] = x.ts[2];
}

function undo(x: Sim, c: number, d: number) {
  const o = d * 14;
  const turn = SAVED[o + 1];
  x.h[turn] |= 1 << c;
  x.left += 1;
  x.n = SAVED[o];
  x.turn = turn;
  x.lb = SAVED[o + 2] === 1;
  x.pts[0] = SAVED[o + 3];
  x.pts[1] = SAVED[o + 4];
  x.tr[0] = SAVED[o + 5];
  x.tr[1] = SAVED[o + 6];
  x.last = SAVED[o + 7];
  x.tc[0] = SAVED[o + 8];
  x.tc[1] = SAVED[o + 9];
  x.tc[2] = SAVED[o + 10];
  x.ts[0] = SAVED[o + 11];
  x.ts[1] = SAVED[o + 12];
  x.ts[2] = SAVED[o + 13];
}

class Budget extends Error {}

/* ------------------------------------------------------------------ */
/* Double-dummy solver (the last tricks)                               */
/* ------------------------------------------------------------------ */

/**
 * The best `team` can do from here with every hand known, as 16 × card points + tricks taken from now
 * on (card points first, then tricks). Throws when `limit` nodes are not enough.
 */
export function ddValue(x0: Sim, team: number, limit = 200_000): number {
  const x = x0.clone();
  const tt = new Map<number, [number, number]>();
  let nodes = 0;
  const base = () => x.pts[team] * 16 + x.tr[team];
  const go = (alpha: number, beta: number, d: number): number => {
    if (x.left === 0) return base();
    if (++nodes > limit) throw new Budget();
    let key = -1;
    let b0 = 0;
    if (x.n === 0) {
      key = ((x.h[0] | x.h[1] | x.h[2] | x.h[3]) >>> 0) * 4 + x.turn;
      b0 = base();
      const e = tt.get(key);
      if (e) {
        if (e[0] === e[1]) return b0 + e[0];
        if (b0 + e[0] >= beta) return b0 + e[0];
        if (b0 + e[1] <= alpha) return b0 + e[1];
        alpha = Math.max(alpha, b0 + e[0]);
        beta = Math.min(beta, b0 + e[1]);
      }
    }
    const a0 = alpha;
    const b00 = beta;
    const maxi = (x.turn & 1) === team;
    let best = maxi ? -1e9 : 1e9;
    const nm = ordered(x.legal(), x.t, d);
    for (let i = 0; i < nm; i++) {
      const c = MOVES[d * 8 + i];
      save(x, d);
      x.play(c);
      const v = go(alpha, beta, d + 1);
      undo(x, c, d);
      if (maxi) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
      } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    if (key >= 0) {
      const f = best - b0;
      const e = tt.get(key) ?? [-1e9, 1e9];
      if (best <= a0) e[1] = Math.min(e[1], f);
      else if (best >= b00) e[0] = Math.max(e[0], f);
      else e[0] = e[1] = f;
      tt.set(key, e);
    }
    return best;
  };
  return go(-1e9, 1e9, 0) - base();
}

/* ------------------------------------------------------------------ */
/* «الباقي لنا»: are all the remaining tricks certain?                 */
/* ------------------------------------------------------------------ */

/**
 * Does `team` take every remaining trick whatever the others play (legal plays only)? With `solo`
 * set, only that player's choices count: the partner's cards may be played any legal way too (the
 * claimer's own hand makes it certain). Returns null when the search would be too big.
 */
export function claimCertain(x0: Sim, team: number, solo = -1, limit = 25_000): boolean | null {
  if (x0.left === 0) return false;
  const x = x0.clone();
  const memo = new Map<number, boolean>();
  let nodes = 0;
  const go = (d: number): boolean => {
    if (x.left === 0) return true;
    if (++nodes > limit) throw new Budget();
    let key = -1;
    if (x.n === 0) {
      key = ((x.h[0] | x.h[1] | x.h[2] | x.h[3]) >>> 0) * 4 + x.turn;
      const e = memo.get(key);
      if (e !== undefined) return e;
    }
    const choose = solo >= 0 ? x.turn === solo : (x.turn & 1) === team;
    let res = !choose;
    const nm = ordered(x.legal(), x.t, d);
    for (let i = 0; i < nm; i++) {
      const c = MOVES[d * 8 + i];
      const n0 = x.n;
      save(x, d);
      x.play(c);
      const ok = n0 === 3 ? (x.last & 1) === team && go(d + 1) : go(d + 1);
      undo(x, c, d);
      if (choose && ok) {
        res = true;
        break;
      }
      if (!choose && !ok) {
        res = false;
        break;
      }
    }
    if (key >= 0) memo.set(key, res);
    return res;
  };
  try {
    return go(0);
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
}
