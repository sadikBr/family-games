// Esports-style emblems for every game (100×100, rendered through the mascot pass).
import { INK, blush, brow, eye, smile, svg100 } from './mkit.mjs';

const SHIELD = 'M50 7 L85 17 C86 50 76 77 50 93 C24 77 14 50 15 17Z';
const SHIELD_IN = 'M50 14 L79 22 C79.5 50 71 71 50 85 C29 71 20.5 50 21 22Z';
const HEX = 'M50 6 L88 27 V73 L50 94 L12 73 V27Z';
const HEX_IN = 'M50 13 L82 31 V69 L50 87 L18 69 V31Z';
const ROUND = 'M50 8 A42 42 0 1 1 49.9 8Z';
const ROUND_IN = 'M50 15 A35 35 0 1 1 49.9 15Z';

/** Side flames / wings behind a badge. */
function wings(c1, c2) {
  const L = `M20 34 L4 26 L10 38 L0 42 L12 50 L4 58 L18 60 L14 70 L27 66Z`;
  const L2 = `M22 44 L10 42 L16 50 L10 56 L24 58Z`;
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${100 - parseFloat(x)} ${y}`);
  return `<path d="${L}" fill="${c1}"/><path d="${mirror(L)}" fill="${c1}"/>
    <path d="${L2}" fill="${c2}" data-noshade/><path d="${mirror(L2)}" fill="${c2}" data-noshade/>`;
}

function base(shape, inner, c1, c2, wingColors) {
  return `${wingColors ? wings(...wingColors) : ''}<path d="${shape}" fill="${c1}"/><path d="${inner}" fill="${c2}" data-noline data-shade="0.8"/>`;
}

/* ---------------- suit symbols (Spanish deck) ---------------- */
export const coin = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#F4C02E"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.68}" fill="#E8A417" data-noline/>
  <path d="M${cx} ${cy - r * 0.42} L${cx + r * 0.42} ${cy} L${cx} ${cy + r * 0.42} L${cx - r * 0.42} ${cy}Z" fill="#C8371F" data-lw="1"/>`;
export const cup = (cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s})">
  <path d="M-10 -14 H10 C10 -2 6 4 0 5 C-6 4 -10 -2 -10 -14Z" fill="#D83A3A"/>
  <path d="M-11 -16 H11 V-12 H-11Z" fill="#F4C02E"/>
  <path d="M-2 5 H2 V11 H-2Z" fill="#F4C02E"/><path d="M-8 11 H8 L6 15 H-6Z" fill="#F4C02E"/></g>`;
export const sword = (cx, cy, s, rot = 0) => `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
  <path d="M-2.2 -22 L0 -27 L2.2 -22 V8 H-2.2Z" fill="#D5DEEA"/>
  <path d="M-8 8 H8 V11.5 H-8Z" fill="#F4C02E"/><path d="M-1.8 11.5 H1.8 V20 H-1.8Z" fill="#7A4A24"/><circle cy="21.5" r="2.4" fill="#F4C02E"/></g>`;
export const club = (cx, cy, s, rot = 0) => `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
  <path d="M-3 22 L-5 -12 C-6 -22 6 -22 5 -12 L3 22Z" fill="#4FA33B"/>
  <path d="M-4 -6 l-4 -3 M4 0 l4 -3 M-4 8 l-4 -2" stroke="${INK}" stroke-width="2" data-flat/></g>`;

/** Small playing card (cream) with a suit symbol, for emblems. */
export function miniCard(x, y, rot, suit, label, s = 1) {
  const sym = suit === 'coins' ? coin(0, 2, 7) : suit === 'cups' ? cup(0, 3, 0.55) : suit === 'swords' ? sword(0, 2, 0.5) : club(0, 2, 0.5);
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <rect x="-13" y="-19" width="26" height="38" rx="3.5" fill="#FBF6EA" data-shade="0.86"/>
    <rect x="-10" y="-16" width="20" height="32" rx="1.5" fill="none" stroke="#C9A35A" stroke-width="0.8" data-flat/>
    ${sym}
    <text x="-8" y="-9" font-size="7" font-family="Lilita" fill="#7a3a2a" text-anchor="middle">${label}</text></g>`;
}

