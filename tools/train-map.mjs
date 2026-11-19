/**
 * Builds the outline of «قطار المغرب» (src/shared/train-outline.ts): the Morocco of «أين تقع؟»
 * (src/shared/ayna-map.ts, whole with its Sahara, no line inside it) bent onto the game's board, so the
 * crowded north gets room for its routes while the coastline and borders stay the real ones.
 *
 *   bun tools/train-map.mjs            (bun: it reads the cities from src/shared/train-map.ts)
 *
 * The bend is a thin-plate spline: every city is an anchor (its real place → its spot on the board),
 * with a few extra anchors on the corners of the borders. Only Morocco's land is drawn; the neighbours'
 * land around it is bent the same way and drawn faintly (LAND), clipped to the board by the app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AYNA_GEO, AYNA_LAND, AYNA_MOROCCO } from '../src/shared/ayna-map.ts';
import { BOARD_H, BOARD_W, CITIES } from '../src/shared/train-map.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = AYNA_GEO.morocco;
const project = (lon, lat) => [(lon - g.lonMin) * g.k * g.cos, (g.latMax - lat) * g.k];

/**
 * Extra anchors on the outline: the corners of the land borders and a few capes. Those without a board
 * spot get one from the cities around them (the affine fit of the nearest four), so the bend stays smooth.
 */
const EXTRA = [
  { lon: -5.93, lat: 35.79, x: 470, y: 40 }, // Cap Spartel
  { lon: -2.2, lat: 35.1 }, // the mouth of the Moulouya, by the Algerian border
  { lon: -1.18, lat: 32.9 },
  { lon: -3.6, lat: 30.9 },
  { lon: -5.6, lat: 29.6 },
  { lon: -8.67, lat: 28.4 },
  { lon: -8.67, lat: 27.67 },
  { lon: -8.67, lat: 26.0 },
  { lon: -12.0, lat: 26.0 },
  { lon: -12.0, lat: 23.45 },
  { lon: -13.1, lat: 21.33 },
  { lon: -16.95, lat: 21.33 },
  { lon: -9.85, lat: 31.0 }, // Cap Sim
  { lon: -15.2, lat: 24.6 },
];

const cityAnchors = CITIES.map((c) => {
  const [px, py] = project(c.lon, c.lat);
  return { px, py, x: c.x, y: c.y };
});

/** least-squares affine map from the nearest `k` anchors */
function localAffine(px, py, k = 4) {
  const near = cityAnchors
    .map((a) => ({ a, d: Math.hypot(a.px - px, a.py - py) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, k)
    .map((n) => n.a);
  // normal equations for [x y 1] → x', y'
  const fit = (key) => {
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const b = [0, 0, 0];
    for (const n of near) {
      const v = [n.px, n.py, 1];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j];
        b[i] += v[i] * n[key];
      }
    }
    for (let i = 0; i < 3; i++) A[i][i] += 1e-6;
    return solve(A, b);
  };
  const cx = fit('x');
  const cy = fit('y');
  return [cx[0] * px + cx[1] * py + cx[2], cy[0] * px + cy[1] * py + cy[2]];
}

const anchors = [
  ...cityAnchors,
  ...EXTRA.map((e) => {
    const [px, py] = project(e.lon, e.lat);
    const [x, y] = e.x === undefined ? localAffine(px, py) : [e.x, e.y];
    return { px, py, x, y };
  }),
];

/* ---------- thin-plate spline ---------- */
const U = (r2) => (r2 < 1e-9 ? 0 : r2 * Math.log(r2) * 0.5);
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function tps(pts, vals, lambda) {
  const n = pts.length;
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const dx = pts[i][0] - pts[j][0];
      const dy = pts[i][1] - pts[j][1];
      row.push(U(dx * dx + dy * dy) + (i === j ? lambda : 0));
    }
    row.push(1, pts[i][0], pts[i][1]);
    A.push(row);
  }
  for (let k = 0; k < 3; k++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(k === 0 ? 1 : pts[j][k - 1]);
    row.push(0, 0, 0);
    A.push(row);
  }
  const w = solve(A, [...vals, 0, 0, 0]);
  return (x, y) => {
    let v = w[n] + w[n + 1] * x + w[n + 2] * y;
    for (let i = 0; i < n; i++) {
      const dx = x - pts[i][0];
      const dy = y - pts[i][1];
      v += w[i] * U(dx * dx + dy * dy);
    }
    return v;
  };
}
const P = anchors.map((a) => [a.px, a.py]);
const fx = tps(
  P,
  anchors.map((a) => a.x),
  40,
);
const fy = tps(
  P,
  anchors.map((a) => a.y),
  40,
);
const warp = ([x, y]) => [fx(x, y), fy(x, y)];

