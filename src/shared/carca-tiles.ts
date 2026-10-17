/**
 * «المدن والطرق» — the tile set and the board geometry shared by the server (rules, bots) and the app
 * (drawing, legal spots). The 72 tiles of the base game: 24 types A–X with their official counts; the
 * start tile is a D.
 *
 * Every tile edge has 3 "ports" (12 per tile), numbered clockwise from the north-west corner:
 *   north 0 1 2 · east 3 4 5 · south 6 7 8 · west 9 10 11
 * A city side owns its 3 ports; a road side has the road on the middle port and fields on the two
 * corner ports; a field side has 3 field ports. Each feature of a tile lists the ports it reaches, so
 * features join across tiles port by port (fields too, which is what farmers need). A field also lists
 * the cities of its tile it touches (for scoring farmers). `spot` is where a follower stands, in a
 * 0..100 square (y down), before rotation.
 * Rotation r = quarter turns clockwise: local port p → world port (p + 3r) % 12, local side d → (d + r) % 4.
 */

export type CarcaKind = 'city' | 'road' | 'field' | 'monastery';
export type Edge = 'C' | 'R' | 'F';

export interface CarcaFeature {
  k: CarcaKind;
  ports: number[];
  pennant?: boolean;
  /** fields only: indexes of the city features of this tile the field touches */
  cities?: number[];
  spot: [number, number];
}

export interface CarcaTileType {
  id: string;
  count: number;
  feats: CarcaFeature[];
}

const N = [0, 1, 2];
const E = [3, 4, 5];
const S = [6, 7, 8];
const W = [9, 10, 11];

const city = (ports: number[], spot: [number, number], pennant = false): CarcaFeature => ({ k: 'city', ports, spot, ...(pennant ? { pennant } : {}) });
const road = (ports: number[], spot: [number, number]): CarcaFeature => ({ k: 'road', ports, spot });
const field = (ports: number[], spot: [number, number], cities: number[] = []): CarcaFeature => ({ k: 'field', ports, spot, cities });
const monastery = (spot: [number, number]): CarcaFeature => ({ k: 'monastery', ports: [], spot });

