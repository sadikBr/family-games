// Emblem for «كلم» (100×100, mascot pass): two magenta letter cards («م» and «ل») with a yellow star card
// laid across them, tilted — change one letter and the word becomes another.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const MAGENTA = '#D81B60';
const YELLOW = '#F6B53D';

function card(x, y, w, h, fill, rot, inner) {
  const cx = x + w / 2, cy = y + h / 2;
  return `
    <g transform="rotate(${rot} ${cx} ${cy})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4.2" fill="${fill}" data-shade="0.86"/>
      <rect x="${x + 2.2}" y="${y + 2.2}" width="${w - 4.4}" height="${h - 4.4}" rx="3" fill="none" stroke="${CREAM}" stroke-opacity="0.35" stroke-width="0.8" data-flat/>
      ${inner(cx, cy)}
    </g>`;
}

const stroke = (d, w = 3.4) => `<path d="${d}" stroke="${CREAM}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>`;

/** «ل»: a tall stem curving into a cup. */
const lam = (cx, cy) => stroke(`M${cx + 3} ${cy - 10} V${cy + 4} Q${cx + 3} ${cy + 9} ${cx - 2} ${cy + 9} Q${cx - 6.5} ${cy + 9} ${cx - 6.5} ${cy + 4}`);

/** «م»: a little loop with its tail. */
const mim = (cx, cy) => `
  <circle cx="${cx + 1.5}" cy="${cy - 1}" r="3.8" fill="none" stroke="${CREAM}" stroke-width="3.2" data-flat/>
  ${stroke(`M${cx - 2.2} ${cy + 0.6} Q${cx - 5} ${cy + 3} ${cx - 5} ${cy + 10}`, 3.2)}`;

/** The star card's star. */
function star(cx, cy, r = 8.5) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${pts.join(' L')}Z" fill="${CREAM}" data-lw="0.9"/>`;
}

export function kalim() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#4A3F9E', ['#D6336C', '#F47BA0'])}
    ${card(18, 32, 24, 34, MAGENTA, -9, mim)}
    ${card(58, 32, 24, 34, MAGENTA, 9, lam)}
    ${card(38, 27, 25, 36, YELLOW, -4, (cx, cy) => star(cx, cy))}
    <circle cx="27" cy="20" r="1.6" fill="${CREAM}" data-flat/>
    <circle cx="73" cy="22" r="1.2" fill="${CREAM}" data-flat/>
    <path d="M50 74 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6Z" fill="${CREAM}" data-flat/>`);
}
