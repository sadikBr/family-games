// Werewolf role portraits on badges.
import { INK, blush, brow, eye, nose, smile, svg100 } from './mkit.mjs';
import { werewolf as wolfBadge } from './badges.mjs';

const SKIN = '#F4C7A1';
const SKIN2 = '#E3A983';
const SHIELD = 'M50 7 L85 17 C86 50 76 77 50 93 C24 77 14 50 15 17Z';
const SHIELD_IN = 'M50 14 L79 22 C79.5 50 71 71 50 85 C29 71 20.5 50 21 22Z';
const shield = (c1, c2) => `<path d="${SHIELD}" fill="${c1}"/><path d="${SHIELD_IN}" fill="${c2}" data-noline data-shade="0.8"/>`;

const face = (y = 0) => `<path d="M34 ${46 + y} C34 35 41 29 50 29 C59 29 66 35 66 ${46 + y} C66 58 59 66 50 68 C41 66 34 58 34 ${46 + y}Z" fill="${SKIN}"/>`;
const ears = (y = 48) => `<ellipse cx="34" cy="${y}" rx="3.4" ry="4.6" fill="${SKIN}"/><ellipse cx="66" cy="${y}" rx="3.4" ry="4.6" fill="${SKIN}"/>`;
const neck = `<path d="M44 62 H56 V74 Q50 77 44 74Z" fill="${SKIN2}" data-noshade/>`;
const eyes = (iris, o = {}) =>
  `${eye(43, 50, { side: -1, iris, w: 10, h: 7.2, lash: 0.3, ...o })}${eye(57, 50, { side: 1, iris, w: 10, h: 7.2, lash: 0.3, ...o })}`;

export function wolf() {
  return wolfBadge().replace('#2B3170', '#8E1F2E').replace('#3C4590', '#B3263C').replace("'#5E6AD8'", "'#FF5A5A'");
}

export function villager() {
  return svg100(`
    ${shield('#2C7A3F', '#3FA34D')}
    <path d="M20 94 C22 80 32 72 50 70 C68 72 78 80 80 94Z" fill="#B07A45"/>
    <path d="M42 70 L50 80 L58 70Z" fill="#EFE3C8"/>
    <path d="M70 92 V36" stroke="${INK}" stroke-width="4.6" stroke-linecap="round" data-flat/><path d="M70 92 V36" stroke="#8A5A2B" stroke-width="2.4" stroke-linecap="round" data-flat/>
    <path d="M62 36 V26 M70 36 V24 M78 36 V26 M62 36 H78" stroke="${INK}" stroke-width="4" stroke-linecap="round" data-flat/>
    <path d="M62 36 V26 M70 36 V24 M78 36 V26 M62 36 H78" stroke="#C9CED8" stroke-width="2" stroke-linecap="round" data-flat/>
    ${neck}${ears()}${face()}
    <path d="M35 52 C36 62 42 68 50 69 C58 68 64 62 65 52 C61 58 56 60 50 60 C44 60 39 58 35 52Z" fill="#5A3A26" data-shade="0.6"/>
    ${eyes('#6b4a2a')}
    ${brow(43, 43.5, { side: -1, angle: -0.2, w: 9, t: 2 })}${brow(57, 43.5, { side: 1, angle: -0.2, w: 9, t: 2 })}
    ${nose(50, 56)}${smile(50, 61.5, 8, { open: true, teeth: true })}
    <ellipse cx="50" cy="34" rx="28" ry="7" fill="#E8C66A"/>
    <path d="M36 34 C36 22 42 17 50 17 C58 17 64 22 64 34Z" fill="#E8C66A"/>
    <path d="M36.5 29 Q50 26 63.5 29 L64 33 Q50 30 36 33Z" fill="#C8371F" data-noshade/>`);
}

