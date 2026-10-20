/**
 * «البلياردو» — the bots. They play like a person who sees the table:
 *
 * 1. Pots: for every ball they may hit and every pocket, how wide the pocket looks from that ball
 *    (straightDrop over a fan of directions), the ghost-ball aim, the cut angle, clear paths (cue → ghost,
 *    ball → pocket). 9-ball also tries a combination into the 9. Each candidate gets a few speeds (and on
 *    «ذكي» / «خبير» follow or draw), and every one of them is played with the real physics: did the ball
 *    drop, was it a foul, where did the cue ball stop — and how good is the next shot from there.
 * 2. Banks (expert), then a safety sweep: when nothing drops reliably, hit a legal ball and leave the
 *    next player as little as possible (the sweep also finds kicks when every ball is hidden).
 * 3. Ball in hand: a grid of spots on the table, scored by the best shot from each, then the best few
 *    are played out in full.
 *
 * Strength (the room's «مستوى البوتات»): «سهل» aims with a wide error, picks the easiest pot by eye and
 * plays no position; «ذكي» has a small error, some follow / draw and position; «خبير» a tiny error, the
 * full evaluation (position, banks, combinations, safeties). Every decision stops by its time budget.
 */
import type { BotLevel } from '../../src/shared/protocol';
import { groupBalls, type BilliardsGroup, type BilliardsMode } from '../../src/shared/games/billiards';
import {
  BREAK_SPOT,
  DRAG,
  E_BALL,
  FOOT_X,
  FOOT_Y,
  G,
  HEAD_Y,
  L,
  MAX_SPEED,
  MU_SLIDE,
  POCKET_DRAW,
  POCKETS,
  R,
  ROLL,
  W,
  legalCueSpot,
  nearestCueSpot,
  powerOf,
  simulate,
  straightDrop,
  type BallPos,
  type SimResult,
} from '../../src/shared/games/billiards-physics';
import { judge, legalTargets, onEight, type Situation, type Verdict } from '../billiards-rules';

export interface BotInput {
  mode: BilliardsMode;
  /** balls on the table (the cue ball, id 0, missing or ignored while in hand) */
  balls: BallPos[];
  inHand: 'kitchen' | 'anywhere' | null;
  breakShot: boolean;
  group: BilliardsGroup | null;
  /** the next player's group (8-ball) */
  oppGroup: BilliardsGroup | null;
  callPocket: boolean;
  level: BotLevel;
  rnd?: () => number;
  /** ms (defaults by level) */
  budget?: number;
}

export interface BotShot {
  angle: number;
  power: number;
  spin: number;
  cue?: { x: number; y: number };
  pocket?: number;
}

const LEVEL = {
  easy: { sigma: 1.7, powerSigma: 0.12, budget: 40 },
  smart: { sigma: 0.4, powerSigma: 0.05, budget: 130 },
  expert: { sigma: 0.07, powerSigma: 0.015, budget: 190 },
} as const;

const DEG = Math.PI / 180;
const hyp = Math.hypot;

/* ------------------------------------------------------------------ */
/* Speeds (the same friction model as the physics, in closed form)      */
/* ------------------------------------------------------------------ */

const SLIDE_A = MU_SLIDE * G;
/** distance a rolling ball covers while slowing from v to 0 */
const rollDist = (v: number) => v / DRAG - (ROLL / (DRAG * DRAG)) * Math.log(1 + (DRAG * v) / ROLL);
/** distance a ball launched at v without spin covers before stopping */
function travel(v: number) {
  return ((24 / 49) * v * v) / (2 * SLIDE_A) + rollDist((5 / 7) * v);
}
/** speed left after covering d from a launch at v (0 if it stops before) */
function speedAfter(v: number, d: number) {
  const s1 = ((24 / 49) * v * v) / (2 * SLIDE_A);
  if (d <= s1) return Math.sqrt(Math.max(0, v * v - 2 * SLIDE_A * d));
  const vr = (5 / 7) * v;
  const left = rollDist(vr) - (d - s1);
  if (left <= 0) return 0;
  let lo = 0;
  let hi = vr;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) / 2;
    if (rollDist(m) < left) lo = m;
    else hi = m;
  }
  return lo;
}
/** the launch speed that carries a ball d further */
function launchFor(d: number) {
  let lo = 0;
  let hi = MAX_SPEED;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) / 2;
    if (travel(m) < d) lo = m;
    else hi = m;
  }
  return hi;
}
/** the cue speed that arrives at distance d with speed v1 */
function cueFor(d: number, v1: number) {
  let lo = v1;
  let hi = MAX_SPEED;
  if (speedAfter(hi, d) < v1) return MAX_SPEED;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) / 2;
    if (speedAfter(m, d) < v1) lo = m;
    else hi = m;
  }
  return hi;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                             */
