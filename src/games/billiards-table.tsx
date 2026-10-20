/**
 * «البلياردو» — the table on a phone: the balls, the playback of a shot, the cue stick, the aim guide,
 * and the shooter's touches (drag anywhere to aim, drag the cue ball while it is in hand, tap a pocket
 * to call the 8).
 *
 * Playback: the server sends a shot's recorded keyframes once (view.shot, cached here by id). When it
 * arrives, every moving ball's orientation is integrated along its track (rolling without slipping, see
 * billiards-ball.tsx) at the keyframes. One clock (a shared value, linear, real time) then drives every
 * ball on the UI thread: each ball's worklet interpolates its position and orientation; a pocketed ball
 * sinks into its pocket. A shot that arrives in the first 0.7 s after the screen opened (a reconnect,
 * joining mid-shot) is not played: the final positions are already in view.balls. The cue strikes
 * forward on the stroke and fades away. Nothing here bounces, zooms or pops.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line } from 'react-native-svg';

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
  type BallPos,
  type Track,
} from '@/shared/games/billiards-physics';
import { C } from '@/theme';
import { useScrollLock } from '@/ui/screen';

import { CueSvg, RAIL, TABLE_H, TableSvg, scaleFor } from './billiards-art';
import { MovingBall, StaticBall, lastOrient, orientTimeline, orientations } from './billiards-ball';
import { useSettled } from './touch-motion';

/** The cue's pull when its tip touches the cue ball (the stick rests 0.35 R behind it at 0). */
export const CONTACT = -(0.35 * R) / 160;

/** The shooter let go of the power bar: the cue strokes forward (and comes back if no shot follows). */
export function strike(pull: SharedValue<number>, power: number) {
  pull.set(
    withSequence(
      withTiming(CONTACT, { duration: 80 + 110 * power, easing: Easing.in(Easing.quad) }),
      withDelay(1500, withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) })),
    ),
  );
}

interface Moving {
  track: Track;
  /** orientation at each keyframe */
  qs: number[];
  drop: { t: number; x: number; y: number } | null;
}

interface Play {
  id: number;
  at: number;
  dur: number;
  balls: Record<number, Moving>;
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
    let play: Play | null = null;
    if (s && s.id === view.shotId && settled && !reduced) {
      const drops = new Map(s.pk.map(([b, p, t]) => [b, { t, x: POCKET_DRAW[p]?.x ?? 0, y: POCKET_DRAW[p]?.y ?? 0 }]));
      const balls: Record<number, Moving> = {};
      for (const [sid, enc] of Object.entries(s.tr)) {
        const id = Number(sid);
        const track = decodeTrack(enc);
        balls[id] = { track, qs: orientTimeline(track, orientations.start(id), R), drop: drops.get(id) ?? null };
      }
      play = { id: s.id, at: s.at, dur: s.dur, balls };
    }
    cur = { seen: view.shotId, play };
    setSt(cur);
  }
  const play = cur.play;
  const seen = cur.seen;
  // where the balls of this shot come to rest (the next shot starts from there)
  useEffect(() => {
    if (play) for (const [id, m] of Object.entries(play.balls)) orientations.set(Number(id), lastOrient(m.qs));
    orientations.shotPlayed();
  }, [play, seen]);
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
    const t = setTimeout(() => setSt((x) => (x.play?.id === play.id ? { ...x, play: null } : x)), late ? 0 : play.dur - offset + 220);
    return () => clearTimeout(t);
  }, [play, clock]);
  return { play, clock, settled };
}

/**
 * The cue stick behind the cue ball, pointing along `angle`, pulled back by `pull` (0 … 1; CONTACT at
 * the stroke), with its shadow on the cloth (away from the light), faded by `fade`.
 */
function CueStick({ cx, cy, angle, pull, fade, k, mine }: { cx: number; cy: number; angle: SharedValue<number>; pull: SharedValue<number>; fade: SharedValue<number>; k: number; mine: boolean }) {
  const len = 1120 * k;
  const th = Math.max(5.5, 27 * k);
  const box = len + 220 * k;
  const sh = Math.max(3, 16 * k);
  const turn = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ rotate: `${angle.get()}rad` }] }));
  const shTurn = useAnimatedStyle(() => ({ opacity: fade.get() * 0.32, transform: [{ rotate: `${angle.get()}rad` }] }));
  const stick = useAnimatedStyle(() => ({ transform: [{ translateX: -(R * 1.35 + 160 * pull.get()) * k }] }));
  const frame = { left: (RAIL + cx) * k - box, top: (RAIL + cy) * k - box, width: box * 2, height: box * 2 };
  const body = { left: box - len, top: box - th / 2, width: len, height: th };
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, frame, { left: frame.left + sh * 0.6, top: frame.top + sh }, shTurn]}>
        <Animated.View style={[styles.abs, body, stick]}>
          <CueSvg len={len} th={th} shadow />
        </Animated.View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.abs, frame, turn]}>
        <Animated.View style={[styles.abs, body, { opacity: mine ? 1 : 0.92 }, stick]}>
          <CueSvg len={len} th={th} />
        </Animated.View>
      </Animated.View>
    </>
  );
}

