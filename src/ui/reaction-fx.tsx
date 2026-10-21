/**
 * The big, lively reaction effect (the one exception to the app's "gentle animations" rule): the
 * emoji — or the phrase on a comic burst — pops in at the middle of the screen with a flash, a
 * shockwave ring and speed rays, while 20–30 themed pieces (hearts, tears, flames, confetti…) burst
 * out in every direction, spin, drift and fade. Under it, who sent it. About 2.6 s in all.
 *
 * Performance: ONE shared clock (a single withTiming from 0 to FX_MS on the UI thread) drives every
 * piece; each piece's position, turn, size and fade are computed in a worklet from random numbers
 * drawn once when the effect starts. No JS work and no React render per frame; the pieces are plain
 * Views / Texts / small static SVGs moved with transforms and opacity only. The overlay never takes
 * touches (pointerEvents none), so the game stays playable underneath.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import type { PlayerPublic } from '@/shared/protocol';
import { REACTIONS, type ReactionKey } from '@/shared/reactions';
import { F } from '@/theme';

import { Avatar } from './bits';

/** The whole effect, ms. */
export const FX_MS = 2600;
/** when the big emoji starts to leave */
const OUT_MS = 380;

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

type ShapeName = 'heart' | 'wingHeart' | 'star' | 'spark' | 'drop' | 'flame' | 'streamer' | 'moon' | 'bolt';

type Piece =
  /** an emoji (the phone's own emoji font) */
  | { k: 'g'; g: string; g2?: [number, number] }
  /** a vector shape in a colour */
  | { k: 's'; s: ShapeName; c: string; g2?: [number, number] }
  /** a confetti strip or a dot (plain Views: the cheapest) */
  | { k: 'r'; c: string; round?: boolean; g2?: [number, number] }
  /** a short text: ؟ ! ههه */
  | { k: 't'; t: string; c: string; g2?: [number, number] };

type BigMotion = 'beat' | 'jiggle' | 'clap' | 'flicker' | 'grow' | 'wobble' | 'droop' | 'tilt' | 'shake' | 'pulse' | 'zoom';

interface Theme {
  big: BigMotion;
  /** the flash, the ring and the rays */
  glow: string;
  rays: string;
  pieces: Piece[];
  count: number;
  /** how far the pieces fly, as a part of the screen's longer half */
  speed: [number, number];
  /** px down (+) or up (−) the pieces drift over their life */
  gravity: [number, number];
  sway: [number, number];
  /** degrees over the piece's life (either way) */
  spin: [number, number];
  size: [number, number];
  /** where the pieces fly: everywhere, mostly upward, or mostly to the sides */
  dir?: 'all' | 'up' | 'sides';
  /** confetti turning over and over */
  flutter?: boolean;
  /** a share of the pieces comes in from an edge of the screen (embers from the bottom, rain from the top) */
  edge?: { from: 'bottom' | 'top'; share: number };
  /** a phrase: the burst behind it and its letters */
  sticker?: { bg: string; edge: string; text: string; shadow: string };
}

const g = (s: string, g2?: [number, number]): Piece => ({ k: 'g', g: s, g2 });
const sh = (s: ShapeName, c: string, g2?: [number, number]): Piece => ({ k: 's', s, c, g2 });
const rc = (c: string, round?: boolean, g2?: [number, number]): Piece => ({ k: 'r', c, round, g2 });
const tx = (t: string, c: string, g2?: [number, number]): Piece => ({ k: 't', t, c, g2 });

const FESTIVE = ['#FFD23F', '#FF5D8F', '#3DDC97', '#4CC9F0', '#FF9F1C', '#B388FF', '#FFFFFF'];
const confetti = FESTIVE.map((c) => rc(c, false, [260, 520]));
const dots = (cs: string[]) => cs.map((c) => rc(c, true));
const TEAR: [number, number] = [380, 720];

