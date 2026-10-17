/**
 * «المستوطنون» — board geometry and constants shared by the server and the app.
 *
 * 19 pointy-top hexes in rows of 3-4-5-4-3 (axial coordinates, row by row from the top, left to right).
 * Positions are in units of the hex radius R (centre to corner), centred on (0, 0), y pointing down.
 * Intersections (54) and paths (72) are numbered once here, sorted top to bottom then left to right.
 * The 30 coast paths are listed clockwise from the top-left; 9 of them hold a harbour (PORT_SLOTS).
 */
import type { CatanDevKind, CatanHexType, CatanPortKind, CatanRes, CatanResMap } from './games/catan';

export const RES: CatanRes[] = ['wood', 'brick', 'sheep', 'grain', 'ore'];
export const RES_NAME: Record<CatanRes, string> = { wood: 'خشب', brick: 'طوب', sheep: 'صوف', grain: 'قمح', ore: 'حجر' };
export const HEX_NAME: Record<CatanHexType, string> = { wood: 'غابة', brick: 'تلال', sheep: 'مرعى', grain: 'حقل', ore: 'جبل', desert: 'صحراء' };
export const DEV_NAME: Record<CatanDevKind, string> = { knight: 'فارس', vp: 'نقطة نصر', roads: 'بناء الطرق', plenty: 'الوفرة', monopoly: 'الاحتكار' };

export const emptyRes = (): CatanResMap => ({ wood: 0, brick: 0, sheep: 0, grain: 0, ore: 0 });
export const resOf = (p: Partial<CatanResMap>): CatanResMap => ({ ...emptyRes(), ...p });
export const resTotal = (m: CatanResMap) => RES.reduce((a, r) => a + m[r], 0);

export const COST = {
  road: resOf({ wood: 1, brick: 1 }),
  settlement: resOf({ wood: 1, brick: 1, sheep: 1, grain: 1 }),
  city: resOf({ grain: 2, ore: 3 }),
  dev: resOf({ sheep: 1, grain: 1, ore: 1 }),
} as const;

export const PIECES = { road: 15, settlement: 5, city: 4 } as const;
export const BANK_EACH = 19;
export const DEV_DECK: CatanDevKind[] = [
  ...Array<CatanDevKind>(14).fill('knight'),
  ...Array<CatanDevKind>(5).fill('vp'),
  ...Array<CatanDevKind>(2).fill('roads'),
  ...Array<CatanDevKind>(2).fill('plenty'),
  ...Array<CatanDevKind>(2).fill('monopoly'),
];
export const HEX_TYPES: CatanHexType[] = [
  ...Array<CatanHexType>(4).fill('wood'),
  ...Array<CatanHexType>(4).fill('sheep'),
  ...Array<CatanHexType>(4).fill('grain'),
  ...Array<CatanHexType>(3).fill('brick'),
  ...Array<CatanHexType>(3).fill('ore'),
  'desert',
];
export const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
export const PORT_KINDS: CatanPortKind[] = ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'grain', 'ore'];

/** Dots under a number token: how many of the 36 dice outcomes give it. */
export const pips = (n: number | null) => (n ? 6 - Math.abs(7 - n) : 0);
export const isRed = (n: number | null) => n === 6 || n === 8;

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const S3 = Math.sqrt(3);

export const HEX_AXIAL: [number, number][] = [];
for (let r = -2; r <= 2; r++) for (let q = Math.max(-2, -2 - r); q <= Math.min(2, 2 - r); q++) HEX_AXIAL.push([q, r]);
export const HEX_COUNT = HEX_AXIAL.length; // 19

export const HEX_XY = HEX_AXIAL.map(([q, r]) => ({ x: S3 * (q + r / 2), y: 1.5 * r }));