export function seer() {
  return svg100(`
    ${shield('#4A2A8A', '#6B3FB8')}
    <g fill="#FFF3B0" data-flat><path d="M26 30 l1.6 -4 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6z"/><path d="M72 26 l1.2 -3 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2z"/><circle cx="76" cy="44" r="1.2"/><circle cx="24" cy="48" r="1.2"/></g>
    <path d="M18 94 C20 78 30 70 50 68 C70 70 80 78 82 94Z" fill="#5B2E9E"/>
    <path d="M26 64 C22 40 32 22 50 22 C68 22 78 40 74 64 C70 72 64 74 50 74 C36 74 30 72 26 64Z" fill="#7B3FC4" data-shade="0.6"/>
    ${face(1)}
    <path d="M34 46 C35 34 42 30 50 30 C58 30 65 34 66 46 C62 40 56 36 50 37 C44 36 38 40 34 46Z" fill="#2a1a3a" data-shade="0.6"/>
    ${eyes('#9b5cff', { lash: 1 })}
    ${brow(43, 43.5, { side: -1, angle: 0.2, w: 9, t: 1.6 })}${brow(57, 43.5, { side: 1, angle: 0.2, w: 9, t: 1.6 })}
    ${nose(50, 56)}${smile(50, 61, 7, { smirk: 0.8 })}${blush(39, 58)}${blush(61, 58)}
    <circle cx="50" cy="38" r="2.2" fill="#F4C02E" data-lw="0.9"/>
    <circle cx="50" cy="82" r="12" fill="#7FD6F5"/>
    <path d="M43 78 a8 8 0 0 1 6 -6" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round" data-flat/>
    <path d="M51 79 l1.4 3 l3.2 0.4 l-2.4 2.2 l0.6 3.2 l-2.8 -1.6 l-2.8 1.6 l0.6 -3.2 l-2.4 -2.2 l3.2 -0.4z" fill="#F4C02E" data-flat/>
    <path d="M34 90 C36 84 42 84 44 88 M66 90 C64 84 58 84 56 88" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" data-flat/>
    <path d="M34 90 C36 84 42 84 44 88 M66 90 C64 84 58 84 56 88" stroke="${SKIN}" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>`);
}

export function doctor() {
  return svg100(`
    ${shield('#127C8A', '#1FA9B8')}
    <path d="M72 22 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6z" fill="#FFFFFF" data-lw="1.4"/>
    <path d="M20 94 C22 80 32 72 50 70 C68 72 78 80 80 94Z" fill="#F4F6FA" data-shade="0.82"/>
    <path d="M42 70 L50 86 L58 70Z" fill="#3FA3D9"/>
    <path d="M38 72 L50 92 M62 72 L50 92" stroke="#C9D2E0" stroke-width="1.4" data-flat/>
    <path d="M36 74 C34 84 40 90 46 88" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M36 74 C34 84 40 90 46 88" stroke="#3a3f55" stroke-width="1.6" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="47" cy="88" r="2.6" fill="#C9CED8" data-lw="1"/>
    ${neck}${ears()}${face()}
    <path d="M33 47 C32 34 40 26 50 26 C60 26 68 34 67 47 C64 40 58 36 50 36 C42 36 36 40 33 47Z" fill="#2a2230" data-shade="0.6"/>
    ${eyes('#2d7dd2')}
    ${brow(43, 43.5, { side: -1, angle: 0.1, w: 9, t: 1.8 })}${brow(57, 43.5, { side: 1, angle: 0.1, w: 9, t: 1.8 })}
    ${nose(50, 56)}${smile(50, 61, 8)}
    <circle cx="50" cy="31" r="5" fill="#D9DEE8"/><circle cx="50" cy="31" r="2.4" fill="#9FB8D8" data-flat/>`);
}

