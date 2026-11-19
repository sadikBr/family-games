/**
 * «قطار المغرب» — the art: the colours of the cards and routes, a wagon card (a coloured card with a
 * small wagon; the locomotive is dark with a golden engine), and the ticket chip.
 */
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { SEAT_COLORS } from '@/shared/games/train';
import { COLOR_NAME, type RouteColor, type TrainCard } from '@/shared/train-map';
import { C, alpha } from '@/theme';
import { Txt, num } from '@/ui/txt';

/** a card's (and a route's) colour */
export const CARD_HEX: Record<TrainCard | 'grey', string> = {
  red: '#E2475F',
  orange: '#F08A3E',
  yellow: '#F2C53D',
  green: '#2FB67C',
  blue: '#3D7BE9',
  purple: '#9B6DE0',
  black: '#33333F',
  white: '#F4F1E8',
  loco: '#1C1A2E',
  grey: '#A3A3B2',
};

/** ink on top of a colour */
export const CARD_INK: Record<TrainCard | 'grey', string> = {
  red: '#FFFFFF',
  orange: '#2A1606',
  yellow: '#2A2006',
  green: '#FFFFFF',
  blue: '#FFFFFF',
  purple: '#FFFFFF',
  black: '#FFFFFF',
  white: '#1B1830',
  loco: '#F2C53D',
  grey: '#1B1830',
};

export const seatColor = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];

export const routeHex = (c: RouteColor) => CARD_HEX[c];

/** A wagon (side view) in a 40×24 box. */
function WagonGlyph({ color, ink }: { color: string; ink: string }) {
  return (
    <G>
      <Rect x={3} y={4} width={34} height={13} rx={2.5} fill={color} stroke={ink} strokeWidth={1.6} />
      <Rect x={7} y={7} width={7} height={5} rx={1} fill={ink} opacity={0.55} />
      <Rect x={16.5} y={7} width={7} height={5} rx={1} fill={ink} opacity={0.55} />
      <Rect x={26} y={7} width={7} height={5} rx={1} fill={ink} opacity={0.55} />
      <Circle cx={11} cy={19.5} r={3} fill={ink} />
      <Circle cx={29} cy={19.5} r={3} fill={ink} />
    </G>
  );
}

/** A locomotive (side view) in a 40×24 box. */
function LocoGlyph({ gold }: { gold: string }) {
  return (
    <G>
      <Path d="M4 17V8h6V4h9v4h9l6 4v5z" fill={gold} />
      <Rect x={12} y={5.5} width={5} height={4} rx={0.8} fill="#1C1A2E" />
      <Rect x={22} y={1} width={4} height={7} fill={gold} />
      <Circle cx={10} cy={19.5} r={3} fill={gold} />
      <Circle cx={20} cy={19.5} r={3} fill={gold} />
      <Circle cx={30} cy={19.5} r={3} fill={gold} />
    </G>
  );
}

/** A wagon card, `w` px wide (1.4× as tall). */
export function WagonCard({ card, w, dim, label = true }: { card: TrainCard; w: number; dim?: boolean; label?: boolean }) {
  const h = Math.round(w * 1.4);
  const bg = CARD_HEX[card];
  const ink = CARD_INK[card];
  const loco = card === 'loco';
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: Math.max(6, w * 0.14),
        backgroundColor: bg,
        borderWidth: loco ? 2 : 1.5,
        borderColor: loco ? '#F2C53D' : card === 'black' ? alpha('#FFFFFF', 0.5) : alpha('#000000', 0.25),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.4 : 1,
        overflow: 'hidden',
      }}>
      {loco ? (
        // the wild card: a band of every colour behind the engine
        <View style={{ position: 'absolute', left: 0, right: 0, top: h * 0.12, height: h * 0.08, flexDirection: 'row' }}>
          {(['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const).map((c) => (
            <View key={c} style={{ flex: 1, backgroundColor: CARD_HEX[c] }} />
          ))}
        </View>
      ) : null}
      <Svg width={w * 0.82} height={w * 0.5} viewBox="0 0 40 24">
        {loco ? <LocoGlyph gold="#F2C53D" /> : <WagonGlyph color={alpha(ink, 0.12)} ink={ink} />}
      </Svg>
      {label && w >= 40 ? (
        <Txt v="tiny" color={ink} center numberOfLines={1} style={{ fontSize: Math.min(12, w * 0.22), lineHeight: Math.min(18, w * 0.34) }}>
          {COLOR_NAME[card]}
        </Txt>
      ) : null}
    </View>
  );
}

/** The back of the deck: a stack with how many cards are left. */
export function DeckCard({ w, count }: { w: number; count: number }) {
  const h = Math.round(w * 1.4);
  return (
    <View style={{ width: w, height: h }}>
      {[2, 1, 0].map((k) => (
        <View
          key={k}
          style={{
            position: 'absolute',
            left: k * 1.5,
            top: -k * 1.5,
            width: w - 3,
            height: h - 3,
            borderRadius: Math.max(6, w * 0.14),
            backgroundColor: k === 0 ? '#5A2E2A' : '#43211E',
            borderWidth: 1.5,
            borderColor: alpha('#F2C53D', k === 0 ? 0.8 : 0.35),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {k === 0 ? (
            <>
              <Svg width={w * 0.6} height={w * 0.36} viewBox="0 0 40 24">
                <LocoGlyph gold={alpha('#F2C53D', 0.85)} />
              </Svg>
              <Txt v="tiny" color={C.text} style={{ fontSize: 12, lineHeight: 16 }}>
                {num(count)}
              </Txt>
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}
