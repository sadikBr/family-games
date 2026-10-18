// The Moroccan «الكارطة» deck: Spanish suits (coins, cups, swords, clubs; 1–7, 10, 11, 12) in the
// traditional printed style — white card, thin black frame with the «pintas», flat red / blue / yellow
// with black outlines and line hatching. Our own drawing of the centuries-old pattern (200×300).
import { GLYPHS } from './glyphs.mjs';

const W = 200, H = 300;
const INK = '#1E1B18';
const RED = '#E1333F', BLUE = '#2E8FD6', YEL = '#F6D433';
const GOLD = '#86701F'; // the coins' brownish-gold line
const PAPER = '#FAFAF5';
const SKIN = '#FDF5EA';
const WOOD = '#FCEFC2'; // the cut ends of the clubs
const OUT = 1.7, THIN = 0.85;
const GAPS = { coins: 0, cups: 1, swords: 2, clubs: 3 };

let uid = 0;
const nid = (p) => `${p}${++uid}`;
const f = (v) => +v.toFixed(2);

/* ---------------- drawing helpers (all strokes explicit, data-flat: no mascot pass) ---------------- */
const P = (d, fill = 'none', sw = OUT, stroke = INK) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
const L = (d, sw = THIN, color = INK) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(sw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
const CI = (x, y, r, fill, sw = OUT, stroke = INK) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
const EL = (x, y, rx, ry, fill, sw = OUT, stroke = INK) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
const at = (x, y, s, rot, body) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})">${body}</g>`;
/** an outlined tube (arms, legs, horse legs) */
const tube = (d, color, w, sw = OUT) => L(d, w + 2 * sw, INK) + L(d, w, color);
/** parallel hatching lines clipped to a shape */
function hatch(clipD, [x0, y0, x1, y1], step, ang = 0, sw = THIN, color = INK) {
  const id = nid('h');
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + step;
  let d = '';
  for (let x = -R; x <= R; x += step) d += `M${f(cx + x)} ${f(cy - R)}V${f(cy + R)}`;
  return `<clipPath id="${id}"><path d="${clipD}"/></clipPath><g clip-path="url(#${id})"><g transform="rotate(${ang} ${f(cx)} ${f(cy)})">${L(d, sw, color)}</g></g>`;
}
function star(n, ro, ri, rot = -90) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = ((rot + (i * 180) / n) * Math.PI) / 180;
    d += `${i ? 'L' : 'M'}${f(r * Math.cos(a))} ${f(r * Math.sin(a))}`;
  }
  return d + 'Z';
}
/** text from the serif index glyphs; anchor 'start' | 'middle' */
function label(str, x, y, size, anchor = 'start', color = INK) {
  const glyphs = [...str].map((ch) => GLYPHS[ch]);
  const track = str.length > 1 ? -0.04 : 0;
  const width = glyphs.reduce((s, g) => s + g.w + track, -track);
  let cx = anchor === 'middle' ? -width / 2 : 0;
  let body = '';
  for (const g of glyphs) {
    body += `<path d="${g.d}" transform="translate(${f(cx)} 0)"/>`;
    cx += g.w + track;
  }
  return { svg: `<g transform="translate(${f(x)} ${f(y)}) scale(${size})" fill="${color}">${body}</g>`, width: width * size };
}

/* ---------------- the suit symbols (local coordinates, centred on 0 0) ---------------- */

/** a knobbly wooden cudgel, wide end up, about 104 long */
export function club(c = RED, s = 1, knot) {
  const o = OUT / s, t = THIN / s;
  const k = knot ?? (c === BLUE ? RED : BLUE);
  const body = 'M-11 -44 C-16 -34 -15.5 -16 -11.5 0 C-8.5 14 -6 32 -5 48 C-3 51.5 3 51.5 5 48 C6 32 8.5 14 11.5 0 C15.5 -16 16 -34 13 -48 Z';
  return (
    P(body, c, o) +
    L('M8.6 -40 C12 -26 11 -12 8 2 C6 16 4.6 32 3.6 46 M11.6 -42 C14.6 -28 13.6 -12 10.4 2 C8.4 16 6.6 32 5.4 44', t) +
    L('M-9.5 -30 C-11.4 -16 -9 -2 -7 12', t * 0.9) +
    [[-15.2, -24], [12.6, -6], [-8.6, 20]].map(([x, y]) => CI(x, y, 4.3, k, o) + CI(x, y, 1.5, INK, 0)).join('') +
    `<g transform="translate(1 -46) rotate(-9)">${EL(0, 0, 12, 3.6, WOOD, o) + EL(0, 0, 5, 1.4, 'none', t)}</g>`
  );
}

/** a straight blue sword, hilt up, about 120 long */
export function sword(s = 1, grip = RED) {
  const o = OUT / s, t = THIN / s;
  return (
    P('M-5.2 -33 L5.2 -33 L4.4 45 L0 60 L-4.4 45 Z', BLUE, o) +
    L('M0 -31 V54', t) +
    P('M-3.8 -38 C-5.6 -43 -5.6 -48 -3.4 -53 L3.4 -53 C5.6 -48 5.6 -43 3.8 -38 Z', grip, o) +
    L('M-4.6 -42.5 H4.6 M-4.8 -47.5 H4.8', t) +
    P('M-15 -35.5 C-15 -39.5 -11 -40 -8 -38.5 H8 C11 -40 15 -39.5 15 -35.5 C15 -32 11 -31.5 8 -33 H-8 C-11 -31.5 -15 -32 -15 -35.5 Z', YEL, o) +
    CI(-16.4, -35.6, 2.6, YEL, o) + CI(16.4, -35.6, 2.6, YEL, o) +
    CI(0, -57.5, 4.4, YEL, o) + CI(0, -57.5, 1.4, INK, 0)
  );
}

/** a gold coin with its sun ring, radius r */
export function coin(r = 20, sw = OUT) {
  const k = r / 20;
  return (
    CI(0, 0, r, YEL, sw * 1.05, GOLD) +
    `<path d="${star(16, r * 0.88, r * 0.66, -90)}" fill="${GOLD}"/>` +
    CI(0, 0, r * 0.62, YEL, sw * 0.8, GOLD) +
    `<path d="${star(8, r * 0.46, r * 0.17, -90)}" fill="${GOLD}"/>` +
    CI(0, 0, r * 0.11, YEL, 0) +
    (k > 1.6 ? CI(0, 0, r * 0.94, 'none', sw * 0.5, GOLD) : '')
  );
}

