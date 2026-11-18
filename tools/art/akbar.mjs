// Emblem for «أكبر أم أصغر؟» (100×100, mascot pass): two bar-characters on one baseline — a short teal one
// looking up in wonder and a tall saffron one smiling proudly, a green «up» arrow over the tall one, a red
// «down» arrow over the short one, and a cream question bubble between them: which one is bigger?
import { INK, eye, smile, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const SAFFRON = '#F2B33D';
const TEAL = '#22B8B0';
const GREEN = '#2FB67C';
const RED = '#E2475F';

/** A rounded bar standing on the baseline (y = 78). */
const bar = (x, top, w, fill) => `<rect x="${x}" y="${top}" width="${w}" height="${78 - top}" rx="6" fill="${fill}" data-shade="0.82"/>`;

export function akbar() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#1F3A6B', '#3A8FD6', ['#F2B33D', '#FFE08A'])}
    <path d="M22 79 H78" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" data-flat/>
    ${bar(25, 52, 20, TEAL)}
    ${bar(55, 30, 20, SAFFRON)}
    <!-- the short one: wide eyes looking up -->
    ${eye(31, 61, { w: 6.5, h: 5.2, iris: '#1B5E8C', side: -1, look: 0.4 })}
    ${eye(39, 61, { w: 6.5, h: 5.2, iris: '#1B5E8C', side: 1, look: 0.4 })}
    <ellipse cx="35" cy="70.5" rx="2.2" ry="2.6" fill="${INK}" data-flat/>
    <!-- the tall one: a proud smile -->
    ${eye(61, 41, { w: 6.5, h: 5, iris: '#7A4A12', side: -1, lid: 0.3 })}
    ${eye(69, 41, { w: 6.5, h: 5, iris: '#7A4A12', side: 1, lid: 0.3 })}
    ${smile(65, 49, 8)}
    <!-- up and down arrows -->
    <path d="M65 25 V14 M60 19 L65 13.5 L70 19" stroke="${GREEN}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <path d="M35 37 V47 M30 42.5 L35 48 L40 42.5" stroke="${RED}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <!-- the question bubble -->
    <circle cx="44" cy="24" r="9" fill="${CREAM}" data-lw="1"/>
    <path d="M40.6 30.5 L38.5 35 L44 32" fill="${CREAM}" data-lw="0.8"/>
    <text x="44" y="29.5" font-size="15" font-family="Lalezar" fill="#1F3A6B" text-anchor="middle" data-flat>؟</text>`);
}
