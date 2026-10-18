/**
 * «البلوط» (Moroccan mode) — a tiny Moroccan suit symbol, drawn in place of ♠ ♥ ♦ ♣: شباضا (a sword),
 * الكوباص (a cup), أوروص (a coin), الباسطوص (a club).
 */
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { MA_SUIT } from '@/shared/baloot-morocco';
import type { BSuit } from '@/shared/games/baloot';

const GOLD = '#E2A93B';
const GOLD_DARK = '#9C6F1E';

export function SuitIcon({ suit, size = 16 }: { suit: BSuit; size?: number }) {
  const s = MA_SUIT[suit];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {s === 'coins' ? (
        <>
          <Circle cx={12} cy={12} r={10} fill={GOLD} stroke={GOLD_DARK} strokeWidth={1.6} />
          <Circle cx={12} cy={12} r={5.6} fill="none" stroke={GOLD_DARK} strokeWidth={1.4} />
          <Circle cx={12} cy={12} r={1.8} fill="#C9283E" />
        </>
      ) : s === 'cups' ? (
        <>
          <Path d="M4.5 3.5 H19.5 C19.5 10 16.5 13.5 12 13.5 C7.5 13.5 4.5 10 4.5 3.5 Z" fill="#D7263D" stroke="#8E1526" strokeWidth={1.2} />
          <Rect x={4.5} y={5} width={15} height={1.8} fill={GOLD} />
          <Rect x={10.8} y={13.2} width={2.4} height={5} fill={GOLD_DARK} />
          <Path d="M6.5 21.5 H17.5 L15.5 18 H8.5 Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={1} />
        </>
      ) : s === 'swords' ? (
        <>
          <Path d="M12 1.5 L14.2 5 L14.2 15.5 L9.8 15.5 L9.8 5 Z" fill="#2F6BEA" stroke="#163A8A" strokeWidth={1} />
          <Rect x={5.5} y={15.2} width={13} height={2.6} rx={1.3} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.8} />
          <Rect x={10.8} y={17.6} width={2.4} height={3.6} fill="#C9283E" />
          <Circle cx={12} cy={22} r={1.6} fill={GOLD} />
        </>
      ) : (
        <>
          <Path d="M9.6 22.5 L8.2 6.5 C7.9 1.8 16.1 1.8 15.8 6.5 L14.4 22.5 Z" fill="#1F8F4A" stroke="#0E5A2B" strokeWidth={1.1} />
          <Ellipse cx={10.6} cy={8.5} rx={1.3} ry={1} fill="#0E5A2B" />
          <Ellipse cx={13.4} cy={13} rx={1.2} ry={0.9} fill="#0E5A2B" />
          <Ellipse cx={11} cy={17.5} rx={1.1} ry={0.8} fill="#0E5A2B" />
        </>
      )}
    </Svg>
  );
}