/* ------------------------------------------------------------------ */

/** No ball (except `skip`) within `clear` of the segment a → b. */
function pathClear(ax: number, ay: number, bx: number, by: number, balls: BallPos[], skip: number[], clear = 2 * R - 0.5): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (const b of balls) {
    if (skip.includes(b.id)) continue;
    const t = len2 ? Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / len2)) : 0;
    const px = ax + dx * t - b.x;
    const py = ay + dy * t - b.y;
    if (px * px + py * py < clear * clear) return false;
  }
  return true;
}

interface Window {
  /** direction from the ball (rad) and the pocket's angular width (rad) */
  dir: number;
  width: number;
  /** distance to the pocket */
  dist: number;
}

/** How a pocket looks from (x, y): the middle of the widest run of directions that drop cleanly. */
function pocketWindow(x: number, y: number, pocket: number, cache: Map<string, Window | null>): Window | null {
  const key = `${Math.round(x)},${Math.round(y)},${pocket}`;
  if (cache.has(key)) return cache.get(key)!;
  const p = POCKET_DRAW[pocket];
  const dist = hyp(p.x - x, p.y - y);
  const base = Math.atan2(p.y - y, p.x - x);
  // a narrower fan from far away (the pocket looks smaller)
  const span = Math.min(30, Math.max(6, (2600 / Math.max(dist, 60)) * 1.2)) * DEG;
  const n = 61;
  const ok: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = base - span + (2 * span * i) / (n - 1);
    ok.push(straightDrop(x, y, Math.cos(a), Math.sin(a)) === pocket);
  }
  let bestLen = 0;
  let bestMid = -1;
  for (let i = 0; i < n; ) {
    if (!ok[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && ok[j]) j++;
    if (j - i > bestLen) {
      bestLen = j - i;
      bestMid = (i + j - 1) / 2;
    }
    i = j;
  }
  const w = bestLen ? { dir: base - span + (2 * span * bestMid) / (n - 1), width: ((2 * span) / (n - 1)) * Math.max(0.5, bestLen - 1), dist } : null;
  cache.set(key, w);
  return w;
}

/** erf, for the chance a shot stays inside its window */
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

interface Pot {
  target: number;
  pocket: number;
  /** cue direction */
  angle: number;
  cut: number;
  dCG: number;
  dOP: number;
  /** chance to make it with the evaluation error */
  q: number;
  /** the cue speed that just gets the ball there */
  vMin: number;
  combo?: boolean;
  bank?: boolean;
}

