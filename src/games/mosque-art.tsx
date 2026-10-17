/**
 * «ابنِ المسجد» — the mosque as it grows: a Moroccan-style prayer hall with horseshoe arches and a
 * zellige wainscot, a green dome, a square minaret with its golden finial, and a courtyard fountain.
 * Pieces not built yet are drawn as faint dashed outlines; a piece finished at this reveal fades in.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

const W = 320;
const H = 230;

const PLASTER = '#F1E4C8';
const PLASTER_DARK = '#E2D0A8';
const STONE = '#BDA88A';
const STONE_DARK = '#9C8668';
const GREEN = '#2E8B57';
const GREEN_DARK = '#1F6B42';
const GOLD = '#E8B83A';
const WOOD = '#8A5A2B';
const WOOD_DARK = '#5E3B1A';
const ARCH_IN = '#5A3E2B';
const ZELLIGE = ['#2E8B57', '#2E5FA8', '#F8F4EA', '#E8B83A', '#C0392B'];

const GHOST = { fill: 'none', stroke: 'rgba(255,255,255,0.32)', strokeWidth: 1.5, strokeDasharray: '4 4' } as const;

const horseshoe = (x: number, half: number, top: number, bottom: number) => `M${x - half} ${bottom} L${x - half} ${top} A ${half + 2} ${half + 2} 0 1 1 ${x + half} ${top} L${x + half} ${bottom} Z`;
const ARCHES = [46, 76, 170, 200];

function merlons(x0: number, x1: number, y: number, step = 12, w = 7, h = 7) {
  const out: ReactNode[] = [];
  for (let x = x0 + 2; x + w <= x1; x += step) out.push(<Path key={x} d={`M${x} ${y} L${x} ${y - h + 3} L${x + w / 2} ${y - h} L${x + w} ${y - h + 3} L${x + w} ${y} Z`} fill={PLASTER} />);
  return out;
}

/** Each piece, solid or as a ghost outline. */
const PIECES: ((solid: boolean) => ReactNode)[] = [
  // 0 الأساس
  (solid) =>
    solid ? (
      <G>
        <Rect x={16} y={200} width={288} height={14} fill={STONE} />
        {[40, 80, 120, 160, 200, 240, 280].map((x, i) => (
          <Line key={x} x1={x + (i % 2) * 10} y1={200} x2={x + (i % 2) * 10} y2={214} stroke={STONE_DARK} strokeWidth={1.2} />
        ))}
        <Line x1={16} y1={207} x2={304} y2={207} stroke={STONE_DARK} strokeWidth={1} />
      </G>
    ) : (
      <Rect x={16} y={200} width={288} height={14} {...GHOST} />
    ),
  // 1 الجدران
  (solid) =>
    solid ? (
      <G>
        <Rect x={218} y={160} width={82} height={40} fill={PLASTER_DARK} />
        {merlons(218, 300, 160, 11, 6, 6)}
        <Rect x={28} y={118} width={190} height={82} fill={PLASTER} />
        <Rect x={28} y={118} width={190} height={5} fill={GREEN} />
        {merlons(28, 218, 118)}
      </G>
    ) : (
      <G>
        <Rect x={28} y={112} width={190} height={88} {...GHOST} />
        <Rect x={218} y={156} width={82} height={44} {...GHOST} />
      </G>
    ),
  // 2 الصحن والزليج
  (solid) =>
    solid ? (
      <G>
        <Rect x={28} y={184} width={190} height={14} fill="#E9DDC3" />
        {Array.from({ length: 23 }, (_, i) => {
          const x = 33 + i * 8;
          return <Polygon key={i} points={`${x},185 ${x + 4},191 ${x},197 ${x - 4},191`} fill={ZELLIGE[i % ZELLIGE.length]} />;
        })}
        <Rect x={218} y={188} width={82} height={12} fill="#F3EBDA" />
        {Array.from({ length: 10 }, (_, i) => (
          <Rect key={i} x={220 + i * 8} y={190 + (i % 2) * 4} width={6} height={4} fill={ZELLIGE[(i + 1) % 4]} />
        ))}
      </G>
    ) : (
      <G>
        <Rect x={28} y={184} width={190} height={14} {...GHOST} />
        <Rect x={218} y={188} width={82} height={12} {...GHOST} />
      </G>
    ),
  // 3 الأقواس
  (solid) => (
    <G>
      {ARCHES.map((x) => (solid ? <Path key={x} d={horseshoe(x, 10, 160, 184)} fill={ARCH_IN} stroke={GREEN} strokeWidth={2} /> : <Path key={x} d={horseshoe(x, 10, 160, 184)} {...GHOST} />))}
      {solid ? <Path d={horseshoe(240, 8, 176, 188)} fill={ARCH_IN} stroke={GREEN} strokeWidth={1.5} /> : <Path d={horseshoe(240, 8, 176, 188)} {...GHOST} />}
    </G>
  ),
  // 4 المحراب
  (solid) =>
    solid ? (
      <G>
        <Rect x={101} y={132} width={38} height={52} fill="#E9DDC3" stroke={GOLD} strokeWidth={2} />
        <Path d={horseshoe(120, 13, 158, 184)} fill={GREEN_DARK} stroke={GOLD} strokeWidth={2.5} />
        <Path d={horseshoe(120, 8, 162, 184)} fill="none" stroke={GOLD} strokeWidth={1} opacity={0.8} />
        <Circle cx={120} cy={138} r={2.5} fill={GOLD} />
      </G>
    ) : (
      <Path d={horseshoe(120, 13, 158, 184)} {...GHOST} />
    ),
  // 5 المنبر
  (solid) =>
    solid ? (
      <G>
        <Polygon points="141,184 141,178 145,178 145,172 149,172 149,166 153,166 153,154 157,154 157,184" fill={WOOD} stroke={WOOD_DARK} strokeWidth={1} />
        <Path d="M152 154 Q 155 147 158 154 Z" fill={WOOD_DARK} />
        <Line x1={143} y1={182} x2={155} y2={160} stroke={WOOD_DARK} strokeWidth={0.8} />
      </G>
    ) : (
      <Polygon points="141,184 141,178 145,178 145,172 149,172 149,166 153,166 153,154 157,154 157,184" {...GHOST} />
    ),
  // 6 القبة
  (solid) =>
    solid ? (
      <G>
        <Rect x={100} y={102} width={40} height={14} fill={PLASTER_DARK} />
        {[106, 114, 122, 130].map((x) => (
          <Path key={x} d={horseshoe(x + 2, 2, 109, 115)} fill={ARCH_IN} />
        ))}
        <Path d="M98 102 A 22 22 0 0 1 142 102 Z" fill={GREEN} />
        <Path d="M108 102 Q 110 88 120 80 M132 102 Q 130 88 120 80 M120 80 L120 102" stroke={GREEN_DARK} strokeWidth={1.2} fill="none" />
        <Line x1={120} y1={80} x2={120} y2={70} stroke={GOLD} strokeWidth={1.5} />
        <Circle cx={120} cy={73} r={3} fill={GOLD} />
      </G>
    ) : (
      <Path d="M98 116 L98 102 A 22 22 0 0 1 142 102 L142 116 Z" {...GHOST} />
    ),
  // 7 الصومعة
  (solid) =>
    solid ? (
      <G>
        <Rect x={262} y={50} width={32} height={110} fill={PLASTER} />
        <Rect x={262} y={56} width={32} height={6} fill={GREEN} />
        <G opacity={0.85}>
          <Rect x={267} y={70} width={22} height={34} fill="none" stroke={STONE_DARK} strokeWidth={1} />
          {[0, 1, 2].map((k) => (
            <Polygon key={k} points={`${278},${72 + k * 11} ${287},${78 + k * 11} ${278},${84 + k * 11} ${269},${78 + k * 11}`} fill="none" stroke={GREEN} strokeWidth={1.2} />
          ))}
        </G>
        <Path d={horseshoe(278, 4, 118, 130)} fill={ARCH_IN} />
        <Path d={horseshoe(278, 4, 140, 152)} fill={ARCH_IN} />
        {merlons(262, 294, 50, 8, 5, 6)}
        <Rect x={270} y={30} width={16} height={20} fill={PLASTER_DARK} />
        <Rect x={270} y={34} width={16} height={3} fill={GREEN} />
        <Path d="M268 30 L278 22 L288 30 Z" fill={GREEN} />
        <Line x1={278} y1={22} x2={278} y2={6} stroke={GOLD} strokeWidth={1.5} />
        <Circle cx={278} cy={19} r={3.5} fill={GOLD} />
        <Circle cx={278} cy={13} r={2.8} fill={GOLD} />
        <Circle cx={278} cy={8} r={2.2} fill={GOLD} />
      </G>
    ) : (
      <G>
        <Rect x={262} y={50} width={32} height={110} {...GHOST} />
        <Rect x={270} y={28} width={16} height={22} {...GHOST} />
      </G>
    ),
  // 8 النافورة
  (solid) =>
    solid ? (
      <G>
        <Ellipse cx={262} cy={194} rx={18} ry={5} fill="#2E5FA8" stroke="#F8F4EA" strokeWidth={1.5} />
        <Ellipse cx={262} cy={193} rx={13} ry={3} fill="#8FD3F4" />
        <Rect x={259} y={178} width={6} height={14} fill={PLASTER_DARK} />
        <Ellipse cx={262} cy={178} rx={8} ry={2.5} fill="#2E5FA8" />
        <Path d="M262 176 Q 262 166 262 168 M262 170 Q 252 168 249 188 M262 170 Q 272 168 275 188" stroke="#8FD3F4" strokeWidth={1.8} fill="none" />
      </G>
    ) : (
      <Ellipse cx={262} cy={192} rx={18} ry={6} {...GHOST} />
    ),
];

