/**
 * «البلياردو» — the table and its physics, shared by the server (which plays every shot) and the app
 * (which draws the table, places the cue ball and draws the aim guide with the same geometry).
 *
 * The table is drawn VERTICALLY: x runs across (0 … W), y runs along the table (0 … L), the foot rail
 * (where the balls are racked) at the top (y = 0) and the head rail (where the break is played from) at
 * the bottom (y = L). Units: millimetres and seconds. Two tables (`Table`): pool (8-ball and 9-ball) on
 * a 7-foot table, 1980 × 990 mm of cloth, balls of 57.15 mm; snooker on a 12-foot table, 3569 × 1778
 * mm, balls of 52.5 mm, narrow pockets with rounded jaws. Every function takes the table (pool when
 * left out).
 *
 * The simulation is deterministic (same balls + same shot → the same result, bit for bit): a fixed time
 * step of 1/240 s, and inside each step every collision is found exactly (time of impact) and resolved
 * in order, so fast balls never pass through each other or through a cushion.
 *
 * - Balls slide, then roll: the cue gives a speed and a spin (follow / draw: the tip above or below the
 *   centre). While the contact point slips on the cloth, sliding friction brings the ball to a natural
 *   roll (that is what makes follow and draw work after a collision); then rolling resistance (plus a
 *   little drag) slows it down until it stops.
 * - Ball–ball: equal masses, a slightly inelastic exchange along the line of centres (no throw).
 * - Cushions: the six rails between the pockets, with noses at the pocket jaws (sharp for pool,
 *   rounded for snooker: a ball that comes in too steep rattles off them); a ball whose centre passes
 *   the cushion line in a mouth drops — always over the hole drawn there.
 */

/* ------------------------------------------------------------------ */
/* The tables                                                           */
/* ------------------------------------------------------------------ */

/** A straight cushion: the line x = c (vertical) or y = c (horizontal), from a to b along the other axis; n = which side the cloth is (+1: larger values). */
interface Seg {
  v: boolean;
  c: number;
  a: number;
  b: number;
  n: 1 | -1;
}

/**
 * A table's geometry (one per game family): the cloth, the balls, the pockets (the noses of the jaws,
 * the visible holes) and the frame drawn around it. Pockets are always in this order: 0 top-left,
 * 1 top-right, 2 middle-left, 3 middle-right, 4 bottom-left, 5 bottom-right.
 */
export interface Table {
  id: 'pool' | 'snooker';
  /** the cloth, between the cushion noses (mm) */
  W: number;
  L: number;
  /** the balls' radius */
  R: number;
  /** distance from a corner, along each rail, to where the corner pocket's jaw begins */
  cornerNose: number;
  /** half the middle pocket's mouth, along the long rail */
  sideHalf: number;
  /** the radius of the jaws' rounded ends (0: a sharp nose) */
  noseR: number;
  pockets: { x: number; y: number; corner: boolean }[];
  /** the visible holes (a ball always drops with its centre over its hole) */
  holes: { x: number; y: number; r: number }[];
  /** the centres of the jaws' rounded ends (a ball touches one at R + noseR) */
  noses: { x: number; y: number }[];
  segs: Seg[];
  /** how far past the cushion line a ball's centre goes before it drops */
  drop: number;
  /** the frame drawn around the cloth (wood + cushion) and the cushion alone (mm) */
  rail: number;
  cush: number;
  /** where the cue ball may be placed for the break: pool behind the head string (y ≥ y0), snooker inside the D */
  zone: { kind: 'line'; y: number } | { kind: 'd'; cx: number; cy: number; r: number };
  /** where the cue ball waits for the break */
  breakSpot: { x: number; y: number };
}

function makeTable(o: Omit<Table, 'pockets' | 'noses' | 'segs' | 'drop'> & { drop?: number }): Table {
  const { W: w, L: l, cornerNose: cn, sideHalf: sh, noseR: rn } = o;
  return {
    ...o,
    drop: o.drop ?? o.R * 0.3,
    pockets: [
      { x: 0, y: 0, corner: true },
      { x: w, y: 0, corner: true },
      { x: 0, y: l / 2, corner: false },
      { x: w, y: l / 2, corner: false },
      { x: 0, y: l, corner: true },
      { x: w, y: l, corner: true },
    ],
    // each rounded end touches its cushion's line where the cushion stops, and curves away into the pocket
    noses: [
      { x: cn, y: -rn },
      { x: w - cn, y: -rn },
      { x: cn, y: l + rn },
      { x: w - cn, y: l + rn },
      { x: -rn, y: cn },
      { x: -rn, y: l / 2 - sh },
      { x: -rn, y: l / 2 + sh },
      { x: -rn, y: l - cn },
      { x: w + rn, y: cn },
      { x: w + rn, y: l / 2 - sh },
      { x: w + rn, y: l / 2 + sh },
      { x: w + rn, y: l - cn },
    ],
    segs: [
      { v: false, c: 0, a: cn, b: w - cn, n: 1 },
      { v: false, c: l, a: cn, b: w - cn, n: -1 },
      { v: true, c: 0, a: cn, b: l / 2 - sh, n: 1 },
      { v: true, c: 0, a: l / 2 + sh, b: l - cn, n: 1 },
      { v: true, c: w, a: cn, b: l / 2 - sh, n: -1 },
      { v: true, c: w, a: l / 2 + sh, b: l - cn, n: -1 },
    ],
  };
}