/** a banded goblet on a blue foot, about 46 wide */
export function cup(s = 1) {
  const o = OUT / s, t = THIN / s;
  const bowl = 'M-22 -14 V-2 C-14 4 14 4 22 -2 V-14 Z';
  return (
    P('M-16.5 16 H16.5 V21 H-16.5 Z', RED, o) +
    P('M-5.5 1 C-5.5 7 -9 9 -14 10.5 C-19 12 -19.5 16 -15 16 H15 C19.5 16 19 12 14 10.5 C9 9 5.5 7 5.5 1 Z', BLUE, o) +
    L('M-6 15.6 C-6.6 12.6 -4.4 10 -1.4 8.4 M6 15.6 C6.6 12.6 4.4 10 1.4 8.4', t) +
    P(bowl, YEL, o) +
    hatch(bowl, [-22, -16, 22, 4], 3.4, 35, t) +
    P('M-22 -8.5 C-14 -4 14 -4 22 -8.5', 'none', t * 1.4) +
    EL(0, -14, 22, 6, RED, o) +
    hatch('M-22 -14 A22 6 0 0 1 22 -14 A22 6 0 0 1 -22 -14 Z', [-22, -20, 22, -8], 2.8, -30, t * 0.9) +
    EL(0, -14, 15, 3.4, 'none', t)
  );
}

/** a little flower on a stem (ornament of the 3 of clubs, 2/4 of cups, swords…) */
function flower(petal = RED, s = 1, stem = true, leaf = BLUE) {
  const o = OUT / s, t = THIN / s;
  let g = '';
  if (stem) {
    g += L('M0 4 C1 10 -1 16 0 22', o);
    g += P('M0 14 C-4 8 -11 8 -13 11 C-10 15 -4 16 0 14 Z', leaf, o) + P('M0 17 C4 11 11 11 13 14 C10 18 4 19 0 17 Z', leaf, o);
  }
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    g += CI(4.6 * Math.cos(a), 4.6 * Math.sin(a), 3.8, petal, o);
  }
  return g + CI(0, 0, 2.8, YEL, o) + CI(0, 0, 0.9, INK, 0) + (t ? '' : '');
}

/* ---------------- card furniture ---------------- */

/** a light paper speckle, the same on every card of a name */
function speckle(seed) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  let d = '';
  for (let i = 0; i < 260; i++) {
    const px = 6 + rnd() * 188, py = 6 + rnd() * 288, r = 0.25 + rnd() * 0.45;
    d += `M${f(px - r)} ${f(py)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
  }
  return `<path d="${d}" fill="#C9C3B2" opacity="0.55"/>`;
}

const FX0 = 13, FX1 = 187, FY0 = 13, FY1 = 287; // the frame
const IDX = 27; // index size

function frameAndIndex(suit, text, size = IDX) {
  const lab = label(text, 8, 8 + size * 0.87, size);
  const tx = 8 + lab.width + 3.5; // the top line starts after the number
  const g = GAPS[suit], gw = 9, gs = 6;
  const line = (y, x0, x1) => {
    if (!g) return `M${f(x0)} ${y}H${f(x1)}`;
    const total = g * gw + (g - 1) * gs, start = 100 - total / 2;
    let d = `M${f(x0)} ${y}H${start}`;
    for (let i = 0; i < g; i++) {
      const a = start + i * (gw + gs) + gw;
      d += `M${a} ${y}H${i === g - 1 ? f(x1) : a + gs}`;
    }
    return d;
  };
  const d = line(FY0, tx, FX1) + line(FY1, W - tx, FX0) + `M${FX0} ${f(13 + size * 0.93)}V${FY1}M${FX1} ${FY0}V${f(H - 13 - size * 0.93)}`;
  return L(d, 1.5) + lab.svg + `<g transform="rotate(180 100 150)">${lab.svg}</g>`;
}

function shell(name, suit, text, art, size = IDX) {
  const seed = [...name].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) % 9973;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><clipPath id="paper"><rect x="1.5" y="1.5" width="197" height="297" rx="12"/></clipPath></defs><g data-flat>
    <rect x="1.5" y="1.5" width="197" height="297" rx="12" fill="${PAPER}"/>
    <g clip-path="url(#paper)">${speckle(seed)}</g>
    ${frameAndIndex(suit, text, size)}
    ${art}
    <rect x="1.5" y="1.5" width="197" height="297" rx="12" fill="none" stroke="#B5AE9C" stroke-width="1.4"/>
  </g></svg>`;
}

/* ---------------- pip layouts ---------------- */
const CLUB_COLORS = [RED, BLUE, YEL];
const rows = (spec) => spec.flatMap(([y, xs]) => xs.map((x) => [x, y]));