/* ---------- paths ---------- */
function rings(d) {
  const out = [];
  let cur = null;
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([MLlz])([^MLlz]*)/g)) {
    const nums = (m[2].match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    if (m[1] === 'M') {
      x = nums[0];
      y = nums[1];
      cur = [[x, y]];
      out.push(cur);
      for (let i = 2; i < nums.length; i += 2) cur.push([(x = nums[i]), (y = nums[i + 1])]);
    } else if (m[1] === 'l') {
      for (let i = 0; i < nums.length; i += 2) cur.push([(x += nums[i]), (y += nums[i + 1])]);
    } else if (m[1] === 'L') {
      for (let i = 0; i < nums.length; i += 2) cur.push([(x = nums[i]), (y = nums[i + 1])]);
    }
  }
  return out;
}
/** more points along long edges, so the bend follows them */
function densify(ring, step) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a);
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let bi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > tol) {
      keep[bi] = true;
      stack.push([s, bi], [bi, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function toPath(rs, tol, minArea) {
  let d = '';
  for (const r of rs) {
    const w = dp(densify(r, 3).map(warp), tol).map(([x, y]) => [Math.round(x), Math.round(y)]);
    const area = Math.abs(w.reduce((s, p, i) => s + p[0] * w[(i + 1) % w.length][1] - w[(i + 1) % w.length][0] * p[1], 0)) / 2;
    if (w.length < 3 || area < minArea) continue;
    d += `M${w[0][0]} ${w[0][1]}l`;
    for (let i = 1; i < w.length; i++) d += `${i > 1 && w[i][0] - w[i - 1][0] >= 0 ? ' ' : ''}${w[i][0] - w[i - 1][0]}${w[i][1] - w[i - 1][1] >= 0 ? ' ' : ''}${w[i][1] - w[i - 1][1]}`;
    d += 'z';
  }
  return d.replace(/l /g, 'l');
}

const morocco = toPath(rings(AYNA_MOROCCO.morocco), 1.2, 40);
const land = toPath(rings(AYNA_LAND.morocco), 2, 200);

const out = `/**
 * «قطار المغرب» — the outline of the board, made by tools/train-map.mjs from the Morocco of «أين تقع؟»
 * (src/shared/ayna-map.ts) bent onto the board of src/shared/train-map.ts. Do not edit by hand.
 *
 * Morocco is drawn whole, with its Sahara (one shape, no line inside it).
 */

/** Morocco, whole with its Sahara (board units, ${BOARD_W} × ${BOARD_H}) */
export const TRAIN_MOROCCO =
  '${morocco}';

/** the land around it (the neighbours, drawn faintly under Morocco; clip it to the board) */
export const TRAIN_LAND =
  '${land}';
`;
writeFileSync(join(root, 'src/shared/train-outline.ts'), out);
// a fold in the bend would make the outline cross itself
function crossings(d) {
  let n = 0;
  for (const r of rings(d)) {
    for (let i = 0; i < r.length; i++)
      for (let j = i + 2; j < r.length; j++) {
        if (i === 0 && j === r.length - 1) continue;
        const [a, b, c, e] = [r[i], r[(i + 1) % r.length], r[j], r[(j + 1) % r.length]];
        const o = (p, q, t) => Math.sign((q[0] - p[0]) * (t[1] - p[1]) - (q[1] - p[1]) * (t[0] - p[0]));
        if (o(a, b, c) * o(a, b, e) < 0 && o(c, e, a) * o(c, e, b) < 0) n++;
      }
  }
  return n;
}
console.log('train-outline.ts', morocco.length, land.length, 'crossings', crossings(morocco));