/** The six holes: corners on the diagonal `corner` mm outside the cloth's corner, middles `side` mm outside the rail line. */
const holesAt = (w: number, l: number, corner: number, cr: number, side: number, sr: number) => [
  { x: -corner, y: -corner, r: cr },
  { x: w + corner, y: -corner, r: cr },
  { x: -side, y: l / 2, r: sr },
  { x: w + side, y: l / 2, r: sr },
  { x: -corner, y: l + corner, r: cr },
  { x: w + corner, y: l + corner, r: cr },
];

/**
 * Pool: a 7-foot table, 1980 × 990 mm of cloth, balls of 57.15 mm. Corner mouths 120 mm across the
 * jaws (2.1 balls), middles 134 mm (2.35 balls); the holes 116 and 110 mm across (2.03 and 1.92 balls),
 * the corner holes centred on the cloth's corners — every drop point is over a hole.
 */
export const POOL: Table = makeTable({
  id: 'pool',
  W: 990,
  L: 1980,
  R: 28.575,
  cornerNose: 85,
  sideHalf: 67,
  noseR: 0,
  holes: holesAt(990, 1980, 0, 58, 14, 55),
  rail: 80,
  cush: 24,
  zone: { kind: 'line', y: 1980 * 0.75 },
  breakSpot: { x: 495, y: 1980 * 0.75 + 120 },
});

/** Snooker: the baulk line (737 mm from the bottom cushion) and the D (radius 292 mm). */
const SNK_W = 1778;
const SNK_L = 3569;
export const BAULK_Y = SNK_L - 737;
export const D_R = 292;

/**
 * Snooker: a 12-foot table, 3569 × 1778 mm of cloth, balls of 52.5 mm. Narrow pockets with rounded
 * jaws: corner mouths ≈ 1.7 balls, middles ≈ 1.85 balls; the holes sit further back behind the jaws.
 */
export const SNOOKER: Table = makeTable({
  id: 'snooker',
  W: SNK_W,
  L: SNK_L,
  R: 26.25,
  cornerNose: 70.6,
  sideHalf: 66.5,
  noseR: 18,
  holes: holesAt(SNK_W, SNK_L, 15, 45, 22, 46),
  rail: 84,
  cush: 26,
  zone: { kind: 'd', cx: SNK_W / 2, cy: BAULK_Y, r: D_R },
  breakSpot: { x: SNK_W / 2 + 120, y: BAULK_Y + 50 },
});

/** The table of a mode. */
export const tableOf = (mode: string): Table => (mode === 'snooker' ? SNOOKER : POOL);

/* The pool table's numbers, as before (8-ball and 9-ball use them directly). */
export const W = POOL.W;
export const L = POOL.L;
export const R = POOL.R;
/** The head string (the break is played from below it: y ≥ HEAD_Y). */
export const HEAD_Y = L * 0.75;
/** The foot spot (the apex of the rack). */
export const FOOT_X = W / 2;
export const FOOT_Y = L * 0.25;
export const CORNER_NOSE = POOL.cornerNose;
export const SIDE_HALF = POOL.sideHalf;
export const POCKETS = POOL.pockets;
/** Where a pocket is drawn (its hole) and how big. */
export const POCKET_DRAW = POOL.holes;
export const NOSES = POOL.noses;

export const G = 9810;
export const MU_SLIDE = 0.2;
/** rolling resistance (mm/s²) and a drag proportional to speed (1/s) */
export const ROLL = 100;
export const DRAG = 0.13;
export const E_BALL = 0.95;
const E_CUSHION = 0.8;
/** a cushion keeps this much of the ball's speed along it */
const CUSHION_GRIP = 0.95;
/** after a cushion, the spin into the rail is mostly gone */
const CUSHION_SPIN = 0.25;
const DT = 1 / 240;
/** the longest a shot is played (after that the balls stop where they are) */
export const MAX_SHOT_S = 12;
/** the fastest cue ball (a hard break), mm/s */
export const MAX_SPEED = 8000;
const MIN_SPEED = 150;

/** The cue ball's speed for a power between 0 and 1 (fine control for soft shots). */
export const speedOf = (power: number) => MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.max(0, Math.min(1, power)) ** 2;
/** The power that gives this speed. */
export const powerOf = (speed: number) => Math.sqrt(Math.max(0, Math.min(1, (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED))));

export interface BallPos {
  id: number;
  x: number;
  y: number;
}

interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** the surface speed of the ball's rotation (equals the velocity when it rolls) */
  sx: number;
  sy: number;
  on: boolean;
  moving: boolean;
  /** |vx| + |vy| during the current sub-step */
  sp: number;
}