function clubsArt(n) {
  const C = (x, y, s, rot, c, k) => at(x, y, s, rot, club(c, s, k));
  switch (n) {
    case 1: {
      // one big gnarled club with cut-off branches
      const stub = (x, y, a, len, w, bend) =>
        at(x, y, 1, a, P(`M${-w} 4 C${-w} ${-len * 0.5} ${bend - w * 0.9} ${-len * 0.75} ${bend - w * 0.75} ${-len} L${bend + w * 0.75} ${-len} C${bend + w * 0.9} ${-len * 0.75} ${w} ${-len * 0.5} ${w} 4 Z`, BLUE) +
          EL(bend, -len, w * 0.75, w * 0.3, WOOD) + L(`M${w * 0.45} 0 C${w * 0.45} ${-len * 0.5} ${bend + w * 0.4} ${-len * 0.75} ${bend + w * 0.35} ${-len + 2}`));
      const body = 'M-23 -100 C-30 -70 -22 -42 -18 -12 C-15 12 -18 40 -13 68 C-11 86 -10 98 -9 106 C-4 111 4 111 9 106 C10 94 12 78 13 62 C16 34 14 10 18 -12 C22 -42 30 -70 23 -100 Z';
      const branches = stub(-20, -64, -58, 28, 8.5, -6) + stub(-16, -12, -74, 24, 8, 6) + stub(-13, 40, -56, 20, 7, -5) + stub(21, -40, 62, 28, 8.5, 6) + stub(15, 12, 72, 22, 8, -6) + stub(11, 66, 56, 18, 6.5, 4);
      return at(106, 150, 1, 24,
        branches + P(body, RED, 2) + L('M14 -94 C20 -70 14 -40 11 -12 C9 14 10 40 6 68 C5 84 4 96 3.4 104 M19 -96 C26 -70 19 -40 15 -12 C13 14 14 40 10 66', 0.9) +
          L('M-16 -80 C-20 -60 -14 -36 -12 -14', 0.9) +
          [[-24, -36, 6], [17, -66, 5], [-14, 64, 5], [14, 36, 5]].map(([x, y, r]) => CI(x, y, r, YEL) + CI(x, y, 1.8, INK, 0)).join('') +
          EL(0, -100, 23, 8, WOOD, 2) + EL(0, -100, 14, 4.6, 'none', 0.9) + EL(0, -100, 6, 2, 'none', 0.9));
    }
    case 2:
      return C(100, 150, 2.0, -22, RED) + C(100, 150, 2.0, 22, BLUE);
    case 3:
      return at(42, 150, 1.25, 0, flower(RED, 1.25)) + at(158, 150, 1.25, 0, flower(BLUE, 1.25, true, RED)) + C(100, 150, 1.9, -32, BLUE) + C(100, 150, 1.9, 32, RED) + C(100, 150, 1.9, 0, YEL);
    case 4:
      return at(100, 146, 1.35, 0, flower(RED, 1.35)) + C(62, 84, 1.0, -26, RED) + C(138, 84, 1.0, 26, BLUE) + C(62, 216, 1.0, 206, BLUE) + C(138, 216, 1.0, 154, RED);
    case 5:
      return C(64, 78, 0.98, -38, BLUE) + C(136, 78, 0.98, 38, RED) + C(100, 150, 0.98, 90, YEL) + C(64, 222, 0.98, 218, RED) + C(136, 222, 0.98, 142, BLUE);
    case 6:
      return rows([[84, [52, 100, 148]], [216, [52, 100, 148]]]).map(([x, y], i) => C(x, y, 0.98, i % 2 ? 7 : -7, CLUB_COLORS[i % 3])).join('');
    case 7:
      return rows([[78, [52, 100, 148]], [222, [52, 100, 148]]]).map(([x, y], i) => C(x, y, 0.86, i % 2 ? 7 : -7, CLUB_COLORS[i % 3])).join('') + C(100, 150, 0.9, 90, RED, YEL);
  }
}

function swordsArt(n) {
  const S = (x, y, s, rot, grip) => at(x, y, s, rot, sword(s, grip));
  switch (n) {
    case 1: {
      const s = 1.95;
      const o = OUT / s, t = THIN / s;
      // a red ribbon with yellow leaves that winds round the blade
      const rib = 'M-26 -26 C-10 -34 14 -24 12 -10 C10 2 -12 2 -12 14 C-12 26 6 32 14 40';
      const leaves = [[-18, -30, -20], [2, -28, 30], [12, -16, 80], [-4, 0, 160], [-12, 12, 100], [-6, 26, 40], [8, 36, 50]]
        .map(([x, y, a]) => at(x, y, 1, a, P('M0 0 C2 -4 6 -5 9 -4 C7 -1 4 1 0 0 Z', YEL, o))).join('');
      const ribbon = (front) => (front ? '' : tube(rib, RED, 6 / s * 1.4, o) + L(rib, t, INK)) + leaves;
      return at(100, 150, s, 28, ribbon(false) + sword(s, RED) + `<g clip-path="url(#ribfront)">${tube(rib, RED, 6 / s * 1.4, o)}</g><clipPath id="ribfront"><path d="M-40 -40 H40 V-4 H-40 Z"/></clipPath>` + at(-26, -27, 1, 0, flower(RED, s, false)));
    }
    case 2:
      return S(70, 150, 1.85, 180) + S(130, 150, 1.85, 0);
    case 3:
      return S(54, 150, 1.8, 0) + S(100, 150, 1.8, 180) + S(146, 150, 1.8, 0);
    case 4: {
      const fl = at(100, 44, 1.2, 0, flower(RED, 1.2)) + at(100, 238, 1.2, 0, flower(BLUE, 1.2, true, RED)) + at(40, 140, 1.05, 0, flower(BLUE, 1.05, true, RED)) + at(160, 140, 1.05, 0, flower(RED, 1.05));
      return fl + S(76, 150, 1.5, -24) + S(124, 150, 1.5, 156) + S(124, 150, 1.5, 24) + S(76, 150, 1.5, 204);
    }
    case 5:
      return at(100, 72, 1.15, 0, flower(RED, 1.15)) + at(100, 206, 1.15, 0, flower(BLUE, 1.15, true, RED)) + S(48, 84, 0.86, 0) + S(152, 84, 0.86, 0) + S(48, 216, 0.86, 180) + S(152, 216, 0.86, 180) + S(100, 150, 0.8, 90);
    case 6:
      return rows([[84, [54, 100, 146]], [216, [54, 100, 146]]]).map(([x, y]) => S(x, y, 0.98, 0)).join('');
    case 7:
      return rows([[82, [52, 100, 148]], [218, [52, 100, 148]]]).map(([x, y]) => S(x, y, 0.84, 0)).join('') + S(100, 150, 1.0, 90);
  }
}

const COIN_POS = {
  2: [[100, 88, 40], [100, 212, 40]],
  3: [[130, 70, 33], [70, 150, 33], [130, 230, 33]],
  4: [[62, 74, 28], [138, 74, 28], [62, 226, 28], [138, 226, 28]],
  5: [[60, 70, 27], [140, 70, 27], [100, 150, 40], [60, 230, 27], [140, 230, 27]],
  6: [[64, 66, 29], [136, 66, 29], [64, 150, 29], [136, 150, 29], [64, 234, 29], [136, 234, 29]],
  7: [[60, 62, 26], [140, 62, 26], [100, 106, 26], [60, 150, 26], [140, 150, 26], [60, 238, 26], [140, 238, 26]],
};