const THEMES: Record<ReactionKey, Theme> = {
  heart: {
    big: 'beat',
    glow: '#FF2D55',
    rays: '#FF8FB1',
    pieces: [
      sh('heart', '#FF2D55'), sh('heart', '#E2475F'), sh('heart', '#FF6B8B'), sh('heart', '#FF8FB1'), sh('heart', '#C2185B'), sh('heart', '#FF4D6D'),
      sh('wingHeart', '#FF2D55'), sh('wingHeart', '#FF6B8B'), sh('wingHeart', '#E2475F'),
      g('💖'), g('💕'), g('💘'), g('💗'), sh('spark', '#FFD1DC'),
    ],
    count: 32,
    speed: [0.32, 0.78],
    gravity: [-220, -60],
    sway: [14, 40],
    spin: [10, 70],
    size: [18, 40],
    edge: { from: 'bottom', share: 0.25 },
  },
  laugh: {
    big: 'jiggle',
    glow: '#FFC93C',
    rays: '#FFE27A',
    pieces: [
      g('😂'), g('🤣'), g('😆'), tx('ههه', '#FFD23F'), tx('هههه', '#FFFFFF'), tx('ههه', '#FF9F1C'),
      sh('drop', '#5BC0FF', TEAR), sh('drop', '#7FD3FF', TEAR), sh('drop', '#4CC9F0', TEAR), sh('drop', '#9BE1FF', TEAR), sh('drop', '#5BC0FF', TEAR),
    ],
    count: 28,
    speed: [0.3, 0.8],
    gravity: [-80, 60],
    sway: [8, 26],
    spin: [20, 120],
    size: [20, 40],
    dir: 'sides',
  },
  clap: {
    big: 'clap',
    glow: '#FFD23F',
    rays: '#FFF3B0',
    pieces: [
      sh('spark', '#FFD23F'), sh('spark', '#FFFFFF'), sh('spark', '#FFE27A'), sh('star', '#FFC93C'), sh('star', '#FFE27A'),
      g('👏'), g('✨'), g('👏'),
      ...confetti,
    ],
    count: 32,
    speed: [0.35, 0.85],
    gravity: [80, 300],
    sway: [10, 30],
    spin: [90, 520],
    size: [16, 32],
    flutter: true,
    edge: { from: 'top', share: 0.25 },
  },
  fire: {
    big: 'flicker',
    glow: '#FF6A00',
    rays: '#FFC93C',
    pieces: [
      sh('flame', '#FF6A00'), sh('flame', '#FF8C1A'), sh('flame', '#FF4D00'), sh('flame', '#FFA41B'), sh('flame', '#FF6A00'),
      g('🔥'), g('🔥'),
      ...dots(['#FFD23F', '#FFB703', '#FF7B00', '#FFE066', '#FFF1A8', '#FF9F1C']),
    ],
    count: 34,
    speed: [0.22, 0.6],
    gravity: [-420, -160],
    sway: [16, 46],
    spin: [0, 40],
    size: [16, 44],
    edge: { from: 'bottom', share: 0.35 },
  },
  wow: {
    big: 'grow',
    glow: '#FFD23F',
    rays: '#FFFFFF',
    pieces: [
      sh('star', '#FFD23F'), sh('star', '#FFE27A'), sh('star', '#FFFFFF'), sh('star', '#FFB703'),
      tx('!', '#FFFFFF'), tx('!', '#FFD23F'), tx('؟!', '#FF9F1C'), g('💫'), g('✨'), g('⭐'), sh('spark', '#FFFFFF'),
    ],
    count: 28,
    speed: [0.35, 0.85],
    gravity: [-60, 80],
    sway: [6, 22],
    spin: [60, 360],
    size: [16, 36],
  },
  sweat: {
    big: 'wobble',
    glow: '#4CC9F0',
    rays: '#BDEBFF',
    pieces: [sh('drop', '#4CC9F0', TEAR), sh('drop', '#7FD3FF', TEAR), sh('drop', '#9BE1FF', TEAR), sh('drop', '#5BC0FF', TEAR), g('💦'), g('💦'), g('😅'), ...dots(['#BDEBFF', '#E6F7FF'])],
    count: 26,
    speed: [0.25, 0.7],
    gravity: [300, 600],
    sway: [4, 16],
    spin: [0, 30],
    size: [16, 34],
    dir: 'up',
    edge: { from: 'top', share: 0.25 },
  },
  think: {
    big: 'tilt',
    glow: '#B388FF',
    rays: '#E0CCFF',
    pieces: [tx('؟', '#FFD23F'), tx('؟', '#FFFFFF'), tx('؟', '#B388FF'), tx('؟', '#4CC9F0'), tx('?', '#FF8FB1'), g('💭'), g('🤔'), sh('spark', '#E0CCFF')],
    count: 24,
    speed: [0.25, 0.7],
    gravity: [-260, -80],
    sway: [12, 34],
    spin: [20, 110],
    size: [22, 42],
  },
  monkey: {
    big: 'wobble',
    glow: '#C98A4B',
    rays: '#FFE0B5',
    pieces: [g('🙈'), g('🙉'), g('🙊'), g('🍌'), g('🙈'), g('🍃'), sh('heart', '#FF8FB1'), sh('spark', '#FFE0B5'), ...dots(['#FFD23F', '#C98A4B'])],
    count: 24,
    speed: [0.3, 0.8],
    gravity: [40, 260],
    sway: [8, 26],
    spin: [40, 240],
    size: [22, 40],
  },
  cry: {
    big: 'droop',
    glow: '#3D7BE9',
    rays: '#9BC4FF',
    pieces: [sh('drop', '#4CC9F0', [520, 900]), sh('drop', '#5BA8FF', [520, 900]), sh('drop', '#7FD3FF', [520, 900]), sh('drop', '#9BE1FF', [520, 900]), g('💧'), g('😭'), g('💧'), ...dots(['#9BC4FF', '#CFE3FF'])],
    count: 30,
    speed: [0.18, 0.55],
    gravity: [360, 700],
    sway: [2, 12],
    spin: [0, 20],
    size: [16, 34],
    dir: 'up',
    edge: { from: 'top', share: 0.4 },
  },
  party: {
    big: 'zoom',
    glow: '#FF5D8F',
    rays: '#FFD23F',
    pieces: [
      ...confetti, ...confetti,
      sh('streamer', '#FFD23F', [200, 420]), sh('streamer', '#FF5D8F', [200, 420]), sh('streamer', '#3DDC97', [200, 420]), sh('streamer', '#4CC9F0', [200, 420]),
      g('🎊'), g('🎉'), g('🎈'),
    ],
    count: 34,
    speed: [0.4, 0.95],
    gravity: [180, 460],
    sway: [10, 34],
    spin: [180, 720],
    size: [14, 30],
    flutter: true,
    edge: { from: 'top', share: 0.3 },
  },
  bravo: {
    big: 'pulse',
    glow: '#FFD23F',
    rays: '#FFFFFF',
    pieces: [g('👏'), g('🌟'), sh('star', '#FFD23F'), sh('star', '#FFFFFF'), sh('spark', '#FFE27A'), sh('spark', '#FFFFFF'), ...confetti],
    count: 30,
    speed: [0.35, 0.9],
    gravity: [60, 300],
    sway: [8, 28],
    spin: [90, 540],
    size: [16, 32],
    flutter: true,
    edge: { from: 'top', share: 0.25 },
    sticker: { bg: '#7B2FF7', edge: '#FFD23F', text: '#FFFFFF', shadow: '#2A0A6B' },
  },
  yasalam: {
    big: 'pulse',
    glow: '#FF5D8F',
    rays: '#FFD1DC',
    pieces: [g('✨'), g('😍'), sh('heart', '#FF5D8F'), sh('heart', '#FF8FB1'), sh('spark', '#FFFFFF'), sh('spark', '#FFD23F'), sh('star', '#FFE27A'), ...dots(['#FFD23F', '#FF8FB1', '#FFFFFF'])],
    count: 28,
    speed: [0.32, 0.85],
    gravity: [-140, 40],
    sway: [10, 30],
    spin: [40, 300],
    size: [16, 32],
    sticker: { bg: '#E8336F', edge: '#FFFFFF', text: '#FFFFFF', shadow: '#7A0C33' },
  },
  luck: {
    big: 'pulse',
    glow: '#3DDC97',
    rays: '#D8FFE9',
    pieces: [g('🍀'), g('🍀'), g('🤞'), g('⭐'), sh('star', '#FFD23F'), sh('spark', '#FFFFFF'), sh('spark', '#3DDC97'), ...dots(['#3DDC97', '#FFD23F', '#FFFFFF'])],
    count: 28,
    speed: [0.3, 0.85],
    gravity: [-120, 80],
    sway: [10, 30],
    spin: [40, 300],
    size: [16, 32],
    sticker: { bg: '#11845B', edge: '#FFD23F', text: '#FFFFFF', shadow: '#053D2A' },
  },
  faster: {
    big: 'shake',
    glow: '#FF9F1C',
    rays: '#FFFFFF',
    pieces: [sh('bolt', '#FFD23F'), sh('bolt', '#FFE066'), sh('bolt', '#FF9F1C'), g('⚡'), g('⏱️'), g('🏃'), sh('spark', '#FFFFFF'), ...dots(['#FFD23F', '#FFFFFF'])],
    count: 28,
    speed: [0.45, 1],
    gravity: [-40, 60],
    sway: [0, 10],
    spin: [20, 200],
    size: [16, 34],
    dir: 'sides',
    sticker: { bg: '#E85D04', edge: '#FFFFFF', text: '#FFFFFF', shadow: '#6B2300' },
  },
  mashallah: {
    big: 'pulse',
    glow: '#FFD23F',
    rays: '#FFF3B0',
    pieces: [sh('moon', '#FFD23F'), sh('moon', '#FFE9A8'), sh('star', '#FFD23F'), sh('star', '#FFFFFF'), sh('spark', '#FFF3B0'), sh('spark', '#3DDC97'), g('🌙'), g('✨'), g('🌟'), ...dots(['#FFD23F', '#3DDC97'])],
    count: 30,
    speed: [0.3, 0.85],
    gravity: [-160, 20],
    sway: [10, 30],
    spin: [20, 200],
    size: [16, 34],
    edge: { from: 'bottom', share: 0.25 },
    sticker: { bg: '#0F6B4F', edge: '#FFD23F', text: '#FFE9A8', shadow: '#03291E' },
  },
  nonono: {
    big: 'shake',
    glow: '#E2475F',
    rays: '#FFFFFF',
    pieces: [g('❌'), g('🙅'), g('❌'), tx('لا', '#FFFFFF'), tx('لا', '#FFD23F'), tx('لا', '#FF8FB1'), sh('spark', '#FFFFFF'), ...dots(['#FF4D6D', '#FFFFFF'])],
    count: 26,
    speed: [0.3, 0.85],
    gravity: [0, 220],
    sway: [6, 20],
    spin: [40, 260],
    size: [18, 36],
    sticker: { bg: '#D7263D', edge: '#FFFFFF', text: '#FFFFFF', shadow: '#5E0714' },
  },
  waer: {
    big: 'pulse',
    glow: '#FF6A00',
    rays: '#FFD23F',
    pieces: [g('🔥'), g('💪'), g('😎'), g('⭐'), sh('star', '#FFD23F'), sh('spark', '#FFFFFF'), sh('flame', '#FF6A00'), sh('flame', '#FFA41B'), ...dots(['#FFD23F', '#FF7B00'])],
    count: 30,
    speed: [0.35, 0.9],
    gravity: [-200, 40],
    sway: [10, 30],
    spin: [40, 280],
    size: [16, 34],
    sticker: { bg: '#1B1B3A', edge: '#FF9F1C', text: '#FFD23F', shadow: '#000000' },
  },
};

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

