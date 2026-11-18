// Emblem for «الروابط» (100×100, mascot pass): the board half solved — a yellow and a green group locked in
// as bars, two rows of word tiles below (three of them picked), and a little chain link: the hidden «رابط».
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const TILE = '#EFE8D6';
const PICKED = '#5B5591';
const INK = '#24203F';

const bar = (y, fill) => `
  <rect x="23" y="${y}" width="54" height="10.5" rx="3.2" fill="${fill}" data-shade="0.86"/>
  <rect x="38" y="${y + 3.2}" width="24" height="1.8" rx="0.9" fill="${INK}" fill-opacity="0.75" data-flat/>
  <rect x="33" y="${y + 6.4}" width="34" height="1.3" rx="0.65" fill="${INK}" fill-opacity="0.45" data-flat/>`;

function tile(x, y, picked) {
  return `
  <rect x="${x}" y="${y}" width="12" height="10" rx="2.6" fill="${picked ? PICKED : TILE}" data-shade="0.88"/>
  <rect x="${x + 3}" y="${y + 4.2}" width="6" height="1.6" rx="0.8" fill="${picked ? CREAM : INK}" fill-opacity="0.7" data-flat/>`;
}

const row = (y, picks) => [23, 37, 51, 65].map((x, i) => tile(x, y, picks.includes(i))).join('');

export function rawabit() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2E9E6A', '#2B2766')}
    ${bar(24, '#F2C14E')}
    ${bar(37, '#5DBB63')}
    ${row(50.5, [1])}
    ${row(63, [0, 2])}
    <g transform="rotate(-35 74 81)">
      <rect x="64" y="78" width="12" height="7" rx="3.5" fill="none" stroke="${CREAM}" stroke-width="2.4" data-flat/>
      <rect x="72" y="78" width="12" height="7" rx="3.5" fill="none" stroke="#F2C14E" stroke-width="2.4" data-flat/>
    </g>
    <circle cx="26" cy="19" r="1.4" fill="${CREAM}" data-flat/>
    <circle cx="77" cy="18" r="1.1" fill="${CREAM}" data-flat/>`);
}
