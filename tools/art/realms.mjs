// Emblem for «الممالك الخمس» (100×100, mascot pass): three cards fanned out — a red flame 7, a purple
// star joker in the middle, a blue drop K — under a golden crown, the other two realms (sun, leaf) as
// small tokens: five suits and a wild that changes every round.
import { svg100 } from './mkit.mjs';
import { SHIELD, SHIELD_IN, base } from './games2.mjs';

const FLAME = 'M0 -9 C2 -5 6 -3 6 2 C6 6 3.5 9 0 9 C-3.5 9 -6 6 -6 2.5 C-6 -0.5 -4 -2.5 -2.5 -4.5 C-2.2 -1.8 -1.2 -0.4 -0.2 0.2 C-1 -3 -1 -6 0 -9Z';
const DROP = 'M0 -9 C2.5 -4.5 6.5 -1.5 6.5 2.6 C6.5 6.4 3.6 9 0 9 C-3.6 9 -6.5 6.4 -6.5 2.6 C-6.5 -1.5 -2.5 -4.5 0 -9Z';
const LEAF = 'M0 -9 C6.5 -5 7.5 3 0.5 9 L0 9.6 L-0.5 9 C-7.5 3 -6.5 -5 0 -9Z';

function star(cx, cy, r, inner = 0.46) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')}Z`;
}

function card(x, y, rot, label, color, symbol) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-13" y="-18" width="26" height="36" rx="3.5" fill="#FFF9EE" data-shade="0.88"/>
    <text x="-7.5" y="-8.5" font-size="8" font-family="Lilita" fill="${color}" text-anchor="middle" data-flat>${label}</text>
    <g transform="translate(0 4) scale(0.95)"><path d="${symbol}" fill="${color}" data-lw="0.8"/></g></g>`;
}

export function realms() {
  const joker = `<g transform="translate(50 51) rotate(0) scale(0.94)">
    <rect x="-13" y="-18" width="26" height="36" rx="3.5" fill="#2A2350" data-shade="0.9"/>
    <path d="${star(0, 1, 10)}" fill="#F2C23D" data-lw="0.8"/>
    <text x="0" y="15.5" font-size="5.6" font-family="Lilita" fill="#F2C23D" text-anchor="middle" data-flat>JOKER</text></g>`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#4A1F66', '#9C4DB5', ['#F2C23D', '#FFE89A'])}
    ${card(28, 58, -22, '7', '#D7263D', FLAME)}
    ${card(72, 58, 22, 'K', '#1F7AE0', DROP)}
    ${joker}
    <path d="M37 27 L35 15 L42.5 21 L50 12 L57.5 21 L65 15 L63 27Z" fill="#F2C23D"/>
    <circle cx="50" cy="12" r="2.2" fill="#FFE89A" data-noline/>
    <circle cx="27" cy="31" r="6.5" fill="#FFF4DA" data-shade="0.86"/>
    <circle cx="27" cy="31" r="3" fill="#E59A12" data-noline/>
    <path d="M27 25.6 V27 M27 35 V36.4 M21.6 31 H23 M31 31 H32.4" stroke="#E59A12" stroke-width="1.4" stroke-linecap="round" data-flat/>
    <circle cx="73" cy="31" r="6.5" fill="#FFF4DA" data-shade="0.86"/>
    <g transform="translate(73 31) scale(0.5)"><path d="${LEAF}" fill="#2E9E4F" data-noline/></g>
    <path d="M30 76 H70 L66 83 H34Z" fill="#F2C23D"/>
    <path d="M40 79.5 H60" stroke="#B5651D" stroke-width="1.4" stroke-linecap="round" data-flat/>`);
}
