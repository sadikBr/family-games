/**
 * «المستوطنون» — the island drawn with react-native-svg: sea, 19 hexes with their terrain and number
 * tokens (6 and 8 in red, with the dots), 9 harbours, roads, settlements, cities and the robber.
 * Only the legal spots of the current move are highlighted and tappable (big invisible tap areas laid
 * over the drawing); the chosen spot shows a preview until it is confirmed.
 */
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/sfx';
import type { CatanLog, CatanRes, CatanView } from '@/shared/games/catan';
import { BOARD_BOX, EDGES, EDGE_XY, HEX_VERTS, HEX_XY, HEX_NAME, PORT_SLOTS, RES, VERT_HEXES, VERT_XY, isRed, pips } from '@/shared/catan-board';
import { F } from '@/theme';
import { DICE_THROW_MS } from '@/ui/dice3d';

import { Building, GlyphAt, RES_COLOR, ResIcon, Road, Robber, SEAT_COLORS, SEAT_OUTLINE, TERRAIN } from './catan-art';
import { BOARD_MOTION, EASE, Flyer, Settle, Spots, useSettled } from './catan-motion';

export type TargetKind = 'settle' | 'city' | 'road' | 'hex';
export interface Target {
  kind: TargetKind;
  id: number;
}

const BW = BOARD_BOX.maxX - BOARD_BOX.minX;
const BH = BOARD_BOX.maxY - BOARD_BOX.minY;
export const boardHeight = (width: number) => (width * BH) / BW;

const HILITE = '#FFD84D';
/** the last move: a soft white halo around the piece built last, and around the robber when it just moved */
const LAST = 'rgba(255,255,255,0.9)';

type BuildLog = Extract<CatanLog, { t: 'build' }>;
function lastBuilt(view: CatanView): BuildLog | null {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const e = view.log[i];
    if (e.t === 'build' && e.b !== 'dev' && e.at !== undefined) return e;
  }
  return null;
}

/** Centre of a hex in board pixels, for a board `width` px wide (where resources fly from). */
export function hexPoint(h: number, width: number) {
  const u = width / BW;
  return { x: (HEX_XY[h].x - BOARD_BOX.minX) * u, y: (HEX_XY[h].y - BOARD_BOX.minY) * u };
}

/* ------------------------------------------------------------------ */
/* Motion: what changed since the last view                            */
/* ------------------------------------------------------------------ */

type Bld = { s: number; city: boolean } | null;
/** new roads / buildings settling into place (hidden in the drawing until they have landed) */
interface PiecesFx {
  k: number;
  roads: number[];
  builds: number[];
  /** what stood there before (a settlement turning into a city fades out) */
  was: Record<number, Bld>;
  /** my own piece, already shown as a preview where I picked it: it only settles */
  soft: boolean;
}
interface Mem {
  roads: string;
  builds: string;
  roadsV: number[];
  buildsV: Bld[];
  robber: number;
  rollId: number;
  /** the spot I picked last (`r12` a road, `v30` an intersection) */
  sel: string;
  seq: number;
  pieces: PiecesFx | null;
  rob: { k: number; from: number; to: number } | null;
  glow: { k: number; hexes: number[] } | null;
}

const roadsKey = (r: number[]) => r.join(',');
const buildsKey = (b: Bld[]) => b.map((x) => (x ? `${x.s}${x.city ? 'c' : 's'}` : '')).join(',');

/**
 * Compares the board with the previous one (kept in state, never in a ref) and returns the motion to
 * play: pieces settling, the robber gliding (from wherever it was drawn: the preview of my choice
 * counts, so confirming it doesn't move it again), and the hexes of the rolled number glowing once the
 * dice have landed. Nothing during the first moments after mount; a burst of changes (a reconnect)
 * just appears.
 */
