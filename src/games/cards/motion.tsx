/**
 * Card motion kit — cards that glide instead of popping in and out. Calm on purpose: ease-out
 * curves, about 350–750 ms (unhurried: the family follows every card), no bounce, no overshoot, no zoom from nothing. Works the same on Android and
 * on the web (plain shared values + `withTiming`, positions measured with `measureLayout`).
 *
 * HOW TO ADOPT IT IN A CARD GAME (phase 2: التريس، الكانزة، الكونكان، أونو، الكذّاب، فاز 10…)
 *
 * 1. Wrap the whole game screen (every phase, so the stage stays mounted between hands) in
 *    `<CardStage>`. It replaces the fragment the game returned (it keeps Screen's 14 px gap) and
 *    draws the flying cards in an overlay above everything. Put it INSIDE any context provider the
 *    cards need (e.g. Baloot's `MoroccoDeck`), because flying clones are rendered in the overlay.
 *
 * 2. Wrap every card that may move in `<CardMotion id={card.id} …>` (CardRow / LastPlay in card-ui
 *    already do it when given `motion`). The same `id` in two places is what makes a card fly:
 *    when a card mounts with `enter` set and another `CardMotion` with the same id is (or was a
 *    moment ago) on screen, the new one stays hidden while a clone glides from the old place to the
 *    new one, then it appears. So my card going from the hand to the table, a captured card going
 *    from the table into the «last play» panel, Baloot's face-up card going into the buyer's hand…
 *    all fly by themselves — nothing to call when sending the move.
 *      enter="play"  a card arriving on the table: flies from its old spot if there is one,
 *                    otherwise slides in from `from` (the seat of the player who played it).
 *      enter="deal"  a card arriving in my hand: slides in from `from` (the deck / table side) with
 *                    a short stagger between the cards that arrive together.
 *      source={false} this copy is never a flight origin (a duplicate shown elsewhere).
 *      place={{ x, y, rot }} for absolutely placed cards (a fan, seats around a table): left/top/
 *                    rotation glide when they change. Without `place` the card is in a flex row and
 *                    `flow` gives it a smooth layout transition (the hand closing a gap).
 *      leaving + leave={{ to, via }} the card goes away: it moves by `to` (offset in px from where it
 *                    is, optionally through `via` first: a trick gathering in the middle) and fades.
 *    Nothing animates during the first ~0.7 s after the stage mounts (reconnect, joining a game in
 *    progress): the screen just appears. Reduced motion (system setting) → short fades only.
 *
 * 3. `useLeaving(items, keyOf)` keeps items that just disappeared from server state for a moment,
 *    flagged `leaving`, so they can animate out (render them with `<CardMotion leaving …>`).
 *
 * 4. In the card face itself use `useCardLook({ lift, dim })` for a smooth selection lift and
 *    legal/illegal dimming; put the Pressable INSIDE the animated view so the hit area follows the
 *    lift. And `useTapToPlay` (card-ui.tsx) for «tap once to select, tap again to play».
 *
 * 5. Small extras: `<SoftNumber>` (a score that changes softly), `<TurnHalo>` (a calm breathing
 *    glow behind the avatar of the player whose turn it is), `<WinGlow>` (a soft halo behind the
 *    card that took a trick).
 *
 * The server stays authoritative: animation is purely visual, never blocks a tap, never delays
 * state. A card whose flight is interrupted (the hand ends, the trick is cleared) just disappears
 * with its screen; an overlay clone always finishes and removes itself.
 */
import { createContext, use, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { C } from '@/theme';

/** The one curve for cards: decelerates gently, never overshoots. */
export const EASE = Easing.out(Easing.cubic);
const EASE_IN_OUT = Easing.inOut(Easing.cubic);

export const MOTION = {
  /** a card flying from one place to another (my card from the hand to the table) */
  fly: 500,
  /** a card sliding in from a player's seat */
  enter: 420,
  /** a card dealt into my hand, and the gap between two dealt cards */
  deal: 400,
  stagger: 70,
  /** cards gathering and leaving (a collected trick) */
  leave: 740,
  /** a card moving to its new place (the hand closing a gap) */
  glide: 340,
  /** selection lift / dimming */
  lift: 190,
  /** nothing animates this long after the stage mounts (reconnect / first screen) */
  settle: 700,
} as const;

export type Side = 'top' | 'bottom' | 'left' | 'right';
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number; rot: number };

