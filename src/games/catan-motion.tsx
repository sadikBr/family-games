/**
 * Calm board motion for «المستوطنون» and «المدن والطرق» (also used by carca-motion.tsx).
 *
 * - `useSettled()`: false during the first ~0.7 s after a component mounts, so a reconnect or joining a
 *   game in progress never replays anything.
 * - `<Settle>`: a layer that arrives with a short fade and a small settle (a few pixels down, or a
 *   1.04 → 1 scale), never a zoom from nothing. Reduced motion → a plain short fade.
 * - `<Flyer>`: something small gliding from one point to another over the whole screen (a resource
 *   from its hex to the player's chip, a follower going back to its owner), with a short fade at both
 *   ends and the faintest arc.
 * - `<CountUp>`: a score that counts up to its new value (a few steps, never per frame).
 * - `Spots`: where things are on screen, for flights between two panels (measured relative to one root).
 *
 * Everything is purely visual: no state waits for an animation, taps are never blocked, and a new
 * change simply replaces the one still running (keyed layers re-mount).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Txt, type TxtProps } from '@/ui/txt';

import { EASE, MOTION } from './cards/motion';

export { EASE };

export const BOARD_MOTION = {
  /** a piece / tile / follower settling into place */
  settle: 500,
  /** the robber gliding to its new hex */
  robber: 600,
  /** a resource / follower flying to a player's chip, and the gap between two of them */
  fly: 800,
  stagger: 145,
} as const;

type Pt = { x: number; y: number };

/** False during the first ~0.7 s after mount (reconnect / first screen: nothing animates). */
export function useSettled(ms: number = MOTION.settle): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return settled;
}

/**
 * A layer that settles into place when it mounts (`animate`): opacity from `from` to 1 and either a
 * small drop (`drop` px) or a slight scale down (`scale` → 1). Static when `animate` is false.
 */
export function Settle({
  animate,
  children,
  style,
  delay = 0,
  drop = 5,
  scale = 1,
  from = 0,
  out,
  duration = BOARD_MOTION.settle,
}: {
  animate: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  drop?: number;
  scale?: number;
  from?: number;
  /** leave instead of arriving: fade out in place (from `from`, or 1) */
  out?: boolean;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) p.set(withDelay(delay, withTiming(1, { duration: reduced ? 160 : duration, easing: EASE })));
    // decided once, when the layer mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const still = reduced;
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    // leaving: fades from `from` (or 1) to nothing in place, coming down from `scale` to 1 meanwhile
    if (out) return still ? { opacity: (from || 1) * (1 - t) } : { opacity: (from || 1) * (1 - t), transform: [{ scale: scale + (1 - scale) * t }] };
    // the fade is a little quicker than the settle, so the piece is solid while it comes to rest
    const o = from + (1 - from) * Math.min(1, t / 0.7);
    if (still) return { opacity: o };
    return { opacity: o, transform: [{ translateY: -drop * (1 - t) }, { scale: scale + (1 - scale) * t }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

/**
 * Something small gliding from `from` to `to` (centres, in the coordinates of the overlay it is drawn
 * in), `size` px square. Fades in at the start, out at the very end; `onDone` when it has landed.
 */
export function Flyer({ from, to, size, delay = 0, duration = BOARD_MOTION.fly, endScale = 0.8, children }: { from: Pt; to: Pt; size: number; delay?: number; duration?: number; endScale?: number; children: ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration, easing: EASE })));
    // decided once, when it mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const arc = Math.min(18, Math.hypot(to.x - from.x, to.y - from.y) * 0.06);
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    return {
      opacity: interpolate(t, [0, 0.1, 0.82, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: from.x + (to.x - from.x) * t - size / 2 },
        { translateY: from.y + (to.y - from.y) * t - size / 2 - arc * Math.sin(Math.PI * t) },
        { scale: interpolate(t, [0, 0.1, 0.7, 1], [0.92, 1, 1, endScale]) },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }, anim]}>{children}</Animated.View>;
}

/**
 * A number that counts up (or down) to its new value in a few calm steps, starting after `delay` ms
 * (e.g. when the follower that earned the points has landed). Jumps straight there before the screen
 * has settled and with reduced motion.
 */
export function CountUp({
  value,
  delay = 0,
  render,
  v,
  color,
  style,
  animate = true,
}: {
  value: number;
  delay?: number;
  render: (v: number) => string;
  v?: TxtProps['v'];
  color?: string;
  style?: StyleProp<TextStyle>;
  animate?: boolean;
}) {
  const reduced = useReducedMotion();
  const [st, setSt] = useState({ target: value, shown: value, from: value, delay: 0 });
  let cur = st;
  if (st.target !== value) {
    cur = animate && !reduced ? { target: value, shown: st.shown, from: st.shown, delay } : { target: value, shown: value, from: value, delay: 0 };
    setSt(cur);
  }
  const { shown, target, from } = cur;
  const wait = cur.delay;
  useEffect(() => {
    if (shown === target) return;
    // at most ~10 steps, ~80 ms apart
    const step = Math.max(1, Math.ceil(Math.abs(target - from) / 10));
    const t = setTimeout(
      () =>
        setSt((s) => {
          if (s.target !== target) return s;
          const next = target > s.shown ? Math.min(target, s.shown + step) : Math.max(target, s.shown - step);
          return { ...s, shown: next };
        }),
      shown === from ? wait : 80,
    );
    return () => clearTimeout(t);
  }, [shown, target, from, wait]);
  return (
    <Txt v={v} color={color} style={style}>
      {render(shown)}
    </Txt>
  );
}

/** Where things are on screen: a root, named nodes inside it, measured relative to the root. */
export class Spots {
  root: View | null = null;
  nodes = new Map<string, View | null>();
  setRoot(n: View | null) {
    this.root = n;
  }
  set(key: string, n: View | null) {
    if (n) this.nodes.set(key, n);
    else this.nodes.delete(key);
  }
  /** the box of a named node relative to the root (null when it isn't on screen) */
  measure(key: string): Promise<{ x: number; y: number; w: number; h: number } | null> {
    const node = this.nodes.get(key);
    const root = this.root;
    return new Promise((resolve) => {
      if (!node || !root) return resolve(null);
      try {
        node.measureLayout(
          root,
          (x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null),
          () => resolve(null),
        );
      } catch {
        resolve(null);
      }
    });
  }
}
