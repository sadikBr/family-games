// Emblems and boards for the Islamic games (rendered through the mascot pass).
// No people, prophets or angels are ever drawn; no Quran text is used as decoration.
import fs from 'node:fs';
import path from 'node:path';

import { INK, svg100 } from './mkit.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);

const SHIELD = 'M50 7 L85 17 C86 50 76 77 50 93 C24 77 14 50 15 17Z';
const SHIELD_IN = 'M50 14 L79 22 C79.5 50 71 71 50 85 C29 71 20.5 50 21 22Z';
const HEX = 'M50 6 L88 27 V73 L50 94 L12 73 V27Z';
const HEX_IN = 'M50 13 L82 31 V69 L50 87 L18 69 V31Z';
const ROUND = 'M50 8 A42 42 0 1 1 49.9 8Z';
const ROUND_IN = 'M50 15 A35 35 0 1 1 49.9 15Z';

function wings(c1, c2) {
  const L = `M20 34 L4 26 L10 38 L0 42 L12 50 L4 58 L18 60 L14 70 L27 66Z`;
  const L2 = `M22 44 L10 42 L16 50 L10 56 L24 58Z`;
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${100 - parseFloat(x)} ${y}`);
  return `<path d="${L}" fill="${c1}"/><path d="${mirror(L)}" fill="${c1}"/>
    <path d="${L2}" fill="${c2}" data-noshade/><path d="${mirror(L2)}" fill="${c2}" data-noshade/>`;
}
const base = (shape, inner, c1, c2, w) => `${w ? wings(...w) : ''}<path d="${shape}" fill="${c1}"/><path d="${inner}" fill="${c2}" data-noline data-shade="0.8"/>`;

const star8 = (cx, cy, r, fill, extra = '') => {
  const p = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const rr = i % 2 ? r * 0.72 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${fill}" ${extra}/>`;
};
const crescent = (cx, cy, r, fill, extra = '') =>
  `<path d="M${cx} ${cy - r} A${r} ${r} 0 0 0 ${cx} ${cy + r} A${r * 1.3} ${r * 1.3} 0 0 1 ${cx} ${cy - r}Z" fill="${fill}" ${extra}/>`;

/* ---------------- emblems (100×100) ---------------- */

export function huroof() {
  const hex = (cx, cy, r, fill, letter, tc) => {
    const p = [...Array(6)].map((_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    });
    return `<polygon points="${p.join(' ')}" fill="${fill}" data-lw="1.2"/>
      <text x="${cx}" y="${cy + r * 0.5}" font-size="${r * 1.5}" font-family="Lalezar" fill="${tc}" text-anchor="middle" data-flat>${letter}</text>`;
  };
  return svg100(`
    ${base(HEX, HEX_IN, '#7A1F2E', '#B8323F', ['#2FB67C', '#A8E6C8'])}
    ${hex(36, 39, 14, '#E2475F', 'ح', '#FFF4DA')}
    ${hex(64, 39, 14, '#FFF4DA', 'ر', INK)}
    ${hex(50, 63, 14, '#2FB67C', 'ف', '#FFF4DA')}`);
}

export function quiz() {
  // a Moroccan lantern with a glowing question mark
  return svg100(`
    ${base(ROUND, ROUND_IN, '#1D2A6B', '#2F43A8', ['#F4C02E', '#FFE89A'])}
    <circle cx="50" cy="55" r="22" fill="#F4C02E" opacity="0.28" data-noline data-noshade/>
    <path d="M50 14 L54 20 H46Z" fill="#E9B23A"/>
    <path d="M42 22 H58 L62 30 H38Z" fill="#E9B23A"/>
    <path d="M38 30 H62 C66 44 66 62 60 74 H40 C34 62 34 44 38 30Z" fill="#FFE7A8"/>
    <path d="M44 30 C42 44 42 62 45 74 M56 30 C58 44 58 62 55 74" stroke="#E9B23A" stroke-width="2" fill="none" data-flat/>
    <path d="M40 74 H60 L57 80 H43Z" fill="#E9B23A"/>
    <path d="M47 80 H53 L50 86Z" fill="#E9B23A"/>
    <text x="50" y="62" font-size="24" font-family="Lilita" fill="#C2410C" text-anchor="middle" data-flat>؟</text>`);
}

