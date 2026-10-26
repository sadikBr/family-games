/**
 * «المثلثات» — the digital «Chain Triangle»: a dark hexagonal board of pegs; drag from one peg to another
 * along one of the three lattice directions (the band snaps to the line and previews), or tap two pegs.
 * Bands are drawn as rubber loops in the mover's colour, completed triangles get a piece of the owner's
 * colour (it fades in gently), the last band is highlighted.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Polygon } from 'react-native-svg';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { li } from '@/shared/li';
import { TRI_BANDS, TRI_DIRS, TRI_SIZES, triBandEdges, triCounts, triGeometry, type TriGeometry, type TrianglesView } from '@/shared/games/triangles';
import type { RoomView } from '@/shared/protocol';
import { C, alpha, shade } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal, Toggle } from '@/ui/controls';
import { Confetti, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar } from './duel';
import { helpers, type Helpers } from './helpers';
import { EASE, useSettled } from './touch-motion';

/** One colour per seat, bright enough on the dark board. */
const TRI_COLORS = ['#F0566B', '#4AA8F0', '#3CCB8A', '#B48CF0'];
const BOARD = '#11142E';
const BOARD_EDGE = '#1C2050';
const INK = '#0A0C1E';

const nameOf = (h: Helpers, view: TrianglesView, id: string) => (h.players.some((p) => p.id === id) ? h.player(id).name : (view.names[id] ?? '؟'));

/** Screen geometry: unit size and peg positions for a board of this width. */
function layout(g: TriGeometry, W: number) {
  const n = g.n;
  const m = 0.62; // margin around the outer pegs, in units
  const u = W / (2 * n + 2 * m);
  const H = (n * Math.sqrt(3) + 2 * m) * u;
  const px = (i: number) => W / 2 + g.pts[i].x * u;
  const py = (i: number) => H / 2 + g.pts[i].y * u;
  const R = (n + m * 0.9) / n; // the board's corners, a little outside the outer pegs
  const corners = [
    [n, 0],
    [0, n],
    [-n, n],
    [-n, 0],
    [0, -n],
    [n, -n],
  ]
    .map(([q, r]) => `${W / 2 + (q + r / 2) * u * R},${H / 2 + ((r * Math.sqrt(3)) / 2) * u * R}`)
    .join(' ');
  return { u, H, px, py, corners };
}

type Lay = ReturnType<typeof layout>;

/** A unit triangle's piece: the triangle shrunk towards its centre, clear of the bands on its sides. */
function piecePoints(g: TriGeometry, L: Lay, t: number, k = 0.52) {
  const [a, b, c] = g.tris[t].pts;
  const cx = (L.px(a) + L.px(b) + L.px(c)) / 3;
  const cy = (L.py(a) + L.py(b) + L.py(c)) / 3;
  return [a, b, c].map((p) => `${cx + (L.px(p) - cx) * k},${cy + (L.py(p) - cy) * k}`).join(' ');
}

/** A rubber band looped around two pegs: bright strands, a darker middle. */
function BandShape({ x1, y1, x2, y2, color, u, d }: { x1: number; y1: number; x2: number; y2: number; color: string; u: number; d?: string }) {
  const w = u * 0.24;
  const props = d ? { d, fill: 'none' as const } : null;
  const draw = (stroke: string, width: number, extra?: object) =>
    props ? (
      <Path {...props} stroke={stroke} strokeWidth={width} strokeLinecap="round" {...extra} />
    ) : (
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" {...extra} />
    );
  return (
    <G>
      {draw(INK, w + 3)}
      {draw(color, w)}
      {draw(shade(color, -0.45), w * 0.42)}
    </G>
  );
}

/** The slack band that tightens: a curve fading out while the straight band fades in. */
function FreshBand({ x1, y1, x2, y2, color, u, W, H }: { x1: number; y1: number; x2: number; y2: number; color: string; u: number; W: number; H: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(1, { duration: 320, easing: EASE }));
  }, [p]);
  const slackStyle = useAnimatedStyle(() => ({ opacity: 1 - p.get() }));
  const tautStyle = useAnimatedStyle(() => ({ opacity: p.get() }));
  const len = Math.hypot(x2 - x1, y2 - y1);
  const sag = Math.min(u * 0.32, len * 0.16);
  const nx = -(y2 - y1) / len,
    ny = (x2 - x1) / len;
  const cx = (x1 + x2) / 2 + nx * sag,
    cy = (y1 + y2) / 2 + ny * sag;
  const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  return (
    <>
      {reduced ? null : (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, slackStyle]}>
          <Svg width={W} height={H}>
            <BandShape x1={x1} y1={y1} x2={x2} y2={y2} color={color} u={u} d={d} />
          </Svg>
        </Animated.View>
      )}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tautStyle]}>
        <Svg width={W} height={H}>
          <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,226,140,0.33)" strokeWidth={u * 0.5} strokeLinecap="round" />
          <BandShape x1={x1} y1={y1} x2={x2} y2={y2} color={color} u={u} />
        </Svg>
      </Animated.View>
    </>
  );
}

