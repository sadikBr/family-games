/**
 * Builds the three maps of «أين تقع؟» (src/shared/ayna-map.ts) from Natural Earth (the public-domain
 * countries of the `world-atlas` npm package): المغرب (1:10m), العالم العربي and العالم (1:50m).
 *
 * The package is NOT a dependency of the app. Fetch it into a throw-away folder and pass the folder:
 *   mkdir /tmp/mapgen && cd /tmp/mapgen && npm pack world-atlas@2 && tar xzf world-atlas-2.0.2.tgz
 *   node tools/ayna-map.mjs /tmp/mapgen/package
 * Only its JSON data is read (no code of the package runs).
 *
 * The owner's rules for every map:
 * - Morocco is drawn whole, with its Sahara: the Natural Earth «W. Sahara» polygon is part of Morocco,
 *   and the line between them is never drawn.
 * - Palestine is one country (the «Israel» polygon is part of it, no line inside it).
 * - Somaliland is part of Somalia, «N. Cyprus» part of Cyprus (no lines inside them either).
 *
 * Each map has: LAND (every country's rings in ONE path: neighbours touch without a seam), BORDERS (the
 * lines between two different countries, open polylines), MOROCCO (Morocco's rings, for its highlight
 * and the tests). Arcs are simplified once, before rings are put together, so borders and coasts agree.
 * Projections (keep in sync with src/shared/games/ayna.ts): regional maps are equirectangular with a
 * standard parallel; the world map is Miller's cylindrical projection.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node tools/ayna-map.mjs <folder holding countries-50m.json and countries-10m.json>');
  process.exit(1);
}
const load = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

const rad = Math.PI / 180;
const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * rad));

/**
 * The maps. `k` = map units per degree (equirectangular) or per radian (Miller); `tol` = Douglas–Peucker
 * tolerance and `minArea` = smallest ring kept, both in map units.
 */
/** `padY`: land drawn beyond the top and bottom edges, as a share of the height. */
const MAPS = [
  { key: 'morocco', file: 'countries-10m.json', proj: 'eq', lonMin: -18.3, lonMax: -0.6, latMin: 20.3, latMax: 36.2, lat0: 28.3, k: 40, tol: 0.4, minArea: 6 },
  { key: 'arab', file: 'countries-50m.json', proj: 'eq', lonMin: -18, lonMax: 61, latMin: -3, latMax: 39, lat0: 20, k: 12, tol: 0.5, minArea: 3 },
  { key: 'world', file: 'countries-50m.json', proj: 'miller', lonMin: -180, lonMax: 180, latMin: -56, latMax: 78, k: 300, tol: 0.9, minArea: 6, padY: 0.18 },
];

/** Natural Earth polygons that belong to another country on these maps. */
const PART_OF = { '732': '504', 'W. Sahara': '504', '376': '275', Israel: '275', Somaliland: '706', 'N. Cyprus': '196' };
const MOROCCO = '504';
const SKIP = new Set(['010']); // Antarctica

function projector(m) {
  if (m.proj === 'eq') {
    const cos = Math.cos(m.lat0 * rad);
    return { cos, project: ([lon, lat]) => [(lon - m.lonMin) * m.k * cos, (m.latMax - lat) * m.k], w: (m.lonMax - m.lonMin) * m.k * cos, h: (m.latMax - m.latMin) * m.k };
  }
  const yTop = millerY(m.latMax);
  return {
    cos: 1,
    project: ([lon, lat]) => [(lon - m.lonMin) * rad * m.k, (yTop - millerY(Math.max(-85, Math.min(85, lat)))) * m.k],
    w: (m.lonMax - m.lonMin) * rad * m.k,
    h: (yTop - millerY(m.latMin)) * m.k,
  };
}

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
function simplifyArc(points, tol) {
  const n = points.length;
  const closed = n > 3 && points[0][0] === points[n - 1][0] && points[0][1] === points[n - 1][1];
  if (!closed) return simplify(points, tol);
  const mid = Math.floor(n / 2);
  return [...simplify(points.slice(0, mid + 1), tol).slice(0, -1), ...simplify(points.slice(mid), tol)];
}

/* Sutherland–Hodgman, one edge at a time (rings) */
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
function clipRing(points, x0, y0, x1, y1) {
  let p = points;
  p = clipEdge(p, (q) => q[0] >= x0, atX(x0));
  if (p.length) p = clipEdge(p, (q) => q[0] <= x1, atX(x1));
  if (p.length) p = clipEdge(p, (q) => q[1] >= y0, atY(y0));
  if (p.length) p = clipEdge(p, (q) => q[1] <= y1, atY(y1));
  return p;
}

/** A polyline cut into the pieces that lie inside the box (a point just outside is kept, the SVG clips it). */
function clipLine(points, x0, y0, x1, y1) {
  const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const out = [];
  let cur = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const keep = inside(p) || (i > 0 && inside(points[i - 1])) || (i + 1 < points.length && inside(points[i + 1]));
    if (keep) cur.push(p);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out.filter((l) => l.length >= 2);
}

/**
 * A ring that crosses the 180° meridian (Russia's far east, Fiji) jumps from one edge of the world map
 * to the other: move its western points a whole turn east, so it lies past the right edge and is clipped.
 */
function unwrap(points, w) {
  const jumps = points.some((p, i) => i > 0 && Math.abs(p[0] - points[i - 1][0]) > w / 2);
  return jumps ? points.map(([x, y]) => [x < w / 2 ? x + w : x, y]) : points;
}

