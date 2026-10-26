/**
 * «البالونات» — the scene: a bunch of 7 colourful balloons lifting a wicker basket with a little cat in it,
 * over a green hill at dusk. Each wrong guess pops one balloon (it shrinks away in a blink and a few
 * confetti bits fall — the only quick motion here) and the basket sinks a little; when the last balloon
 * pops, the basket lands softly on the grass. The cat smiles while balloons are left, looks a bit worried
 * on the last two, and smiles with closed eyes once safely down (or when the word is found).
 *
 * Built from layers so every motion is a plain View transform (translate / scale / opacity): the sky and
 * the hill (one Svg), the flying group (strings, basket and cat), each balloon in its own small Svg, and
 * the confetti. The group bobs very gently. Nothing moves in the first 0.7 s after the screen opens: a
 * phone that reconnects sees the balloons as they are; reduced motion → no bobbing, no confetti.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { haptic, play } from '@/lib/sfx';

import { EASE, useSettled } from './touch-motion';

/** The drawing's own units; the scene is scaled to the width it gets. */
const W = 320;
const H = 180;
const GROUND = 156;

const BALLOON_COLORS = ['#E2475F', '#F08A3E', '#F2B33D', '#2FB67C', '#22B8B0', '#4F5BD5', '#E86FA6'];
/** The bunch: centres of the 7 balloons (back ones first). */
const SPOTS = [
  { x: 160, y: 30 },
  { x: 134, y: 40 },
  { x: 186, y: 40 },
  { x: 110, y: 56 },
  { x: 210, y: 56 },
  { x: 146, y: 62 },
  { x: 174, y: 62 },
];
const RX = 15;
const RY = 18;
/** Which balloon pops first, second… (the outer ones first, the top one last: the bunch stays balanced). */
const POP_ORDER = [3, 4, 1, 2, 5, 6, 0];
/** Where the strings meet, above the basket. */
const KNOT = { x: 160, y: 100 };
/** The basket's top edge when all the balloons fly. */
const BASKET_TOP = 106;
const BASKET_H = 22;
/** How far the basket sinks from full to landed (its bottom then rests in the grass). */
const DROP = GROUND + 4 - (BASKET_TOP + BASKET_H);

const poppedIdx = (left: number) => new Set(POP_ORDER.slice(0, Math.max(0, 7 - left)));
const altitude = (left: number, max: number) => DROP * (1 - Math.max(0, left) / max);

export function BalloonScene({ balloons, max = 7, won, width, guesser, me }: { balloons: number; max?: number; won?: boolean | null; width: number; guesser?: string | null; me?: string }) {
  const k = width / W;
  const settled = useSettled();
  const reduced = useReducedMotion();
  const popped = poppedIdx(balloons);
  const landed = balloons <= 0;

  // the balloons that just popped, for their quick shrink and confetti (only once settled)
  const prev = useRef(balloons);
  const [bursts, setBursts] = useState<{ i: number; id: number }[]>([]);
  const burstId = useRef(0);
  useEffect(() => {
    const before = prev.current;
    prev.current = balloons;
    if (!settled || balloons >= before) return;
    const fresh = POP_ORDER.slice(Math.max(0, 7 - before), Math.max(0, 7 - balloons)).map((i) => ({ i, id: ++burstId.current }));
    if (!fresh.length) return;
    setBursts((b) => [...b.slice(-6), ...fresh]);
    play('pop');
    if (guesser && guesser === me) haptic.error();
    else haptic.light();
  }, [balloons, settled, guesser, me]);

  // altitude: the basket sinks a little at each pop and lands softly at the end
  const alt = useSharedValue(altitude(balloons, max));
  useEffect(() => {
    const to = altitude(balloons, max);
    if (!settled || reduced) alt.set(withTiming(to, { duration: settled ? 200 : 0 }));
    else alt.set(withTiming(to, { duration: landed ? 1500 : 900, easing: landed ? Easing.out(Easing.quad) : EASE }));
  }, [balloons, max, landed, settled, reduced, alt]);

  // a very gentle bob while flying
  const bob = useSharedValue(0);
  useEffect(() => {
    if (landed || reduced || !settled) {
      bob.set(withTiming(0, { duration: 400 }));
      return;
    }
    bob.set(withDelay(200, withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [landed, reduced, settled, bob]);

  const group = useAnimatedStyle(() => ({ transform: [{ translateY: (alt.get() + (bob.get() - 0.5) * 3 * (alt.get() < DROP - 0.5 ? 1 : 0)) * k }] }));
  const mood: Mood = landed || won ? 'happy' : balloons <= 2 ? 'worried' : 'smile';

  return (
    <View
      style={{ width, height: H * k, borderRadius: 20, overflow: 'hidden' }}
      accessibilityLabel={landed ? 'هبطت السلة على الأرض' : `${balloons} من ${max} بالونات`}>
      <Svg width={width} height={H * k} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute' }}>
        <Sky />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width, height: H * k }, group]}>
        <Svg width={width} height={H * k} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute' }}>
          {SPOTS.map((p, i) => (popped.has(i) ? null : <Path key={i} d={stringPath(p.x, p.y + RY + 3)} stroke="#E9E4FF" strokeOpacity={0.75} strokeWidth={1.1} fill="none" />))}
          <Basket mood={mood} />
        </Svg>
        {SPOTS.map((p, i) => (
          <Balloon key={i} i={i} k={k} gone={popped.has(i)} animate={settled && !reduced && bursts.some((b) => b.i === i)} />
        ))}
        {!reduced ? bursts.map((b) => <Confetti key={b.id} x={SPOTS[b.i].x} y={SPOTS[b.i].y} k={k} color={BALLOON_COLORS[b.i]} seed={b.id} />) : null}
      </Animated.View>
      {won ? <Sparkles k={k} /> : null}
    </View>
  );
}

