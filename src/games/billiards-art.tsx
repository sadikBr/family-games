/**
 * «البلياردو» — the drawings: a ball (solid, stripe, the 8, the cue ball, with its number disc), the
 * table (walnut rails with mother-of-pearl sights, green cloth with a soft light in the middle, cushions,
 * deep pockets), and the sizes of the table on a phone. All static SVG: the balls move as whole views.
 */
import { memo } from 'react';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, LinearGradient, Text as SvgText } from 'react-native-svg';

import { BALL_COLOR, isStripe } from '@/shared/games/billiards';
import { CORNER_NOSE, FOOT_X, FOOT_Y, HEAD_Y, L, POCKET_DRAW, R, SIDE_HALF, W } from '@/shared/games/billiards-physics';

/** The wooden rail around the cloth, in mm. */
export const RAIL = 62;
export const TABLE_W = W + 2 * RAIL;
export const TABLE_H = L + 2 * RAIL;

/** px per mm for a table `width` px wide. */
export const scaleFor = (width: number) => width / TABLE_W;

const FELT = '#16704F';
const FELT_LIGHT = '#1E8A62';
const FELT_DARK = '#0E5139';
const CUSHION = '#125E43';
const WOOD = '#5B3A22';
const WOOD_DARK = '#3A2414';
const SIGHT = '#EDE6D2';

/** One ball, `size` px wide. */
export const BallSvg = memo(function BallSvg({ id, size, numbers = true }: { id: number; size: number; numbers?: boolean }) {
  const r = size / 2;
  const color = BALL_COLOR[id] ?? '#999';
  const stripe = isStripe(id);
  const base = stripe || id === 0 ? '#F7F3E8' : color;
  const h = r * 0.52;
  const w = Math.sqrt(r * r - h * h);
  const band = `M${r - w} ${r - h} L${r + w} ${r - h} A${r} ${r} 0 0 1 ${r + w} ${r + h} L${r - w} ${r + h} A${r} ${r} 0 0 1 ${r - w} ${r - h}Z`;
  const showNum = numbers && id > 0 && size >= 15;
  const sid = `bs${id}`;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id={sid} cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.32} />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.38} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={base} />
      {stripe ? <Path d={band} fill={color} /> : null}
      {id > 0 && (numbers || stripe || id === 8) ? <Circle cx={r} cy={r} r={r * (showNum ? 0.46 : 0.3)} fill="#FBF8EE" /> : null}
      {showNum ? (
        <SvgText x={r} y={r + r * 0.24} fontSize={r * (id >= 10 ? 0.52 : 0.62)} fontWeight="bold" fill="#17171C" textAnchor="middle">
          {String(id)}
        </SvgText>
      ) : null}
      <Circle cx={r} cy={r} r={r} fill={`url(#${sid})`} />
      <Circle cx={r} cy={r} r={r - 0.4} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
    </Svg>
  );
});

