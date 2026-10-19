/**
 * «المدن والطرق» — the board: it grows with the tiles, fits itself to them, and can be moved with one
 * finger, zoomed with two (pinch) or with the +/− buttons. A tap on a tiny board zooms in first; a tap
 * on a big enough board picks a cell (or, during the follower step, the nearest free feature of the
 * tile just placed). Built on the touch responder, so it works inside the room's scroll view.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';
import { Circle, G, Rect, Svg } from 'react-native-svg';

import { IconBtn } from '@/ui/btn';
import type { CarcaFollower, CarcaTilePlaced } from '@/shared/games/carca';
import { TILES, UNIT, rotatePoint } from '@/shared/carca-tiles';

import { ArrivalLayer, fKey, tKey, useArrivals } from './carca-motion';
import { Meeple, TileAt, colorOf } from './carca-tile';

const U = UNIT;
/** the largest a tile gets when the board is fitted, in pixels */
const FIT_MAX = 84;
/** zoom range, in pixels per tile */
const MIN_PX = 14;
const MAX_PX = 150;
/** below this a tap zooms in instead of picking */
const PICK_PX = 30;

export interface BoardOptions {
  x: number;
  y: number;
  t: string;
  r: number;
  feats: number[];
  sel: number | null;
  color: number;
}

interface Props {
  board: CarcaTilePlaced[];
  followers: CarcaFollower[];
  colors: Record<string, number>;
  width: number;
  height: number;
  /** cells where the drawn tile can go */
  spots?: { x: number; y: number }[];
  preview?: { x: number; y: number; r: number; t: string } | null;
  last?: { x: number; y: number; color: number } | null;
  options?: BoardOptions | null;
  /** a change re-fits the board (e.g. the start of my turn) */
  fitKey?: string;
  onCell?: (x: number, y: number) => void;
  onSpot?: (f: number) => void;
  /** the board's root view, and its pan/zoom after each render (followers fly back from it) */
  nodeRef?: (n: View | null) => void;
  onTransform?: (s: number, tx: number, ty: number) => void;
}

interface Xf {
  key: string;
  s: number;
  tx: number;
  ty: number;
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

function Tiles({ board, followers, colors, hidden }: { board: CarcaTilePlaced[]; followers: CarcaFollower[]; colors: Record<string, number>; hidden: Set<string> }) {
  const at = new Map(board.map((p) => [`${p.x},${p.y}`, p]));
  return (
    <G>
      {board.map((p) => (hidden.has(`t${tKey(p)}`) ? null : <TileAt key={`${p.x},${p.y}`} t={p.t} r={p.r} x={p.x * U} y={p.y * U} size={U} />))}
      {followers.map((f, i) => {
        const p = at.get(`${f.x},${f.y}`);
        if (!p || hidden.has(`f${fKey(f)}`)) return null;
        const feat = TILES[p.t].feats[f.f];
        const [sx, sy] = rotatePoint(feat.spot, p.r);
        return <Meeple key={i} x={f.x * U + sx} y={f.y * U + sy} size={28} color={colors[f.owner] ?? 0} lying={feat.k === 'field'} />;
      })}
    </G>
  );
}

function Marks({ spots, preview, last, options }: Pick<Props, 'spots' | 'preview' | 'last' | 'options'>) {
  return (
    <G>
      {last ? <Rect x={last.x * U + 2} y={last.y * U + 2} width={U - 4} height={U - 4} fill="none" stroke={colorOf(last.color).fill} strokeWidth={5} rx={4} /> : null}
      {(spots ?? []).filter((c) => !preview || c.x !== preview.x || c.y !== preview.y).map((c) => (
        <Rect key={`${c.x},${c.y}`} x={c.x * U + 5} y={c.y * U + 5} width={U - 10} height={U - 10} rx={10} fill="rgba(242,179,61,0.18)" stroke="#F2B33D" strokeWidth={3} strokeDasharray="10 7" />
      ))}
      {preview ? (
        <G>
          <TileAt t={preview.t} r={preview.r} x={preview.x * U} y={preview.y * U} size={U} opacity={0.92} />
          <Rect x={preview.x * U + 1.5} y={preview.y * U + 1.5} width={U - 3} height={U - 3} fill="none" stroke="#FFFFFF" strokeWidth={4} />
        </G>
      ) : null}
      {options
        ? options.feats.map((f) => {
            const feat = TILES[options.t].feats[f];
            const [sx, sy] = rotatePoint(feat.spot, options.r);
            const on = options.sel === f;
            return (
              <G key={f}>
                <Circle cx={options.x * U + sx} cy={options.y * U + sy} r={on ? 13 : 9} fill={on ? '#FFFFFF' : 'rgba(255,255,255,0.75)'} stroke="#1B1830" strokeWidth={2.5} />
                {on ? <Meeple x={options.x * U + sx} y={options.y * U + sy} size={20} color={options.color} lying={feat.k === 'field'} /> : null}
              </G>
            );
          })
        : null}
    </G>
  );
}

/* ------------------------------------------------------------------ */
/* Viewport                                                            */
/* ------------------------------------------------------------------ */

function bounds(board: CarcaTilePlaced[]) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const p of board) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  // one ring of empty cells around, where new tiles go
  return { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 };
}

function fitTo(b: ReturnType<typeof bounds>, width: number, height: number, key: string): Xf {
  const w = (b.maxX - b.minX + 1) * U;
  const h = (b.maxY - b.minY + 1) * U;
  const s = Math.min((width - 8) / w, (height - 8) / h, FIT_MAX / U);
  return { key, s, tx: (width - w * s) / 2 - b.minX * U * s, ty: (height - h * s) / 2 - b.minY * U * s };
}

