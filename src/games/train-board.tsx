/**
 * «قطار المغرب» — the map: Morocco whole with its Sahara (one shape, the coast drawn as a halo under the
 * land so no line ever crosses it), the routes as rows of small wagon slots in their colours, the cities
 * and their names. A claimed route shows the owner's wagons (white edges); the route claimed last fills
 * in wagon by wagon. A tap anywhere picks the route nearest the finger.
 */
import { useRef, useState } from 'react';
import { Platform, Pressable, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/sfx';
import { routeOpen, type TrainView } from '@/shared/games/train';
import { TRAIN_LAND, TRAIN_MOROCCO } from '@/shared/train-outline';
import { BOARD_H, BOARD_W, CITIES, CITY_R, ROUTES, SLOT_T, routeLine, routeSlots, type LabelAt, type Slot } from '@/shared/train-map';
import { F } from '@/theme';

import { routeHex, seatColor } from './train-art';

export const boardHeight = (width: number) => Math.round((width * BOARD_H) / BOARD_W);

const SEA = '#1A3D60';
const LAND = '#283157';
const MOROCCO = '#EAD4A2';
const COAST = '#B98F52';
const INK = '#1B1830';
const HILITE = '#FFD84D';

const LABEL: Record<LabelAt, [number, number, 'start' | 'middle' | 'end']> = {
  n: [0, -24, 'middle'],
  s: [0, 44, 'middle'],
  e: [22, 10, 'start'],
  w: [-22, 10, 'end'],
  ne: [16, -16, 'start'],
  nw: [-16, -16, 'end'],
  se: [16, 38, 'start'],
  sw: [-16, 38, 'end'],
};

/** distance from a point to a segment */
function segDist(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** The route under a point of the board (null if none is close). */
export function routeAt(x: number, y: number, reach: number): number | null {
  let best: number | null = null;
  let bestD = reach;
  for (const r of ROUTES) {
    const pts = routeLine(r);
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = segDist(x, y, pts[i], pts[i + 1]);
      if (d < bestD) {
        bestD = d;
        best = r.id;
      }
    }
  }
  return best;
}

export interface BoardMarks {
  /** cities ringed in gold (a ticket chosen in the list, the tickets on offer) */
  cities?: string[];
  /** cities of my open tickets: a faint ring */
  soft?: string[];
  /** cities of my completed tickets: a green ring */
  done?: string[];
}

export function TrainBoard({
  view,
  width,
  selected,
  onRoute,
  marks,
}: {
  view: TrainView;
  width: number;
  selected: number | null;
  onRoute?: (id: number) => void;
  marks?: BoardMarks;
}) {
  const height = boardHeight(width);
  const k = width / BOARD_W;
  const frame = useRef<View>(null);

  // the route claimed last fills in, once (never on a screen that just opened)
  const [seen] = useState(() => ({ seq: view.last?.seq ?? 0 }));
  const fresh = view.last && view.last.kind === 'claim' && view.last.seq > seen.seq ? view.last : null;

  const tapAt = (lx: number, ly: number) => {
    if (!onRoute || !Number.isFinite(lx) || !Number.isFinite(ly)) return;
    // a finger is ~ 14 px wide: reach at least that far on a small map
    const id = routeAt(lx / k, ly / k, Math.max(26, 16 / k));
    if (id !== null) {
      haptic.tap();
      onRoute(id);
    }
  };
  const tap = (e: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    // the web has no reliable locationX: measure the map and use page coordinates
    if (Platform.OS !== 'web' && Number.isFinite(locationX)) return tapAt(locationX, locationY);
    frame.current?.measure((_x, _y, _w, _h, left, top) => tapAt(pageX - left, pageY - top));
  };

  const seatOf = (id: string) => view.players[id]?.seat ?? 0;
  const marked = new Set(marks?.cities ?? []);
  const soft = new Set(marks?.soft ?? []);
  const done = new Set(marks?.done ?? []);
  // about 10.5 px on a phone, a little larger on a computer's bigger map
  const fontSize = Math.max(26, Math.min(32, 10.5 / k)) * (width > 380 ? 1.12 : 1);
  const sel = selected !== null ? ROUTES[selected] : null;

  return (
    <Pressable onPress={tap} disabled={!onRoute} accessibilityRole="button" accessibilityLabel="خريطة السكك: المس سكة لاختيارها">
      <View ref={frame} collapsable={false} style={{ width, height, borderRadius: 14, overflow: 'hidden', direction: 'ltr' }}>
        <Svg width={width} height={height} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} pointerEvents="none">
          <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill={SEA} />
          <Path d={TRAIN_LAND} fill={LAND} />
          {/* the coast as a halo under the land: the land's fill covers every inner line */}
          <Path d={TRAIN_MOROCCO} fill="none" stroke={COAST} strokeWidth={10} strokeLinejoin="round" />
          <Path d={TRAIN_MOROCCO} fill={MOROCCO} />
          <SvgText x={150} y={215} fontSize={26} fontFamily={F.bold} fill="rgba(255,255,255,0.55)" textAnchor="middle">
            المحيط الأطلسي
          </SvgText>
          <SvgText x={815} y={52} fontSize={24} fontFamily={F.bold} fill="rgba(255,255,255,0.5)" textAnchor="middle">
            البحر المتوسط
          </SvgText>

          {/* the chosen route glows under its slots */}
          {sel ? (
            <G>
              {routeSlots(sel).map((s, i) => (
                <Rect key={i} x={-s.len / 2 - 7} y={-SLOT_T / 2 - 7} width={s.len + 14} height={SLOT_T + 14} rx={9} fill={HILITE} opacity={0.9} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`} />
              ))}
            </G>
          ) : null}

          {ROUTES.map((r) => {
            const owner = view.owners[r.id];
            if (owner && fresh && fresh.route === r.id) return null; // drawn by the fill-in above the map
            const closed = !owner && r.twin !== undefined && !!view.owners[r.twin] && !view.doubles;
            if (owner) return <Claimed key={r.id} id={r.id} color={seatColor(seatOf(owner))} />;
            return (
              <G key={r.id} opacity={closed ? 0.28 : 1}>
                {routeSlots(r).map((s, i) => (
                  <Rect key={i} x={-s.len / 2} y={-SLOT_T / 2} width={s.len} height={SLOT_T} rx={4} fill={routeHex(r.color)} stroke={INK} strokeWidth={3} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`} />
                ))}
              </G>
            );
          })}

          {CITIES.map((c) => (
            <G key={c.id}>
              {marked.has(c.id) ? <Circle cx={c.x} cy={c.y} r={CITY_R + 13} fill={HILITE} opacity={0.95} /> : null}
              {!marked.has(c.id) && done.has(c.id) ? <Circle cx={c.x} cy={c.y} r={CITY_R + 9} fill="#2FB67C" opacity={0.9} /> : null}
              {!marked.has(c.id) && !done.has(c.id) && soft.has(c.id) ? <Circle cx={c.x} cy={c.y} r={CITY_R + 9} fill={HILITE} opacity={0.55} /> : null}
              <Circle cx={c.x} cy={c.y} r={CITY_R} fill="#FFFFFF" stroke={INK} strokeWidth={6} />
            </G>
          ))}
          {CITIES.map((c) => {
            const [dx, dy, anchor] = LABEL[c.label];
            const props = { x: c.x + dx, y: c.y + dy, fontSize, fontFamily: F.bold, textAnchor: anchor } as const;
            return (
              <G key={`t${c.id}`}>
                <SvgText {...props} fill="none" stroke="#F8EBCB" strokeWidth={8} strokeLinejoin="round">
                  {c.short ?? c.name}
                </SvgText>
                <SvgText {...props} fill={INK}>
                  {c.short ?? c.name}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* the route claimed last: its wagons fill in one by one */}
        {fresh && fresh.route !== undefined ? (
          <View key={`f${fresh.seq}`} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
            {routeSlots(ROUTES[fresh.route]).map((s, i) => (
              <Animated.View
                key={i}
                entering={FadeIn.delay(150 + i * 140).duration(320)}
                style={{
                  position: 'absolute',
                  left: (s.x - s.len / 2) * k,
                  top: (s.y - SLOT_T / 2 - 1) * k,
                  width: s.len * k,
                  height: (SLOT_T + 2) * k,
                  borderRadius: 5 * k,
                  backgroundColor: seatColor(seatOf(fresh.by)),
                  borderWidth: Math.max(1, 3.5 * k),
                  borderColor: '#FFFFFF',
                  transform: [{ rotate: `${s.angle}deg` }],
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A slot's two ends. */
function ends(s: Slot): [[number, number], [number, number]] {
  const a = (s.angle * Math.PI) / 180;
  const dx = (Math.cos(a) * s.len) / 2;
  const dy = (Math.sin(a) * s.len) / 2;
  return [
    [s.x - dx, s.y - dy],
    [s.x + dx, s.y + dy],
  ];
}

/**
 * A claimed route: one train in the owner's colour along the whole route (a white edge around it, the
 * wagons marked by dark joints), so it never reads as a free route of the same colour.
 */
function Claimed({ id, color }: { id: number; color: string }) {
  const slots = routeSlots(ROUTES[id]);
  const pts = slots.flatMap(ends);
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`;
  return (
    <G>
      <Path d={d} fill="none" stroke="#FFFFFF" strokeWidth={SLOT_T + 9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} fill="none" stroke={color} strokeWidth={SLOT_T + 1} strokeLinecap="round" strokeLinejoin="round" />
      {slots.slice(1).map((sl, i) => {
        // the joint between two wagons
        const [x, y] = ends(sl)[0];
        const [px, py] = ends(slots[i])[1];
        const a = (sl.angle * Math.PI) / 180;
        const nx = -Math.sin(a) * (SLOT_T / 2 + 1);
        const ny = Math.cos(a) * (SLOT_T / 2 + 1);
        const mx = (x + px) / 2;
        const my = (y + py) / 2;
        return <Path key={i} d={`M${mx + nx} ${my + ny}L${mx - nx} ${my - ny}`} stroke={INK} strokeWidth={4} opacity={0.55} />;
      })}
    </G>
  );
}

/** Can I claim this route now (the board's part: free, the double-route rule, my wagons)? */
export function boardOpen(view: TrainView, id: number, me: string): boolean {
  const r = ROUTES[id];
  return routeOpen(view.owners, r, me, view.doubles) && (view.players[me]?.wagons ?? 0) >= r.len;
}