export function whois() {
  // a magnifier over a scroll of clues
  return svg100(`
    ${base(HEX, HEX_IN, '#4B2A86', '#7B61D9', ['#F2B33D', '#FFE08A'])}
    <path d="M26 30 H66 C70 30 72 33 72 36 V70 H32 C28 70 26 67 26 64Z" fill="#FFF4DA"/>
    <path d="M26 30 C22 30 20 33 20 36 C20 39 22 41 26 41Z" fill="#E8D6AE"/>
    <path d="M34 42 H62 M34 49 H58 M34 56 H54" stroke="#C9B48A" stroke-width="2.6" stroke-linecap="round" data-flat/>
    <circle cx="60" cy="56" r="12" fill="#DDE3EC" data-shade="0.8"/><circle cx="60" cy="56" r="8.5" fill="#BFE6FA" data-noline/>
    <text x="60" y="61.5" font-size="13" font-family="Lilita" fill="#4B2A86" text-anchor="middle" data-flat>؟</text>
    <path d="M69 65 L79 76" stroke="${INK}" stroke-width="7" stroke-linecap="round" data-flat/>
    <path d="M69 65 L79 76" stroke="#7A4A24" stroke-width="3.6" stroke-linecap="round" data-flat/>`);
}

export function surah() {
  // an open mushaf on a wooden stand (rehal); pages are decorated, no text
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#0E5A43', '#178A63', ['#F4C02E', '#FFE89A'])}
    ${star8(50, 26, 7, '#F4C02E')}
    <path d="M30 62 L70 82 M70 62 L30 82" stroke="#7A4A24" stroke-width="5" stroke-linecap="round" data-lw="1.2"/>
    <path d="M50 64 C42 58 32 57 24 59 V36 C32 34 42 35 50 41Z" fill="#FFF8E6"/>
    <path d="M50 64 C58 58 68 57 76 59 V36 C68 34 58 35 50 41Z" fill="#FFF8E6"/>
    <path d="M50 41 V64" stroke="${INK}" stroke-width="1.2" data-flat/>
    <path d="M29 42 C35 41 41 41 45 44 M29 48 C35 47 41 47 45 50 M29 54 C35 53 41 53 45 56" stroke="#2FB67C" stroke-width="1.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M71 42 C65 41 59 41 55 44 M71 48 C65 47 59 47 55 50 M71 54 C65 53 59 53 55 56" stroke="#2FB67C" stroke-width="1.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M22 60 C32 57 42 58 50 66 C58 58 68 57 78 60 V63 C68 60 58 61 50 69 C42 61 32 60 22 63Z" fill="#0E5A43"/>`);
}

export function kaaba(cx, cy, s) {
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <path d="M-10 -6 L0 -10 L10 -6 V8 L0 12 L-10 8Z" fill="#1B1B22"/>
    <path d="M0 -10 L10 -6 V8 L0 12Z" fill="#2A2A33" data-noline/>
    <path d="M-10 -2.6 L0 -6.4 L10 -2.6 V-0.6 L0 -4.4 L-10 -0.6Z" fill="#E7B53A" data-noshade data-lw="0.5"/>
    <path d="M3.4 2 L6.6 0.8 V8.4 L3.4 9.6Z" fill="#E7B53A" data-noshade data-lw="0.4"/></g>`;
}

export function hajj() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#8A5A1E', '#E7A947', ['#2FB67C', '#A8E6C8'])}
    <circle cx="66" cy="30" r="8" fill="#FFE08A" data-noline/>
    <path d="M18 62 L34 40 L46 56 L58 38 L82 62Z" fill="#C98A4A" data-shade="0.8"/>
    <path d="M20 66 L30 54 L40 66Z" fill="#FFFDF7"/><path d="M60 66 L70 54 L80 66Z" fill="#FFFDF7"/>
    ${kaaba(50, 64, 1.55)}
    <path d="M18 76 C34 72 66 72 82 76 V80 C66 77 34 77 18 80Z" fill="#F3E2BE" data-noshade/>`);
}

export function ladders() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#13684A', '#2FB67C', ['#F4C02E', '#FFE89A'])}
    ${crescent(34, 28, 8, '#F4C02E')}
    ${star8(46, 22, 3.2, '#F4C02E')}
    <g transform="rotate(-24 52 54)">
      <rect x="40" y="26" width="5" height="54" rx="2" fill="#C98A3A"/><rect x="59" y="26" width="5" height="54" rx="2" fill="#C98A3A"/>
      ${[32, 41, 50, 59, 68, 76].map((y) => `<rect x="44" y="${y}" width="16" height="3.4" rx="1.2" fill="#E8B26A" data-lw="0.8"/>`).join('')}
    </g>
    <path d="M28 76 C24 66 34 62 40 66 C46 70 54 70 56 62" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round" data-flat/>
    <path d="M28 76 C24 66 34 62 40 66 C46 70 54 70 56 62" stroke="#8BC34A" stroke-width="6" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="57" cy="60" r="5.4" fill="#8BC34A"/><circle cx="58.6" cy="58.6" r="1.3" fill="${INK}" data-noshade data-noline/>`);
}

