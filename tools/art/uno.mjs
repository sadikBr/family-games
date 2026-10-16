// UNO FLIP faces in the mascot style (200×300).
import { INK } from './mkit.mjs';

export const HEX = {
  red: '#E23B3B', yellow: '#F4C21B', green: '#3AA845', blue: '#2D6FD8',
  pink: '#E6338F', teal: '#14A3A0', orange: '#F27B1F', purple: '#7A3CC2',
};
const LIGHT = ['red', 'yellow', 'green', 'blue'];
const DARK = ['pink', 'teal', 'orange', 'purple'];
const DARK_BG = '#1B1B2B';

/** Outlined text (thick ink outline + offset shadow). */
function label(x, y, txt, size, fill, { shadow = true, rot = 0 } = {}) {
  const t = (dx, dy, f, sw, extra = '') =>
    `<text x="${x + dx}" y="${y + dy}" font-family="Lilita" font-size="${size}" text-anchor="middle" fill="${f}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke" transform="rotate(${rot} ${x} ${y})" ${extra} data-flat>${txt}</text>`;
  return (shadow ? t(size * 0.05, size * 0.06, INK, size * 0.16) : '') + t(0, 0, fill, size * 0.14);
}

/* glyphs, centred on (0,0), about 100 units tall */
const g = {
  skip: (c) => `<circle r="34" fill="none" stroke="${INK}" stroke-width="22" data-flat/><circle r="34" fill="none" stroke="${c}" stroke-width="13" data-flat/>
    <path d="M-24 24 L24 -24" stroke="${INK}" stroke-width="22" stroke-linecap="round" data-flat/><path d="M-24 24 L24 -24" stroke="${c}" stroke-width="13" stroke-linecap="round" data-flat/>`,
  reverse: (c) => {
    const arrow = (rot) => `<g transform="rotate(${rot})">
      <path d="M-30 6 C-30 -22 -6 -30 18 -26" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round" data-flat/>
      <path d="M8 -46 L36 -26 L8 -6Z" fill="${INK}" stroke="${INK}" stroke-width="8" stroke-linejoin="round" data-flat/>
      <path d="M-30 6 C-30 -22 -6 -30 18 -26" fill="none" stroke="${c}" stroke-width="11" stroke-linecap="round" data-flat/>
      <path d="M12 -38 L30 -26 L12 -14Z" fill="${c}" data-flat/></g>`;
    return arrow(0) + arrow(180);
  },
  flip: (c, dark) => `<g transform="rotate(-14)">
      <rect x="-24" y="-34" width="48" height="68" rx="8" fill="${dark ? '#F7F3EA' : DARK_BG}" stroke="${INK}" stroke-width="5" data-flat/>
      <path d="M-24 34 L24 -34 H16 A8 8 0 0 1 24 -26 V26 A8 8 0 0 1 16 34Z" fill="${c}" data-flat/>
      <rect x="-24" y="-34" width="48" height="68" rx="8" fill="none" stroke="${INK}" stroke-width="5" data-flat/></g>
    <path d="M-40 -20 C-44 -46 -12 -56 8 -48" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round" data-flat/>
    <path d="M-40 -20 C-44 -46 -12 -56 8 -48" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" data-flat/>
    <path d="M40 20 C44 46 12 56 -8 48" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round" data-flat/>
    <path d="M40 20 C44 46 12 56 -8 48" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" data-flat/>`,
  skipAll: (c) => `${g.skip(c)}
    <path d="M-48 -8 A50 50 0 0 1 8 -48" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round" data-flat/><path d="M-48 -8 A50 50 0 0 1 8 -48" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" data-flat/>
    <path d="M48 8 A50 50 0 0 1 -8 48" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round" data-flat/><path d="M48 8 A50 50 0 0 1 -8 48" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" data-flat/>`,
};

function wildOval(colors, w = 46, h = 72) {
  const q = (i) => {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 2, a1 = a0 + Math.PI / 2;
    return `<path d="M0 0 L${(w * Math.cos(a0)).toFixed(1)} ${(h * Math.sin(a0)).toFixed(1)} A${w} ${h} 0 0 1 ${(w * Math.cos(a1)).toFixed(1)} ${(h * Math.sin(a1)).toFixed(1)}Z" fill="${HEX[colors[i]]}" data-flat/>`;
  };
  return `<g transform="rotate(28)">${[0, 1, 2, 3].map(q).join('')}<ellipse rx="${w}" ry="${h}" fill="none" stroke="${INK}" stroke-width="6" data-flat/></g>`;
}

