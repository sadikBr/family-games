/**
 * «القنبلة» — the cards, drawn with react-native-svg (our own design, no emoji): every card has its colour, a
 * header with its name, a picture in a soft panel, and its one-line effect at the bottom (names and effects are
 * text over the card, in the app's fonts):
 *  - «القنبلة»: a round dark bomb with a lit fuse and a mischievous grin;
 *  - «المفكّك»: red-handled wire cutters snipping a wire;
 *  - «لا!»: a raised white palm on an octagon;
 *  - «تخطٍّ»: an arrow hopping over a card; «هجوم»: two chevrons (two turns!) with a burst;
 *  - «نظرة»: an eye over three small cards; «خلط»: two crossing arrows; «طلب»: an open palm under a card with a heart;
 *  - the five kitchen characters for pairs: a laughing tajine, a dancing teapot, a sleepy ladle, a surprised sieve
 *    and a flying loaf of bread (each with a small «×2» badge: they are played two by two).
 * The back is a deep indigo card with a spark in a ring.
 */
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { CARD_INFO, isPairKind, type BombKind } from '@/shared/games/bomb';
import { F, alpha, shade } from '@/theme';
import { Txt } from '@/ui/txt';

export const CARD_RATIO = 1.4;
export const CREAM = '#FFF6E4';
export const INDIGO = '#2B2766';
export const SPARK = '#FFC93C';
const INK = '#2A1E2E';
const SKIN = '#F0C39A';

