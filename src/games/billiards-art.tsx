/**
 * «البلياردو» — the drawings: the table (raised walnut rails with a lit bevel and grain, chrome plates at
 * the pockets, mother-of-pearl sights, cushions sloping down to the cloth, cloth lit by a lamp above with
 * a fine weave, deep pockets with a leather rim) and the cue stick (tapered, turned wood, rings, ferrule,
 * tip). All static SVG; the balls are in billiards-ball.tsx.
 */
import { memo } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { CORNER_NOSE, FOOT_X, FOOT_Y, HEAD_Y, L, POCKET_DRAW, SIDE_HALF, W } from '@/shared/games/billiards-physics';

/** The rail around the cloth (wood + cushion), in mm. */
export const RAIL = 72;
/** The cushion's width, inside the rail. */
const CUSH = 24;
export const TABLE_W = W + 2 * RAIL;
export const TABLE_H = L + 2 * RAIL;

/** px per mm for a table `width` px wide. */
export const scaleFor = (width: number) => width / TABLE_W;

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

/** The table: rails, plates, sights, cushions, cloth, pockets, the head string and the foot spot. */
export const TableSvg = memo(function TableSvg({ width, kitchen }: { width: number; kitchen: boolean }) {
  const k = scaleFor(width);
  const height = TABLE_H * k;
  const X = (x: number) => (RAIL + x) * k;
  const Y = (y: number) => (RAIL + y) * k;
  const wood = (RAIL - CUSH) * k; // the wood's width (px)
  const corner = 26 * k;
  // cushions (each runs between two pockets, cut at an angle at the jaws), with their gradient's line
  const cushions: { d: string; g: [number, number, number, number] }[] = [];
  const hz = (y: number, inward: number) => {
    const a = CORNER_NOSE;
    const b = W - CORNER_NOSE;
    const yo = y - inward * CUSH;
    cushions.push({ d: `M${X(a)} ${Y(y)} L${X(b)} ${Y(y)} L${X(b + CUSH)} ${Y(yo)} L${X(a - CUSH)} ${Y(yo)}Z`, g: [0, Y(yo), 0, Y(y)] });
  };
  const vt = (x: number, inward: number, a: number, b: number, angledA: number, angledB: number) => {
    const xo = x - inward * CUSH;
    cushions.push({ d: `M${X(x)} ${Y(a)} L${X(x)} ${Y(b)} L${X(xo)} ${Y(b + angledB)} L${X(xo)} ${Y(a - angledA)}Z`, g: [X(xo), 0, X(x), 0] });
  };
  hz(0, 1);
  hz(L, -1);
  vt(0, 1, CORNER_NOSE, L / 2 - SIDE_HALF, CUSH, -CUSH * 0.45);
  vt(0, 1, L / 2 + SIDE_HALF, L - CORNER_NOSE, -CUSH * 0.45, CUSH);
  vt(W, -1, CORNER_NOSE, L / 2 - SIDE_HALF, CUSH, -CUSH * 0.45);
  vt(W, -1, L / 2 + SIDE_HALF, L - CORNER_NOSE, -CUSH * 0.45, CUSH);
  // the sights, on the middle of the wood
  const mid = wood / 2 + 1;
  const sights: { x: number; y: number }[] = [];
  for (const f of [0.25, 0.5, 0.75]) sights.push({ x: X(W * f), y: mid }, { x: X(W * f), y: height - mid });
  for (const f of [1, 2, 3, 5, 6, 7]) sights.push({ x: mid, y: Y((L * f) / 8) }, { x: width - mid, y: Y((L * f) / 8) });
  const sz = Math.max(2.4, 9 * k);
  const tile = 37;
  const specks = weave(tile);
  const grains = [...grain(width, 2, wood, 3, true), ...grain(width, height - wood, height - 2, 5, true)];
  const vgrains = [...grain(height, 2, wood, 11, false), ...grain(height, width - wood, width - 2, 13, false)];
  const shadowIn = 30 * k; // the cushions' shadow on the cloth
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="btWood" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9A6036" />
          <Stop offset="0.45" stopColor="#7A4523" />
          <Stop offset="1" stopColor="#4E2912" />
        </LinearGradient>
        <LinearGradient id="btBevel" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE2B8" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#FFE2B8" stopOpacity={0.12} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.35} />
        </LinearGradient>
        <RadialGradient id="btFelt" cx="50%" cy="48%" rx="62%" ry="56%" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor="#34AC72" />
          <Stop offset="0.5" stopColor="#228A5A" />
          <Stop offset="1" stopColor="#0F5638" />
        </RadialGradient>
        <Pattern id="btWeave" patternUnits="userSpaceOnUse" width={tile} height={tile}>
          {specks.map((s, i) => (
            <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.w} fill={s.light ? '#FFFFFF' : '#000000'} opacity={s.o} />
          ))}
        </Pattern>
        <LinearGradient id="btChrome" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D9DDE2" />
          <Stop offset="0.3" stopColor="#9AA1A9" />
          <Stop offset="0.55" stopColor="#5E646C" />
          <Stop offset="0.78" stopColor="#A8AEB5" />
          <Stop offset="1" stopColor="#5B6168" />
        </LinearGradient>
        <RadialGradient id="btHole" cx="50%" cy="50%" r="50%" fx="40%" fy="38%">
          <Stop offset="0" stopColor="#000000" />
          <Stop offset="0.62" stopColor="#040404" />
          <Stop offset="0.9" stopColor="#1A1A1C" />
          <Stop offset="1" stopColor="#2E2E31" />
        </RadialGradient>
        <LinearGradient id="btHoleRim" x1="0.15" y1="0.1" x2="0.85" y2="0.9">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.05} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.4} />
        </LinearGradient>
        <LinearGradient id="btSight" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.6" stopColor="#E7E0CF" />
          <Stop offset="1" stopColor="#B9AF98" />
        </LinearGradient>
        {cushions.map((c, i) => (
          <LinearGradient key={i} id={`btCush${i}`} gradientUnits="userSpaceOnUse" x1={c.g[0]} y1={c.g[1]} x2={c.g[2]} y2={c.g[3]}>
            <Stop offset="0" stopColor="#0E4F33" />
            <Stop offset="0.25" stopColor="#1A7A4E" />
            <Stop offset="0.8" stopColor="#23935F" />
            <Stop offset="0.93" stopColor="#3DB37C" />
            <Stop offset="1" stopColor="#14603F" />
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
      {kitchen ? <Rect x={X(0)} y={Y(HEAD_Y)} width={W * k} height={(L - HEAD_Y) * k} fill="rgba(255,255,255,0.07)" /> : null}
      <Line x1={X(0)} y1={Y(HEAD_Y)} x2={X(W)} y2={Y(HEAD_Y)} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray={kitchen ? '5 4' : undefined} />
      <Circle cx={X(FOOT_X)} cy={Y(FOOT_Y)} r={Math.max(1.4, 6 * k)} fill="rgba(255,255,255,0.32)" />

      {/* the cushions: lit on top, a bright nose, a dark line where they meet the cloth */}
      {cushions.map((c, i) => (
        <Path key={`c${i}`} d={c.d} fill={`url(#btCush${i})`} />
      ))}

      {/* chrome plates at the pockets, then the holes with their leather rim */}
      <G clipPath="url(#btClip)">
        {POCKET_DRAW.map((p, i) => {
          const corner = i !== 2 && i !== 3;
          const r = (p.r + (corner ? 26 : 18)) * k;
          return (
            <G key={`pl${i}`}>
              <Circle cx={X(p.x) + 0.8} cy={Y(p.y) + 1.2} r={r} fill="rgba(0,0,0,0.45)" />
              <Circle cx={X(p.x)} cy={Y(p.y)} r={r} fill="url(#btChrome)" />
              <Circle cx={X(p.x)} cy={Y(p.y)} r={r - 0.5} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.7} />
              <Circle cx={X(p.x)} cy={Y(p.y)} r={r} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={0.6} />
            </G>
          );
        })}
      </G>
      {POCKET_DRAW.map((p, i) => (
        <G key={`p${i}`}>
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k + Math.max(1.5, 7 * k)} fill="#17100B" />
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k} fill="url(#btHole)" />
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k - 0.7} fill="none" stroke="url(#btHoleRim)" strokeWidth={1.3} />
        </G>
      ))}

      {sights.map((s, i) => (
        <Path key={`s${i}`} d={`M${s.x} ${s.y - sz} L${s.x + sz * 0.62} ${s.y} L${s.x} ${s.y + sz} L${s.x - sz * 0.62} ${s.y}Z`} fill="url(#btSight)" stroke="rgba(40,20,8,0.55)" strokeWidth={0.6} />
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
