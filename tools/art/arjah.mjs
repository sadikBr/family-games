// Emblem for «من الأرجح؟» (100×100, mascot pass): three round faces side by side at the table; the two
// outer ones glance at the middle one, who wears a little crown — the round's title — under a speech
// bubble with the Arabic question mark «؟».
import { INK, blush, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const GOLD = '#F6B53D';

/** A round face: dot eyes looking `look` (-1 left … 1 right), a smile. */
function face(cx, cy, r, fill, look, { open = false } = {}) {
  const ex = r * 0.36, ey = cy - r * 0.12, lx = look * r * 0.12;
  const mouth = open
    ? `<path d="M${cx - r * 0.3} ${cy + r * 0.28} Q${cx} ${cy + r * 0.78} ${cx + r * 0.3} ${cy + r * 0.28}Z" fill="#5b1f2a" data-flat/>`
    : `<path d="M${cx - r * 0.3} ${cy + r * 0.3} Q${cx} ${cy + r * 0.62} ${cx + r * 0.3} ${cy + r * 0.3}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" data-flat/>`;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" data-shade="0.85" data-lw="1.2"/>
    <circle cx="${cx - ex + lx}" cy="${ey}" r="${r * 0.13}" fill="${INK}" data-flat/>
    <circle cx="${cx + ex + lx}" cy="${ey}" r="${r * 0.13}" fill="${INK}" data-flat/>
    <circle cx="${cx - ex + lx + r * 0.05}" cy="${ey - r * 0.05}" r="${r * 0.045}" fill="#ffffff" data-flat/>
    <circle cx="${cx + ex + lx + r * 0.05}" cy="${ey - r * 0.05}" r="${r * 0.045}" fill="#ffffff" data-flat/>
    ${blush(cx - r * 0.55, cy + r * 0.2, r * 0.17)}
    ${blush(cx + r * 0.55, cy + r * 0.2, r * 0.17)}
    ${mouth}`;
}

/** The little crown of the round's title. */
const crown = (cx, y) => `
  <path d="M${cx - 8} ${y + 7} L${cx - 9} ${y - 2} L${cx - 4} ${y + 2.5} L${cx} ${y - 4} L${cx + 4} ${y + 2.5} L${cx + 9} ${y - 2} L${cx + 8} ${y + 7}Z" fill="${GOLD}" data-shade="0.8" data-lw="1"/>
  <circle cx="${cx}" cy="${y - 4.6}" r="1.4" fill="${GOLD}" data-lw="0.8"/>`;

/** A speech bubble with «؟» (the mirrored question mark of Arabic). */
const bubble = (cx, cy) => `
  <path d="M${cx - 13} ${cy - 10} H${cx + 13} Q${cx + 17} ${cy - 10} ${cx + 17} ${cy - 6} V${cy + 5} Q${cx + 17} ${cy + 9} ${cx + 13} ${cy + 9} H${cx + 5} L${cx} ${cy + 14} L${cx - 3} ${cy + 9} H${cx - 13} Q${cx - 17} ${cy + 9} ${cx - 17} ${cy + 5} V${cy - 6} Q${cx - 17} ${cy - 10} ${cx - 13} ${cy - 10}Z" fill="${CREAM}" data-shade="0.9" data-lw="1"/>
  <path d="M${cx + 4} ${cy - 3.2} Q${cx + 4} ${cy - 7} ${cx} ${cy - 7} Q${cx - 4} ${cy - 7} ${cx - 4} ${cy - 3.6} Q${cx - 4} ${cy - 0.6} ${cx} ${cy - 0.2} V${cy + 2.2}" fill="none" stroke="#D6336C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" data-flat/>
  <circle cx="${cx}" cy="${cy + 5.6}" r="1.6" fill="#D6336C" data-flat/>`;

export function arjah() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#E0607E')}
    ${face(27, 66, 12, '#7FD3F7', 0.9)}
    ${face(73, 66, 12, '#9BE08C', -0.9)}
    ${face(50, 61, 15, '#FFC94D', 0, { open: true })}
    ${crown(50, 41)}
    ${bubble(50, 24)}
    <circle cx="22" cy="40" r="1.5" fill="${CREAM}" data-flat/>
    <circle cx="79" cy="38" r="1.2" fill="${CREAM}" data-flat/>`);
}
