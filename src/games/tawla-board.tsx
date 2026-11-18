/**
 * «الطاولة» — the wooden board (react-native-svg) with the checkers on top (views, so a move can glide).
 * Drawn from the viewer's side: their home board is the bottom right quarter, the checkers go round
 * counter-clockwise (top right → top left → bottom left → bottom right) and off into the tray on the right.
 * Columns, left to right: 12…7 | bar | 6…1 at the bottom, 13…18 | bar | 19…24 at the top.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { TawlaSide, TawlaTarget, TawlaView } from '@/shared/games/tawla';
import { C, F } from '@/theme';
import { DICE_THROW_MS, ThrownDice } from '@/ui/dice3d';
import { Txt, num } from '@/ui/txt';

import { SlideIn } from './duel';

export const LOOK = [
  { face: '#F7EFDF', edge: '#B89D72', inner: 'rgba(150,120,80,0.45)', text: '#4A3423', name: 'العاجي' },
  { face: '#33201A', edge: '#9A6A3E', inner: 'rgba(230,190,140,0.35)', text: '#F7EFDF', name: 'الأبنوسي' },
] as const;

const FRAME = '#5A3118';
const FRAME_DARK = '#2E170A';
const FIELD_A = '#C99660';
const FIELD_B = '#B4824F';
const TRI = ['#F0DDB4', '#8C3820'] as const;
const TRAY = '#3F2211';

export interface BoardGeo {
  W: number;
  H: number;
  f: number;
  cw: number;
  bar: number;
  tray: number;
  d: number;
  ph: number;
  mg: number;
}

export function boardGeo(W: number): BoardGeo {
  const f = Math.max(6, Math.round(W * 0.022));
  const tray = Math.max(22, Math.round(W * 0.075));
  const bar = Math.max(20, Math.round(W * 0.066));
  const cw = (W - 2 * f - bar - tray) / 12;
  const d = cw - 1;
  const ph = d * 5;
  const mg = Math.max(34, d * 1.8);
  return { W, H: Math.round(2 * f + 2 * ph + mg), f, cw, bar, tray, d, ph, mg };
}

/** Column (0..11, left to right) and row of a point in the viewer's numbering. */
const place = (p: number) => (p <= 12 ? { col: 12 - p, top: false } : { col: p - 13, top: true });

function colX(g: BoardGeo, col: number) {
  return g.f + col * g.cw + (col >= 6 ? g.bar : 0);
}

/** Centre of the i-th checker (0 = at the edge) on point p. */
function spot(g: BoardGeo, p: number, i: number) {
  const { col, top } = place(p);
  const k = Math.min(i, 4);
  const x = colX(g, col) + g.cw / 2;
  const y = top ? g.f + g.d / 2 + k * g.d : g.H - g.f - g.d / 2 - k * g.d;
  return { x, y };
}

/** A checker on the bar: the near side's below the middle, the far side's above. */
function barSpot(g: BoardGeo, near: boolean, i: number) {
  const x = g.f + 6 * g.cw + g.bar / 2;
  const k = Math.min(i, 3);
  const off = g.mg / 2 + g.d * 0.55 + k * g.d * 0.9;
  return { x, y: near ? g.H / 2 + off : g.H / 2 - off };
}

/** A borne-off checker (a slab in the tray): the near side's at the bottom. */
function traySpot(g: BoardGeo, near: boolean, i: number) {
  const h = Math.max(3.5, g.d * 0.27);
  const x = g.W - g.f - g.tray / 2;
  return { x, y: near ? g.H - g.f - h / 2 - 2 - i * (h + 0.6) : g.f + h / 2 + 2 + i * (h + 0.6), h };
}