function useBoardFx(view: CatanView, robber: number, sel: string) {
  const settled = useSettled();
  const reduced = useReducedMotion();
  const rk = roadsKey(view.roads);
  const bk = buildsKey(view.buildings);
  const [mem, setMem] = useState<Mem>(() => ({ roads: rk, builds: bk, roadsV: view.roads, buildsV: view.buildings, robber, rollId: view.rollId, sel, seq: 0, pieces: null, rob: null, glow: null }));
  let cur = mem;
  // a selection is remembered until the next one (it is cleared as soon as I confirm it)
  const lastSel = sel || mem.sel;
  if (mem.roads !== rk || mem.builds !== bk || mem.robber !== robber || mem.rollId !== view.rollId || mem.sel !== lastSel) {
    const next: Mem = { ...mem, roads: rk, builds: bk, roadsV: view.roads, buildsV: view.buildings, robber, rollId: view.rollId, sel: lastSel };
    if (settled) {
      if (mem.roads !== rk || mem.builds !== bk) {
        const roads = view.roads.flatMap((s, e) => (s >= 0 && !(mem.roadsV[e] >= 0) ? [e] : []));
        const builds = view.buildings.flatMap((b, v) => {
          const was = mem.buildsV[v] ?? null;
          return b && (!was || (b.city && !was.city)) ? [v] : [];
        });
        if (roads.length + builds.length > 0 && roads.length + builds.length <= 4) {
          next.seq += 1;
          const soft = roads.length + builds.length === 1 && (roads.length ? `r${roads[0]}` : `v${builds[0]}`) === mem.sel;
          next.pieces = { k: next.seq, roads, builds, was: Object.fromEntries(builds.map((v) => [v, mem.buildsV[v] ?? null])), soft };
        }
      }
      if (mem.robber !== robber && !reduced) {
        next.seq += 1;
        next.rob = { k: next.seq, from: mem.robber, to: robber };
      }
      const total = view.dice ? view.dice[0] + view.dice[1] : 0;
      if (mem.rollId !== view.rollId && total && total !== 7) {
        const hexes = view.nums.flatMap((n, h) => (n === total && h !== view.robber ? [h] : []));
        if (hexes.length) {
          next.seq += 1;
          next.glow = { k: next.seq, hexes };
        }
      }
    }
    cur = next;
    setMem(next);
  }
  // each motion is forgotten once it has played (the drawing shows the piece again)
  const pk = cur.pieces?.k ?? 0;
  const ok = cur.rob?.k ?? 0;
  const gk = cur.glow?.k ?? 0;
  useEffect(() => {
    if (!pk) return;
    const t = setTimeout(() => setMem((m) => (m.pieces?.k === pk ? { ...m, pieces: null } : m)), BOARD_MOTION.settle + 80);
    return () => clearTimeout(t);
  }, [pk]);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setMem((m) => (m.rob?.k === ok ? { ...m, rob: null } : m)), BOARD_MOTION.robber + 60);
    return () => clearTimeout(t);
  }, [ok]);
  useEffect(() => {
    if (!gk) return;
    const t = setTimeout(() => setMem((m) => (m.glow?.k === gk ? { ...m, glow: null } : m)), GLOW_END + 100);
    return () => clearTimeout(t);
  }, [gk]);
  return cur;
}

/** the hexes of the rolled number: they light up once the dice have landed, then fade */
const GLOW_IN = 280;
const GLOW_HOLD = 1100;
const GLOW_OUT = 600;
const GLOW_END = DICE_THROW_MS + GLOW_IN + GLOW_HOLD + GLOW_OUT;

function HexGlow({ points, width, height, u }: { points: string[]; width: number; height: number; u: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(DICE_THROW_MS, withSequence(withTiming(1, { duration: GLOW_IN, easing: EASE }), withDelay(GLOW_HOLD, withTiming(0, { duration: GLOW_OUT })))));
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height }, anim]}>
      <Svg width={width} height={height}>
        {points.map((p) => (
          <Polygon key={p} points={p} fill="rgba(255,236,170,0.3)" stroke="#FFE9A8" strokeWidth={Math.max(2, u * 0.09)} strokeLinejoin="round" />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** The robber gliding from one hex to another (the drawing hides it meanwhile). */
function RobberGlide({ from, to, u }: { from: { x: number; y: number }; to: { x: number; y: number }; u: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: BOARD_MOTION.robber, easing: EASE }));
  }, [p]);
  const w = u * 0.6;
  const h = u * 0.8;
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    return { transform: [{ translateX: from.x + (to.x - from.x) * t - w / 2 }, { translateY: from.y + (to.y - from.y) * t - h / 2 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h }, anim]}>
      <Svg width={w} height={h}>
        <Robber cx={w / 2} cy={h / 2} u={u} />
      </Svg>
    </Animated.View>
  );
}