/** A line that jumps across the world map (the 180° meridian) becomes two lines. */
function splitJumps(points, w) {
  const out = [[]];
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && Math.abs(points[i][0] - points[i - 1][0]) > w / 2) out.push([]);
    out[out.length - 1].push(points[i]);
  }
  return out;
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

/** "M12 34l3-2 5 0…" with integer coordinates; relative moves keep it short. `close` adds "z". */
function encode(points, close) {
  const pts = [];
  for (const [x, y] of points) {
    const q = [Math.round(x), Math.round(y)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
  }
  if (close) while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < (close ? 3 : 2)) return '';
  let s = `M${pts[0][0]} ${pts[0][1]}l`;
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    s += (first || dx < 0 ? '' : ' ') + dx + (dy < 0 ? '' : ' ') + dy;
    first = false;
  }
  return close ? `${s}z` : s;
}

function build(m) {
  const topo = load(m.file);
  const { project, w, h, cos } = projector(m);
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return project([x * sx + tx, y * sy + ty]);
    });
  });
  const simple = arcs.map((a) => simplifyArc(a, m.tol));
  const ring = (indexes) => {
    const out = [];
    for (const i of indexes) {
      const a = i < 0 ? simple[~i].slice().reverse() : simple[i];
      out.push(...(out.length ? a.slice(1) : a));
    }
    return out;
  };

  // which country (after the owner's merges) uses each arc
  const users = new Map();
  const geoms = topo.objects.countries.geometries.filter((g) => !SKIP.has(g.id));
  const unitOf = (g) => PART_OF[g.id] ?? PART_OF[g.properties?.name] ?? g.id ?? g.properties?.name;
  for (const g of geoms) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    for (const poly of polys) for (const r of poly) for (const i of r) {
      const k = i < 0 ? ~i : i;
      if (!users.has(k)) users.set(k, new Set());
      users.get(k).add(unitOf(g));
    }
  }

  // a margin around the visible box so the edges never show (wider above and below on the world map: the
  // app shows it in a taller frame, with sea above and below)
  const mx = w * 0.02;
  const my = h * (m.padY ?? 0.02);
  let land = '';
  let morocco = '';
  let rings = 0;
  for (const g of geoms) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    const isMorocco = unitOf(g) === MOROCCO;
    for (const poly of polys) {
      for (const r of poly) {
        const pts = clipRing(unwrap(ring(r), w), -mx, -my, w + mx, h + my);
        if (pts.length < 3 || area(pts) < m.minArea) continue;
        const d = encode(pts, true);
        if (!d) continue;
        land += d;
        rings++;
        if (isMorocco) morocco += d;
      }
    }
  }
  let borders = '';
  let lines = 0;
  for (const [k, who] of users) {
    if (who.size < 2) continue; // a coast, or a line inside one country (Morocco and its Sahara, Palestine…)
    for (const piece of splitJumps(simple[k], w).flatMap((l) => clipLine(l, -mx, -my, w + mx, h + my))) {
      const d = encode(piece, false);
      if (!d) continue;
      borders += d;
      lines++;
    }
  }
  console.log(`${m.key}: ${rings} rings, ${lines} border lines, land ${(land.length / 1024).toFixed(1)} KB, borders ${(borders.length / 1024).toFixed(1)} KB`);
  return { m, w, h, cos, land, borders, morocco };
}

const built = MAPS.map(build);
const geo = (b) =>
  `{ key: '${b.m.key}', proj: '${b.m.proj}', lonMin: ${b.m.lonMin}, lonMax: ${b.m.lonMax}, latMin: ${b.m.latMin}, latMax: ${b.m.latMax}, k: ${b.m.k}, cos: ${b.cos}, w: ${Math.round(b.w)}, h: ${Math.round(b.h)} }`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'ayna-map.ts');
const src = `/**
 * «أين تقع؟» — the three maps, generated by tools/ayna-map.mjs from Natural Earth (world-atlas:
 * Morocco at 1:10m, the Arab world and the world at 1:50m). Do not edit by hand.
 *
 * Morocco is drawn whole, with its Sahara (no line inside it); Palestine is one country.
 * Projection of each map: see aynaProject in ./games/ayna.ts. Paths are in map units (w × h).
 */

export type AynaMapKey = 'morocco' | 'arab' | 'world';

export interface AynaMapGeo {
  key: AynaMapKey;
  /** 'eq' = equirectangular (x = (lon − lonMin)·k·cos, y = (latMax − lat)·k); 'miller' = Miller cylindrical (k per radian) */
  proj: 'eq' | 'miller';
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  k: number;
  cos: number;
  w: number;
  h: number;
}

export const AYNA_GEO: Record<AynaMapKey, AynaMapGeo> = {
${built.map((b) => `  ${b.m.key}: ${geo(b)},`).join('\n')}
};

/** every country's land, one path per map */
export const AYNA_LAND: Record<AynaMapKey, string> = {
${built.map((b) => `  ${b.m.key}:\n    '${b.land}',`).join('\n')}
};

/** the lines between two countries (open polylines: stroke only) */
export const AYNA_BORDERS: Record<AynaMapKey, string> = {
${built.map((b) => `  ${b.m.key}:\n    '${b.borders}',`).join('\n')}
};

/** Morocco, whole with its Sahara */
export const AYNA_MOROCCO: Record<AynaMapKey, string> = {
${built.map((b) => `  ${b.m.key}:\n    '${b.morocco}',`).join('\n')}
};
`;
writeFileSync(out, src);
console.log(`wrote ${out}: ${(src.length / 1024).toFixed(1)} KB`);
