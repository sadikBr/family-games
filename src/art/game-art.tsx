/**
 * Game emblems, Werewolf role portraits and the home emblem: HD mascot-style
 * illustrations rendered by the art pipeline (see assets.ts).
 * The zellige background pattern stays vector so it tiles crisply at any size.
 */
import { Image } from 'expo-image';
import Svg, { Circle, Defs, G, Pattern, Polygon, Rect } from 'react-native-svg';

import type { GameId, WolfRole } from '@/shared/protocol';

import { GAME_IMG, HERO_IMG, ROLE_IMG } from './assets';

/**
 * The emblem files keep a transparent margin so the artwork is never cut off. The image is drawn a
 * little bigger than its box (the margin spills over, the artwork stays inside) so emblems keep
 * their size on screen.
 */
const BLEED = 0.05;
const bleed = (size: number) => ({ width: size * (1 + 2 * BLEED), height: size * (1 + 2 * BLEED), margin: -size * BLEED });

export function GameArt({ id, size }: { id: GameId; size: number }) {
  return <Image source={GAME_IMG[id]} style={bleed(size)} contentFit="contain" transition={0} />;
}

export function RoleArt({ role, size }: { role: WolfRole; size: number }) {
  return <Image source={ROLE_IMG[role]} style={bleed(size)} contentFit="contain" transition={0} />;
}

/** The app emblem (teapot, cards and the title ribbon). */
export function HeroArt({ width }: { width: number }) {
  const w = width * (1 + 2 * 0.06);
  return (
    <Image
      source={HERO_IMG}
      style={{ width: w, height: (w * 524) / 720, marginHorizontal: -width * 0.06 }}
      contentFit="contain"
      transition={0}
      accessibilityLabel="ألعاب العائلة"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Zellige-style background pattern                                    */
/* ------------------------------------------------------------------ */

export function Zellige({ width, height, color = '#FFFFFF', opacity = 0.05 }: { width: number; height: number; color?: string; opacity?: number }) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      <Defs>
        <Pattern id="zellige" width={56} height={56} patternUnits="userSpaceOnUse">
          <G opacity={opacity} transform="translate(28 28)">
            <Rect x={-12} y={-12} width={24} height={24} fill="none" stroke={color} strokeWidth={1.5} />
            <Rect x={-12} y={-12} width={24} height={24} fill="none" stroke={color} strokeWidth={1.5} transform="rotate(45)" />
            <Circle r={4} fill="none" stroke={color} strokeWidth={1.5} />
            <Polygon points="-28,-28 -22,-28 -28,-22" fill={color} />
            <Polygon points="28,28 22,28 28,22" fill={color} />
            <Polygon points="28,-28 22,-28 28,-22" fill={color} />
            <Polygon points="-28,28 -22,28 -28,22" fill={color} />
          </G>
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#zellige)" />
    </Svg>
  );
}