/* ---------------- emblems ---------------- */

export function werewolf() {
  const head = `M50 20 L60 23 L69 30 L73 41 L82 46 L73 50 L79 58 L68 60 L63 72 L50 82 L37 72 L32 60 L21 58 L27 50 L18 46 L27 41 L31 30 L40 23Z`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#2B3170', '#3C4590', ['#5E6AD8', '#9AA5FF'])}
    <circle cx="68" cy="28" r="12" fill="#FFE8A3" data-shade="0.86"/>
    <path d="M31 36 L23 9 L44 26Z" fill="#59607E"/><path d="M69 36 L77 9 L56 26Z" fill="#59607E"/>
    <path d="M32 30 L28 16 L39 26Z" fill="#2A2C42" data-flat/><path d="M68 30 L72 16 L61 26Z" fill="#2A2C42" data-flat/>
    <path d="${head}" fill="#6B7394"/>
    <path d="M50 24 L56 36 L50 46 L44 36Z" fill="#4A5170" data-noline/>
    <path d="M40 52 Q50 46 60 52 L63 66 Q50 82 37 66Z" fill="#D9DDE8"/>
    <path d="M34 44 L46 47.5 L44.5 51 L35.5 48.5Z" fill="#FFD23F" data-lw="1.1"/><path d="M66 44 L54 47.5 L55.5 51 L64.5 48.5Z" fill="#FFD23F" data-lw="1.1"/>
    <path d="M41.5 47.2 L42 50.4 M58.5 47.2 L58 50.4" stroke="${INK}" stroke-width="1.6" data-flat/>
    <path d="M33 41 L47 45 M67 41 L53 45" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" data-flat/>
    <path d="M45 55 H55 L50 60Z" fill="${INK}" data-flat/>
    <path d="M41 64 Q50 69 59 64 L57 72 Q50 77 43 72Z" fill="#7A1E2E" data-lw="1.3"/>
    <path d="M42.5 64.6 L44.5 69 L46 65.6Z M57.5 64.6 L55.5 69 L54 65.6Z" fill="#ffffff" data-flat/>
    <path d="M45 72.6 L46.6 69.6 L48 72.8Z M55 72.6 L53.4 69.6 L52 72.8Z" fill="#ffffff" data-flat/>`);
}

export function imposter() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#5A2C9E', '#7246C2', ['#C25BFF', '#F0A6FF'])}
    <text x="72" y="40" font-size="30" font-family="Lilita" fill="#F4C02E" text-anchor="middle" transform="rotate(14 72 40)" data-flat>?</text>
    <path d="M24 92 C26 76 36 68 50 66 C64 68 74 76 76 92Z" fill="#3A3550"/>
    <path d="M38 66 L50 84 L62 66 L56 64 L50 72 L44 64Z" fill="#C8B79A"/>
    <path d="M47 70 L50 88 L53 70Z" fill="#B3263C" data-noshade/>
    <path d="M34 46 C34 34 41 28 50 28 C59 28 66 34 66 46 C66 58 59 66 50 68 C41 66 34 58 34 46Z" fill="#E9B990"/>
    <path d="M33 44 Q50 38 67 44 L66 53 Q50 48 34 53Z" fill="#20202E" data-lw="1.4"/>
    <path d="M38 47.6 Q42 45 46 47.8 Q42 50.4 38 47.6Z M62 47.6 Q58 45 54 47.8 Q58 50.4 62 47.6Z" fill="#FFF7D6" data-flat/>
    <circle cx="42" cy="47.8" r="1.2" fill="${INK}" data-flat/><circle cx="58" cy="47.8" r="1.2" fill="${INK}" data-flat/>
    ${smile(50, 58, 10, { smirk: 1.6 })}
    <ellipse cx="50" cy="31" rx="27" ry="6.5" fill="#26243A"/>
    <path d="M34 31 C34 18 41 12 50 12 C59 12 66 18 66 31Z" fill="#26243A"/>
    <path d="M34.5 26 Q50 22 65.5 26 L66 31 Q50 27 34 31Z" fill="#B3263C" data-noshade/>`);
}