function coinsArt(n) {
  if (n === 1) {
    const banner = (flip) => {
      const k = flip ? -1 : 1;
      const y = (v) => f(150 + k * (v - 150));
      const top = (x) => 70 - 22 * Math.sin((Math.PI * (x - 34)) / 132);
      const N = 12, x0 = 34, x1 = 166, th = 24;
      let up = '', lo = '', tri = '';
      for (let i = 0; i <= 24; i++) {
        const x = x0 + ((x1 - x0) * i) / 24;
        up += `${i ? 'L' : 'M'}${f(x)} ${y(top(x))}`;
        lo = `L${f(x)} ${y(top(x) + th)}` + lo;
      }
      for (let i = 0; i < N; i++) {
        const xa = x0 + ((x1 - x0) * i) / N, xb = x0 + ((x1 - x0) * (i + 1)) / N, xm = (xa + xb) / 2;
        tri += `M${f(xa + 1)} ${y(top(xa) + 4)}L${f(xb - 1)} ${y(top(xb) + 4)}L${f(xm)} ${y(top(xm) + th - 4)}Z`;
      }
      const band = up + lo + 'Z';
      const end = (x, dir) => {
        const d = `M${x} ${y(top(x) + 2)} C${x - dir * 14} ${y(top(x) - 4)} ${x - dir * 20} ${y(top(x) + 16)} ${x - dir * 12} ${y(top(x) + 36)} C${x - dir * 10} ${y(top(x) + 28)} ${x - dir * 4} ${y(top(x) + 24)} ${x} ${y(top(x) + th)} Z`;
        return P(d, RED) + hatch(d, [x - 22, 30, x + 22, 270], 2.4, dir * 30);
      };
      return end(x0 + 2, 1) + end(x1 - 2, -1) + P(band, BLUE) + `<path d="${tri}" fill="#FFFFFF" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>` + P(band, 'none');
    };
    const R = 50;
    return (
      banner(false) + banner(true) +
      at(100, 150, 1, 0,
        CI(0, 0, R, YEL, 2, GOLD) +
        `<path d="${star(24, R * 0.9, R * 0.74, -90)}" fill="${GOLD}"/>` +
        CI(0, 0, R * 0.7, YEL, 1.4, GOLD) +
        [...Array(12)].map((_, i) => { const a = (i * 30 * Math.PI) / 180; return CI(R * 0.59 * Math.cos(a), R * 0.59 * Math.sin(a), 2.6, GOLD, 0); }).join('') +
        CI(0, 0, R * 0.47, YEL, 1.2, GOLD) +
        `<path d="${star(8, R * 0.42, R * 0.16, -90)}" fill="${GOLD}"/>` +
        `<path d="${star(8, R * 0.3, R * 0.12, -67.5)}" fill="${YEL}" stroke="${GOLD}" stroke-width="0.8"/>` +
        CI(0, 0, R * 0.09, GOLD, 0))
    );
  }
  let art = COIN_POS[n].map(([x, y, r]) => at(x, y, 1, 0, coin(r))).join('');
  if (n === 4) {
    // our centrepiece: a rosette between two leafy scrolls
    art +=
      P('M100 150 C88 132 68 130 54 140 C66 140 76 146 82 156 Z', BLUE) + P('M100 150 C112 132 132 130 146 140 C134 140 124 146 118 156 Z', BLUE) +
      P('M100 150 C88 168 68 170 54 160 C66 160 76 154 82 144 Z', YEL) + P('M100 150 C112 168 132 170 146 160 C134 160 124 154 118 144 Z', YEL) +
      CI(52, 150, 4.6, RED) + CI(148, 150, 4.6, RED) +
      [...Array(8)].map((_, i) => at(100, 150, 1, i * 45, EL(0, -13, 5.4, 8, RED, 1.3) + L('M0 -8 V-18', 0.8))).join('') +
      CI(100, 150, 10.5, YEL, 1.4) + CI(100, 150, 7, BLUE, 1.2) + `<g transform="translate(100 150)"><path d="${star(8, 6, 2.6, -90)}" fill="${YEL}" stroke="${INK}" stroke-width="0.7"/></g>`;
  }
  return art;
}

const CUP_POS = {
  2: [[100, 82, 1.75], [100, 218, 1.75]],
  3: [[132, 72, 1.45], [68, 150, 1.45], [132, 228, 1.45]],
  4: [[60, 70, 1.15], [140, 70, 1.15], [60, 230, 1.15], [140, 230, 1.15]],
  5: [[60, 70, 1.15], [140, 70, 1.15], [100, 150, 1.15], [60, 230, 1.15], [140, 230, 1.15]],
  6: [[62, 66, 1.18], [138, 66, 1.18], [62, 150, 1.18], [138, 150, 1.18], [62, 234, 1.18], [138, 234, 1.18]],
  7: [[60, 62, 1.05], [140, 62, 1.05], [100, 106, 1.05], [60, 150, 1.05], [140, 150, 1.05], [60, 238, 1.05], [140, 238, 1.05]],
};

