// Emblem for «رتّب الأحداث» (100×100, mascot pass): three cards pinned in order on a timeline that runs right to
// left — a pyramid (antiquity), a dome with a crescent (Islamic history), a rocket (our time).
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';

function card(cx, top, rot, inner) {
  const w = 22, h = 28, x = cx - w / 2;
  return `
    <g transform="rotate(${rot} ${cx} ${top + h})">
      <rect x="${x}" y="${top}" width="${w}" height="${h}" rx="3.6" fill="${CREAM}" data-shade="0.9"/>
      ${inner(cx, top + h / 2)}
    </g>`;
}

const pyramid = (cx, cy) => `
  <path d="M${cx - 7.5} ${cy + 6} L${cx} ${cy - 7} L${cx + 7.5} ${cy + 6}Z" fill="#D9A04A" data-lw="0.9"/>
  <path d="M${cx} ${cy - 7} L${cx + 2.2} ${cy + 6} L${cx + 7.5} ${cy + 6}Z" fill="#B47A2C" data-noline data-flat/>
  <circle cx="${cx + 4.5}" cy="${cy - 6}" r="1.8" fill="#F2B33D" data-flat/>`;

const dome = (cx, cy) => `
  <path d="M${cx - 7} ${cy + 7} V${cy + 2} Q${cx - 7.5} ${cy - 2} ${cx - 2.5} ${cy - 4} Q${cx} ${cy - 5} ${cx} ${cy - 6.5} Q${cx} ${cy - 5} ${cx + 2.5} ${cy - 4} Q${cx + 7.5} ${cy - 2} ${cx + 7} ${cy + 2} V${cy + 7}Z" fill="#2FB67C" data-lw="0.9"/>
  <rect x="${cx - 8.5}" y="${cy + 6.5}" width="17" height="3" rx="1" fill="#1E8A5C" data-lw="0.8"/>
  <path d="M${cx - 1.6} ${cy + 6.5} V${cy + 3.5} Q${cx} ${cy + 1.6} ${cx + 1.6} ${cy + 3.5} V${cy + 6.5}Z" fill="#155238" data-flat/>
  <path d="M${cx + 1.2} ${cy - 13.2} A3 3 0 1 0 ${cx + 1.2} ${cy - 7.8} A2.4 2.4 0 1 1 ${cx + 1.2} ${cy - 13.2}Z" fill="#F2B33D" data-lw="0.6"/>`;

const rocket = (cx, cy) => `
  <path d="M${cx} ${cy - 9} Q${cx + 4.5} ${cy - 4} ${cx + 3.4} ${cy + 4} H${cx - 3.4} Q${cx - 4.5} ${cy - 4} ${cx} ${cy - 9}Z" fill="#E2475F" data-lw="0.9"/>
  <circle cx="${cx}" cy="${cy - 2}" r="1.8" fill="#9FD8FF" data-lw="0.6"/>
  <path d="M${cx - 3.4} ${cy + 1} L${cx - 6} ${cy + 5} H${cx - 3}Z M${cx + 3.4} ${cy + 1} L${cx + 6} ${cy + 5} H${cx + 3}Z" fill="#4F5BD5" data-lw="0.7"/>
  <path d="M${cx - 1.8} ${cy + 4.5} Q${cx} ${cy + 9.5} ${cx + 1.8} ${cy + 4.5}Z" fill="#F2B33D" data-flat/>`;

export function tartib() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#5A2E0E', '#C77D2E')}
    <path d="M20 71 H82" stroke="${CREAM}" stroke-width="3.2" stroke-linecap="round" data-flat/>
    <path d="M23.5 66.5 L17 71 L23.5 75.5" stroke="${CREAM}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <path d="M72 64 V71 M50 58 V71 M28 64 V71" stroke="${CREAM}" stroke-width="2" data-flat/>
    ${card(72, 37, 7, pyramid)}
    ${card(50, 30, 0, dome)}
    ${card(28, 37, -7, rocket)}
    <circle cx="72" cy="71" r="3.4" fill="#F2B33D" data-lw="0.9"/>
    <circle cx="50" cy="71" r="3.4" fill="#F2B33D" data-lw="0.9"/>
    <circle cx="28" cy="71" r="3.4" fill="#F2B33D" data-lw="0.9"/>
    <path d="M40 80 H44 M56 80 H60" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.6" stroke-linecap="round" data-flat/>`);
}