/** A star with `n` points centred at cx, cy. */
function starPath(cx: number, cy: number, r: number, n = 8, inner = 0.45) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** Two eyes and a mouth: the kitchen characters' faces. */
function Face({ x = 50, y = 60, gap = 9, eyes = 'open', mouth = 'smile', s = 1 }: { x?: number; y?: number; gap?: number; eyes?: 'open' | 'happy' | 'sleepy' | 'wide'; mouth?: 'smile' | 'laugh' | 'o' | 'small'; s?: number }) {
  const ex = gap * s;
  const eye = (cx: number) => {
    if (eyes === 'happy') return <Path key={cx} d={`M${cx - 3.5 * s} ${y + 1} Q${cx} ${y - 4 * s} ${cx + 3.5 * s} ${y + 1}`} stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />;
    if (eyes === 'sleepy') return <Path key={cx} d={`M${cx - 3.5 * s} ${y - 1} Q${cx} ${y + 3 * s} ${cx + 3.5 * s} ${y - 1}`} stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />;
    if (eyes === 'wide')
      return (
        <G key={cx}>
          <Circle cx={cx} cy={y} r={5 * s} fill="#FFFFFF" stroke={INK} strokeWidth={1.4} />
          <Circle cx={cx} cy={y + 0.5} r={2.3 * s} fill={INK} />
        </G>
      );
    return (
      <G key={cx}>
        <Circle cx={cx} cy={y} r={2.6 * s} fill={INK} />
        <Circle cx={cx + 0.9 * s} cy={y - 0.9 * s} r={0.9 * s} fill="#FFFFFF" />
      </G>
    );
  };
  const my = y + 8 * s;
  let m: ReactNode = null;
  if (mouth === 'smile') m = <Path d={`M${x - 5 * s} ${my - 1} Q${x} ${my + 4 * s} ${x + 5 * s} ${my - 1}`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />;
  if (mouth === 'small') m = <Path d={`M${x - 2.5 * s} ${my} Q${x} ${my + 2 * s} ${x + 2.5 * s} ${my}`} stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
  if (mouth === 'laugh') m = <Path d={`M${x - 7 * s} ${my - 2} Q${x} ${my + 9 * s} ${x + 7 * s} ${my - 2} Z`} fill={INK} />;
  if (mouth === 'o') m = <Ellipse cx={x} cy={my + 1} rx={3 * s} ry={4 * s} fill={INK} />;
  return (
    <G>
      {eye(x - ex)}
      {eye(x + ex)}
      <Circle cx={x - ex - 4 * s} cy={y + 6 * s} r={2.6 * s} fill="#F28C8C" opacity={0.5} />
      <Circle cx={x + ex + 4 * s} cy={y + 6 * s} r={2.6 * s} fill="#F28C8C" opacity={0.5} />
      {m}
    </G>
  );
}

/** The picture of a kind, in a 100 × 100 box. */
export function KindArt({ kind }: { kind: BombKind }) {
  const c = CARD_INFO[kind].color;
  switch (kind) {
    case 'bomb':
      return (
        <G>
          <Path d="M66 26 Q74 12 84 15" stroke="#C9A27A" strokeWidth={3.2} fill="none" strokeLinecap="round" />
          <Path d={starPath(86, 14, 10, 8, 0.42)} fill={SPARK} />
          <Circle cx={86} cy={14} r={3.4} fill="#FF7A2F" />
          <Rect x={54} y={24} width={18} height={13} rx={3} fill="#4A4560" transform="rotate(38 63 30.5)" />
          <Circle cx={46} cy={60} r={30} fill="#2A2638" />
          <Ellipse cx={35} cy={47} rx={8} ry={6} fill="#FFFFFF" opacity={0.2} transform="rotate(-30 35 47)" />
          {/* a mischievous face */}
          <Path d="M32 54 L41 57 M60 54 L51 57" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
          <Circle cx={38} cy={62} r={3} fill="#FFFFFF" />
          <Circle cx={54} cy={62} r={3} fill="#FFFFFF" />
          <Path d="M36 72 Q46 79 57 71" stroke="#FFFFFF" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'defuse':
      return (
        <G>
          {/* the wire, snipped */}
          <Path d="M6 30 Q24 22 43 28" stroke="#2E7BD6" strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d="M57 28 Q76 34 94 26" stroke="#E2475F" strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d="M47 14 L48 20 M53 14 L52 20 M44 18 L46.5 21.5 M56 18 L53.5 21.5" stroke={SPARK} strokeWidth={2} strokeLinecap="round" />
          {/* jaws */}
          <Path d="M50 56 L39 30 Q42 25 46 28 L53 52 Z" fill="#9AA3B5" />
          <Path d="M50 56 L61 30 Q58 25 54 28 L47 52 Z" fill="#C7CED9" />
          {/* handles */}
          <Path d="M47 58 L30 92" stroke={shade(c, -0.25)} strokeWidth={11} strokeLinecap="round" />
          <Path d="M53 58 L70 92" stroke={c} strokeWidth={11} strokeLinecap="round" />
          <Circle cx={50} cy={56} r={6} fill="#6B7385" />
          <Circle cx={50} cy={56} r={2.2} fill="#D9DEE6" />
        </G>
      );
    case 'nope':
      return (
        <G>
          <Path d="M33 8 H67 L92 33 V67 L67 92 H33 L8 67 V33 Z" fill={c} stroke="#FFFFFF" strokeWidth={3} />
          <G fill="#FFFFFF">
            <Rect x={31} y={26} width={9} height={34} rx={4.5} />
            <Rect x={41.5} y={19} width={9} height={40} rx={4.5} />
            <Rect x={52} y={21} width={9} height={38} rx={4.5} />
            <Rect x={62.5} y={29} width={8.5} height={30} rx={4.25} />
            <Rect x={31} y={44} width={40} height={36} rx={15} />
            <Rect x={20} y={50} width={9} height={26} rx={4.5} transform="rotate(-34 24.5 63)" />
          </G>
        </G>
      );
    case 'skip':
      return (
        <G>
          <Rect x={37} y={56} width={26} height={34} rx={4} fill="#FFFFFF" stroke={shade(c, -0.2)} strokeWidth={2.4} />
          <Path d="M44 66 H56 M44 73 H56 M44 80 H52" stroke={alpha(c, 0.45)} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M84 80 Q72 14 26 58" stroke={c} strokeWidth={8} fill="none" strokeLinecap="round" />
          <Path d="M14 56 L32 48 L30 68 Z" fill={c} />
        </G>
      );
    case 'attack':
      return (
        <G>
          <Path d={starPath(54, 50, 40, 10, 0.72)} fill={alpha(c, 0.22)} />
          <Path d="M58 18 L28 50 L58 82" stroke={shade(c, -0.2)} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M82 18 L52 50 L82 82" stroke={c} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      );
    case 'peek':
      return (
        <G>
          {[-14, 0, 14].map((rot, i) => (
            <Rect key={rot} x={41} y={10} width={18} height={26} rx={3} fill="#FFFFFF" stroke={shade(c, -0.1)} strokeWidth={2} transform={`rotate(${rot} 50 60)`} opacity={i === 1 ? 1 : 0.92} />
          ))}
          <Path d="M10 64 Q50 30 90 64 Q50 98 10 64 Z" fill="#FFFFFF" stroke={shade(c, -0.25)} strokeWidth={3} />
          <Circle cx={50} cy={64} r={15} fill={c} />
          <Circle cx={50} cy={64} r={7} fill={INK} />
          <Circle cx={54} cy={60} r={3} fill="#FFFFFF" />
        </G>
      );
    case 'shuffle':
      return (
        <G stroke={c} strokeWidth={8} fill="none" strokeLinecap="round">
          <Path d="M12 30 C42 30 50 70 78 70" />
          <Path d="M12 70 C42 70 50 30 78 30" stroke={shade(c, -0.25)} />
          <Path d="M76 58 L90 70 L76 82" strokeLinejoin="round" />
          <Path d="M76 18 L90 30 L76 42" strokeLinejoin="round" stroke={shade(c, -0.25)} />
        </G>
      );
    case 'favor':
      return (
        <G>
          <G transform="rotate(-8 50 30)">
            <Rect x={36} y={8} width={28} height={38} rx={4} fill="#FFFFFF" stroke={shade(c, -0.15)} strokeWidth={2.4} />
            <Path d="M50 36 C38 28 40 18 46 18 C49 18 50 21 50 22 C50 21 51 18 54 18 C60 18 62 28 50 36 Z" fill={c} />
          </G>
          {/* the open palm */}
          <Path d="M14 64 Q14 92 48 92 Q80 92 84 70 L84 62 Q78 60 74 66 L70 72 L30 72 Q22 72 14 64 Z" fill={SKIN} stroke={shade(SKIN, -0.3)} strokeWidth={1.6} />
          <Path d="M30 72 Q20 70 16 62 Q14 56 20 56 Q26 56 30 64" fill={SKIN} stroke={shade(SKIN, -0.3)} strokeWidth={1.6} />
          <Path d="M38 80 H62 M40 86 H58" stroke={shade(SKIN, -0.25)} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M22 50 L18 44 M78 50 L84 44 M50 54 V48" stroke={SPARK} strokeWidth={2.4} strokeLinecap="round" />
        </G>
      );
    case 'tajine':
      return (
        <G>
          <Ellipse cx={50} cy={86} rx={40} ry={8} fill={shade(c, -0.3)} />
          <Path d="M16 84 Q22 46 45 24 L55 24 Q78 46 84 84 Z" fill={c} />
          <Path d="M23 70 Q50 64 77 70" stroke="#FFE0B8" strokeWidth={2.4} fill="none" />
          <Path d="M30 50 Q50 44 70 50" stroke="#FFE0B8" strokeWidth={2} fill="none" />
          <Circle cx={50} cy={20} r={7} fill={shade(c, -0.15)} />
          <Circle cx={47.5} cy={17.5} r={2} fill="#FFFFFF" opacity={0.35} />
          <Face y={56} eyes="happy" mouth="laugh" gap={9} />
        </G>
      );
    case 'teapot':
      return (
        <G>
          <Path d="M6 52 Q10 46 14 52 M4 64 Q9 58 14 64 M88 80 Q92 74 96 80" stroke={alpha(c, 0.7)} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <G transform="rotate(-10 50 60)">
            <Path d="M66 62 Q82 60 88 36" stroke="#B9BEC9" strokeWidth={6} fill="none" strokeLinecap="round" />
            <Path d="M30 52 Q14 52 16 66 Q18 78 32 76" stroke={shade(c, -0.1)} strokeWidth={4.5} fill="none" strokeLinecap="round" />
            <Path d="M30 46 Q24 86 50 88 Q76 86 70 46 Z" fill="#D5D9E1" />
            <Path d="M30 46 Q50 40 70 46 Q66 34 50 32 Q34 34 30 46 Z" fill={SPARK} />
            <Path d="M50 32 L50 22" stroke={SPARK} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={50} cy={20} r={4} fill={SPARK} />
            <Path d="M33 76 Q50 82 67 76" stroke={shade(c, 0.2)} strokeWidth={2.6} fill="none" />
            <Face y={58} eyes="open" mouth="smile" gap={8} />
          </G>
          {/* a music note */}
          <G fill={shade(c, -0.15)}>
            <Ellipse cx={86} cy={58} rx={4.5} ry={3.4} transform="rotate(-20 86 58)" />
            <Rect x={89} y={40} width={2.4} height={18} />
            <Path d="M89 40 Q96 42 97 49 Q93 45 89 45 Z" />
          </G>
        </G>
      );
    case 'ladle':
      return (
        <G>
          <Path d="M58 8 L52 50" stroke={shade(c, -0.15)} strokeWidth={9} strokeLinecap="round" />
          <Circle cx={58} cy={10} r={3} fill={shade(c, -0.4)} />
          <Path d="M24 54 Q24 90 50 90 Q76 90 76 54 Z" fill={c} />
          <Ellipse cx={50} cy={54} rx={26} ry={6} fill={shade(c, 0.25)} />
          <Face y={68} eyes="sleepy" mouth="small" gap={8} />
          <G stroke={shade(c, -0.1)} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M70 22 H80 L70 32 H80" />
            <Path d="M84 8 H91 L84 15 H91" />
          </G>
        </G>
      );
    case 'sieve':
      return (
        <G>
          <Circle cx={50} cy={56} r={38} fill="#D9A066" stroke={shade('#D9A066', -0.3)} strokeWidth={3} />
          <Circle cx={50} cy={56} r={30} fill="#F6E6C6" />
          {Array.from({ length: 5 }, (_, r) =>
            Array.from({ length: 5 }, (__, k) => {
              const x = 30 + k * 10;
              const y = 36 + r * 10;
              return Math.hypot(x - 50, y - 56) < 26 ? <Circle key={`${r}-${k}`} cx={x} cy={y} r={1.3} fill={shade('#D9A066', -0.2)} /> : null;
            }),
          )}
          <Path d="M33 38 Q39 33 45 37 M55 37 Q61 33 67 38" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Face y={50} eyes="wide" mouth="o" gap={11} />
          <Path d="M10 22 L16 26 M90 22 L84 26 M50 6 V12" stroke={c} strokeWidth={2.6} strokeLinecap="round" />
        </G>
      );
    case 'bread':
      return (
        <G>
          <Path d="M24 54 Q6 40 4 26 Q16 30 22 38 Q16 26 20 18 Q30 30 32 46 Z" fill="#FFFFFF" stroke="#D5D9E1" strokeWidth={1.6} />
          <Path d="M76 54 Q94 40 96 26 Q84 30 78 38 Q84 26 80 18 Q70 30 68 46 Z" fill="#FFFFFF" stroke="#D5D9E1" strokeWidth={1.6} />
          <Ellipse cx={50} cy={62} rx={34} ry={24} fill="#E2A24E" />
          <Ellipse cx={50} cy={56} rx={28} ry={14} fill="#EDB969" />
          <Path d="M34 50 Q38 46 42 50 M48 47 Q52 43 56 47 M62 50 Q66 46 70 50" stroke="#B9782E" strokeWidth={2} fill="none" strokeLinecap="round" />
          <Face y={62} eyes="open" mouth="smile" gap={9} />
          <Path d="M36 92 L30 98 M50 94 V100 M64 92 L70 98" stroke={alpha(c, 0.7)} strokeWidth={2.4} strokeLinecap="round" />
        </G>
      );
  }
}

/**
 * A card face: the name in the header (right-aligned, so it shows in a fan), the picture, the effect at the
 * bottom. `bare` = no effect line (small cards).
 */
export const BombCardFace = memo(function BombCardFace({ kind, w, bare }: { kind: BombKind; w: number; bare?: boolean }) {
  const h = Math.round(w * CARD_RATIO);
  const info = CARD_INFO[kind];
  const c = info.color;
  const showEffect = !bare && w >= 70;
  const pair = isPairKind(kind);
  const nameSize = Math.max(10, Math.round(w * (w < 90 ? 0.16 : 0.15)));
  const effSize = Math.max(9, Math.round(w * 0.112));
  // the picture sits lower when there is no effect line
  const art = showEffect ? 'translate(14 27) scale(0.72)' : 'translate(10 30) scale(0.8)';
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="0 0 100 140">
        <Rect x={0} y={0} width={100} height={140} rx={10} fill={c} />
        <Rect x={4} y={26} width={92} height={110} rx={7} fill={CREAM} />
        <Rect x={10} y={30} width={80} height={showEffect ? 70 : 100} rx={9} fill={alpha(c, 0.14)} />
        <G transform={art}>
          <KindArt kind={kind} />
        </G>
      </Svg>
      <View style={[styles.head, { height: (h * 26) / 140 }]} pointerEvents="none">
        <Txt numberOfLines={1} style={{ fontFamily: F.display, color: '#FFFFFF', fontSize: nameSize, lineHeight: Math.round((h * 26) / 140) + 3, textAlign: 'right', writingDirection: 'rtl' }}>
          {info.name}
        </Txt>
      </View>
      {pair ? (
        <View style={[styles.badge, { top: (h * 31) / 140, backgroundColor: c }]} pointerEvents="none">
          <Txt style={{ fontFamily: F.black, fontSize: Math.max(9, Math.round(w * 0.1)), lineHeight: Math.max(13, Math.round(w * 0.15)), color: '#FFFFFF' }}>{'\u2066×2\u2069'}</Txt>
        </View>
      ) : null}
      {showEffect ? (
        <View style={[styles.effect, { height: (h * 34) / 140 }]} pointerEvents="none">
          <Txt numberOfLines={2} style={{ fontFamily: F.bold, color: shade(c, -0.45), fontSize: effSize, lineHeight: Math.round(effSize * 1.35), textAlign: 'center' }}>
            {info.effect}
          </Txt>
        </View>
      ) : null}
    </View>
  );
});

/** The back of a card (the deck). */
export const BombCardBack = memo(function BombCardBack({ w }: { w: number }) {
  const h = Math.round(w * CARD_RATIO);
  return (
    <Svg width={w} height={h} viewBox="0 0 100 140">
      <Rect x={0} y={0} width={100} height={140} rx={10} fill={INDIGO} />
      <Rect x={6} y={6} width={88} height={128} rx={7} fill="none" stroke="#E2543B" strokeWidth={2.4} />
      <Rect x={11} y={11} width={78} height={118} rx={5} fill="none" stroke={alpha(SPARK, 0.4)} strokeWidth={1} />
      {[
        [24, 26],
        [76, 26],
        [24, 114],
        [76, 114],
      ].map(([x, y]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r={3} fill={alpha(SPARK, 0.55)} />
      ))}
      <Circle cx={50} cy={70} r={30} fill="none" stroke={alpha('#E2543B', 0.9)} strokeWidth={3} />
      <Circle cx={50} cy={70} r={22} fill={alpha('#E2543B', 0.25)} />
      <Path d={starPath(50, 70, 17, 8, 0.42)} fill={SPARK} />
      <Circle cx={50} cy={70} r={5.5} fill="#FF7A2F" />
    </Svg>
  );
});

/** A small card: the picture only, framed in its colour (the discard pile's history, what I know of the deck). */
export function MiniCard({ kind, w }: { kind: BombKind | null; w: number }) {
  const h = Math.round(w * CARD_RATIO);
  if (!kind) {
    return (
      <View style={[styles.mini, { width: w, height: h, backgroundColor: INDIGO, borderColor: alpha('#FFFFFF', 0.25) }]} accessibilityLabel="ورقة غير معروفة">
        <Txt style={{ fontFamily: F.display, fontSize: Math.round(w * 0.5), lineHeight: Math.round(w * 0.8), color: alpha('#FFFFFF', 0.6) }}>؟</Txt>
      </View>
    );
  }
  const c = CARD_INFO[kind].color;
  return (
    <View style={[styles.mini, { width: w, height: h, backgroundColor: CREAM, borderColor: c }]} accessibilityLabel={CARD_INFO[kind].name}>
      <Svg width={w * 0.92} height={w * 0.92} viewBox="0 0 100 100">
        <KindArt kind={kind} />
      </Svg>
    </View>
  );
}

/** A card of my hand: tap to select (it rises), with a ring when selected or chosen. */
export function HandCard({ kind, w, on, dim, onPress, label }: { kind: BombKind; w: number; on: boolean; dim?: boolean; onPress?: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={[styles.hand, { borderColor: on ? SPARK : 'transparent' }]}>
      <BombCardFace kind={kind} w={w} />
      {/* not playable now: a dark veil (not transparency, so the cards under it never show through) */}
      {dim ? <View pointerEvents="none" style={styles.veil} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { position: 'absolute', top: 0, left: '6%', right: '7%', justifyContent: 'center' },
  effect: { position: 'absolute', left: '7%', right: '7%', bottom: '2%', justifyContent: 'center' },
  badge: { position: 'absolute', left: '9%', borderRadius: 999, paddingHorizontal: 5, borderWidth: 1.5, borderColor: '#FFFFFF' },
  mini: { borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hand: { borderRadius: 12, borderWidth: 3, padding: 1 },
  veil: { position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: 10, backgroundColor: 'rgba(16,18,41,0.5)' },
});