/* ---------------- shared data (parsed from src/shared/islamic.ts so art and rules agree) ---------------- */

const SHARED = fs.readFileSync(path.join(here, '../../src/shared/islamic.ts'), 'utf8');
const block = (name) => SHARED.slice(SHARED.indexOf(`export const ${name}`), SHARED.indexOf('];', SHARED.indexOf(`export const ${name}`)));
const jumps = (name) => [...block(name).matchAll(/from: (\d+), to: (\d+), title: '([^']+)'/g)].map((m) => ({ from: +m[1], to: +m[2], title: m[3] }));
const STATIONS = [...block('HAJJ_STATIONS').matchAll(/title: '([^']+)'/g)].map((m) => m[1]);

/* ---------------- سلّم الحسنات board: 10×10, square 1 bottom-right ---------------- */

const cell10 = (n) => {
  const i = n - 1, row = Math.floor(i / 10), k = i % 10;
  const col = row % 2 === 0 ? 9 - k : k;
  return { x: col * 10 + 5, y: 100 - (row * 10 + 5) };
};

export function laddersBoard() {
  const PAL = ['#FFF6E0', '#E3F4EA', '#FCE9D6', '#E5EEFB'];
  let cells = '';
  for (let n = 1; n <= 100; n++) {
    const { x, y } = cell10(n);
    const row = Math.floor((n - 1) / 10);
    cells += `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="${PAL[(n + row) % 4]}" data-noshade data-lw="0.35"/>
      <text x="${x + 3.6}" y="${y - 2.2}" font-size="2.6" font-family="Lilita" fill="#8C7B66" text-anchor="end" data-flat>${n}</text>`;
  }
  const end = cell10(100);
  cells += `<rect x="${end.x - 5}" y="${end.y - 5}" width="10" height="10" fill="#F4C02E" data-noshade data-lw="0.35"/>
    ${star8(end.x, end.y + 0.6, 3.2, '#FFF6E0', 'data-noshade data-lw="0.4"')}`;
  const ladder = ({ from, to }) => {
    const a = cell10(from), b = cell10(to);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const nx = (-dy / len) * 2.2, ny = (dx / len) * 2.2;
    const rungs = Math.max(2, Math.round(len / 4));
    let r = '';
    for (let i = 1; i < rungs; i++) {
      const t = i / rungs, cx = a.x + dx * t, cy = a.y + dy * t;
      r += `<line x1="${cx - nx}" y1="${cy - ny}" x2="${cx + nx}" y2="${cy + ny}" stroke="#E8B26A" stroke-width="1.1" stroke-linecap="round" data-lw="0.3"/>`;
    }
    return `<g>${r}<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${b.x - nx}" y2="${b.y - ny}" stroke="#B9783A" stroke-width="1.3" stroke-linecap="round" data-lw="0.35"/>
      <line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}" y2="${b.y + ny}" stroke="#B9783A" stroke-width="1.3" stroke-linecap="round" data-lw="0.35"/></g>`;
  };
  const SNAKE_COL = ['#7CB342', '#8E6AD8', '#E57373', '#4DB6AC', '#FFB74D', '#64B5F6', '#BA68C8', '#AED581'];
  const snake = ({ from, to }, i) => {
    const h = cell10(from), t = cell10(to);
    const dx = t.x - h.x, dy = t.y - h.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const w = Math.min(4, len / 6);
    const p1 = { x: h.x + dx * 0.33 + nx * w, y: h.y + dy * 0.33 + ny * w };
    const p2 = { x: h.x + dx * 0.66 - nx * w, y: h.y + dy * 0.66 - ny * w };
    const d = `M${h.x} ${h.y} C${p1.x} ${p1.y} ${p1.x} ${p1.y} ${(h.x + t.x) / 2} ${(h.y + t.y) / 2} S${p2.x} ${p2.y} ${t.x} ${t.y}`;
    const c = SNAKE_COL[i % SNAKE_COL.length];
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return `<path d="${d}" stroke="${INK}" stroke-width="3.6" fill="none" stroke-linecap="round" data-flat/>
      <path d="${d}" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round" data-flat/>
      <path d="${d}" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="0.7" stroke-dasharray="1 2" fill="none" data-flat/>
      <g transform="translate(${h.x} ${h.y}) rotate(${ang + 180})">
        <ellipse cx="0" cy="0" rx="2.8" ry="2.3" fill="${c}" data-lw="0.45"/>
        <circle cx="-0.8" cy="-1" r="0.75" fill="#fff" data-noline data-noshade/><circle cx="-0.8" cy="1" r="0.75" fill="#fff" data-noline data-noshade/>
        <circle cx="-1" cy="-1" r="0.38" fill="${INK}" data-noline data-noshade/><circle cx="-1" cy="1" r="0.38" fill="${INK}" data-noline data-noshade/>
      </g>`;
  };
  return svg100(`
    <rect x="0" y="0" width="100" height="100" fill="#FFF6E0" data-noshade data-noline/>
    ${cells}
    ${jumps('SNAKES').map(snake).join('')}
    ${jumps('LADDERS').map(ladder).join('')}
    <rect x="0.4" y="0.4" width="99.2" height="99.2" fill="none" stroke="${INK}" stroke-width="0.8" data-flat/>`);
}