/** How far a card starts from its place when it slides in from a side. */
const SIDE_OFFSET = 46;
const sideVec = (s: Side, d = SIDE_OFFSET): Pt =>
  s === 'top' ? { x: 0, y: -d } : s === 'bottom' ? { x: 0, y: d } : s === 'left' ? { x: -d, y: 0 } : { x: d, y: 0 };

// —— the stage ————————————————————————————————————————————————————————————————————————

type Spot = { id: string; node: View | null; rect: Rect | null; rot: number; source: boolean };
type Flight = { key: number; from: Rect; to: Rect; node: ReactNode; onLand: () => void };

/** Mutable bookkeeping shared by the cards of one stage (never read during render, except `hasSource` in a state initializer). */
class Registry {
  root: View | null = null;
  spots = new Map<number, Spot>();
  gone = new Map<string, Rect>();
  private seq = 0;
  private refreshT: ReturnType<typeof setTimeout> | null = null;
  private staggerAt = 0;
  private staggerK = 0;
  private onFlight: (f: Omit<Flight, 'key'>) => void = () => {};

  setRoot(n: View | null) {
    this.root = n;
  }
  /** the stage listens for new flights (null: stops) */
  listen(fn: ((f: Omit<Flight, 'key'>) => void) | null) {
    this.onFlight = fn ?? (() => {});
  }
  addFlight(f: Omit<Flight, 'key'>) {
    this.onFlight(f);
  }
  token() {
    this.seq += 1;
    return this.seq;
  }
  /** Is this card on screen elsewhere (or was it a moment ago)? Then a new copy of it flies from there. */
  hasSource(id: string) {
    if (this.gone.has(id)) return true;
    for (const s of this.spots.values()) if (s.id === id && s.source && s.rect) return true;
    return false;
  }
  sourceRect(id: string, self: number): Rect | null {
    for (const [k, s] of this.spots) if (k !== self && s.id === id && s.source && s.rect) return s.rect;
    return this.gone.get(id) ?? null;
  }
  /** Delay for a card dealt now: cards arriving together come one after another. */
  stagger(now: number) {
    if (now - this.staggerAt > 180) this.staggerK = 0;
    this.staggerAt = now;
    const k = Math.min(this.staggerK, 9);
    this.staggerK += 1;
    return k * MOTION.stagger;
  }
  /**
   * A card that does not render again keeps the place it was measured at, but the cards around it
   * move it (a drawn card inserted before it in a sorted hand, a row that wraps differently): a
   * moment after any card comes, goes or renders (once the glides are over), measure them all again.
   */
  refreshSoon() {
    if (this.refreshT) clearTimeout(this.refreshT);
    this.refreshT = setTimeout(() => {
      this.refreshT = null;
      for (const [k, s] of this.spots)
        this.measure(s.node, s.rot, (r) => {
          // a card gone meanwhile keeps the place it left from (see `gone`)
          if (this.spots.get(k) === s) s.rect = r;
        });
    }, MOTION.glide + 40);
  }
  measure(node: View | null, rot: number, done: (r: Rect) => void) {
    const root = this.root;
    if (!node || !root) return;
    try {
      node.measureLayout(
        root,
        (x, y, w, h) => {
          if (w > 0 && h > 0) done({ x, y, w, h, rot });
        },
        () => {},
      );
    } catch {
      // a node that is already gone: nothing to measure
    }
  }
}

type Stage = { reg: Registry; settled: boolean; reduced: boolean };
const StageCtx = createContext<Stage | null>(null);

/** The stage, for games that need to know whether motion is on (`settled`, `reduced`). Null outside a CardStage. */
export const useCardStage = () => use(StageCtx);

export function CardStage({ children, gap = 14, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const [reg] = useState(() => new Registry());
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    let key = 0;
    reg.listen((f) => {
      key += 1;
      const k = key;
      setFlights((list) => [...list.slice(-11), { ...f, key: k }]);
    });
    const t = setTimeout(() => setSettled(true), MOTION.settle);
    return () => {
      clearTimeout(t);
      reg.listen(null);
    };
  }, [reg]);
  const done = (key: number) => setFlights((list) => list.filter((f) => f.key !== key));
  return (
    <StageCtx value={{ reg, settled, reduced }}>
      <View
        ref={(n) => reg.setRoot(n)}
        style={[{ gap }, style]}>
        {children}
        <View pointerEvents="none" style={styles.overlay}>
          {flights.map((f) => (
            <FlightView key={f.key} f={f} done={done} />
          ))}
        </View>
      </View>
    </StageCtx>
  );
}