export function CatanBoard({
  view,
  width,
  kind,
  ids,
  sel,
  mySeat,
  robberAt,
  onTarget,
  children,
  nodeRef,
}: {
  view: CatanView;
  width: number;
  /** what can be tapped now (null: nothing) */
  kind: TargetKind | null;
  ids: number[];
  sel: Target | null;
  mySeat: number;
  /** where the robber was just sent (my confirmed move, until the server answers) */
  robberAt?: number | null;
  onTarget?: (t: Target) => void;
  /** drawn over the board (the dice) */
  children?: ReactNode;
  /** the board's root view (resources fly from its hexes) */
  nodeRef?: (n: View | null) => void;
}) {
  const u = width / BW;
  const height = boardHeight(width);
  const X = (x: number) => (x - BOARD_BOX.minX) * u;
  const Y = (y: number) => (y - BOARD_BOX.minY) * u;
  const vx = (v: number) => X(VERT_XY[v].x);
  const vy = (v: number) => Y(VERT_XY[v].y);
  const myColor = SEAT_COLORS[mySeat] ?? SEAT_COLORS[0];
  const myOutline = SEAT_OUTLINE[mySeat] ?? SEAT_OUTLINE[0];
  const fs = (k: number) => Math.max(7, u * k);

  const hexPoints = (h: number) => HEX_VERTS[h].map((v) => `${vx(v)},${vy(v)}`).join(' ');
  const built = lastBuilt(view);
  // the robber moved within the last few events (the latest roll or knight)
  const robberMoved = kind !== 'hex' && view.log.slice(-5).some((e) => e.t === 'robber');
  const selId = sel && sel.kind === kind ? sel.id : null;
  // where the robber is drawn: my chosen hex (preview), the hex I just sent it to, or its real place
  const robberHex = kind === 'hex' && selId !== null ? selId : (robberAt ?? view.robber);
  const fx = useBoardFx(view, robberHex, selId === null || kind === 'hex' ? '' : `${kind === 'road' ? 'r' : 'v'}${selId}`);
  const pieces = fx.pieces;
  const newRoad = (e: number) => !!pieces && pieces.roads.includes(e);
  const newBuild = (v: number) => !!pieces && pieces.builds.includes(v);
  // the halo of the piece built last arrives with the piece
  const builtNew = !!built && built.at !== undefined && (built.b === 'road' ? newRoad(built.at) : newBuild(built.at));
  const robPt = (h: number) => ({ x: X(HEX_XY[h].x) - u * 0.5, y: Y(HEX_XY[h].y) + u * 0.05 });

  // tap areas: big enough for a finger, centred on each legal spot
  const hit = kind === 'road' ? Math.max(28, u * 0.86) : kind === 'hex' ? Math.max(40, u * 1.3) : Math.max(40, u * 1.1);
  const spot = (id: number) => {
    if (kind === 'road') return { x: X(EDGE_XY[id].x), y: Y(EDGE_XY[id].y) };
    if (kind === 'hex') return { x: X(HEX_XY[id].x), y: Y(HEX_XY[id].y) };
    return { x: vx(id), y: vy(id) };
  };

  return (
    <View ref={nodeRef} style={{ width, height, direction: 'ltr' }}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={u * 0.6} fill="#2A6FA8" />
        {/* waves */}
        {[0.12, 0.88].map((fy) =>
          [0.18, 0.5, 0.82].map((fx) => (
            <G key={`${fx}${fy}`} opacity={0.25}>
              <Line x1={width * fx - u * 0.3} y1={height * fy} x2={width * fx + u * 0.3} y2={height * fy} stroke="#BFE3FF" strokeWidth={1.5} strokeLinecap="round" />
            </G>
          )),
        )}

        {/* the coast: a sandy rim under the land */}
        {view.hexes.map((_, h) => (
          <Polygon key={`rim${h}`} points={hexPoints(h)} fill="#E8D8A8" stroke="#E8D8A8" strokeWidth={u * 0.22} strokeLinejoin="round" />
        ))}

        {/* harbours */}
        {PORT_SLOTS.map((p, i) => {
          const kindP = view.ports[i];
          const m = EDGE_XY[p.edge];
          const cx = X(m.x + p.out.x * 0.62);
          const cy = Y(m.y + p.out.y * 0.62);
          const r = u * 0.33;
          const fill = kindP === 'any' ? '#F6EBCF' : TERRAIN[kindP].fill;
          return (
            <G key={`port${i}`}>
              {p.verts.map((v) => (
                <Line key={v} x1={vx(v)} y1={vy(v)} x2={cx} y2={cy} stroke="#8B5A2B" strokeWidth={Math.max(2, u * 0.09)} strokeLinecap="round" />
              ))}
              <Circle cx={cx} cy={cy} r={r} fill={fill} stroke="#5C3A1A" strokeWidth={Math.max(1, u * 0.05)} />
              {kindP === 'any' ? (
                <SvgText x={cx} y={cy + fs(0.11)} fontSize={fs(0.3)} fontFamily={F.black} fill="#3B2512" textAnchor="middle">
                  3:1
                </SvgText>
              ) : (
                <>
                  <GlyphAt k={kindP} cx={cx} cy={cy - r * 0.28} size={r * 1.05} />
                  <SvgText x={cx} y={cy + r * 0.82} fontSize={fs(0.2)} fontFamily={F.black} fill="#1B1206" textAnchor="middle">
                    2:1
                  </SvgText>
                </>
              )}
            </G>
          );
        })}

        {/* land */}
        {view.hexes.map((t, h) => {
          const cx = X(HEX_XY[h].x);
          const cy = Y(HEX_XY[h].y);
          const n = view.nums[h];
          const robbed = view.robber === h;
          return (
            <G key={`hex${h}`}>
              <Polygon points={hexPoints(h)} fill={TERRAIN[t].fill} stroke="#F3E6C4" strokeWidth={Math.max(1, u * 0.05)} strokeLinejoin="round" />
              {t === 'desert' ? (
                <GlyphAt k={t} cx={cx} cy={cy} size={u * 0.95} />
              ) : (
                <>
                  <GlyphAt k={t} cx={cx} cy={cy - u * 0.55} size={u * 0.56} />
                  <G opacity={0.75}>
                    <GlyphAt k={t} cx={cx - u * 0.55} cy={cy + u * 0.32} size={u * 0.34} />
                    <GlyphAt k={t} cx={cx + u * 0.55} cy={cy + u * 0.32} size={u * 0.34} />
                  </G>
                </>
              )}
              {n ? (
                <G opacity={robbed ? 0.55 : 1}>
                  <Circle cx={cx} cy={cy + u * 0.05} r={u * 0.36} fill="#F7ECD2" stroke="#8A6D3B" strokeWidth={Math.max(1, u * 0.04)} />
                  <SvgText x={cx} y={cy + u * 0.05 + fs(0.15)} fontSize={fs(0.4)} fontFamily={F.black} fill={isRed(n) ? '#C8102E' : '#2B2118'} textAnchor="middle">
                    {String(n)}
                  </SvgText>
                  {Array.from({ length: pips(n) }, (_, i) => {
                    const k = pips(n);
                    const gap = u * 0.085;
                    return <Circle key={i} cx={cx + (i - (k - 1) / 2) * gap} cy={cy + u * 0.29} r={Math.max(0.9, u * 0.03)} fill={isRed(n) ? '#C8102E' : '#2B2118'} />;
                  })}
                </G>
              ) : null}
            </G>
          );
        })}

        {/* the road built last: a halo under it */}
        {built && built.b === 'road' && built.at !== undefined && view.roads[built.at] >= 0 && !builtNew ? (
          <Line
            x1={vx(EDGES[built.at][0])}
            y1={vy(EDGES[built.at][0])}
            x2={vx(EDGES[built.at][1])}
            y2={vy(EDGES[built.at][1])}
            stroke={LAST}
            strokeWidth={u * 0.36}
            strokeLinecap="round"
            opacity={0.7}
          />
        ) : null}

        {/* roads */}
        {view.roads.map((s, e) => {
          if (s < 0 || newRoad(e)) return null;
          const [a, b] = EDGES[e];
          return <Road key={`r${e}`} x1={vx(a)} y1={vy(a)} x2={vx(b)} y2={vy(b)} u={u} color={SEAT_COLORS[s]} outline={SEAT_OUTLINE[s]} />;
        })}

        {/* legal spots */}
        {kind === 'road'
          ? ids.map((e) => {
              const [a, b] = EDGES[e];
              if (e === selId) return null;
              return <Line key={`lr${e}`} x1={vx(a)} y1={vy(a)} x2={vx(b)} y2={vy(b)} stroke={HILITE} strokeWidth={u * 0.13} strokeLinecap="round" strokeDasharray={`${u * 0.14} ${u * 0.1}`} opacity={0.95} />;
            })
          : null}
        {selId !== null && kind === 'road' ? (
          <Road x1={vx(EDGES[selId][0])} y1={vy(EDGES[selId][0])} x2={vx(EDGES[selId][1])} y2={vy(EDGES[selId][1])} u={u} color={myColor} outline={HILITE} />
        ) : null}

        {/* buildings */}
        {view.buildings.map((b, v) =>
          b && !newBuild(v) ? <Building key={`b${v}`} cx={vx(v)} cy={vy(v)} u={u} color={SEAT_COLORS[b.s]} outline={SEAT_OUTLINE[b.s]} city={b.city} /> : null,
        )}

        {built && built.b !== 'road' && built.at !== undefined && view.buildings[built.at] && !builtNew ? (
          <Circle cx={vx(built.at)} cy={vy(built.at)} r={u * (built.b === 'city' ? 0.5 : 0.42)} fill="none" stroke={LAST} strokeWidth={Math.max(2, u * 0.07)} />
        ) : null}

        {kind === 'settle'
          ? ids.map((v) => (v === selId ? null : <Circle key={`ls${v}`} cx={vx(v)} cy={vy(v)} r={u * 0.17} fill="rgba(255,255,255,0.9)" stroke={HILITE} strokeWidth={Math.max(2, u * 0.08)} />))
          : null}
        {kind === 'city' ? ids.map((v) => <Circle key={`lc${v}`} cx={vx(v)} cy={vy(v)} r={u * 0.42} fill="none" stroke={HILITE} strokeWidth={Math.max(2, u * 0.08)} strokeDasharray={`${u * 0.12} ${u * 0.08}`} />) : null}
        {kind === 'hex' ? ids.map((h) => (h === selId ? null : <Circle key={`lh${h}`} cx={X(HEX_XY[h].x)} cy={Y(HEX_XY[h].y) + u * 0.05} r={u * 0.46} fill="none" stroke={HILITE} strokeWidth={Math.max(2, u * 0.07)} strokeDasharray={`${u * 0.1} ${u * 0.08}`} />)) : null}

        {/* the robber (or its preview on the chosen hex) */}
        {(() => {
          const h = robberHex;
          // gliding: drawn above the board meanwhile
          if (fx.rob) return null;
          return (
            <G opacity={h !== view.robber ? 0.85 : 1}>
              {robberMoved && h === view.robber ? <Circle cx={X(HEX_XY[h].x)} cy={Y(HEX_XY[h].y) + u * 0.05} r={u * 0.62} fill="none" stroke={LAST} strokeWidth={Math.max(2, u * 0.07)} /> : null}
              {h !== view.robber ? <Circle cx={X(HEX_XY[h].x)} cy={Y(HEX_XY[h].y) + u * 0.05} r={u * 0.5} fill="none" stroke={HILITE} strokeWidth={Math.max(2.5, u * 0.1)} /> : null}
              <Robber cx={X(HEX_XY[h].x) - u * 0.5} cy={Y(HEX_XY[h].y) + u * 0.05} u={u} />
            </G>
          );
        })()}

        {/* the chosen settlement / city */}
        {selId !== null && (kind === 'settle' || kind === 'city') ? (
          <G>
            <Circle cx={vx(selId)} cy={vy(selId)} r={u * 0.45} fill="rgba(255,216,77,0.35)" stroke={HILITE} strokeWidth={Math.max(2, u * 0.08)} />
            <Building cx={vx(selId)} cy={vy(selId)} u={u} color={myColor} outline={myOutline} city={kind === 'city'} />
          </G>
        ) : null}
      </Svg>

      {/* motion: the hexes of the rolled number glow, new pieces settle, the robber glides */}
      {fx.glow ? <HexGlow key={fx.glow.k} points={fx.glow.hexes.map(hexPoints)} width={width} height={height} u={u} /> : null}
      {pieces && pieces.builds.some((v) => pieces.was[v]) ? (
        <Settle key={`o${pieces.k}`} animate out style={{ position: 'absolute', left: 0, top: 0, width, height }}>
          <Svg width={width} height={height}>
            {pieces.builds.map((v) => {
              const b = pieces.was[v];
              return b ? <Building key={v} cx={vx(v)} cy={vy(v)} u={u} color={SEAT_COLORS[b.s]} outline={SEAT_OUTLINE[b.s]} city={b.city} /> : null;
            })}
          </Svg>
        </Settle>
      ) : null}
      {pieces ? (
        <Settle key={`i${pieces.k}`} animate from={pieces.soft ? 0.5 : 0} drop={Math.max(3, u * (pieces.soft ? 0.08 : 0.12))} style={{ position: 'absolute', left: 0, top: 0, width, height }}>
          <Svg width={width} height={height}>
            {builtNew && built && built.b === 'road' && built.at !== undefined ? (
              <Line x1={vx(EDGES[built.at][0])} y1={vy(EDGES[built.at][0])} x2={vx(EDGES[built.at][1])} y2={vy(EDGES[built.at][1])} stroke={LAST} strokeWidth={u * 0.36} strokeLinecap="round" opacity={0.7} />
            ) : null}
            {pieces.roads.map((e) => {
              const s = view.roads[e];
              const [a, b] = EDGES[e];
              return <Road key={e} x1={vx(a)} y1={vy(a)} x2={vx(b)} y2={vy(b)} u={u} color={SEAT_COLORS[s]} outline={SEAT_OUTLINE[s]} />;
            })}
            {pieces.builds.map((v) => {
              const b = view.buildings[v];
              return b ? <Building key={v} cx={vx(v)} cy={vy(v)} u={u} color={SEAT_COLORS[b.s]} outline={SEAT_OUTLINE[b.s]} city={b.city} /> : null;
            })}
            {builtNew && built && built.b !== 'road' && built.at !== undefined ? (
              <Circle cx={vx(built.at)} cy={vy(built.at)} r={u * (built.b === 'city' ? 0.5 : 0.42)} fill="none" stroke={LAST} strokeWidth={Math.max(2, u * 0.07)} />
            ) : null}
          </Svg>
        </Settle>
      ) : null}
      {fx.rob ? <RobberGlide key={fx.rob.k} from={robPt(fx.rob.from)} to={robPt(fx.rob.to)} u={u} /> : null}

      {/* the dice roll over the board, under the tap areas */}
      {children ? (
        <View style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
          {children}
        </View>
      ) : null}

      {/* tap areas */}
      {kind && onTarget
        ? ids.map((id) => {
            const p = spot(id);
            const label = kind === 'hex' ? `أرض ${HEX_NAME[view.hexes[id]]} ${view.nums[id] ?? ''}` : kind === 'road' ? `طريق ${id}` : `تقاطع ${id}`;
            return (
              <Pressable
                key={`t${kind}${id}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => {
                  haptic.tap();
                  onTarget({ kind, id });
                }}
                style={{ position: 'absolute', left: p.x - hit / 2, top: p.y - hit / 2, width: hit, height: hit, borderRadius: hit / 2 }}
              />
            );
          })
        : null}

    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Resources floating from the hexes to the players who earn them      */
/* ------------------------------------------------------------------ */

type Token = { h: number; p: string; r: CatanRes };
export interface ProduceFx {
  k: number;
  tokens: Token[];
  /** ms before the first resource leaves its hex (the dice land first) */
  delay: number;
}

const MAX_TOKENS = 12;

/**
 * Which resource goes from which hex to whom, from the events that just arrived: after a roll each
 * `gain` is traced back to the hexes of the rolled number touching that player's buildings (a city
 * sends two), never more than the player really got (a short bank); in the opening, the second
 * settlement's cards come from the hexes around it.
 */
function tokensOf(view: CatanView, fresh: CatanLog[]): Token[] {
  const out: Token[] = [];
  const roll = fresh.find((e) => e.t === 'roll');
  if (roll && roll.t === 'roll') {
    const total = roll.d[0] + roll.d[1];
    if (total === 7) return [];
    const hexes = view.nums.flatMap((n, h) => (n === total && h !== view.robber ? [h] : []));
    for (const g of fresh) {
      if (g.t !== 'gain' || g.id < roll.id) continue;
      const seat = view.order.indexOf(g.p);
      for (const r of RES) {
        let left = g.r[r];
        for (const h of hexes) {
          if (view.hexes[h] !== r) continue;
          for (const v of HEX_VERTS[h]) {
            const b = view.buildings[v];
            if (!b || b.s !== seat) continue;
            for (let i = 0; i < (b.city ? 2 : 1) && left > 0; i++, left--) out.push({ h, p: g.p, r });
          }
        }
      }
    }
    // hex by hex, so each glowing hex sends its cards together
    out.sort((a, b) => hexes.indexOf(a.h) - hexes.indexOf(b.h));
    return out.slice(0, MAX_TOKENS);
  }
  const built = fresh.find((e) => e.t === 'build' && e.b === 'settlement' && e.at !== undefined);
  const gain = fresh.find((e) => e.t === 'gain');
  if (built && built.t === 'build' && built.at !== undefined && gain && gain.t === 'gain' && gain.p === built.p) {
    const left = { ...gain.r };
    for (const h of VERT_HEXES[built.at]) {
      const t = view.hexes[h];
      if (t === 'desert' || left[t] <= 0) continue;
      left[t]--;
      out.push({ h, p: gain.p, r: t });
    }
  }
  return out;
}

/** The resources to fly after the latest events (none right after mount: no replay). */
export function useProduceFx(view: CatanView): ProduceFx | null {
  const settled = useSettled();
  const reduced = useReducedMotion();
  const lastId = view.log.length ? view.log[view.log.length - 1].id : 0;
  const [st, setSt] = useState<{ lastId: number; fx: ProduceFx | null }>({ lastId, fx: null });
  let cur = st;
  if (st.lastId !== lastId) {
    let fx = st.fx;
    if (settled && !reduced) {
      const fresh = view.log.filter((e) => e.id > st.lastId);
      const tokens = tokensOf(view, fresh);
      if (tokens.length) fx = { k: (st.fx?.k ?? 0) + 1, tokens, delay: fresh.some((e) => e.t === 'roll') ? DICE_THROW_MS + GLOW_IN : BOARD_MOTION.settle };
    }
    cur = { lastId, fx };
    setSt(cur);
  }
  return cur.fx;
}

function ResToken({ r }: { r: CatanRes }) {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#F7ECD2', borderWidth: 2, borderColor: RES_COLOR[r], alignItems: 'center', justifyContent: 'center' }}>
      <ResIcon r={r} size={17} />
    </View>
  );
}

/**
 * The flight itself, drawn in an overlay over the whole game screen: measured when the dice have
 * landed (the board and the players' card counters, relative to the same root), then each resource
 * glides from its hex to the receiving player's chip, one after another.
 */
export function ResourceFlights({ fx, spots, boardWidth }: { fx: ProduceFx; spots: Spots; boardWidth: number }) {
  const [list, setList] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; r: CatanRes; i: number }[] | null>(null);
  const start = useEffectEvent(() => {
    let live = true;
    const t = setTimeout(async () => {
      const board = await spots.measure('board');
      if (!board || !live) return;
      const to: Record<string, { x: number; y: number } | null> = {};
      for (const tk of fx.tokens) {
        if (tk.p in to) continue;
        const c = await spots.measure(`cards:${tk.p}`);
        to[tk.p] = c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : null;
      }
      if (!live) return;
      const seen: Record<number, number> = {};
      const out = fx.tokens.flatMap((tk, i) => {
        const dest = to[tk.p];
        if (!dest) return [];
        const k = seen[tk.h] ?? 0;
        seen[tk.h] = k + 1;
        const c = hexPoint(tk.h, boardWidth);
        // cards leaving the same hex spread a little, so they read as several
        const spread = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8;
        return [{ from: { x: board.x + c.x + spread, y: board.y + c.y }, to: dest, r: tk.r, i }];
      });
      setList(out);
    }, fx.delay);
    const end = setTimeout(() => setList(null), fx.delay + fx.tokens.length * BOARD_MOTION.stagger + BOARD_MOTION.fly + 400);
    return () => {
      live = false;
      clearTimeout(t);
      clearTimeout(end);
    };
  });
  useEffect(() => start(), []);
  if (!list) return null;
  return (
    <>
      {list.map((f) => (
        <Flyer key={f.i} from={f.from} to={f.to} size={26} delay={f.i * BOARD_MOTION.stagger}>
          <ResToken r={f.r} />
        </Flyer>
      ))}
    </>
  );
}
