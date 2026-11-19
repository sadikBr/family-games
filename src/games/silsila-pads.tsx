/**
 * «سلسلة الذاكرة» — the board: 4 or 6 big pads, each with its colour, its shape (so colour-blind players can
 * play) and its tone. A lit pad brightens and glows softly; the shapes and the small hearts are drawn here.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C, alpha, shade } from '@/theme';

/** Each pad: its colour, its shape and its name (read aloud by screen readers). */
export const PADS = [
  { color: '#E2475F', shape: 'circle', name: 'الأحمر — دائرة' },
  { color: '#3D8BE9', shape: 'square', name: 'الأزرق — مربع' },
  { color: '#F2B33D', shape: 'triangle', name: 'الأصفر — مثلث' },
  { color: '#2FB67C', shape: 'star', name: 'الأخضر — نجمة' },
  { color: '#9B6BEA', shape: 'diamond', name: 'البنفسجي — معيّن' },
  { color: '#F08A3E', shape: 'hexagon', name: 'البرتقالي — مسدّس' },
] as const;

type Shape = (typeof PADS)[number]['shape'];

function polygon(n: number, r: number, inner: number | null, rot: number) {
  const pts: string[] = [];
  const steps = inner === null ? n : n * 2;
  for (let i = 0; i < steps; i++) {
    const rr = inner !== null && i % 2 ? inner : r;
    const a = rot + (i * Math.PI * 2) / steps;
    pts.push(`${(50 + rr * Math.cos(a)).toFixed(1)} ${(50 + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const STAR = polygon(5, 46, 20, -Math.PI / 2);
const HEX = polygon(6, 42, null, 0);

export function PadShape({ shape, size, color }: { shape: Shape; size: number; color: string }) {
  const round = { stroke: color, strokeWidth: 7, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {shape === 'circle' ? <Circle cx={50} cy={50} r={38} fill={color} /> : null}
      {shape === 'square' ? <Rect x={16} y={16} width={68} height={68} rx={10} fill={color} /> : null}
      {shape === 'triangle' ? <Path d="M50 14 L88 82 L12 82 Z" fill={color} {...round} /> : null}
      {shape === 'star' ? <Path d={STAR} fill={color} {...round} strokeWidth={5} /> : null}
      {shape === 'diamond' ? <Path d="M50 10 L88 50 L50 90 L12 50 Z" fill={color} {...round} /> : null}
      {shape === 'hexagon' ? <Path d={HEX} fill={color} {...round} /> : null}
    </Svg>
  );
}

/** A small pad (the lobby preview, «الزر الصحيح»). */
export function MiniPad({ pad, size }: { pad: number; size: number }) {
  const p = PADS[pad] ?? PADS[0];
  return (
    <View accessibilityLabel={p.name} style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
      <PadShape shape={p.shape} size={size * 0.62} color="rgba(255,255,255,0.9)" />
    </View>
  );
}

function Pad({ pad, size, lit, enabled, onPress }: { pad: number; size: number; lit: boolean; enabled: boolean; onPress: (pad: number) => void }) {
  const p = PADS[pad];
  const pressedIn = useRef(false);
  const reduce = useReducedMotion();
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(withTiming(lit ? 1 : 0, { duration: lit ? 70 : 220, easing: Easing.out(Easing.quad) }));
  }, [lit, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() * 0.75 }));
  const light = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const lift = useAnimatedStyle(() => (reduce ? {} : { transform: [{ scale: 1 + glow.get() * 0.035 }] }));
  const r = Math.round(size * 0.2);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View pointerEvents="none" style={[styles.halo, { borderRadius: r + 8, backgroundColor: alpha(p.color, 0.55) }, halo]} />
      <Pressable
        // the pad answers the touch itself (no wait for the release); a very quick click on the web may skip
        // the press-in, so the release counts then
        onPressIn={
          enabled
            ? () => {
                pressedIn.current = true;
                onPress(pad);
              }
            : undefined
        }
        onPress={
          enabled
            ? () => {
                if (!pressedIn.current) onPress(pad);
                pressedIn.current = false;
              }
            : undefined
        }
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel={p.name}
        accessibilityState={{ disabled: !enabled }}
        style={{ flex: 1 }}>
        <Animated.View style={[styles.pad, { borderRadius: r, backgroundColor: shade(p.color, -0.38), borderColor: alpha(p.color, 0.9) }, lift]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: shade(p.color, 0.18), borderRadius: r - 2 }, light]} />
          {/* above the light (a positioned layer is drawn over its plain siblings on the web) */}
          <View style={{ zIndex: 1 }}>
            <PadShape shape={p.shape} size={Math.round(size * 0.42)} color={lit ? '#FFFFFF' : alpha('#FFFFFF', 0.72)} />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** The pads: 2×2 for four, 3×2 for six. */
export function Board({ pads, width, max, lit, enabled, onPress }: { pads: number; width: number; max: number; lit: number | null; enabled: boolean; onPress: (pad: number) => void }) {
  const cols = pads === 6 ? 3 : 2;
  const gap = Math.round(Math.max(12, width * 0.04));
  const size = Math.min(max, Math.floor((width - gap * (cols - 1)) / cols));
  const rows: number[][] = [];
  for (let i = 0; i < pads; i += cols) rows.push(Array.from({ length: Math.min(cols, pads - i) }, (_, j) => i + j));
  return (
    // the same arrangement on every phone, whatever the writing direction
    <View style={{ gap, alignSelf: 'center', direction: 'ltr', paddingVertical: 6 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap }}>
          {row.map((i) => (
            <Pad key={i} pad={i} size={size} lit={lit === i} enabled={enabled} onPress={onPress} />
          ))}
        </View>
      ))}
    </View>
  );
}

const HEART = 'M12 21s-8.5-5.1-8.5-11.2A4.8 4.8 0 0112 6.6a4.8 4.8 0 018.5 3.2C20.5 15.9 12 21 12 21z';

/** Lives as small hearts: full ones red, lost ones as a faint outline. */
export function Hearts({ lives, max, size = 16 }: { lives: number; max: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: Math.max(1, size * 0.15) }} accessibilityLabel={`القلوب: ${lives} من ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <Path d={HEART} fill={i < lives ? C.red : 'none'} stroke={i < lives ? C.red : alpha(C.muted, 0.6)} strokeWidth={2} />
        </Svg>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute', top: -7, left: -7, right: -7, bottom: -7 },
  pad: { flex: 1, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