export function hunter() {
  return svg100(`
    ${shield('#7A4A1E', '#A56A2E')}
    <path d="M72 16 Q92 50 72 86" stroke="${INK}" stroke-width="5.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M72 16 Q92 50 72 86" stroke="#C98A3A" stroke-width="3" fill="none" stroke-linecap="round" data-flat/>
    <path d="M72 16 V86" stroke="#F4F1EA" stroke-width="0.9" data-flat/>
    <g transform="rotate(-18 30 60)">
      <path d="M30 86 V22 M36 86 V26" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" data-flat/><path d="M30 86 V22 M36 86 V26" stroke="#8A5A2B" stroke-width="1.7" data-flat/>
      <path d="M27 24 L30 16 L33 24Z M33 28 L36 20 L39 28Z" fill="#E2475F" data-lw="1"/>
      <rect x="25" y="40" width="16" height="40" rx="4" fill="#7A4A24"/>
    </g>
    <path d="M18 94 C20 78 30 70 50 68 C70 70 80 78 82 94Z" fill="#3E6B3A"/>
    <path d="M28 64 C24 40 34 22 50 22 C66 22 76 40 72 64 C68 72 62 74 50 74 C38 74 32 72 28 64Z" fill="#4F8A47" data-shade="0.6"/>
    ${face(1)}
    <path d="M34 47 C36 36 42 32 50 32 C58 32 64 36 66 47 C62 42 56 39 50 39 C44 39 38 42 34 47Z" fill="#6b3a1e" data-shade="0.6"/>
    ${eyes('#5a8a2a', { fierce: 0.6 })}
    ${brow(43, 43, { side: -1, angle: 0.8, w: 9, t: 2.2 })}${brow(57, 43, { side: 1, angle: 0.8, w: 9, t: 2.2 })}
    ${nose(50, 56)}${smile(50, 61.5, 7, { smirk: 1.2 })}
    <path d="M38 58 l4 1 M58 59 l4 -1" stroke="#5a3a26" stroke-width="1.2" opacity="0.6" data-flat/>
`);
}

export function whitewolf() {
  return wolfBadge()
    .replace('#2B3170', '#4E5A7E').replace('#3C4590', '#8390B4').replaceAll('#5E6AD8', '#9FD8F5').replaceAll('#9AA5FF', '#FFFFFF')
    .replaceAll('#6B7394', '#F1F3F8').replaceAll('#59607E', '#D3D8E6').replace('#4A5170', '#C3CADB').replaceAll('#FFD23F', '#6FD3FF');
}

export function bigwolf() {
  return wolfBadge()
    .replace('#2B3170', '#3A1210').replace('#3C4590', '#6A1F18').replaceAll('#5E6AD8', '#F08A3E').replaceAll('#9AA5FF', '#FFD08A')
    .replace('#FFE8A3', '#FF8A5C').replaceAll('#6B7394', '#5A3B30').replaceAll('#59607E', '#4A2E26').replace('#4A5170', '#3C241E').replaceAll('#FFD23F', '#FF4A3D');
}

export function witch() {
  return svg100(`
    ${shield('#2E5E2A', '#4C8C3A')}
    <g fill="#E8FFB0" data-flat><circle cx="24" cy="34" r="1.4"/><circle cx="78" cy="30" r="1.2"/><circle cx="80" cy="48" r="1"/></g>
    <path d="M18 94 C20 78 30 70 50 68 C70 70 80 78 82 94Z" fill="#4A2A7A"/>
    <path d="M27 66 C24 50 30 38 36 34 L64 34 C70 38 76 50 73 66 C68 72 62 74 50 74 C38 74 32 72 27 66Z" fill="#2A1E3A" data-shade="0.6"/>
    ${face(1)}
    ${eyes('#3FBF5A', { fierce: 0.3, lash: 1 })}
    ${brow(43, 43.5, { side: -1, angle: 0.5, w: 9, t: 1.8 })}${brow(57, 43.5, { side: 1, angle: 0.5, w: 9, t: 1.8 })}
    ${nose(50, 56, 1.15)}${smile(50, 61.5, 8, { smirk: 1 })}${blush(39, 58)}${blush(61, 58)}
    <ellipse cx="50" cy="35" rx="30" ry="6" fill="#3A2458"/>
    <path d="M34 35 C38 26 42 18 46 10 C50 4 58 6 62 2 C58 10 60 22 66 35Z" fill="#4A2E70"/>
    <path d="M35.5 31 Q50 27 64.5 31 L65.5 35 Q50 31 34.5 35Z" fill="#F2C23D" data-noshade/>
    <path d="M66 74 h10 v4 l4 8 c1 4 -2 7 -6 7 h-6 c-4 0 -7 -3 -6 -7 l4 -8z" fill="#7FE07A" data-lw="1.4"/>
    <rect x="68" y="70" width="6" height="5" rx="1" fill="#B07A45"/>
    <path d="M22 76 h8 v3 l3 7 c1 4 -2 7 -5 7 h-4 c-3 0 -6 -3 -5 -7 l3 -7z" fill="#B3263C" data-lw="1.4"/>
    <rect x="23.5" y="72" width="5" height="5" rx="1" fill="#B07A45"/>
    <path d="M24 86 h6 M70 86 h8" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.7" data-flat/>`);
}