function FlightView({ f, done }: { f: Flight; done: (key: number) => void }) {
  const p = useSharedValue(0);
  const start = useEffectEvent(() => {
    p.set(withTiming(1, { duration: MOTION.fly, easing: EASE }));
    const land = setTimeout(f.onLand, MOTION.fly);
    // the clone stays one more frame or two over the real card, so there is never a blink
    const end = setTimeout(() => done(f.key), MOTION.fly + 70);
    return () => {
      clearTimeout(land);
      clearTimeout(end);
    };
  });
  useEffect(() => start(), []);
  const { from, to } = f;
  const sx = from.x + from.w / 2;
  const sy = from.y + from.h / 2;
  const ex = to.x + to.w / 2;
  const ey = to.y + to.h / 2;
  const k = from.w / to.w;
  // a very slight arc, like a card tossed onto the table (never more than 14 px)
  const arc = Math.min(14, Math.hypot(ex - sx, ey - sy) * 0.06);
  const style = useAnimatedStyle(() => {
    const t = p.get();
    return {
      transform: [
        { translateX: sx + (ex - sx) * t - to.w / 2 },
        { translateY: sy + (ey - sy) * t - to.h / 2 - arc * Math.sin(Math.PI * t) },
        { rotate: `${from.rot + (to.rot - from.rot) * t}deg` },
        { scale: k + (1 - k) * t },
      ],
    };
  });
  return <Animated.View style={[styles.flight, { width: to.w, height: to.h }, style]}>{f.node}</Animated.View>;
}

// —— one card ——————————————————————————————————————————————————————————————————————————

export interface CardMotionProps {
  /** the card's id: the same id elsewhere on screen is where a flight starts */
  id: string;
  children: ReactNode;
  /** how the card arrives when it mounts (after the stage has settled) */
  enter?: 'play' | 'deal' | 'none';
  /** the side it slides in from when it does not fly (the player's seat, or the deck for a deal) */
  from?: Side;
  /** may a new copy of this card fly from here? (default true) */
  source?: boolean;
  /** absolutely placed card: left/top of its box and its resting angle; changes glide */
  place?: { x: number; y: number; rot?: number };
  /** flex-row card: smooth layout transition when its place in the row changes */
  flow?: boolean;
  /** the card is going away (see useLeaving) */
  leaving?: boolean;
  /** where it goes when leaving, as offsets from its place: through `via` (optional) to `to` */
  leave?: { to: Pt; via?: Pt; scale?: number };
  style?: StyleProp<ViewStyle>;
}

