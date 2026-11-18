// Emblem for «العقل الواحد» (100×100, mascot pass): three cream number cards fanned in rising order (12, 37,
// 81) on a calm indigo round, a thin gold thread joining them (one mind), and the gold throwing star above.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const INDIGO = '#232058';
const GOLD = '#F6B53D';

function card(x, y, rot, n) {
  const w = 22, h = 31;
  const cx = x + w / 2, cy = y + h / 2;
  return `
    <g transform="rotate(${rot} ${cx} ${cy})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${CREAM}" data-shade="0.9"/>
      <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="2.8" fill="none" stroke="${INDIGO}" stroke-opacity="0.18" stroke-width="0.8" data-flat/>
      <text x="${cx}" y="${cy + 5}" font-size="14" font-family="Lalezar" fill="${INDIGO}" text-anchor="middle" data-flat>${n}</text>
    </g>`;
}

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.38 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${pts.join(' L')}Z" fill="${GOLD}" data-lw="0.9"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.18).toFixed(2)}" fill="${INDIGO}" data-flat/>`;
}

export function mind() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#5B6CE0', ['#F6B53D', '#FFE3A3'])}
    <path d="M24 72 Q50 84 76 72" stroke="${GOLD}" stroke-width="1.6" fill="none" stroke-dasharray="2 3" stroke-linecap="round" data-flat/>
    ${card(16, 42, -16, 12)}
    ${card(39, 36, 0, 37)}
    ${card(62, 42, 16, 81)}
    ${star(50, 24, 10)}
    <circle cx="28" cy="30" r="1.5" fill="${CREAM}" data-flat/>
    <circle cx="73" cy="28" r="1.2" fill="${CREAM}" data-flat/>`);
}