const HEART = 'M12 21.6C5.6 16.4 1.5 12.7 1.5 8.1 1.5 4.8 4 2.4 7.1 2.4c2 0 3.8 1 4.9 2.6 1.1-1.6 2.9-2.6 4.9-2.6 3.1 0 5.6 2.4 5.6 5.7 0 4.6-4.1 8.3-10.5 13.5z';
const SPARK = 'M12 0C12.9 7.6 16.4 11.1 24 12 16.4 12.9 12.9 16.4 12 24 11.1 16.4 7.6 12.9 0 12 7.6 11.1 11.1 7.6 12 0z';
const STAR = 'M12 1.2l3.2 6.9 7.5.9-5.6 5.1 1.5 7.4L12 17.8l-6.6 3.7 1.5-7.4L1.3 9l7.5-.9z';
const DROP = 'M12 1.5C12 1.5 4.5 11 4.5 15.8a7.5 7.5 0 0 0 15 0C19.5 11 12 1.5 12 1.5z';
const FLAME = 'M12 .8c1.6 4.6 7.6 7.5 7.6 13.9a7.6 7.6 0 0 1-15.2 0c0-3 1.7-5 3-6.2.2 2 1 3.2 2.3 3.6C9.4 8.4 10.4 4 12 .8z';
const FLAME_IN = 'M12 10c.9 2.4 4 3.8 4 7.2a4 4 0 0 1-8 0c0-1.7 1-2.8 1.8-3.4.2 1 .6 1.6 1.2 1.9-.2-2.3.2-4.1 1-5.7z';
const MOON = 'M15.5 1.8a10.4 10.4 0 1 0 7 17.6A8.4 8.4 0 1 1 15.5 1.8z';
const BOLT = 'M14 .8 3.6 13.6h6.6L8.4 23.2 20.4 9.6h-6.6z';
const WING_L = 'M13 11C8.5 4.5 2 4.2.6 7.4c3 .2 4.8 1.2 5.8 2.8C3.6 10.4 2.2 12 2 13.6c3.6-1 7.4-1 11 .6z';