export interface Shot {
  /** direction of the cue (radians, 0 = +x, π/2 = +y: towards the head rail) */
  angle: number;
  /** 0 … 1 */
  power: number;
  /** −1 (full draw) … +1 (full follow) */
  spin: number;
}

export interface Pocketed {
  id: number;
  pocket: number;
  /** seconds since the stroke */
  t: number;
  /** where its centre was when it dropped (the simulation fills it in) */
  x?: number;
  y?: number;
}

export interface SimResult {
  balls: BallPos[];
  pocketed: Pocketed[];
  /** the first ball the cue ball touched (null: none) */
  firstHit: number | null;
  /** some ball touched a cushion after the cue ball's first contact */
  railAfterContact: boolean;
  /** balls (other than the cue ball) that touched a cushion */
  railBalls: number;
  /** seconds until everything stopped */
  duration: number;
  /** recorded trajectories (only when asked) */
  record?: ShotRecord;
}

/**
 * A recorded shot, compact enough to send to every phone once: per moving ball, keyframes
 * [t ms, x mm, y mm] (first absolute, then differences), where linear interpolation between them never
 * strays more than ~1.5 mm from the real path; the pockets with their moment.
 */
export interface ShotRecord {
  /** ms */
  dur: number;
  /** ball id → [t0, x0, y0, dt1, dx1, dy1, …] */
  tr: Record<string, number[]>;
  /** [ball, pocket, t ms] */
  pk: [number, number, number][];
}

const hyp = Math.hypot;

/** Time until moving point p (velocity v) is at distance d from the fixed point q (approaching only), or −1. */
function toiPoint(px: number, py: number, vx: number, vy: number, qx: number, qy: number, d: number): number {
  const rx = px - qx;
  const ry = py - qy;
  const b = rx * vx + ry * vy;
  if (b >= 0) return -1;
  const a = vx * vx + vy * vy;
  if (a === 0) return -1;
  const c = rx * rx + ry * ry - d * d;
  if (c <= 0) return 0;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  return (-b - Math.sqrt(disc)) / a;
}

/**
 * Plays one stroke of the cue ball (id 0) on `start` (balls on the table) and returns where everything
 * ended. `record` also returns the trajectories for the phones. `trace` (tests) gets the total kinetic
 * energy (per unit mass, translation + rotation) after every step.
 */
