/**
 * «البلياردو» — the drawings: the table (raised walnut rails with a lit bevel and grain, rounded outer
 * corners, metal caps at the pockets that follow the frame, mother-of-pearl sights on the pool table,
 * cushions sloping down to the cloth — cut at the pool jaws, rounded at the snooker ones — cloth lit by a
 * lamp above with a fine weave, the holes, the pool head string and foot spot or the snooker baulk line,
 * D and spots) and the cue stick (tapered, turned wood, rings, ferrule, tip). All static SVG; the balls
 * are in billiards-ball.tsx. Everything is drawn inside the table's own box: nothing is cut off.
 */
import { memo } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BAULK_Y, D_R, FOOT_X, FOOT_Y, HEAD_Y, POOL, SPOTS, type Table } from '@/shared/games/billiards-physics';

/** The table's drawn box (cloth + frame) in mm, and its frame's width. */
export function frameOf(t: Table) {
  return { rail: t.rail, w: t.W + 2 * t.rail, h: t.L + 2 * t.rail };
}

/** The pool table's frame (8-ball and 9-ball). */
export const RAIL = POOL.rail;
export const TABLE_W = POOL.W + 2 * POOL.rail;
export const TABLE_H = POOL.L + 2 * POOL.rail;

/** px per mm for a table `width` px wide. */
export const scaleFor = (width: number, t: Table = POOL) => width / (t.W + 2 * t.rail);

/** A fixed pseudo-random sequence (the cloth's weave and the wood's grain look the same everywhere). */
function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** The cloth's weave: a small tile of faint light and dark specks. */
function weave(tile: number) {
  const r = rand(7);
  const out: { x: number; y: number; w: number; light: boolean; o: number }[] = [];
  for (let i = 0; i < 260; i++) out.push({ x: r() * tile, y: r() * tile, w: 0.5 + r() * 0.8, light: r() < 0.5, o: 0.02 + r() * 0.045 });
  return out;
}

/** Grain lines along a rail: wavy, between `a` and `b` across it, running from 0 to `len`. */
function grain(len: number, a: number, b: number, seed: number, horizontal: boolean) {
  const r = rand(seed);
  const lines: { d: string; light: boolean; o: number }[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const c = a + ((b - a) * (i + 0.3 + r() * 0.4)) / n;
    const amp = (b - a) * (0.03 + r() * 0.05);
    const waves = 2 + Math.floor(r() * 4);
    const ph = r() * Math.PI * 2;
    let d = '';
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const u = (len * s) / steps;
      const v = c + amp * Math.sin(ph + (waves * Math.PI * 2 * s) / steps);
      d += `${s ? 'L' : 'M'}${horizontal ? `${u.toFixed(1)} ${v.toFixed(1)}` : `${v.toFixed(1)} ${u.toFixed(1)}`}`;
    }
    lines.push({ d, light: r() < 0.3, o: 0.12 + r() * 0.18 });
  }
  return lines;
}

type Pt = [number, number];

/** Points on an arc around (cx, cy) from angle a0 to a1 (radians), `n` segments, ends included. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/**
 * One cushion in rail coordinates (u along the rail, v outwards from the cloth: 0 at the cushion's nose
 * line, `cush` at its back), between the jaws at u0 and u1. A corner jaw is cut at 45° towards the corner,
 * a pool middle jaw slopes away from the pocket, a snooker jaw is rounded (radius rn) and then goes
 * straight back.
 */
function cushionPts(u0: number, u1: number, cush: number, rn: number, corner0: boolean, corner1: boolean): Pt[] {
  const end = (u: number, dir: 1 | -1, corner: boolean): Pt[] => {
    // dir: the side the pocket is on (−1: smaller u)
    if (rn > 0) return [[u, 0], ...arc(u, rn, rn, -Math.PI / 2, -Math.PI / 2 + dir * (Math.PI / 2), 6).slice(1), [u + dir * (corner ? cush : rn), cush]];
    return [[u, 0], [u + dir * (corner ? cush : -0.45 * cush), cush]];
  };
  const a = end(u0, -1, corner0);
  const b = end(u1, 1, corner1);
  return [...a.reverse(), ...b];
}