/** The official base game: 24 types, 72 tiles. */
export const TILE_TYPES: CarcaTileType[] = [
  // A: monastery with a road to the south
  { id: 'A', count: 2, feats: [monastery([50, 50]), road([7], [50, 88]), field([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11], [17, 18])] },
  // B: monastery
  { id: 'B', count: 4, feats: [monastery([50, 50]), field([...N, ...E, ...S, ...W], [17, 18])] },
  // C: city on all four sides, with a pennant
  { id: 'C', count: 1, feats: [city([...N, ...E, ...S, ...W], [50, 50], true)] },
  // D: city to the north, straight road west–east (the start tile is one of these)
  { id: 'D', count: 4, feats: [city(N, [50, 14]), road([10, 4], [74, 50]), field([11, 3], [16, 34], [0]), field([5, 6, 7, 8, 9], [50, 78])] },
  // E: city to the north
  { id: 'E', count: 5, feats: [city(N, [50, 15]), field([...E, ...S, ...W], [50, 66], [0])] },
  // F: city joining west and east, with a pennant
  { id: 'F', count: 2, feats: [city([...W, ...E], [50, 50], true), field(N, [50, 8], [0]), field(S, [50, 92], [0])] },
  // G: city joining west and east
  { id: 'G', count: 1, feats: [city([...W, ...E], [50, 50]), field(N, [50, 8], [0]), field(S, [50, 92], [0])] },
  // H: two separate cities, north and south
  { id: 'H', count: 3, feats: [city(N, [50, 14]), city(S, [50, 86]), field([...E, ...W], [50, 50], [0, 1])] },
  // I: two separate cities, north and west
  { id: 'I', count: 2, feats: [city(N, [62, 13]), city(W, [13, 62]), field([...E, ...S], [64, 64], [0, 1])] },
  // J: city to the north, road curving east–south
  { id: 'J', count: 3, feats: [city(N, [50, 14]), road([4, 7], [70, 70]), field([5, 6], [89, 89]), field([3, 8, 9, 10, 11], [28, 52], [0])] },
  // K: city to the north, road curving west–south
  { id: 'K', count: 3, feats: [city(N, [50, 14]), road([10, 7], [30, 70]), field([8, 9], [11, 89]), field([3, 4, 5, 6, 11], [72, 52], [0])] },
  // L: city to the north, three roads (west, east, south) meeting at a village
  { id: 'L', count: 3, feats: [city(N, [50, 14]), road([10], [12, 52]), road([4], [88, 52]), road([7], [50, 86]), field([11, 3], [36, 36], [0]), field([5, 6], [82, 82]), field([8, 9], [18, 82])] },
  // M: city joining north and west, with a pennant
  { id: 'M', count: 2, feats: [city([...N, ...W], [34, 34], true), field([...E, ...S], [76, 76], [0])] },
  // N: city joining north and west
  { id: 'N', count: 3, feats: [city([...N, ...W], [34, 34]), field([...E, ...S], [76, 76], [0])] },
  // O: city joining north and west with a pennant, road curving east–south
  { id: 'O', count: 2, feats: [city([...N, ...W], [31, 31], true), road([4, 7], [72, 72]), field([5, 6], [91, 91]), field([3, 8], [80, 32], [0])] },
  // P: city joining north and west, road curving east–south
  { id: 'P', count: 3, feats: [city([...N, ...W], [31, 31]), road([4, 7], [72, 72]), field([5, 6], [91, 91]), field([3, 8], [80, 32], [0])] },
  // Q: city on three sides (north, east, west), with a pennant
  { id: 'Q', count: 1, feats: [city([...N, ...E, ...W], [50, 40], true), field(S, [50, 91], [0])] },
  // R: city on three sides
  { id: 'R', count: 3, feats: [city([...N, ...E, ...W], [50, 40]), field(S, [50, 91], [0])] },
  // S: city on three sides with a pennant, road to the south
  { id: 'S', count: 2, feats: [city([...N, ...E, ...W], [50, 38], true), road([7], [50, 90]), field([6], [82, 92], [0]), field([8], [18, 92], [0])] },
  // T: city on three sides, road to the south
  { id: 'T', count: 1, feats: [city([...N, ...E, ...W], [50, 38]), road([7], [50, 90]), field([6], [82, 92], [0]), field([8], [18, 92], [0])] },
  // U: straight road north–south
  { id: 'U', count: 8, feats: [road([1, 7], [50, 50]), field([2, 3, 4, 5, 6], [80, 50]), field([8, 9, 10, 11, 0], [20, 50])] },
  // V: road curving west–south
  { id: 'V', count: 9, feats: [road([10, 7], [28, 72]), field([8, 9], [10, 91]), field([11, 0, 1, 2, 3, 4, 5, 6], [68, 32])] },
  // W: three roads (west, east, south) meeting at a village
  { id: 'W', count: 4, feats: [road([10], [14, 50]), road([4], [86, 50]), road([7], [50, 86]), field([11, 0, 1, 2, 3], [50, 22]), field([5, 6], [80, 80]), field([8, 9], [20, 80])] },
  // X: four roads meeting at a village
  { id: 'X', count: 1, feats: [road([1], [50, 14]), road([4], [86, 50]), road([7], [50, 86]), road([10], [14, 50]), field([2, 3], [80, 20]), field([5, 6], [80, 80]), field([8, 9], [20, 80]), field([11, 0], [20, 20])] },
];

export const TILES: Record<string, CarcaTileType> = Object.fromEntries(TILE_TYPES.map((t) => [t.id, t]));
export const START_TILE = 'D';
export const TOTAL_TILES = 72;
export const FOLLOWERS = 7;
/** one tile's size in the board's drawing units */
export const UNIT = 100;

/** owner feature of each local port, per tile type */
const PORT_OWNER: Record<string, number[]> = Object.fromEntries(
  TILE_TYPES.map((t) => {
    const own = new Array(12).fill(-1);
    t.feats.forEach((f, i) => f.ports.forEach((p) => (own[p] = i)));
    return [t.id, own];
  }),
);

/** The edge type of a tile side before rotation. */
export function localEdge(t: string, side: number): Edge {
  const type = TILES[t];
  const ports = [side * 3, side * 3 + 1, side * 3 + 2];
  const owner = (p: number) => type.feats[PORT_OWNER[t][p]];
  if (ports.some((p) => owner(p)?.k === 'city')) return 'C';
  if (owner(side * 3 + 1)?.k === 'road') return 'R';
  return 'F';
}

