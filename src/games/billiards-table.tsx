/**
 * «البلياردو» — the table on a phone: the balls, the playback of a shot, the cue stick, the aim guide,
 * and the shooter's touches (drag anywhere to aim, drag the cue ball while it is in hand, tap a pocket
 * to call the 8).
 *
 * Playback: the server sends a shot's recorded keyframes once (view.shot, cached here by id). One clock
 * (a shared value, linear, real time) drives every ball on the UI thread; each ball's worklet
 * interpolates its own keyframes; a pocketed ball fades into its pocket. A shot that arrives in the first
 * 0.7 s after the screen opened (a reconnect, joining mid-shot) is not played: the final positions are
 * already in view.balls. Nothing here bounces, zooms or pops.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { unpackBalls, type BilliardsGuide, type BilliardsView } from '@/shared/games/billiards';
import {
  L,
  POCKET_DRAW,
  R,
  W,
  aimGuide,
  decodeTrack,
  legalCueSpot,
  nearestCueSpot,
  nearestPocket,
  trackAt,
  type BallPos,
  type Track,
} from '@/shared/games/billiards-physics';
import { C } from '@/theme';
import { useScrollLock } from '@/ui/screen';

import { BallSvg, RAIL, TABLE_H, TableSvg, scaleFor } from './billiards-art';
import { useSettled } from './touch-motion';

interface Play {
  id: number;
  at: number;
  dur: number;
  tracks: Record<number, Track>;
  /** ball → the moment it dropped (ms) */
  pk: Record<number, number>;
}

/** The shot being played back (null when the balls are still), and its clock. */
function usePlayback(view: BilliardsView): { play: Play | null; clock: SharedValue<number>; settled: boolean } {
  const settled = useSettled();
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const [st, setSt] = useState<{ seen: number; play: Play | null }>({ seen: view.shotId, play: null });
  let cur = st;
  if (view.shotId !== st.seen) {
    const s = view.shot;
    const play: Play | null =
      s && s.id === view.shotId && settled && !reduced
        ? {
            id: s.id,
            at: s.at,
            dur: s.dur,
            tracks: Object.fromEntries(Object.entries(s.tr).map(([id, enc]) => [Number(id), decodeTrack(enc)])),
            pk: Object.fromEntries(s.pk.map(([b, , t]) => [b, t])),
          }
        : null;
    cur = { seen: view.shotId, play };
    setSt(cur);
  }
  const play = cur.play;
  useEffect(() => {
    if (!play) return;
    // a phone that got the shot a little late catches up; very late: just the end
    const offset = Math.max(0, Math.min(play.dur, client.serverNow() - play.at - 150));
    const late = offset >= play.dur - 60;
    if (late) clock.set(play.dur);
    else {
      clock.set(offset);
      clock.set(withTiming(play.dur, { duration: play.dur - offset, easing: Easing.linear }));
    }
    const t = setTimeout(() => setSt((x) => (x.play?.id === play.id ? { ...x, play: null } : x)), late ? 0 : play.dur - offset + 120);
    return () => clearTimeout(t);
  }, [play, clock]);
  return { play, clock, settled };
}

/** One ball: still at (x, y), or following its track on the shot's clock. */
const Ball = memo(function Ball({ id, x, y, track, dropAt, clock, k, size }: { id: number; x: number; y: number; track: Track | null; dropAt: number | null; clock: SharedValue<number>; k: number; size: number }) {
  const half = size / 2;
  const style = useAnimatedStyle(() => {
    if (!track) return { opacity: 1, transform: [{ translateX: (RAIL + x) * k - half }, { translateY: (RAIL + y) * k - half }] };
    const t = clock.get();
    const p = trackAt(track, t);
    const o = dropAt === null ? 1 : Math.max(0, Math.min(1, 1 - (t - dropAt) / 200));
    return { opacity: o, transform: [{ translateX: (RAIL + p.x) * k - half }, { translateY: (RAIL + p.y) * k - half }] };
  }, [track, x, y, k, half, dropAt]);
  return (
    <Animated.View pointerEvents="none" style={[styles.ball, { width: size, height: size }, style]}>
      <BallSvg id={id} size={size} />
    </Animated.View>
  );
});

