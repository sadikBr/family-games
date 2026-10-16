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