export function potato() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#B8341F', '#D9532A', ['#FF8A1F', '#FFD23F'])}
    <path d="M50 4 C58 14 54 20 60 24 C62 16 70 14 70 14 C68 22 74 26 70 34 L30 34 C26 26 34 20 34 14 C38 18 40 20 42 22 C42 14 46 10 50 4Z" fill="#FF8A1F"/>
    <path d="M50 14 C54 20 52 24 56 28 C58 24 62 22 62 22 C62 28 62 32 58 36 L42 36 C40 30 42 26 44 24 C46 26 46 28 48 28 C46 22 48 18 50 14Z" fill="#FFD23F" data-noline/>
    <path d="M24 58 C22 42 34 30 50 30 C68 30 80 42 78 58 C78 74 66 84 50 84 C34 84 24 74 24 58Z" fill="#C98A4B"/>
    <g fill="#9A6230" data-flat><circle cx="33" cy="66" r="1.8"/><circle cx="68" cy="68" r="2.2"/><circle cx="62" cy="40" r="1.5"/><circle cx="36" cy="44" r="1.4"/></g>
    ${eye(40, 54, { side: -1, iris: '#3a7bd5', w: 11, h: 8, fierce: 0.7, lash: 0.2 })}
    ${eye(60, 54, { side: 1, iris: '#3a7bd5', w: 11, h: 8, fierce: 0.7, lash: 0.2 })}
    ${brow(40, 46.5, { side: -1, angle: 1, w: 11, t: 2.4 })}${brow(60, 46.5, { side: 1, angle: 1, w: 11, t: 2.4 })}
    ${smile(50, 64, 14, { open: true, teeth: true })}
    <path d="M76 70 L86 66 L82 74 L90 76 L80 80" stroke="#FFD23F" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>
    <path d="M24 70 L14 66 L18 74 L10 76 L20 80" stroke="#FFD23F" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>`);
}

export function names() {
  return svg100(`
    ${base(HEX, HEX_IN, '#1E8F5E', '#2FB67C', null)}
    <g transform="rotate(-8 46 52) translate(-2 -4)">
      <rect x="22" y="24" width="44" height="56" rx="3" fill="#FBF6EA" data-shade="0.86"/>
      <path d="M28 36 H60 M28 46 H60 M28 56 H60 M28 66 H60 M44 30 V74" stroke="#9EC4E8" stroke-width="1.2" data-flat/>
      <text x="36" y="44.5" font-size="8" font-family="Lalezar" fill="#C8371F" text-anchor="middle" data-flat>ولد</text>
      <text x="52.5" y="44.5" font-size="8" font-family="Lalezar" fill="#C8371F" text-anchor="middle" data-flat>بنت</text>
      <text x="36" y="54.5" font-size="8" font-family="Lalezar" fill="#2b3a6a" text-anchor="middle" data-flat>بدر</text>
      <text x="52.5" y="54.5" font-size="8" font-family="Lalezar" fill="#2b3a6a" text-anchor="middle" data-flat>بشرى</text>
    </g>
    <rect x="52" y="54" width="30" height="30" rx="6" fill="#F4C02E" transform="rotate(8 67 69)"/>
    <text x="67" y="77" font-size="26" font-family="Lalezar" fill="${INK}" text-anchor="middle" data-flat>ب</text>
    <g transform="translate(9 -5) rotate(38 64 34) scale(0.85)">
      <rect x="58" y="10" width="9" height="38" fill="#F29A1E"/><rect x="58" y="10" width="9" height="6" rx="1.5" fill="#E86A8A"/>
      <rect x="58" y="15" width="9" height="3" fill="#C9CED8" data-noline/>
      <path d="M58 48 L62.5 58 L67 48Z" fill="#F4D8B0"/><path d="M61 54.5 L62.5 58 L64 54.5Z" fill="${INK}" data-flat/>
    </g>`);
}

export function headsup() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#127C77', '#1FA59E', ['#2FD8C8', '#B5FFF4'])}
    <path d="M22 94 C24 80 34 72 50 70 C66 72 76 80 78 94Z" fill="#F2B33D"/>
    <path d="M43 60 H57 V74 Q50 77 43 74Z" fill="#E3A983" data-noshade/>
    <path d="M32 50 C32 38 40 32 50 32 C60 32 68 38 68 50 C68 62 61 70 50 72 C39 70 32 62 32 50Z" fill="#F4C7A1"/>
    <path d="M31 52 C29 40 34 30 42 28 C46 24 56 24 60 28 C66 30 71 38 69 52 C67 44 64 40 60 38 C52 41 44 41 38 38 C35 41 33 45 31 52Z" fill="#3A2A22" data-shade="0.6"/>
    ${eye(42.5, 53, { side: -1, iris: '#2d7dd2', w: 9.5, h: 7.4, look: 0.3, lash: 0.2 })}
    ${eye(57.5, 53, { side: 1, iris: '#2d7dd2', w: 9.5, h: 7.4, look: 0.3, lash: 0.2 })}
    ${brow(42, 46.5, { side: -1, angle: -0.6, w: 9, t: 1.8 })}${brow(58, 46.5, { side: 1, angle: -0.6, w: 9, t: 1.8 })}
    <ellipse cx="50" cy="65" rx="3.4" ry="3" fill="#5b1f2a" data-lw="1.1"/>
    <g transform="rotate(-6 50 26)">
      <rect x="38" y="8" width="24" height="32" rx="3.5" fill="#FBF6EA" data-shade="0.86"/>
      <text x="50" y="32" font-size="24" font-family="Lilita" fill="#E2475F" text-anchor="middle" data-flat>?</text>
    </g>
    <path d="M70 34 l6 -4 M72 42 l7 0 M30 34 l-6 -4 M28 42 l-7 0" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" data-flat/>`);
}