export function CardMotion({ id, children, enter = 'none', from = 'top', source = true, place, flow, leaving, leave, style }: CardMotionProps) {
  const stage = use(StageCtx);
  const reg = stage?.reg;
  const rot = place?.rot ?? 0;
  const [token] = useState(() => reg?.token() ?? 0);
  // decided once, when the card mounts
  const [plan] = useState<'fly' | 'slide' | 'none'>(() => {
    if (!stage || !stage.settled || enter === 'none') return 'none';
    if (reg!.hasSource(id)) return 'fly';
    return 'slide';
  });
  const reduced = !!stage?.reduced;
  const off = plan === 'slide' && !reduced ? sideVec(from, enter === 'deal' ? 38 : SIDE_OFFSET) : { x: 0, y: 0 };
  // entry progress: 0 = hidden at the side, 1 = in place
  const enterP = useSharedValue(plan === 'slide' ? 0 : 1);
  const shown = useSharedValue(plan === 'fly' ? 0 : 1);
  const leaveP = useSharedValue(0);
  const px = useSharedValue(place?.x ?? 0);
  const py = useSharedValue(place?.y ?? 0);
  const pr = useSharedValue(rot);
  const node = useRef<View | null>(null);

  // register as a spot; keep its last place when it goes, for a copy that arrives right after
  useLayoutEffect(() => {
    if (!reg) return;
    reg.spots.set(token, { id, node: node.current, rect: null, rot, source });
    return () => {
      const s = reg.spots.get(token);
      reg.spots.delete(token);
      reg.refreshSoon();
      if (s?.rect && s.source) {
        reg.gone.set(id, s.rect);
        // only for a copy arriving in the same moment (same commit or the next one)
        setTimeout(() => {
          if (reg.gone.get(id) === s.rect) reg.gone.delete(id);
        }, 400);
      }
    };
    // the spot is keyed by the card (a parent re-keys the CardMotion when the card changes);
    // rot / source are kept up to date after each render below
  }, [reg, token, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // after every render: remember where the card is now (layout moves when panels come and go)
  useEffect(() => {
    if (!reg) return;
    const s = reg.spots.get(token);
    if (!s) return;
    s.rot = rot;
    s.source = source;
    s.node = node.current;
    reg.measure(node.current, rot, (r) => {
      const cur = reg.spots.get(token);
      if (cur) cur.rect = r;
    });
    reg.refreshSoon();
  });

  // arrival
  const arrive = useEffectEvent(() => {
    if (plan === 'none' || !reg) return;
    if (plan === 'fly') {
      const src = reg.sourceRect(id, token);
      reg.gone.delete(id);
      const node0 = node.current;
      if (!src || reduced) {
        shown.set(withTiming(1, { duration: 160 }));
        return;
      }
      reg.measure(node0, rot, (to) => {
        reg.addFlight({ from: src, to, node: children, onLand: () => shown.set(1) });
      });
      // whatever happens (a measure that never answers), the card shows up in the end
      const t = setTimeout(() => shown.set(1), MOTION.fly + 400);
      return () => clearTimeout(t);
    }
    const delay = enter === 'deal' ? reg.stagger(Date.now()) : 0;
    const ms = reduced ? 160 : enter === 'deal' ? MOTION.deal : MOTION.enter;
    enterP.set(withDelay(delay, withTiming(1, { duration: ms, easing: EASE })));
  });
  useLayoutEffect(() => arrive(), []);

  // leaving
  useEffect(() => {
    if (leaving) leaveP.set(withTiming(1, { duration: reduced ? 200 : MOTION.leave, easing: EASE_IN_OUT }));
  }, [leaving, leaveP, reduced]);

  // placement glides
  const glide = !!stage?.settled && !reduced;
  const tx = place?.x ?? 0;
  const ty = place?.y ?? 0;
  useEffect(() => {
    const cfg = { duration: MOTION.glide, easing: EASE };
    if (glide) {
      px.set(withTiming(tx, cfg));
      py.set(withTiming(ty, cfg));
      pr.set(withTiming(rot, cfg));
    } else {
      px.set(tx);
      py.set(ty);
      pr.set(rot);
    }
  }, [tx, ty, rot, glide, px, py, pr]);

  const placed = !!place;
  const to = leave?.to ?? { x: 0, y: reduced ? 0 : -24 };
  const via = leave?.via ?? null;
  const endScale = leave?.scale ?? 0.82;
  const ox = off.x;
  const oy = off.y;
  const fade = reduced;
  const anim = useAnimatedStyle(() => {
    const e = enterP.get();
    const l = leaveP.get();
    let lx = 0;
    let ly = 0;
    if (!fade) {
      if (via) {
        // gather first (0 → 0.35), then go (0.35 → 1)
        const a = Math.min(1, l / 0.35);
        const b = Math.max(0, (l - 0.35) / 0.65);
        lx = via.x * a + (to.x - via.x) * b;
        ly = via.y * a + (to.y - via.y) * b;
      } else {
        lx = to.x * l;
        ly = to.y * l;
      }
    }
    const leaveFade = via ? interpolate(l, [0, 0.55, 1], [1, 1, 0]) : interpolate(l, [0, 0.3, 1], [1, 0.9, 0]);
    const s = (fade ? 1 : 0.94 + 0.06 * e) * interpolate(l, [0, 0.35, 1], [1, 1, endScale]);
    const base: ViewStyle = {
      opacity: shown.get() * e * leaveFade,
      transform: [{ translateX: ox * (1 - e) + lx }, { translateY: oy * (1 - e) + ly }, { scale: s }],
    };
    if (placed) {
      base.left = px.get();
      base.top = py.get();
      base.transform = [...(base.transform as object[]), { rotate: `${pr.get()}deg` }] as ViewStyle['transform'];
    }
    return base;
  });

  if (!stage) {
    if (!place) return <>{children}</>;
    return <View style={[{ position: 'absolute', left: place.x, top: place.y, transform: [{ rotate: `${rot}deg` }] }, style]}>{children}</View>;
  }
  const body = (
    <Animated.View ref={node} style={[placed && styles.placed, style, anim]} pointerEvents={leaving ? 'none' : 'auto'}>
      {children}
    </Animated.View>
  );
  if (!flow || reduced) return body;
  // the layout transition lives on its own wrapper: on the web it animates `transform` too
  return <Animated.View layout={LinearTransition.duration(MOTION.glide).easing(EASE)}>{body}</Animated.View>;
}

// —— items that just went away ———————————————————————————————————————————————————————

/**
 * The current items plus the ones that disappeared a moment ago (flagged `leaving`), so they can
 * animate out. Items come back by key; `ms` is how long a leaving item stays.
 */
export function useLeaving<T>(items: readonly T[], keyOf: (t: T) => string, ms: number = MOTION.leave + 80): { item: T; key: string; leaving: boolean }[] {
  const keys = items.map(keyOf).join('\n');
  const [st, setSt] = useState(() => ({ keys, items, gone: [] as T[], batch: 0 }));
  let cur = st;
  if (st.keys !== keys) {
    const now = new Set(items.map(keyOf));
    const left = st.items.filter((t) => !now.has(keyOf(t)));
    cur = { keys, items, gone: [...st.gone.filter((t) => !now.has(keyOf(t))), ...left], batch: left.length ? st.batch + 1 : st.batch };
    setSt(cur);
  }
  const batch = cur.batch;
  useEffect(() => {
    if (!batch) return;
    const t = setTimeout(() => setSt((s) => (s.gone.length ? { ...s, gone: [] } : s)), ms);
    return () => clearTimeout(t);
  }, [batch, ms]);
  return [...items.map((item) => ({ item, key: keyOf(item), leaving: false })), ...cur.gone.map((item) => ({ item, key: keyOf(item), leaving: true }))];
}

// —— the card's own look ——————————————————————————————————————————————————————————————

/** Smooth selection lift (px) and dimming for a card face. Put the Pressable inside the animated view. */
export function useCardLook({ lift = 0, dim = false, dimTo = 0.4 }: { lift?: number; dim?: boolean; dimTo?: number }) {
  const y = useSharedValue(-lift);
  const o = useSharedValue(dim ? dimTo : 1);
  useEffect(() => {
    y.set(withTiming(-lift, { duration: MOTION.lift, easing: EASE }));
  }, [lift, y]);
  useEffect(() => {
    o.set(withTiming(dim ? dimTo : 1, { duration: 200, easing: EASE }));
  }, [dim, dimTo, o]);
  return useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: y.get() }] }));
}