/** A string from the balloon's knot down to the meeting point, slightly curved. */
function stringPath(x: number, y: number) {
  const mx = (x + KNOT.x) / 2 + (x < KNOT.x ? 4 : x > KNOT.x ? -4 : 0);
  const my = (y + KNOT.y) / 2;
  return `M${x} ${y} Q${mx} ${my} ${KNOT.x} ${KNOT.y}`;
}

function Sky() {
  return (
    <>
      <Defs>
        <LinearGradient id="bsky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2C2F72" />
          <Stop offset="1" stopColor="#5262B8" />
        </LinearGradient>
        <LinearGradient id="bhill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3FC48A" />
          <Stop offset="1" stopColor="#1E7F56" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#bsky)" />
      {/* a few stars and a crescent */}
      {[
        [26, 22, 1.2],
        [58, 46, 0.9],
        [84, 16, 1],
        [244, 20, 1.1],
        [278, 50, 0.9],
        [300, 18, 1.2],
        [40, 82, 0.8],
        [290, 92, 0.8],
      ].map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill="#FFF4DA" opacity={0.8} />
      ))}
      <Path d="M268 30 a12 12 0 1 0 12 15 a9.5 9.5 0 1 1 -12 -15Z" fill="#FFE7A8" opacity={0.95} />
      {/* soft clouds */}
      <G opacity={0.16} fill="#FFFFFF">
        <Ellipse cx={58} cy={110} rx={30} ry={9} />
        <Ellipse cx={74} cy={103} rx={16} ry={9} />
        <Ellipse cx={262} cy={124} rx={34} ry={9} />
        <Ellipse cx={248} cy={117} rx={15} ry={8} />
      </G>
      {/* the hill */}
      <Path d={`M0 ${GROUND + 6} Q80 ${GROUND - 8} 160 ${GROUND} T320 ${GROUND - 2} V${H} H0Z`} fill="url(#bhill)" />
      <Path d={`M0 ${H - 8} Q100 ${H - 18} 200 ${H - 10} T320 ${H - 12} V${H} H0Z`} fill="#1A6E4A" opacity={0.6} />
      {/* a few flowers in the grass */}
      {[
        [34, GROUND + 8, '#F2B33D'],
        [92, GROUND + 4, '#E86FA6'],
        [226, GROUND + 6, '#FFF4DA'],
        [290, GROUND + 4, '#F2B33D'],
      ].map(([x, y, c], i) => (
        <G key={i}>
          <Path d={`M${x} ${y} v6`} stroke="#145C3D" strokeWidth={1.2} />
          <Circle cx={x as number} cy={y as number} r={2.4} fill={c as string} />
        </G>
      ))}
    </>
  );
}

type Mood = 'smile' | 'worried' | 'happy';