function bigCup() {
  // the ornate 1 of cups: a lidded goblet with red, blue and yellow bands
  const body = 'M58 122 C52 150 62 178 86 190 L114 190 C138 178 148 150 142 122 Z';
  let g = '';
  g += P('M60 254 H140 L132 266 H68 Z', YEL) + hatch('M60 254 H140 L132 266 H68 Z', [60, 254, 140, 266], 2.6, 0);
  g += P('M70 240 C80 238 90 232 92 224 H108 C110 232 120 238 130 240 L140 254 H60 Z', BLUE) + L('M80 252 C84 244 90 240 96 236 M120 252 C116 244 110 240 104 236', 1);
  g += P('M92 196 C94 206 94 216 92 224 H108 C106 216 106 206 108 196 Z', RED) + hatch('M92 196 C94 206 94 216 92 224 H108 C106 216 106 206 108 196 Z', [92, 196, 108, 224], 2.4, 0);
  g += EL(100, 206, 13, 6, YEL);
  g += P('M84 188 H116 L110 198 H90 Z', BLUE);
  g += P(body, YEL);
  g += `<clipPath id="bcup"><path d="${body}"/></clipPath><g clip-path="url(#bcup)">` +
    P('M40 140 C80 150 120 150 160 140 V156 C120 166 80 166 40 156 Z', RED) + hatch('M40 140 C80 150 120 150 160 140 V156 C120 166 80 166 40 156 Z', [40, 140, 160, 166], 2.6, 30) +
    P('M40 166 C80 176 120 176 160 166 V176 C120 186 80 186 40 176 Z', BLUE) +
    L('M60 132 C80 138 120 138 140 132', 1.2) + hatch(body, [40, 176, 160, 200], 2.6, -30) + `</g>`;
  g += P(body, 'none');
  g += EL(100, 122, 42, 10, RED) + hatch('M58 122 A42 10 0 0 1 142 122 A42 10 0 0 1 58 122 Z', [58, 112, 142, 132], 2.6, -30) + EL(100, 122, 32, 6.5, 'none', 1);
  // lid
  g += P('M64 116 C66 94 84 82 100 80 C116 82 134 94 136 116 C120 122 80 122 64 116 Z', YEL);
  g += P('M74 108 C80 98 90 92 100 91 C110 92 120 98 126 108', 'none', 1);
  g += hatch('M64 116 C66 94 84 82 100 80 C116 82 134 94 136 116 C120 122 80 122 64 116 Z', [64, 80, 136, 122], 3, 0, 0.8);
  g += P('M88 82 C90 74 96 70 100 70 C104 70 110 74 112 82 Z', RED);
  g += CI(100, 62, 9, BLUE) + CI(100, 62, 3.6, YEL, 1) + CI(100, 49, 4, RED);
  return g;
}

function cupsArt(n) {
  if (n === 1) return bigCup();
  let art = CUP_POS[n].map(([x, y, s]) => at(x, y, s, 0, cup(s))).join('');
  if (n === 2) {
    // a leafy scroll with a flower between the two cups
    art +=
      P('M100 150 C88 138 70 136 54 146 C66 142 78 146 86 154 Z', BLUE) + P('M100 150 C112 138 130 136 146 146 C134 142 122 146 114 154 Z', BLUE) +
      P('M96 152 C84 162 66 164 50 156 C62 158 76 156 86 148 Z', YEL) + P('M104 152 C116 162 134 164 150 156 C138 158 124 156 114 148 Z', YEL) +
      CI(46, 152, 5, RED) + CI(154, 152, 5, RED) + at(100, 150, 1.2, 0, flower(RED, 1.2, false));
  }
  if (n === 4) {
    // our own centrepiece: a garland ring with a rosette
    art +=
      EL(100, 150, 36, 30, 'none', 9, INK) + EL(100, 150, 36, 30, 'none', 6, RED) +
      `<ellipse cx="100" cy="150" rx="36" ry="30" fill="none" stroke="${YEL}" stroke-width="6" stroke-dasharray="7 7"/>` +
      EL(100, 150, 36, 30, 'none', 0.8) +
      [0, 90, 180, 270].map((a) => { const r = (a * Math.PI) / 180; return at(100 + 36 * Math.cos(r), 150 + 30 * Math.sin(r), 0.95, 0, flower(a % 180 ? RED : BLUE, 0.95, false)); }).join('') +
      at(100, 150, 1.4, 0, flower(BLUE, 1.4, false));
  }
  return art;
}

/* ---------------- the figures ---------------- */

/** a simple traditional face, frontal, about 24 wide */
function face(s, { beard = false } = {}) {
  const o = OUT / s, t = THIN / s;
  return (
    P('M-11.5 -4 C-11.5 -17 11.5 -17 11.5 -4 C11.5 8 7 15 0 15.5 C-7 15 -11.5 8 -11.5 -4 Z', SKIN, o) +
    P('M-8 -1.6 Q-5 -4.4 -2 -1.6 Q-5 0 -8 -1.6 Z', '#FFFFFF', t) + CI(-4.8, -1.8, 1.25, INK, 0) +
    P('M8 -1.6 Q5 -4.4 2 -1.6 Q5 0 8 -1.6 Z', '#FFFFFF', t) + CI(4.8, -1.8, 1.25, INK, 0) +
    L('M-8.6 -5.8 Q-5 -8 -1.8 -6.2 M8.6 -5.8 Q5 -8 1.8 -6.2', t * 1.5) +
    L('M0.6 -1 L-0.6 4.6 Q0.4 5.8 2.2 5', t) +
    P('M-3.6 9 Q0 7.8 3.6 9 Q0 11.8 -3.6 9 Z', RED, t) +
    (beard
      ? P('M-5.6 11.6 C-4 16 -2 19 0 20.5 C2 19 4 16 5.6 11.6 C3 13.4 -3 13.4 -5.6 11.6 Z', BLUE, t * 1.3) + P('M-6.4 8.4 C-4 6.4 -1.4 6.6 0 7.6 C1.4 6.6 4 6.4 6.4 8.4 C4 8.6 2 8.8 0 9 C-2 8.8 -4 8.6 -6.4 8.4 Z', BLUE, t)
      : '')
  );
}

/** blue shoulder-length hair behind and around the face */
const hairBack = (s) => P('M-13 -6 C-15 -20 15 -20 13 -6 C13.6 -1 14.6 3 17 6.4 C15.4 9.6 11.6 9.6 10.6 6 L-10.6 6 C-11.6 9.6 -15.4 9.6 -17 6.4 C-14.6 3 -13.6 -1 -13 -6 Z', BLUE, OUT / s) + L('M-12.4 -3 C-12.4 1 -13.4 4 -15 6.4 M12.4 -3 C12.4 1 13.4 4 15 6.4', THIN / s);
const fringe = (s) => P('M-12 -6 C-12 -16 12 -16 12 -6 C8 -10 3 -11 0 -9 C-3 -11 -8 -10 -12 -6 Z', BLUE, OUT / s);

/**
 * The suit symbol held in a hand at (hx, hy): the grip sits on the hand and the symbol turns round it.
 * rot 0 = upright (a club or a coin above the hand, a sword with its blade up).
 */