export function taboo() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#C4501F', '#E86F3E', ['#FFB23F', '#FFE08A'])}
    <path d="M18 34 C18 22 28 16 50 16 C72 16 82 22 82 34 V56 C82 68 72 72 58 72 L46 84 L46 72 C28 72 18 68 18 56Z" fill="#FBF6EA" data-shade="0.86"/>
    <path d="M30 34 H70 M30 44 H62 M30 54 H66" stroke="#9AA3B5" stroke-width="3.4" stroke-linecap="round" data-flat/>
    <circle cx="50" cy="44" r="21" fill="none" stroke="#E2263F" stroke-width="7" data-flat/>
    <circle cx="50" cy="44" r="21" fill="none" stroke="${INK}" stroke-width="1.2" data-flat transform="scale(1)"/>
    <path d="M35 29 L65 59" stroke="#E2263F" stroke-width="7" stroke-linecap="round" data-flat/>
    <circle cx="74" cy="76" r="11" fill="#E2263F"/><ellipse cx="74" cy="73.6" rx="7" ry="4.2" fill="#FF6A6A" data-noline/>`);
}

export function ronda() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#1F6E47', '#2E8B57', ['#3FD08A', '#B8FFD9'])}
    ${miniCard(31, 54, -26, 'cups', '1', 1.12)}${miniCard(43, 48, -9, 'coins', '2', 1.12)}${miniCard(57, 48, 9, 'swords', '3', 1.12)}${miniCard(69, 54, 26, 'clubs', '4', 1.12)}`);
}