/**
 * The metal cap of a corner pocket in corner coordinates (p along the top / bottom rail, q along the side
 * rail, both negative outside the cloth): the frame's rounded corner on the outside, an arc around the
 * hole on the inside, stopping at the cushions' backs.
 */
function cornerCapPts(rail: number, cush: number, round: number, c: number, rc: number): Pt[] {
  const pe = -c + Math.sqrt(Math.max(0, rc * rc - (rail - c) * (rail - c)));
  const qi = -c + Math.sqrt(Math.max(0, rc * rc - (cush - c) * (cush - c)));
  const ang = (p: number, q: number) => Math.atan2(q + c, p + c);
  const pts: Pt[] = [[pe, -rail]];
  pts.push(...arc(-rail + round, -rail + round, round, -Math.PI / 2, -Math.PI, 8));
  pts.push([-rail, pe]);
  pts.push(...arc(-c, -c, rc, ang(-rail, pe), ang(-cush, qi), 8).slice(1));
  pts.push([-cush, -cush]);
  pts.push(...arc(-c, -c, rc, ang(qi, -cush), ang(pe, -rail), 8));
  return pts;
}

/** The cap of a middle pocket in rail coordinates (u along the rail from the pocket, v outwards): flush with the frame's edge. */
function sideCapPts(rail: number, cush: number, c: number, rs: number): Pt[] {
  const us = Math.sqrt(Math.max(0, rs * rs - (rail - c) * (rail - c)));
  const ui = Math.sqrt(Math.max(0, rs * rs - (cush - c) * (cush - c)));
  const a0 = Math.atan2(us, rail - c);
  const a1 = Math.atan2(ui, cush - c);
  const pts: Pt[] = [[-us, rail], [us, rail]];
  // around the hole's centre (u = 0, v = c), from the outer edge to the cushions' backs, on both sides
  for (const a of arc(0, 0, rs, a0, a1, 8).slice(1)) pts.push([a[1], c + a[0]]);
  pts.push([-ui, cush]);
  for (const a of arc(0, 0, rs, a1, a0, 8).slice(1, -1)) pts.push([-a[1], c + a[0]]);
  return pts;
}