function Checker({ g, side, x, y, label, mark, steps, glow }: {
  g: BoardGeo;
  side: TawlaSide;
  x: number;
  y: number;
  label?: string;
  /** source: can move · picked: selected */
  mark?: 'source' | 'picked';
  steps?: { x: number; y: number }[];
  glow?: boolean;
}) {
  const look = LOOK[side];
  const d = g.d;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - d / 2, top: y - d / 2, width: d, height: d }}>
      <SlideIn steps={steps ?? []} ms={230}>
        <View
          style={[
            styles.checker,
            {
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: look.face,
              borderColor: mark ? C.yellow : look.edge,
              borderWidth: mark === 'picked' ? Math.max(2.5, d * 0.16) : mark ? Math.max(2, d * 0.12) : Math.max(1.2, d * 0.08),
            },
            glow && styles.glow,
          ]}>
          <View style={{ width: d * 0.56, height: d * 0.56, borderRadius: d, borderWidth: 1, borderColor: look.inner }} />
          {label ? (
            <View style={StyleSheet.absoluteFill}>
              <Txt style={{ fontFamily: F.black, fontSize: Math.max(10, d * 0.5), lineHeight: d, textAlign: 'center', color: look.text }}>{label}</Txt>
            </View>
          ) : null}
        </View>
      </SlideIn>
    </View>
  );
}

/** A die face (ivory, dark pips). */
export function DieFace({ value, size, dim }: { value: number; size: number; dim?: boolean }) {
  const P: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
  };
  const pip = size * 0.18;
  const pad = size * 0.2;
  const step = (size - 2 * pad) / 2;
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.2, opacity: dim ? 0.35 : 1 }]}>
      {(P[value] ?? []).map(([cx, cy], i) => (
        <View key={i} style={{ position: 'absolute', width: pip, height: pip, borderRadius: pip, backgroundColor: '#2A1C14', left: pad + cx * step - pip / 2, top: pad + cy * step - pip / 2 }} />
      ))}
    </View>
  );
}

/** The dice lying in a half of the board; a double shows four marks for its four moves. */
function RestingDice({ dice, left, size }: { dice: number[]; left: number[]; size: number }) {
  const dbl = dice.length === 2 && dice[0] === dice[1];
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ flexDirection: 'row', gap: size * 0.25 }}>
        {dice.map((v, i) => (
          <DieFace key={i} value={v} size={size} dim={!dbl && !left.includes(v)} />
        ))}
      </View>
      {dbl ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.useDot, i < left.length && styles.useDotOn]} />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

/** A soft pulse behind the places a checker can go. */
function Pulse({ children }: { children: ReactNode }) {
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.set(withRepeat(withSequence(withTiming(0.95, { duration: 650 }), withTiming(0.55, { duration: 650 })), -1));
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st]}>
      {children}
    </Animated.View>
  );
}