// —— small extras —————————————————————————————————————————————————————————————————————

/** A number that changes softly: the new value rises a few pixels while fading in. */
export function SoftNumber({ value, style, render }: { value: number; style?: StyleProp<TextStyle>; render: (v: number) => ReactNode }) {
  const [state, setState] = useState({ value, bump: 0 });
  if (state.value !== value) setState({ value, bump: state.bump + 1 });
  return (
    <SoftNumberFace key={state.bump} animate={state.bump > 0} style={style}>
      {render(value)}
    </SoftNumberFace>
  );
}

function SoftNumberFace({ animate, children, style }: { animate: boolean; children: ReactNode; style?: StyleProp<TextStyle> }) {
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) p.set(withTiming(1, { duration: 540, easing: EASE }));
  }, [animate, p]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * p.get(), transform: [{ translateY: 6 * (1 - p.get()) }] }));
  return <Animated.View style={[style as StyleProp<ViewStyle>, anim]}>{children}</Animated.View>;
}

/** A calm glow behind the avatar of the player whose turn it is (breathes slowly). Place it absolutely behind the avatar. */
export function TurnHalo({ active, size, color = C.yellow }: { active: boolean; size: number; color?: string }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    if (!active) o.set(withTiming(0, { duration: 220 }));
    else if (reduced) o.set(withTiming(0.5, { duration: 200 }));
    else o.set(withSequence(withTiming(0.6, { duration: 260, easing: EASE }), withRepeat(withSequence(withTiming(0.3, { duration: 1100, easing: EASE_IN_OUT }), withTiming(0.6, { duration: 1100, easing: EASE_IN_OUT })), -1)));
  }, [active, reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  const d = size + 12;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: d, height: d, borderRadius: d / 2, backgroundColor: color, left: -6, top: -6 }, anim]} />;
}

/** A soft halo behind the card that holds / took a trick. Render it as the card's first child, absolutely. */
export function WinGlow({ active, width, height, color = C.yellow }: { active: boolean; width: number; height: number; color?: string }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withTiming(active ? 1 : 0, { duration: 320, easing: EASE }));
  }, [active, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() * 0.5 }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: -6, top: -6, width: width + 12, height: height + 12, borderRadius: 12, backgroundColor: color }, anim]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, direction: 'ltr', zIndex: 100, elevation: 30 },
  flight: { position: 'absolute', left: 0, top: 0 },
  placed: { position: 'absolute' },
});