export function simulate(start: BallPos[], shot: Shot, record = false, trace?: (t: number, energy: number) => void, table: Table = POOL): SimResult {
  const { W, L, R, drop: DROP } = table;
  const SEGS = table.segs;
  const NOSES = table.noses;
  const POCKETS = table.pockets;
  const noseD = R + table.noseR;
  const bodies: Body[] = start.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, sx: 0, sy: 0, on: true, moving: false, sp: 0 }));
  const cue = bodies.find((b) => b.id === 0);
  const pocketed: Pocketed[] = [];
  let firstHit: number | null = null;
  let railAfterContact = false;
  const railSet = new Set<number>();
  if (!cue) return { balls: start.map((b) => ({ ...b })), pocketed, firstHit, railAfterContact, railBalls: 0, duration: 0 };

  const v0 = speedOf(shot.power);
  const dx = Math.cos(shot.angle);
  const dy = Math.sin(shot.angle);
  cue.vx = v0 * dx;
  cue.vy = v0 * dy;
  // a tip at height h above the centre gives a surface speed of 2.5·v·h/R (natural roll at h = 0.4 R);
  // the tip stays within half a radius of the centre
  const k = 2.5 * 0.5 * Math.max(-1, Math.min(1, shot.spin));
  cue.sx = v0 * k * dx;
  cue.sy = v0 * k * dy;
  cue.moving = true;

  // raw samples per ball (only when recording): [t, x, y, …]
  const raw = new Map<number, number[]>();
  const sample = (b: Body, t: number) => {
    let a = raw.get(b.id);
    if (!a) raw.set(b.id, (a = []));
    const n = a.length;
    if (n && a[n - 3] === t) {
      a[n - 2] = b.x;
      a[n - 1] = b.y;
    } else a.push(t, b.x, b.y);
  };
  const everMoved = new Set<number>();
  if (record) for (const b of bodies) sample(b, 0);
  everMoved.add(0);

  let t = 0;
  let step = 0;
  const maxSteps = Math.round(MAX_SHOT_S / DT);
  let anyMoving = true;

  while (anyMoving && step < maxSteps) {
    let rem = DT;
    let guard = 0;
    while (rem > 1e-12 && guard++ < 400) {
      // the earliest event in the rest of this step
      let best = rem;
      let kind = 0; // 0 none, 1 ball-ball, 2 cushion, 3 nose, 4 drop
      let bi: Body | null = null;
      let bj: Body | null = null;
      let segOrNose = -1;
      // speeds this sub-step (a pair further apart than they can close in the rest of the step is skipped:
      // it could not touch before `best` anyway, so the result is exactly the same, only faster)
      for (const b of bodies) b.sp = b.on ? Math.abs(b.vx) + Math.abs(b.vy) : 0;
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (!a.on || (a.vx === 0 && a.vy === 0)) continue;
        // other balls
        for (let j = 0; j < bodies.length; j++) {
          if (j === i) continue;
          const b = bodies[j];
          if (!b.on) continue;
          if (j < i && (b.vx !== 0 || b.vy !== 0)) continue; // that pair was checked from b
          const reach = 2 * R + (a.sp + b.sp) * best + 1;
          const ddx = a.x - b.x;
          const ddy = a.y - b.y;
          if (ddx > reach || ddx < -reach || ddy > reach || ddy < -reach) continue;
          const te = toiPoint(a.x - b.x, a.y - b.y, a.vx - b.vx, a.vy - b.vy, 0, 0, 2 * R);
          if (te >= 0 && te < best) {
            best = te;
            kind = 1;
            bi = a;
            bj = b;
          }
        }
        // straight cushions
        for (let s = 0; s < SEGS.length; s++) {
          const g = SEGS[s];
          const p = g.v ? a.x : a.y;
          const v = g.v ? a.vx : a.vy;
          // moving towards the cushion line (the cloth is on the n side)
          if (v * g.n >= 0) continue;
          const gap = (p - g.c) * g.n - R;
          if (gap < -R * 0.5) continue; // already past it (in a mouth)
          const te = Math.max(0, gap / -(v * g.n));
          if (te >= best) continue;
          const along = g.v ? a.y + a.vy * te : a.x + a.vx * te;
          if (along < g.a || along > g.b) continue;
          best = te;
          kind = 2;
          bi = a;
          segOrNose = s;
        }
        // the noses of the jaws
        for (let s = 0; s < NOSES.length; s++) {
          const q = NOSES[s];
          if (Math.abs(a.x - q.x) > 400 && Math.abs(a.y - q.y) > 400) continue;
          const te = toiPoint(a.x, a.y, a.vx, a.vy, q.x, q.y, noseD);
          if (te >= 0 && te < best) {
            best = te;
            kind = 3;
            bi = a;
            segOrNose = s;
          }
        }
        // dropping into a pocket (the centre past a cushion line by DROP)
        const tl = a.vx < 0 ? (a.x + DROP) / -a.vx : a.vx > 0 ? (W + DROP - a.x) / a.vx : Infinity;
        const tt = a.vy < 0 ? (a.y + DROP) / -a.vy : a.vy > 0 ? (L + DROP - a.y) / a.vy : Infinity;
        const td = Math.max(0, Math.min(tl, tt));
        if (td < best) {
          best = td;
          kind = 4;
          bi = a;
        }
      }

      // move everything to the event (or the end of the step)
      for (const b of bodies) {
        if (!b.on || (b.vx === 0 && b.vy === 0)) continue;
        b.x += b.vx * best;
        b.y += b.vy * best;
      }
      rem -= best;
      const te = t + (DT - rem);
      if (kind === 0 || !bi) break;

      if (kind === 1 && bj) {
        const a = bi;
        const b = bj;
        let nx = b.x - a.x;
        let ny = b.y - a.y;
        const d = hyp(nx, ny) || 1;
        nx /= d;
        ny /= d;
        const va = a.vx * nx + a.vy * ny;
        const vb = b.vx * nx + b.vy * ny;
        if (va - vb > 0) {
          const pa = ((1 - E_BALL) / 2) * va + ((1 + E_BALL) / 2) * vb;
          const pb = ((1 + E_BALL) / 2) * va + ((1 - E_BALL) / 2) * vb;
          a.vx += (pa - va) * nx;
          a.vy += (pa - va) * ny;
          b.vx += (pb - vb) * nx;
          b.vy += (pb - vb) * ny;
        }
        a.moving = b.moving = true;
        everMoved.add(a.id);
        everMoved.add(b.id);
        if (firstHit === null && (a.id === 0 || b.id === 0)) firstHit = a.id === 0 ? b.id : a.id;
        if (record) {
          sample(a, te);
          sample(b, te);
        }
      } else if (kind === 2 || kind === 3) {
        const a = bi;
        let nx: number;
        let ny: number;
        if (kind === 2) {
          const g = SEGS[segOrNose];
          nx = g.v ? g.n : 0;
          ny = g.v ? 0 : g.n;
        } else {
          const q = NOSES[segOrNose];
          nx = a.x - q.x;
          ny = a.y - q.y;
          const d = hyp(nx, ny) || 1;
          nx /= d;
          ny /= d;
        }
        const vn = a.vx * nx + a.vy * ny;
        if (vn < 0) {
          const tx = a.vx - vn * nx;
          const ty = a.vy - vn * ny;
          const vn2 = -vn * E_CUSHION;
          a.vx = tx * CUSHION_GRIP + vn2 * nx;
          a.vy = ty * CUSHION_GRIP + vn2 * ny;
          const sn = a.sx * nx + a.sy * ny;
          const stx = a.sx - sn * nx;
          const sty = a.sy - sn * ny;
          a.sx = stx * CUSHION_GRIP + vn2 * CUSHION_SPIN * nx;
          a.sy = sty * CUSHION_GRIP + vn2 * CUSHION_SPIN * ny;
        }
        if (a.id !== 0) railSet.add(a.id);
        if (firstHit !== null) railAfterContact = true;
        if (record) sample(a, te);
      } else if (kind === 4) {
        const a = bi;
        let pocket = 0;
        let bd = Infinity;
        POCKETS.forEach((p, i) => {
          const d = hyp(p.x - a.x, p.y - a.y);
          if (d < bd) {
            bd = d;
            pocket = i;
          }
        });
        if (record) sample(a, te);
        a.on = false;
        a.vx = a.vy = a.sx = a.sy = 0;
        a.moving = false;
        pocketed.push({ id: a.id, pocket, t: te, x: a.x, y: a.y });
      }
    }

    t += DT;
    step++;

    // friction
    anyMoving = false;
    for (const b of bodies) {
      if (!b.on || !b.moving) continue;
      const ux = b.vx - b.sx;
      const uy = b.vy - b.sy;
      const u = hyp(ux, uy);
      const dv = MU_SLIDE * G * DT;
      if (u > 1) {
        if (u <= 3.5 * dv) {
          // reaches a natural roll during this step
          b.vx -= (2 / 7) * ux;
          b.vy -= (2 / 7) * uy;
          b.sx = b.vx;
          b.sy = b.vy;
        } else {
          b.vx -= (dv * ux) / u;
          b.vy -= (dv * uy) / u;
          b.sx += (2.5 * dv * ux) / u;
          b.sy += (2.5 * dv * uy) / u;
        }
      } else {
        const sp = hyp(b.vx, b.vy);
        const dec = (ROLL + DRAG * sp) * DT;
        if (sp <= dec || sp < 2) {
          b.vx = b.vy = b.sx = b.sy = 0;
          b.moving = false;
          if (record) sample(b, t);
          continue;
        }
        const f = (sp - dec) / sp;
        b.vx *= f;
        b.vy *= f;
        b.sx = b.vx;
        b.sy = b.vy;
      }
      anyMoving = true;
      if (record && step % 2 === 0) sample(b, t);
    }
    if (trace) {
      let e = 0;
      for (const b of bodies) if (b.on) e += 0.5 * (b.vx * b.vx + b.vy * b.vy) + 0.2 * (b.sx * b.sx + b.sy * b.sy);
      trace(t, e);
    }
  }
  // out of time: whatever still moves stops here
  for (const b of bodies) {
    if (b.on && b.moving) {
      b.vx = b.vy = b.sx = b.sy = 0;
      b.moving = false;
      if (record) sample(b, t);
    }
  }
  const lastPocket = pocketed.length ? pocketed[pocketed.length - 1].t : 0;
  const duration = Math.max(lastPocket, anyMoving ? t : stopTime(raw, t, record));
  const res: SimResult = {
    balls: bodies.filter((b) => b.on).map((b) => ({ id: b.id, x: b.x, y: b.y })),
    pocketed,
    firstHit,
    railAfterContact,
    railBalls: railSet.size,
    duration: record ? duration : t,
  };
  if (record) res.record = encode(raw, everMoved, pocketed, duration);
  return res;
}

