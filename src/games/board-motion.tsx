/**
 * Board motion kit — calm motion for board games (الشطرنج، الضامة، الخربڨة…): a moved piece glides
 * to its new square (through every square of a capture chain), a captured piece fades aside, the
 * last move's squares fade in softly, selection and legal-move hints come and go smoothly.
 * Same spirit as the card kit (src/games/cards/motion.tsx): ease-out, 200–450 ms, no bounce, no
 * overshoot, no zoom from nothing; reduced motion → no travel, short fades only.
 *
 * HOW TO USE IT
 *
 * 1. `const mv = useBoardChange(key, board)`: `key` changes with every move (e.g. the board joined
 *    plus the last move). It keeps the board as it was BEFORE the latest change (`mv.prev`) and
 *    tells whether that change may be animated (`mv.fresh`): false on the first screen, during the
 *    first ~0.7 s after mount (reconnect, joining a game in progress) and with reduced motion
 *    (`mv.live` is the same without the reduced-motion part: for plain fades). Check that `prev → board` really is the last
 *    move (two moves can arrive together): when it isn't, just don't animate.
 *
 * 2. `<Glide steps={…} ms={…}>` around the piece on its new square: `steps` are where it was
 *    before, oldest first, as offsets in px from where it now sits (one step for a plain move,
 *    one per hop for a capture chain). Re-key it per move (`key={moveKey}`); give the square a
 *    zIndex above its neighbours while it travels. `glideMs(squares)` gives a calm duration for a
 *    distance, `HOP` is the duration of one hop of a chain.
 *
 * 3. `<FadeAside delay drift reduced>` around a copy of a captured piece, drawn on the square it was
 *    taken on (only when `mv.live`): it waits `delay` ms (until the mover gets there), then fades out
 *    while drifting a few px and shrinking slightly.
 *
 * 4. `<SoftMark animate key={moveKey} style>`: the last move's from/to squares (a tinted square or
 *    ring) fading in instead of popping. `<Hint>`: a selection highlight / legal-move dot that fades
 *    in and out. `<Lift on y scale>`: a selected piece rising/growing a little, smoothly.
 *    `<Settle animate delay>`: a newly placed piece appearing (fade + growth from 94 %).
 *
 * The server stays authoritative: none of this blocks a tap or delays the state. A new move
 * re-keys the glide, so a move still travelling when the next one arrives simply lands.
 */
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

/** The one curve: decelerates gently, never overshoots. */
export const BOARD_EASE = Easing.out(Easing.cubic);

export const BOARD_MS = {
  /** one hop of a capture chain */
  hop: 240,
  /** a captured piece fading aside */
  fade: 340,
  /** the last move's squares fading in */
  mark: 260,
  /** selection / legal-move hints */
  hint: 150,
  /** a selected piece lifting */
  lift: 150,
  /** a newly placed piece settling */
  settle: 260,
  /** nothing animates this long after mount */
  settleAfterMount: 700,
} as const;
export const HOP = BOARD_MS.hop;

/** A calm duration for a glide over `squares` squares (a pawn step ≈ 250 ms, a queen across the board ≈ 420 ms). */
export const glideMs = (squares: number) => Math.round(Math.min(420, Math.max(240, 215 + 30 * squares)));

type Pt = { x: number; y: number };

/** Has the board been on screen long enough to animate? (false for ~0.7 s after mount) */
function useSettled() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), BOARD_MS.settleAfterMount);
    return () => clearTimeout(t);
  }, []);
  return settled;
}

/**
 * The board before the latest change of `key` ("store the previous value" pattern, no refs) and
 * whether that change may be animated. `prev` is null until the board has changed while on screen.
 */
export function useBoardChange<T>(key: string, value: T): { prev: T | null; fresh: boolean; live: boolean; reduced: boolean } {
  const settled = useSettled();
  const reduced = useReducedMotion();
  const [st, setSt] = useState<{ key: string; value: T; prev: T | null; fresh: boolean }>(() => ({ key, value, prev: null, fresh: false }));
  let cur = st;
  if (st.key !== key) {
    cur = { key, value, prev: st.value, fresh: settled };
    setSt(cur);
  }
  // live: the change happened on screen (a captured piece may fade); fresh: and it may travel too
  return { prev: cur.prev, fresh: cur.fresh && !reduced, live: cur.fresh, reduced };
}

