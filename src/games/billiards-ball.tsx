/**
 * «البلياردو» — a ball that looks like a real sphere and rolls.
 *
 * Every ball keeps an orientation (a unit quaternion, body → world). The body carries the number discs
 * (two, on opposite sides, like a real ball), the stripe's poles (9–15) and the cue ball's red dots.
 * World axes: x to the right, y down the screen, z into the table (the viewer looks along +z, so a
 * surface point is visible when its z < 0). Seen from above, everything is projected orthographically:
 *
 * - a number disc is a circle View (with its number) mapped by translate · rotate φ · scaleY(cos) ·
 *   rotate ψ — its foreshortened, turned image on the sphere; only the disc that faces the viewer is drawn;
 * - a stripe is a ball in the band's colour with two white polar caps. A cap that crosses the limb is
 *   seen as its ellipse plus the slice of the disc beyond the chord where its rim meets the limb, so each
 *   cap is an ellipse plus a half-plane, clipped by the ball's circle (the back cap: the half-plane in
 *   white, then its ellipse in the band's colour over it);
 * - the light (shading, terminator, specular highlight, bounce light) is one static SVG on top, and the
 *   contact shadow one static SVG below: they never turn with the ball.
 *
 * While a shot plays, the orientation follows rolling without slipping (axis = up × direction of travel,
 * angle = distance / radius), precomputed at every keyframe of the recorded track when the shot arrives
 * (`orientTimeline`), and interpolated on the UI thread (one rotation about the segment's axis). A ball at
 * rest keeps its last orientation (`orientations`, kept for the session, so a later shot continues from
 * it); a phone that joins late starts from a random one; a fresh rack shows its numbers facing up.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { BALL_COLOR, isStripe } from '@/shared/games/billiards';
import type { Track } from '@/shared/games/billiards-physics';

/** A unit quaternion [w, x, y, z]. */
export type Quat = [number, number, number, number];

const IVORY = '#F8F4E8';
const DISC = '#FBF8EF';
/** angular radius of the number disc (its projected diameter ≈ 0.55 of the ball) */
const DISC_A = (33 * Math.PI) / 180;
/** angular radius of a stripe's white cap (the band is ±34° wide) */
const CAP_A = (56 * Math.PI) / 180;
/** angular radius of the cue ball's red dot */
const DOT_A = (11 * Math.PI) / 180;

/* ------------------------------------------------------------------ */
/* Orientation                                                          */
/* ------------------------------------------------------------------ */

/** r ⊗ q where r is a rotation by `angle` about the horizontal axis (ax, ay, 0). */
function turnQ(q: Quat | number[], o: number, ax: number, ay: number, angle: number): Quat {
  'worklet';
  const h = angle / 2;
  const s = Math.sin(h);
  const rw = Math.cos(h);
  const rx = ax * s;
  const ry = ay * s;
  const w = q[o];
  const x = q[o + 1];
  const y = q[o + 2];
  const z = q[o + 3];
  // (rw, rx, ry, 0) ⊗ (w, x, y, z)
  return [rw * w - rx * x - ry * y, rw * x + rx * w + ry * z, rw * y - rx * z + ry * w, rw * z + rx * y - ry * x];
}

/**
 * The orientation at every keyframe of a track, rolling without slipping from `q0`:
 * [w, x, y, z] × keyframes (flat). Rolling along +x turns about −y (the top of the ball moves forward).
 */
export function orientTimeline(tr: Track, q0: Quat, radius: number): number[] {
  const n = tr.t.length;
  const out: number[] = new Array(n * 4);
  let q: Quat = q0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const dx = tr.x[i] - tr.x[i - 1];
      const dy = tr.y[i] - tr.y[i - 1];
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        q = turnQ(q, 0, dy / d, -dx / d, d / radius);
        const m = Math.hypot(q[0], q[1], q[2], q[3]);
        q = [q[0] / m, q[1] / m, q[2] / m, q[3] / m];
      }
    }
    out[i * 4] = q[0];
    out[i * 4 + 1] = q[1];
    out[i * 4 + 2] = q[2];
    out[i * 4 + 3] = q[3];
  }
  return out;
}

/** The last orientation of a timeline. */
export function lastOrient(qs: number[]): Quat {
  const o = qs.length - 4;
  return [qs[o], qs[o + 1], qs[o + 2], qs[o + 3]];
}