export function kanza() {
  return svg100(`
    ${base(HEX, HEX_IN, '#9A6410', '#C98A14', ['#FFD23F', '#FFF1A8'])}
    <path d="M22 50 C22 38 34 32 50 32 C66 32 78 38 78 50Z" fill="#8A4A22"/>
    <path d="M22 50 H78 V78 H22Z" fill="#A55A28"/>
    <path d="M22 50 H78 V56 H22Z M46 50 H54 V66 H46Z" fill="#F4C02E" data-lw="1.4"/>
    <circle cx="50" cy="60" r="2" fill="${INK}" data-flat/>
    ${coin(36, 34, 8)}${coin(52, 26, 9)}${coin(66, 36, 7)}
    <path d="M28 22 l3 -6 l3 6 l-3 6z M72 20 l2 -4 l2 4 l-2 4z" fill="#FFF7C2" data-flat/>
    <rect x="58" y="62" width="26" height="18" rx="5" fill="#E2475F"/>
    <text x="71" y="76" font-size="14" font-family="Lilita" fill="#FFF7EA" text-anchor="middle" data-flat>15</text>`);
}

export function tris() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#2550A8', '#3D6FD6', ['#5FA0FF', '#C9E0FF'])}
    ${sword(38, 50, 1.25, -38)}${club(62, 50, 1.25, 38)}
    <path d="M34 22 H66 C66 44 60 54 50 56 C40 54 34 44 34 22Z" fill="#F4C02E"/>
    <path d="M34 26 C24 26 24 40 36 42 M66 26 C76 26 76 40 64 42" stroke="${INK}" stroke-width="5.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M34 26 C24 26 24 40 36 42 M66 26 C76 26 76 40 64 42" stroke="#F4C02E" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M45 56 H55 V66 H45Z" fill="#E8A417"/><path d="M36 66 H64 L62 76 H38Z" fill="#7A4A24"/>
    <rect x="42" y="69" width="16" height="4" rx="1" fill="#F4C02E" data-flat/>
    <path d="M44 30 L46 36 L52 36 L47 40 L49 46 L44 42 L39 46 L41 40 L36 36 L42 36Z" fill="#FFF7C2" data-lw="1" transform="translate(6 0)"/>`);
}

export function konkan() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#A42A3D', '#C8384E', ['#FF6A7F', '#FFD0D7'])}
    ${miniCard(30, 58, -16, 'swords', '5', 0.92)}${miniCard(42, 56, -6, 'swords', '6', 0.92)}${miniCard(54, 56, 6, 'swords', '7', 0.92)}${miniCard(66, 58, 16, 'coins', '7', 0.92)}
    <path d="M30 34 L36 18 L44 28 L50 14 L56 28 L64 18 L70 34Z" fill="#F4C02E"/>
    <rect x="30" y="32" width="40" height="6" rx="2" fill="#E8A417"/>
    <circle cx="36" cy="18" r="2.4" fill="#E2475F" data-lw="1"/><circle cx="50" cy="14" r="2.6" fill="#4F9BE8" data-lw="1"/><circle cx="64" cy="18" r="2.4" fill="#E2475F" data-lw="1"/>`);
}

export function unoflip() {
  const card = (x, y, rot, fill, fill2, label, dark) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-15" y="-22" width="30" height="44" rx="5" fill="${dark ? '#1E1E2E' : '#FBF6EA'}"/>
    <rect x="-11.5" y="-18.5" width="23" height="37" rx="3.5" fill="${fill}" data-noline/>
    <ellipse cx="0" cy="0" rx="9" ry="15" transform="rotate(28)" fill="${fill2}" data-noshade/>
    <text x="0" y="7" font-size="20" font-family="Lilita" fill="${fill}" text-anchor="middle" data-flat>${label}</text></g>`;
  return svg100(`
    <path d="M50 7 L85 17 C86 50 76 77 50 93Z" fill="#6A2FB0"/>
    <path d="M50 7 L15 17 C14 50 24 77 50 93Z" fill="#F4C02E"/>
    <path d="M50 14 L79 22 C79.5 50 71 71 50 85Z" fill="#8B47D6" data-noline/>
    <path d="M50 14 L21 22 C20.5 50 29 71 50 85Z" fill="#FFD84D" data-noline/>
    <path d="${SHIELD}" fill="none" stroke="${INK}" stroke-width="2.6" data-flat/>
    ${card(38, 52, -16, '#E23B3B', '#FBF6EA', '7', false)}
    ${card(62, 50, 14, '#14A3A0', '#1E1E2E', '5', true)}
    <path d="M30 22 Q50 10 70 22" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" data-flat/>
    <path d="M30 22 Q50 10 70 22" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M66 16 L73 23 L64 26Z" fill="#FFFFFF" data-lw="1.2"/>`);
}

