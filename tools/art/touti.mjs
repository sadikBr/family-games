// Emblem for «التوتي» (100×100, mascot pass): the king and the horse of cups fanned out — the pair
// that is «sung» (الغناء) — with a little music note.
import { svg100 } from './mkit.mjs';
import { SHIELD, SHIELD_IN, base } from './games2.mjs';

const cup = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})">
    <path d="M-7 -6 H7 C7 0 4 3 0 3 C-4 3 -7 0 -7 -6Z" fill="#F6D433"/>
    <path d="M-7 -6 H7" stroke="#E1333F" stroke-width="2.2" data-flat/>
    <path d="M-1.4 3 H1.4 V7 H-1.4Z" fill="#2E8FD6" data-noline/>
    <path d="M-5 9.5 H5 L3.5 6.8 H-3.5Z" fill="#2E8FD6"/></g>`;

export function touti() {
  const card = (x, y, rot, label, top) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-14" y="-20" width="28" height="40" rx="3.5" fill="#FFFDF6" data-shade="0.88"/>
    <rect x="-11" y="-17" width="22" height="34" rx="2" fill="none" stroke="#E1333F" stroke-width="0.9" data-flat/>
    <text x="-7.5" y="-9" font-size="8" font-family="Lilita" fill="#E1333F" text-anchor="middle" data-flat>${label}</text>
    ${top}
    ${cup(1.5, 8, 0.85)}</g>`;
  const crown = `<path d="M-6 -1 L-6 -9 L-3 -5 L0 -11 L3 -5 L6 -9 L6 -1Z" fill="#F2C23D"/>`;
  // a horse's head facing left: neck, ear, long face down to the muzzle
  const horse = `<path d="M5 0 L4 -6 C4 -9 2 -11 0 -11.5 L1 -13.5 L-1.2 -11.8 C-3.5 -11.5 -5.5 -9.5 -6.8 -7 C-7.4 -5.8 -6.6 -4.8 -5.4 -5.2 L-2.6 -6.4 C-2.4 -4 -3.4 -2 -4 0Z" fill="#B5652B"/><circle cx="-1.6" cy="-9" r="0.8" fill="#151726" data-noline/>`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#4A1730', '#8E3B5E', ['#F2C23D', '#FFE89A'])}
    ${card(38, 52, -14, '12', crown)}${card(62, 52, 14, '11', horse)}
    <g transform="translate(52 22)">
      <rect x="-0.2" y="-9" width="2.4" height="11" fill="#F2C23D" data-lw="0.8"/>
      <path d="M2.2 -9 C6 -8 8.5 -5.5 8 -1.5 C7 -4 5 -5 2.2 -5Z" fill="#F2C23D" data-lw="0.8"/>
      <ellipse cx="-1.6" cy="2.4" rx="3.6" ry="2.7" fill="#F2C23D" transform="rotate(-20 -1.6 2.4)"/>
    </g>
    <path d="M32 77 H68 L64 84 H36Z" fill="#F2C23D"/>`);
}