function held(suit, hx, hy, s = 1, rot = 0) {
  const item = {
    clubs: `<g transform="translate(0 -32)">${club(RED, s)}</g>`,
    swords: `<g transform="rotate(180) translate(0 45.5)">${sword(s)}</g>`,
    coins: `<g transform="translate(0 -19)">${coin(17, OUT / s)}</g>`,
    cups: `<g transform="translate(0 -6)">${cup(s)}</g>`,
  }[suit];
  return at(hx, hy, s, rot, item);
}
/** a hand: a small round fist */
const hand = (x, y, r = 4.4) => CI(x, y, r, SKIN);

const LOOK = {
  coins: { coat: RED, sleeve: BLUE, hose: YEL, trim: YEL, hat: RED, band: BLUE, cape: BLUE },
  cups: { coat: BLUE, sleeve: RED, hose: YEL, trim: YEL, hat: RED, band: YEL, cape: RED },
  swords: { coat: RED, sleeve: YEL, hose: BLUE, trim: YEL, hat: BLUE, band: RED, cape: YEL },
  clubs: { coat: RED, sleeve: BLUE, hose: BLUE, trim: YEL, hat: RED, band: YEL, cape: BLUE },
};

function ground(y = 268, x0 = 50, x1 = 146) {
  const m = (x0 + x1) / 2;
  return P(`M${x0} ${y} C${m - 30} ${y - 6} ${m + 30} ${y - 6} ${x1} ${y} C${m + 30} ${y + 4} ${m - 30} ${y + 4} ${x0} ${y} Z`, YEL, 1.2) + L(`M${x0 + 12} ${y} H${m - 12} M${m + 2} ${y + 1} H${x1 - 14}`, 0.8);
}

/** striped puffed sleeve along a path (shoulder → hand) */
const sleeve = (d, color, w = 12) => tube(d, color, w) + L(d, 0.9) ;

function sota(suit) {
  const k = LOOK[suit];
  // where the free hand is and how the symbol sits in it
  const pose = {
    clubs: { hand: [60, 146], arm: 'M76 104 C64 116 60 130 60 146', item: () => held('clubs', 60, 148, 1.1, -8) },
    swords: { hand: [60, 146], arm: 'M76 104 C64 116 60 130 60 146', item: () => held('swords', 60, 147, 1.0, 180) },
    coins: { hand: [58, 112], arm: 'M76 104 C66 110 60 116 58 112', item: () => held('coins', 58, 112, 1.0, -8) },
    cups: { hand: [60, 140], arm: 'M76 104 C64 114 60 126 60 140', item: () => held('cups', 60, 140, 1.05, 0) },
  }[suit];
  let g = ground(270, 50, 140);
  const back = suit === 'swords'; // symbols that rest on the ground stand behind the leg
  if (back) g += pose.item();
  // legs
  g += tube('M89 186 L87 262', k.hose, 12.5) + tube('M111 186 L114 262', k.hose, 12.5);
  g += L('M85 200 C86 220 86 240 85 258 M117 200 C116 220 117 240 117 258', THIN);
  g += P('M75 260 C77 254 85 254 93 258 L93 266 H73 Z', RED) + P('M107 258 C115 254 123 254 127 260 L129 266 H107 Z', RED);
  // puffed breeches
  const br = 'M72 158 C66 172 68 186 76 192 C86 196 94 192 100 188 C106 192 114 196 124 192 C132 186 134 172 128 158 Z';
  g += P(br, k.coat) + `<clipPath id="br${suit}"><path d="${br}"/></clipPath><g clip-path="url(#br${suit})">` + L('M80 156 V196 M92 156 V196 M108 156 V196 M120 156 V196', 5, k.trim) + L('M77 156 V196 M83 156 V196 M89 156 V196 M95 156 V196 M105 156 V196 M111 156 V196 M117 156 V196 M123 156 V196', 0.9) + '</g>' + P(br, 'none');
  // arm on the hip (behind the body)
  g += sleeve('M126 104 C142 116 146 132 132 148', k.sleeve) + L('M137 112 L141 118 M142 126 L147 128 M143 138 L147 138', THIN) + hand(130, 148);
  // doublet
  const coat = 'M74 100 C70 120 70 146 72 162 C88 168 112 168 128 162 C130 146 130 120 126 100 C114 94 86 94 74 100 Z';
  g += P(coat, k.coat) + hatch(coat, [70, 94, 130, 168], 3.2, 0) + P(coat, 'none');
  g += P('M96 98 L104 98 L104 164 L96 164 Z', k.trim) + L('M100 104 V160', THIN);
  g += [110, 122, 134, 146].map((y) => CI(100, y, 1.7, RED, 0.8)).join('');
  g += P('M71 150 C88 156 112 156 129 150 L129 158 C112 164 88 164 71 158 Z', k.trim);
  // puffed shoulders
  g += P('M70 98 C70 92 80 90 86 96 C84 104 76 108 70 104 Z', k.trim) + P('M130 98 C130 92 120 90 114 96 C116 104 124 108 130 104 Z', k.trim);
  // collar
  g += P('M84 98 C90 104 110 104 116 98 L112 92 C106 95 94 95 88 92 Z', '#FFFFFF') + L('M90 96 L92 101 M96 97 L97 102 M104 97 L103 102 M110 96 L108 101', THIN);
  // the arm holding the symbol
  if (!back) g += pose.item();
  g += sleeve(pose.arm, k.sleeve) + hand(...pose.hand);
  if (back) g += L(`M${pose.hand[0] - 3.4} ${pose.hand[1] - 1.5} Q${pose.hand[0]} ${pose.hand[1] - 4} ${pose.hand[0] + 3.4} ${pose.hand[1] - 1.5}`, THIN);
  // head
  g += at(100, 70, 1.25, 0, hairBack(1.25) + face(1.25) + fringe(1.25));
  // cap: a soft beret with a band
  g += P('M78 56 C76 42 90 34 104 36 C118 36 126 44 124 54 C112 50 92 50 78 56 Z', k.hat) + hatch('M78 56 C76 42 90 34 104 36 C118 36 126 44 124 54 C112 50 92 50 78 56 Z', [76, 34, 126, 56], 3, 20);
  g += P('M76 58 C90 50 112 50 126 56 L124 61 C110 56 92 56 78 63 Z', k.band);
  return g;
}

