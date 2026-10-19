/**
 * The full French deck (A–K in ♠ ♥ ♦ ♣, the joker and the back) for «الرامي», drawn with
 * react-native-svg in the style of Baloot's cards (its suit shapes, court figures and back are reused).
 * Below ~46 px wide a card keeps only its index and one big suit, so it stays readable in a hand of 15.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/sfx';
import type { RCard } from '@/shared/games/rami';
import { isJoker, ramiCardName, rankLabel } from '@/shared/rami-rules';
import { C, F, alpha } from '@/theme';
import { Txt } from '@/ui/txt';

import { Back, Court, PAPER, SuitShape, suitColor } from '../baloot-card';
import { useCardLook } from './motion';

/** height / width */
export const FRENCH_RATIO = 1.4;

/** pip positions (0..1 inside the pip area) */
const PIPS: Record<number, [number, number][]> = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

const JOKER_RED = '#C9283E';
const JOKER_BLUE = '#2C3D73';
const GOLD = '#E2A93B';

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return <Path d={`M${pts.join(' L')} Z`} fill={fill} />;
}

function JokerFace({ width }: { width: number }) {
  const small = width < 46;
  const corner = (
    <G>
      <SvgText x={small ? 8 : 7} y={small ? 30 : 24} fill={JOKER_RED} fontSize={small ? 26 : 19} fontWeight="700" fontFamily="Arial">
        J
      </SvgText>
      <Star x={small ? 16 : 13} y={small ? 42 : 33} r={small ? 8 : 6} fill={GOLD} />
    </G>
  );
  return (
    <Svg width={width} height={width * FRENCH_RATIO} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={9} fill={PAPER} stroke="#D3CBBA" strokeWidth={2} />
      {small ? (
        <G>
          <Path d="M28 104 L36 58 L50 76 L64 58 L72 104 Z" fill={JOKER_RED} />
          <Path d="M50 76 L58 104 L42 104 Z" fill={JOKER_BLUE} />
          <Circle cx={36} cy={56} r={6} fill={GOLD} />
          <Circle cx={64} cy={56} r={6} fill={GOLD} />
          <Rect x={26} y={102} width={48} height={10} rx={4} fill={GOLD} />
        </G>
      ) : (
        <G>
          {/* a jester's hat with bells, over a smiling face */}
          <Path d="M30 66 C30 50 22 38 14 34 C26 34 36 42 42 52 L50 30 L58 52 C64 42 74 34 86 34 C78 38 70 50 70 66 Z" fill={JOKER_RED} />
          <Path d="M42 52 L50 30 L58 52 L50 66 Z" fill={JOKER_BLUE} />
          <Circle cx={14} cy={34} r={5} fill={GOLD} />
          <Circle cx={50} cy={29} r={5} fill={GOLD} />
          <Circle cx={86} cy={34} r={5} fill={GOLD} />
          <Rect x={28} y={64} width={44} height={9} rx={4} fill={GOLD} />
          <Circle cx={50} cy={90} r={17} fill="#F2D3B5" stroke="#7A4E2D" strokeWidth={1.2} />
          <Circle cx={44} cy={87} r={1.8} fill="#3B2A20" />
          <Circle cx={56} cy={87} r={1.8} fill="#3B2A20" />
          <Path d="M41 95 C45 101 55 101 59 95" stroke={JOKER_RED} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Path d="M30 112 L38 106 L44 113 L50 106 L56 113 L62 106 L70 112 L66 122 L34 122 Z" fill={JOKER_BLUE} />
        </G>
      )}
      {corner}
      {small ? null : <G transform="rotate(180 50 70)">{corner}</G>}
    </Svg>
  );
}

function Face({ card, width }: { card: RCard; width: number }) {
  const suit = card.suit!;
  const small = width < 46;
  const col = suitColor(suit);
  const label = rankLabel(card.rank);
  const ten = label === '10';
  const fs = small ? (ten ? 30 : 36) : ten ? 21 : 25;
  const index = (
    <G>
      <SvgText x={small ? 7 : 6} y={small ? 33 : 26} fill={col} fontSize={fs} fontWeight="700" fontFamily="Arial" letterSpacing={ten ? -2 : 0}>
        {label}
      </SvgText>
      {small ? null : <SuitShape suit={suit} x={6.5} y={30} size={15} />}
    </G>
  );
  let middle;
  if (small) middle = <SuitShape suit={suit} x={card.rank === 1 ? 30 : 34} y={card.rank === 1 ? 58 : 66} size={card.rank === 1 ? 62 : 54} />;
  else if (card.rank === 1) middle = <SuitShape suit={suit} x={24} y={44} size={52} />;
  else if (card.rank >= 11) middle = <Court card={{ suit, rank: card.rank === 13 ? 'K' : card.rank === 12 ? 'Q' : 'J' }} />;
  else {
    const S = card.rank <= 3 ? 20 : 17;
    middle = PIPS[card.rank].map(([px, py], i) => (
      <SuitShape key={i} suit={suit} x={32 + px * 36 - S / 2} y={26 + py * 88 - S / 2} size={S} flip={py > 0.5} />
    ));
  }
  return (
    <Svg width={width} height={width * FRENCH_RATIO} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={9} fill={PAPER} stroke="#D3CBBA" strokeWidth={2} />
      {middle}
      {index}
      {small ? null : <G transform="rotate(180 50 70)">{index}</G>}
    </Svg>
  );
}

/** Just the drawing: a face (null = the back). */
export const FrenchFace = memo(function FrenchFace({ card, width }: { card: RCard | null; width: number }) {
  if (!card) return <Back width={width} />;
  return isJoker(card) ? <JokerFace width={width} /> : <Face card={card} width={width} />;
});

/**
 * A French card that can be selected (lifts), dimmed, ringed in a player's colour (just played) and
 * tapped. `tag` is a tiny label under a joker on the table: the card it stands for («7♥»).
 */
export function FrenchCard({
  card,
  width,
  selected,
  dim,
  glow,
  ring,
  tag,
  onPress,
  steady,
}: {
  card: RCard | null;
  width: number;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  ring?: string;
  tag?: string;
  onPress?: () => void;
  /** keep the tap target mounted while onPress comes and goes (my hand: no blink at a change of turn) */
  steady?: boolean;
}) {
  const look = useCardLook({ lift: selected ? 10 : 0, dim, dimTo: 0.4 });
  const face = (
    <View
      style={[
        styles.wrap,
        { borderRadius: width * 0.09 + 3 },
        glow && !selected ? { borderColor: alpha(C.yellow, 0.6) } : null,
        ring && !selected ? { borderColor: ring, borderWidth: 2.5 } : null,
        selected ? { borderColor: C.yellow } : null,
      ]}>
      <FrenchFace card={card} width={width} />
      {tag ? (
        <View style={styles.tag} pointerEvents="none">
          <Txt style={styles.tagText}>{tag}</Txt>
        </View>
      ) : null}
    </View>
  );
  return (
    <Animated.View style={look}>
      {onPress || steady ? (
        <Pressable
          disabled={!onPress}
          onPress={() => {
            if (!onPress) return;
            haptic.tap();
            onPress();
          }}
          hitSlop={2}
          accessibilityRole="button"
          accessibilityLabel={card ? `ورقة ${ramiCardName(card)}` : 'الكومة'}>
          {face}
        </Pressable>
      ) : (
        face
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tag: { position: 'absolute', bottom: -7, alignSelf: 'center', backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 4, direction: 'ltr' },
  tagText: { fontFamily: F.black, fontSize: 10, lineHeight: 14, color: '#FFFFFF' },
});