const EDGES: Record<string, Edge[]> = Object.fromEntries(TILE_TYPES.map((t) => [t.id, [0, 1, 2, 3].map((d) => localEdge(t.id, d))]));

/** The edge type of world side `side` (0 N, 1 E, 2 S, 3 W) of tile `t` turned `r` quarter turns. */
export function edgeAt(t: string, r: number, side: number): Edge {
  return EDGES[t][(side - r + 8) % 4];
}

/** The 71 tiles to draw (the start tile is placed first, so it is not in the pile). */
export function makePile(): string[] {
  const out: string[] = [];
  for (const t of TILE_TYPES) for (let i = 0; i < t.count; i++) out.push(t.id);
  out.splice(out.indexOf(START_TILE), 1);
  return out;
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export interface CarcaPlaced {
  x: number;
  y: number;
  t: string;
  r: number;
}

export type Board = Map<string, CarcaPlaced>;
export const key = (x: number, y: number) => `${x},${y}`;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export function makeBoard(list: CarcaPlaced[]): Board {
  return new Map(list.map((p) => [key(p.x, p.y), p]));
}

/** Can tile `t` turned `r` go at (x, y)? Empty, next to a tile, every edge matching its neighbour. */
export function fits(board: Board, t: string, x: number, y: number, r: number): boolean {
  if (board.has(key(x, y))) return false;
  let touches = false;
  for (let d = 0; d < 4; d++) {
    const nb = board.get(key(x + DX[d], y + DY[d]));
    if (!nb) continue;
    touches = true;
    if (edgeAt(t, r, d) !== edgeAt(nb.t, nb.r, (d + 2) % 4)) return false;
  }
  return touches;
}

/** Empty cells next to at least one tile. */
export function frontier(board: Board): { x: number; y: number }[] {
  const out = new Map<string, { x: number; y: number }>();
  for (const p of board.values()) {
    for (let d = 0; d < 4; d++) {
      const x = p.x + DX[d], y = p.y + DY[d];
      const k = key(x, y);
      if (!board.has(k) && !out.has(k)) out.set(k, { x, y });
    }
  }
  return [...out.values()];
}

/** The rotations of `t` that fit at (x, y). Symmetric tiles keep every rotation (they look the same). */
export function legalRotations(board: Board, t: string, x: number, y: number): number[] {
  return [0, 1, 2, 3].filter((r) => fits(board, t, x, y, r));
}

/** Every cell where some rotation of `t` fits, with those rotations. */
export function legalSpots(board: Board, t: string): { x: number; y: number; rs: number[] }[] {
  const out: { x: number; y: number; rs: number[] }[] = [];
  for (const c of frontier(board)) {
    const rs = legalRotations(board, t, c.x, c.y);
    if (rs.length) out.push({ ...c, rs });
  }
  return out;
}

export function canPlace(board: Board, t: string): boolean {
  for (const c of frontier(board)) for (let r = 0; r < 4; r++) if (fits(board, t, c.x, c.y, r)) return true;
  return false;
}

/** The port on the neighbouring tile that touches world port `p`. */
export function facingPort(p: number): number {
  const d = Math.floor(p / 3), k = p % 3;
  return ((d + 2) % 4) * 3 + (2 - k);
}

/** The feature of a placed tile that owns world port `p`. */
export function featureAt(placed: CarcaPlaced, p: number): number {
  return PORT_OWNER[placed.t][(p - 3 * placed.r + 24) % 12];
}

/** A follower's spot (or any point of the 0..100 tile square) after turning the tile `r` times. */
export function rotatePoint([u, v]: [number, number], r: number): [number, number] {
  let x = u, y = v;
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) [x, y] = [100 - y, x];
  return [x, y];
}

export interface Member {
  x: number;
  y: number;
  f: number;
}

export const memberKey = (m: Member) => `${m.x},${m.y},${m.f}`;

