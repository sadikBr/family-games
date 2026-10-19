/**
 * «البلوط» cards, drawn with react-native-svg: classic French cards with a corner index (A K Q J 10 9
 * 8 7, as the cards are printed in the Gulf), big pips, simple court figures of our own, red ♥ ♦ and
 * black ♠ ♣. Below ~46 px wide a card keeps only its index and one big suit, so it stays readable.
 * In the Moroccan mode (`MoroccoDeck`) the same cards are shown with the Moroccan deck's images.
 */
import { createContext, memo, use } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { CARD_RATIO, SpanishCard } from '@/art/spanish-card';
import { haptic } from '@/lib/sfx';
import { maCardLabel, toSpanish } from '@/shared/baloot-morocco';
import { SUIT_NAME } from '@/shared/baloot-rules';
import type { BCard, BSuit } from '@/shared/games/baloot';
import { C, alpha } from '@/theme';

import { useCardLook } from './cards/motion';

export const CARD_H = 1.4;
/** true inside a Moroccan game: every card is drawn from the Moroccan deck */
export const MoroccoDeck = createContext(false);
const RED = '#C9283E';
const BLACK = '#1E2238';
const PAPER = '#FFFDF7';
export const suitColor = (s: BSuit) => (s === 'H' || s === 'D' ? RED : BLACK);

/** Suit shapes in a 100 × 100 box. */
export function SuitShape({ suit, x, y, size, color, flip }: { suit: BSuit; x: number; y: number; size: number; color?: string; flip?: boolean }) {
  const k = size / 100;
  const fill = color ?? suitColor(suit);
  const t = `translate(${x} ${y}) scale(${k})${flip ? ' rotate(180 50 50)' : ''}`;
  if (suit === 'C') {
    return (
      <G transform={t}>
        <Circle cx={50} cy={27} r={21} fill={fill} />
        <Circle cx={26} cy={58} r={21} fill={fill} />
        <Circle cx={74} cy={58} r={21} fill={fill} />
        <Path d="M45 50 L55 50 C55 72 60 86 70 97 L30 97 C40 86 45 72 45 50 Z" fill={fill} />
      </G>
    );
  }
  const d =
    suit === 'H'
      ? 'M50 92 C22 70 4 52 4 31 C4 15 16 4 30 4 C40 4 47 10 50 19 C53 10 60 4 70 4 C84 4 96 15 96 31 C96 52 78 70 50 92 Z'
      : suit === 'D'
        ? 'M50 2 L86 50 L50 98 L14 50 Z'
        : 'M50 3 C60 20 96 40 96 62 C96 76 86 84 74 84 C65 84 58 80 54 73 C55 83 60 91 69 97 L31 97 C40 91 45 83 46 73 C42 80 35 84 26 84 C14 84 4 76 4 62 C4 40 40 20 50 3 Z';
  return <Path d={d} fill={fill} transform={t} />;
}

