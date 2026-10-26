/**
 * «المثلثات» — the digital «Chain Triangle» (rubber-band triangle chess): the types shared by the server
 * and the app (settings, the view each phone gets), the board geometry, the default settings and the
 * game's card on the home screen.
 *
 * Board: a hexagon of side N (3 «صغير» or 4 «كبير») of pegs on a triangular lattice. A peg has axial
 * coordinates (q, r) with |q|, |r|, |q + r| ≤ N; on screen x = q + r/2, y = r·√3/2 (rows are horizontal,
 * the hexagon has a flat top and bottom). The three lattice directions are (1,0), (0,1) and (−1,1).
 * - A «unit edge» joins two neighbouring pegs: 9N² + 3N of them (90 / 156).
 * - A «unit triangle» is the smallest triangle of three neighbouring pegs: 6N² of them (54 / 96).
 * - A «band» (a move) is a straight segment from one peg to another along one lattice direction, 1 to
 *   `band` units long. It covers every unit edge on its way and must cover at least one new one
 *   (it may pass over edges already covered).
 * - A unit triangle whose three edges are covered goes to the player whose band covered the last of
 *   them; with «دور إضافي عند الإكمال» that player plays again. When every edge is covered, the most
 *   triangles wins (a tie is allowed).
 *
 * Indexing: pegs row by row (r from −N to N, q increasing); edges in peg order, each peg's forward
 * neighbours (1,0), (0,1), (−1,1); triangles row by row, «up» (q,r),(q+1,r),(q,r+1) and «down»
 * (q+1,r),(q,r+1),(q+1,r+1).
 */

export const TRI_SIZES = [3, 4] as const;
export const TRI_BANDS = [1, 2, 3] as const;

export interface TrianglesSettings {
  /** hexagon side: 3 (small) or 4 (big) */
  size: number;
  /** the longest band, in units (1 = like «المربعات», 3 = like the toy) */
  band: number;
  /** completing a triangle gives another turn */
  bonus: boolean;
}

export const TRIANGLES_DEFAULTS: TrianglesSettings = { size: 3, band: 2, bonus: true };

/** A band on the board: its two pegs and the seat that stretched it. */
export type TriBand = [a: number, b: number, seat: number];

export interface TrianglesView {
  game: 'triangles';
  phase: 'play' | 'final';
  /** hexagon side */
  size: number;
  /** the longest band allowed */
  band: number;
  bonus: boolean;
  /** everyone who started, in turn order (a seat's index picks its colour) */
  seats: string[];
  /** names captured at the start (a player who left is no longer in the room) */
  names: Record<string, string>;
  /** seats still playing */
  active: string[];
  turn: string | null;
  /** per unit edge: -1 = free, else the seat whose band covered it first */
  edges: number[];
  /** every band stretched so far, in order */
  bands: TriBand[];
  /** per unit triangle: -1 = open, else the seat index of its owner */
  tris: number[];
  /** the last band's index in `bands` */
  last: number | null;
  /** triangles completed by the last band */
  lastTris: number[];
  /** triangles per player in this game */
  points: Record<string, number>;
  winners: string[] | null;
  /** how the game ended: every edge covered, or everyone else left / resigned */
  reason: 'full' | 'forfeit' | null;
  /** games won in this series (same group of players in the same room) */
  score: Record<string, number>;
  /** my seat index (-1: watching) */
  me: number;
}

export const TRIANGLES_INFO = {
  title: 'المثلثات',
  tagline: 'شُدّ الأشرطة بين الأوتاد وأكمل المثلثات… كل مثلث لك!',
  color: '#E0873A',
  maxPlayers: 4,
  howTo: [
    'لوحة سداسية من الأوتاد. بالدور، كل لاعب يشدّ شريطاً مطاطياً في خط مستقيم بين وتدين: اسحب من وتد إلى آخر على أحد الاتجاهات الثلاثة، أو المس الوتدين واحداً بعد الآخر.',
    'يغطي الشريط كل الأضلاع الصغيرة التي يمرّ عليها (وحدة أو وحدتان أو ثلاث حسب الإعدادات)، ويجب أن يغطي ضلعاً جديداً واحداً على الأقل.',
    'من يغطي الضلع الثالث لمثلث صغير يأخذه (يتلوّن بلونه) ويلعب مرة أخرى. وقد يُكمل شريط واحد عدة مثلثات معاً.',
    'احذر أن تغطي الضلع الثاني لمثلث: من بعدك سيكمله ويواصل!',
    'تنتهي اللعبة حين تُغطّى كل الأضلاع، والفائز صاحب أكثر المثلثات. من ٢ إلى ٤ لاعبين، ويمكن إضافة بوتات.',
  ],
};

/** The card's text when the room plays without the extra turn. */
export function trianglesVariant(s: TrianglesSettings | undefined) {
  if (!s || s.bonus !== false) return null;
  return {
    tagline: 'شُدّ الأشرطة وأكمل المثلثات… بلا دور إضافي: كل حركة محسوبة!',
    howTo: TRIANGLES_INFO.howTo.map((t, i) =>
      i === 2 ? 'من يغطي الضلع الثالث لمثلث صغير يأخذه (يتلوّن بلونه)، ثم ينتقل الدور كالعادة: لا دور إضافي في هذه الغرفة.' : t,
    ),
  };
}

