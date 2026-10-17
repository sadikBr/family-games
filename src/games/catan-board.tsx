/**
 * «المستوطنون» — the island drawn with react-native-svg: sea, 19 hexes with their terrain and number
 * tokens (6 and 8 in red, with the dots), 9 harbours, roads, settlements, cities and the robber.
 * Only the legal spots of the current move are highlighted and tappable (big invisible tap areas laid
 * over the drawing); the chosen spot shows a preview until it is confirmed.
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/sfx';
import type { CatanView } from '@/shared/games/catan';
import { BOARD_BOX, EDGES, EDGE_XY, HEX_VERTS, HEX_XY, HEX_NAME, PORT_SLOTS, VERT_XY, isRed, pips } from '@/shared/catan-board';
import { F } from '@/theme';

import { Building, GlyphAt, Road, Robber, SEAT_COLORS, SEAT_OUTLINE, TERRAIN } from './catan-art';

export type TargetKind = 'settle' | 'city' | 'road' | 'hex';
export interface Target {
  kind: TargetKind;
  id: number;
}

const BW = BOARD_BOX.maxX - BOARD_BOX.minX;
const BH = BOARD_BOX.maxY - BOARD_BOX.minY;
export const boardHeight = (width: number) => (width * BH) / BW;

const HILITE = '#FFD84D';

export function CatanBoard({
  view,
  width,
  kind,
  ids,
  sel,
  mySeat,
  onTarget,
  children,
}: {
  view: CatanView;
  width: number;
  /** what can be tapped now (null: nothing) */
  kind: TargetKind | null;
  ids: number[];
  sel: Target | null;
  mySeat: number;
  onTarget?: (t: Target) => void;
  /** drawn over the board (the dice) */
  children?: ReactNode;
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
  const selId = sel && sel.kind === kind ? sel.id : null;

  // tap areas: big enough for a finger, centred on each legal spot
  const hit = kind === 'road' ? Math.max(28, u * 0.86) : kind === 'hex' ? Math.max(40, u * 1.3) : Math.max(40, u * 1.1);
  const spot = (id: number) => {
    if (kind === 'road') return { x: X(EDGE_XY[id].x), y: Y(EDGE_XY[id].y) };
    if (kind === 'hex') return { x: X(HEX_XY[id].x), y: Y(HEX_XY[id].y) };
    return { x: vx(id), y: vy(id) };
  };

  return (
    <View style={{ width, height, direction: 'ltr' }}>
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

        {/* roads */}
        {view.roads.map((s, e) => {
          if (s < 0) return null;
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
          b ? <Building key={`b${v}`} cx={vx(v)} cy={vy(v)} u={u} color={SEAT_COLORS[b.s]} outline={SEAT_OUTLINE[b.s]} city={b.city} /> : null,
        )}

        {kind === 'settle'
          ? ids.map((v) => (v === selId ? null : <Circle key={`ls${v}`} cx={vx(v)} cy={vy(v)} r={u * 0.17} fill="rgba(255,255,255,0.9)" stroke={HILITE} strokeWidth={Math.max(2, u * 0.08)} />))
          : null}
        {kind === 'city' ? ids.map((v) => <Circle key={`lc${v}`} cx={vx(v)} cy={vy(v)} r={u * 0.42} fill="none" stroke={HILITE} strokeWidth={Math.max(2, u * 0.08)} strokeDasharray={`${u * 0.12} ${u * 0.08}`} />) : null}
        {kind === 'hex' ? ids.map((h) => (h === selId ? null : <Circle key={`lh${h}`} cx={X(HEX_XY[h].x)} cy={Y(HEX_XY[h].y) + u * 0.05} r={u * 0.46} fill="none" stroke={HILITE} strokeWidth={Math.max(2, u * 0.07)} strokeDasharray={`${u * 0.1} ${u * 0.08}`} />)) : null}

        {/* the robber (or its preview on the chosen hex) */}
        {(() => {
          const h = kind === 'hex' && selId !== null ? selId : view.robber;
          return (
            <G opacity={h !== view.robber ? 0.85 : 1}>
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
