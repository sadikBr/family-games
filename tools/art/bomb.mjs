// Emblem for «القنبلة» (100×100, mascot pass): a round cartoon bomb with a cheeky grin and a lit fuse sparking,
// sitting in front of two fanned cards (a green «المفكّك» card with wire cutters, a pink «لا!» card with a palm),
// on an indigo badge with a hot-red ring.
import { blush, brow, eye, smile, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const star = (cx, cy, r, n = 8, inner = 0.42) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
};

export function bomb() {
  const card = (x, y, rot, c, inner) => `
    <g transform="rotate(${rot} ${x + 13} ${y + 36})">
      <rect x="${x}" y="${y}" width="26" height="36" rx="3.5" fill="${c}" data-lw="1"/>
      <rect x="${x + 2.5}" y="${y + 7}" width="21" height="26.5" rx="2.5" fill="#FFF6E4" data-flat/>
      ${inner(x, y)}
    </g>`;
  const cutters = (x, y) => `
    <path d="M${x + 8} ${y + 31} L${x + 13} ${y + 21} L${x + 18} ${y + 31}" stroke="#23885A" stroke-width="3" fill="none" stroke-linecap="round" data-flat/>
    <path d="M${x + 13} ${y + 21} L${x + 10} ${y + 12} M${x + 13} ${y + 21} L${x + 16} ${y + 12}" stroke="#8C96A8" stroke-width="2.2" stroke-linecap="round" data-flat/>
    <path d="M${x + 4} ${y + 11} H${x + 9} M${x + 17} ${y + 11} H${x + 22}" stroke="#E2475F" stroke-width="1.8" stroke-linecap="round" data-flat/>`;
  const palm = (x, y) => `
    <g fill="#B8326E" data-flat>
      <rect x="${x + 7}" y="${y + 12}" width="3" height="10" rx="1.5"/>
      <rect x="${x + 10.6}" y="${y + 10}" width="3" height="12" rx="1.5"/>
      <rect x="${x + 14.2}" y="${y + 11}" width="3" height="11" rx="1.5"/>
      <rect x="${x + 17.6}" y="${y + 13}" width="2.8" height="9" rx="1.4"/>
      <rect x="${x + 7}" y="${y + 18}" width="13.4" height="12" rx="5"/>
    </g>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#E2543B', ['#F2C23D', '#FFE89A'])}
    ${card(20, 22, -16, '#23885A', cutters)}
    ${card(54, 22, 16, '#B8326E', palm)}
    <path d="M59 38 Q63 26 74 25" stroke="#151726" stroke-width="5.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M59 38 Q63 26 74 25" stroke="#E0B47A" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="3 2" data-flat/>
    <path d="${star(78, 23, 8.5)}" fill="#FFC93C" data-lw="0.9"/>
    <circle cx="78" cy="23" r="3" fill="#FF7A2F" data-flat/>
    <rect x="50" y="34" width="14" height="10" rx="2.5" fill="#4A4560" transform="rotate(36 57 39)"/>
    <circle cx="48" cy="60" r="22" fill="#2A2638" data-shade="0.75"/>
    <ellipse cx="39" cy="50" rx="6" ry="4.2" fill="#FFFFFF" opacity="0.22" transform="rotate(-32 39 50)" data-flat/>
    ${eye(41, 58, { w: 9, h: 6.5, iris: '#F2C23D', side: -1, look: 0.4 })}
    ${eye(55, 58, { w: 9, h: 6.5, iris: '#F2C23D', side: 1, look: 0.4 })}
    ${brow(41, 51.5, { w: 8, side: -1, angle: 0.5, t: 2, color: '#FFF4DA' })}
    ${brow(55, 51.5, { w: 8, side: 1, angle: 0.5, t: 2, color: '#FFF4DA' })}
    ${smile(48, 67, 11, { open: true, teeth: true })}
    ${blush(36, 65, 2.6)}${blush(60, 65, 2.6)}
    <path d="M24 82 L20 86 M72 82 L76 86 M48 86 V90" stroke="#FFE89A" stroke-width="2" stroke-linecap="round" data-flat/>`);
}
