/**
 * «الدومينو» — where each tile of the line lies on the table: a snake that always fits the board's width.
 *
 * The round's first tile sits in the middle. The right arm runs right, turns down at the edge (one tile
 * standing up in the corner) and comes back left on the next row, and so on; the left arm mirrors it
 * upwards. Each arm only ever grows at its tip, so a new tile never moves the others (only the whole
 * picture's height changes when a new row starts). Doubles lie crosswise, except in a corner and just
 * after one (there they lie in line, so nothing overlaps). Rows are 2u apart (u = half a tile's length).
 *
 * Pure geometry (no React): the app draws it, the tests check that nothing overlaps or leaves the board.
 */
import type { DominoEnd } from './domino';

export interface DominoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A tile on the board: its rectangle and the pips of its top / left half (`first`) and the other half. */
export interface DominoSlot extends DominoRect {
  first: number;
  second: number;
}

/** Where the next tile would go at an open end. */
export interface DominoGhost extends DominoRect {
  end: DominoEnd;
  value: number;
}

export interface DominoLayout {
  /** in the order of the line */
  tiles: DominoSlot[];
  ghosts: DominoGhost[];
  /** the picture's vertical extent (y may be negative: rows above the first) */
  minY: number;
  maxY: number;
}

interface ArmTile {
  inner: number;
  outer: number;
  dbl: boolean;
}

interface Cursor {
  x: number;
  y: number;
  /** +1 going right, -1 going left */
  h: 1 | -1;
  afterCorner: boolean;
}

/** Lays one arm from the cursor; `v` = +1 turns down (right arm), -1 up (left arm). Returns the tip's cursor. */
function placeArm(tiles: ArmTile[], cur: Cursor, v: 1 | -1, minX: number, maxX: number, u: number, out: DominoSlot[]): Cursor {
  let c = { ...cur };
  for (const t of tiles) {
    const r = step(c, t.dbl, t.inner, t.outer, v, minX, maxX, u);
    out.push(r.slot);
    c = r.next;
  }
  return c;
}

function step(c: Cursor, dbl: boolean, inner: number, outer: number, v: 1 | -1, minX: number, maxX: number, u: number): { slot: DominoSlot; next: Cursor; corner: boolean } {
  const cross = dbl && !c.afterCorner;
  const len = cross ? u : 2 * u;
  const room = c.h > 0 ? maxX - c.x : c.x - minX;
  // keep room for a corner tile after this one
  if (len + u > room + 0.001) {
    const x = c.h > 0 ? c.x : c.x - u;
    const y = v > 0 ? c.y - u / 2 : c.y - 1.5 * u;
    const slot = { x, y, w: u, h: 2 * u, first: v > 0 ? inner : outer, second: v > 0 ? outer : inner };
    return { slot, next: { x: c.x + c.h * u, y: c.y + v * 2 * u, h: c.h > 0 ? -1 : 1, afterCorner: true }, corner: true };
  }
  if (cross) {
    const x = c.h > 0 ? c.x : c.x - u;
    return { slot: { x, y: c.y - u, w: u, h: 2 * u, first: inner, second: inner }, next: { ...c, x: c.x + c.h * u, afterCorner: false }, corner: false };
  }
  const x = c.h > 0 ? c.x : c.x - 2 * u;
  const slot = { x, y: c.y - u / 2, w: 2 * u, h: u, first: c.h > 0 ? inner : outer, second: c.h > 0 ? outer : inner };
  return { slot, next: { ...c, x: c.x + c.h * 2 * u, afterCorner: false }, corner: false };
}

/**
 * The line laid out on a board `width` wide with half-tiles of `u`. `line[i]` = [l, r] (l faces the left
 * end); `anchor` = the index of the round's first tile.
 */
export function layoutLine(line: readonly { l: number; r: number }[], anchor: number, width: number, u: number, margin = 4): DominoLayout {
  if (!line.length) return { tiles: [], ghosts: [], minY: -u, maxY: u };
  const minX = margin;
  const maxX = width - margin;
  const a = line[anchor];
  const aDbl = a.l === a.r;
  const aw = aDbl ? u : 2 * u;
  const ah = aDbl ? 2 * u : u;
  const ax = width / 2 - aw / 2;
  const anchorSlot: DominoSlot = { x: ax, y: -ah / 2, w: aw, h: ah, first: a.l, second: a.r };

  const rightTiles: ArmTile[] = line.slice(anchor + 1).map((t) => ({ inner: t.l, outer: t.r, dbl: t.l === t.r }));
  const leftTiles: ArmTile[] = line
    .slice(0, anchor)
    .reverse()
    .map((t) => ({ inner: t.r, outer: t.l, dbl: t.l === t.r }));
  const right: DominoSlot[] = [];
  const left: DominoSlot[] = [];
  const rTip = placeArm(rightTiles, { x: ax + aw, y: 0, h: 1, afterCorner: false }, 1, minX, maxX, u, right);
  const lTip = placeArm(leftTiles, { x: ax, y: 0, h: -1, afterCorner: false }, -1, minX, maxX, u, left);

  const ends: [number, number] = [line[0].l, line[line.length - 1].r];
  const gl = step(lTip, false, ends[0], -1, -1, minX, maxX, u).slot;
  const gr = step(rTip, false, ends[1], -1, 1, minX, maxX, u).slot;
  const ghosts: DominoGhost[] = [
    { x: gl.x, y: gl.y, w: gl.w, h: gl.h, end: 'L', value: ends[0] },
    { x: gr.x, y: gr.y, w: gr.w, h: gr.h, end: 'R', value: ends[1] },
  ];
  const tiles = [...left.reverse(), anchorSlot, ...right];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of [...tiles, ...ghosts]) {
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { tiles, ghosts, minY, maxY };
}

/** The half-tile size for a board this wide (about 15 halves across, within limits). */
export function dominoUnit(width: number, max: number): number {
  return Math.max(14, Math.min(max, Math.floor(width / 15)));
}

export const rectsOverlap = (p: DominoRect, q: DominoRect, eps = 0.01) =>
  p.x < q.x + q.w - eps && q.x < p.x + p.w - eps && p.y < q.y + q.h - eps && q.y < p.y + p.h - eps;
