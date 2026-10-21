/**
 * «البلوط» — how much a حكم purchase is worth, from the cards the bidder knows (its 5 cards and the
 * face-up card, which the buyer always takes). Used by every bot level (and as the «what would the
 * others do» model inside the expert's simulations).
 *
 * The weights were FITTED, not guessed: ~21,000 Moroccan and ~17,000 Saudi purchases forced on random
 * deals (every seat, the face-up suit and the bidder's best other suit) and played out by the expert
 * bots; a linear model of the buying team's score minus the defenders' (Moroccan: raw points of
 * maScoreHand; Saudi: game points of scoreHand) and a logistic model of «the contract fails» on the
 * features below. A linear model was as good as gradient boosting on the same features (the noise of
 * the 26 unseen cards dominates), so the simple, readable one is kept.
 *
 * What the data says (Moroccan): with J + 9 of trumps a purchase makes ~+68 on average (11 % fail),
 * with the J alone ~+5 (28 % fail), with the 9 alone ~−34 (42 % fail), with neither ~−65 (52 % fail).
 * Trump length is the next biggest factor (each trump ~+45 up to 3), then side aces (~+27), a side 10
 * with its ace, belote (K + Q of trumps) and the announcements.
 */
import type { BCard, BSuit } from '../../src/shared/games/baloot';
import { B_RANKS, B_SUITS } from '../../src/shared/baloot-rules';

export interface HokmFeatures {
  J: number;
  nine: number;
  A: number;
  ten: number;
  /** K and Q of trumps together (belote) */
  belote: number;
  /** K or Q of trumps alone */
  kOrQ: number;
  /** 8 and 7 of trumps */
  low: number;
  /** trumps held */
  n: number;
  sideAces: number;
  /** side 10s with their ace */
  side10A: number;
  /** side 10s without the ace but with another card of the suit */
  side10g: number;
  /** a side 10 alone */
  side10bare: number;
  /** side kings with their ace */
  sideKA: number;
  /** side suits with no card / one card (not an ace) among the known cards */
  voids: number;
  singles: number;
  /** announcement points the known cards already make (sequences, fours), in units of 20, at most 5 */
  ann: number;
  /** the bidder leads the first trick */
  lead: number;
}

/** sequences (natural order A K Q J 10 9 8 7) and fours (Moroccan values; used for both rules as a size) */
function annPoints(cards: BCard[]): number {
  let pts = 0;
  for (const s of B_SUITS) {
    const idx = cards
      .filter((c) => c.suit === s)
      .map((c) => B_RANKS.indexOf(c.rank))
      .sort((a, b) => a - b);
    let run = 1;
    for (let i = 1; i <= idx.length; i++) {
      if (i < idx.length && idx[i] === idx[i - 1] + 1) run++;
      else {
        if (run >= 3) pts += run === 3 ? 20 : run === 4 ? 50 : 100;
        run = 1;
      }
    }
  }
  const FOUR: Record<string, number> = { J: 200, '9': 150, A: 100, '10': 100, K: 100, Q: 100 };
  for (const r of Object.keys(FOUR)) if (cards.filter((c) => c.rank === r).length === 4) pts += FOUR[r];
  return pts;
}

export function hokmFeatures(known: BCard[], trump: BSuit, lead: boolean): HokmFeatures {
  const tr = new Set(known.filter((c) => c.suit === trump).map((c) => c.rank));
  const h = (r: string) => (tr.has(r as BCard['rank']) ? 1 : 0);
  const f: HokmFeatures = {
    J: h('J'),
    nine: h('9'),
    A: h('A'),
    ten: h('10'),
    belote: h('K') * h('Q'),
    kOrQ: h('K') + h('Q') - 2 * h('K') * h('Q'),
    low: h('8') + h('7'),
    n: tr.size,
    sideAces: 0,
    side10A: 0,
    side10g: 0,
    side10bare: 0,
    sideKA: 0,
    voids: 0,
    singles: 0,
    ann: Math.min(5, annPoints(known) / 20),
    lead: lead ? 1 : 0,
  };
  for (const s of B_SUITS) {
    if (s === trump) continue;
    const rs = known.filter((c) => c.suit === s).map((c) => c.rank);
    const has = (r: string) => rs.includes(r as BCard['rank']);
    if (has('A')) f.sideAces++;
    if (has('10') && has('A')) f.side10A++;
    else if (has('10') && rs.length >= 2) f.side10g++;
    else if (has('10')) f.side10bare++;
    if (has('K') && has('A')) f.sideKA++;
    if (!rs.length) f.voids++;
    else if (rs.length === 1 && !has('A')) f.singles++;
  }
  return f;
}

interface Weights {
  bias: number;
  J: number;
  nine: number;
  J9: number;
  A: number;
  ten: number;
  belote: number;
  kOrQ: number;
  low: number;
  n: number;
  /** each trump beyond 3 */
  n3: number;
  sideAces: number;
  side10A: number;
  side10g: number;
  side10bare: number;
  sideKA: number;
  voids: number;
  singles: number;
  ann: number;
  lead: number;
  /** the J / the 9, per trump held */
  Jn: number;
  nineN: number;
}