/** Every direct pot (and 9-ball combination) from the cue ball at (cx, cy). */
function findPots(cx: number, cy: number, balls: BallPos[], targets: number[], mode: BilliardsMode, sigma: number, cache: Map<string, Window | null>, combos: boolean): Pot[] {
  const pots: Pot[] = [];
  const others = balls.filter((b) => b.id !== 0);
  const tryPot = (obj: BallPos, pocket: number, w: Window, first: BallPos, extra: number[]) => {
    const gx = obj.x - 2 * R * Math.cos(w.dir);
    const gy = obj.y - 2 * R * Math.sin(w.dir);
    if (gx < R - 1 || gx > W - R + 1 || gy < R - 1 || gy > L - R + 1) return null;
    return { gx, gy };
  };
  for (const t of targets) {
    const obj = others.find((b) => b.id === t);
    if (!obj) continue;
    for (let p = 0; p < POCKETS.length; p++) {
      const w = pocketWindow(obj.x, obj.y, p, cache);
      if (!w) continue;
      const g = tryPot(obj, p, w, obj, []);
      if (!g) continue;
      const dCG = hyp(g.gx - cx, g.gy - cy);
      if (dCG < 1) continue;
      const aim = Math.atan2(g.gy - cy, g.gx - cx);
      let cut = Math.abs(aim - w.dir);
      if (cut > Math.PI) cut = 2 * Math.PI - cut;
      if (cut > 82 * DEG) continue;
      if (!pathClear(cx, cy, g.gx, g.gy, others, [t])) continue;
      const ex = obj.x + Math.cos(w.dir) * w.dist;
      const ey = obj.y + Math.sin(w.dir) * w.dist;
      if (!pathClear(obj.x, obj.y, ex, ey, others, [t, 0])) continue;
      const allow = ((w.width / 2) * 2 * R * Math.cos(cut)) / Math.max(dCG, 2 * R);
      const q = erf(allow / (sigma * DEG * Math.SQRT2));
      const vObj = launchFor(w.dist + 70);
      const v1 = vObj / (Math.max(0.12, Math.cos(cut)) * ((1 + E_BALL) / 2));
      pots.push({ target: t, pocket: p, angle: aim, cut, dCG, dOP: w.dist, q, vMin: cueFor(dCG, v1) });
    }
  }
  // 9-ball: the lowest ball into the 9, the 9 into a pocket
  if (combos && mode === 'nine' && targets.length === 1 && targets[0] !== 9) {
    const low = others.find((b) => b.id === targets[0]);
    const nine = others.find((b) => b.id === 9);
    if (low && nine) {
      for (let p = 0; p < POCKETS.length; p++) {
        const w = pocketWindow(nine.x, nine.y, p, cache);
        if (!w) continue;
        const g9x = nine.x - 2 * R * Math.cos(w.dir);
        const g9y = nine.y - 2 * R * Math.sin(w.dir);
        const d1 = Math.atan2(g9y - low.y, g9x - low.x);
        const dLow = hyp(g9x - low.x, g9y - low.y);
        let cut1 = Math.abs(d1 - w.dir);
        if (cut1 > Math.PI) cut1 = 2 * Math.PI - cut1;
        if (cut1 > 45 * DEG || dLow > 700) continue;
        const gx = low.x - 2 * R * Math.cos(d1);
        const gy = low.y - 2 * R * Math.sin(d1);
        const dCG = hyp(gx - cx, gy - cy);
        const aim = Math.atan2(gy - cy, gx - cx);
        let cut = Math.abs(aim - d1);
        if (cut > Math.PI) cut = 2 * Math.PI - cut;
        if (cut > 70 * DEG) continue;
        if (!pathClear(cx, cy, gx, gy, others, [low.id])) continue;
        if (!pathClear(low.x, low.y, g9x, g9y, others, [low.id, 9, 0])) continue;
        if (!pathClear(nine.x, nine.y, nine.x + Math.cos(w.dir) * w.dist, nine.y + Math.sin(w.dir) * w.dist, others, [9, low.id, 0])) continue;
        const allow = ((w.width / 2) * 2 * R * Math.cos(cut) * 2 * R * Math.cos(cut1)) / (Math.max(dCG, 2 * R) * Math.max(dLow, 2 * R));
        const q = erf(allow / (sigma * DEG * Math.SQRT2)) * 0.85;
        const vObj = launchFor(w.dist + 70) / (Math.max(0.2, Math.cos(cut1)) * 0.975);
        const v1 = launchFor(dLow) + vObj;
        pots.push({ target: low.id, pocket: p, angle: aim, cut, dCG, dOP: w.dist, q, vMin: cueFor(dCG, v1 / (Math.max(0.15, Math.cos(cut)) * 0.975)), combo: true });
      }
    }
  }
  return pots;
}