export function guard() {
  return svg100(`
    ${shield('#2A3E66', '#3F5E96')}
    <path d="M18 94 C20 78 30 70 50 68 C70 70 80 78 82 94Z" fill="#8C96B4"/>
    <path d="M30 80 H70 M34 88 H66" stroke="#5B6587" stroke-width="2" data-flat/>
    ${neck}${ears()}${face()}
    ${eyes('#3a6fd0', { fierce: 0.4 })}
    ${brow(43, 43.5, { side: -1, angle: 0.4, w: 9, t: 2.2 })}${brow(57, 43.5, { side: 1, angle: 0.4, w: 9, t: 2.2 })}
    ${nose(50, 56)}${smile(50, 61.5, 7)}
    <path d="M32 46 C31 30 40 22 50 22 C60 22 69 30 68 46 L64 46 C63 36 58 31 50 31 C42 31 37 36 36 46Z" fill="#B9C2DA"/>
    <path d="M50 22 V31" stroke="#5B6587" stroke-width="2.4" data-flat/>
    <path d="M47 22 C46 14 50 8 56 6 C54 12 56 16 53 22Z" fill="#E2475F"/>
    <path d="M70 52 L84 56 C84 70 80 80 70 86 C60 80 56 70 56 56Z" fill="#F2C23D"/>
    <path d="M70 60 V78 M63 66 H77" stroke="#B3263C" stroke-width="3" stroke-linecap="round" data-flat/>`);
}

export function tanner() {
  const bell = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#F2C23D" data-lw="1.2"/>`;
  return svg100(`
    ${shield('#6E2A6E', '#A0459E')}
    <path d="M18 94 C20 78 30 70 50 68 C70 70 80 78 82 94Z" fill="#E2475F"/>
    <path d="M50 68 V94 M18 94 L50 68 L82 94" fill="none" stroke="none"/>
    <path d="M50 70 L50 94 L82 94 C80 78 70 70 50 70Z" fill="#2FB67C" data-noline/>
    <path d="M34 70 L40 78 L46 70 L50 78 L54 70 L60 78 L66 70" stroke="${INK}" stroke-width="5" fill="none" stroke-linejoin="round" data-flat/>
    <path d="M34 70 L40 78 L46 70 L50 78 L54 70 L60 78 L66 70" stroke="#F4F1EA" stroke-width="2.6" fill="none" stroke-linejoin="round" data-flat/>
    ${neck}${ears()}${face()}
    ${eye(43, 50, { side: -1, iris: '#E2475F', w: 11, h: 9, look: 0.6, lash: 0.2 })}${eye(57, 50, { side: 1, iris: '#2FB67C', w: 9, h: 6, look: -0.6, lash: 0.2 })}
    ${brow(43, 42.5, { side: -1, angle: -0.6, w: 9, t: 2 })}${brow(57, 44, { side: 1, angle: 0.6, w: 9, t: 2 })}
    ${nose(50, 56)}${smile(50, 61, 12, { open: true, teeth: true })}${blush(38, 58)}${blush(62, 58)}
    <path d="M33 40 C30 26 22 20 14 22 C22 26 30 32 36 40Z" fill="#E2475F"/>
    <path d="M67 40 C70 26 78 20 86 22 C78 26 70 32 64 40Z" fill="#2FB67C"/>
    <path d="M36 40 C38 26 44 16 50 12 C56 16 62 26 64 40Z" fill="#F2C23D"/>
    <path d="M33 40 Q50 34 67 40 L67 44 Q50 38 33 44Z" fill="#A0459E" data-noshade/>
    ${bell(14, 22)}${bell(86, 22)}${bell(50, 12)}`);
}