/* ---------------- board & new party games ---------------- */
const SH = 'M50 7 L85 17 C86 50 76 77 50 93 C24 77 14 50 15 17Z';
const SH_IN = 'M50 14 L79 22 C79.5 50 71 71 50 85 C29 71 20.5 50 21 22Z';

export function ludo() {
  const pawnAt = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="14" rx="9" ry="3" fill="${c}" data-shade="0.6"/>
    <path d="M-7 14 C-6 6 -3 3 -3 -1 L3 -1 C3 3 6 6 7 14Z" fill="${c}"/>
    <circle cx="0" cy="-6" r="6" fill="${c}"/></g>`;
  const die = (x, y, rot, pips) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-13" y="-13" width="26" height="26" rx="6" fill="#FFFDF7" data-shade="0.86"/>
    ${pips.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="2.6" fill="${INK}" data-noshade data-lw="0.4"/>`).join('')}</g>`;
  return svg100(`
    ${base(SH, SH_IN, '#B3263C', '#E2475F', ['#FFB23F', '#FFE08A'])}
    <path d="M30 30 H70 V70 H30Z" fill="#FFFDF7" data-noshade/>
    <path d="M30 30 H46 V46 H30Z" fill="#E2475F" data-noshade/><path d="M54 30 H70 V46 H54Z" fill="#2FB67C" data-noshade/>
    <path d="M54 54 H70 V70 H54Z" fill="#F2B33D" data-noshade/><path d="M30 54 H46 V70 H30Z" fill="#3D7BE0" data-noshade/>
    ${pawnAt(38, 56, '#E2475F', 1.1)}${pawnAt(62, 44, '#3D7BE0', 1.1)}
    ${die(36, 30, -16, [[-6, -6], [6, 6], [0, 0]])}${die(64, 72, 12, [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, 0], [0, -6]].slice(0, 5))}`);
}

export function dama() {
  let sq = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) sq += `<rect x="${28 + c * 11}" y="${30 + r * 11}" width="11" height="11" fill="${(r + c) % 2 ? '#8A5A33' : '#F1D9A8'}" data-noshade data-noline/>`;
  const piece = (x, y, light, king) => `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="3" rx="11" ry="8" fill="${light ? '#F4ECDD' : '#3A2C2A'}" data-shade="0.6"/>
    <ellipse cx="0" cy="0" rx="11" ry="8" fill="${light ? '#F4ECDD' : '#3A2C2A'}"/>
    <ellipse cx="0" cy="0" rx="6.4" ry="4.6" fill="none" stroke="${light ? '#D9CBB0' : '#5A4440'}" stroke-width="1.4" data-flat/>
    ${king ? `<path d="M-7 -3 L-8 -13 L-3 -9 L0 -16 L3 -9 L8 -13 L7 -3Z" fill="#F4C02E" data-lw="1"/>` : ''}</g>`;
  return svg100(`
    ${base(SH, SH_IN, '#5A3418', '#8A5A2B', ['#C9963F', '#F1D9A8'])}
    <rect x="26" y="28" width="48" height="48" rx="3" fill="#4A2A16"/>
    ${sq}
    ${piece(39, 64, true, false)}${piece(61, 42, false, false)}${piece(50, 50, true, true)}`);
}

export function codenames() {
  const card = (x, y, rot, fill, label) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-16" y="-10" width="32" height="20" rx="3" fill="${fill}" data-shade="0.8"/>
    ${label ? `<text x="0" y="3.6" font-size="8" font-family="Lalezar" fill="${INK}" text-anchor="middle" data-flat>${label}</text>` : ''}</g>`;
  return svg100(`
    ${base(SH, SH_IN, '#9A1F33', '#C8384E', ['#4F9BE8', '#C9E0FF'])}
    ${card(34, 36, -8, '#F1E4C8', 'بحر')}${card(66, 36, 8, '#E2475F', '')}
    ${card(34, 60, -4, '#3D7BE0', '')}${card(66, 60, 6, '#F1E4C8', 'قمر')}
    <circle cx="56" cy="50" r="13" fill="#DDE3EC" data-shade="0.8"/><circle cx="56" cy="50" r="9" fill="#9FD8F5" data-noline/>
    <path d="M65 59 L76 72" stroke="${INK}" stroke-width="7" stroke-linecap="round" data-flat/><path d="M65 59 L76 72" stroke="#7A4A24" stroke-width="3.6" stroke-linecap="round" data-flat/>
    <path d="M51 46 a6 6 0 0 1 6 -3" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" data-flat/>`);
}

