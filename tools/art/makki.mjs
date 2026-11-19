// Emblem for «مكية أم مدنية؟» (100×100, mascot pass): the Kaaba (Makkah) on the left and the green dome
// (Madinah) on the right, standing on a surah heading band with its gold medallion — which city is it?
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const GOLD = '#E9C46A';
const CREAM = '#FFF4DA';
const KAABA = '#1B1B22';
const DOME = '#2FA36B';

/** The Kaaba: a dark cube seen a little from the side, a gold band near the top, the door. */
function kaaba(x, y) {
  return `
    <path d="M${x} ${y + 4} L${x + 16} ${y} L${x + 24} ${y + 4} L${x + 8} ${y + 8}Z" fill="#3A3A46" data-lw="0.9"/>
    <path d="M${x} ${y + 4} L${x + 8} ${y + 8} V${y + 32} L${x} ${y + 28}Z" fill="#2A2A33" data-lw="0.9"/>
    <path d="M${x + 8} ${y + 8} L${x + 24} ${y + 4} V${y + 28} L${x + 8} ${y + 32}Z" fill="${KAABA}" data-lw="0.9"/>
    <path d="M${x} ${y + 9} L${x + 8} ${y + 13} L${x + 24} ${y + 9} V${y + 12.4} L${x + 8} ${y + 16.4} L${x} ${y + 12.4}Z" fill="${GOLD}" data-flat/>
    <path d="M${x + 14} ${y + 18.5} L${x + 19} ${y + 17.3} V${y + 27} L${x + 14} ${y + 28.2}Z" fill="${GOLD}" opacity="0.9" data-flat/>`;
}

/** The green dome on its drum, a crescent on top. */
function dome(cx, base) {
  return `
    <rect x="${cx - 11}" y="${base - 10}" width="22" height="10" rx="1.5" fill="#E8DCC0" data-shade="0.85"/>
    <path d="M${cx - 8} ${base - 6} V${base - 2} M${cx} ${base - 6} V${base - 2} M${cx + 8} ${base - 6} V${base - 2}" stroke="#8F7D58" stroke-width="1.6" stroke-linecap="round" data-flat/>
    <path d="M${cx - 12} ${base - 10} C${cx - 15} ${base - 20} ${cx - 9} ${base - 31} ${cx} ${base - 32} C${cx + 9} ${base - 31} ${cx + 15} ${base - 20} ${cx + 12} ${base - 10}Z" fill="${DOME}" data-shade="0.82"/>
    <path d="M${cx} ${base - 32} V${base - 37}" stroke="${GOLD}" stroke-width="1.6" data-flat/>
    <path d="M${cx + 2.6} ${base - 42.5} A3.4 3.4 0 1 0 ${cx + 2.6} ${base - 36.5} A2.6 2.6 0 1 1 ${cx + 2.6} ${base - 42.5}Z" fill="${GOLD}" data-flat/>
    <path d="M${cx - 7} ${base - 22} Q${cx - 6} ${base - 27} ${cx - 2} ${base - 29}" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="1.6" fill="none" stroke-linecap="round" data-flat/>`;
}

/** The surah heading band under them, with its eight-pointed medallion. */
function band() {
  return `
    <rect x="20" y="66" width="60" height="13" rx="4" fill="#1F6B4A" data-shade="0.85"/>
    <rect x="22.5" y="68.3" width="55" height="8.4" rx="2.6" fill="none" stroke="${GOLD}" stroke-width="0.9" data-flat/>
    <g transform="translate(50 72.5)">
      <rect x="-5" y="-5" width="10" height="10" rx="1" fill="${GOLD}" data-lw="0.8"/>
      <rect x="-5" y="-5" width="10" height="10" rx="1" fill="${GOLD}" transform="rotate(45)" data-lw="0.8"/>
      <circle r="2.6" fill="#1F6B4A" data-flat/>
    </g>
    <path d="M28 72.5 H40 M60 72.5 H72" stroke="${CREAM}" stroke-opacity="0.7" stroke-width="1.4" stroke-linecap="round" data-flat/>`;
}

export function makki() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#173F55', '#2C6E8E', ['#E9B23A', '#FFE08A'])}
    ${kaaba(19, 33)}
    ${dome(66, 64)}
    ${band()}
    <path d="M50 22 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4Z" fill="${CREAM}" data-flat/>
    <circle cx="36" cy="25" r="1.3" fill="${CREAM}" data-flat/>`);
}