/** The moment the last ball stopped (from the samples), else the simulated time. */
function stopTime(raw: Map<number, number[]>, t: number, record: boolean): number {
  if (!record) return t;
  let m = 0;
  for (const a of raw.values()) if (a.length > 3) m = Math.max(m, a[a.length - 3]);
  return m || t;
}

/** Keep only the keyframes needed for a faithful linear interpolation, then encode them. */
function encode(raw: Map<number, number[]>, moved: Set<number>, pocketed: Pocketed[], dur: number): ShotRecord {
  const TOL = 1.5;
  const tr: Record<string, number[]> = {};
  for (const [id, a] of raw) {
    if (!moved.has(id) || a.length < 6) continue;
    const n = a.length / 3;
    const keep = [0];
    let anchor = 0;
    for (let j = anchor + 2; j < n; j++) {
      const t0 = a[anchor * 3];
      const t1 = a[j * 3];
      let ok = true;
      for (let i = anchor + 1; i < j && ok; i++) {
        const f = t1 === t0 ? 0 : (a[i * 3] - t0) / (t1 - t0);
        const x = a[anchor * 3 + 1] + (a[j * 3 + 1] - a[anchor * 3 + 1]) * f;
        const y = a[anchor * 3 + 2] + (a[j * 3 + 2] - a[anchor * 3 + 2]) * f;
        if (hyp(x - a[i * 3 + 1], y - a[i * 3 + 2]) > TOL) ok = false;
      }
      if (!ok) {
        anchor = j - 1;
        keep.push(anchor);
      }
    }
    keep.push(n - 1);
    const out: number[] = [];
    let pt = 0;
    let px = 0;
    let py = 0;
    for (const i of keep) {
      const tt = Math.round(a[i * 3] * 1000);
      const x = Math.round(a[i * 3 + 1]);
      const y = Math.round(a[i * 3 + 2]);
      if (out.length && tt === pt && x === px && y === py) continue;
      out.push(tt - pt, x - px, y - py);
      pt = tt;
      px = x;
      py = y;
    }
    if (out.length >= 6 || pocketed.some((p) => p.id === id)) tr[id] = out;
  }
  return { dur: Math.round(dur * 1000), tr, pk: pocketed.map((p) => [p.id, p.pocket, Math.round(p.t * 1000)]) };
}