/** The table: rails, sights, cushions, cloth, pockets, the head string and the foot spot. */
export const TableSvg = memo(function TableSvg({ width, kitchen }: { width: number; kitchen: boolean }) {
  const k = scaleFor(width);
  const height = TABLE_H * k;
  const X = (x: number) => (RAIL + x) * k;
  const Y = (y: number) => (RAIL + y) * k;
  const cush = 16; // cushion depth (mm), drawn just inside the rail
  // cushion polygons (each runs between two pockets, cut at an angle at the jaws)
  const cushions: string[] = [];
  const hz = (y: number, inward: number) => {
    const a = CORNER_NOSE;
    const b = W - CORNER_NOSE;
    const yo = y - inward * cush;
    cushions.push(`M${X(a)} ${Y(y)} L${X(b)} ${Y(y)} L${X(b + cush)} ${Y(yo)} L${X(a - cush)} ${Y(yo)}Z`);
  };
  const vt = (x: number, inward: number, a: number, b: number, angledA: number, angledB: number) => {
    const xo = x - inward * cush;
    cushions.push(`M${X(x)} ${Y(a)} L${X(x)} ${Y(b)} L${X(xo)} ${Y(b + angledB)} L${X(xo)} ${Y(a - angledA)}Z`);
  };
  hz(0, 1);
  hz(L, -1);
  vt(0, 1, CORNER_NOSE, L / 2 - SIDE_HALF, cush, -cush * 0.4);
  vt(0, 1, L / 2 + SIDE_HALF, L - CORNER_NOSE, -cush * 0.4, cush);
  vt(W, -1, CORNER_NOSE, L / 2 - SIDE_HALF, cush, -cush * 0.4);
  vt(W, -1, L / 2 + SIDE_HALF, L - CORNER_NOSE, -cush * 0.4, cush);
  const sights: { x: number; y: number }[] = [];
  for (const f of [0.25, 0.5, 0.75]) {
    sights.push({ x: X(W * f), y: (RAIL / 2) * k }, { x: X(W * f), y: height - (RAIL / 2) * k });
  }
  for (const f of [1, 2, 3, 5, 6, 7]) {
    sights.push({ x: (RAIL / 2) * k, y: Y((L * f) / 8) }, { x: width - (RAIL / 2) * k, y: Y((L * f) / 8) });
  }
  const sz = Math.max(2.2, 9 * k);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="bwood" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6E4628" />
          <Stop offset="0.5" stopColor={WOOD} />
          <Stop offset="1" stopColor={WOOD_DARK} />
        </LinearGradient>
        <RadialGradient id="bfelt" cx="50%" cy="50%" rx="70%" ry="55%">
          <Stop offset="0" stopColor={FELT_LIGHT} />
          <Stop offset="0.6" stopColor={FELT} />
          <Stop offset="1" stopColor={FELT_DARK} />
        </RadialGradient>
        <RadialGradient id="bpocket" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" />
          <Stop offset="0.7" stopColor="#0B0B0D" />
          <Stop offset="1" stopColor="#2A2A2E" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} rx={RAIL * 0.55 * k} fill="url(#bwood)" />
      <Rect x={1} y={1} width={width - 2} height={height - 2} rx={RAIL * 0.55 * k} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <Rect x={X(-cush)} y={Y(-cush)} width={(W + 2 * cush) * k} height={(L + 2 * cush) * k} fill={CUSHION} />
      <Rect x={X(0)} y={Y(0)} width={W * k} height={L * k} fill="url(#bfelt)" />
      {cushions.map((d, i) => (
        <Path key={i} d={d} fill={CUSHION} stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />
      ))}
      {kitchen ? <Rect x={X(0)} y={Y(HEAD_Y)} width={W * k} height={(L - HEAD_Y) * k} fill="rgba(255,255,255,0.07)" /> : null}
      <Line x1={X(0)} y1={Y(HEAD_Y)} x2={X(W)} y2={Y(HEAD_Y)} stroke="rgba(255,255,255,0.16)" strokeWidth={1} strokeDasharray={kitchen ? '5 4' : undefined} />
      <Circle cx={X(FOOT_X)} cy={Y(FOOT_Y)} r={Math.max(1.4, 6 * k)} fill="rgba(255,255,255,0.3)" />
      {POCKET_DRAW.map((p, i) => (
        <G key={i}>
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k + 1.5} fill="#1C140D" />
          <Circle cx={X(p.x)} cy={Y(p.y)} r={p.r * k} fill="url(#bpocket)" />
        </G>
      ))}
      {sights.map((s, i) => (
        <Path key={`s${i}`} d={`M${s.x} ${s.y - sz} L${s.x + sz * 0.6} ${s.y} L${s.x} ${s.y + sz} L${s.x - sz * 0.6} ${s.y}Z`} fill={SIGHT} opacity={0.9} />
      ))}
    </Svg>
  );
});

/** A ball's px size on a table `width` px wide. */
export const ballPx = (width: number) => 2 * R * scaleFor(width);
