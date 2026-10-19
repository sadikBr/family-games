/**
 * «المدن والطرق» — calm motion (helpers in catan-motion.tsx): a placed tile settles onto the board, a
 * new follower settles onto its tile, the drawn tile settles into its card, and followers that scored
 * glide back to their owner's chip while the points count up.
 */
import { useEffect, useEffectEvent, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Svg } from 'react-native-svg';

import { TILES, UNIT, rotatePoint } from '@/shared/carca-tiles';
import type { CarcaFollower, CarcaTilePlaced, CarcaView } from '@/shared/games/carca';

import { BOARD_MOTION, Flyer, Settle, Spots, useSettled } from './catan-motion';
import { Meeple, MeepleIcon, TileView, colorOf } from './carca-tile';

const U = UNIT;

export const fKey = (f: CarcaFollower) => `${f.owner}|${f.x},${f.y}|${f.f}`;
export const tKey = (p: { x: number; y: number }) => `${p.x},${p.y}`;

/** The board's spots plus its current pan/zoom (reported by the board after each render). */
export class CarcaSpots extends Spots {
  xf = { s: 1, tx: 0, ty: 0 };
  setXf(s: number, tx: number, ty: number) {
    this.xf = { s, tx, ty };
  }
}

/* ------------------------------------------------------------------ */
/* On the board: the tile / follower that just arrived                 */
/* ------------------------------------------------------------------ */

interface Arrival {
  k: number;
  tiles: (CarcaTilePlaced & { soft: boolean })[];
  followers: CarcaFollower[];
}

/**
 * New tiles and followers since the last view (previous view kept in state). A tile that lands where
 * its preview was already shown starts nearly solid and only settles; otherwise it fades in. While it
 * plays, the board leaves these out of its drawing (`hidden`).
 */
export function useArrivals(board: CarcaTilePlaced[], followers: CarcaFollower[], preview: { x: number; y: number } | null | undefined) {
  const settled = useSettled();
  const bk = board.map(tKey).join(';');
  const fk = followers.map(fKey).join(';');
  const pv = preview ? tKey(preview) : '';
  const [mem, setMem] = useState<{ bk: string; fk: string; pv: string; seq: number; fx: Arrival | null }>({ bk, fk, pv, seq: 0, fx: null });
  let cur = mem;
  if (mem.bk !== bk || mem.fk !== fk || mem.pv !== pv) {
    let fx = mem.fx;
    let seq = mem.seq;
    if (settled && (mem.bk !== bk || mem.fk !== fk)) {
      const oldT = new Set(mem.bk.split(';'));
      const oldF = new Set(mem.fk.split(';'));
      const tiles = board.filter((p) => !oldT.has(tKey(p))).map((p) => ({ ...p, soft: mem.pv === tKey(p) }));
      const fs = followers.filter((f) => !oldF.has(fKey(f)));
      if (tiles.length + fs.length > 0 && tiles.length + fs.length <= 3) {
        seq += 1;
        fx = { k: seq, tiles, followers: fs };
      }
    }
    cur = { bk, fk, pv, seq, fx };
    setMem(cur);
  }
  const k = cur.fx?.k ?? 0;
  useEffect(() => {
    if (!k) return;
    const t = setTimeout(() => setMem((m) => (m.fx?.k === k ? { ...m, fx: null } : m)), BOARD_MOTION.settle + 80);
    return () => clearTimeout(t);
  }, [k]);
  const fx = cur.fx;
  // a tile settling where its preview was is drawn as usual underneath (with its marks), see ArrivalLayer
  const hidden = new Set<string>([...(fx?.tiles.filter((p) => !p.soft).map((p) => `t${tKey(p)}`) ?? []), ...(fx?.followers.map((f) => `f${fKey(f)}`) ?? [])]);
  return { fx, hidden };
}