/** A connected feature across the board. */
export interface Group {
  kind: CarcaKind;
  members: Member[];
  /** a stable id: the smallest member key */
  id: string;
  /** distinct tiles */
  tiles: number;
  pennants: number;
  /** open ends (roads), open sides (cities), empty neighbours (monasteries) */
  open: number;
  complete: boolean;
  /** fields: the city features (on the field's tiles) it touches */
  cityRefs: Member[];
}

/** Walk a feature across the board from tile (x, y), feature f. */
export function groupOf(board: Board, x: number, y: number, f: number): Group {
  const start = board.get(key(x, y))!;
  const kind = TILES[start.t].feats[f].k;
  if (kind === 'monastery') {
    let around = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && board.has(key(x + dx, y + dy))) around++;
    const m = { x, y, f };
    return { kind, members: [m], id: memberKey(m), tiles: 1 + around, pennants: 0, open: 8 - around, complete: around === 8, cityRefs: [] };
  }
  const seen = new Set<string>();
  const members: Member[] = [];
  const tileSet = new Set<string>();
  const open = new Set<string>();
  const cityRefs: Member[] = [];
  let pennants = 0;
  const stack: Member[] = [{ x, y, f }];
  seen.add(memberKey(stack[0]));
  while (stack.length) {
    const m = stack.pop()!;
    members.push(m);
    tileSet.add(key(m.x, m.y));
    const pl = board.get(key(m.x, m.y))!;
    const feat = TILES[pl.t].feats[m.f];
    if (feat.pennant) pennants++;
    if (feat.cities) for (const c of feat.cities) cityRefs.push({ x: m.x, y: m.y, f: c });
    for (const lp of feat.ports) {
      const wp = (lp + 3 * pl.r) % 12;
      const side = Math.floor(wp / 3);
      const nx = m.x + DX[side], ny = m.y + DY[side];
      const nb = board.get(key(nx, ny));
      if (!nb) {
        // a city side counts once; a road end is one port
        open.add(kind === 'city' ? `${m.x},${m.y},${side}` : `${m.x},${m.y},${wp}`);
        continue;
      }
      const next = { x: nx, y: ny, f: featureAt(nb, facingPort(wp)) };
      const k = memberKey(next);
      if (!seen.has(k)) {
        seen.add(k);
        stack.push(next);
      }
    }
  }
  let id = memberKey(members[0]);
  for (const m of members) {
    const k = memberKey(m);
    if (k < id) id = k;
  }
  return { kind, members, id, tiles: tileSet.size, pennants, open: open.size, complete: kind !== 'field' && open.size === 0, cityRefs };
}

/** Points for a feature completed during the game. */
export function completedPoints(g: Group): number {
  if (g.kind === 'road') return g.tiles;
  if (g.kind === 'city') return 2 * g.tiles + 2 * g.pennants;
  if (g.kind === 'monastery') return 9;
  return 0;
}

/** Points for an unfinished road, city or monastery at the end of the game. */
export function unfinishedPoints(g: Group): number {
  if (g.kind === 'road') return g.tiles;
  if (g.kind === 'city') return g.tiles + g.pennants;
  if (g.kind === 'monastery') return g.tiles; // 1 + the tiles around it
  return 0;
}

/** The distinct cities a field touches, and whether each is complete. */
export function fieldCities(board: Board, g: Group): { id: string; complete: boolean }[] {
  const out = new Map<string, boolean>();
  const known = new Set<string>();
  for (const ref of g.cityRefs) {
    if (known.has(memberKey(ref))) continue;
    const c = groupOf(board, ref.x, ref.y, ref.f);
    for (const m of c.members) known.add(memberKey(m));
    out.set(c.id, c.complete);
  }
  return [...out].map(([id, complete]) => ({ id, complete }));
}

/** Farm points of a field: 3 per completed city it touches. */
export function fieldPoints(board: Board, g: Group): number {
  return 3 * fieldCities(board, g).filter((c) => c.complete).length;
}

/** The followers' majority: the owners with the most followers in a feature (all of them on a tie). */
export function majority(owners: string[]): string[] {
  const n = new Map<string, number>();
  for (const o of owners) n.set(o, (n.get(o) ?? 0) + 1);
  const max = Math.max(0, ...n.values());
  return max ? [...n].filter(([, c]) => c === max).map(([o]) => o) : [];
}