const pathOf = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}Z`;

/** The table: rails, caps, sights, cushions, cloth, holes, and the markings of the game. */
export const TableSvg = memo(function TableSvg({ width, kitchen, table = POOL }: { width: number; kitchen: boolean; table?: Table }) {
  const t = table;
  const snooker = t.id === 'snooker';
  const { W, L } = t;
  const RL = t.rail;
  const CUSH = t.cush;
  const k = width / (W + 2 * RL);
  const height = (L + 2 * RL) * k;
  const X = (x: number) => (RL + x) * k;
  const Y = (y: number) => (RL + y) * k;
  const P = (pts: Pt[]) => pathOf(pts.map(([x, y]) => [X(x), Y(y)] as Pt));
  const wood = (RL - CUSH) * k; // the wood's width (px)
  const round = RL * 0.5; // the frame's outer corners (mm)
  const corner = round * k;
  const cn = t.cornerNose;
  const sh = t.sideHalf;
  // cushions, mapped from rail coordinates, each with its gradient's line (back → nose)
  const cushions: { d: string; g: [number, number, number, number] }[] = [];
  const hz = (bottom: boolean) => {
    const pts = cushionPts(cn, W - cn, CUSH, t.noseR, true, true).map(([u, v]) => [u, bottom ? L + v : -v] as Pt);
    const yb = bottom ? L + CUSH : -CUSH;
    const yf = bottom ? L : 0;
    cushions.push({ d: P(pts), g: [0, Y(yb), 0, Y(yf)] });
  };
  const vt = (right: boolean, u0: number, u1: number, c0: boolean, c1: boolean) => {
    const pts = cushionPts(u0, u1, CUSH, t.noseR, c0, c1).map(([u, v]) => [right ? W + v : -v, u] as Pt);
    const xb = right ? W + CUSH : -CUSH;
    const xf = right ? W : 0;
    cushions.push({ d: P(pts), g: [X(xb), 0, X(xf), 0] });
  };
  hz(false);
  hz(true);
  vt(false, cn, L / 2 - sh, true, false);
  vt(false, L / 2 + sh, L - cn, false, true);
  vt(true, cn, L / 2 - sh, true, false);
  vt(true, L / 2 + sh, L - cn, false, true);
  // the caps: corners follow the frame's rounded corner, middles sit flush with its edge
  const hc = -t.holes[0].x; // how far the corner holes sit outside the cloth's corner
  const cornerCap = cornerCapPts(RL, CUSH, round, hc, snooker ? 80 : 90);
  const caps = [
    cornerCap.map(([p, q]) => [p, q] as Pt),
    cornerCap.map(([p, q]) => [W - p, q] as Pt),
    sideCapPts(RL, CUSH, -t.holes[2].x, snooker ? 78 : 80).map(([u, v]) => [-v, L / 2 + u] as Pt),
    sideCapPts(RL, CUSH, -t.holes[2].x, snooker ? 78 : 80).map(([u, v]) => [W + v, L / 2 + u] as Pt),
    cornerCap.map(([p, q]) => [p, L - q] as Pt),
    cornerCap.map(([p, q]) => [W - p, L - q] as Pt),
  ].map(P);
  // the sights (pool), on the middle of the wood, clear of the caps
  const mid = wood / 2 + 1;
  const sights: { x: number; y: number }[] = [];
  if (!snooker) {
    for (const f of [0.25, 0.5, 0.75]) sights.push({ x: X(W * f), y: mid }, { x: X(W * f), y: height - mid });
    for (const f of [1, 2, 3, 5, 6, 7]) sights.push({ x: mid, y: Y((L * f) / 8) }, { x: width - mid, y: Y((L * f) / 8) });
  }
  const sz = Math.max(2.4, 9 * k);
  const tile = 37;
  const specks = weave(tile);
  const grains = [...grain(width, 2, wood, 3, true), ...grain(width, height - wood, height - 2, 5, true)];
  const vgrains = [...grain(height, 2, wood, 11, false), ...grain(height, width - wood, width - 2, 13, false)];
  const shadowIn = (snooker ? 40 : 30) * k; // the cushions' shadow on the cloth
  const felt = snooker ? ['#43A956', '#2C8A3E', '#155427'] : ['#34AC72', '#228A5A', '#0F5638'];
  const cush = snooker ? ['#114A1F', '#1F7531', '#2A8C3D', '#47AE58', '#17602A'] : ['#0E4F33', '#1A7A4E', '#23935F', '#3DB37C', '#14603F'];
  const line = 'rgba(255,255,255,0.32)';
  const lw = Math.max(0.8, 3 * k);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="btWood" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={snooker ? '#8A4E2A' : '#9A6036'} />
          <Stop offset="0.45" stopColor={snooker ? '#6A3519' : '#7A4523'} />
          <Stop offset="1" stopColor={snooker ? '#3F1F0C' : '#4E2912'} />
        </LinearGradient>
        <LinearGradient id="btBevel" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE2B8" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#FFE2B8" stopOpacity={0.12} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.35} />
        </LinearGradient>
        <RadialGradient id="btFelt" cx="50%" cy="48%" rx="62%" ry="56%" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={felt[0]} />
          <Stop offset="0.5" stopColor={felt[1]} />
          <Stop offset="1" stopColor={felt[2]} />
        </RadialGradient>
        <Pattern id="btWeave" patternUnits="userSpaceOnUse" width={tile} height={tile}>
          {specks.map((sp, i) => (
            <Rect key={i} x={sp.x} y={sp.y} width={sp.w} height={sp.w} fill={sp.light ? '#FFFFFF' : '#000000'} opacity={sp.o} />
          ))}
        </Pattern>
        <LinearGradient id="btChrome" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E3E6EA" />
          <Stop offset="0.28" stopColor="#A9AFB6" />
          <Stop offset="0.55" stopColor="#6A7078" />
          <Stop offset="0.8" stopColor="#B4BAC0" />
          <Stop offset="1" stopColor="#5E646B" />
        </LinearGradient>
        <RadialGradient id="btHole" cx="50%" cy="50%" r="50%" fx="42%" fy="40%">
          <Stop offset="0" stopColor="#000000" />
          <Stop offset="0.7" stopColor="#050505" />
          <Stop offset="0.93" stopColor="#151517" />
          <Stop offset="1" stopColor="#2A2A2D" />
        </RadialGradient>
        <LinearGradient id="btHoleRim" x1="0.15" y1="0.1" x2="0.85" y2="0.9">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.05} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.35} />
        </LinearGradient>
        <LinearGradient id="btSight" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.6" stopColor="#E7E0CF" />
          <Stop offset="1" stopColor="#B9AF98" />
        </LinearGradient>
        {cushions.map((c, i) => (
          <LinearGradient key={i} id={`btCush${i}`} gradientUnits="userSpaceOnUse" x1={c.g[0]} y1={c.g[1]} x2={c.g[2]} y2={c.g[3]}>
            <Stop offset="0" stopColor={cush[0]} />
            <Stop offset="0.25" stopColor={cush[1]} />
            <Stop offset="0.8" stopColor={cush[2]} />
            <Stop offset="0.93" stopColor={cush[3]} />
            <Stop offset="1" stopColor={cush[4]} />
          </LinearGradient>
        ))}
        <LinearGradient id="btShT" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.42} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="btShB" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="btShL" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.4} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="btShR" x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.26} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>
        {(['T', 'B', 'L', 'R'] as const).map((side) => {
          const v = side === 'T' || side === 'B';
          const flip = side === 'B' || side === 'R';
          return (
            <LinearGradient key={side} id={`btRail${side}`} x1={v ? 0 : flip ? 1 : 0} y1={v ? (flip ? 1 : 0) : 0} x2={v ? 0 : flip ? 0 : 1} y2={v ? (flip ? 0 : 1) : 0}>
              <Stop offset="0" stopColor="#000000" stopOpacity={0.25} />
              <Stop offset="0.12" stopColor="#FFFFFF" stopOpacity={0.05} />
              <Stop offset="0.32" stopColor="#FFE9C8" stopOpacity={0.24} />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.88" stopColor="#000000" stopOpacity={0.18} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.42} />
            </LinearGradient>
          );
        })}
        <ClipPath id="btClip">
          <Rect x={0} y={0} width={width} height={height} rx={corner} />
        </ClipPath>
      </Defs>

      {/* the rails: the dark outer side, the wood, its grain and the lit rounded edge */}
      <Rect x={0} y={0} width={width} height={height} rx={corner} fill="#1E1008" />
      <Rect x={1.2} y={1.2} width={width - 2.4} height={height - 2.4} rx={corner - 1} fill="url(#btWood)" />
      <G clipPath="url(#btClip)">
        {grains.map((g, i) => (
          <Path key={`gh${i}`} d={g.d} stroke={g.light ? '#FFD9A8' : '#2A1206'} strokeOpacity={g.light ? g.o * 0.45 : g.o} strokeWidth={0.8} fill="none" />
        ))}
        {vgrains.map((g, i) => (
          <Path key={`gv${i}`} d={g.d} stroke={g.light ? '#FFD9A8' : '#2A1206'} strokeOpacity={g.light ? g.o * 0.45 : g.o} strokeWidth={0.8} fill="none" />
        ))}
      </G>
      {/* each rail is rounded: a lit crown, sloping down into shade at both edges (mitred at the corners) */}
      <G clipPath="url(#btClip)">
        <Path d={`M0 0 L${width} 0 L${width - wood} ${wood} L${wood} ${wood}Z`} fill="url(#btRailT)" />
        <Path d={`M0 ${height} L${width} ${height} L${width - wood} ${height - wood} L${wood} ${height - wood}Z`} fill="url(#btRailB)" />
        <Path d={`M0 0 L${wood} ${wood} L${wood} ${height - wood} L0 ${height}Z`} fill="url(#btRailL)" />
        <Path d={`M${width} 0 L${width - wood} ${wood} L${width - wood} ${height - wood} L${width} ${height}Z`} fill="url(#btRailR)" />
      </G>
      <Rect x={1.8} y={1.8} width={width - 3.6} height={height - 3.6} rx={corner - 1.5} fill="none" stroke="url(#btBevel)" strokeWidth={Math.max(1.4, 5 * k)} />
      {/* the step down from the wood to the cushions */}
      <Rect x={wood - 1} y={wood - 1} width={width - 2 * wood + 2} height={height - 2 * wood + 2} fill="none" stroke="rgba(255,226,184,0.22)" strokeWidth={1} />
      <Rect x={wood} y={wood} width={width - 2 * wood} height={height - 2 * wood} fill="#0A2E1E" />

      {/* the cloth (into the pockets' throats), lit from above, with its weave */}
      <Rect x={X(-CUSH)} y={Y(-CUSH)} width={(W + 2 * CUSH) * k} height={(L + 2 * CUSH) * k} fill="url(#btFelt)" />
      <Rect x={X(-CUSH)} y={Y(-CUSH)} width={(W + 2 * CUSH) * k} height={(L + 2 * CUSH) * k} fill="url(#btWeave)" />
      <Rect x={X(0)} y={Y(0)} width={W * k} height={shadowIn} fill="url(#btShT)" />
      <Rect x={X(0)} y={Y(L) - shadowIn * 0.8} width={W * k} height={shadowIn * 0.8} fill="url(#btShB)" />
      <Rect x={X(0)} y={Y(0)} width={shadowIn} height={L * k} fill="url(#btShL)" />
      <Rect x={X(W) - shadowIn * 0.8} y={Y(0)} width={shadowIn * 0.8} height={L * k} fill="url(#btShR)" />
      {snooker ? (
        <>
          {/* the baulk line, the D (lit while the cue ball is in hand) and the colours' spots */}
          {kitchen ? <Path d={`M${X(W / 2 - D_R)} ${Y(BAULK_Y)} A${D_R * k} ${D_R * k} 0 0 0 ${X(W / 2 + D_R)} ${Y(BAULK_Y)}Z`} fill="rgba(255,255,255,0.08)" /> : null}
          <Line x1={X(0)} y1={Y(BAULK_Y)} x2={X(W)} y2={Y(BAULK_Y)} stroke={line} strokeWidth={lw} />
          <Path d={`M${X(W / 2 - D_R)} ${Y(BAULK_Y)} A${D_R * k} ${D_R * k} 0 0 0 ${X(W / 2 + D_R)} ${Y(BAULK_Y)}`} fill="none" stroke={line} strokeWidth={lw} strokeDasharray={kitchen ? `${4 * lw} ${3 * lw}` : undefined} />
          {Object.values(SPOTS).map((sp, i) => (
            <Circle key={`sp${i}`} cx={X(sp.x)} cy={Y(sp.y)} r={Math.max(1, 5 * k)} fill="rgba(255,255,255,0.3)" />
          ))}
        </>
      ) : (
        <>
          {kitchen ? <Rect x={X(0)} y={Y(HEAD_Y)} width={W * k} height={(L - HEAD_Y) * k} fill="rgba(255,255,255,0.07)" /> : null}
          <Line x1={X(0)} y1={Y(HEAD_Y)} x2={X(W)} y2={Y(HEAD_Y)} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray={kitchen ? '5 4' : undefined} />
          <Circle cx={X(FOOT_X)} cy={Y(FOOT_Y)} r={Math.max(1.4, 6 * k)} fill="rgba(255,255,255,0.32)" />
        </>
      )}

      {/* the cushions: lit on top, a bright nose, a dark line where they meet the cloth */}
      {cushions.map((c, i) => (
        <Path key={`c${i}`} d={c.d} fill={`url(#btCush${i})`} />
      ))}

      {/* the metal caps (inside the frame's outline), then the holes with a thin dark lip */}
      {caps.map((d, i) => (
        <G key={`cap${i}`}>
          <Path d={d} fill="url(#btChrome)" />
          <Path d={d} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={0.7} />
        </G>
      ))}
      {t.holes.map((p, i) => (
        <G key={`p${i}`}>
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k + Math.max(0.8, 3.5 * k)} fill="#4A4F57" />
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k} fill="url(#btHole)" />
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k - 0.6} fill="none" stroke="url(#btHoleRim)" strokeWidth={1.1} />
        </G>
      ))}
      {/* the frame's outline over everything at the edge */}
      <Rect x={0.4} y={0.4} width={width - 0.8} height={height - 0.8} rx={corner} fill="none" stroke="rgba(20,10,4,0.8)" strokeWidth={0.8} />

      {sights.map((sp, i) => (
        <Path key={`s${i}`} d={`M${sp.x} ${sp.y - sz} L${sp.x + sz * 0.62} ${sp.y} L${sp.x} ${sp.y + sz} L${sp.x - sz * 0.62} ${sp.y}Z`} fill="url(#btSight)" stroke="rgba(40,20,8,0.55)" strokeWidth={0.6} />
      ))}
    </Svg>
  );
});