/** corner i of a pointy-top hex (i = 0 is the top, then clockwise) */
const corner = (i: number) => {
  const a = ((60 * i - 90) * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
};

const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

function build() {
  const pts = new Map<string, { x: number; y: number }>();
  for (const c of HEX_XY) {
    for (let i = 0; i < 6; i++) {
      const k = corner(i);
      const x = c.x + k.x;
      const y = c.y + k.y;
      pts.set(key(x, y), { x, y });
    }
  }
  const verts = [...pts.values()].sort((a, b) => (Math.abs(a.y - b.y) > 0.01 ? a.y - b.y : a.x - b.x));
  const index = new Map(verts.map((v, i) => [key(v.x, v.y), i]));
  const hexVerts = HEX_XY.map((c) =>
    Array.from({ length: 6 }, (_, i) => {
      const k = corner(i);
      return index.get(key(c.x + k.x, c.y + k.y))!;
    }),
  );
  const edgeIndex = new Map<string, number>();
  const edges: [number, number][] = [];
  const edgeHexes: number[][] = [];
  hexVerts.forEach((vs) => {
    for (let i = 0; i < 6; i++) {
      const a = vs[i];
      const b = vs[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edgeIndex.has(k)) {
        edgeIndex.set(k, -1);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    }
  });
  const mid = (e: [number, number]) => ({ x: (verts[e[0]].x + verts[e[1]].x) / 2, y: (verts[e[0]].y + verts[e[1]].y) / 2 });
  edges.sort((e1, e2) => {
    const a = mid(e1);
    const b = mid(e2);
    return Math.abs(a.y - b.y) > 0.01 ? a.y - b.y : a.x - b.x;
  });
  edges.forEach((e, i) => edgeIndex.set(`${e[0]}-${e[1]}`, i));
  edges.forEach(() => edgeHexes.push([]));
  const hexEdges = hexVerts.map((vs, h) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = vs[i];
      const b = vs[(i + 1) % 6];
      const e = edgeIndex.get(a < b ? `${a}-${b}` : `${b}-${a}`)!;
      edgeHexes[e].push(h);
      return e;
    }),
  );
  const vertHexes = verts.map(() => [] as number[]);
  hexVerts.forEach((vs, h) => vs.forEach((v) => vertHexes[v].push(h)));
  const vertEdges = verts.map(() => [] as number[]);
  const vertNeighbors = verts.map(() => [] as number[]);
  edges.forEach(([a, b], e) => {
    vertEdges[a].push(e);
    vertEdges[b].push(e);
    vertNeighbors[a].push(b);
    vertNeighbors[b].push(a);
  });
  const hexNeighbors = HEX_AXIAL.map(([q, r]) =>
    HEX_AXIAL.map(([q2, r2], i) => ({ i, d: Math.max(Math.abs(q - q2), Math.abs(r - r2), Math.abs(q + r - q2 - r2)) }))
      .filter((x) => x.d === 1)
      .map((x) => x.i),
  );
  // the coast, clockwise from the top-left
  const start = (-150 * Math.PI) / 180;
  const ang = (p: { x: number; y: number }) => {
    let a = Math.atan2(p.y, p.x) - start;
    while (a < 0) a += 2 * Math.PI;
    while (a >= 2 * Math.PI) a -= 2 * Math.PI;
    return a;
  };
  const coast = edges
    .map((e, i) => ({ i, m: mid(e) }))
    .filter((x) => edgeHexes[x.i].length === 1)
    .sort((a, b) => ang(a.m) - ang(b.m))
    .map((x) => x.i);
  return { verts, hexVerts, edges, edgeHexes, hexEdges, vertHexes, vertEdges, vertNeighbors, hexNeighbors, coast, mid };
}

const G = build();

export const VERT_XY = G.verts;
export const VERT_COUNT = G.verts.length; // 54
export const EDGES = G.edges;
export const EDGE_COUNT = G.edges.length; // 72
export const EDGE_XY = G.edges.map(G.mid);
export const HEX_VERTS = G.hexVerts;
export const HEX_EDGES = G.hexEdges;
export const VERT_HEXES = G.vertHexes;
export const VERT_EDGES = G.vertEdges;
export const VERT_NEIGHBORS = G.vertNeighbors;
export const EDGE_HEXES = G.edgeHexes;
export const HEX_NEIGHBORS = G.hexNeighbors;
/** the 30 coast paths, clockwise from the top-left */
export const COAST = G.coast;

/**
 * The 9 harbours: one coast path each, spaced 3, 3, 4 paths apart around the island like the printed
 * frame. `out` is the unit vector pointing out to sea (where the jetty is drawn).
 */
export const PORT_SLOTS = [0, 3, 6, 10, 13, 16, 20, 23, 26].map((k) => {
  const e = COAST[k];
  const h = EDGE_HEXES[e][0];
  const m = EDGE_XY[e];
  const dx = m.x - HEX_XY[h].x;
  const dy = m.y - HEX_XY[h].y;
  const l = Math.hypot(dx, dy);
  return { edge: e, verts: EDGES[e], hex: h, out: { x: dx / l, y: dy / l } };
});

/** The board's bounding box in R units, sea and harbours included. */
export const BOARD_BOX = { minX: -S3 * 2.5 - 0.95, maxX: S3 * 2.5 + 0.95, minY: -4 - 0.95, maxY: 4 + 0.95 };

/**
 * The official beginners' board, row by row from the top:
 * mountains 10, pasture 2, forest 9 / fields 12, hills 6, pasture 4, hills 10 /
 * fields 9, forest 11, desert, forest 3, mountains 8 / forest 8, mountains 3, fields 4, pasture 5 /
 * hills 5, fields 6, pasture 11.
 */
export const BEGINNER = {
  hexes: ['ore', 'sheep', 'wood', 'grain', 'brick', 'sheep', 'brick', 'grain', 'wood', 'desert', 'wood', 'ore', 'wood', 'ore', 'grain', 'sheep', 'brick', 'grain', 'sheep'] as CatanHexType[],
  nums: [10, 2, 9, 12, 6, 4, 10, 9, 11, null, 3, 8, 8, 3, 4, 5, 5, 6, 11] as (number | null)[],
  /** harbours clockwise from the top-left */
  ports: ['any', 'sheep', 'any', 'any', 'brick', 'wood', 'any', 'grain', 'ore'] as CatanPortKind[],
};

/** True if no two red numbers (6 and 8) are on neighbouring hexes. */
export function redsApart(nums: (number | null)[]): boolean {
  for (let h = 0; h < HEX_COUNT; h++) {
    if (!isRed(nums[h])) continue;
    for (const n of HEX_NEIGHBORS[h]) if (isRed(nums[n])) return false;
  }
  return true;
}