function Shape({ s, c, size }: { s: ShapeName; c: string; size: number }) {
  switch (s) {
    case 'heart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={HEART} fill={c} />
          <Ellipse cx={7.6} cy={7.4} rx={2.2} ry={1.4} fill="#FFFFFF" opacity={0.45} transform="rotate(-35 7.6 7.4)" />
        </Svg>
      );
    case 'wingHeart':
      return (
        <Svg width={size * 1.6} height={size} viewBox="0 0 38 24">
          <Path d={WING_L} fill="#FFE4EC" />
          <G transform="translate(38 0) scale(-1 1)">
            <Path d={WING_L} fill="#FFE4EC" />
          </G>
          <G transform="translate(9.4 2) scale(0.8)">
            <Path d={HEART} fill={c} />
            <Ellipse cx={7.6} cy={7.4} rx={2.2} ry={1.4} fill="#FFFFFF" opacity={0.45} transform="rotate(-35 7.6 7.4)" />
          </G>
        </Svg>
      );
    case 'spark':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={SPARK} fill={c} />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={STAR} fill={c} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.8} strokeLinejoin="round" />
        </Svg>
      );
    case 'drop':
      return (
        <Svg width={size * 0.8} height={size} viewBox="2 0 20 24">
          <Path d={DROP} fill={c} />
          <Ellipse cx={9.4} cy={15.6} rx={1.6} ry={2.8} fill="#FFFFFF" opacity={0.6} />
        </Svg>
      );
    case 'flame':
      return (
        <Svg width={size * 0.8} height={size} viewBox="2 0 20 24">
          <Path d={FLAME} fill={c} />
          <Path d={FLAME_IN} fill="#FFE066" />
        </Svg>
      );
    case 'streamer':
      return (
        <Svg width={size * 1.4} height={size} viewBox="0 0 34 24">
          <Path d="M2 12C6 2 10 22 15 12s9-10 13 0 4 6 4 6" stroke={c} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={MOON} fill={c} />
        </Svg>
      );
    case 'bolt':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={BOLT} fill={c} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={0.8} strokeLinejoin="round" />
        </Svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Random set-up (once per effect)                                     */
/* ------------------------------------------------------------------ */

interface Part {
  piece: Piece;
  size: number;
  /** start, burst and drift (px from the middle) */
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  grav: number;
  sway: number;
  swayF: number;
  swayPh: number;
  rot0: number;
  spin: number;
  delay: number;
  life: number;
  /** confetti turning over (radians over the life), 0 = none */
  flip: number;
  front: boolean;
}