export function TawlaBoard({ view, W, selected, targets, sources, onPoint, onBar, onOff, interactive }: {
  view: TawlaView;
  W: number;
  selected: number | null;
  targets: TawlaTarget[];
  sources: Set<number>;
  onPoint: (p: number) => void;
  onBar: () => void;
  onOff: () => void;
  interactive: boolean;
}) {
  const g = boardGeo(W);
  const { f, cw, H, d, ph } = g;
  const near = view.near;
  const far: TawlaSide = near === 0 ? 1 : 0;
  const dests = new Set(selected !== null ? targets.filter((t) => t.from === selected).map((t) => t.to) : []);

  // the dice: thrown into the half of the player on turn, then lying there
  const [landed, setLanded] = useState(view.rollId);
  const rolling = landed !== view.rollId;
  useEffect(() => {
    if (!rolling) return;
    const t = setTimeout(() => setLanded(view.rollId), DICE_THROW_MS + 500);
    return () => clearTimeout(t);
  }, [rolling, view.rollId]);
  const halfW = 6 * cw;
  const rightX = f + 6 * cw + g.bar;
  const dieSize = Math.max(20, Math.min(g.mg * 0.62, cw * 1.25));
  const turnNear = view.turn === near;
  const diceX = turnNear ? rightX : f;
  // the thrown dice stay in the half of whoever threw them (the turn may pass while they still roll)
  const [throwAt, setThrowAt] = useState({ id: view.rollId, near: turnNear });
  if (throwAt.id !== view.rollId) setThrowAt({ id: view.rollId, near: turnNear });
  const throwX = (throwAt.id === view.rollId ? throwAt.near : turnNear) ? rightX : f;

  // the last move: the checker glides along its way, a hit checker glides to the bar
  const last = view.last;
  const moverNear = last ? last.side === near : false;
  const counts = (p: number) => view.points[p - 1];
  const topOf = (p: number, isNear: boolean) => {
    const n = counts(p);
    return isNear ? Math.max(0, n) : Math.max(0, -n);
  };
  const posOn = (p: number, isNear: boolean, extra = 0) => {
    if (p === 25) return barSpot(g, isNear, Math.max(0, view.bar[isNear ? 0 : 1] - 1 + extra));
    if (p === 0) return traySpot(g, isNear, Math.max(0, view.off[isNear ? 0 : 1] - 1 + extra));
    return spot(g, p, Math.max(0, topOf(p, isNear) - 1 + extra));
  };
  let movedKey = '';
  let movedSteps: { x: number; y: number }[] = [];
  const hitKeys = new Map<string, { x: number; y: number }[]>();
  if (last && last.path.length >= 2) {
    const end = last.path[last.path.length - 1];
    const fin = posOn(end, moverNear);
    if (end !== 0) {
      movedKey = `${end}`;
      movedSteps = last.path.slice(0, -1).map((p) => {
        // where the checker was (one above what lies there now)
        const at = posOn(p, moverNear, 1);
        return { x: at.x - fin.x, y: at.y - fin.y };
      });
    }
    // hit checkers (the other side) now on their bar, newest on top
    const hn = last.hits.length;
    last.hits.forEach((p, k) => {
      const idx = view.bar[moverNear ? 1 : 0] - hn + k;
      const b = barSpot(g, !moverNear, Math.max(0, idx));
      const from = spot(g, p, 0);
      // it waits on its point until the mover arrives, then goes to the bar
      const at = { x: from.x - b.x, y: from.y - b.y };
      hitKeys.set(`bar:${!moverNear ? 'n' : 'f'}:${idx}`, Array.from({ length: last.path.length - 1 }, () => at));
    });
  }
  const fromMark = last && last.path.length >= 2 && last.path[0] >= 1 && last.path[0] <= 24 ? last.path[0] : null;

  const triangles = [];
  for (let col = 0; col < 12; col++) {
    const x = colX(g, col);
    for (const top of [true, false]) {
      const p = top ? col + 13 : 12 - col;
      const y0 = top ? f : H - f;
      const y1 = top ? f + ph * 0.96 : H - f - ph * 0.96;
      const color = TRI[(col + (top ? 0 : 1)) % 2];
      triangles.push(<Polygon key={`t${p}`} points={`${x + 1},${y0} ${x + cw - 1},${y0} ${x + cw / 2},${y1}`} fill={color} opacity={0.96} />);
      triangles.push(<Polygon key={`s${p}`} points={`${x + cw / 2},${y1} ${x + cw - 1},${y0} ${x + cw / 2 + 1},${y0}`} fill="rgba(0,0,0,0.08)" />);
    }
  }

  const glow = [...dests].map((p) => {
    if (p === 0) return null;
    const { col, top } = place(p);
    const x = colX(g, col);
    const y0 = top ? f : H - f;
    const y1 = top ? f + ph * 0.96 : H - f - ph * 0.96;
    return <Polygon key={`g${p}`} points={`${x + 1},${y0} ${x + cw - 1},${y0} ${x + cw / 2},${y1}`} fill={C.yellow} opacity={0.7} />;
  });
  const landing = [...dests].map((p) => {
    if (p === 0) return null;
    const own = Math.max(0, counts(p));
    const s = spot(g, p, own);
    return <Circle key={`l${p}`} cx={s.x} cy={s.y} r={d * 0.24} fill="#FFF6DD" stroke={C.yellow} strokeWidth={2} />;
  });

  const checkers: ReactNode[] = [];
  for (let p = 1; p <= 24; p++) {
    const n = counts(p);
    if (!n) continue;
    const side: TawlaSide = n > 0 ? near : far;
    const isNear = n > 0;
    const k = Math.abs(n);
    const shown = Math.min(k, 5);
    for (let i = 0; i < shown; i++) {
      const s = spot(g, p, i);
      const isTop = i === shown - 1;
      const moved = isTop && movedKey === `${p}` && isNear === moverNear;
      const mark = isNear && interactive && isTop && sources.has(p) ? (selected === p ? 'picked' : 'source') : undefined;
      checkers.push(
        <Checker
          key={moved ? `${p}:${i}:m${last!.seq}` : `${p}:${i}:${side}`}
          g={g}
          side={side}
          x={s.x}
          y={s.y}
          label={isTop && k > 5 ? num(k) : undefined}
          mark={mark}
          steps={moved ? movedSteps : undefined}
          glow={mark === 'picked'}
        />,
      );
    }
  }
  for (const isNear of [true, false]) {
    const k = view.bar[isNear ? 0 : 1];
    const side: TawlaSide = isNear ? near : far;
    for (let i = 0; i < Math.min(k, 4); i++) {
      const s = barSpot(g, isNear, i);
      const isTop = i === Math.min(k, 4) - 1;
      const hk = `bar:${isNear ? 'n' : 'f'}:${i}`;
      const hit = hitKeys.get(hk);
      const mark = isNear && interactive && isTop && sources.has(25) ? (selected === 25 ? 'picked' : 'source') : undefined;
      checkers.push(
        <Checker key={hit ? `${hk}:h${last!.seq}` : hk} g={g} side={side} x={s.x} y={s.y} label={isTop && k > 4 ? num(k) : undefined} mark={mark} steps={hit} glow={mark === 'picked'} />,
      );
    }
  }

  const slabs: ReactNode[] = [];
  for (const isNear of [true, false]) {
    const look = LOOK[isNear ? near : far];
    for (let i = 0; i < view.off[isNear ? 0 : 1]; i++) {
      const s = traySpot(g, isNear, i);
      slabs.push(<Rect key={`o${isNear ? 'n' : 'f'}${i}`} x={s.x - (g.tray - 8) / 2} y={s.y - s.h / 2} width={g.tray - 8} height={s.h} rx={1.5} fill={look.face} stroke={look.edge} strokeWidth={0.8} />);
    }
  }
  const offGlow = dests.has(0);
  const trayX = g.W - f - g.tray;

  return (
    <View style={[styles.board, { width: g.W, height: H }]} accessibilityLabel="لوحة الطاولة">
      <Svg width={g.W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="tw-field" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={FIELD_A} />
            <Stop offset="1" stopColor={FIELD_B} />
          </LinearGradient>
          <LinearGradient id="tw-frame" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#6E3D1E" />
            <Stop offset="1" stopColor={FRAME} />
          </LinearGradient>
          <RadialGradient id="tw-shade" cx="50%" cy="50%" r="70%">
            <Stop offset="0.6" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.22} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={g.W} height={H} rx={10} fill="url(#tw-frame)" />
        <Rect x={1} y={1} width={g.W - 2} height={H - 2} rx={9} fill="none" stroke={FRAME_DARK} strokeWidth={2} />
        {/* the two playing fields */}
        <Rect x={f} y={f} width={halfW} height={H - 2 * f} fill="url(#tw-field)" />
        <Rect x={rightX} y={f} width={halfW} height={H - 2 * f} fill="url(#tw-field)" />
        {/* a little wood grain */}
        <G opacity={0.12}>
          {[0.18, 0.37, 0.52, 0.71, 0.86].map((t, i) => (
            <Path key={i} d={`M ${f} ${f + (H - 2 * f) * t} C ${f + halfW * 0.3} ${f + (H - 2 * f) * (t - 0.03)}, ${f + halfW * 0.7} ${f + (H - 2 * f) * (t + 0.03)}, ${f + halfW} ${f + (H - 2 * f) * t}`} stroke="#5A3118" strokeWidth={1} fill="none" />
          ))}
          {[0.24, 0.45, 0.63, 0.8].map((t, i) => (
            <Path key={`r${i}`} d={`M ${rightX} ${f + (H - 2 * f) * t} C ${rightX + halfW * 0.35} ${f + (H - 2 * f) * (t + 0.03)}, ${rightX + halfW * 0.65} ${f + (H - 2 * f) * (t - 0.02)}, ${rightX + halfW} ${f + (H - 2 * f) * t}`} stroke="#5A3118" strokeWidth={1} fill="none" />
          ))}
        </G>
        {triangles}
        <Rect x={f} y={f} width={halfW} height={H - 2 * f} fill="url(#tw-shade)" />
        <Rect x={rightX} y={f} width={halfW} height={H - 2 * f} fill="url(#tw-shade)" />
        {/* the bar and the tray */}
        <Rect x={f + halfW} y={0} width={g.bar} height={H} fill={FRAME} />
        <Line x1={f + halfW + g.bar / 2} y1={f} x2={f + halfW + g.bar / 2} y2={H - f} stroke={FRAME_DARK} strokeWidth={1.2} opacity={0.6} />
        <Rect x={trayX} y={f} width={g.tray} height={H / 2 - f - 3} rx={3} fill={TRAY} />
        <Rect x={trayX} y={H / 2 + 3} width={g.tray} height={H / 2 - f - 3} rx={3} fill={TRAY} />
        {fromMark !== null ? (() => {
          const s = spot(g, fromMark, topOf(fromMark, moverNear));
          return <Circle cx={s.x} cy={s.y} r={d / 2 - 1.5} fill="none" stroke="rgba(255,248,230,0.75)" strokeWidth={1.5} strokeDasharray="3 3" />;
        })() : null}
        {slabs}
      </Svg>

      {dests.size ? (
        <Pulse>
          <Svg width={g.W} height={H}>
            {glow}
            {offGlow ? <Rect x={trayX} y={H / 2 + 3} width={g.tray} height={H / 2 - f - 3} rx={3} fill={C.yellow} opacity={0.6} /> : null}
            {landing}
          </Svg>
        </Pulse>
      ) : null}

      {checkers}

      {/* the dice */}
      {view.phase === 'opening' ? (
        <>
          {([near, far] as TawlaSide[]).map((side) => {
            const v = view.opening[side] ?? view.openTie;
            if (!v) return null;
            const x = side === near ? rightX : f;
            return (
              <View key={side} pointerEvents="none" style={[styles.diceBox, { left: x, top: H / 2 - g.mg / 2, width: halfW, height: g.mg }]}>
                <DieFace value={v} size={dieSize} dim={view.opening[side] === null} />
              </View>
            );
          })}
        </>
      ) : view.dice && (view.phase === 'move' || view.phase === 'roll') ? (
        <View pointerEvents="none" style={[styles.diceBox, { left: diceX, top: H / 2 - g.mg / 2, width: halfW, height: g.mg }]}>
          {!rolling ? <RestingDice dice={view.dice} left={view.left} size={dieSize} /> : null}
        </View>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: throwX, top: 0, width: halfW, height: H }}>
        <ThrownDice values={view.dice} rollId={view.rollId} width={halfW} height={H} size={dieSize} linger={150} onLanded={() => setLanded(view.rollId)} />
      </View>

      {/* taps */}
      {interactive ? (
        <>
          {Array.from({ length: 24 }, (_, i) => {
            const p = i + 1;
            const { col, top } = place(p);
            const can = sources.has(p) || dests.has(p);
            return (
              <Pressable
                key={`p${p}`}
                onPress={() => onPoint(p)}
                accessibilityLabel={`النقطة ${p}`}
                disabled={!can && selected === null}
                style={{ position: 'absolute', left: colX(g, col), top: top ? 0 : H / 2, width: cw, height: H / 2 }}
              />
            );
          })}
          <Pressable onPress={onBar} accessibilityLabel="الوسط" style={{ position: 'absolute', left: f + halfW, top: 0, width: g.bar, height: H }} />
          <Pressable onPress={onOff} accessibilityLabel="إخراج الحجر" style={{ position: 'absolute', left: trayX, top: H / 2, width: g.tray + f, height: H / 2 }} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 0 #2E170A, 0 8px 18px rgba(0,0,0,0.35)' },
  checker: { alignItems: 'center', justifyContent: 'center', boxShadow: '0 1.5px 2px rgba(0,0,0,0.45)' },
  glow: { boxShadow: `0 0 8px 2px ${C.yellow}` },
  die: { backgroundColor: '#FBF6EA', borderWidth: 1, borderColor: '#C9B997', boxShadow: '0 2px 3px rgba(0,0,0,0.4)' },
  diceBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  useDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  useDotOn: { backgroundColor: '#FBF6EA' },
});