/** The best pot available from (cx, cy), 0 … 1, and how many good ones there are. */
function shotQuality(cx: number, cy: number, balls: BallPos[], targets: number[], mode: BilliardsMode, cache: Map<string, Window | null>): { best: number; good: number } {
  if (!targets.length) return { best: 0, good: 0 };
  const pots = findPots(cx, cy, balls, targets, mode, 0.45, cache, false);
  let best = 0;
  let good = 0;
  for (const p of pots) {
    // a long or very fast shot is harder to control than the window says
    const q = p.q * (p.vMin > 5000 ? 0.6 : 1);
    if (q > best) best = q;
    if (q > 0.55) good++;
  }
  return { best, good };
}

/* ------------------------------------------------------------------ */
/* The decision                                                         */
/* ------------------------------------------------------------------ */

interface Ctx {
  inp: BotInput;
  sit: Situation;
  sigma: number;
  cache: Map<string, Window | null>;
  deadline: number;
  rnd: () => number;
  /** sims run (for tests and tuning) */
  sims: number;
}

interface Scored {
  shot: BotShot;
  score: number;
}

const now = () => performance.now();

/** Targets for whoever plays next after this shot (the shooter if `cont`, else the next player). */
function nextTargets(c: Ctx, res: SimResult, v: Verdict, mine: boolean): number[] {
  const onTable = res.balls.map((b) => b.id);
  if (c.inp.mode === 'nine') return legalTargets({ mode: 'nine', onTable, group: null });
  const g = mine ? (v.assign ?? c.sit.group) : v.assign ? (v.assign === 'solids' ? 'stripes' : 'solids') : c.inp.oppGroup;
  return legalTargets({ mode: 'eight', onTable, group: g });
}

/** Score a played-out shot for the shooter. */
function scoreResult(c: Ctx, res: SimResult, called: number | null, q: number): number {
  const v = judge({ ...c.sit, called }, res);
  if (v.rack === 'win') return 100000 * Math.max(0.05, q);
  if (v.rack === 'lose') return -100000;
  const cue = res.balls.find((b) => b.id === 0);
  if (v.foul) return -800 - v.potted.length * 20;
  const lvl = c.inp.level;
  if (v.cont && cue) {
    let pos = 0;
    if (lvl !== 'easy') {
      const t = nextTargets(c, res, v, true);
      const sq = shotQuality(cue.x, cue.y, res.balls, t, c.inp.mode, c.cache);
      pos = 420 * sq.best + 60 * Math.min(3, sq.good);
      // 8-ball: a group with balls that no pocket can be reached from is a problem
      if (c.inp.mode === 'eight') {
        const g = v.assign ?? c.sit.group;
        if (g) pos -= 40 * groupBalls(g).filter((b) => res.balls.some((x) => x.id === b) && stuck(res.balls, b, c.cache)).length;
      }
      if (lvl === 'smart') pos *= 0.5;
    }
    return 1000 * q + pos * q - (1 - q) * 500;
  }
  // the table passes to the next player: how much do they get?
  if (!cue) return -800;
  const t = nextTargets(c, res, v, false);
  const sq = shotQuality(cue.x, cue.y, res.balls, t, c.inp.mode, c.cache);
  return -150 - 450 * sq.best - 40 * Math.min(3, sq.good) + v.potted.length * 5;
}

/** No pocket is reachable from this ball (blocked on every side). */
function stuck(balls: BallPos[], id: number, cache: Map<string, Window | null>) {
  const b = balls.find((x) => x.id === id);
  if (!b) return false;
  for (let p = 0; p < POCKETS.length; p++) {
    const w = pocketWindow(b.x, b.y, p, cache);
    if (w && pathClear(b.x, b.y, b.x + Math.cos(w.dir) * w.dist, b.y + Math.sin(w.dir) * w.dist, balls, [id, 0])) return false;
  }
  return true;
}

function sim(c: Ctx, balls: BallPos[], s: BotShot) {
  c.sims++;
  return simulate(balls, { angle: s.angle, power: s.power, spin: s.spin });
}

/** The balls with the cue ball at (x, y). */
const withCue = (balls: BallPos[], x: number, y: number) => [{ id: 0, x, y }, ...balls.filter((b) => b.id !== 0)];