/** A track decoded into absolute keyframes: t (ms), x, y. */
export interface Track {
  t: number[];
  x: number[];
  y: number[];
}

export function decodeTrack(enc: number[]): Track {
  const t: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i + 2 < enc.length; i += 3) {
    a += enc[i];
    b += enc[i + 1];
    c += enc[i + 2];
    t.push(a);
    x.push(b);
    y.push(c);
  }
  return { t, x, y };
}

/** Position on a decoded track at time `ms` (clamped to its ends). */
export function trackAt(tr: Track, ms: number): { x: number; y: number } {
  'worklet';
  const n = tr.t.length;
  if (!n) return { x: 0, y: 0 };
  if (ms <= tr.t[0]) return { x: tr.x[0], y: tr.y[0] };
  if (ms >= tr.t[n - 1]) return { x: tr.x[n - 1], y: tr.y[n - 1] };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tr.t[m] <= ms) lo = m;
    else hi = m;
  }
  const span = tr.t[hi] - tr.t[lo];
  const f = span > 0 ? (ms - tr.t[lo]) / span : 1;
  return { x: tr.x[lo] + (tr.x[hi] - tr.x[lo]) * f, y: tr.y[lo] + (tr.y[hi] - tr.y[lo]) * f };
}

/* ------------------------------------------------------------------ */
/* Placing balls                                                       */
/* ------------------------------------------------------------------ */

/** Is (x, y) inside the break zone (pool: behind the head string; snooker: inside the D)? */
export function inZone(x: number, y: number, t: Table = POOL): boolean {
  const z = t.zone;
  if (z.kind === 'line') return y >= z.y;
  return y >= z.cy && hyp(x - z.cx, y - z.cy) <= z.r;
}

/** Is (x, y) a legal spot for the cue ball (on the cloth, touching no ball; in the break zone when `kitchen`)? */
export function legalCueSpot(balls: BallPos[], x: number, y: number, kitchen: boolean, t: Table = POOL): boolean {
  const { W, L, R } = t;
  if (!(x >= R && x <= W - R && y >= R && y <= L - R)) return false;
  if (kitchen && !inZone(x, y, t)) return false;
  return balls.every((b) => b.id === 0 || hyp(b.x - x, b.y - y) >= 2 * R + 0.5);
}

/** The nearest legal spot to (x, y) (searching outwards), for a cue ball dragged onto another ball. */
export function nearestCueSpot(balls: BallPos[], x: number, y: number, kitchen: boolean, t: Table = POOL): { x: number; y: number } {
  const { W, L, R } = t;
  let cx = Math.max(R, Math.min(W - R, x));
  let cy = Math.max(R, Math.min(L - R, y));
  if (kitchen) {
    const z = t.zone;
    if (z.kind === 'line') cy = Math.max(z.y, cy);
    else {
      cy = Math.max(z.cy, cy);
      const d = hyp(cx - z.cx, cy - z.cy);
      if (d > z.r - 0.5) {
        cx = z.cx + ((cx - z.cx) * (z.r - 0.5)) / d;
        cy = z.cy + ((cy - z.cy) * (z.r - 0.5)) / d;
      }
    }
  }
  if (legalCueSpot(balls, cx, cy, kitchen, t)) return { x: cx, y: cy };
  for (let r = 4; r < 1200; r += 4) {
    const n = Math.max(8, Math.round(r / 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (legalCueSpot(balls, px, py, kitchen, t)) return { x: px, y: py };
    }
  }
  return { ...t.breakSpot };
}

/** A re-spotted ball: on the foot spot, or the nearest free spot behind it towards the foot rail (then towards the head). */
export function spotBall(balls: BallPos[], id: number): BallPos {
  const free = (y: number) => balls.every((b) => b.id === id || hyp(b.x - FOOT_X, b.y - y) >= 2 * R + 0.5);
  for (let y = FOOT_Y; y >= R; y -= 1) if (free(y)) return { id, x: FOOT_X, y };
  for (let y = FOOT_Y; y <= L - R; y += 1) if (free(y)) return { id, x: FOOT_X, y };
  return { id, x: FOOT_X, y: FOOT_Y };
}

/** The rack positions: rows from the apex on the foot spot towards the foot rail. */
function rackSpot(row: number, col: number, gap: number): { x: number; y: number } {
  const d = 2 * R + gap;
  return { x: FOOT_X + (col - row / 2) * d, y: FOOT_Y - row * d * (Math.sqrt(3) / 2) };
}

/** 8-ball: the triangle (the 8 in the middle, a solid and a stripe in the back corners). `rnd` shuffles. */
export function rackEight(rnd: () => number): BallPos[] {
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const sh = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  sh(solids);
  sh(stripes);
  const solidLeft = rnd() < 0.5;
  const cornerA = solids.pop()!;
  const cornerB = stripes.pop()!;
  const rest = sh([...solids, ...stripes]);
  const gap = 0.2 + rnd() * 0.4;
  const balls: BallPos[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      let id: number;
      if (row === 2 && col === 1) id = 8;
      else if (row === 4 && col === 0) id = solidLeft ? cornerA : cornerB;
      else if (row === 4 && col === 4) id = solidLeft ? cornerB : cornerA;
      else id = rest.pop()!;
      const p = rackSpot(row, col, gap);
      balls.push({ id, x: p.x + (rnd() - 0.5) * 0.08, y: p.y + (rnd() - 0.5) * 0.08 });
    }
  }
  return balls;
}