/** A small seeded random generator (mulberry32): the same reaction draws the same burst, render after render. */
function seeded(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const range = (r: Rand) => (a: number, b: number) => a + r() * (b - a);

function makeParts(theme: Theme, w: number, h: number, bigSize: number, rand: Rand): Part[] {
  const rnd = range(rand);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  // an elliptic reach: as far sideways as the screen is wide, as far up/down as it is high
  const rx = w * 0.56;
  const ry = h * 0.5;
  // big, chunky pieces (the theme sizes are for a 360 px phone)
  const k = 1.45 * Math.min(1.25, Math.max(0.85, Math.min(w, h) / 360));
  const n = theme.count;
  const nEdge = theme.edge ? Math.round(n * theme.edge.share) : 0;
  const nBurst = n - nEdge;
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    const piece = pick(theme.pieces);
    const glyph = piece.k === 'g' || piece.k === 't';
    const spinMax = glyph ? Math.min(theme.spin[1], 120) : theme.spin[1];
    const common = {
      piece,
      size: rnd(theme.size[0], theme.size[1]) * k,
      sway: rnd(theme.sway[0], theme.sway[1]),
      swayF: rnd(5, 11),
      swayPh: rnd(0, Math.PI * 2),
      rot0: rnd(-25, 25),
      spin: rnd(theme.spin[0], spinMax) * (rand() < 0.5 ? -1 : 1),
      flip: theme.flutter && piece.k === 'r' && !piece.round ? rnd(8, 18) : 0,
      front: rand() < 0.45,
    };
    if (i >= nBurst && theme.edge) {
      // from the screen's edge: embers rising from the bottom, tears / confetti raining from the top
      const up = theme.edge.from === 'bottom';
      const delay = rnd(150, 1000);
      const life = Math.min(FX_MS - 60 - delay, rnd(1400, 2000));
      parts.push({
        ...common,
        x0: rnd(-0.48, 0.48) * w,
        y0: (up ? 1 : -1) * (h * 0.5 + 24),
        dx: rnd(-24, 24),
        dy: (up ? -1 : 1) * h * rnd(0.25, 0.45),
        grav: (up ? -1 : 1) * h * rnd(0.35, 0.6),
        delay,
        life,
      });
      continue;
    }
    // most burst out at once with the pop; the rest keep coming for a moment (a fountain)
    const late = i >= nBurst * 0.72;
    let a: number;
    if (theme.dir === 'up') a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
    else if (theme.dir === 'sides') a = (rand() < 0.5 ? 0 : Math.PI) + rnd(-1, 1);
    else a = (i / nBurst) * Math.PI * 2 + rnd(-0.35, 0.35);
    const f = rnd(theme.speed[0], theme.speed[1]) * (late ? 0.7 : 1);
    const start = bigSize * rnd(0.12, 0.32);
    const delay = late ? rnd(320, 900) : rnd(70, 230);
    parts.push({
      ...common,
      x0: Math.cos(a) * start,
      y0: Math.sin(a) * start,
      dx: Math.cos(a) * rx * f,
      dy: Math.sin(a) * ry * f,
      grav: piece.g2 ? rnd(piece.g2[0], piece.g2[1]) : rnd(theme.gravity[0], theme.gravity[1]),
      delay,
      life: Math.min(FX_MS - 60 - delay, rnd(1600, 2300)),
    });
  }
  return parts;
}

/* ------------------------------------------------------------------ */
/* Animated parts                                                      */
/* ------------------------------------------------------------------ */

