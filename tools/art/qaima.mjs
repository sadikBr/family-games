// Emblem for «املأ القائمة» (100×100, mascot pass): a cream list on a clipboard, its lines ticked one by one
// (green ticks, one golden star for a unique answer, the last line still empty), with a pencil writing the next.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const GREEN = '#2FB67C';
const GOLD = '#F6B53D';
const LINE = '#C9B48A';

const tick = (x, y) => `<path d="M${x} ${y} l2.6 2.8 l5 -6" stroke="${GREEN}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>`;

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${pts.join(' L')}Z" fill="${GOLD}" data-lw="0.8"/>`;
}

export function qaima() {
  // the list's lines (right to left: a mark at the right, the written line to its left)
  const rows = [36, 46, 56, 66];
  const lines = rows
    .map((y, i) => {
      const len = [22, 17, 20, 0][i];
      const mark = i === 1 ? star(64, y, 4.2) : i < 3 ? tick(60, y + 1) : '';
      const ink = len ? `<path d="M${56 - len} ${y} H56" stroke="#5A4A7A" stroke-width="2.6" stroke-linecap="round" data-flat/>` : '';
      return `<path d="M32 ${y + 3.6} H58" stroke="${LINE}" stroke-width="0.9" data-flat/>${ink}${mark}`;
    })
    .join('');
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#D98A2B')}
    <g transform="rotate(-6 50 52)">
      <rect x="27" y="24" width="46" height="56" rx="5" fill="#8A5A2E" data-shade="0.85"/>
      <rect x="30" y="28" width="40" height="49" rx="3" fill="${CREAM}" data-shade="0.92"/>
      <rect x="41" y="20" width="18" height="8" rx="3" fill="#B9BCCB" data-shade="0.8"/>
      ${lines}
    </g>
    <g transform="rotate(38 70 70)">
      <rect x="64" y="50" width="8" height="28" rx="1.6" fill="#F2B33D" data-shade="0.86"/>
      <rect x="64" y="48" width="8" height="4.5" rx="1.4" fill="#E2475F"/>
      <path d="M64 78 L68 86 L72 78Z" fill="#F3D7A6" data-lw="0.9"/>
      <path d="M66.8 83.6 L68 86 L69.2 83.6Z" fill="#2B2766" data-flat/>
    </g>`);
}