/**
 * Position and orientation on a track at `ms`: [x, y, w, qx, qy, qz]. Between two keyframes the ball
 * moves in a straight line, so the orientation is the earlier keyframe's turned about that segment's
 * axis by the fraction of its angle.
 */
export function sampleBall(tr: Track, qs: number[], ms: number, radius: number): number[] {
  'worklet';
  const n = tr.t.length;
  if (n === 0) return [0, 0, 1, 0, 0, 0];
  if (ms <= tr.t[0]) return [tr.x[0], tr.y[0], qs[0], qs[1], qs[2], qs[3]];
  if (ms >= tr.t[n - 1]) {
    const o = (n - 1) * 4;
    return [tr.x[n - 1], tr.y[n - 1], qs[o], qs[o + 1], qs[o + 2], qs[o + 3]];
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tr.t[m] <= ms) lo = m;
    else hi = m;
  }
  const span = tr.t[hi] - tr.t[lo];
  const f = span > 0 ? (ms - tr.t[lo]) / span : 1;
  const dx = tr.x[hi] - tr.x[lo];
  const dy = tr.y[hi] - tr.y[lo];
  const x = tr.x[lo] + dx * f;
  const y = tr.y[lo] + dy * f;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return [x, y, qs[lo * 4], qs[lo * 4 + 1], qs[lo * 4 + 2], qs[lo * 4 + 3]];
  const q = turnQ(qs, lo * 4, dy / d, -dx / d, (d * f) / radius);
  return [x, y, q[0], q[1], q[2], q[3]];
}

/** Small deterministic random numbers per ball (the same on every phone). */
function seeded(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const axisQ = (x: number, y: number, z: number, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), x * s, y * s, z * s];
};

/** A fresh rack: the number up, slightly tilted, nearly upright (as the balls are racked by hand). */
export function rackOrient(id: number): Quat {
  const r = seeded(id + 101);
  const spin = (r() - 0.5) * 0.7; // about the view axis
  const tilt = r() * 0.5; // towards some direction
  const dir = r() * Math.PI * 2;
  return qMul(axisQ(Math.sin(dir), -Math.cos(dir), 0, tilt), axisQ(0, 0, 1, spin));
}