/** Painting order (back to front), by piece index. */
const ORDER = [0, 7, 1, 6, 2, 3, 4, 5, 8];

function Scene({ built, fresh, width, height }: { built: number; fresh: number[]; width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="mosque-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#24285C" />
          <Stop offset="1" stopColor="#E9A86B" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#mosque-sky)" />
      <Path d="M0 196 L50 176 L100 190 L170 172 L240 188 L320 174 L320 214 L0 214 Z" fill="#B57E5B" opacity={0.35} />
      <Rect x={0} y={212} width={W} height={18} fill="#D9B98C" />
      {ORDER.map((i) => (
        <G key={i}>{PIECES[i](i < built && !fresh.includes(i))}</G>
      ))}
    </Svg>
  );
}

/** Just the pieces finished at this reveal, drawn solid, for the fade-in on top of the scene. */
function Fresh({ fresh, width, height }: { fresh: number[]; width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
      {ORDER.filter((i) => fresh.includes(i)).map((i) => (
        <G key={i}>{PIECES[i](true)}</G>
      ))}
    </Svg>
  );
}

export function MosqueArt({ built, fresh = [], width }: { built: number; fresh?: number[]; width: number }) {
  const height = Math.round((width * H) / W);
  return (
    <View style={{ width, height, borderRadius: 18, overflow: 'hidden', alignSelf: 'center' }}>
      <Scene built={built} fresh={fresh} width={width} height={height} />
      {fresh.length ? (
        <Animated.View key={fresh.join(',')} entering={FadeIn.duration(1400).delay(250)} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
          <Fresh fresh={fresh} width={width} height={height} />
        </Animated.View>
      ) : null}
    </View>
  );
}