/** One card face. kind: num | draw1 | reverse | skip | flip | wild | wild2 | draw5 | skipAll | wildColor */
export function face(side, color, kind, n) {
  const dark = side === 'dark';
  const border = dark ? DARK_BG : '#FFFFFF';
  const wild = kind === 'wild' || kind === 'wild2' || kind === 'wildColor';
  const c = wild ? null : HEX[color];
  const panel = wild ? DARK_BG : c;
  const oval = dark ? DARK_BG : '#FFFFFF';
  const ink = wild ? '#FFFFFF' : c;
  let center = '', corner = '';
  if (kind === 'num') {
    center = label(100, 188, n, 120, ink);
    if (n === 6 || n === 9) center += `<rect x="78" y="196" width="44" height="10" rx="4" fill="${ink}" stroke="${INK}" stroke-width="4" data-flat/>`;
    corner = String(n);
  } else if (kind === 'draw1' || kind === 'draw5' || kind === 'wild2') {
    const k = kind === 'draw1' ? '+1' : kind === 'draw5' ? '+5' : '+2';
    if (kind === 'wild2') center = wildOval(dark ? DARK : LIGHT) + label(100, 178, k, 66, '#FFFFFF');
    else center = label(100, 182, k, 92, ink);
    corner = k;
  } else if (kind === 'wild') {
    center = wildOval(dark ? DARK : LIGHT);
    corner = '';
  } else if (kind === 'wildColor') {
    center = wildOval(DARK) + label(100, 178, '+?', 62, '#FFFFFF');
    corner = '+?';
  } else {
    center = `<g transform="translate(100 150) scale(0.95)">${g[kind](c, dark)}</g>`;
    corner = '';
  }
  const cornerGlyph = (x, y, rot) =>
    corner
      ? label(x, y, corner, 34, '#FFFFFF', { shadow: false, rot })
      : kind === 'wild' || wild
        ? `<g transform="translate(${x} ${y - 11}) scale(0.24)">${wildOval(dark ? DARK : LIGHT)}</g>`
        : `<g transform="translate(${x} ${y - 11}) scale(0.26) rotate(${rot})">${g[kind]('#FFFFFF', dark)}</g>`;
  const ovalShape = wild ? '' : `<ellipse cx="100" cy="150" rx="62" ry="98" transform="rotate(28 100 150)" fill="${oval}" data-noshade data-lw="2.2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs></defs>
    <rect x="4" y="4" width="192" height="292" rx="18" fill="${border}" data-shade="0.9" data-off="0.03" data-lw="1.8"/>
    <rect x="16" y="16" width="168" height="268" rx="12" fill="${panel}" data-off="0.05" data-lw="1.6"/>
    ${ovalShape}
    ${wild ? `<g transform="translate(100 150)"></g>` : ''}
    ${wild ? `<g transform="translate(100 150) scale(1.15)">${center.startsWith('<g transform="rotate(28)') ? center.slice(0, center.indexOf('</g>') + 4) : wildOval(dark ? DARK : LIGHT)}</g>${center.slice(center.indexOf('</g>') + 4).replace(/x="100" y="178"/g, 'x="100" y="172"')}` : center}
    ${cornerGlyph(38, 56, 0)}
    <g transform="rotate(180 100 150)">${cornerGlyph(38, 56, 0)}</g>
  </svg>`;
}

export function allFaces() {
  const out = [];
  for (const side of ['light', 'dark']) {
    const cols = side === 'light' ? LIGHT : DARK;
    const acts = side === 'light' ? ['draw1', 'reverse', 'skip', 'flip'] : ['draw5', 'reverse', 'skipAll', 'flip'];
    for (const col of cols) {
      for (let n = 1; n <= 9; n++) out.push([side, col, 'num', n]);
      for (const k of acts) out.push([side, col, k]);
    }
    for (const k of side === 'light' ? ['wild', 'wild2'] : ['wild', 'wildColor']) out.push([side, null, k]);
  }
  return out;
}