/** The arrivals drawn over the board at its current pan/zoom. */
export function ArrivalLayer({
  fx,
  board,
  colors,
  last,
  xf,
}: {
  fx: Arrival;
  board: CarcaTilePlaced[];
  colors: Record<string, number>;
  /** the frame of the tile placed last travels with it (the drawing's frame is under this layer) */
  last?: { x: number; y: number; color: number } | null;
  xf: { s: number; tx: number; ty: number };
}) {
  const at = new Map(board.map((p) => [tKey(p), p]));
  const px = U * xf.s;
  const mSize = 34 * xf.s;
  return (
    <>
      {fx.tiles.map((p) => (
        // where its preview was: a lifted copy comes down onto the tile and dissolves; elsewhere it fades in
        <Settle key={`t${fx.k}${tKey(p)}`} animate out={p.soft} from={p.soft ? 0.9 : 0} scale={1.05} drop={0} style={{ position: 'absolute', left: xf.tx + p.x * px, top: xf.ty + p.y * px, width: px, height: px }}>
          <TileView t={p.t} r={p.r} size={px} />
          {last && last.x === p.x && last.y === p.y ? (
            <View style={{ position: 'absolute', left: -0.5 * xf.s, top: -0.5 * xf.s, right: -0.5 * xf.s, bottom: -0.5 * xf.s, borderWidth: 5 * xf.s, borderRadius: 6.5 * xf.s, borderColor: colorOf(last.color).fill }} />
          ) : null}
        </Settle>
      ))}
      {fx.followers.map((f) => {
        const p = at.get(tKey(f));
        if (!p) return null;
        const feat = TILES[p.t].feats[f.f];
        const [sx, sy] = rotatePoint(feat.spot, p.r);
        const cx = xf.tx + (f.x * U + sx) * xf.s;
        const cy = xf.ty + (f.y * U + sy) * xf.s;
        return (
          <Settle key={`f${fx.k}${fKey(f)}`} animate drop={Math.max(3, 8 * xf.s)} delay={fx.tiles.length ? 120 : 0} style={{ position: 'absolute', left: cx - mSize / 2, top: cy - mSize / 2, width: mSize, height: mSize }}>
            <Svg width={mSize} height={mSize} viewBox="-17 -17 34 34">
              <Meeple x={0} y={0} size={28} color={colors[f.owner] ?? 0} lying={feat.k === 'field'} />
            </Svg>
          </Settle>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Followers that scored going back to their owners                    */
/* ------------------------------------------------------------------ */

/** a follower leaving the board: its owner, colour, where it stood (board units) and whether it lay */
type Leaver = { owner: string; color: number; wx: number; wy: number; lying: boolean };
export interface ReturnFx {
  k: number;
  list: Leaver[];
  /** when the points start counting up (the first follower has landed) */
  countAt: number;
}

const RETURN_DELAY = 340;

/**
 * Followers that went back to their owners since the last view (none right after mount). The server
 * says which ones (`returned`, with the turn it happened in), so even a follower put on a feature that
 * its own tile completed — never seen on the board — is shown going home; with an older server, the
 * followers that disappeared from the board.
 */
export function useReturns(view: CarcaView): ReturnFx | null {
  const settled = useSettled();
  const reduced = useReducedMotion();
  const fk = view.followers.map(fKey).join(';');
  const rn = view.returned === undefined ? -1 : (view.returned?.n ?? 0);
  const [mem, setMem] = useState<{ fk: string; rn: number; followers: CarcaFollower[]; fx: ReturnFx | null }>({ fk, rn, followers: view.followers, fx: null });
  let cur = mem;
  if (mem.fk !== fk || mem.rn !== rn) {
    let fx = mem.fx;
    if (settled && !reduced && view.phase === 'play') {
      const now = new Set(view.followers.map(fKey));
      const at = new Map(view.board.map((p) => [tKey(p), p]));
      // the server's list when it sends one (and only when it is new), else what left the board
      const gone = view.returned !== undefined ? (mem.rn !== rn ? (view.returned?.followers ?? []) : []) : mem.followers.filter((f) => !now.has(fKey(f)));
      const list = gone.flatMap((f): Leaver[] => {
        const p = at.get(tKey(f));
        if (!p) return [];
        const feat = TILES[p.t].feats[f.f];
        const [sx, sy] = rotatePoint(feat.spot, p.r);
        return [{ owner: f.owner, color: view.colors[f.owner] ?? 0, wx: f.x * U + sx, wy: f.y * U + sy, lying: feat.k === 'field' }];
      });
      if (list.length) fx = { k: (mem.fx?.k ?? 0) + 1, list: list.slice(0, 8), countAt: RETURN_DELAY + BOARD_MOTION.fly - 80 };
    }
    cur = { fk, rn, followers: view.followers, fx };
    setMem(cur);
  }
  const k = cur.fx?.k ?? 0;
  const n = cur.fx?.list.length ?? 0;
  useEffect(() => {
    if (!k) return;
    const t = setTimeout(() => setMem((m) => (m.fx?.k === k ? { ...m, fx: null } : m)), RETURN_DELAY + n * BOARD_MOTION.stagger + BOARD_MOTION.fly + 300);
    return () => clearTimeout(t);
  }, [k, n]);
  return cur.fx;
}

/** The flight: from the follower's spot on the board to the follower counter on its owner's chip. */
export function ReturnFlights({ fx, spots }: { fx: ReturnFx; spots: CarcaSpots }) {
  const [list, setList] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; color: number; i: number }[] | null>(null);
  const start = useEffectEvent(() => {
    let live = true;
    const t = setTimeout(async () => {
      const board = await spots.measure('board');
      if (!board || !live) return;
      const { s, tx, ty } = spots.xf;
      const out: { from: { x: number; y: number }; to: { x: number; y: number }; color: number; i: number }[] = [];
      for (let i = 0; i < fx.list.length; i++) {
        const l = fx.list[i];
        const c = await spots.measure(`supply:${l.owner}`);
        if (!c) continue;
        // a follower outside the visible part of the board leaves from its nearest edge
        const x = Math.max(0, Math.min(board.w, tx + l.wx * s));
        const y = Math.max(0, Math.min(board.h, ty + l.wy * s));
        out.push({ from: { x: board.x + x, y: board.y + y }, to: { x: c.x + c.w / 2, y: c.y + c.h / 2 }, color: l.color, i });
      }
      if (live) setList(out);
    }, RETURN_DELAY);
    return () => {
      live = false;
      clearTimeout(t);
    };
  });
  useEffect(() => start(), []);
  if (!list) return null;
  return (
    <>
      {list.map((f) => (
        <Flyer key={f.i} from={f.from} to={f.to} size={24} delay={f.i * BOARD_MOTION.stagger} endScale={0.6}>
          <MeepleIcon color={f.color} size={24} />
        </Flyer>
      ))}
    </>
  );
}