function horse() {
  let g = '';
  // far legs: a hind leg standing, a front leg lifted
  g += tube('M74 204 C72 220 78 232 72 246 L70 262', BLUE, 10) + tube('M140 200 C154 206 162 216 158 232', BLUE, 10);
  g += P('M63 260 H77 V268 H63 Z', INK, 1) + at(158, 234, 1, -15, P('M-6 -2 H6 V5 H-6 Z', INK, 1));
  // tail
  g += P('M48 176 C34 182 28 202 30 228 C36 214 40 206 44 200 C40 216 40 232 46 246 C50 228 54 210 60 194 Z', BLUE) + L('M46 184 C38 194 34 208 33 220 M52 190 C46 204 44 220 45 236', THIN);
  // body
  const body = 'M46 184 C44 164 66 156 94 158 C116 160 132 156 144 152 C162 156 164 184 154 200 C146 212 122 216 100 214 C78 214 58 214 50 204 C46 198 45 192 46 184 Z';
  g += P(body, BLUE) + hatch(body, [44, 150, 166, 216], 3, 30, 0.75) + P(body, 'none');
  g += L('M56 206 C78 212 122 212 150 200', THIN);
  // neck and head
  g += '<g transform="translate(2 9)">';
  const neck = 'M126 168 C128 146 136 128 148 114 L166 120 C168 136 164 152 158 168 C156 180 154 190 152 198 Z';
  g += P(neck, BLUE) + hatch(neck, [124, 114, 168, 198], 3, 30, 0.75) + P(neck, 'none');
  const head = 'M145 118 C148 104 160 98 169 102 L186 128 C190 137 184 144 176 141 L163 137 C156 133 149 127 145 118 Z';
  g += P(head, BLUE) + P('M152 102 L155 89 L162 100 Z', BLUE) + L('M178 131 C181 133 183 133 186 131', THIN);
  g += CI(162, 113, 1.9, INK, 0) + L('M159 110.5 Q162 109.5 165 111', THIN) + CI(181, 135, 1.3, INK, 0);
  // mane
  g += P('M145 114 C138 124 132 140 128 160 C127 168 127 172 127 176 L134 172 C136 154 142 136 152 122 Z', YEL) + L('M143 124 L137 124 M139 136 L133 136 M135 148 L129 148 M133 160 L127 160', THIN);
  // bridle
  g += L('M158 104 L172 136 M154 120 L182 129', 1.8, RED);
  g += '</g>';
  // near legs: a hind leg and the prancing front leg
  g += tube('M92 210 C96 228 90 244 92 262', BLUE, 11) + tube('M136 202 C148 218 164 222 172 238', BLUE, 11);
  g += P('M84 260 H100 V268 H84 Z', INK, 1) + at(173, 240, 1, -30, P('M-7 -3 H7 V4 H-7 Z', INK, 1));
  // saddle cloth
  const cloth = 'M74 158 C88 156 112 156 124 158 L127 196 C112 200 88 200 72 196 Z';
  g += P(cloth, RED) + hatch(cloth, [72, 156, 127, 200], 3, 0) + P(cloth, 'none') + P('M72 192 C88 196 112 196 127 192 L127 200 C112 204 88 204 72 200 Z', YEL);
  return g;
}

function caballo(suit) {
  const k = LOOK[suit];
  // the raised hand and the symbol in it (clubs and swords lean on the shoulder, behind the head)
  const hx = 62, hy = 120;
  const item = {
    clubs: () => held('clubs', hx, hy, 0.9, -8),
    swords: () => held('swords', hx, hy, 0.86, 12),
    coins: () => held('coins', hx, hy - 2, 0.95, 0),
    cups: () => held('cups', hx, hy - 2, 0.95, 0),
  }[suit];
  const behind = false;
  let g = ground(274, 54, 146) + `<g transform="translate(104 268) scale(1.08) translate(-104 -268)">${horse()}</g>`;
  if (behind) g += item();
  // the rider (a little smaller than the page), seated on the cloth
  let r = '';
  r += tube('M96 168 C108 172 116 180 116 190 C116 204 112 214 110 226', k.hose, 13) + P('M104 224 C110 222 118 224 122 228 L122 234 H104 Z', RED);
  r += L('M112 186 C116 196 114 208 112 220', THIN);
  const coat = 'M82 102 C78 120 78 146 82 170 C94 174 108 174 120 170 C122 146 122 120 118 102 C106 96 94 96 82 102 Z';
  r += P(coat, k.coat) + hatch(coat, [78, 96, 122, 174], 3.2, 0) + P(coat, 'none');
  r += P('M96 100 H104 V172 H96 Z', k.trim) + P('M80 150 C94 156 108 156 121 150 L121 158 C108 164 94 164 80 158 Z', k.trim);
  r += P('M78 100 C78 94 88 92 92 98 C90 106 82 108 78 104 Z', k.trim) + P('M122 100 C122 94 112 92 108 98 C110 106 118 108 122 104 Z', k.trim);
  r += P('M88 100 C94 106 106 106 112 100 L108 94 C104 97 96 97 92 94 Z', '#FFFFFF');
  r += sleeve('M116 108 C128 118 134 128 142 136', k.sleeve, 11) + hand(143, 137) + L('M146 138 L178 132', 1, INK);
  r += at(100, 76, 1.12, 0, hairBack(1.12) + face(1.12) + fringe(1.12));
  r += P('M80 64 C80 50 92 44 102 44 C114 44 122 52 120 62 C108 58 92 58 80 64 Z', k.hat) + hatch('M80 64 C80 50 92 44 102 44 C114 44 122 52 120 62 C108 58 92 58 80 64 Z', [80, 44, 122, 64], 3, 20);
  r += P('M74 64 C88 56 112 56 126 62 L124 67 C110 62 90 62 76 69 Z', k.band);
  r += P('M117 56 C123 44 133 38 139 31 C138 43 131 52 121 59 Z', '#FFFFFF') + L('M121 55 L134 39', THIN);
  g += `<g transform="translate(100 166) scale(0.86) translate(-100 -166)">${r}</g>`;
  if (!behind) g += item();
  // the raised arm (drawn last so the hand is on top)
  g += `<g transform="translate(100 166) scale(0.86) translate(-100 -166)">${sleeve('M84 108 C74 116 68 124 61 122', k.sleeve, 11)}</g>` + hand(hx, hy);
  return g;
}

