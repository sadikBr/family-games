/**
 * «كلمة السر» tiles that turn over to show their colour, one after another (like the real game, but
 * calmer): each tile folds to its edge and opens again in its colour (250 ms), the next one 120 ms
 * later. Only a colour arriving while the screen is open turns a tile over; tiles that already had
 * their colour when the screen opened (reconnect, a new phone) just show it. Reduced motion: the
 * colour fades in. And `RefusedHalo`: a soft red outline that fades in and out around the row being
 * typed when the server refuses the word (no shaking).
 */
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import type { WordleMark } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Txt } from '@/ui/txt';

import { EASE } from './cards/motion';

export const MARK_BG: Record<WordleMark, string> = { g: '#2FB67C', y: '#F2B33D', x: '#5B6080' };

/** One half of a turn (to the edge, then back open), and the gap between two tiles of a row. */
export const FLIP = { half: 125, stagger: 120 } as const;
/** How long a whole row of `n` tiles takes to show its colours. */
export const flipTotal = (n: number) => (n - 1) * FLIP.stagger + 2 * FLIP.half;

/** Nothing turns over this long after the screen opens (reconnect, joining in the middle of a round). */
const SETTLE_MS = 700;

/** False for the first moments after the screen opens. */
export function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, []);
  return settled;
}

/**
 * The turn of one tile: 0 = plain face, 1 = its colour (at 0.5 the tile is edge-on and the face changes).
 * `onMount`: a tile that mounts with its colour turns over too (the others' small rows, which appear with
 * their colours); otherwise only a colour arriving later turns it over.
 */
function useFlip(mark: WordleMark | undefined, index: number, animate: boolean, onMount: boolean) {
  const reduced = useReducedMotion();
  const p = useSharedValue(mark && !(animate && onMount) ? 1 : 0);
  const first = useRef(true);
  const run = useEffectEvent((m: WordleMark | undefined) => {
    const mounting = first.current;
    first.current = false;
    if (!m) {
      p.set(0);
      return;
    }
    if (mounting && !(animate && onMount)) return; // already showing its colour
    if (!animate) p.set(1);
    else if (reduced) p.set(withTiming(1, { duration: 160 }));
    else {
      p.set(0);
      p.set(withDelay(index * FLIP.stagger, withSequence(withTiming(0.5, { duration: FLIP.half, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: FLIP.half, easing: EASE }))));
    }
  });
  useEffect(() => run(mark), [mark]);
  const turn = useAnimatedStyle(() => {
    const t = p.get();
    return reduced ? {} : { transform: [{ perspective: 400 }, { rotateX: `${(t < 0.5 ? t : 1 - t) * 180}deg` }] };
  });
  const colour = useAnimatedStyle(() => ({ opacity: reduced ? p.get() : p.get() >= 0.5 ? 1 : 0 }));
  return { turn, colour };
}

/** A tile of my grid: a typed letter, or a guessed letter with its colour. */
export function FlipTile({ ch, mark, size, index, animate, active }: { ch: string; mark?: WordleMark; size: number; index: number; animate: boolean; active?: boolean }) {
  const { turn, colour } = useFlip(mark, index, animate, false);
  return (
    <Animated.View style={[styles.tile, { width: size, height: size }, ch ? styles.tileFilled : null, active && !ch && styles.tileActive, turn]}>
      {mark ? <Animated.View pointerEvents="none" style={[styles.face, { backgroundColor: MARK_BG[mark], borderColor: MARK_BG[mark] }, colour]} /> : null}
      <Txt style={{ fontFamily: F.display, fontSize: size * 0.5, lineHeight: size * 0.75, color: mark ? '#FFFFFF' : C.text }}>{ch}</Txt>
    </Animated.View>
  );
}

/** A small square of another player's row (colours only, never letters). */
export function MiniTile({ mark, index, animate }: { mark?: WordleMark; index: number; animate: boolean }) {
  const { turn, colour } = useFlip(mark, index, animate, true);
  return (
    <Animated.View style={[styles.mini, turn]}>
      {mark ? <Animated.View pointerEvents="none" style={[styles.miniFace, { backgroundColor: MARK_BG[mark] }, colour]} /> : null}
    </Animated.View>
  );
}

/** A soft red outline around the row being typed while `on` (a word the server refused). */
export function RefusedHalo({ on }: { on: boolean }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withTiming(on ? 1 : 0, { duration: on ? 180 : 420, easing: EASE }));
  }, [on, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View pointerEvents="none" style={[styles.halo, anim]} />;
}

/** The row of tiles with the refused outline behind it. */
export function TileRow({ children, refused }: { children: ReactNode; refused?: boolean }) {
  return (
    <View style={styles.row}>
      {refused !== undefined ? <RefusedHalo on={refused} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  tile: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, backgroundColor: C.surface },
  tileFilled: { borderColor: alpha('#FFFFFF', 0.55) },
  tileActive: { borderColor: C.yellow },
  // the colour covers the whole tile, border included (the tile's own border is 2 px)
  face: { position: 'absolute', left: -2, top: -2, right: -2, bottom: -2, borderRadius: 10, borderWidth: 2 },
  halo: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: 14, borderWidth: 2, borderColor: alpha(C.red, 0.75), backgroundColor: alpha(C.red, 0.12) },
  mini: { width: 9, height: 9, borderRadius: 2, backgroundColor: C.surfaceStrong, overflow: 'hidden' },
  miniFace: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 2 },
});