/** The pieces of the triangles the last band completed: they fill in gently once the band is tight. */
function FreshPieces({ points, colors, W, H }: { points: string[]; colors: string[]; W: number; H: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(reduced ? 0 : 260, withTiming(1, { duration: reduced ? 160 : 460, easing: EASE })));
  }, [o, reduced]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, anim]}>
      <Svg width={W} height={H}>
        {points.map((p, i) => (
          <Polygon key={p} points={p} fill={colors[i]} stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round" />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** The peg nearest to (x, y) within reach, or -1. */
function pegAt(g: TriGeometry, L: Lay, x: number, y: number, reach = 0.56) {
  let best = -1,
    bestD = reach * L.u;
  for (let i = 0; i < g.pts.length; i++) {
    const d = Math.hypot(L.px(i) - x, L.py(i) - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The band end when dragging from peg `a` to (x, y): snapped to the nearest lattice direction, 1…max units. */
function snapEnd(g: TriGeometry, L: Lay, a: number, x: number, y: number, max: number) {
  const dx = (x - L.px(a)) / L.u,
    dy = (y - L.py(a)) / L.u;
  if (Math.hypot(dx, dy) < 0.4) return -1;
  let best = 0,
    bestDot = -Infinity;
  TRI_DIRS.forEach(([q, r], i) => {
    const ux = q + r / 2,
      uy = (r * Math.sqrt(3)) / 2;
    const d = dx * ux + dy * uy;
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  });
  const [q, r] = TRI_DIRS[best];
  const p = g.pts[a];
  for (let k = Math.min(max, Math.max(1, Math.round(bestDot))); k >= 1; k--) {
    const j = g.at(p.q + q * k, p.r + r * k);
    if (j >= 0) return j;
  }
  return -1;
}

/** Why a band can't be played, or null when it can. */
function refusal(g: TriGeometry, view: TrianglesView, a: number, b: number): string | null {
  const es = triBandEdges(g, a, b, view.band);
  if (es === 'same') return '';
  if (es === 'line') return 'الشريط في خط مستقيم فقط';
  if (es === 'long') return view.band === 1 ? 'الشريط بين وتدين متجاورين فقط' : `أطول شريط ${view.band === 2 ? 'وحدتان' : 'ثلاث وحدات'}`;
  if (es.every((e) => view.edges[e] >= 0)) return 'أضلاع هذا الشريط مغطاة كلها';
  return null;
}

function Board({ view, myTurn, onRefuse }: { view: TrianglesView; myTurn: boolean; onRefuse: (msg: string) => void }) {
  const { width } = useWindowDimensions();
  const accent = useAccent();
  const g = triGeometry(view.size);
  const W = Math.min(width - 16, 480);
  const L = layout(g, W);
  const { u, H, px, py } = L;
  const settled = useSettled();
  const [openedAt, setOpenedAt] = useState(view.bands.length);
  if (view.bands.length < openedAt) setOpenedAt(0); // a new game on the same screen: its bands are all new
  const mine = view.me >= 0 ? TRI_COLORS[view.me] : C.yellow;
  // drag: the peg it started from and where the band ends now; tap mode: the selected peg
  type Drag = { a: number; b: number; moved: boolean } | null;
  const [drag, setDragState] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  const setDrag = (d: Drag) => {
    dragRef.current = d;
    setDragState(d);
  };
  // a half-made selection (tap mode) belongs to the move it was made at: a new band clears it
  const moves = view.bands.length;
  const [picked, setPicked] = useState<{ peg: number; at: number } | null>(null);
  const sel = picked && picked.at === moves && myTurn ? picked.peg : null;
  const setSel = (peg: number | null) => setPicked(peg === null ? null : { peg, at: moves });

  const loc = (ev: GestureResponderEvent) => ({
    x: ev.nativeEvent.locationX,
    y: ev.nativeEvent.locationY,
  });
  const send = (a: number, b: number) => {
    const why = refusal(g, view, a, b);
    if (why === '') return false;
    if (why) {
      haptic.light();
      onRefuse(why);
      return false;
    }
    haptic.medium();
    client.act({ type: 'band', a, b });
    return true;
  };
  const grant = (ev: GestureResponderEvent) => {
    const { x, y } = loc(ev);
    const a = pegAt(g, L, x, y);
    setDrag(a >= 0 ? { a, b: -1, moved: false } : null);
  };
  const move = (ev: GestureResponderEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = loc(ev);
    const b = snapEnd(g, L, d.a, x, y, view.band);
    if (b !== d.b) {
      if (b >= 0) haptic.tap();
      setDrag({ a: d.a, b, moved: d.moved || b >= 0 });
    }
  };
  const release = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.b >= 0) {
      // a drag: play it (or say why not)
      send(d.a, d.b);
      setSel(null);
      return;
    }
    if (d.moved) return; // dragged back onto the starting peg: nothing
    // a tap: select, then the second peg plays the band
    if (sel === null || sel === d.a) {
      haptic.tap();
      setSel(sel === d.a ? null : d.a);
      return;
    }
    const why = refusal(g, view, sel, d.a);
    if (why && triBandEdges(g, sel, d.a, view.band) === 'line') {
      // not on a line with the selected peg: this peg becomes the selection
      haptic.tap();
      setSel(d.a);
      return;
    }
    if (send(sel, d.a)) setSel(null);
  };

  const last = view.last !== null ? view.bands[view.last] : null;
  // only a band stretched while this screen is open animates (never the one already there on opening)
  const fresh = settled && last !== null && view.last !== null && view.last >= openedAt;
  const lastTris = new Set(fresh ? view.lastTris : []);
  const from = drag && drag.b >= 0 ? drag.a : null;
  const to = drag && drag.b >= 0 ? drag.b : null;
  const previewBad = from !== null && to !== null ? refusal(g, view, from, to) !== null : false;
  // the pegs a selected (or dragged-from) peg can reach with a band that covers something new
  const origin = drag ? drag.a : sel;
  const reach = new Set<number>();
  if (myTurn && origin !== null && origin >= 0) {
    const p = g.pts[origin];
    for (const [q, r] of TRI_DIRS)
      for (let k = 1; k <= view.band; k++) {
        const j = g.at(p.q + q * k, p.r + r * k);
        if (j < 0) break;
        if (refusal(g, view, origin, j) === null) reach.add(j);
      }
  }
  const pegR = Math.max(4.5, u * 0.15);

  return (
    <View
      style={[styles.board, { width: W, height: H }]}
      onStartShouldSetResponder={() => myTurn}
      onMoveShouldSetResponder={() => myTurn}
      onResponderTerminationRequest={() => false}
      onResponderGrant={grant}
      onResponderMove={move}
      onResponderRelease={release}
      onResponderTerminate={() => setDrag(null)}
      accessibilityLabel="لوحة الأوتاد: اسحب من وتد إلى وتد على خط مستقيم لتشدّ شريطاً">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={W} height={H}>
          <Polygon points={L.corners} fill={BOARD} stroke={alpha(accent, 0.75)} strokeWidth={3} strokeLinejoin="round" />
          {g.edges.map(([a, b], e) =>
            view.edges[e] < 0 ? (
              <Line key={`e${e}`} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} stroke={BOARD_EDGE} strokeWidth={Math.max(1.5, u * 0.05)} strokeLinecap="round" />
            ) : null,
          )}
          {view.tris.map((o, t) =>
            o < 0 || lastTris.has(t) ? null : (
              <Polygon key={`t${t}`} points={piecePoints(g, L, t)} fill={TRI_COLORS[o]} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
            ),
          )}
          {view.bands.map(([a, b, seat], i) =>
            fresh && i === view.last ? null : (
              <G key={`b${i}`}>
                {i === view.last ? (
                  <Line x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} stroke="rgba(255,226,140,0.33)" strokeWidth={u * 0.5} strokeLinecap="round" />
                ) : null}
                <BandShape x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} color={TRI_COLORS[seat]} u={u} />
              </G>
            ),
          )}
        </Svg>
      </View>
      {fresh && view.lastTris.length ? (
        <FreshPieces
          key={`p${view.last}`}
          points={view.lastTris.map((t) => piecePoints(g, L, t))}
          colors={view.lastTris.map((t) => TRI_COLORS[view.tris[t]] ?? mine)}
          W={W}
          H={H}
        />
      ) : null}
      {fresh && last ? (
        <FreshBand key={`f${view.last}`} x1={px(last[0])} y1={py(last[0])} x2={px(last[1])} y2={py(last[1])} color={TRI_COLORS[last[2]]} u={u} W={W} H={H} />
      ) : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={W} height={H}>
          {from !== null && to !== null ? (
            previewBad ? (
              <Line
                x1={px(from)}
                y1={py(from)}
                x2={px(to)}
                y2={py(to)}
                stroke={C.red}
                strokeWidth={u * 0.14}
                strokeLinecap="round"
                strokeDasharray={`${u * 0.18},${u * 0.18}`}
              />
            ) : (
              <G opacity={0.75}>
                <BandShape x1={px(from)} y1={py(from)} x2={px(to)} y2={py(to)} color={mine} u={u} />
              </G>
            )
          ) : null}
          {g.pts.map((_, i) => (
            <G key={`p${i}`}>
              {reach.has(i) ? <Circle cx={px(i)} cy={py(i)} r={pegR + u * 0.12} fill={alpha(mine, 0.35)} /> : null}
              <Circle cx={px(i)} cy={py(i)} r={pegR} fill="#D8D2C2" stroke={INK} strokeWidth={1.5} />
              <Circle cx={px(i) - pegR * 0.3} cy={py(i) - pegR * 0.3} r={pegR * 0.35} fill="rgba(255,255,255,0.7)" />
              {origin === i ? <Circle cx={px(i)} cy={py(i)} r={pegR + u * 0.1} fill="none" stroke={mine} strokeWidth={3} /> : null}
            </G>
          ))}
        </Svg>
      </View>
    </View>
  );
}

/** A small emblem for the result banner: a triangle of pegs with two bands and a piece. */
function TriArt({ size }: { size: number }) {
  const s = size;
  const A = { x: s * 0.5, y: s * 0.14 },
    B = { x: s * 0.12, y: s * 0.8 },
    Cc = { x: s * 0.88, y: s * 0.8 };
  return (
    <Svg width={s} height={s}>
      <Polygon
        points={`${A.x},${A.y + s * 0.2} ${B.x + s * 0.17},${B.y - s * 0.1} ${Cc.x - s * 0.17},${Cc.y - s * 0.1}`}
        fill={TRI_COLORS[1]}
        stroke={INK}
        strokeWidth={1.5}
      />
      <BandShape x1={A.x} y1={A.y} x2={B.x} y2={B.y} color={TRI_COLORS[0]} u={s * 0.5} />
      <BandShape x1={B.x} y1={B.y} x2={Cc.x} y2={Cc.y} color={C.yellow} u={s * 0.5} />
      {[A, B, Cc].map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={s * 0.07} fill="#D8D2C2" stroke={INK} strokeWidth={1.5} />
      ))}
    </Svg>
  );
}

