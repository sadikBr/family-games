/**
 * «المستوطنون» — hand-drawn art (react-native-svg): resource glyphs, terrain, number tokens, harbours,
 * settlements, cities, roads and the robber. Glyphs are drawn in a 24×24 box.
 */
import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import type { CatanHexType, CatanRes } from '@/shared/games/catan';

/** Seat colours: red, blue, white, black (each with an outline that stands out on every terrain). */
export const SEAT_COLORS = ['#E0374A', '#2E6BE6', '#F5F1E6', '#2A2733'] as const;
export const SEAT_OUTLINE = ['#3A0D14', '#0D1F4A', '#3B3428', '#EDE6D2'] as const;
export const SEAT_NAMES = ['الأحمر', 'الأزرق', 'الأبيض', 'الأسود'] as const;

export const TERRAIN: Record<CatanHexType, { fill: string; dark: string }> = {
  wood: { fill: '#3E8E41', dark: '#1F5E26' },
  sheep: { fill: '#A2CF5E', dark: '#5E8C2A' },
  grain: { fill: '#EBC34F', dark: '#A9801A' },
  brick: { fill: '#CB6A3E', dark: '#7E3618' },
  ore: { fill: '#9DA3AE', dark: '#575C68' },
  desert: { fill: '#E9D7A4', dark: '#B39B5E' },
};

export const RES_COLOR: Record<CatanRes, string> = {
  wood: '#2F7A33',
  brick: '#C0532B',
  sheep: '#8DBF45',
  grain: '#E2B32E',
  ore: '#7E8592',
};

/** A glyph drawn in a 24×24 box (place it with a transform). */
export function Glyph({ k, mono }: { k: CatanHexType; mono?: string }) {
  switch (k) {
    case 'wood':
      return (
        <G>
          <Rect x={10.5} y={16} width={3} height={6} fill={mono ?? '#6B4423'} />
          <Polygon points="12,6 3.5,17 20.5,17" fill={mono ?? '#256B2A'} />
          <Polygon points="12,1.5 5.5,11 18.5,11" fill={mono ?? '#2F8A35'} />
        </G>
      );
    case 'brick':
      return (
        <G stroke={mono ? undefined : '#6E2810'} strokeWidth={1}>
          <Rect x={1.5} y={15} width={10} height={5.5} rx={1} fill={mono ?? '#C0532B'} />
          <Rect x={12.5} y={15} width={10} height={5.5} rx={1} fill={mono ?? '#B4481F'} />
          <Rect x={7} y={8.5} width={10} height={5.5} rx={1} fill={mono ?? '#CF6438'} />
          <Rect x={4} y={2} width={10} height={5.5} rx={1} fill={mono ?? '#B4481F'} opacity={0.9} />
        </G>
      );
    case 'sheep':
      return (
        <G>
          <Line x1={8} y1={17} x2={8} y2={22} stroke={mono ?? '#3A3036'} strokeWidth={1.6} />
          <Line x1={14} y1={17} x2={14} y2={22} stroke={mono ?? '#3A3036'} strokeWidth={1.6} />
          <G fill={mono ?? '#F7F4EA'}>
            <Circle cx={7} cy={12} r={4.3} />
            <Circle cx={11.5} cy={10} r={4.6} />
            <Circle cx={10.5} cy={14.5} r={4.3} />
            <Circle cx={15} cy={13} r={4} />
            <Circle cx={5} cy={15} r={3} />
          </G>
          <Ellipse cx={19.3} cy={10.5} rx={2.6} ry={3.2} fill={mono ?? '#3A3036'} />
        </G>
      );
    case 'grain':
      return (
        <G>
          <Line x1={12} y1={23} x2={12} y2={5} stroke={mono ?? '#9C6F0E'} strokeWidth={1.3} />
          <G fill={mono ?? '#F0C13A'} stroke={mono ? undefined : '#9C6F0E'} strokeWidth={0.6}>
            {[6, 10, 14, 18].map((y) => (
              <G key={y}>
                <Ellipse cx={9.6} cy={y} rx={1.7} ry={2.9} transform={`rotate(-30 9.6 ${y})`} />
                <Ellipse cx={14.4} cy={y} rx={1.7} ry={2.9} transform={`rotate(30 14.4 ${y})`} />
              </G>
            ))}
            <Ellipse cx={12} cy={3} rx={1.6} ry={2.6} />
          </G>
        </G>
      );
    case 'ore':
      return (
        <G>
          <Polygon points="1.5,21 7,10 10.5,13.5 15,4 22.5,21" fill={mono ?? '#858B97'} stroke={mono ? undefined : '#4E525C'} strokeWidth={0.8} />
          <Polygon points="15,4 18,10.5 13.6,12" fill={mono ? 'rgba(255,255,255,0.35)' : '#C4C8D0'} />
          <Polygon points="7,10 8.6,13.4 6,14" fill={mono ? 'rgba(255,255,255,0.35)' : '#C4C8D0'} />
          <Polygon points="9,21 11.5,16.5 15,21" fill={mono ?? '#5F6470'} />
        </G>
      );
    case 'desert':
      return (
        <G>
          <Path d="M1 19 Q7 13 13 18 T23 17 L23 22 L1 22 Z" fill={mono ?? '#D8BF7C'} />
          <Rect x={10.6} y={5} width={2.8} height={14} rx={1.4} fill={mono ?? '#5E8C3A'} />
          <Path d="M10.8 12 H7.6 V8.5" stroke={mono ?? '#5E8C3A'} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path d="M13.2 10 H16.4 V6.8" stroke={mono ?? '#5E8C3A'} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </G>
      );
  }
}