function rey(suit) {
  const k = LOOK[suit];
  const cape = k.coat === RED ? BLUE : RED;
  let g = '';
  // cloak flaring to the ground with a yellow border
  const cloak = 'M72 96 C56 140 44 200 36 266 H164 C156 200 144 140 128 96 Z';
  g += P(cloak, cape) + hatch(cloak, [36, 96, 164, 266], 3.2, 0, 0.7) + P(cloak, 'none');
  g += P('M36 266 C44 200 56 140 72 96 L80 98 C66 140 57 200 50 266 Z', YEL) + P('M164 266 C156 200 144 140 128 96 L120 98 C134 140 143 200 150 266 Z', YEL);
  g += L('M40 246 L48 248 M44 222 L52 224 M48 196 L56 198 M54 170 L62 172 M60 144 L68 146 M160 246 L152 248 M156 222 L148 224 M152 196 L144 198 M146 170 L138 172 M140 144 L132 146', 1);
  // long robe
  const robe = 'M80 104 C74 150 68 210 62 266 H138 C132 210 126 150 120 104 Z';
  g += P(robe, k.coat) + P('M92 104 C90 160 88 220 86 266 H114 C112 220 110 160 108 104 Z', k.trim);
  g += [184, 210, 236].map((y) => at(100, y, 1, 0, P('M0 -6 L6 0 L0 6 L-6 0 Z', cape, 1))).join('');
  g += L('M86 266 C88 230 89 200 90 168 M114 266 C112 230 111 200 110 168', THIN);
  g += P('M74 152 C90 158 110 158 126 152 L126 162 C110 168 90 168 74 162 Z', YEL) + CI(100, 160, 4, RED, 1.2);
  g += P('M56 262 H144 V268 H56 Z', '#FFFFFF', 1.2);
  // arm on the belt
  g += sleeve('M122 108 C136 122 138 140 124 154', k.sleeve, 13) + hand(122, 155, 4.8);
  // ermine collar
  g += P('M74 98 C84 108 116 108 126 98 L120 90 C110 96 90 96 80 90 Z', '#FFFFFF') + [84, 92, 100, 108, 116].map((x) => CI(x, 99 + (x === 100 ? 2 : 0), 1.1, INK, 0)).join('');
  // the symbol, held up in front at the left
  const hx = 62, hy = 150;
  const item = { clubs: held('clubs', hx, hy, 1.0, -6), swords: held('swords', hx, hy, 0.95, 6), coins: held('coins', hx, hy, 1.0, 0), cups: held('cups', hx, hy, 1.0, 0) }[suit];
  const arm = sleeve('M78 106 C66 118 62 134 62 150', k.sleeve, 13);
  g += (suit === 'coins' || suit === 'cups' ? arm + item : item + arm) + hand(hx, hy, 5);
  // head: hair, face with a short beard, crown
  g += at(100, 66, 1.3, 0, hairBack(1.3) + face(1.3, { beard: true }) + fringe(1.3));
  g += P('M80 54 L78 30 L88 42 L94 26 L100 40 L106 26 L112 42 L122 30 L120 54 C108 50 92 50 80 54 Z', YEL) + L('M88 46 L88 51 M100 44 V50 M112 46 L112 51', THIN);
  g += CI(78, 29, 2.6, YEL, 1.2) + CI(94, 25, 2.6, YEL, 1.2) + CI(106, 25, 2.6, YEL, 1.2) + CI(122, 29, 2.6, YEL, 1.2);
  g += P('M80 54 C92 50 108 50 120 54 L120 48 C108 44 92 44 80 48 Z', RED) + CI(100, 48.5, 2.2, BLUE, 0.9) + CI(89, 49.5, 1.6, BLUE, 0.8) + CI(111, 49.5, 1.6, BLUE, 0.8);
  return g;
}

/* ---------------- the cards ---------------- */

function art(suit, rank) {
  if (rank === 10) return sota(suit);
  if (rank === 11) return caballo(suit);
  if (rank === 12) return rey(suit);
  if (suit === 'clubs') return clubsArt(rank);
  if (suit === 'swords') return swordsArt(rank);
  if (suit === 'coins') return coinsArt(rank);
  return cupsArt(rank);
}

/** a Spanish card: suit coins | cups | swords | clubs, rank 1–7, 10 (sota), 11 (caballo), 12 (rey) */
export function card(suit, rank) {
  return shell(`${suit}-${rank}`, suit, String(rank), art(suit, rank));
}

export function back() {
  // a fine red lattice of little four-point stars on white, with a white border
  let pat = '';
  for (let y = 0; y < 270; y += 12) for (let x = 0; x < 170; x += 12) pat += `M${x + 6} ${y + 1.5}L${x + 7.4} ${y + 4.6}L${x + 10.5} ${y + 6}L${x + 7.4} ${y + 7.4}L${x + 6} ${y + 10.5}L${x + 4.6} ${y + 7.4}L${x + 1.5} ${y + 6}L${x + 4.6} ${y + 4.6}Z`;
  let grid = '';
  for (let i = -300; i < 300; i += 12) grid += `M${i} 0L${i + 300} 300M${i + 300} 0L${i} 300`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><clipPath id="bk"><rect x="14" y="14" width="172" height="272" rx="5"/></clipPath></defs><g data-flat>
    <rect x="1.5" y="1.5" width="197" height="297" rx="12" fill="${PAPER}"/>
    <rect x="14" y="14" width="172" height="272" rx="5" fill="${RED}"/>
    <g clip-path="url(#bk)">
      <path d="${grid}" stroke="#FFFFFF" stroke-width="0.9" opacity="0.55" fill="none"/>
      <g transform="translate(14 14)"><path d="${pat}" fill="#FFFFFF" opacity="0.92"/></g>
    </g>
    <rect x="14" y="14" width="172" height="272" rx="5" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <rect x="19" y="19" width="162" height="262" rx="3" fill="none" stroke="#FFFFFF" stroke-width="1.6"/>
    <rect x="1.5" y="1.5" width="197" height="297" rx="12" fill="none" stroke="#B5AE9C" stroke-width="1.4"/>
  </g></svg>`;
}