/** 9-ball: the diamond (1 at the apex on the foot spot, the 9 in the middle). */
export function rackNine(rnd: () => number): BallPos[] {
  const others = [2, 3, 4, 5, 6, 7, 8];
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  // rows of 1, 2, 3, 2, 1 (the last two rows shifted back into the diamond)
  const layout: [number, number][] = [[0, 0], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2], [3, 1], [3, 2], [4, 2]];
  const gap = 0.2 + rnd() * 0.4;
  return layout.map(([row, col], i) => {
    const id = i === 0 ? 1 : i === 4 ? 9 : others.pop()!;
    const p = rackSpot(row, col, gap);
    return { id, x: p.x + (rnd() - 0.5) * 0.08, y: p.y + (rnd() - 0.5) * 0.08 };
  });
}

/* ------------------------------------------------------------------ */
/* Snooker: the balls and their spots                                   */
/* ------------------------------------------------------------------ */

/** Snooker ball ids: the colours 16 (yellow, 2 points) … 21 (black, 7 points), the reds 22 … 36. */
export const YELLOW = 16;
export const BLACK = 21;
export const COLOURS = [16, 17, 18, 19, 20, 21];
export const REDS = Array.from({ length: 15 }, (_, i) => 22 + i);
export const isRed = (id: number) => id >= 22 && id <= 36;
export const isColour = (id: number) => id >= YELLOW && id <= BLACK;
/** A snooker ball's value: a red 1, yellow 2 … black 7. */
export const snookerValue = (id: number) => (isRed(id) ? 1 : isColour(id) ? id - 14 : 0);

/** The colours' spots: yellow / brown / green on the baulk line (the D), blue in the centre, pink, black. */
export const SPOTS: Record<number, { x: number; y: number }> = {
  16: { x: SNK_W / 2 + D_R, y: BAULK_Y },
  17: { x: SNK_W / 2 - D_R, y: BAULK_Y },
  18: { x: SNK_W / 2, y: BAULK_Y },
  19: { x: SNK_W / 2, y: SNK_L / 2 },
  20: { x: SNK_W / 2, y: SNK_L / 4 },
  21: { x: SNK_W / 2, y: 324 },
};

/** The 15 reds in a triangle, its apex just behind the pink; the colours on their spots. */
export function rackSnooker(rnd: () => number): BallPos[] {
  const r = SNOOKER.R;
  const d = 2 * r + 0.3;
  const apexY = SPOTS[20].y - 2 * r - 1.5;
  const balls: BallPos[] = COLOURS.map((id) => ({ id, ...SPOTS[id] }));
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      balls.push({ id: REDS[k++], x: SNK_W / 2 + (col - row / 2) * d + (rnd() - 0.5) * 0.08, y: apexY - row * d * (Math.sqrt(3) / 2) + (rnd() - 0.5) * 0.08 });
    }
  }
  return balls;
}

/**
 * Snooker: where re-spotted colours go (`ids`, placed highest value first): on its own spot when free,
 * else on the highest free spot, else on the nearest free point from its spot towards the top cushion
 * (then towards the bottom one). Returns the balls with them added.
 */
export function respotColours(balls: BallPos[], ids: number[]): BallPos[] {
  const r = SNOOKER.R;
  const out = balls.slice();
  const free = (x: number, y: number) => out.every((b) => hyp(b.x - x, b.y - y) >= 2 * r + 0.5);
  for (const id of [...ids].sort((a, b) => b - a)) {
    const own = SPOTS[id];
    let at: { x: number; y: number } | null = null;
    if (free(own.x, own.y)) at = own;
    for (let c = BLACK; !at && c >= YELLOW; c--) if (free(SPOTS[c].x, SPOTS[c].y)) at = SPOTS[c];
    for (let y = own.y - 1; !at && y >= r; y -= 1) if (free(own.x, y)) at = { x: own.x, y };
    for (let y = own.y + 1; !at && y <= SNK_L - r; y += 1) if (free(own.x, y)) at = { x: own.x, y };
    out.push({ id, ...(at ?? own) });
  }
  return out;
}