function Players({ view, h }: { view: TrianglesView; h: Helpers }) {
  const active = view.phase === 'play' ? view.turn : null;
  if (view.seats.length === 2) {
    return (
      <DuelBar
        h={h}
        active={active}
        slots={view.seats.map((id, i) => ({
          id,
          color: TRI_COLORS[i],
          sub: `${num(view.points[id] ?? 0)} مثلث`,
          score: view.score[id] ?? 0,
        }))}
      />
    );
  }
  return (
    <Row gap={6} wrap center>
      {view.seats.map((id, i) => {
        const out = !view.active.includes(id);
        const on = active === id;
        return (
          <View
            key={id}
            style={[
              styles.chip,
              on && {
                borderColor: TRI_COLORS[i],
                backgroundColor: alpha(TRI_COLORS[i], 0.2),
              },
              out && { opacity: 0.45 },
            ]}>
            <View style={[styles.swatch, { backgroundColor: TRI_COLORS[i] }]} />
            <Avatar player={h.player(id)} size={24} />
            <View style={{ maxWidth: 76 }}>
              <Txt v="tiny" numberOfLines={1}>
                {nameOf(h, view, id)}
                {id === h.me ? ' (أنت)' : ''}
              </Txt>
              <Txt v="tiny" color={C.yellow} numberOfLines={1}>
                {out ? 'خارج اللعبة' : `الفوز: ${num(view.score[id] ?? 0)}`}
              </Txt>
            </View>
            <View style={[styles.count, { backgroundColor: TRI_COLORS[i] }]}>
              <Txt v="tiny" color="#FFFFFF">
                {num(view.points[id] ?? 0)}
              </Txt>
            </View>
          </View>
        );
      })}
    </Row>
  );
}