/** The best shot from a given cue ball position (pots, banks, safeties within the time budget). */
function bestFrom(c: Ctx, balls: BallPos[], cx: number, cy: number, deep: boolean): Scored | null {
  const { inp, sit } = c;
  const lvl = inp.level;
  const targets = legalTargets(sit);
  const eightCall = sit.callPocket && onEight(sit);
  const pots = findPots(cx, cy, balls, targets, inp.mode, Math.max(c.sigma, lvl === 'expert' ? 0.22 : c.sigma), c.cache, lvl !== 'easy');
  pots.sort((a, b) => b.q - a.q);
  let best: Scored | null = null;
  const consider = (shot: BotShot, score: number) => {
    if (!best || score > best.score) best = { shot, score };
  };

  if (lvl === 'easy') {
    // by eye: the easiest pot, a firm stroke, no sim
    const p = pots[0];
    if (p) {
      consider({ angle: p.angle, power: Math.min(0.9, powerOf(p.vMin * 1.6)), spin: 0, pocket: eightCall ? p.pocket : undefined }, p.q * 1000);
      return best;
    }
  } else {
    const spins = lvl === 'expert' ? [0, 0.55, -0.55, 1] : [0, 0.5, -0.5];
    const mults = lvl === 'expert' ? [1.25, 1.7, 2.5] : [1.35, 2];
    const top = pots.slice(0, deep ? (lvl === 'expert' ? 8 : 5) : 3);
    for (const p of top) {
      for (const m of mults) {
        for (const spin of spins) {
          if (now() > c.deadline && best) break;
          const power = Math.min(0.95, powerOf(p.vMin * m));
          const shot: BotShot = { angle: p.angle, power, spin, pocket: eightCall ? p.pocket : undefined };
          const res = sim(c, balls, shot);
          const potted = res.pocketed.some((x) => x.id === p.target || (p.combo && x.id === 9));
          // the window's chance only counts if the ball really drops in the sim
          const sc = scoreResult(c, res, eightCall ? p.pocket : null, potted ? p.q : 0.05);
          consider(shot, sc);
        }
      }
    }
    // expert: check that the best pot is not a knife edge (a hair off either way)
    if (best && lvl === 'expert' && (best as Scored).score > 0 && now() < c.deadline) {
      const b = best as Scored;
      let made = 0;
      for (const d of [-0.18, 0.18]) {
        const res = sim(c, balls, { ...b.shot, angle: b.shot.angle + d * DEG });
        const v = judge({ ...sit, called: b.shot.pocket ?? null }, res);
        if ((v.cont || v.rack === 'win') && !v.foul) made++;
      }
      if (made < 2) b.score -= (2 - made) * 350;
    }
  }

  const good = best && (best as Scored).score > 600;
  // banks (expert): mirror the pocket in a cushion and fine-tune with the physics
  if (!good && lvl === 'expert' && deep && now() < c.deadline) {
    for (const t of targets) {
      const obj = balls.find((b) => b.id === t);
      if (!obj) continue;
      for (let p = 0; p < POCKETS.length && now() < c.deadline; p++) {
        const pk = POCKET_DRAW[p];
        for (const rail of [0, 1, 2, 3]) {
          // mirror across the line the ball's centre bounces on
          const mx = rail === 0 ? 2 * R - pk.x : rail === 1 ? 2 * (W - R) - pk.x : pk.x;
          const my = rail === 2 ? 2 * R - pk.y : rail === 3 ? 2 * (L - R) - pk.y : pk.y;
          if ((rail === 0 && pk.x < 1) || (rail === 1 && pk.x > W - 1) || (rail === 2 && pk.y < 1) || (rail === 3 && pk.y > L - 1)) continue;
          const dir = Math.atan2(my - obj.y, mx - obj.x);
          const gx = obj.x - 2 * R * Math.cos(dir);
          const gy = obj.y - 2 * R * Math.sin(dir);
          if (gx < R || gx > W - R || gy < R || gy > L - R) continue;
          const aim = Math.atan2(gy - cy, gx - cx);
          let cut = Math.abs(aim - dir);
          if (cut > Math.PI) cut = 2 * Math.PI - cut;
          if (cut > 55 * DEG || !pathClear(cx, cy, gx, gy, balls.filter((b) => b.id !== 0), [t])) continue;
          const d = hyp(mx - obj.x, my - obj.y);
          const vMin = cueFor(hyp(gx - cx, gy - cy), launchFor(d * 1.4 + 100) / (Math.cos(cut) * 0.975));
          for (const off of [0, -0.6, 0.6, -1.2, 1.2]) {
            if (now() > c.deadline) break;
            const shot: BotShot = { angle: aim + off * DEG, power: Math.min(0.95, powerOf(vMin * 1.3)), spin: 0, pocket: eightCall ? p : undefined };
            const res = sim(c, balls, shot);
            const potted = res.pocketed.some((x) => x.id === t && x.pocket === p);
            consider(shot, scoreResult(c, res, eightCall ? p : null, potted ? 0.4 : 0.05));
          }
        }
      }
    }
  }

  // safety / kick sweep
  const fine = best && (best as Scored).score > 300;
  if (!fine && now() < c.deadline) {
    const angles: number[] = [];
    for (const t of targets) {
      const obj = balls.find((b) => b.id === t);
      if (!obj) continue;
      const a0 = Math.atan2(obj.y - cy, obj.x - cx);
      const d = hyp(obj.x - cx, obj.y - cy);
      for (const f of [0, -0.5, 0.5, -0.85, 0.85]) angles.push(a0 + Math.asin(Math.max(-1, Math.min(1, (f * 2 * R) / Math.max(d, 2 * R)))));
    }
    const n = lvl === 'expert' ? 72 : lvl === 'smart' ? 36 : 16;
    const start = c.rnd() * ((2 * Math.PI) / n);
    for (let i = 0; i < n; i++) angles.push(start + (i * 2 * Math.PI) / n);
    const powers = lvl === 'easy' ? [0.4] : lvl === 'smart' ? [0.3, 0.5] : [0.25, 0.38, 0.55];
    // the 8 may drop by accident in a safety: call its best pocket
    let call: number | undefined;
    if (eightCall) {
      const eight = balls.find((b) => b.id === 8);
      let bw = 0;
      for (let p = 0; p < POCKETS.length && eight; p++) {
        const w = pocketWindow(eight.x, eight.y, p, c.cache);
        if (w && w.width > bw) {
          bw = w.width;
          call = p;
        }
      }
      call ??= 0;
    }
    for (const a of angles) {
      for (const power of powers) {
        if (now() > c.deadline && best) break;
        const shot: BotShot = { angle: a, power, spin: 0, pocket: call };
        const res = sim(c, balls, shot);
        consider(shot, scoreResult(c, res, call ?? null, 0.5));
      }
    }
  }
  return best;
}

