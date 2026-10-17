/**
 * «المدن والطرق» — the tiles drawn from their feature list (no pictures): green fields, cream roads,
 * sand-coloured walled cities with a blue shield for a pennant, a small monastery building, and a
 * village where three or four roads meet. Everything is drawn in a 0..100 square, then turned.
 * Followers are little figures in the player's colour; farmers lie down.
 */
import type { ReactNode } from 'react';
import { G, Path, Rect, Svg } from 'react-native-svg';

import { TILES, rotatePoint, type CarcaFeature } from '@/shared/carca-tiles';

export const FIELD = '#77B255';
export const FIELD_DARK = '#5E9A43';
const CITY = '#E2BE78';
const WALL = '#8F5E2A';
const ROAD = '#F4EAD2';
const ROAD_EDGE = '#7A6446';
const ROOF = '#C0503C';
const STONE = '#F3EAD8';

/** Follower colours: red, blue, yellow, black, purple. */
export const CARCA_COLORS = [
  { fill: '#E5484D', edge: '#3A0D10', name: 'أحمر' },
  { fill: '#3B82F6', edge: '#0B1F45', name: 'أزرق' },
  { fill: '#FACC15', edge: '#4A3A00', name: 'أصفر' },
  { fill: '#1F2430', edge: '#F7F4EC', name: 'أسود' },
  { fill: '#A855F7', edge: '#2A0B45', name: 'بنفسجي' },
];

export const colorOf = (i: number | undefined) => CARCA_COLORS[(i ?? 0) % CARCA_COLORS.length];

const MID: [number, number][] = [
  [50, 0],
  [100, 50],
  [50, 100],
  [0, 50],
];

const sidesOf = (f: CarcaFeature) => [...new Set(f.ports.map((p) => Math.floor(p / 3)))].sort();

/** A city area: its shape in a canonical orientation, the wall curves, and the turn to apply. */
function cityShape(f: CarcaFeature, hasRoad: boolean): { d: string; wall: string; rot: number } {
  const s = sidesOf(f);
  if (s.length === 4) return { d: 'M0 0 H100 V100 H0 Z', wall: '', rot: 0 };
  if (s.length === 1) return { d: 'M0 0 L100 0 Q50 64 0 0 Z', wall: 'M100 0 Q50 64 0 0', rot: s[0] };
  if (s.length === 3) {
    const missing = [0, 1, 2, 3].find((d) => !s.includes(d))!;
    return { d: 'M0 0 L100 0 L100 100 Q50 40 0 100 Z', wall: 'M100 100 Q50 40 0 100', rot: (missing + 2) % 4 };
  }
  if ((s[1] - s[0]) % 2 === 0) {
    // opposite sides: a band across the tile
    return { d: 'M0 0 Q50 36 100 0 L100 100 Q50 64 0 100 Z', wall: 'M0 0 Q50 36 100 0 M100 100 Q50 64 0 100', rot: s.includes(1) ? 0 : 1 };
  }
  // adjacent sides: the corner between them, canonical north + west
  const a = s.find((d) => s.includes((d + 1) % 4))!;
  const c = hasRoad ? 45 : 62;
  return { d: `M0 0 L100 0 Q${c} ${c} 0 100 Z`, wall: `M100 0 Q${c} ${c} 0 100`, rot: (a + 1) % 4 };
}

function roadPath(f: CarcaFeature): string {
  const s = sidesOf(f);
  const [ax, ay] = MID[s[0]];
  if (s.length === 1) return `M${ax} ${ay} L50 50`;
  const [bx, by] = MID[s[1]];
  if ((s[1] - s[0]) % 2 === 0) return `M${ax} ${ay} L${bx} ${by}`;
  // a bend: pull the curve towards the corner between the two sides
  const cx = 50 + (ax + bx - 100) * 0.4;
  const cy = 50 + (ay + by - 100) * 0.4;
  return `M${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`;
}

/** Where the pennant shield sits on each pennant tile (before turning). */
const PENNANT: Record<string, [number, number]> = { C: [74, 26], F: [22, 50], M: [14, 14], O: [13, 13], Q: [80, 20], S: [80, 20] };