/** pip positions (0..1 inside the pip area) for 7 to 10 */
const PIPS: Record<string, [number, number][]> = {
  '7': [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  '8': [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  '9': [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  '10': [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

function Court({ card }: { card: BCard }) {
  const col = suitColor(card.suit);
  const robe = card.suit === 'H' || card.suit === 'D' ? '#B4233A' : '#2C3D73';
  const gold = '#E2A93B';
  return (
    <G>
      <Rect x={22} y={21} width={56} height={98} rx={6} fill={alpha(col, 0.07)} stroke={col} strokeWidth={1.6} />
      <SuitShape suit={card.suit} x={26} y={25} size={12} />
      <SuitShape suit={card.suit} x={62} y={103} size={12} flip />
      {/* shoulders and robe */}
      <Path d="M30 112 C31 88 40 80 50 79 C60 80 69 88 70 112 Z" fill={robe} />
      <Path d="M44 80 L50 98 L56 80" stroke={gold} strokeWidth={2.4} fill="none" />
      <Line x1={50} y1={98} x2={50} y2={112} stroke={gold} strokeWidth={2.4} />
      {/* head */}
      <Circle cx={50} cy={63} r={12} fill="#F2D3B5" stroke="#7A4E2D" strokeWidth={1} />
      <Circle cx={45.5} cy={62} r={1.4} fill="#3B2A20" />
      <Circle cx={54.5} cy={62} r={1.4} fill="#3B2A20" />
      {card.rank === 'K' ? (
        <>
          <Path d="M41 69 C43 77 57 77 59 69 C55 72 45 72 41 69 Z" fill="#6E4A2F" />
          <Path d="M37 53 L39 37 L44 45 L50 33 L56 45 L61 37 L63 53 Z" fill={gold} stroke="#9C6F1E" strokeWidth={1} />
          <Circle cx={50} cy={46} r={2} fill={RED} />
        </>
      ) : card.rank === 'Q' ? (
        <>
          <Path d="M36 64 C34 48 41 49 50 49 C59 49 66 48 64 64 C62 54 38 54 36 64 Z" fill="#6E4A2F" />
          <Path d="M39 52 C42 42 58 42 61 52 Z" fill={gold} stroke="#9C6F1E" strokeWidth={1} />
          <Circle cx={50} cy={41} r={3} fill={gold} />
          <Path d="M45 69 C48 71 52 71 55 69" stroke="#9E3B3B" strokeWidth={1.4} fill="none" />
        </>
      ) : (
        <>
          <Path d="M37 56 C38 44 44 41 50 41 C56 41 62 44 63 56 Z" fill={robe} stroke={gold} strokeWidth={1.2} />
          <Path d="M58 46 C66 38 70 32 72 26 C66 32 61 36 56 42 Z" fill={gold} />
          <Path d="M46 69 C48 70.5 52 70.5 54 69" stroke="#7A4E2D" strokeWidth={1.2} fill="none" />
        </>
      )}
    </G>
  );
}

function Face({ card, width }: { card: BCard; width: number }) {
  const small = width < 46;
  const col = suitColor(card.suit);
  const ten = card.rank === '10';
  const fs = small ? (ten ? 30 : 36) : ten ? 21 : 25;
  const index = (
    <G>
      <SvgText x={small ? 7 : 6} y={small ? 33 : 26} fill={col} fontSize={fs} fontWeight="700" fontFamily="Arial" letterSpacing={ten ? -2 : 0}>
        {card.rank}
      </SvgText>
      {small ? null : <SuitShape suit={card.suit} x={6.5} y={30} size={15} />}
    </G>
  );
  let middle;
  if (small) middle = <SuitShape suit={card.suit} x={card.rank === 'A' ? 30 : 34} y={card.rank === 'A' ? 58 : 66} size={card.rank === 'A' ? 62 : 54} />;
  else if (card.rank === 'A') middle = <SuitShape suit={card.suit} x={24} y={44} size={52} />;
  else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') middle = <Court card={card} />;
  else {
    const S = 17;
    middle = PIPS[card.rank].map(([px, py], i) => (
      <SuitShape key={i} suit={card.suit} x={32 + px * 36 - S / 2} y={26 + py * 88 - S / 2} size={S} flip={py > 0.5} />
    ));
  }
  return (
    <Svg width={width} height={width * CARD_H} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={9} fill={PAPER} stroke="#D3CBBA" strokeWidth={2} />
      {middle}
      {index}
      {small ? null : <G transform="rotate(180 50 70)">{index}</G>}
    </Svg>
  );
}

function Back({ width }: { width: number }) {
  const lines = [];
  for (let k = -140; k < 140; k += 14) {
    lines.push(<Line key={`a${k}`} x1={k} y1={0} x2={k + 140} y2={140} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />);
    lines.push(<Line key={`b${k}`} x1={k + 140} y1={0} x2={k} y2={140} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />);
  }
  return (
    <Svg width={width} height={width * CARD_H} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={9} fill="#8A2438" stroke="#F3E6CF" strokeWidth={3} />
      <G>{lines}</G>
      <Rect x={9} y={9} width={82} height={122} rx={6} fill="none" stroke="#F3E6CF" strokeWidth={2} />
      <SuitShape suit="D" x={38} y={56} size={24} color="#F3E6CF" />
    </Svg>
  );
}

export const BalootCard = memo(function BalootCard({
  card,
  width,
  dim,
  selected,
  ring,
  onPress,
}: {
  card: BCard | null;
  width: number;
  dim?: boolean;
  selected?: boolean;
  /** a coloured border (the card that holds / took the trick) */
  ring?: string;
  onPress?: () => void;
}) {
  const ma = use(MoroccoDeck);
  // a Moroccan card is a little taller (1.5): it keeps the same height, so the layout doesn't move
  const w = ma ? Math.round((width * CARD_H) / CARD_RATIO) : width;
  const r = w * 0.09 + 2;
  // the selection lift and the dimming glide; the Pressable is inside the lifted view, so the hit
  // area follows the card (a second tap on the raised card always lands on it)
  const look = useCardLook({ lift: selected ? 12 : 0, dim, dimTo: 0.42 });
  const face = (
    <View
      style={{
        borderRadius: r,
        borderWidth: 2,
        borderColor: selected ? C.yellow : (ring ?? 'transparent'),
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}>
      {ma ? <SpanishCard card={card && toSpanish(card)} width={w} /> : card ? <Face card={card} width={width} /> : <Back width={width} />}
    </View>
  );
  const box = ma ? <View style={{ width, alignItems: 'center' }}>{face}</View> : face;
  return (
    <Animated.View style={look}>
      {onPress ? (
        <Pressable
          onPress={() => {
            haptic.tap();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={card ? (ma ? maCardLabel(card) : `${card.rank} ${SUIT_NAME[card.suit]}`) : 'ورقة'}>
          {box}
        </Pressable>
      ) : (
        box
      )}
    </Animated.View>
  );
});