/** The break: a hard stroke at the head ball from behind the head string (a few spots tried). */
function breakShot(c: Ctx): BotShot {
  const { inp } = c;
  const head = inp.mode === 'nine' ? inp.balls.find((b) => b.id === 1) : inp.balls.reduce((a, b) => (b.id !== 0 && b.y > a.y ? b : a), inp.balls.find((b) => b.id !== 0)!);
  const hx = head?.x ?? FOOT_X;
  const hy = head?.y ?? FOOT_Y;
  const power = inp.level === 'easy' ? 0.82 : inp.level === 'smart' ? 0.92 : 1;
  let best: Scored | null = null;
  const tries = inp.level === 'easy' ? 1 : inp.level === 'smart' ? 4 : 8;
  for (let i = 0; i < tries; i++) {
    if (best && now() > c.deadline) break;
    const off = i === 0 ? 0 : (c.rnd() - 0.5) * (inp.mode === 'nine' ? 600 : 400);
    const x = Math.max(R + 5, Math.min(W - R - 5, BREAK_SPOT.x + off));
    const y = HEAD_Y + 40 + c.rnd() * 120;
    const angle = Math.atan2(hy - y, hx - x) + (c.rnd() - 0.5) * 0.4 * DEG;
    const shot: BotShot = { angle, power, spin: -0.2, cue: { x, y } };
    if (inp.level === 'easy') return shot;
    const res = sim(c, withCue(inp.balls, x, y), shot);
    const v = judge(c.sit, res);
    const score = (v.rack === 'win' ? 5000 : 0) + (v.foul ? -500 : 0) + (v.cont ? 300 : 0) + res.pocketed.length * 20;
    if (!best || score > best.score) best = { shot, score };
  }
  return best!.shot;
}