export function draw() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#1C6FA8', '#2D9CDB', ['#FFD23F', '#FFF1A8'])}
    <path d="M26 30 C26 22 34 18 44 20 C54 14 70 18 74 28 C82 34 80 50 72 54 C70 60 62 62 58 58 C56 66 46 70 40 64 C30 66 22 58 24 50 C18 44 20 34 26 30Z" fill="#FFF4DA"/>
    <circle cx="36" cy="32" r="5" fill="#E2475F" data-lw="1"/><circle cx="50" cy="27" r="5" fill="#F2B33D" data-lw="1"/>
    <circle cx="63" cy="31" r="5" fill="#2FB67C" data-lw="1"/><circle cx="68" cy="44" r="5" fill="#7B61D9" data-lw="1"/>
    <ellipse cx="42" cy="52" rx="7" ry="5" fill="#2D9CDB" data-noline/>
    <g transform="rotate(-40 54 60)">
      <rect x="50" y="34" width="8" height="34" rx="2" fill="#C98A3A"/>
      <rect x="50" y="64" width="8" height="5" fill="#C9CED8" data-noline/>
      <path d="M50 69 C50 76 52 82 54 84 C56 82 58 76 58 69Z" fill="#E2475F"/>
    </g>`);
}

export function estate() {
  const coin = (x, y) => `<ellipse cx="${x}" cy="${y + 2.5}" rx="9" ry="4" fill="#C98A1E" data-noshade/><ellipse cx="${x}" cy="${y}" rx="9" ry="4" fill="#F4C02E" data-noshade/>`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#13684A', '#1F8A5B', ['#F4C02E', '#FFE89A'])}
    <path d="M30 50 L50 33 L70 50 V74 H30Z" fill="#FBF4E2"/>
    <path d="M26 52 L50 31 L74 52 L70 55 L50 38 L30 55Z" fill="#E2475F"/>
    <path d="M44 74 V63 a6 6 0 0 1 12 0 V74Z" fill="#7A4A24" data-noshade/>
    <rect x="34" y="57" width="7" height="7" rx="1" fill="#6EC6F0" data-noshade/>
    <rect x="59" y="57" width="7" height="7" rx="1" fill="#6EC6F0" data-noshade/>
    <path d="M38 27 L36 15 L43 20 L50 11 L57 20 L64 15 L62 27Z" fill="#F4C02E"/>
    <circle cx="50" cy="20" r="2.2" fill="#E2475F" data-noshade data-lw="0.6"/>
    ${coin(70, 76)}${coin(70, 70)}${coin(70, 64)}`);
}
