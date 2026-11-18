/**
 * «خلية الحروف» — the honeycomb: seven flat-topped hexagons (react-native-svg), the centre one in honey
 * yellow, the six around it in cream. Each cell is its own button (a big touch target over the whole
 * hexagon); a pressed cell sinks a little. `small` draws a quiet copy (the end of a round), no touches.
 */
import { Pressable, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { C, F, alpha } from '@/theme';
import { Txt } from '@/ui/txt';

export const HONEY = '#F2B33D';
export const HONEY_DARK = '#C98A12';
export const COMB = '#FFF4DA';
const COMB_EDGE = '#E9D9B4';

/** Side of a hexagon for a hive `width` wide (gaps included). */
export function hexSide(width: number) {
  return width / 5.25;
}

/** The hive's size: width and height for a hexagon side `r` and a gap `g` between cells. */
function layout(r: number) {
  const g = Math.max(3, r * 0.09);
  const d = Math.sqrt(3) * r + g; // centre to centre
  const w = 2 * r + 2 * d * Math.cos(Math.PI / 6);
  const h = Math.sqrt(3) * r + 2 * d;
  // the centre first, then the six around it from the top, clockwise
  const at = [{ x: w / 2, y: h / 2 }];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    at.push({ x: w / 2 + d * Math.cos(a), y: h / 2 + d * Math.sin(a) });
  }
  return { w, h, at };
}

function hexPoints(r: number) {
  const cx = r, cy = (Math.sqrt(3) * r) / 2;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** «ا» is shown as it is written alone; the other keys as they are. */
export const letterFace = (k: string) => k;

export function Honeycomb({ centre, outer, width, onLetter, small, disabled }: { centre: string; outer: string[]; width: number; onLetter?: (k: string) => void; small?: boolean; disabled?: boolean }) {
  const r = hexSide(width);
  const { w, h, at } = layout(r);
  const cellW = 2 * r;
  const cellH = Math.sqrt(3) * r;
  const pts = hexPoints(r);
  const letters = [centre, ...outer];
  const fontSize = Math.round(r * (small ? 0.8 : 0.78));
  return (
    <View style={{ width: w, height: h, alignSelf: 'center', direction: 'ltr' }} accessibilityRole={onLetter ? undefined : 'image'}>
      {letters.map((k, i) => {
        const mid = i === 0;
        const face = (pressed: boolean) => (
          <>
            <Svg width={cellW} height={cellH} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Polygon points={pts} fill={mid ? (pressed ? HONEY_DARK : HONEY) : pressed ? COMB_EDGE : COMB} stroke={mid ? alpha(HONEY_DARK, 0.9) : COMB_EDGE} strokeWidth={small ? 1 : 1.5} />
            </Svg>
            <Txt selectable={false} style={{ fontFamily: F.display, fontSize, lineHeight: Math.round(fontSize * 1.45), color: C.ink, textAlign: 'center', marginTop: fontSize * 0.08 }}>
              {letterFace(k)}
            </Txt>
          </>
        );
        const pos = { position: 'absolute' as const, left: at[i].x - r, top: at[i].y - cellH / 2, width: cellW, height: cellH, alignItems: 'center' as const, justifyContent: 'center' as const };
        if (!onLetter) {
          return (
            <View key={`${i}${k}`} style={pos}>
              {face(false)}
            </View>
          );
        }
        return (
          <Pressable
            key={`${i}${k}`}
            accessibilityRole="button"
            accessibilityLabel={mid ? `الحرف ${k} في الوسط` : `الحرف ${k}`}
            disabled={disabled}
            onPress={() => onLetter(k)}
            style={({ pressed }) => [pos, { transform: [{ scale: pressed ? 0.93 : 1 }], opacity: disabled ? 0.55 : 1 }]}
          >
            {({ pressed }) => face(pressed)}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The hive's height for a width (to plan the screen). */
export function honeycombHeight(width: number) {
  return layout(hexSide(width)).h;
}