const PieceView = memo(function PieceView({ p, clock }: { p: Part; clock: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const u = (clock.get() - p.delay) / p.life;
    if (u <= 0 || u >= 1) {
      return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 0 }, { scaleX: 1 }] };
    }
    const v = 1 - u;
    // a fast burst that slows down (ease-out), then the drift takes over
    const e = 1 - v * v * v * v;
    const x = p.x0 + p.dx * e + p.sway * Math.sin(p.swayPh + u * p.swayF) * u;
    const y = p.y0 + p.dy * e + p.grav * u * u;
    // pops in with a little overshoot, shrinks a bit as it goes, fades at the end
    let s: number;
    if (u < 0.12) {
      const k = u / 0.12 - 1;
      s = 1 + 3.2 * k * k * k + 2.2 * k * k; // back-out: overshoots to about 1.15
    } else s = 1 - (0.3 * (u - 0.12)) / 0.88;
    const o = u > 0.68 ? v / 0.32 : 1;
    return {
      opacity: o,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${p.rot0 + p.spin * (0.6 * e + 0.4 * u)}deg` },
        { scale: Math.max(0, s) },
        { scaleX: p.flip ? Math.cos(u * p.flip) : 1 },
      ],
    };
  });
  const { piece, size } = p;
  let body;
  if (piece.k === 'g') body = <Text style={[styles.glyph, { fontSize: size, lineHeight: size * 1.25 }]}>{piece.g}</Text>;
  else if (piece.k === 't')
    body = (
      <Text style={[styles.word, { fontSize: size * 0.95, lineHeight: size * 1.5, color: piece.c }]} numberOfLines={1}>
        {piece.t}
      </Text>
    );
  else if (piece.k === 'r')
    body = piece.round ? (
      <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size, backgroundColor: piece.c }} />
    ) : (
      <View style={{ width: size * 1.1, height: size * 0.5, borderRadius: 3, backgroundColor: piece.c }} />
    );
  else body = <Shape s={piece.s} c={piece.c} size={size} />;
  return <Animated.View style={[styles.abs, st]}>{body}</Animated.View>;
});

/** The flash behind the emoji: a soft round glow that blooms, then stays faintly. */
let flashIds = 0;

/** A soft darkening around the middle while the reaction is on, so it stands out over a busy game. */
function Dim({ clock, w, h }: { clock: SharedValue<number>; w: number; h: number }) {
  const id = useMemo(() => `rdm${++flashIds}`, []);
  const st = useAnimatedStyle(() => {
    const t = clock.get();
    return { opacity: Math.min(1, t / 180, Math.max(0, (FX_MS - t) / 420)) };
  });
  return (
    <Animated.View style={[styles.abs, st]}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="75%" ry="60%">
            <Stop offset="0" stopColor="#080918" stopOpacity={0.55} />
            <Stop offset="0.55" stopColor="#080918" stopOpacity={0.3} />
            <Stop offset="1" stopColor="#080918" stopOpacity={0.12} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function Flash({ clock, color, size }: { clock: SharedValue<number>; color: string; size: number }) {
  // (two effects may overlap on the web: each gradient needs its own id in the page)
  const id = useMemo(() => `rfl${++flashIds}`, []);
  const st = useAnimatedStyle(() => {
    const t = clock.get();
    const k = Math.min(1, t / 520);
    const bloom = t < 520 ? 1 - (1 - k) * (1 - k) : 1;
    const end = t > FX_MS - OUT_MS ? (FX_MS - t) / OUT_MS : 1;
    const o = (t < 160 ? t / 160 : t < 700 ? 1 - ((t - 160) / 540) * 0.55 : 0.45) * end;
    return { opacity: o, transform: [{ scale: 0.35 + bloom * 0.85 + 0.04 * Math.sin(t / 140) }] };
  });
  return (
    <Animated.View style={[styles.abs, st]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="0.22" stopColor={color} stopOpacity={0.75} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.22} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** A comic "splat" that bursts out behind the emoji and fades (like the ink splash in the reference). */
function Splat({ clock, color, size, seed }: { clock: SharedValue<number>; color: string; size: number; seed: number }) {
  const d = useMemo(() => {
    const rand = seeded(seed + 7);
    const n = 14;
    let s = '';
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? 0.5 * (0.55 + rand() * 0.12) : 0.5 * (0.82 + rand() * 0.18);
      s += `${i ? 'L' : 'M'}${((0.5 + Math.cos(a) * r) * 100).toFixed(1)} ${((0.5 + Math.sin(a) * r) * 100).toFixed(1)}`;
    }
    return `${s}Z`;
  }, [seed]);
  const st = useAnimatedStyle(() => {
    const t = clock.get() - 60;
    if (t <= 0 || t > 560) return { opacity: 0, transform: [{ scale: 0 }, { rotate: '0deg' }] };
    const k = t / 560;
    return { opacity: k < 0.25 ? 0.85 : 0.85 * (1 - (k - 0.25) / 0.75), transform: [{ scale: 0.3 + 1.15 * (1 - (1 - k) * (1 - k) * (1 - k)) }, { rotate: `${k * 25}deg` }] };
  });
  return (
    <Animated.View style={[styles.abs, st]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d={d} fill={color} stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.2} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

function Ring({ clock, color, size }: { clock: SharedValue<number>; color: string; size: number }) {
  const st = useAnimatedStyle(() => {
    const t = clock.get() - 90;
    if (t <= 0 || t > 620) return { opacity: 0, transform: [{ scale: 0 }] };
    const k = t / 620;
    return { opacity: 0.95 * (1 - k), transform: [{ scale: 0.25 + 2.4 * (1 - (1 - k) * (1 - k)) }] };
  });
  return <Animated.View style={[styles.abs, { width: size, height: size, borderRadius: size / 2, borderWidth: 5, borderColor: color }, st]} />;
}

function Ray({ clock, color, angle, len, reach, delay }: { clock: SharedValue<number>; color: string; angle: number; len: number; reach: number; delay: number }) {
  const st = useAnimatedStyle(() => {
    const t = clock.get() - delay;
    if (t <= 0 || t > 460) return { opacity: 0, transform: [{ rotate: `${angle}deg` }, { translateY: 0 }, { scaleY: 0 }] };
    const k = t / 460;
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    return { opacity: k < 0.5 ? 1 : (1 - k) * 2, transform: [{ rotate: `${angle}deg` }, { translateY: -(reach * 0.18 + reach * 0.42 * e) }, { scaleY: 1 - 0.75 * k }] };
  });
  return <Animated.View style={[styles.abs, { width: 7, height: len, borderRadius: 4, backgroundColor: color }, st]} />;
}

/** The big emoji / phrase's own motion on top of the pop: a heartbeat, a laugh's jiggle, claps… */
function useBigStyle(clock: SharedValue<number>, motion: BigMotion, reduced: boolean) {
  return useAnimatedStyle(() => {
    const t = clock.get();
    // the pop: a spring from nothing to a little too big and back
    let s = reduced ? 1 : 1 - Math.exp(-t / 140) * Math.cos(t / 80);
    let o = reduced ? Math.min(1, t / 200) : Math.min(1, t / 60);
    let x = 0;
    let y = 0;
    let r = 0;
    let sx = 1;
    let sy = 1;
    const on = Math.min(1, t / 400); // the motion eases in after the pop
    if (!reduced) {
      switch (motion) {
        case 'beat': {
          // a double heartbeat every 760 ms
          const ph = (t % 760) / 760;
          const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(ph - c) / w);
          s *= 1 + on * 0.13 * (bump(0.08, 0.08) + 0.7 * bump(0.26, 0.08));
          break;
        }
        case 'jiggle':
          r = on * 11 * Math.sin(t / 42);
          y = -on * 10 * Math.abs(Math.sin(t / 95));
          break;
        case 'clap': {
          const c = Math.max(0, Math.sin(t / 62));
          s *= 1 + on * 0.12 * c * c * c * c;
          r = on * 4 * Math.sin(t / 124);
          break;
        }
        case 'flicker':
          sy = 1 + on * (0.07 * Math.sin(t / 47) + 0.04 * Math.sin(t / 19));
          sx = 1 - on * 0.035 * Math.sin(t / 47);
          y = -on * 4 * Math.sin(t / 47);
          break;
        case 'grow':
          s *= 1 + 0.16 * Math.min(1, t / 1400) + on * 0.03 * Math.sin(t / 90);
          break;
        case 'wobble':
          r = on * 13 * Math.sin(t / 115);
          break;
        case 'droop':
          y = 22 * Math.min(1, t / 1600);
          r = on * 4 * Math.sin(t / 260);
          s *= 1 - 0.04 * Math.min(1, t / 1600);
          break;
        case 'tilt':
          r = -16 * Math.sin(Math.min(1, t / 700) * Math.PI * 0.5) + on * 4 * Math.sin(t / 330);
          break;
        case 'shake': {
          // shakes "no" in short spurts
          const ph = (t % 700) / 700;
          x = ph < 0.45 ? on * 13 * Math.sin(t / 30) * Math.sin((ph / 0.45) * Math.PI) : 0;
          r = x * 0.35;
          break;
        }
        case 'zoom':
          s *= 1 + on * 0.08 * Math.sin(t / 110);
          r = on * 9 * Math.sin(t / 170);
          break;
        case 'pulse':
          s *= 1 + on * 0.06 * Math.sin(t / 120);
          r = on * 3 * Math.sin(t / 240);
          break;
      }
    }
    // the way out: shrinks and rises while it fades
    const out = t - (FX_MS - OUT_MS);
    if (out > 0) {
      const k = Math.min(1, out / OUT_MS);
      if (!reduced) {
        s *= 1 + 0.12 * Math.sin(Math.min(1, k * 2.5) * Math.PI) - 0.75 * k * k;
        y -= 40 * k * k;
      }
      o *= 1 - k;
    }
    return {
      opacity: o,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${r}deg` }, { scale: Math.max(0, s) }, { scaleX: sx }, { scaleY: sy }],
    };
  });
}