/** Where the cue ball waits for the break (in hand behind the head string). */
export const BREAK_SPOT = { x: W / 2, y: HEAD_Y + 120 };

/* ------------------------------------------------------------------ */
/* The aim guide (geometric, computed on the shooter's phone)          */
/* ------------------------------------------------------------------ */

export interface Guide {
  /** where the cue ball's centre is when it first touches something */
  hit: { x: number; y: number };
  /** the ball it touches first (null: a cushion) */
  ball: number | null;
  /** the object ball's direction after contact (unit), and the cue ball's (unit; null for a full hit) */
  obj: { x: number; y: number } | null;
  cue: { x: number; y: number } | null;
  /** cushion first: the direction after the bounce (unit) */
  bounce: { x: number; y: number } | null;
}

/** The first thing the cue ball meets along `angle` from (cx, cy), and what goes where after contact. */
export function aimGuide(balls: BallPos[], cx: number, cy: number, angle: number, t: Table = POOL): Guide {
  const { W, L, R } = t;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;
  let ball: BallPos | null = null;
  for (const b of balls) {
    if (b.id === 0) continue;
    const t = toiPoint(cx, cy, dx, dy, b.x, b.y, 2 * R);
    if (t >= 0 && t < best) {
      best = t;
      ball = b;
    }
  }
  // the cushion lines (pockets ignored: good enough for a guide)
  const tx = dx > 0 ? (W - R - cx) / dx : dx < 0 ? (R - cx) / dx : Infinity;
  const ty = dy > 0 ? (L - R - cy) / dy : dy < 0 ? (R - cy) / dy : Infinity;
  const tc = Math.max(0, Math.min(tx, ty));
  if (ball && best <= tc) {
    const hx = cx + dx * best;
    const hy = cy + dy * best;
    let nx = ball.x - hx;
    let ny = ball.y - hy;
    const d = hyp(nx, ny) || 1;
    nx /= d;
    ny /= d;
    const along = dx * nx + dy * ny;
    let ux = dx - along * nx;
    let uy = dy - along * ny;
    const ul = hyp(ux, uy);
    const cueDir = ul > 0.02 ? { x: (ux /= ul), y: (uy /= ul) } : null;
    return { hit: { x: hx, y: hy }, ball: ball.id, obj: { x: nx, y: ny }, cue: cueDir, bounce: null };
  }
  const hx = cx + dx * tc;
  const hy = cy + dy * tc;
  const bounce = tx < ty ? { x: -dx, y: dy } : { x: dx, y: -dy };
  return { hit: { x: hx, y: hy }, ball: null, obj: null, cue: null, bounce };
}

/**
 * A lone ball leaving (x, y) in direction (dx, dy) (unit): the pocket it drops into before touching any
 * cushion or jaw, or −1. The bots use it to find how wide a pocket looks from a ball.
 */
export function straightDrop(x: number, y: number, dx: number, dy: number, t: Table = POOL): number {
  const { W, L, R, drop: DROP } = t;
  let best = Infinity;
  for (const g of t.segs) {
    const p = g.v ? x : y;
    const v = g.v ? dx : dy;
    if (v * g.n >= 0) continue;
    const gap = (p - g.c) * g.n - R;
    if (gap < -R * 0.5) continue;
    const te = Math.max(0, gap / -(v * g.n));
    const along = g.v ? y + dy * te : x + dx * te;
    if (along >= g.a && along <= g.b && te < best) best = te;
  }
  for (const q of t.noses) {
    const te = toiPoint(x, y, dx, dy, q.x, q.y, R + t.noseR);
    if (te >= 0 && te < best) best = te;
  }
  const tl = dx < 0 ? (x + DROP) / -dx : dx > 0 ? (W + DROP - x) / dx : Infinity;
  const tt = dy < 0 ? (y + DROP) / -dy : dy > 0 ? (L + DROP - y) / dy : Infinity;
  const td = Math.max(0, Math.min(tl, tt));
  if (td > best) return -1;
  const px = x + dx * td;
  const py = y + dy * td;
  let pocket = -1;
  let bd = Infinity;
  t.pockets.forEach((p, i) => {
    const d = hyp(p.x - px, p.y - py);
    if (d < bd) {
      bd = d;
      pocket = i;
    }
  });
  return pocket;
}

/** Which pocket a point is nearest to (for tapping a pocket). */
export function nearestPocket(x: number, y: number, t: Table = POOL): { pocket: number; dist: number } {
  let pocket = 0;
  let dist = Infinity;
  t.holes.forEach((p, i) => {
    const d = hyp(p.x - x, p.y - y);
    if (d < dist) {
      dist = d;
      pocket = i;
    }
  });
  return { pocket, dist };
}