/** Any orientation (a phone that came in late does not know the real one). */
export function randomOrient(id: number): Quat {
  const r = seeded(id + 7);
  // uniform random rotation (Shoemake)
  const u1 = r();
  const u2 = r() * Math.PI * 2;
  const u3 = r() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/** The balls' orientations at rest, kept for the session (a remount of the table keeps them). */
const rest = new Map<number, Quat>();
/** true from a rack's first view (seen on this phone) until its break is played: numbers up */
let freshRack = false;

export const orientations = {
  /** the orientation of a ball at rest */
  get(id: number, breakShot: boolean): Quat {
    if (breakShot || freshRack) return rackOrient(id);
    return rest.get(id) ?? randomOrient(id);
  },
  /** where a shot starts from (call before `set` for the balls of that shot) */
  start(id: number): Quat {
    if (freshRack) return rackOrient(id);
    return rest.get(id) ?? randomOrient(id);
  },
  set(id: number, q: Quat) {
    rest.set(id, q);
  },
  /** a new rack is on the table (the break is next) */
  newRack() {
    freshRack = true;
    rest.clear();
  },
  /** the shot that was just set up started the rack */
  shotPlayed() {
    if (!freshRack) return;
    freshRack = false;
    // the balls that did not move keep their rack orientation
    for (let id = 0; id <= 15; id++) if (!rest.has(id)) rest.set(id, rackOrient(id));
  },
};

/* ------------------------------------------------------------------ */
/* Projection of the body-fixed marks                                   */
/* ------------------------------------------------------------------ */

type Tf = ({ translateX: number } | { translateY: number } | { rotate: string } | { scaleY: number } | { scale: number })[];

/**
 * The disc's View (diameter S·sin a, centred on the ball) → its image for the facing disc, from the
 * orientation q. Body axes: number axis (0,0,−1), text up / stripe pole (0,−1,0), text right (1,0,0).
 */
function discTf(w: number, x: number, y: number, z: number, half: number, a: number): Tf {
  'worklet';
  // world: A = −col2, T = col0
  let nx = -2 * (x * z + w * y);
  let ny = -2 * (y * z - w * x);
  let nz = -(1 - 2 * (x * x + y * y));
  let rx = 1 - 2 * (y * y + z * z);
  let ry = 2 * (x * y + w * z);
  let rz = 2 * (x * z - w * y);
  if (nz > 0) {
    // the other disc (on the opposite side) faces the viewer: normal −A, its text's right −T
    nx = -nx;
    ny = -ny;
    nz = -nz;
    rx = -rx;
    ry = -ry;
    rz = -rz;
  }
  const s = Math.sqrt(nx * nx + ny * ny);
  let mx = 1;
  let my = 0;
  if (s > 1e-5) {
    mx = -ny / s;
    my = nx / s;
  }
  // w = m × n (m horizontal): its image is the minor axis, pointing 90° clockwise from m
  const wx = my * nz;
  const wy = -mx * nz;
  const wz = mx * ny - my * nx;
  const phi = Math.atan2(my, mx);
  const psi = Math.atan2(rx * wx + ry * wy + rz * wz, rx * mx + ry * my);
  const c = Math.max(0.02, -nz);
  const off = half * Math.cos(a);
  return [{ translateX: off * nx }, { translateY: off * ny }, { rotate: `${phi}rad` }, { scaleY: c }, { rotate: `${psi}rad` }];
}

/** The stripe's facing pole (unit, z ≤ 0) from q: P = −col1. */
function poleOf(w: number, x: number, y: number, z: number): [number, number, number] {
  'worklet';
  let px = -2 * (x * y - w * z);
  let py = -(1 - 2 * (x * x + z * z));
  let pz = -2 * (y * z + w * x);
  if (pz > 0) {
    px = -px;
    py = -py;
    pz = -pz;
  }
  return [px, py, pz];
}

/** A cap's ellipse (circle View of diameter S·sin CAP_A centred on the ball); side +1 front, −1 back. */
function capTf(px: number, py: number, pz: number, half: number, side: number): Tf {
  'worklet';
  const off = half * Math.cos(CAP_A) * side;
  const phi = Math.atan2(px, -py);
  return [{ translateX: off * px }, { translateY: off * py }, { rotate: `${phi}rad` }, { scaleY: Math.max(0.02, -pz) }];
}

/**
 * The slice of the disc beyond the chord where a cap's rim crosses the limb: a square View (side Q,
 * centred on the ball) moved out along ±(px, py) so its inner edge is at the chord, cos(CAP_A) / |p_xy|.
 */
function sliceTf(px: number, py: number, half: number, q: number, side: number): Tf {
  'worklet';
  const s = Math.sqrt(px * px + py * py);
  const d = s > 1e-4 ? Math.min(1.1, Math.cos(CAP_A) / s) : 1.1;
  const ux = s > 1e-4 ? (px / s) * side : side;
  const uy = s > 1e-4 ? (py / s) * side : 0;
  const dist = d * half + q / 2;
  return [{ translateX: ux * dist }, { translateY: uy * dist }, { rotate: `${Math.atan2(uy, ux)}rad` }];
}

/* ------------------------------------------------------------------ */
/* The light (static)                                                    */
/* ------------------------------------------------------------------ */

/** Shading, terminator, specular highlight and bounce light — the same for every ball, never turning. */
const Shade = memo(function Shade({ size }: { size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} style={styles.abs} pointerEvents="none">
      <Defs>
        <RadialGradient id="bbShade" cx="40%" cy="34%" r="72%" fx="36%" fy="28%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
          <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.62" stopColor="#000000" stopOpacity={0.1} />
          <Stop offset="0.86" stopColor="#000000" stopOpacity={0.42} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.62} />
        </RadialGradient>
        <LinearGradient id="bbRim" x1="0.2" y1="0.15" x2="0.8" y2="0.9">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="1" stopColor="#E9FFF2" stopOpacity={0.34} />
        </LinearGradient>
        <RadialGradient id="bbSpec" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="bbGloss" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#bbShade)" />
      <Circle cx={r} cy={r} r={r * 0.86} fill="none" stroke="url(#bbRim)" strokeWidth={r * 0.2} />
      <Ellipse cx={r * 0.74} cy={r * 0.6} rx={r * 0.52} ry={r * 0.4} fill="url(#bbGloss)" transform={`rotate(-35 ${r * 0.74} ${r * 0.6})`} />
      <Ellipse cx={r * 0.66} cy={r * 0.5} rx={r * 0.2} ry={r * 0.14} fill="url(#bbSpec)" transform={`rotate(-35 ${r * 0.66} ${r * 0.5})`} />
      <Circle cx={r} cy={r} r={r - 0.3} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={0.6} />
    </Svg>
  );
});

