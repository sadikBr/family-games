// Emblem for «سلسلة الذاكرة» (100×100, mascot pass): the four pads of the game in a tilted 2×2 — red circle,
// blue square, yellow triangle, green star — with the yellow one lit (a soft halo and a little music note),
// on a violet medallion with small wings.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';

function pad(x, y, s, fill, inner, lit = false) {
  return `
    ${lit ? `<rect x="${x - 4}" y="${y - 4}" width="${s + 8}" height="${s + 8}" rx="9.5" fill="#FFF3B8" fill-opacity="0.4" data-noline data-flat/>` : ''}
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="6" fill="${fill}" data-shade="${lit ? 0.92 : 0.82}"/>
    ${inner(x + s / 2, y + s / 2)}`;
}

const circle = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="5.6" fill="${CREAM}" data-flat/>`;
const square = (cx, cy) => `<rect x="${cx - 5.2}" y="${cy - 5.2}" width="10.4" height="10.4" rx="1.6" fill="${CREAM}" data-flat/>`;
const triangle = (cx, cy) => `<path d="M${cx} ${cy - 6.4} L${cx + 6.6} ${cy + 5.2} L${cx - 6.6} ${cy + 5.2}Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round" data-flat/>`;
function star(cx, cy, r = 7) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${pts.join(' L')}Z" fill="${CREAM}" data-flat/>`;
}

export function silsila() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#5B44B8', ['#7A5BD6', '#B49BF2'])}
    <g transform="rotate(-8 50 52)">
      ${pad(25.5, 26.5, 23, '#E2475F', circle)}
      ${pad(51.5, 26.5, 23, '#3D8BE9', square)}
      ${pad(25.5, 52.5, 23, '#F2B33D', triangle, true)}
      ${pad(51.5, 52.5, 23, '#2FB67C', star)}
    </g>
    <path d="M17 80 v-11 l8 -2.2 v10" stroke="${CREAM}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <circle cx="15.2" cy="80.4" r="2.6" fill="${CREAM}" data-flat/>
    <circle cx="23.2" cy="77.4" r="2.6" fill="${CREAM}" data-flat/>
    <circle cx="74" cy="20" r="1.6" fill="${CREAM}" data-flat/>
    <path d="M80 74 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4Z" fill="${CREAM}" data-flat/>`);
}