interface Gesture {
  n: number;
  offX: number;
  offY: number;
  sx: number;
  sy: number;
  d0: number;
  start: Xf;
  moved: boolean;
  multi: boolean;
}

function pointsOf(e: GestureResponderEvent): { x: number; y: number }[] {
  const ne = e.nativeEvent;
  const list: NativeTouchEvent[] = ne.touches?.length ? ne.touches : [ne];
  return list.map((t) => ({ x: t.pageX, y: t.pageY }));
}

export function CarcaBoard(props: Props) {
  const { board, followers, colors, width, height, onCell, onSpot, options, spots, preview, last, fitKey, nodeRef, onTransform } = props;
  const b = bounds(board);
  const key = `${b.minX},${b.maxX},${b.minY},${b.maxY},${Math.round(width)},${Math.round(height)},${fitKey ?? ''}`;
  const [xf, setXf] = useState<Xf | null>(null);
  const cur = xf && xf.key === key ? xf : fitTo(b, width, height, key);
  const gesture = useRef<Gesture | null>(null);
  // a tile / follower that just arrived settles into place (drawn over the board meanwhile)
  const { fx, hidden } = useArrivals(board, followers, preview);
  useEffect(() => onTransform?.(cur.s, cur.tx, cur.ty));

  const clampScale = (s: number) => Math.max(MIN_PX / U, Math.min(MAX_PX / U, s));
  const zoomAt = (from: Xf, s: number, px: number, py: number): Xf => {
    const ns = clampScale(s);
    const wx = (px - from.tx) / from.s, wy = (py - from.ty) / from.s;
    return { key, s: ns, tx: px - wx * ns, ty: py - wy * ns };
  };

  const baseline = (e: GestureResponderEvent, start: Xf) => {
    const g = gesture.current!;
    const pts = pointsOf(e);
    g.n = pts.length;
    g.start = start;
    g.sx = pts.reduce((a, p) => a + p.x, 0) / pts.length - g.offX;
    g.sy = pts.reduce((a, p) => a + p.y, 0) / pts.length - g.offY;
    g.d0 = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    if (pts.length > 1) g.multi = true;
  };

  const onGrant = (e: GestureResponderEvent) => {
    const ne = e.nativeEvent;
    gesture.current = { n: 1, offX: ne.pageX - ne.locationX, offY: ne.pageY - ne.locationY, sx: 0, sy: 0, d0: 0, start: cur, moved: false, multi: false };
    baseline(e, cur);
  };

  const onMove = (e: GestureResponderEvent) => {
    const g = gesture.current;
    if (!g) return;
    const pts = pointsOf(e);
    if (pts.length !== g.n) {
      baseline(e, cur);
      return;
    }
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length - g.offX;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length - g.offY;
    if (!g.moved && Math.hypot(mx - g.sx, my - g.sy) < 8 && pts.length === 1) return;
    g.moved = true;
    let next: Xf = { ...g.start, key, tx: g.start.tx + mx - g.sx, ty: g.start.ty + my - g.sy };
    if (pts.length > 1 && g.d0 > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      next = zoomAt(next, g.start.s * (d / g.d0), mx, my);
    }
    setXf(next);
  };

  const onRelease = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.moved || g.multi) return;
    tap(g.sx, g.sy);
  };

  const tap = (px: number, py: number) => {
    const wx = (px - cur.tx) / cur.s, wy = (py - cur.ty) / cur.s;
    const cx = Math.floor(wx / U), cy = Math.floor(wy / U);
    if (options && onSpot && cx === options.x && cy === options.y && cur.s * U >= PICK_PX) {
      // the nearest free feature of the tile just placed
      let best = -1, bestD = Infinity;
      for (const f of options.feats) {
        const [sx, sy] = rotatePoint(TILES[options.t].feats[f].spot, options.r);
        const d = Math.hypot(cx * U + sx - wx, cy * U + sy - wy);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best >= 0) onSpot(best);
      return;
    }
    if (cur.s * U < PICK_PX) {
      setXf(zoomAt(cur, 64 / U, px, py));
      return;
    }
    onCell?.(cx, cy);
  };

  const zoomBy = (k: number) => setXf(zoomAt(cur, cur.s * k, width / 2, height / 2));

  return (
    <View ref={nodeRef} style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        <G transform={`translate(${cur.tx} ${cur.ty}) scale(${cur.s})`}>
          <Tiles board={board} followers={followers} colors={colors} hidden={hidden} />
          <Marks spots={spots} preview={preview} last={last} options={options} />
        </G>
      </Svg>
      {fx ? <ArrivalLayer fx={fx} board={board} colors={colors} last={last} xf={cur} /> : null}
      {/* a child-less layer on top, so touch coordinates are always relative to the board */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={() => (gesture.current = null)}
      />
      <View style={styles.zoom}>
        <IconBtn icon="plus" size={40} label="تكبير" color="rgba(20,22,51,0.82)" onPress={() => zoomBy(1.4)} />
        <IconBtn icon="minus" size={40} label="تصغير" color="rgba(20,22,51,0.82)" onPress={() => zoomBy(1 / 1.4)} />
        <IconBtn icon="search" size={40} label="اللوحة كاملة" color="rgba(20,22,51,0.82)" onPress={() => setXf(null)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { direction: 'ltr', overflow: 'hidden', borderRadius: 16, backgroundColor: '#22382A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignSelf: 'center' },
  zoom: { position: 'absolute', left: 6, top: 6, gap: 6 },
});
