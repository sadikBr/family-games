/**
 * «الدومينو» — the table: a felt panel with the line of play laid out as a snake that turns at the edges
 * (src/shared/games/domino-layout.ts), the tiles drawn with their pips, and the two open ends marked by
 * dashed slots with their number. While I choose where a tile goes, the ends it fits glow and take taps.
 * The newest tile settles in with a short fade and a small drop; the picture glides when a new row
 * starts.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { DominoEnd, DominoPlaced } from '@/shared/games/domino';
import { dominoUnit, layoutLine } from '@/shared/games/domino-layout';
import { C, F, alpha } from '@/theme';
import { dk } from '@/ui/layout';
import { Txt, num } from '@/ui/txt';

import { EASE } from './cards/motion';
import { DominoFace } from './domino-tile';
import { useSettled } from './touch-motion';

const FELT = '#1E6B4A';
const FELT_EDGE = '#124530';
const GLOW = C.yellow;
const PAD = 10;
const BIG = 1000;

export function DominoBoard({
  line,
  anchor,
  width,
  lastSeq,
  choosing,
  onEnd,
  empty,
}: {
  line: DominoPlaced[];
  anchor: number;
  width: number;
  /** the newest tile's move number (it settles in) */
  lastSeq: number | null;
  /** the ends I may tap now */
  choosing: DominoEnd[];
  onEnd: (end: DominoEnd) => void;
  /** the words shown on an empty table */
  empty: string;
}) {
  const inner = width - 2 * PAD;
  const u = dominoUnit(inner, dk(26));
  const lay = layoutLine(line, anchor, inner, u, 2);
  const minH = 5 * u;
  const contentH = lay.maxY - lay.minY;
  const height = Math.max(minH, contentH) + 2 * PAD;
  // content centred when it is shorter than the minimum
  const offset = PAD - lay.minY + Math.max(0, (minH - contentH) / 2);

  const settled = useSettled();
  const reduced = useReducedMotion();
  const off = useSharedValue(offset);
  const hgt = useSharedValue(height);
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduced) {
      first.current = false;
      off.set(offset);
      hgt.set(height);
      return;
    }
    off.set(withTiming(offset, { duration: 380, easing: EASE }));
    hgt.set(withTiming(height, { duration: 380, easing: EASE }));
  }, [offset, height, off, hgt, reduced]);
  const panelStyle = useAnimatedStyle(() => ({ height: hgt.value }));
  const layerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: off.value }] }));

  return (
    <Animated.View
      accessibilityLabel={line.length ? `على الطاولة ${num(line.length)} قطعة، والطرفان ${num(line[0].l)} و${num(line[line.length - 1].r)}` : empty}
      style={[{ width, alignSelf: 'center', borderRadius: 20, backgroundColor: FELT, borderWidth: 2, borderColor: FELT_EDGE, overflow: 'hidden', direction: 'ltr' }, panelStyle]}>
      {/* a soft light in the middle of the felt */}
      <View pointerEvents="none" style={{ position: 'absolute', left: '15%', right: '15%', top: '20%', bottom: '20%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)' }} />
      {!line.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
          <Txt v="bold" center color="rgba(255,255,255,0.75)">
            {empty}
          </Txt>
        </View>
      ) : null}
      {/* a tall layer (so every tile and end sits inside it and takes taps on Android) that glides as a whole */}
      <Animated.View style={[{ position: 'absolute', left: PAD, top: -BIG, width: inner, height: 3 * BIG }, layerStyle]}>
        {lay.tiles.map((t, i) => (
          <LaidTile key={line[i].id} x={t.x} y={t.y + BIG} w={t.w} h={t.h} first={t.first} second={t.second} fresh={settled && line[i].seq === lastSeq} />
        ))}
        {line.length
          ? lay.ghosts.map((g) => (
              <Ghost key={g.end} x={g.x} y={g.y + BIG} w={g.w} h={g.h} value={g.value} on={choosing.includes(g.end)} dim={choosing.length > 0} u={u} onPress={() => onEnd(g.end)} />
            ))
          : null}
      </Animated.View>
    </Animated.View>
  );
}

/** A tile on the table; the newest one fades in with a small drop. */
function LaidTile({ x, y, w, h, first, second, fresh }: { x: number; y: number; w: number; h: number; first: number; second: number; fresh: boolean }) {
  const reduced = useReducedMotion();
  // decided once, when the tile lands
  const [animate] = useState(fresh && !reduced);
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) p.set(withTiming(1, { duration: 360, easing: EASE }));
  }, [animate, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * -8 }, { scale: 1 + (1 - p.value) * 0.12 }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, height: h, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }, style]}>
      <DominoFace first={first} second={second} w={w} h={h} />
    </Animated.View>
  );
}

/** An open end: a dashed slot with its number; it glows and takes a tap while I choose an end. */
function Ghost({ x, y, w, h, value, on, dim, u, onPress }: { x: number; y: number; w: number; h: number; value: number; on: boolean; dim: boolean; u: number; onPress: () => void }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(on && !reduced ? withRepeat(withTiming(1, { duration: 700 }), -1, true) : withTiming(0, { duration: 150 }));
  }, [on, reduced, pulse]);
  const glow = useAnimatedStyle(() => ({ opacity: on ? 0.55 + 0.45 * pulse.value : 1 }));
  const badge = Math.round(Math.max(18, u * 0.95));
  return (
    <Pressable
      disabled={!on}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={on ? `ضع القطعة عند الطرف ${value}` : `طرف مفتوح: ${value}`}
      hitSlop={8}
      style={{ position: 'absolute', left: x, top: y, width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            borderRadius: u * 0.18,
            borderWidth: on ? 2.5 : 1.5,
            borderStyle: on ? 'solid' : 'dashed',
            borderColor: on ? GLOW : 'rgba(255,255,255,0.45)',
            backgroundColor: on ? alpha(GLOW, 0.28) : 'rgba(255,255,255,0.06)',
          },
          glow,
        ]}
      />
      <View
        style={{
          width: badge,
          height: badge,
          borderRadius: badge / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? GLOW : dim ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.35)',
          borderWidth: 1,
          borderColor: on ? C.ink : 'rgba(255,255,255,0.5)',
        }}>
        <Txt style={{ fontFamily: F.black, fontSize: Math.round(badge * 0.62), lineHeight: Math.round(badge * 0.95), color: on ? C.ink : C.text, textAlign: 'center' }}>{num(value)}</Txt>
      </View>
    </Pressable>
  );
}