/** The cue stick behind the cue ball, pointing along `angle`, pulled back by `pull` (0 … 1). */
function CueStick({ cx, cy, angle, pull, k, mine }: { cx: number; cy: number; angle: SharedValue<number>; pull: SharedValue<number>; k: number; mine: boolean }) {
  const len = 1100 * k;
  const th = Math.max(5, 26 * k);
  const box = len + 220 * k;
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}rad` }] }));
  const stick = useAnimatedStyle(() => ({ transform: [{ translateX: -(R * 1.35 + 160 * pull.get()) * k }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: (RAIL + cx) * k - box, top: (RAIL + cy) * k - box, width: box * 2, height: box * 2 }, style]}>
      <Animated.View style={[styles.abs, { left: box - len, top: box - th / 2, width: len, height: th, opacity: mine ? 1 : 0.85 }, stick]}>
        <Svg width={len} height={th}>
          <Defs>
            <LinearGradient id="bcue" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#2B1A10" />
              <Stop offset="0.32" stopColor="#4A2C17" />
              <Stop offset="0.36" stopColor="#D8B57C" />
              <Stop offset="0.95" stopColor="#EED9AE" />
              <Stop offset="0.955" stopColor="#F8F4EA" />
              <Stop offset="0.985" stopColor="#F8F4EA" />
              <Stop offset="0.99" stopColor="#3D7BD9" />
              <Stop offset="1" stopColor="#3D7BD9" />
            </LinearGradient>
          </Defs>
          <Path d={`M0 0 L${len} ${th * 0.28} L${len} ${th * 0.72} L0 ${th}Z`} fill="url(#bcue)" stroke="rgba(0,0,0,0.45)" strokeWidth={0.7} />
          <Rect x={len * 0.33} y={th * 0.1} width={Math.max(1.5, len * 0.012)} height={th * 0.8} fill="#C9A24A" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** The aim guide: to the first contact, the ghost ball, where the object ball and the cue ball go. */
const AimGuide = memo(function AimGuide({ objects, cx, cy, angle, k, width, mode, targets }: { objects: BallPos[]; cx: number; cy: number; angle: number; k: number; width: number; mode: BilliardsGuide; targets: number[] }) {
  if (mode === 'off') return null;
  const g = aimGuide(objects, cx, cy, angle);
  const P = (x: number, y: number) => [(RAIL + x) * k, (RAIL + y) * k] as const;
  const [x0, y0] = P(cx, cy);
  const long = mode === 'long';
  const maxLen = long ? Infinity : 420;
  const dist = Math.hypot(g.hit.x - cx, g.hit.y - cy);
  const reach = Math.min(dist, maxLen);
  const ex = cx + Math.cos(angle) * reach;
  const ey = cy + Math.sin(angle) * reach;
  const [x1, y1] = P(ex, ey);
  const hitShown = dist <= maxLen;
  const [hx, hy] = P(g.hit.x, g.hit.y);
  const legal = g.ball === null || targets.includes(g.ball);
  const color = legal ? 'rgba(255,255,255,0.85)' : 'rgba(255,120,120,0.95)';
  const sw = Math.max(1, 3.2 * k);
  const objBall = g.ball !== null ? objects.find((b) => b.id === g.ball) : null;
  const objLen = long ? 520 : 170;
  const cueLen = long ? 300 : 0;
  return (
    <Svg width={width} height={TABLE_H * k} style={styles.abs} pointerEvents="none">
      <Line x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={sw} strokeDasharray={`${6 * sw} ${3 * sw}`} strokeLinecap="round" />
      {hitShown ? (
        <G>
          <Circle cx={hx} cy={hy} r={R * k} fill="rgba(255,255,255,0.12)" stroke={color} strokeWidth={sw} />
          {objBall && g.obj ? (
            <Line x1={(RAIL + objBall.x) * k} y1={(RAIL + objBall.y) * k} x2={(RAIL + objBall.x + g.obj.x * objLen) * k} y2={(RAIL + objBall.y + g.obj.y * objLen) * k} stroke={legal ? 'rgba(255,236,170,0.9)' : color} strokeWidth={sw} strokeLinecap="round" />
          ) : null}
          {g.cue && cueLen ? <Line x1={hx} y1={hy} x2={(RAIL + g.hit.x + g.cue.x * cueLen) * k} y2={(RAIL + g.hit.y + g.cue.y * cueLen) * k} stroke="rgba(255,255,255,0.5)" strokeWidth={sw * 0.8} strokeDasharray={`${3 * sw} ${3 * sw}`} strokeLinecap="round" /> : null}
          {g.bounce && long ? <Line x1={hx} y1={hy} x2={(RAIL + g.hit.x + g.bounce.x * 380) * k} y2={(RAIL + g.hit.y + g.bounce.y * 380) * k} stroke="rgba(255,255,255,0.45)" strokeWidth={sw * 0.8} strokeDasharray={`${3 * sw} ${3 * sw}`} strokeLinecap="round" /> : null}
        </G>
      ) : null}
    </Svg>
  );
});

export interface Aiming {
  angle: number;
  setAngle: (a: number) => void;
  cue: { x: number; y: number } | null;
  setCue: (p: { x: number; y: number }) => void;
  pocket: number | null;
  setPocket: (p: number) => void;
  /** 0 … 1 while the power bar is pulled (the stick follows) */
  pull: SharedValue<number>;
}

/** Shortest turn from a to b. */
const turnTo = (a: number, b: number) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d;
};

export function BilliardsTable({ view, width, aiming }: { view: BilliardsView; width: number; aiming: Aiming | null }) {
  const k = scaleFor(width);
  const height = TABLE_H * k;
  const size = 2 * R * k;
  const { play, clock, settled } = usePlayback(view);
  const balls = useMemo(() => unpackBalls(view.balls), [view.balls]);
  const objects = useMemo(() => balls.filter((b) => b.id !== 0), [balls]);
  const mine = !!aiming && view.phase === 'aim';
  const watchPull = useSharedValue(0);
  const pull = aiming?.pull ?? watchPull;

  // the cue ball while aiming: on the table, in my hand (my local spot), or in the shooter's hand (relayed)
  const onTable = balls.find((b) => b.id === 0) ?? null;
  const handSpot = view.inHand ? (mine ? aiming!.cue : view.aim?.cue ? { x: view.aim.cue[0], y: view.aim.cue[1] } : null) : null;
  const cueAt = view.phase === 'aim' && !play ? (view.inHand ? handSpot : onTable) : null;

  // the cue's direction: mine follows the finger; someone else's turns smoothly to each relayed aim
  const angleSV = useSharedValue(mine ? aiming!.angle : (view.aim?.a ?? -Math.PI / 2));
  const myAngle = mine ? aiming!.angle : null;
  const relayed = view.aim?.a ?? null;
  useEffect(() => {
    if (myAngle !== null) angleSV.set(turnTo(angleSV.get(), myAngle));
    else if (relayed !== null) angleSV.set(withTiming(turnTo(angleSV.get(), relayed), { duration: 170, easing: Easing.out(Easing.quad) }));
  }, [myAngle, relayed, angleSV]);

  // —— the shooter's touches ——
  const hold = useScrollLock();
  const holding = useRef(false);
  const mode = useRef<'aim' | 'place' | 'pocket'>('aim');
  const start = useRef({ x: 0, y: 0, pocket: -1 });
  useEffect(
    () => () => {
      if (holding.current) hold(false);
    },
    [hold],
  );
  const toMm = (px: number, py: number) => ({ x: px / k - RAIL, y: py / k - RAIL });
  const kitchen = view.inHand === 'kitchen';
  const begin = (px: number, py: number) => {
    if (!aiming || !mine) return;
    if (!holding.current) {
      holding.current = true;
      hold(true);
    }
    const p = toMm(px, py);
    start.current = { x: px, y: py, pocket: -1 };
    const cue = view.inHand ? aiming.cue : onTable;
    if (view.inHand && cue && Math.hypot(p.x - cue.x, p.y - cue.y) * k < Math.max(24, size * 1.3)) {
      mode.current = 'place';
      return;
    }
    if (view.needCall) {
      const np = nearestPocket(p.x, p.y);
      if (np.dist * k < 30) {
        mode.current = 'pocket';
        start.current.pocket = np.pocket;
        return;
      }
    }
    mode.current = 'aim';
    if (cue) aiming.setAngle(Math.atan2(p.y - cue.y, p.x - cue.x));
  };
  const move = (px: number, py: number) => {
    if (!aiming || !mine) return;
    const p = toMm(px, py);
    if (mode.current === 'pocket' && Math.hypot(px - start.current.x, py - start.current.y) > 10) mode.current = 'aim';
    if (mode.current === 'place') {
      aiming.setCue({ x: Math.max(R, Math.min(W - R, p.x)), y: Math.max(kitchen ? R : R, Math.min(L - R, p.y)) });
      return;
    }
    const cue = view.inHand ? aiming.cue : onTable;
    if (mode.current === 'aim' && cue && Math.hypot(p.x - cue.x, p.y - cue.y) > R * 0.6) aiming.setAngle(Math.atan2(p.y - cue.y, p.x - cue.x));
  };
  const end = () => {
    if (holding.current) {
      holding.current = false;
      hold(false);
    }
    if (!aiming || !mine) return;
    if (mode.current === 'place' && aiming.cue) {
      const c = aiming.cue;
      if (!legalCueSpot(objects, c.x, c.y, kitchen)) aiming.setCue(nearestCueSpot(objects, c.x, c.y, kitchen));
      haptic.tap();
    } else if (mode.current === 'pocket' && start.current.pocket >= 0) {
      aiming.setPocket(start.current.pocket);
      haptic.tap();
    }
    mode.current = 'aim';
  };
  /* eslint-disable react-hooks/refs */
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => begin(e.x, e.y))
    .onUpdate((e) => move(e.x, e.y))
    .onFinalize(() => end());
  /* eslint-enable react-hooks/refs */

  // which balls to draw: the still ones, plus every ball that moves in the shot being played
  const shown: { id: number; x: number; y: number; track: Track | null; dropAt: number | null }[] = [];
  const ids = new Set<number>();
  if (play) {
    for (const [sid, tr] of Object.entries(play.tracks)) {
      const id = Number(sid);
      ids.add(id);
      shown.push({ id, x: tr.x[tr.x.length - 1], y: tr.y[tr.y.length - 1], track: tr, dropAt: play.pk[id] ?? null });
    }
  }
  for (const b of balls) {
    if (ids.has(b.id)) continue;
    if (b.id === 0 && view.inHand) continue;
    shown.push({ id: b.id, x: b.x, y: b.y, track: null, dropAt: null });
  }

  const calledPocket = mine ? aiming!.pocket : (view.aim?.pocket ?? null);
  const handOk = mine && view.inHand && aiming!.cue ? legalCueSpot(objects, aiming!.cue.x, aiming!.cue.y, kitchen) : true;
  const fewTargets = view.phase === 'aim' && view.targets.length <= 2 && !play ? view.targets : [];

  return (
    <View style={[styles.table, { width, height }]}>
      <TableSvg width={width} kitchen={view.inHand === 'kitchen' && view.phase === 'aim'} />
      {/* the legal ball(s) to hit, when there are only one or two */}
      {fewTargets.map((t) => {
        const b = objects.find((x) => x.id === t);
        if (!b) return null;
        return <Animated.View key={`t${t}-${view.shotId}`} entering={settled ? FadeIn.duration(300) : undefined} pointerEvents="none" style={[styles.ring, { left: (RAIL + b.x) * k - size * 0.85, top: (RAIL + b.y) * k - size * 0.85, width: size * 1.7, height: size * 1.7, borderRadius: size }]} />;
      })}
      {view.needCall || calledPocket !== null
        ? POCKET_DRAW.map((p, i) => {
            const on = calledPocket === i;
            if (!view.needCall && !on) return null;
            const r = Math.max(12, p.r * k + 3);
            return <View key={`p${i}`} pointerEvents="none" style={[styles.pocketRing, { left: (RAIL + p.x) * k - r, top: (RAIL + p.y) * k - r, width: r * 2, height: r * 2, borderRadius: r, borderColor: on ? C.yellow : 'rgba(242,179,61,0.55)', backgroundColor: on ? 'rgba(242,179,61,0.35)' : 'transparent', borderWidth: on ? 3 : 1.5 }]} />;
          })
        : null}
      {mine && cueAt && !play ? <AimGuide objects={objects} cx={cueAt.x} cy={cueAt.y} angle={aiming!.angle} k={k} width={width} mode={view.guide} targets={view.targets} /> : null}
      {shown.map((b) => (
        <Ball key={`${b.id}-${b.track ? `p${play?.id}` : 's'}`} id={b.id} x={b.x} y={b.y} track={b.track} dropAt={b.dropAt} clock={clock} k={k} size={size} />
      ))}
      {view.inHand && cueAt ? (
        <View pointerEvents="none" style={[styles.abs, { left: (RAIL + cueAt.x) * k - size / 2, top: (RAIL + cueAt.y) * k - size / 2 }]}>
          <BallSvg id={0} size={size} />
          <View style={[styles.handRing, { left: -size * 0.45, top: -size * 0.45, width: size * 1.9, height: size * 1.9, borderRadius: size, borderColor: handOk ? 'rgba(255,255,255,0.75)' : C.red }]} />
        </View>
      ) : null}
      {cueAt ? <CueStick cx={cueAt.x} cy={cueAt.y} angle={angleSV} pull={pull} k={k} mine={mine} /> : null}
      {mine ? (
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} accessibilityLabel="الطاولة: اسحب للتصويب" />
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { direction: 'ltr', overflow: 'hidden', borderRadius: 14, alignSelf: 'center' },
  abs: { position: 'absolute', left: 0, top: 0 },
  ball: { position: 'absolute', left: 0, top: 0 },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,230,140,0.75)' },
  pocketRing: { position: 'absolute' },
  handRing: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed' },
});
