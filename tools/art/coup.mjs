// Emblem for «الانقلاب» (100×100, mascot pass): two court cards fanned on the wine-red palace seal — a navy back
// with a gold eight-pointed star, and in front «الوزير» himself (white turban with a red gem, a dark beard) who
// winks: is it really his card? A little stack of gold coins at his feet.
import { INK, blush, brow, eye, smile, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const GOLD = '#E8B44A';
const NAVY = '#22204F';
const PURPLE = '#7B3FA0';
const SKIN = '#E9B98F';

function star8(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.72 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')}Z`;
}

function back() {
  const x = 16, y = 27, w = 34, h = 48, cx = x + w / 2, cy = y + h / 2;
  return `<g transform="rotate(-13 ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4.5" fill="${NAVY}" data-shade="0.85"/>
    <rect x="${x + 2.6}" y="${y + 2.6}" width="${w - 5.2}" height="${h - 5.2}" rx="3" fill="none" stroke="${GOLD}" stroke-width="1.1" data-flat/>
    <path d="${star8(cx, cy, 10)}" fill="${GOLD}" data-lw="0.8"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="${NAVY}" data-flat/>
  </g>`;
}

function front() {
  const x = 42, y = 20, w = 40, h = 56, cx = x + w / 2, cy = y + h / 2;
  const fx = cx, fy = 50;
  return `<g transform="rotate(9 ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4.5" fill="${PURPLE}" data-shade="0.85"/>
    <rect x="${x + 2.4}" y="${y + 2.4}" width="${w - 4.8}" height="${h - 4.8}" rx="3" fill="${CREAM}" data-noline/>
    <path d="M${x + 6} ${y + h - 9} V${y + 20} C${x + 6} ${y + 10} ${x + 13} ${y + 6} ${cx} ${y + 6} C${x + w - 13} ${y + 6} ${x + w - 6} ${y + 10} ${x + w - 6} ${y + 20} V${y + h - 9}Z" fill="#D9C2E6" stroke="${GOLD}" stroke-width="1.2" data-flat/>
    <path d="M${cx - 14} ${y + h - 9} C${cx - 14} ${y + h - 18} ${cx - 7} ${y + h - 21} ${cx} ${y + h - 21} C${cx + 7} ${y + h - 21} ${cx + 14} ${y + h - 18} ${cx + 14} ${y + h - 9}Z" fill="${PURPLE}" data-lw="0.9"/>
    <path d="M${cx - 4} ${y + h - 20} L${cx} ${y + h - 13} L${cx + 4} ${y + h - 20}" stroke="${GOLD}" stroke-width="1.4" fill="none" data-flat/>
    <circle cx="${fx}" cy="${fy}" r="9.5" fill="${SKIN}" data-lw="0.9"/>
    <path d="M${fx - 9} ${fy + 1.5} C${fx - 8.5} ${fy + 11} ${fx - 3} ${fy + 13.5} ${fx} ${fy + 13.5} C${fx + 3} ${fy + 13.5} ${fx + 8.5} ${fy + 11} ${fx + 9} ${fy + 1.5} C${fx + 6} ${fy + 7} ${fx - 6} ${fy + 7} ${fx - 9} ${fy + 1.5}Z" fill="#5A3B2A" data-lw="0.8"/>
    ${eye(fx - 3.6, fy - 1.2, { w: 5.6, h: 4.2, iris: '#6B3A1F', side: -1, look: 0.4 })}
    <path d="M${fx + 1.2} ${fy - 1.2} Q${fx + 3.8} ${fy + 0.8} ${fx + 6.2} ${fy - 1.2}" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round" data-flat/>
    ${brow(fx - 3.6, fy - 4.8, { w: 5.4, side: -1, angle: -0.3, t: 1.4 })}
    ${brow(fx + 3.8, fy - 4.6, { w: 5.4, side: 1, angle: 0.4, t: 1.4 })}
    ${blush(fx + 5.6, fy + 2.4, 1.8)}
    ${smile(fx + 0.6, fy + 4.6, 5.6, { smirk: 1.2 })}
    <ellipse cx="${fx}" cy="${fy - 9}" rx="12.5" ry="7.2" fill="#FFFFFF" data-lw="0.9"/>
    <path d="M${fx - 11} ${fy - 9} Q${fx} ${fy - 14} ${fx + 11} ${fy - 9}" stroke="#D9D1C2" stroke-width="1" fill="none" data-flat/>
    <circle cx="${fx}" cy="${fy - 12}" r="2.3" fill="#D7263D" data-lw="0.7"/>
    <path d="M${fx} ${fy - 14} C${fx - 2} ${fy - 18} ${fx} ${fy - 21} ${fx + 3} ${fy - 22}" stroke="${GOLD}" stroke-width="1.3" fill="none" stroke-linecap="round" data-flat/>
  </g>`;
}

function coins(cx, cy) {
  return [0, 1, 2]
    .map((i) => `<ellipse cx="${cx}" cy="${cy - i * 3.6}" rx="7.5" ry="3" fill="${GOLD}" data-lw="0.8"/>`)
    .join('');
}

export function coup() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#9C3D54', ['#9C3D54', '#E8B44A'])}
    ${back()}
    ${front()}
    ${coins(30, 80)}
    <circle cx="80" cy="22" r="1.5" fill="${CREAM}" data-flat/>
    <path d="M22 20 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4Z" fill="${CREAM}" data-flat/>`);
}