function gauss(rnd: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
}

/** The bot's shot (with its human error already in it). */
export function botShot(inp: BotInput): BotShot & { sims: number } {
  const lv = LEVEL[inp.level];
  const rnd = inp.rnd ?? Math.random;
  const sit: Situation = {
    mode: inp.mode,
    onTable: inp.balls.filter((b) => b.id !== 0 || !inp.inHand).map((b) => b.id),
    group: inp.group,
    breakShot: inp.breakShot,
    called: null,
    callPocket: inp.callPocket,
  };
  const c: Ctx = { inp, sit, sigma: lv.sigma, cache: new Map(), deadline: now() + (inp.budget ?? lv.budget), rnd, sims: 0 };
  const objects = inp.balls.filter((b) => b.id !== 0);
  let shot: BotShot;

  if (inp.breakShot) {
    shot = breakShot(c);
  } else if (inp.inHand) {
    const kitchen = inp.inHand === 'kitchen';
    const targets = legalTargets(sit);
    // a grid of spots, each scored by its best pot
    const spots: { x: number; y: number; q: number }[] = [];
    const step = inp.level === 'easy' ? 160 : 70;
    for (let y = kitchen ? HEAD_Y + 10 : R + 10; y <= L - R - 5; y += step) {
      for (let x = R + 10; x <= W - R - 5; x += step) {
        if (!legalCueSpot(objects, x, y, kitchen)) continue;
        const sq = shotQuality(x, y, objects, targets, inp.mode, c.cache);
        spots.push({ x, y, q: sq.best + 0.05 * sq.good });
      }
    }
    spots.sort((a, b) => b.q - a.q);
    const picks: typeof spots = [];
    for (const s of spots) {
      if (picks.length >= (inp.level === 'easy' ? 1 : inp.level === 'smart' ? 3 : 5)) break;
      if (picks.every((p) => hyp(p.x - s.x, p.y - s.y) > 140)) picks.push(s);
    }
    if (!picks.length) {
      const p = nearestCueSpot(objects, W / 2, kitchen ? HEAD_Y + 100 : L / 2, kitchen);
      picks.push({ ...p, q: 0 });
    }
    let best: (Scored & { cue: { x: number; y: number } }) | null = null;
    for (const p of picks) {
      if (best && now() > c.deadline) break;
      const balls = withCue(objects, p.x, p.y);
      const b = bestFrom(c, balls, p.x, p.y, picks.length <= 2 || p === picks[0]);
      if (b && (!best || b.score > best.score)) best = { ...b, cue: { x: p.x, y: p.y } };
    }
    shot = best ? { ...best.shot, cue: best.cue } : { angle: -Math.PI / 2, power: 0.4, spin: 0, cue: { x: picks[0].x, y: picks[0].y } };
  } else {
    const cue = inp.balls.find((b) => b.id === 0)!;
    const b = bestFrom(c, inp.balls, cue.x, cue.y, true);
    shot = b ? b.shot : { angle: Math.atan2(FOOT_Y - cue.y, FOOT_X - cue.x), power: 0.4, spin: 0 };
  }

  // the human hand: a small error in the aim and the stroke
  const angle = shot.angle + gauss(rnd) * lv.sigma * DEG * (inp.breakShot ? 0.5 : 1);
  const power = Math.max(0.05, Math.min(1, shot.power * (1 + gauss(rnd) * lv.powerSigma)));
  let pocket = shot.pocket;
  if (pocket === undefined && inp.callPocket && onEight(sit)) pocket = 0;
  return { ...shot, angle, power, pocket, sims: c.sims };
}
