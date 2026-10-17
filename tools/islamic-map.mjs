/**
 * Builds the map of «أين المكان؟» (src/shared/mapquiz-map.ts) from real geography: the Natural Earth
 * countries of `world-atlas` (1:50m), projected with a simple equirectangular projection (true scale
 * at 30°N), clipped to the Islamic world, simplified and written as one compact SVG path.
 *
 * The two npm packages are NOT dependencies of the app. Install them in a throw-away folder and pass it:
 *   mkdir /tmp/mapgen && cd /tmp/mapgen && npm init -y && npm i world-atlas@2 topojson-client@3
 *   node tools/islamic-map.mjs /tmp/mapgen
 *
 * Arcs are simplified once, before rings are put together, so neighbouring countries keep exactly the
 * same border (no gaps or overlaps).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node tools/islamic-map.mjs <folder with world-atlas and topojson-client installed>');
  process.exit(1);
}
const require = createRequire(join(dir, 'package.json'));
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));

/* ------------------------------------------------------------------ */
/* Projection (keep in sync with the constants written below)          */
/* ------------------------------------------------------------------ */

/** the area covered by the data: a margin around every region of the game */
const LON_MIN = -25;
const LON_MAX = 85;
const LAT_MIN = -12;
const LAT_MAX = 58;
/** map units per degree of latitude */
const K = 10;
/** equirectangular with standard parallel 30°N: a degree of longitude is cos(30°) of a degree of latitude */
const COS = Math.cos((30 * Math.PI) / 180);
const W = Math.round((LON_MAX - LON_MIN) * K * COS);
const H = (LAT_MAX - LAT_MIN) * K;
const project = ([lon, lat]) => [(lon - LON_MIN) * K * COS, (LAT_MAX - lat) * K];

/** Douglas–Peucker tolerance in map units (0.5 unit = 0.05° of latitude, about 5 km) */
const TOLERANCE = 0.5;
/** rings smaller than this (in square map units) are dropped: specks of islands */
const MIN_AREA = 3;

/* ------------------------------------------------------------------ */
/* Arcs                                                                */
/* ------------------------------------------------------------------ */

const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
/** absolute lon/lat arcs, projected */
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return project([x * sx + tx, y * sy + ty]);
  });
});

function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > best) {
        best = d;
        at = i;
      }
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** A closed arc (an island) has the same first and last point: split it so its shape survives. */
function simplifyArc(points) {
  const n = points.length;
  const closed = n > 3 && points[0][0] === points[n - 1][0] && points[0][1] === points[n - 1][1];
  if (!closed) return simplify(points, TOLERANCE);
  const mid = Math.floor(n / 2);
  return [...simplify(points.slice(0, mid + 1), TOLERANCE).slice(0, -1), ...simplify(points.slice(mid), TOLERANCE)];
}

const simple = arcs.map(simplifyArc);

function ring(indexes) {
  const out = [];
  for (const i of indexes) {
    const a = i < 0 ? simple[~i].slice().reverse() : simple[i];
    out.push(...(out.length ? a.slice(1) : a));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Clipping to the data area (Sutherland–Hodgman, one edge at a time)  */
/* ------------------------------------------------------------------ */

function clipEdge(points, inside, cross) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prev = points[(i + points.length - 1) % points.length];
    const cIn = inside(cur);
    const pIn = inside(prev);
    if (cIn) {
      if (!pIn) out.push(cross(prev, cur));
      out.push(cur);
    } else if (pIn) out.push(cross(prev, cur));
  }
  return out;
}

const atX = (x) => (p, q) => [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])];
const atY = (y) => (p, q) => [p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]), y];

function clip(points) {
  let p = points;
  p = clipEdge(p, (q) => q[0] >= 0, atX(0));
  if (p.length) p = clipEdge(p, (q) => q[0] <= W, atX(W));
  if (p.length) p = clipEdge(p, (q) => q[1] >= 0, atY(0));
  if (p.length) p = clipEdge(p, (q) => q[1] <= H, atY(H));
  return p;
}

function area(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

/* ------------------------------------------------------------------ */
/* Path                                                                */
/* ------------------------------------------------------------------ */

/** "M12 34l3-2 5 0…z" with integer coordinates; relative moves keep it short. */
function encode(points) {
  const pts = [];
  for (const [x, y] of points) {
    const q = [Math.round(x), Math.round(y)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
  }
  while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 3) return '';
  let s = `M${pts[0][0]} ${pts[0][1]}l`;
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    s += (first || dx < 0 ? '' : ' ') + dx + (dy < 0 ? '' : ' ') + dy;
    first = false;
  }
  return `${s}z`;
}

let path = '';
let rings = 0;
for (const g of topo.objects.countries.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  for (const poly of polys) {
    for (const r of poly) {
      const pts = clip(ring(r));
      if (pts.length < 3 || area(pts) < MIN_AREA) continue;
      const d = encode(pts);
      if (!d) continue;
      path += d;
      rings++;
    }
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'mapquiz-map.ts');
const src = `/**
 * «أين المكان؟» — the map: the countries of the Islamic world as one SVG path, generated by
 * tools/islamic-map.mjs from Natural Earth (world-atlas, 1:50m). Do not edit by hand.
 *
 * Projection: equirectangular, true scale at 30°N. x = (lon − MAP_LON_MIN) × MAP_K × MAP_COS,
 * y = (MAP_LAT_MAX − lat) × MAP_K, in map units (MAP_W × MAP_H).
 */

export const MAP_LON_MIN = ${LON_MIN};
export const MAP_LON_MAX = ${LON_MAX};
export const MAP_LAT_MIN = ${LAT_MIN};
export const MAP_LAT_MAX = ${LAT_MAX};
export const MAP_K = ${K};
export const MAP_COS = ${COS};
export const MAP_W = ${W};
export const MAP_H = ${H};

/** ${rings} rings */
export const MAP_PATH =
  '${path}';
`;
writeFileSync(out, src);
console.log(`wrote ${out}: ${rings} rings, ${(src.length / 1024).toFixed(1)} KB`);