/** The six lattice directions (axial): the three forward ones first. */
export const TRI_DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export interface TriSeg {
  a: number;
  b: number;
  /** the unit edges it covers, from a to b */
  edges: number[];
}

export interface TriGeometry {
  n: number;
  /** pegs: axial (q, r) and screen position in units (x = q + r/2, y = r·√3/2, centre at 0) */
  pts: { q: number; r: number; x: number; y: number }[];
  /** unit edges: their two pegs */
  edges: [number, number][];
  /** unit triangles: their three pegs and three edges */
  tris: { pts: [number, number, number]; edges: [number, number, number] }[];
  /** per edge: the one or two triangles it borders */
  edgeTris: number[][];
  /** every straight band of 1–3 units inside the board (one per pair of end pegs, a < b), shortest first */
  segs: TriSeg[];
  /** peg index at (q, r), or -1 */
  at(q: number, r: number): number;
  /** edge between two neighbouring pegs, or -1 */
  edgeOf(a: number, b: number): number;
}

const cache = new Map<number, TriGeometry>();

export function triGeometry(n: number): TriGeometry {
  const hit = cache.get(n);
  if (hit) return hit;
  const inside = (q: number, r: number) => Math.abs(q) <= n && Math.abs(r) <= n && Math.abs(q + r) <= n;
  const pts: TriGeometry['pts'] = [];
  const index = new Map<string, number>();
  for (let r = -n; r <= n; r++)
    for (let q = -n; q <= n; q++) {
      if (!inside(q, r)) continue;
      index.set(`${q},${r}`, pts.length);
      pts.push({ q, r, x: q + r / 2, y: (r * Math.sqrt(3)) / 2 });
    }
  const at = (q: number, r: number) => index.get(`${q},${r}`) ?? -1;
  const edges: [number, number][] = [];
  const eIndex = new Map<number, number>();
  const ekey = (a: number, b: number) => (a < b ? a * 4096 + b : b * 4096 + a);
  pts.forEach((p, i) => {
    for (const [dq, dr] of TRI_DIRS.slice(0, 3)) {
      const j = at(p.q + dq, p.r + dr);
      if (j < 0) continue;
      eIndex.set(ekey(i, j), edges.length);
      edges.push([i, j]);
    }
  });
  const edgeOf = (a: number, b: number) => eIndex.get(ekey(a, b)) ?? -1;
  const tris: TriGeometry['tris'] = [];
  const edgeTris: number[][] = edges.map(() => []);
  const addTri = (a: number, b: number, c: number) => {
    if (a < 0 || b < 0 || c < 0) return;
    const es: [number, number, number] = [edgeOf(a, b), edgeOf(b, c), edgeOf(a, c)];
    for (const e of es) edgeTris[e].push(tris.length);
    tris.push({ pts: [a, b, c], edges: es });
  };
  for (let r = -n; r <= n; r++)
    for (let q = -n - 1; q <= n; q++) {
      // the «down» triangle's pegs may start right of a peg that is off the board
      addTri(at(q, r), at(q + 1, r), at(q, r + 1));
      addTri(at(q + 1, r), at(q, r + 1), at(q + 1, r + 1));
    }
  const segs: TriSeg[] = [];
  for (let len = 1; len <= 3; len++)
    pts.forEach((p, i) => {
      for (const [dq, dr] of TRI_DIRS.slice(0, 3)) {
        const way = [i];
        for (let k = 1; k <= len; k++) way.push(at(p.q + dq * k, p.r + dr * k));
        if (way.some((x) => x < 0)) continue;
        const a = i, b = way[len];
        segs.push({ a: Math.min(a, b), b: Math.max(a, b), edges: way.slice(1).map((x, k) => edgeOf(way[k], x)) });
      }
    });
  const g: TriGeometry = { n, pts, edges, tris, edgeTris, segs, at, edgeOf };
  cache.set(n, g);
  return g;
}

/** Counts for a hexagon of side n: pegs 3n²+3n+1, unit edges 9n²+3n, unit triangles 6n². */
export const triCounts = (n: number) => ({ pts: 3 * n * n + 3 * n + 1, edges: 9 * n * n + 3 * n, tris: 6 * n * n });

/**
 * The unit edges a band from peg a to peg b covers, or why it isn't a band: 'same' (one peg),
 * 'line' (not along a lattice direction), 'long' (longer than `max` units).
 */
export function triBandEdges(g: TriGeometry, a: number, b: number, max: number): number[] | 'same' | 'line' | 'long' {
  const pa = g.pts[a], pb = g.pts[b];
  if (!pa || !pb) return 'line';
  if (a === b) return 'same';
  const dq = pb.q - pa.q, dr = pb.r - pa.r;
  for (const [uq, ur] of TRI_DIRS) {
    const k = uq ? dq / uq : dr / ur;
    if (!Number.isInteger(k) || k < 1 || uq * k !== dq || ur * k !== dr) continue;
    if (k > max) return 'long';
    const out: number[] = [];
    for (let i = 0; i < k; i++) out.push(g.edgeOf(g.at(pa.q + uq * i, pa.r + ur * i), g.at(pa.q + uq * (i + 1), pa.r + ur * (i + 1))));
    return out.every((e) => e >= 0) ? out : 'line';
  }
  return 'line';
}