/** A glyph at (cx, cy) with the given size (px), inside an existing <Svg>. */
export function GlyphAt({ k, cx, cy, size, mono }: { k: CatanHexType; cx: number; cy: number; size: number; mono?: string }) {
  const s = size / 24;
  return (
    <G transform={`translate(${cx - size / 2}, ${cy - size / 2}) scale(${s})`}>
      <Glyph k={k} mono={mono} />
    </G>
  );
}

/** A standalone resource icon. */
export function ResIcon({ r, size = 24 }: { r: CatanRes; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Glyph k={r} />
    </Svg>
  );
}

/** Settlement (a house) or city (a house with a tower) centred on (cx, cy); u = hex radius in px. */
export function Building({ cx, cy, u, color, outline, city, opacity = 1 }: { cx: number; cy: number; u: number; color: string; outline: string; city: boolean; opacity?: number }) {
  const pts = city
    ? [[-0.4, 0.25], [-0.4, -0.08], [-0.21, -0.3], [-0.02, -0.08], [-0.02, -0.02], [0.4, -0.02], [0.4, 0.25]]
    : [[-0.25, 0.22], [-0.25, -0.04], [0, -0.28], [0.25, -0.04], [0.25, 0.22]];
  const p = pts.map(([x, y]) => `${cx + x * u},${cy + y * u}`).join(' ');
  return (
    <G opacity={opacity}>
      <Polygon points={p} fill={color} stroke={outline} strokeWidth={Math.max(1.2, u * 0.065)} strokeLinejoin="round" />
      {city ? <Rect x={cx + 0.12 * u} y={cy + 0.06 * u} width={0.12 * u} height={0.12 * u} fill={outline} opacity={0.55} /> : <Rect x={cx - 0.06 * u} y={cy + 0.04 * u} width={0.12 * u} height={0.18 * u} fill={outline} opacity={0.5} />}
    </G>
  );
}

/** A road from (x1, y1) to (x2, y2), shortened at both ends. */
export function Road({ x1, y1, x2, y2, u, color, outline, opacity = 1, dashed }: { x1: number; y1: number; x2: number; y2: number; u: number; color: string; outline: string; opacity?: number; dashed?: boolean }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = Math.hypot(dx, dy);
  const cut = 0.2 * u;
  const a = { x: x1 + (dx / l) * cut, y: y1 + (dy / l) * cut };
  const b = { x: x2 - (dx / l) * cut, y: y2 - (dy / l) * cut };
  return (
    <G opacity={opacity}>
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={outline} strokeWidth={u * 0.26} strokeLinecap="round" strokeDasharray={dashed ? `${u * 0.12} ${u * 0.12}` : undefined} />
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={u * 0.16} strokeLinecap="round" />
    </G>
  );
}

/** The robber: a hooded grey figure. */
export function Robber({ cx, cy, u }: { cx: number; cy: number; u: number }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy + 0.3 * u} rx={0.22 * u} ry={0.07 * u} fill="rgba(0,0,0,0.35)" />
      <Path
        d={`M ${cx - 0.2 * u} ${cy + 0.3 * u} Q ${cx - 0.2 * u} ${cy - 0.02 * u} ${cx - 0.1 * u} ${cy - 0.1 * u} L ${cx + 0.1 * u} ${cy - 0.1 * u} Q ${cx + 0.2 * u} ${cy - 0.02 * u} ${cx + 0.2 * u} ${cy + 0.3 * u} Z`}
        fill="#4A4552"
        stroke="#F0EBDD"
        strokeWidth={Math.max(1, u * 0.04)}
      />
      <Circle cx={cx} cy={cy - 0.2 * u} r={0.13 * u} fill="#4A4552" stroke="#F0EBDD" strokeWidth={Math.max(1, u * 0.04)} />
    </G>
  );
}

/** Small UI glyphs (24×24): a shield for knights, a road piece, a card back. */
export function MiniIcon({ k, size = 14, color = '#F7F4EC' }: { k: 'knight' | 'road' | 'card' | 'dev' | 'army'; size?: number; color?: string }) {
  let body: ReactNode = null;
  switch (k) {
    case 'knight':
    case 'army':
      body = <Path d="M12 2 L20.5 5.5 V11.5 C20.5 16.5 16.8 20.4 12 22 C7.2 20.4 3.5 16.5 3.5 11.5 V5.5 Z" fill={k === 'army' ? color : 'none'} stroke={color} strokeWidth={2.2} strokeLinejoin="round" />;
      break;
    case 'road':
      body = (
        <G>
          <Rect x={2} y={8} width={20} height={8} rx={2.5} fill={color} transform="rotate(-25 12 12)" />
        </G>
      );
      break;
    case 'card':
      body = <Rect x={5} y={2.5} width={14} height={19} rx={2.5} fill="none" stroke={color} strokeWidth={2.2} />;
      break;
    case 'dev':
      body = (
        <G>
          <Rect x={5} y={2.5} width={14} height={19} rx={2.5} fill="none" stroke={color} strokeWidth={2.2} />
          <Circle cx={12} cy={12} r={3} fill={color} />
        </G>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
