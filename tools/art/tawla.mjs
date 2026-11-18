// Emblem for «الطاولة» (100×100, mascot pass): a wooden backgammon board with its triangles in bone and rust,
// ivory and ebony checkers on the points, and two dice thrown in front of it (a 6 and a 5).
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const BONE = '#F2DEB4';
const RUST = '#A0412A';
const IVORY = '#FBF3E2';
const EBONY = '#3A241B';

function board() {
  const x0 = 17, y0 = 25, w = 66, h = 40, f = 3.4, bar = 5;
  const half = (w - 2 * f - bar) / 2;
  const cw = half / 4;
  let tris = '';
  for (let k = 0; k < 8; k++) {
    const x = x0 + f + k * cw + (k >= 4 ? bar : 0);
    const top = y0 + f, bot = y0 + h - f, len = (h - 2 * f) * 0.4;
    tris += `<path d="M${x + 0.3} ${top} L${x + cw - 0.3} ${top} L${x + cw / 2} ${top + len}Z" fill="${k % 2 ? RUST : BONE}" data-noline data-flat/>`;
    tris += `<path d="M${x + 0.3} ${bot} L${x + cw - 0.3} ${bot} L${x + cw / 2} ${bot - len}Z" fill="${k % 2 ? BONE : RUST}" data-noline data-flat/>`;
  }
  const chk = (cx, cy, c) => `<circle cx="${cx}" cy="${cy}" r="3.3" fill="${c}" data-lw="0.8"/><circle cx="${cx}" cy="${cy}" r="1.6" fill="none" stroke="${c === IVORY ? '#C9AE82' : '#8E6440'}" stroke-width="0.6" data-flat/>`;
  const colX = (k) => x0 + f + k * cw + (k >= 4 ? bar : 0) + cw / 2;
  return `
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="4" fill="#5A3118" data-shade="0.8"/>
    <rect x="${x0 + f}" y="${y0 + f}" width="${half}" height="${h - 2 * f}" fill="#D3A061" data-noline data-flat/>
    <rect x="${x0 + f + half + bar}" y="${y0 + f}" width="${half}" height="${h - 2 * f}" fill="#D3A061" data-noline data-flat/>
    ${tris}
    ${chk(colX(0), y0 + f + 3.3, IVORY)}${chk(colX(0), y0 + f + 9.6, IVORY)}
    ${chk(colX(7), y0 + f + 3.3, EBONY)}${chk(colX(7), y0 + f + 9.6, EBONY)}
    ${chk(colX(3), y0 + h - f - 3.3, EBONY)}
    ${chk(colX(5), y0 + h - f - 3.3, IVORY)}${chk(colX(5), y0 + h - f - 9.6, IVORY)}
    ${chk(colX(6), y0 + h - f - 3.3, IVORY)}`;
}

function die(cx, cy, s, rot, pips) {
  const P = { 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] }[pips];
  const g = s * 0.27;
  return `
    <g transform="rotate(${rot} ${cx} ${cy})">
      <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${IVORY}" data-shade="0.86"/>
      ${P.map(([a, b]) => `<circle cx="${cx + a * g}" cy="${cy + b * g}" r="${s * 0.085}" fill="${INK}" data-flat/>`).join('')}
    </g>`;
}

export function tawla() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#4A2412', '#9A6233')}
    ${board()}
    ${die(41, 72, 15, -12, 6)}
    ${die(60, 74, 15, 10, 5)}
    <circle cx="26" cy="18" r="1.4" fill="#FFF4DA" data-flat/>
    <circle cx="76" cy="19" r="1.1" fill="#FFF4DA" data-flat/>`);
}