export function TrianglesGame({ room, view }: { room: RoomView; view: TrianglesView }) {
  const h = helpers(room);
  const [resign, setResign] = useState(false);
  const [msg, setMsg] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  if (view.me < 0 && view.phase === 'play') return <Spectator room={room} />;
  const meId = view.seats[view.me];
  const playing = view.phase === 'play' && view.active.includes(meId);
  const myTurn = view.phase === 'play' && view.turn === meId;
  const won = view.phase === 'final' && view.winners?.length === 1 && view.winners[0] === meId;
  const lastSeat = view.last !== null ? view.bands[view.last][2] : -1;
  const justScored = view.bonus && view.lastTris.length > 0 && lastSeat >= 0 && view.seats[lastSeat] === view.turn;
  const finalScores = Object.fromEntries(view.active.map((id) => [id, view.points[id] ?? 0]));
  const many = view.seats.length > 2;
  const total = triCounts(view.size).tris;
  const bandHint = view.band === 1 ? 'مجاور' : `(حتى ${view.band === 2 ? 'وحدتين' : 'ثلاث وحدات'})`;

  let title = '';
  let sub = '';
  if (view.phase === 'final') {
    const ws = view.winners ?? [];
    title = ws.length === 1 ? (ws[0] === meId ? 'فزت!' : `الفوز ${li(nameOf(h, view, ws[0]))}`) : 'تعادل!';
    sub = view.reason === 'forfeit' ? 'انسحب الآخرون' : ws.length === 1 ? `${num(view.points[ws[0]] ?? 0)} مثلثاً من ${num(total)}` : 'نفس عدد المثلثات';
  }

  return (
    <>
      {won ? <Confetti /> : null}
      {view.phase === 'final' ? <ResultBanner tone={won ? 'good' : 'neutral'} art={<TriArt size={64} />} title={title} sub={sub} /> : null}
      <Players view={view} h={h} />
      {view.phase === 'final' ? null : (
        <Txt v="bold" center color={msg ? C.red : myTurn ? C.yellow : C.muted} style={{ minHeight: 26 }}>
          {msg
            ? msg.text
            : myTurn
              ? justScored
                ? 'أكملت مثلثاً! العب مرة أخرى'
                : `اسحب من وتد إلى وتد ${bandHint}`
              : !playing
                ? 'خرجت من هذه اللعبة… تابع الآخرين'
                : justScored
                  ? `مثلث ${li(nameOf(h, view, view.turn!))} ودورٌ آخر…`
                  : `الدور ${li(nameOf(h, view, view.turn!))}`}
        </Txt>
      )}

      <Board view={view} myTurn={myTurn} onRefuse={(text) => setMsg({ text, at: Date.now() })} />

      {view.phase === 'final' && many ? <Scoreboard players={room.players} scores={finalScores} unit="مثلث" highlight={h.me} /> : null}
      {view.phase === 'final' ? <PlayAgain room={room} /> : playing ? <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} /> : null}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من اللعبة؟"
        message={view.active.length > 2 ? 'ستخرج من هذه اللعبة ويكمل الآخرون بدونك' : 'سيفوز خصمك بهذه اللعبة'}
        confirmLabel="انسحب"
        onCancel={() => setResign(false)}
        onConfirm={() => {
          setResign(false);
          h.act('resign');
        }}
      />
    </>
  );
}