/**
 * A piece arriving on its square: it glides from where it was (through every hop of a chain).
 * `steps` = earlier positions, oldest first, as px offsets from its square. Re-key per move.
 */
export function Glide({ steps, ms, hop = HOP, children, style }: { steps: Pt[]; ms?: number; hop?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useSharedValue(steps[0]?.x ?? 0);
  const y = useSharedValue(steps[0]?.y ?? 0);
  const start = useEffectEvent(() => {
    if (!steps.length) return;
    const path = [...steps.slice(1), { x: 0, y: 0 }];
    // a single move: one smooth glide; a chain: one calm hop per square, like a hand hopping the piece
    const d = path.length === 1 ? (ms ?? glideMs(1)) : hop;
    const cfg = { duration: d, easing: BOARD_EASE };
    x.set(withSequence(...path.map((p) => withTiming(p.x, cfg))));
    y.set(withSequence(...path.map((p) => withTiming(p.y, cfg))));
  });
  useEffect(() => start(), []);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/**
 * A captured piece leaving the board: after `delay` ms it fades out while drifting by `drift` px and
 * shrinking to 90 % (reduced motion: a plain short fade). Draw it absolutely on the square it was taken on.
 */
export function FadeAside({ delay = 0, drift = { x: 0, y: 0 }, reduced, children, style }: { delay?: number; drift?: Pt; reduced?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  const start = useEffectEvent(() => {
    p.set(withDelay(reduced ? 0 : delay, withTiming(1, { duration: reduced ? 160 : BOARD_MS.fade, easing: BOARD_EASE })));
  });
  useEffect(() => start(), []);
  const dx = reduced ? 0 : drift.x;
  const dy = reduced ? 0 : drift.y;
  const shrink = reduced ? 0 : 0.1;
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    return { opacity: 1 - t, transform: [{ translateX: dx * t }, { translateY: dy * t }, { scale: 1 - shrink * t }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

/** The last move's marks (from/to squares): fade in when `animate`, else simply there. Re-key per move. */
export function SoftMark({ animate, delay = 0, style, children }: { animate: boolean; delay?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const o = useSharedValue(animate ? 0 : 1);
  const start = useEffectEvent(() => {
    if (animate) o.set(withDelay(delay, withTiming(1, { duration: BOARD_MS.mark, easing: BOARD_EASE })));
  });
  useEffect(() => start(), []);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

// on the web an exiting view is replaced by a clone pinned where it was: it would stay behind if the board moved
const HINT_OUT = Platform.OS === 'web' ? undefined : FadeOut.duration(120);

/** A selection highlight or a legal-move dot: fades in when it appears (and out when it goes, except on the web). */
export function Hint({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" entering={FadeIn.duration(BOARD_MS.hint)} exiting={HINT_OUT} style={style}>
      {children}
    </Animated.View>
  );
}

/** A selected piece rising by `y` px and/or growing to `scale` (≤ 1.06), smoothly. */
export function Lift({ on, y = 0, scale = 1, children, style }: { on: boolean; y?: number; scale?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(on ? 1 : 0, { duration: BOARD_MS.lift, easing: BOARD_EASE }));
  }, [on, p]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: -y * p.get() }, { scale: 1 + (scale - 1) * p.get() }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A newly placed piece: fades in while growing from 94 % (only when `animate`; a short stagger via `delay`). */
export function Settle({ animate, delay = 0, children, style }: { animate: boolean; delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(animate ? 0 : 1);
  const start = useEffectEvent(() => {
    if (animate) p.set(withDelay(delay, withTiming(1, { duration: BOARD_MS.settle, easing: BOARD_EASE })));
  });
  useEffect(() => start(), []);
  const anim = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.94 + 0.06 * p.get() }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A unit vector from `a` to `b` scaled to `len` px (a captured piece drifting on in the mover's direction). */
export function nudge(a: Pt, b: Pt, len: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  return d ? { x: (dx / d) * len, y: (dy / d) * len } : { x: 0, y: len };
}