/** The soft contact shadow on the cloth, away from the light (down and a little to the right). */
const Shadow = memo(function Shadow({ size }: { size: number }) {
  const w = size * 1.5;
  return (
    <Svg width={w} height={w} style={[styles.abs, { left: size * 0.5 - w / 2 + size * 0.1, top: size * 0.5 - w / 2 + size * 0.16 }]} pointerEvents="none">
      <Defs>
        <RadialGradient id="bbShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.55} />
          <Stop offset="0.45" stopColor="#000000" stopOpacity={0.4} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={w / 2} cy={w / 2} rx={w / 2} ry={w * 0.44} fill="url(#bbShadow)" />
    </Svg>
  );
});

/* ------------------------------------------------------------------ */
/* The ball                                                              */
/* ------------------------------------------------------------------ */

interface Look {
  base: string;
  stripe: boolean;
  band: string;
  disc: { a: number; color: string; label: string | null } | null;
}

function lookOf(id: number, size: number, numbers: boolean): Look {
  const color = BALL_COLOR[id] ?? '#999999';
  if (id === 0) return { base: IVORY, stripe: false, band: IVORY, disc: { a: DOT_A, color: '#D23A3A', label: null } };
  const label = numbers && size >= 9 ? String(id) : null;
  return { base: color, stripe: isStripe(id), band: color, disc: { a: DISC_A, color: DISC, label } };
}

function Num({ label, d }: { label: string; d: number }) {
  const fs = d * (label.length > 1 ? 0.6 : 0.74);
  return (
    <Text allowFontScaling={false} style={[styles.num, { fontSize: fs, lineHeight: fs * 1.12, width: d }]}>
      {label}
    </Text>
  );
}

const IDENTITY: Quat = [1, 0, 0, 0];

/** A ball that does not move: its marks placed once from `q` (no worklet runs). */
export const StaticBall = memo(function StaticBall({ id, size, q = IDENTITY, numbers = true, shadow = true }: { id: number; size: number; q?: Quat; numbers?: boolean; shadow?: boolean }) {
  const look = lookOf(id, size, numbers);
  const half = size / 2;
  const sq = size * 1.25;
  const capD = size * Math.sin(CAP_A);
  const p = look.stripe ? poleOf(q[0], q[1], q[2], q[3]) : null;
  const dd = look.disc ? size * Math.sin(look.disc.a) : 0;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {shadow ? <Shadow size={size} /> : null}
      <View style={[styles.clip, { width: size, height: size, borderRadius: half, backgroundColor: look.base }]}>
        {p ? (
          <>
            <View style={[styles.white, { left: half - sq / 2, top: half - sq / 2, width: sq, height: sq, transform: sliceTf(p[0], p[1], half, sq, -1) }]} />
            <View style={[styles.abs, { left: half - capD / 2, top: half - capD / 2, width: capD, height: capD, borderRadius: capD / 2, backgroundColor: look.band, transform: capTf(p[0], p[1], p[2], half, -1) }]} />
            <View style={[styles.white, { left: half - sq / 2, top: half - sq / 2, width: sq, height: sq, transform: sliceTf(p[0], p[1], half, sq, 1) }]} />
            <View style={[styles.white, { left: half - capD / 2, top: half - capD / 2, width: capD, height: capD, borderRadius: capD / 2, transform: capTf(p[0], p[1], p[2], half, 1) }]} />
          </>
        ) : null}
        {look.disc ? (
          <View style={[styles.disc, { left: half - dd / 2, top: half - dd / 2, width: dd, height: dd, borderRadius: dd / 2, backgroundColor: look.disc.color, transform: discTf(q[0], q[1], q[2], q[3], half, look.disc.a) }]}>
            {look.disc.label ? <Num label={look.disc.label} d={dd} /> : null}
          </View>
        ) : null}
      </View>
      <Shade size={size} />
    </View>
  );
});