/** The aim guide: a thin line to the contact, the ghost ball there, where the object ball and the cue ball go. */
const AimGuide = memo(function AimGuide({ objects, cx, cy, angle, k, width, mode, targets }: { objects: BallPos[]; cx: number; cy: number; angle: number; k: number; width: number; mode: BilliardsGuide; targets: number[] }) {
  if (mode === 'off') return null;
  const g = aimGuide(objects, cx, cy, angle);
  const P = (x: number, y: number) => [(RAIL + x) * k, (RAIL + y) * k] as const;
  const long = mode === 'long';
  const maxLen = long ? Infinity : 420;
  const dist = Math.hypot(g.hit.x - cx, g.hit.y - cy);
  const reach = Math.min(dist, maxLen);
  // from the cue ball's edge
  const [x0, y0] = P(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
  const hitShown = dist <= maxLen;
  const lineEnd = hitShown ? Math.max(R, reach - R) : reach;
  const [x1, y1] = P(cx + Math.cos(angle) * lineEnd, cy + Math.sin(angle) * lineEnd);
  const [hx, hy] = P(g.hit.x, g.hit.y);
  const legal = g.ball === null || targets.includes(g.ball);
  const color = legal ? 'rgba(255,255,255,0.92)' : 'rgba(255,110,110,0.95)';
  const sw = Math.max(1, 2.6 * k);
  const objBall = g.ball !== null ? objects.find((b) => b.id === g.ball) : null;
  const objLen = long ? 460 : 160;
  const cueLen = long ? 240 : 0;
  return (
    <Svg width={width} height={TABLE_H * k} style={styles.abs} pointerEvents="none">
      <Line x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(0,0,0,0.25)" strokeWidth={sw + 1.2} strokeLinecap="round" />
      <Line x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {hitShown ? (
        <G>
          <Circle cx={hx} cy={hy} r={R * k - sw / 2} fill="rgba(255,255,255,0.08)" stroke={color} strokeWidth={sw} />
          {objBall && g.obj ? (
            <Line x1={(RAIL + objBall.x + g.obj.x * R) * k} y1={(RAIL + objBall.y + g.obj.y * R) * k} x2={(RAIL + objBall.x + g.obj.x * (R + objLen)) * k} y2={(RAIL + objBall.y + g.obj.y * (R + objLen)) * k} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          ) : null}
          {g.cue && cueLen ? <Line x1={hx + g.cue.x * R * k} y1={hy + g.cue.y * R * k} x2={(RAIL + g.hit.x + g.cue.x * (R + cueLen)) * k} y2={(RAIL + g.hit.y + g.cue.y * (R + cueLen)) * k} stroke="rgba(255,255,255,0.6)" strokeWidth={sw * 0.8} strokeLinecap="round" /> : null}
          {g.bounce && long ? <Line x1={hx} y1={hy} x2={(RAIL + g.hit.x + g.bounce.x * 340) * k} y2={(RAIL + g.hit.y + g.bounce.y * 340) * k} stroke="rgba(255,255,255,0.5)" strokeWidth={sw * 0.8} strokeDasharray={`${3 * sw} ${3 * sw}`} strokeLinecap="round" /> : null}
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
  /** 0 … 1 while the power bar is pulled (the stick follows); CONTACT at the stroke */
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
  const fade = useSharedValue(1);

  // a new rack: its balls show their numbers up until the break
  const fresh = view.breakShot && view.phase === 'aim';
  useEffect(() => {
    if (fresh) orientations.newRack();
  }, [fresh, view.rack]);

  // the cue ball while aiming: on the table, in my hand (my local spot), or in the shooter's hand (relayed)
  const onTable = balls.find((b) => b.id === 0) ?? null;
  const handSpot = view.inHand ? (mine ? aiming!.cue : view.aim?.cue ? { x: view.aim.cue[0], y: view.aim.cue[1] } : null) : null;
  const cueAt = view.phase === 'aim' && !play ? (view.inHand ? handSpot : onTable) : null;
  // where the cue was when the shot was played: it strikes there and fades
  const [lastCue, setLastCue] = useState<{ x: number; y: number } | null>(cueAt ? { x: cueAt.x, y: cueAt.y } : null);
  if (cueAt && (!lastCue || lastCue.x !== cueAt.x || lastCue.y !== cueAt.y)) setLastCue({ x: cueAt.x, y: cueAt.y });
  const stickMode = cueAt ? 'aim' : play && lastCue ? 'stroke' : null;
  const stickAt = cueAt ?? (stickMode ? lastCue : null);
  const playId = play?.id ?? null;
  useEffect(() => {
    if (stickMode === 'aim') {
      fade.set(1);
      pull.set(0);
    } else if (stickMode === 'stroke') {
      if (pull.get() > CONTACT + 0.01) pull.set(withTiming(CONTACT, { duration: 110, easing: Easing.in(Easing.quad) }));
      else pull.set(CONTACT);
      fade.set(withDelay(160, withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) })));
    }
  }, [stickMode, playId, fade, pull]);

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
      aiming.setCue({ x: Math.max(R, Math.min(W - R, p.x)), y: Math.max(R, Math.min(L - R, p.y)) });
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

  // which balls to draw: the still ones, plus every ball that moves in the shot being played — top to
  // bottom, so each ball's shadow (down and to the right) falls under its neighbours, not over them
  const shown: { id: number; x: number; y: number; moving: Moving | null }[] = [];
  const ids = new Set<number>();
  if (play) {
    for (const [sid, m] of Object.entries(play.balls)) {
      const id = Number(sid);
      ids.add(id);
      shown.push({ id, x: m.track.x[0], y: m.track.y[0], moving: m });
    }
  }
  for (const b of balls) {
    if (ids.has(b.id)) continue;
    if (b.id === 0 && view.inHand) continue;
    shown.push({ id: b.id, x: b.x, y: b.y, moving: null });
  }
  shown.sort((a, b) => a.y - b.y || a.x - b.x);
  const restBreak = view.breakShot;

  const calledPocket = mine ? aiming!.pocket : (view.aim?.pocket ?? null);
  const handOk = mine && view.inHand && aiming!.cue ? legalCueSpot(objects, aiming!.cue.x, aiming!.cue.y, kitchen) : true;
  const fewTargets = view.phase === 'aim' && view.targets.length <= 2 && !play ? view.targets : [];
  const toPx: [number, number] = [k, RAIL * k];

  return (
    <View testID="billiards-table" style={[styles.table, { width, height }]}>
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
            return <View key={`p${i}`} pointerEvents="none" style={[styles.pocketRing, { left: (RAIL + p.x) * k - r, top: (RAIL + p.y) * k - r, width: r * 2, height: r * 2, borderRadius: r, borderColor: on ? C.yellow : 'rgba(242,179,61,0.6)', backgroundColor: on ? 'rgba(242,179,61,0.35)' : 'transparent', borderWidth: on ? 3 : 1.5 }]} />;
          })
        : null}
      {mine && cueAt && !play ? <AimGuide objects={objects} cx={cueAt.x} cy={cueAt.y} angle={aiming!.angle} k={k} width={width} mode={view.guide} targets={view.targets} /> : null}
      {shown.map((b) =>
        b.moving ? (
          <MovingBall key={`${b.id}-p${play?.id}`} id={b.id} size={size} track={b.moving.track} qs={b.moving.qs} radius={R} clock={clock} toPx={toPx} drop={b.moving.drop} />
        ) : (
          <View key={`${b.id}-s`} pointerEvents="none" style={[styles.abs, { transform: [{ translateX: (RAIL + b.x) * k - size / 2 }, { translateY: (RAIL + b.y) * k - size / 2 }] }]}>
            <StaticBall id={b.id} size={size} q={orientations.get(b.id, restBreak)} />
          </View>
        ),
      )}
      {view.inHand && cueAt ? (
        <View pointerEvents="none" style={[styles.abs, { left: (RAIL + cueAt.x) * k - size / 2, top: (RAIL + cueAt.y) * k - size / 2 }]}>
          <StaticBall id={0} size={size} q={orientations.get(0, restBreak)} />
          <View style={[styles.handRing, { left: -size * 0.45, top: -size * 0.45, width: size * 1.9, height: size * 1.9, borderRadius: size, borderColor: handOk ? 'rgba(255,255,255,0.8)' : C.red }]} />
        </View>
      ) : null}
      {stickAt ? <CueStick cx={stickAt.x} cy={stickAt.y} angle={angleSV} pull={pull} fade={fade} k={k} mine={mine} /> : null}
      {mine ? (
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} accessibilityLabel="الطاولة: اسحب للتصويب" />
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { direction: 'ltr', overflow: 'hidden', borderRadius: 10, alignSelf: 'center' },
  abs: { position: 'absolute', left: 0, top: 0 },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,230,140,0.8)' },
  pocketRing: { position: 'absolute' },
  handRing: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed' },
});