/** The basket with its two ropes up to the knot, and the cat looking over the rim. */
function Basket({ mood }: { mood: Mood }) {
  const x0 = KNOT.x - 24;
  const x1 = KNOT.x + 24;
  const top = BASKET_TOP;
  const cy = top - 4;
  return (
    <G>
      <Path d={`M${x0 + 3} ${top} L${KNOT.x} ${KNOT.y} L${x1 - 3} ${top}`} stroke="#E9D3A8" strokeWidth={1.2} fill="none" />
      {/* the cat */}
      <G>
        <Path d={`M${KNOT.x - 10} ${cy - 6} L${KNOT.x - 12} ${cy - 17} L${KNOT.x - 3} ${cy - 10}Z`} fill="#F4A64A" stroke="#1B1830" strokeWidth={1.2} strokeLinejoin="round" />
        <Path d={`M${KNOT.x + 10} ${cy - 6} L${KNOT.x + 12} ${cy - 17} L${KNOT.x + 3} ${cy - 10}Z`} fill="#F4A64A" stroke="#1B1830" strokeWidth={1.2} strokeLinejoin="round" />
        <Circle cx={KNOT.x} cy={cy} r={11.5} fill="#F7B65C" stroke="#1B1830" strokeWidth={1.3} />
        <Path d={`M${KNOT.x - 4} ${cy - 10} q4 3 8 0`} stroke="#D9852E" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        {mood === 'happy' ? (
          <>
            <Path d={`M${KNOT.x - 6.5} ${cy - 1} q2.2 -2.6 4.4 0`} stroke="#1B1830" strokeWidth={1.4} fill="none" strokeLinecap="round" />
            <Path d={`M${KNOT.x + 2.1} ${cy - 1} q2.2 -2.6 4.4 0`} stroke="#1B1830" strokeWidth={1.4} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx={KNOT.x - 4.3} cy={cy - 1} r={1.8} fill="#1B1830" />
            <Circle cx={KNOT.x + 4.3} cy={cy - 1} r={1.8} fill="#1B1830" />
            <Circle cx={KNOT.x - 3.8} cy={cy - 1.6} r={0.6} fill="#FFFFFF" />
            <Circle cx={KNOT.x + 4.8} cy={cy - 1.6} r={0.6} fill="#FFFFFF" />
          </>
        )}
        <Ellipse cx={KNOT.x - 7.5} cy={cy + 3.5} rx={2} ry={1.2} fill="#F27C8C" opacity={0.7} />
        <Ellipse cx={KNOT.x + 7.5} cy={cy + 3.5} rx={2} ry={1.2} fill="#F27C8C" opacity={0.7} />
        <Path d={`M${KNOT.x - 1} ${cy + 1.6} h2 l-1 1.2z`} fill="#1B1830" />
        {mood === 'worried' ? (
          <Ellipse cx={KNOT.x} cy={cy + 5} rx={1.6} ry={1.9} fill="#1B1830" />
        ) : (
          <Path d={`M${KNOT.x - 3} ${cy + 3.6} q1.5 1.8 3 0 q1.5 1.8 3 0`} stroke="#1B1830" strokeWidth={1.1} fill="none" strokeLinecap="round" />
        )}
        {/* paws on the rim */}
        <Ellipse cx={KNOT.x - 8} cy={top + 1} rx={3.4} ry={2.4} fill="#F7B65C" stroke="#1B1830" strokeWidth={1} />
        <Ellipse cx={KNOT.x + 8} cy={top + 1} rx={3.4} ry={2.4} fill="#F7B65C" stroke="#1B1830" strokeWidth={1} />
      </G>
      {/* the wicker basket */}
      <Path d={`M${x0} ${top + 2} H${x1} L${x1 - 4} ${top + BASKET_H} Q${KNOT.x} ${top + BASKET_H + 3} ${x0 + 4} ${top + BASKET_H}Z`} fill="#C98A45" stroke="#1B1830" strokeWidth={1.3} strokeLinejoin="round" />
      <Rect x={x0 - 2} y={top - 1} width={x1 - x0 + 4} height={5} rx={2.5} fill="#A86B30" stroke="#1B1830" strokeWidth={1.2} />
      {[0.3, 0.55, 0.8].map((f) => (
        <Path key={f} d={`M${x0 + 2} ${top + BASKET_H * f + 2} H${x1 - 2}`} stroke="#8F5A26" strokeWidth={1} opacity={0.8} />
      ))}
      {[-14, -5, 5, 14].map((dx) => (
        <Path key={dx} d={`M${KNOT.x + dx} ${top + 4} L${KNOT.x + dx * 0.88} ${top + BASKET_H}`} stroke="#8F5A26" strokeWidth={1} opacity={0.6} />
      ))}
    </G>
  );
}

