/**
 * «شبكة الكلمات» — calm motion for the board: another player's word appears tile by tile (each tile
 * settles in with a short fade, in reading order), and the word's points count up in a small chip above
 * it. The tiles I put down glide from my rack and my rack refills by itself through the card motion kit
 * (CardStage / CardMotion in cards/motion.tsx, see scrabble.tsx). Nothing animates in the first moments
 * after the screen opens (reconnect, joining in the middle of a game). Reduced motion: short fades, the
 * points shown at once.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { C, F } from '@/theme';
import { Txt, num } from '@/ui/txt';

import { EASE } from './cards/motion';

/** A tile of a word settling in, and the gap between two tiles of the word. */
export const ARRIVE = { ms: 340, stagger: 145 } as const;
/** How long the points take to count up, and how long the chip stays before it fades away. */
const COUNT_MS = 800;
const BADGE_STAY_MS = 3200;

/** False for the first moments after the screen opens. */
export function useSettled(ms = 700): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return settled;
}

/** A tile of another player's word: comes down a few pixels while fading in, after `delay`. Re-key it per move. */
export function Arrive({ delay, children }: { delay: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: reduced ? 160 : ARRIVE.ms, easing: EASE })));
  }, [delay, reduced, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: reduced ? 0 : -5 * (1 - p.get()) }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/** The number counting up from 0 to `to` (a dozen steps, starting after `delay`). */
function useCountUp(to: number, delay: number, instant: boolean): number {
  const [v, setV] = useState(instant ? to : 0);
  useEffect(() => {
    if (instant) return;
    const steps = Math.max(1, Math.min(12, to));
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let k = 1; k <= steps; k++) timers.push(setTimeout(() => setV(Math.round((to * k) / steps)), delay + (COUNT_MS * k) / steps));
    return () => timers.forEach(clearTimeout);
  }, [to, delay, instant]);
  return instant ? to : v;
}

/**
 * «+23» above the word just played: fades in once its tiles are down, counts up, stays a moment and
 * fades away (the word itself stays marked on the board). Placed absolutely by the board; re-key per move.
 */
export function ScoreBadge({ score, delay, left, top, width }: { score: number; delay: number; left: number; top: number; width: number }) {
  const reduced = useReducedMotion();
  const shown = useCountUp(score, delay, reduced);
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay, withSequence(withTiming(1, { duration: 200, easing: EASE }), withDelay(COUNT_MS + BADGE_STAY_MS, withTiming(0, { duration: 420, easing: EASE })))));
  }, [delay, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: reduced ? 0 : 3 * (1 - o.get()) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.badgeBox, { left, top, width }, anim]}>
      <View style={styles.badge}>
        <Txt style={styles.badgeText}>{num(`+${shown}`)}</Txt>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badgeBox: { position: 'absolute', alignItems: 'center' },
  badge: { backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  badgeText: { fontFamily: F.black, fontSize: 14, lineHeight: 20, color: '#FFFFFF' },
});
