/**
 * Game emblems, Werewolf role portraits and the home emblem: HD mascot-style
 * illustrations rendered by the art pipeline (see assets.ts).
 * The zellige background pattern stays vector so it tiles crisply at any size.
 */
import { Image } from 'expo-image';
import Svg, { Circle, Defs, G, Pattern, Polygon, Rect } from 'react-native-svg';

import type { GameId, WolfRole } from '@/shared/protocol';

import { GAME_IMG, HERO_IMG, ROLE_IMG } from './assets';

export function GameArt({ id, size }: { id: GameId; size: number }) {
  return <Image source={GAME_IMG[id]} style={{ width: size, height: size }} contentFit="contain" transition={0} />;
}

export function RoleArt({ role, size }: { role: WolfRole; size: number }) {
  return <Image source={ROLE_IMG[role]} style={{ width: size, height: size }} contentFit="contain" transition={0} />;
}

/** The app emblem (teapot, cards and the title ribbon). */
export function HeroArt({ width }: { width: number }) {
  return <Image source={HERO_IMG} style={{ width, height: (width * 186) / 224 }} contentFit="contain" transition={0} accessibilityLabel="ألعاب العائلة" />;
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
