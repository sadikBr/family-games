/**
 * Small, calm touches shared by the quiz family, the score strips and a few board games (معركة
 * السفن، المربعات): a «+80» that floats up once next to a player, a ring that ripples once on a
 * board (numbers that count up instead of jumping: `CountUp` in src/ui/fun.tsx). Same language as the card motion kit
 * (src/games/cards/motion.tsx): ease-out, a few hundred ms, no bounce, no overshoot, no zoom from
 * nothing; reduced motion → the new value / state at once.
 *
 * Nothing replays when a screen opens (reconnect, joining mid-game): `useSettled()` is false for
 * ~0.7 s after mount, and components that animate on their own mount (the round's results) ask
 * `screenAge()` how long the game screen has been open (`useScreenClock()` in the game screen —
 * `useMyResultFx` in islamic-ui calls it for every quiz).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

export const EASE = Easing.out(Easing.cubic);

/** nothing animates this long after a screen opens */
export const SETTLE_MS = 700;

/** false during the first ~0.7 s after the component mounts, then true. */
export function useSettled(ms: number = SETTLE_MS) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return settled;
}

// —— how long the game screen has been open ——————————————————————————————————————————

let screenAt = 0;
const stamp = () => {
  screenAt = Date.now();
  return screenAt;
};

/** Call once at the top of a game screen: remembers when it opened (read by `screenAge`). */
export function useScreenClock() {
  useState(stamp);
}

/** ms since the current game screen opened (very large when no screen called `useScreenClock`). */
export const screenAge = () => Date.now() - screenAt;

// counting up: `useCountUp` / `CountUp` live with the scoreboards in src/ui/fun.tsx

// —— a «+80» floating up once ———————————————————————————————————————————————————————

/**
 * A small label that rises ~14 px and fades out, once, when it mounts (re-key it for the next one).
 * Place it absolutely where it should start (it never takes taps).
 */
export function FloatUp({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: reduced ? 700 : 1150, easing: Easing.out(Easing.quad) })));
  }, [p, delay, reduced]);
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    return {
      opacity: interpolate(t, [0, 0.15, 0.65, 1], [0, 1, 1, 0]),
      transform: [{ translateY: reduced ? 0 : 4 - 18 * t }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', zIndex: 20 }, style, anim]}>
      {children}
    </Animated.View>
  );
}

// —— a ring that ripples once ——————————————————————————————————————————————————————————

/**
 * A soft ring centred at (cx, cy) of its (relatively positioned) parent: grows from `from`×`size`
 * to `to`×`size` while fading out, once, when it mounts. Reduced motion → nothing.
 */
export function Ripple({
  cx,
  cy,
  size,
  color,
  from = 0.5,
  to = 1.5,
  ms = 650,
  width = 2,
  opacity = 0.85,
  delay = 0,
}: {
  cx: number;
  cy: number;
  size: number;
  color: ColorValue;
  from?: number;
  to?: number;
  ms?: number;
  width?: number;
  opacity?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!reduced) p.set(withDelay(delay, withTiming(1, { duration: ms, easing: EASE })));
  }, [p, ms, delay, reduced]);
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    return { opacity: t === 0 || t === 1 ? 0 : opacity * (1 - t), transform: [{ scale: from + (to - from) * t }] };
  });
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: color }, anim]}
    />
  );
}
