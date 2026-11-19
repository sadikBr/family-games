// Emblem for «خمّن من الإيموجي» (100×100, mascot pass): a big yellow emoji face thinking hard (one brow raised,
// a hand on its chin) with a cream speech bubble holding an Arabic question mark «؟», and two little emoji
// tiles (a heart and a star) floating by — decode the emojis.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const YELLOW = '#F6C43D';
const AMBER = '#E9A21F';

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')}Z`;
}

export function emoji() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#4A3F9E', [AMBER, '#FFD36B'])}
    <rect x="16" y="22" width="15" height="15" rx="4.5" fill="#E2475F" transform="rotate(-12 23.5 29.5)" data-shade="0.88"/>
    <path d="M23.5 33.6 C18.4 30.2 19.2 25.6 22 25.8 Q23.2 25.9 23.5 27.4 Q23.8 25.9 25 25.8 C27.8 25.6 28.6 30.2 23.5 33.6Z" fill="${CREAM}" transform="rotate(-12 23.5 29.5)" data-flat/>
    <circle cx="46" cy="56" r="21" fill="${YELLOW}" data-shade="0.86"/>
    <ellipse cx="36.5" cy="62.5" rx="3.6" ry="2.2" fill="#F08A3E" opacity="0.45" data-flat/>
    <ellipse cx="55.5" cy="62.5" rx="3.6" ry="2.2" fill="#F08A3E" opacity="0.45" data-flat/>
    <path d="M33.5 47.5 Q38 45 42 47" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round" data-flat/>
    <path d="M50 43 Q55 39.5 59.5 43" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round" data-flat/>
    <ellipse cx="38" cy="53" rx="2.5" ry="3.4" fill="${INK}" data-flat/>
    <ellipse cx="54.5" cy="51.5" rx="2.5" ry="3.6" fill="${INK}" data-flat/>
    <circle cx="38.8" cy="51.8" r="0.9" fill="#FFFFFF" data-flat/>
    <circle cx="55.3" cy="50.2" r="0.9" fill="#FFFFFF" data-flat/>
    <path d="M40 66 Q46 63.5 53 66.5" stroke="${INK}" stroke-width="2.3" fill="none" stroke-linecap="round" data-flat/>
    <path d="M34 80 Q31 73 36 70 L44 68.5 Q47.5 68.3 47.3 71 Q47 73 44.5 73.2 L41 73.6 Q43 77 40.5 80Z" fill="${AMBER}" data-lw="0.9"/>
    <path d="M37.5 73.5 Q39.2 72.6 40.6 73.4" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.5" data-flat/>
    <path d="M61 17 H81 Q87 17 87 23 V33 Q87 39 81 39 H72 L65 45 L66.5 39 H61 Q55 39 55 33 V23 Q55 17 61 17Z" fill="${CREAM}" data-shade="0.92"/>
    <path d="M75.5 25.5 Q75.5 21.6 71.2 21.6 Q67 21.6 67 25.4 Q67 28.4 70.6 29.4 V32" stroke="#2B2766" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <circle cx="70.6" cy="35.6" r="1.7" fill="#2B2766" data-flat/>
    <path d="${star(77, 64, 7)}" fill="#22B8B0" data-lw="0.9" transform="rotate(10 77 64)"/>
    <path d="M70 79 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2Z" fill="${CREAM}" data-flat/>
    <circle cx="27" cy="45" r="1.4" fill="${CREAM}" data-flat/>`);
}