/**
 * The cue stick, `len` px long, `th` px thick at the butt, the tip at the right end: a turned
 * cylinder (a gradient across its width), a dark butt with rings, a forearm with points, a maple shaft,
 * the white ferrule and the blue tip. `shadow` draws only its silhouette (for the shadow on the cloth).
 */
export const CueSvg = memo(function CueSvg({ len, th, shadow = false }: { len: number; th: number; shadow?: boolean }) {
  const tip = th * 0.42;
  const half = (x: number) => (th - (th - tip) * (x / len)) / 2;
  const c = th / 2;
  const outline = `M0 ${c - half(0) + th * 0.08} Q0 ${c - half(0)} ${th * 0.12} ${c - half(0)} L${len - 1} ${c - half(len)} Q${len} ${c - half(len)} ${len} ${c - half(len) + 1} L${len} ${c + half(len) - 1} Q${len} ${c + half(len)} ${len - 1} ${c + half(len)} L${th * 0.12} ${c + half(0)} Q0 ${c + half(0)} 0 ${c + half(0) - th * 0.08}Z`;
  if (shadow) {
    return (
      <Svg width={len} height={th}>
        <Path d={outline} fill="#000000" />
      </Svg>
    );
  }
  const band = (a: number, b: number, fill: string, key: string) => <Rect key={key} x={a * len} y={0} width={(b - a) * len + 0.4} height={th} fill={fill} />;
  // the forearm's points (dark inlays pointing to the tip)
  const points: string[] = [];
  const f0 = 0.27 * len;
  const f1 = 0.43 * len;
  for (const s of [-1, 1]) points.push(`M${f0} ${c + s * half(f0) * 0.9} L${f1} ${c} L${f0} ${c + s * half(f0) * 0.15}Z`);
  return (
    <Svg width={len} height={th}>
      <Defs>
        <ClipPath id="bcClip">
          <Path d={outline} />
        </ClipPath>
        <LinearGradient id="bcRound" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.35} />
          <Stop offset="0.22" stopColor="#FFFFFF" stopOpacity={0.5} />
          <Stop offset="0.4" stopColor="#FFFFFF" stopOpacity={0.08} />
          <Stop offset="0.75" stopColor="#000000" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.55} />
        </LinearGradient>
        <LinearGradient id="bcShaft" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#D9BB86" />
          <Stop offset="1" stopColor="#F2E2BF" />
        </LinearGradient>
        <LinearGradient id="bcButt" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#2A140A" />
          <Stop offset="1" stopColor="#4A2412" />
        </LinearGradient>
      </Defs>
      <G clipPath="url(#bcClip)">
        {band(0, 0.02, '#0D0D10', 'cap')}
        {band(0.02, 0.24, 'url(#bcButt)', 'butt')}
        {band(0.05, 0.058, '#D6B25E', 'r1')}
        {band(0.215, 0.223, '#D6B25E', 'r2')}
        {band(0.24, 0.27, '#121216', 'wrapEnd')}
        {band(0.27, 0.43, '#8C4A22', 'fore')}
        {points.map((d, i) => (
          <Path key={`pt${i}`} d={d} fill="#1A0F08" />
        ))}
        {band(0.43, 0.445, '#C9CDD2', 'joint')}
        {band(0.445, 0.972, 'url(#bcShaft)', 'shaft')}
        {band(0.972, 0.99, '#F8F6F0', 'ferrule')}
        {band(0.99, 1, '#2F6FD0', 'tip')}
        <Rect x={0} y={0} width={len} height={th} fill="url(#bcRound)" />
      </G>
      <Path d={outline} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={0.6} />
    </Svg>
  );
});