/** The burst behind a phrase: a spiky comic shape that turns slowly. */
function StickerBurst({ clock, w, h, bg, edge }: { clock: SharedValue<number>; w: number; h: number; bg: string; edge: string }) {
  const d = useMemo(() => {
    const n = 18;
    let s = '';
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? 0.8 : 1;
      s += `${i ? 'L' : 'M'}${(50 + Math.cos(a) * 49 * r).toFixed(1)} ${(50 + Math.sin(a) * 49 * r).toFixed(1)}`;
    }
    return `${s}Z`;
  }, []);
  const st = useAnimatedStyle(() => {
    const t = clock.get();
    return { transform: [{ rotate: `${-6 + 5 * Math.sin(t / 380)}deg` }, { scale: 1 + 0.03 * Math.sin(t / 95) }] };
  });
  return (
    <Animated.View style={[styles.abs, st]}>
      <Svg width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path d={d} fill={edge} />
        <G transform="translate(50 50) scale(0.88) translate(-50 -50)">
          <Path d={d} fill={bg} />
        </G>
        <Ellipse cx={50} cy={34} rx={30} ry={12} fill="#FFFFFF" opacity={0.12} />
      </Svg>
    </Animated.View>
  );
}

function Sender({ clock, player, offset }: { clock: SharedValue<number>; player: Pick<PlayerPublic, 'name' | 'avatar' | 'color' | 'bot'>; offset: number }) {
  const st = useAnimatedStyle(() => {
    const t = clock.get();
    const inK = Math.min(1, Math.max(0, (t - 220) / 260));
    const out = Math.min(1, Math.max(0, (t - (FX_MS - OUT_MS)) / OUT_MS));
    return { opacity: inK * (1 - out), transform: [{ translateY: offset + 14 * (1 - inK) }, { scale: 0.85 + 0.15 * inK }] };
  });
  return (
    <Animated.View style={[styles.abs, styles.pill, st]}>
      <Avatar player={player} size={26} />
      <Text style={styles.pillName} numberOfLines={1}>
        {player.name}
      </Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The effect                                                          */
/* ------------------------------------------------------------------ */

export function ReactionFx({
  reaction,
  seed,
  player,
  onDone,
}: {
  reaction: ReactionKey;
  /** draws the burst's random numbers (the reaction's id: the same burst on every render) */
  seed: number;
  player: Pick<PlayerPublic, 'name' | 'avatar' | 'color' | 'bot'> | null;
  onDone: () => void;
}) {
  const { width: w, height: h } = useWindowDimensions();
  const reduced = useReducedMotion();
  const info = REACTIONS[reaction];
  const theme = THEMES[reaction];
  const phrase = info.kind === 'phrase';
  const bigSize = Math.round(Math.min(w * 0.6, h * 0.3, 240));
  const clock = useSharedValue(0);

  const parts = useMemo(() => (reduced ? [] : makeParts(theme, w, h, bigSize, seeded(seed))), [reduced, theme, w, h, bigSize, seed]);
  const rays = useMemo(() => {
    if (reduced) return [];
    const rnd = range(seeded(seed + 3));
    return Array.from({ length: 8 }, (_, i) => ({ angle: (i / 8) * 360 + rnd(-12, 12), len: rnd(26, 48), delay: rnd(60, 140) }));
  }, [reduced, seed]);

  useEffect(() => {
    clock.set(
      withTiming(FX_MS, { duration: FX_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (finished) => {
        if (finished) scheduleOnRN(onDone);
      }),
    );
    // a safety net in case the animation's end callback never comes (a hidden tab on the web…)
    const t = setTimeout(onDone, FX_MS + 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bigStyle = useBigStyle(clock, theme.big, reduced);
  const reach = Math.max(w, h) * 0.5;
  const back = parts.filter((p) => !p.front);
  const front = parts.filter((p) => p.front);

  // a phrase: as wide as fits, its letters sized to the burst
  const stW = Math.min(w * 0.9, 380);
  const stH = Math.round(stW * 0.56);
  const words = info.text.length;
  const phraseSize = Math.round(Math.min(84, (stW * 0.76) / Math.max(3, words * 0.43)));

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Dim clock={clock} w={w} h={h} />
      {reduced ? null : <Flash clock={clock} color={theme.glow} size={bigSize * 2.6} />}
      {reduced ? null : <Splat clock={clock} color={theme.glow} size={bigSize * 1.6} seed={seed} />}
      {reduced ? null : <Ring clock={clock} color={theme.rays} size={bigSize * 1.1} />}
      {rays.map((r, i) => (
        <Ray key={`r${i}`} clock={clock} color={theme.rays} angle={r.angle} len={r.len} reach={reach} delay={r.delay} />
      ))}
      {back.map((p, i) => (
        <PieceView key={`b${i}`} p={p} clock={clock} />
      ))}
      <Animated.View style={[styles.abs, bigStyle]}>
        {phrase && theme.sticker ? (
          <View style={{ width: stW, height: stH, alignItems: 'center', justifyContent: 'center' }}>
            <StickerBurst clock={clock} w={stW} h={stH} bg={theme.sticker.bg} edge={theme.sticker.edge} />
            <Text
              style={[
                styles.phrase,
                { fontSize: phraseSize, lineHeight: Math.round(phraseSize * 1.5), color: theme.sticker.text, textShadowColor: theme.sticker.shadow },
              ]}
              numberOfLines={1}>
              {info.text}
            </Text>
          </View>
        ) : (
          <Text style={[styles.big, { fontSize: bigSize * 0.8, lineHeight: bigSize * 1.05 }]}>{info.text}</Text>
        )}
      </Animated.View>
      {front.map((p, i) => (
        <PieceView key={`f${i}`} p={p} clock={clock} />
      ))}
      {player ? <Sender clock={clock} player={player} offset={phrase ? stH * 0.5 + 34 : bigSize * 0.55 + 26} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // an absolutely placed child of the centred layer sits in its middle (no left/right: RTL-proof)
  abs: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  glyph: { textAlign: 'center', includeFontPadding: false, color: '#FFFFFF' },
  word: { fontFamily: F.display, textAlign: 'center', includeFontPadding: false, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  big: { textAlign: 'center', includeFontPadding: false, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 14 },
  phrase: { fontFamily: F.display, textAlign: 'center', includeFontPadding: false, writingDirection: 'rtl', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0, paddingHorizontal: 8 },
  pill: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    paddingStart: 4,
    paddingEnd: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(16,18,41,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    maxWidth: 220,
  },
  pillName: { fontFamily: F.bold, fontSize: 14, lineHeight: 20, color: '#F7F4EC', flexShrink: 1 },
});