/** Lobby settings: board size, longest band, extra turn (the bots' strength is the room's «مستوى البوتات»). */
export function TrianglesSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.triangles;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'triangles', patch });
  const sizeLabel = (n: number) => `${n === 3 ? 'صغير' : 'كبير'} (${num(triCounts(n).tris)} مثلثاً)`;
  const bandLabel = (n: number) => (n === 1 ? 'وحدة واحدة' : n === 2 ? 'حتى وحدتين' : 'حتى ثلاث');
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold">حجم اللوحة</Txt>
      <ChipPicker
        options={TRI_SIZES.map((n) => ({
          key: String(n),
          label: sizeLabel(n),
        }))}
        value={String(settings.size)}
        editable={editable}
        onChange={(v) => change({ size: Number(v) })}
      />
      <Txt v="bold">طول الشريط</Txt>
      <ChipPicker
        options={TRI_BANDS.map((n) => ({
          key: String(n),
          label: bandLabel(n),
        }))}
        value={String(settings.band)}
        editable={editable}
        onChange={(v) => change({ band: Number(v) })}
      />
      <Txt v="small" color={C.muted}>
        وحدة واحدة مثل «المربعات»، وثلاث مثل اللعبة الأصلية. «حتى وحدتين» أفضل توازن.
      </Txt>
      <Toggle label="دور إضافي عند الإكمال" value={settings.bonus !== false} editable={editable} onChange={(bonus) => change({ bonus })} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: INK,
  },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: INK,
  },
});