/** expected (buying team − defenders), Moroccan raw points */
const MA_VALUE: Weights = {
  bias: -161.9, J: 36.6, nine: 4.0, J9: 8.8, A: 0.2, ten: -2.7, belote: 13.8, kOrQ: -3.0, low: -18.3, n: 44.5, n3: -14.4,
  sideAces: 27.1, side10A: 22.6, side10g: 9.2, side10bare: 7.3, sideKA: 3.1, voids: 4.7, singles: -1.2, ann: 23.7, lead: 4.4, Jn: 8.5, nineN: 4.9,
};
/** log-odds of «the contract fails», Moroccan */
const MA_FAIL: Weights = {
  bias: 1.394, J: -0.395, nine: 0.018, J9: -0.319, A: -0.064, ten: -0.005, belote: -0.183, kOrQ: 0.022, low: 0.217, n: -0.573, n3: 0.126,
  sideAces: -0.377, side10A: -0.236, side10g: -0.105, side10bare: -0.101, sideKA: -0.002, voids: -0.065, singles: 0.014, ann: -0.383, lead: -0.043, Jn: -0.253, nineN: -0.121,
};
/** Saudi, in game points (a حكم is worth 16) */
const SA_VALUE: Weights = {
  bias: -16.69, J: 4.66, nine: 0.7, J9: -0.01, A: -0.15, ten: 0.07, belote: 0.5, kOrQ: 0, low: -1.74, n: 4.54, n3: -1.23,
  sideAces: 2.84, side10A: 2.31, side10g: 0.6, side10bare: 0.75, sideKA: 0.38, voids: 0.4, singles: -0.14, ann: 2.53, lead: 0.75, Jn: 0.59, nineN: 0.59,
};
const SA_FAIL: Weights = {
  bias: 1.529, J: -0.55, nine: -0.071, J9: -0.28, A: -0.006, ten: -0.005, belote: -0.142, kOrQ: 0.004, low: 0.272, n: -0.642, n3: 0.023,
  sideAces: -0.391, side10A: -0.263, side10g: -0.07, side10bare: -0.085, sideKA: -0.044, voids: -0.034, singles: 0.007, ann: -0.465, lead: -0.109, Jn: -0.168, nineN: -0.102,
};

function linear(w: Weights, f: HokmFeatures): number {
  return (
    w.bias +
    w.J * f.J +
    w.nine * f.nine +
    w.J9 * f.J * f.nine +
    w.A * f.A +
    w.ten * f.ten +
    w.belote * f.belote +
    w.kOrQ * f.kOrQ +
    w.low * f.low +
    w.n * f.n +
    w.n3 * Math.max(0, f.n - 3) +
    w.sideAces * f.sideAces +
    w.side10A * f.side10A +
    w.side10g * f.side10g +
    w.side10bare * f.side10bare +
    w.sideKA * f.sideKA +
    w.voids * f.voids +
    w.singles * f.singles +
    w.ann * f.ann +
    w.lead * f.lead +
    w.Jn * f.J * f.n +
    w.nineN * f.nine * f.n
  );
}

export interface HokmEval {
  /** expected buying team − defenders (Moroccan raw points / Saudi game points) */
  value: number;
  /** probability the contract fails */
  fail: number;
  /** the J and/or the 9 of trumps are among the known cards (for reports: contract success per kind of hand) */
  top: 'J+9' | 'J' | '9' | 'none';
  f: HokmFeatures;
}

/**
 * The plain reading of a حكم purchase. There is no hard «J or 9» rule: the J and the 9 weigh a lot in
 * the fitted value (they are the two top trumps and 34 of the 62 trump points), but long trumps with
 * the A / 10, side aces, voids to ruff or an announcement can make a sound purchase without them — and
 * a lone J with nothing else is a pass. A bot buys only for a reasonable cause: an estimate clearly
 * positive, a failure risk under its level's cap, and (expert / smart) better than passing.
 */
export function hokmEval(known: BCard[], trump: BSuit, ma: boolean, lead: boolean): HokmEval {
  const f = hokmFeatures(known, trump, lead);
  const value = linear(ma ? MA_VALUE : SA_VALUE, f);
  const fail = 1 / (1 + Math.exp(-linear(ma ? MA_FAIL : SA_FAIL, f)));
  return { value, fail, top: f.J && f.nine ? 'J+9' : f.J ? 'J' : f.nine ? '9' : 'none', f };
}

/** a short (English, for logs and the self-play report) reason for a purchase decision */
export function hokmWhy(e: HokmEval): string {
  const f = e.f;
  const top = [f.J ? 'J' : '', f.nine ? '9' : '', f.A ? 'A' : '', f.ten ? '10' : ''].filter(Boolean).join(' ') || 'no honour';
  return `trumps ${f.n} (${top}), side aces ${f.sideAces}${f.belote ? ', belote' : ''}${f.ann ? `, ann ${f.ann * 20}` : ''} → est ${e.value >= 0 ? '+' : ''}${e.value.toFixed(0)}, fail ${(e.fail * 100).toFixed(0)}%`;
}

/**
 * A purchase whose plain estimate is below this is a bad one (clearly negative expected score): the
 * bots never make one (easy included: its noise can't push such a hand over), the reports count them.
 */
export const BAD_VALUE = { morocco: -15, saudi: -1.5 } as const;

/**
 * The purchase rule per level, in the units of `value` (Moroccan raw points / Saudi game points): the
 * estimate must reach `min` (easy: give or take `noise`) and the failure probability stay under `cap`;
 * smart / expert must also beat passing in their simulations (./baloot-mind.ts). Tuned in self-play
 * (scripts/baloot-selfplay.ts): expert minimums from 0 to 10 and caps from 0.32 to 0.45 scored the
 * same share of the points against the previous bots; the stricter rule loses fewer contracts.
 */
export const BUY_RULE = {
  morocco: {
    easy: { min: 8, noise: 14, cap: 0.42 },
    smart: { min: 14, noise: 0, cap: 0.36 },
    expert: { min: 10, noise: 0, cap: 0.32 },
  },
  saudi: {
    easy: { min: 1, noise: 1.6, cap: 0.42 },
    smart: { min: 1.6, noise: 0, cap: 0.36 },
    expert: { min: 1, noise: 0, cap: 0.32 },
  },
} as const;