/**
 * A ball of the shot being played: position and orientation from its track on the shot's clock (UI
 * thread). A ball that drops sinks into its pocket: it slides to the hole, shrinks a little and darkens.
 */
export const MovingBall = memo(function MovingBall({
  id,
  size,
  track,
  qs,
  radius,
  clock,
  toPx,
  drop,
}: {
  id: number;
  size: number;
  track: Track;
  qs: number[];
  radius: number;
  clock: SharedValue<number>;
  /** mm → px: [px per mm, offset px] */
  toPx: [number, number];
  /** the moment it dropped (ms) and the pocket's centre (mm) */
  drop: { t: number; x: number; y: number } | null;
}) {
  const look = lookOf(id, size, true);
  const half = size / 2;
  const sq = size * 1.25;
  const capD = size * Math.sin(CAP_A);
  const dd = look.disc ? size * Math.sin(look.disc.a) : 0;
  const discA = look.disc?.a ?? DISC_A;
  const [kk, off] = toPx;

  const st = useDerivedValue(() => sampleBall(track, qs, clock.get(), radius));

  const pos = useAnimatedStyle(() => {
    const s = st.get();
    let x = s[0];
    let y = s[1];
    let scale = 1;
    let opacity = 1;
    if (drop) {
      const u = Math.max(0, Math.min(1, (clock.get() - drop.t) / 170));
      if (u > 0) {
        const e = u * (2 - u);
        x += (drop.x - x) * e * 0.8;
        y += (drop.y - y) * e * 0.8;
        scale = 1 - 0.24 * e;
        opacity = 1 - u;
      }
    }
    return { opacity, transform: [{ translateX: x * kk + off - half }, { translateY: y * kk + off - half }, { scale }] };
  });
  const disc = useAnimatedStyle(() => {
    const s = st.get();
    return { transform: discTf(s[2], s[3], s[4], s[5], half, discA) };
  });
  const backSlice = useAnimatedStyle(() => {
    if (!look.stripe) return {};
    const s = st.get();
    const p = poleOf(s[2], s[3], s[4], s[5]);
    return { transform: sliceTf(p[0], p[1], half, sq, -1) };
  });
  const backCap = useAnimatedStyle(() => {
    if (!look.stripe) return {};
    const s = st.get();
    const p = poleOf(s[2], s[3], s[4], s[5]);
    return { transform: capTf(p[0], p[1], p[2], half, -1) };
  });
  const frontSlice = useAnimatedStyle(() => {
    if (!look.stripe) return {};
    const s = st.get();
    const p = poleOf(s[2], s[3], s[4], s[5]);
    return { transform: sliceTf(p[0], p[1], half, sq, 1) };
  });
  const frontCap = useAnimatedStyle(() => {
    if (!look.stripe) return {};
    const s = st.get();
    const p = poleOf(s[2], s[3], s[4], s[5]);
    return { transform: capTf(p[0], p[1], p[2], half, 1) };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: size, height: size }, pos]}>
      <Shadow size={size} />
      <View style={[styles.clip, { width: size, height: size, borderRadius: half, backgroundColor: look.base }]}>
        {look.stripe ? (
          <>
            <Animated.View style={[styles.white, { left: half - sq / 2, top: half - sq / 2, width: sq, height: sq }, backSlice]} />
            <Animated.View style={[styles.abs, { left: half - capD / 2, top: half - capD / 2, width: capD, height: capD, borderRadius: capD / 2, backgroundColor: look.band }, backCap]} />
            <Animated.View style={[styles.white, { left: half - sq / 2, top: half - sq / 2, width: sq, height: sq }, frontSlice]} />
            <Animated.View style={[styles.white, { left: half - capD / 2, top: half - capD / 2, width: capD, height: capD, borderRadius: capD / 2 }, frontCap]} />
          </>
        ) : null}
        {look.disc ? (
          <Animated.View style={[styles.disc, { left: half - dd / 2, top: half - dd / 2, width: dd, height: dd, borderRadius: dd / 2, backgroundColor: look.disc.color }, disc]}>
            {look.disc.label ? <Num label={look.disc.label} d={dd} /> : null}
          </Animated.View>
        ) : null}
      </View>
      <Shade size={size} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  clip: { overflow: 'hidden' },
  white: { position: 'absolute', backgroundColor: IVORY },
  disc: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  num: { color: '#15151A', fontWeight: '900', textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' },
});