/* ---------------- رحلة الحج board: 9×5 serpentine, square 0 bottom-right ---------------- */

const COLS = 9, ROWS = 5, CW = 10, RH = 14; // viewBox 90 × 70
const hcell = (sq) => {
  const row = Math.floor(sq / COLS), k = sq % COLS;
  const col = row % 2 === 0 ? COLS - 1 - k : k;
  return { x: col * CW + CW / 2, y: ROWS * RH - (row * RH + RH / 2) };
};
// same pattern as hajjSquare() in src/shared/islamic.ts
const BETWEEN = [['plain', 'event', 'question'], ['event', 'plain', 'question'], ['question', 'event', 'plain']];
const kindOf = (sq) => (sq === 0 ? 'start' : sq % 4 === 0 ? 'station' : BETWEEN[Math.floor(sq / 4) % 3][(sq % 4) - 1]);

function stationIcon(k, x, y) {
  const s = 1;
  switch (k) {
    case 0: // الميقات — palm tree
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-0.4 3.6 C0 1 0.3 -1 0 -3" stroke="#8A5A33" stroke-width="1" fill="none" data-lw="0.3"/>
        <path d="M0 -3 C-2 -4 -3.4 -3 -3.6 -1.8 C-2.4 -2.6 -1.2 -2.8 0 -3Z M0 -3 C2 -4 3.4 -3 3.6 -1.8 C2.4 -2.6 1.2 -2.8 0 -3Z M0 -3 C-1 -4.8 0.6 -5.4 1.6 -4.8 C0.6 -4.4 0.2 -3.8 0 -3Z" fill="#2FB67C" data-lw="0.3"/></g>`;
    case 1: case 8: case 10:
      return kaaba(x, y, 0.32);
    case 2: // السعي — two hills
      return `<path d="M${x - 4} ${y + 2.5} L${x - 2.2} ${y - 1.5} L${x - 0.4} ${y + 2.5}Z M${x + 0.4} ${y + 2.5} L${x + 2.2} ${y - 1.5} L${x + 4} ${y + 2.5}Z" fill="#B98A5A" data-lw="0.35"/>`;
    case 3: case 9: // منى — tents
      return `<path d="M${x - 4} ${y + 2.4} L${x - 2} ${y - 1.4} L${x} ${y + 2.4}Z M${x} ${y + 2.4} L${x + 2} ${y - 1.4} L${x + 4} ${y + 2.4}Z" fill="#FFFDF7" data-lw="0.35"/>`;
    case 4: // عرفات — mountain
      return `<path d="M${x - 4} ${y + 2.6} L${x} ${y - 2.4} L${x + 4} ${y + 2.6}Z" fill="#C98A4A" data-lw="0.35"/><rect x="${x - 0.3}" y="${y - 4}" width="0.6" height="2" fill="#FFFDF7" data-lw="0.2"/>`;
    case 5: // مزدلفة — night and pebbles
      return `${crescent(x - 1.4, y - 0.8, 2, '#F4C02E', 'data-lw="0.3"')}<circle cx="${x + 1.6}" cy="${y + 2}" r="0.7" fill="#9E9E9E" data-lw="0.2"/><circle cx="${x + 3}" cy="${y + 2.2}" r="0.6" fill="#BDBDBD" data-lw="0.2"/>`;
    case 6: // جمرة العقبة — a pillar
      return `<rect x="${x - 1.2}" y="${y - 3}" width="2.4" height="5.6" rx="0.4" fill="#D7CCC8" data-lw="0.35"/><circle cx="${x + 2.6}" cy="${y + 2}" r="0.6" fill="#9E9E9E" data-lw="0.2"/>`;
    case 7: // النحر والحلق — Eid crescent and star
      return `${crescent(x - 0.6, y, 2.6, '#F4C02E', 'data-lw="0.3"')}${star8(x + 2.4, y - 1.6, 1, '#F4C02E', 'data-lw="0.2"')}`;
    default:
      return '';
  }
}

export function hajjBoard() {
  const W = COLS * CW, H = ROWS * RH;
  // background bands: desert, with a sky tint towards the top
  let bg = '';
  const BAND = ['#F6E3BE', '#F3DDB2', '#F0D7A8', '#ECD39F', '#E8CE96'];
  for (let r = 0; r < ROWS; r++) bg += `<rect x="0" y="${H - (r + 1) * RH}" width="${W}" height="${RH}" fill="${BAND[r]}" data-noshade data-noline/>`;
  // dunes
  bg += `<path d="M0 ${H} C15 ${H - 5} 30 ${H - 3} 45 ${H - 6} C60 ${H - 9} 75 ${H - 4} 90 ${H - 6} V${H}Z" fill="#E6C48C" opacity="0.6" data-noshade data-noline/>`;
  // the road
  const pts = [...Array(COLS * ROWS)].map((_, i) => hcell(i));
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.y === b.y) d += ` L${b.x} ${b.y}`;
    else {
      const side = a.x > W / 2 ? 1 : -1;
      d += ` C${a.x + side * 3.6} ${a.y} ${b.x + side * 3.6} ${b.y} ${b.x} ${b.y}`;
    }
  }
  const road = `<path d="${d}" stroke="${INK}" stroke-width="5.6" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <path d="${d}" stroke="#FBEFD6" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <path d="${d}" stroke="#E2C48E" stroke-width="0.5" stroke-dasharray="1.2 1.6" fill="none" data-flat/>`;
  let tiles = '';
  for (let sq = 0; sq < COLS * ROWS; sq++) {
    const { x, y } = hcell(sq);
    const k = kindOf(sq);
    if (k === 'station') {
      const st = sq / 4 - 1;
      const last = st === STATIONS.length - 1;
      tiles += `<rect x="${x - 4}" y="${y - 4.6}" width="8" height="8" rx="2" fill="${last ? '#F4C02E' : '#2F9E6E'}" data-lw="0.5"/>
        <rect x="${x - 3.1}" y="${y - 3.7}" width="6.2" height="6.2" rx="1.4" fill="${last ? '#FFF1C2' : '#E7F6EE'}" data-noshade data-lw="0.3"/>
        ${stationIcon(st, x, y - 0.6)}
        <rect x="${x - 4.8}" y="${y + 3.7}" width="9.6" height="2.7" rx="1.3" fill="${INK}" data-noshade data-noline/>
        <text x="${x}" y="${y + 5.75}" font-size="1.9" font-family="Lalezar" fill="#FFFFFF" text-anchor="middle" data-flat>${STATIONS[st]}</text>`;
    } else if (k === 'start') {
      tiles += `<circle cx="${x}" cy="${y}" r="3.6" fill="#E2475F" data-lw="0.45"/>
        <text x="${x}" y="${y + 0.9}" font-size="2.2" font-family="Lalezar" fill="#FFFFFF" text-anchor="middle" data-flat>انطلق</text>`;
    } else {
      const fill = k === 'event' ? '#FFD86B' : k === 'question' ? '#7FD3CF' : '#FFFDF7';
      tiles += `<circle cx="${x}" cy="${y}" r="2.9" fill="${fill}" data-lw="0.4"/>`;
      if (k === 'event') tiles += star8(x, y, 1.5, '#E09A1A', 'data-noshade data-lw="0.2"');
      if (k === 'question') tiles += `<text x="${x}" y="${y + 1.25}" font-size="3.4" font-family="Lilita" fill="#0F5E5A" text-anchor="middle" data-flat>؟</text>`;
    }
  }
  return svg100(`${bg}${road}${tiles}<rect x="0.3" y="0.3" width="${W - 0.6}" height="${H - 0.6}" fill="none" stroke="${INK}" stroke-width="0.6" data-flat/>`, '', `0 0 ${W} ${H}`);
}