/** One balloon in its own small layer: it shrinks away when it pops. */
function Balloon({ i, k, gone, animate }: { i: number; k: number; gone: boolean; animate: boolean }) {
  const { x, y } = SPOTS[i];
  const color = BALLOON_COLORS[i];
  const s = useSharedValue(gone ? 0 : 1);
  useEffect(() => {
    if (gone) s.set(animate ? withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) }) : 0);
    else s.set(1);
  }, [gone, animate, s]);
  const st = useAnimatedStyle(() => ({ opacity: s.get() > 0.02 ? 1 : 0, transform: [{ scale: 0.25 + 0.75 * s.get() }] }));
  const w = (RX * 2 + 6) * k;
  const h = (RY * 2 + 10) * k;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (x - RX - 3) * k, top: (y - RY - 3) * k, width: w, height: h }, st]}>
      <Svg width={w} height={h} viewBox={`${x - RX - 3} ${y - RY - 3} ${RX * 2 + 6} ${RY * 2 + 10}`}>
        <Ellipse cx={x} cy={y} rx={RX} ry={RY} fill={color} stroke="#1B1830" strokeWidth={1.2} />
        <Ellipse cx={x - 5} cy={y - 7} rx={3.6} ry={6} fill="#FFFFFF" opacity={0.35} transform={`rotate(-20 ${x - 5} ${y - 7})`} />
        <Path d={`M${x - 3} ${y + RY + 3.5} L${x} ${y + RY - 0.5} L${x + 3} ${y + RY + 3.5}Z`} fill={color} stroke="#1B1830" strokeWidth={1} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

/** A few bits of colour falling from a popped balloon, then gone. */
function Confetti({ x, y, k, color, seed }: { x: number; y: number; k: number; color: string; seed: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [p]);
  const bits = [0, 1, 2, 3, 4, 5].map((j) => {
    const a = Math.sin(seed * 9.1 + j * 2.3);
    return { dx: (j - 2.5) * 6 + a * 4, dy: 26 + ((j * 7 + seed) % 5) * 5, rot: a * 160, c: j % 2 ? color : ['#FFF4DA', '#F2B33D', '#22B8B0'][j % 3] };
  });
  return (
    <>
      {bits.map((b, j) => (
        <Bit key={j} p={p} x={x} y={y} k={k} {...b} />
      ))}
    </>
  );
}

function Bit({ p, x, y, k, dx, dy, rot, c }: { p: SharedValue<number>; x: number; y: number; k: number; dx: number; dy: number; rot: number; c: string }) {
  const st = useAnimatedStyle(() => ({
    opacity: p.get() < 0.7 ? 1 : (1 - p.get()) / 0.3,
    transform: [{ translateX: dx * p.get() * k }, { translateY: dy * p.get() * k }, { rotate: `${rot * p.get()}deg` }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (x - 2) * k, top: (y - 1.5) * k, width: 4 * k, height: 3 * k, borderRadius: 1, backgroundColor: c }, st]} />;
}

/** The word found: a few soft sparkles around the basket. */
function Sparkles({ k }: { k: number }) {
  const settled = useSettled(300);
  const o = useSharedValue(0);
  useEffect(() => {
    if (settled) o.set(withTiming(1, { duration: 500 }));
  }, [settled, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  const star = (cx: number, cy: number, r: number) => `M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3} L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3}Z`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: W * k, height: H * k }, st]}>
      <Svg width={W * k} height={H * k} viewBox={`0 0 ${W} ${H}`}>
        {[
          [100, 96, 6],
          [222, 90, 7],
          [84, 30, 5],
          [238, 26, 5],
          [128, 132, 4],
          [196, 128, 4],
        ].map(([cx, cy, r], i) => (
          <Path key={i} d={star(cx, cy, r)} fill="#FFE7A8" />
        ))}
      </Svg>
    </Animated.View>
  );
}