function Shield({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(1.25)`}>
      <Path d="M-7 -8 H7 V0 Q7 7 0 10 Q-7 7 -7 0 Z" fill="#2F6FD0" stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M-4 -3 L0 1 L4 -3" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

function Monastery() {
  return (
    <G>
      <Rect x={33} y={42} width={34} height={26} fill={STONE} stroke={WALL} strokeWidth={2} />
      <Path d="M29 43 L50 27 L71 43 Z" fill={ROOF} stroke="#7E2E22" strokeWidth={2} strokeLinejoin="round" />
      <Rect x={58} y={26} width={9} height={18} fill={STONE} stroke={WALL} strokeWidth={2} />
      <Path d="M56.5 27 L62.5 19 L68.5 27 Z" fill={ROOF} stroke="#7E2E22" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M45 68 V58 Q50 52 55 58 V68 Z" fill="#6B4423" />
    </G>
  );
}

function Village() {
  return (
    <G>
      <Rect x={41} y={44} width={18} height={14} fill={STONE} stroke={WALL} strokeWidth={1.8} />
      <Path d="M38.5 45 L50 36 L61.5 45 Z" fill={ROOF} stroke="#7E2E22" strokeWidth={1.6} strokeLinejoin="round" />
    </G>
  );
}

/** One tile type turned `r` times, in the 0..100 square (buildings and shields stay upright). */
export function TileShapes({ t, r }: { t: string; r: number }) {
  const type = TILES[t];
  const roads = type.feats.filter((f) => f.k === 'road');
  const cities = type.feats.filter((f) => f.k === 'city');
  const pen = type.feats.some((f) => f.pennant) ? PENNANT[t] : undefined;
  const penAt = pen ? rotatePoint(pen, r) : null;
  return (
    <G>
      <Rect x={0} y={0} width={100} height={100} fill={FIELD} />
      <G transform={`rotate(${r * 90} 50 50)`}>
        {roads.map((f, i) => (
          <G key={`r${i}`}>
            <Path d={roadPath(f)} stroke={ROAD_EDGE} strokeWidth={13} fill="none" />
            <Path d={roadPath(f)} stroke={ROAD} strokeWidth={8} fill="none" />
          </G>
        ))}
        {cities.map((f, i) => {
          const c = cityShape(f, roads.length > 0);
          return (
            <G key={`c${i}`} transform={`rotate(${c.rot * 90} 50 50)`}>
              <Path d={c.d} fill={CITY} />
              {c.wall ? <Path d={c.wall} fill="none" stroke={WALL} strokeWidth={4.5} strokeLinecap="round" /> : null}
            </G>
          );
        })}
      </G>
      {penAt ? <Shield x={penAt[0]} y={penAt[1]} /> : null}
      {type.feats.some((f) => f.k === 'monastery') ? <Monastery /> : null}
      {roads.length >= 3 ? <Village /> : null}
      <Rect x={0.5} y={0.5} width={99} height={99} fill="none" stroke={FIELD_DARK} strokeWidth={1} />
    </G>
  );
}

/** A tile turned `r` times, drawn at (x, y) with side `size` inside an <Svg>. */
export function TileAt({ t, r, x, y, size, opacity }: { t: string; r: number; x: number; y: number; size: number; opacity?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${size / 100})`} opacity={opacity}>
      <TileShapes t={t} r={r} />
    </G>
  );
}

const MEEPLE =
  'M0 -12 C3 -12 4.8 -9.6 4.6 -7.2 C4.5 -5.8 3.9 -4.8 3.1 -4.1 L10.4 -1.6 C12.6 -0.8 12.3 2.2 10 2.5 L5.6 3.2 L9 11.2 C9.3 12 8.8 12.6 8 12.6 L3 12.6 L0 7 L-3 12.6 L-8 12.6 C-8.8 12.6 -9.3 12 -9 11.2 L-5.6 3.2 L-10 2.5 C-12.3 2.2 -12.6 -0.8 -10.4 -1.6 L-3.1 -4.1 C-3.9 -4.8 -4.5 -5.8 -4.6 -7.2 C-4.8 -9.6 -3 -12 0 -12 Z';

/** A follower centred on (x, y); `size` is its height. */
export function Meeple({ x, y, size, color, lying, opacity }: { x: number; y: number; size: number; color: number; lying?: boolean; opacity?: number }) {
  const c = colorOf(color);
  return (
    <G transform={`translate(${x} ${y}) scale(${size / 25})${lying ? ' rotate(90)' : ''}`} opacity={opacity}>
      <Path d={MEEPLE} fill={c.fill} stroke={c.edge} strokeWidth={2} strokeLinejoin="round" />
    </G>
  );
}

/** A small standalone follower icon. */
export function MeepleIcon({ color, size = 16 }: { color: number; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-14 -14 28 28">
      <Meeple x={0} y={0} size={25} color={color} />
    </Svg>
  );
}

/** A standalone tile picture. */
export function TileView({ t, r, size, children }: { t: string; r: number; size: number; children?: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <TileShapes t={t} r={r} />
      {children}
    </Svg>
  );
}
