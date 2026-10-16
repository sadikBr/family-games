// Emblems for أربعة في صف, الشطرنج, الكذّاب, موجة, كلمة السر (100×100, mascot pass).
import { INK, svg100 } from './mkit.mjs';
import { piece } from './chess.mjs';

export const SHIELD = 'M50 7 L85 17 C86 50 76 77 50 93 C24 77 14 50 15 17Z';
export const SHIELD_IN = 'M50 14 L79 22 C79.5 50 71 71 50 85 C29 71 20.5 50 21 22Z';
export const HEX = 'M50 6 L88 27 V73 L50 94 L12 73 V27Z';
export const HEX_IN = 'M50 13 L82 31 V69 L50 87 L18 69 V31Z';
export const ROUND = 'M50 8 A42 42 0 1 1 49.9 8Z';
export const ROUND_IN = 'M50 15 A35 35 0 1 1 49.9 15Z';

export function wings(c1, c2) {
  const L = `M20 34 L4 26 L10 38 L0 42 L12 50 L4 58 L18 60 L14 70 L27 66Z`;
  const L2 = `M22 44 L10 42 L16 50 L10 56 L24 58Z`;
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${100 - parseFloat(x)} ${y}`);
  return `<path d="${L}" fill="${c1}"/><path d="${mirror(L)}" fill="${c1}"/>
    <path d="${L2}" fill="${c2}" data-noshade/><path d="${mirror(L2)}" fill="${c2}" data-noshade/>`;
}
export const base = (shape, inner, c1, c2, w) => `${w ? wings(...w) : ''}<path d="${shape}" fill="${c1}"/><path d="${inner}" fill="${c2}" data-noline data-shade="0.8"/>`;
const inner = (svg) => svg.replace(/^<svg[^>]*><defs><\/defs>/, '').replace(/<\/svg>$/, '');

export function connect4() {
  let holes = '';
  const colors = [
    [0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0],
    [0, 1, 2, 0, 0],
    [1, 2, 1, 1, 0],
  ];
  colors.forEach((row, r) =>
    row.forEach((v, c) => {
      holes += `<circle cx="${30 + c * 10}" cy="${34 + r * 10}" r="3.8" fill="${v === 1 ? '#E2475F' : v === 2 ? '#F2C23D' : '#14295E'}" data-noshade data-lw="0.8"/>`;
    }),
  );
  return svg100(`
    ${base(ROUND, ROUND_IN, '#1E3A8A', '#2F5BD0', ['#F2C23D', '#FFE89A'])}
    <rect x="23" y="27" width="54" height="42" rx="5" fill="#3D7BE0"/>
    ${holes}
    <circle cx="50" cy="20" r="5.4" fill="#E2475F"/>
    <path d="M44 78 H56 M47 72 V80 M53 72 V80" stroke="${INK}" stroke-width="0" data-flat/>`);
}

export function chess() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#2B2F4A', '#4A5180', ['#E9B23A', '#FFE08A'])}
    <g transform="translate(14 12) scale(0.72)">${inner(piece('w', 'n'))}</g>
    <path d="M30 76 H70" stroke="${INK}" stroke-width="0" data-flat/>`);
}

export function kdab() {
  const back = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-13" y="-19" width="26" height="38" rx="3.5" fill="#B8323F"/>
    <rect x="-9" y="-15" width="18" height="30" rx="2" fill="none" stroke="#F4C02E" stroke-width="1.2" data-flat/>
    <path d="M0 -8 L6 0 L0 8 L-6 0Z" fill="#F4C02E" data-noshade data-lw="0.6"/></g>`;
  return svg100(`
    ${base(HEX, HEX_IN, '#7A1F2E', '#C8384E', ['#F4C02E', '#FFE89A'])}
    ${back(36, 58, -18)}${back(50, 54, 0)}${back(64, 58, 18)}
    <path d="M30 18 H70 C74 18 76 20 76 24 V34 C76 38 74 40 70 40 H46 L38 47 L39 40 H30 C26 40 24 38 24 34 V24 C24 20 26 18 30 18Z" fill="#FFF4DA"/>
    <text x="50" y="35" font-size="15" font-family="Lalezar" fill="#C8371F" text-anchor="middle" data-flat>كذّاب!</text>`);
}

export function wave() {
  const zone = (a0, a1, fill) => {
    const p = (a) => `${50 + 30 * Math.cos(Math.PI * (1 - a))} ${64 - 30 * Math.sin(Math.PI * (1 - a))}`;
    return `<path d="M50 64 L${p(a0)} A30 30 0 0 1 ${p(a1)}Z" fill="${fill}" data-noshade data-lw="0.5"/>`;
  };
  return svg100(`
    ${base(ROUND, ROUND_IN, '#0F5E5A', '#22B8B0', ['#F2B33D', '#FFE08A'])}
    <path d="M18 64 A32 32 0 0 1 82 64Z" fill="#FFF4DA"/>
    ${zone(0.52, 0.6, '#F2C23D')}${zone(0.6, 0.66, '#E2475F')}${zone(0.66, 0.74, '#F2C23D')}
    <path d="M50 64 L66 38" stroke="${INK}" stroke-width="5" stroke-linecap="round" data-flat/>
    <path d="M50 64 L66 38" stroke="#3D7BE0" stroke-width="2.6" stroke-linecap="round" data-flat/>
    <circle cx="50" cy="64" r="5" fill="#3D7BE0"/>
    <path d="M24 74 C32 68 40 80 50 74 C60 68 68 80 76 74" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" data-flat/>
    <path d="M24 74 C32 68 40 80 50 74 C60 68 68 80 76 74" stroke="#FFF4DA" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>`);
}

export function wordle() {
  const tile = (x, y, fill, ch, tc = '#FFFFFF') => `<rect x="${x}" y="${y}" width="13" height="13" rx="2.4" fill="${fill}" data-lw="0.9"/>
    <text x="${x + 6.5}" y="${y + 10.4}" font-size="9.5" font-family="Lalezar" fill="${tc}" text-anchor="middle" data-flat>${ch}</text>`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#3A3F63', '#5B6296', ['#2FB67C', '#A8E6C8'])}
    ${tile(65, 30, '#8A8FAE', 'ب')}${tile(50, 30, '#F2B33D', 'ا')}${tile(35, 30, '#8A8FAE', 'ب')}${tile(20, 30, '#2FB67C', 'ك')}
    ${tile(65, 46, '#2FB67C', 'ك')}${tile(50, 46, '#2FB67C', 'ت')}${tile(35, 46, '#2FB67C', 'ا')}${tile(20, 46, '#2FB67C', 'ب')}
    ${tile(65, 62, '#FFF4DA', '', INK)}${tile(50, 62, '#FFF4DA', '', INK)}${tile(35, 62, '#FFF4DA', '', INK)}${tile(20, 62, '#FFF4DA', '', INK)}`);
}
