// «من الفاعل؟» (mascot pass): the six family characters (100×100 busts in the avatar style), the six
// harmless items and the nine rooms of the Moroccan house (100×100 objects), and the game's emblem —
// a magnifying glass over a plate of كعب الغزال with one bite missing.
import { INK, blush, brow, eye, nose, smile, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const SKIN = '#F4C7A1';
const SKIN2 = '#E3A983';
const TAN = '#D9A27A';
const TAN2 = '#C08560';

const neck = (s = SKIN2) => `<path d="M42 62 H58 V75 Q50 79 42 75Z" fill="${s}" data-noshade/>`;
const ears = (y = 46, s = SKIN) => `<ellipse cx="29" cy="${y}" rx="4.2" ry="5.6" fill="${s}"/><ellipse cx="71" cy="${y}" rx="4.2" ry="5.6" fill="${s}"/>`;
const face = (s = SKIN) => `<path d="M29 40 C29 27 38 20 50 20 C62 20 71 27 71 40 C71 54 63 65 50 68 C37 65 29 54 29 40Z" fill="${s}"/>`;
const body = (top, collar) => `<path d="M6 108 C8 84 22 74 38 71 L62 71 C78 74 92 84 94 108Z" fill="${top}"/>
  ${collar ? `<path d="M40 72 L50 84 L60 72" stroke="${collar}" stroke-width="3" fill="none" data-flat/>` : ''}`;

/* ---------------- characters ---------------- */

/** الجدة زهرة: green flowered scarf, round glasses, a very innocent smile. */
export function zahra() {
  const scarf = `<path d="M21 50 C19 27 33 14 50 14 C67 14 81 27 79 50 C81 65 76 75 70 81 L30 81 C24 75 19 65 21 50Z" fill="#2FB67C"/>
    ${[[30, 30], [66, 28], [26, 56], [74, 58], [50, 18]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-2.2" r="1.5" fill="#FFF4DA" transform="rotate(${a})" data-flat/>`).join('')}<circle r="1.1" fill="#F2C23D" data-flat/></g>`).join('')}`;
  const faceIn = `<path d="M32 42 C32 31 40 25 50 25 C60 25 68 31 68 42 C68 55 61 64 50 67 C39 64 32 55 32 42Z" fill="${SKIN}"/>`;
  const glasses = `<g fill="none" stroke="#B5892B" stroke-width="1.6" data-flat><circle cx="41" cy="46" r="6.4"/><circle cx="59" cy="46" r="6.4"/><path d="M47.4 45.5 Q50 43.8 52.6 45.5"/></g>`;
  // happy closed eyes (arcs): «who, me?»
  const shut = (x) => `<path d="M${x - 4} 47 Q${x} 43 ${x + 4} 47" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round" data-flat/>`;
  return svg100(`
    ${body('#C0485A', '#2FB67C')}
    ${scarf}${faceIn}
    ${shut(41)}${shut(59)}${glasses}
    ${brow(41, 37.5, { side: -1, angle: -0.5, w: 9, t: 1.4, color: '#B9AFAF' })}${brow(59, 37.5, { side: 1, angle: -0.5, w: 9, t: 1.4, color: '#B9AFAF' })}
    <path d="M34 52 q2 2 4 1.6 M66 52 q-2 2 -4 1.6" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.5" data-flat/>
    ${nose(50, 54)}${smile(50, 58.5, 10, { open: true, teeth: true })}
    ${blush(37.5, 55.5, 3.8)}${blush(62.5, 55.5, 3.8)}`);
}

/** العمّ حمّو: a white knitted cap, a big black moustache, one eyebrow up. */
export function hammou() {
  const cap = `<path d="M30 32 C30 20 39 14 50 14 C61 14 70 20 70 32 Q50 27 30 32Z" fill="#F4F1EA"/>
    <path d="M34 22 H66 M32 27 H68" stroke="#C9C2B4" stroke-width="1.2" stroke-dasharray="2 2" data-flat/>`;
  const stache = `<path d="M37 56 C40 51 46 51 50 53.5 C54 51 60 51 63 56 C64 59 60 60 57 58 C54 56.5 52 57 50 57.5 C48 57 46 56.5 43 58 C40 60 36 59 37 56Z" fill="#23202f" data-shade="0.6"/>`;
  const jaw = `<path d="M31 46 C31 58 38 68 50 69 C62 68 69 58 69 46 C69 52 66 63 50 64 C34 63 31 52 31 46Z" fill="#3a3346" opacity="0.18" data-flat/>`;
  return svg100(`
    ${body('#F08A3E', '#F4F1EA')}
    <path d="M50 74 V108" stroke="#FFD9A8" stroke-width="2.4" data-flat/>
    ${neck()}${ears(46)}
    <path d="M28 40 C27 27 37 19 50 19 C63 19 73 27 72 40 C73 56 63 68 50 69 C37 68 27 56 28 40Z" fill="${SKIN}"/>
    ${jaw}${cap}
    ${eye(40.5, 44.5, { side: -1, iris: '#6b3e1e', w: 11, h: 7, lash: 0.2 })}
    ${eye(59.5, 44.5, { side: 1, iris: '#6b3e1e', w: 11, h: 7, lash: 0.2, lid: 0.35 })}
    ${brow(40, 35, { side: -1, angle: -0.7, w: 11, t: 3 })}${brow(60, 37.5, { side: 1, angle: -0.1, w: 11, t: 3 })}
    ${nose(50, 51, 1.3)}${stache}
    <path d="M45 61.5 Q50 65 55 61" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round" data-flat/>
    ${blush(36, 55)}${blush(64, 55)}`);
}

/** الخالة رقيّة: a purple headscarf, gold earrings, a sideways glance. */
export function ruqaya() {
  const scarf = `<path d="M23 48 C21 27 34 15 50 15 C66 15 79 27 77 48 C78 62 74 72 68 78 L32 78 C26 72 22 62 23 48Z" fill="#7B61D9"/>
    <path d="M30 26 Q50 14 70 26" stroke="#B8A6F2" stroke-width="2" fill="none" data-flat/>
    <path d="M62 70 C70 74 74 84 70 96 L60 96 C63 86 62 78 56 74Z" fill="#6A50C8"/>`;
  const faceIn = `<path d="M32 43 C32 31 40 24 50 24 C60 24 68 31 68 43 C68 56 61 65 50 68 C39 65 32 56 32 43Z" fill="${TAN}"/>`;
  return svg100(`
    ${body('#2F9C7A', '#F2C23D')}
    ${scarf}${faceIn}
    <circle cx="33.5" cy="56" r="2" fill="#F2C23D" data-lw="0.8"/><circle cx="66.5" cy="56" r="2" fill="#F2C23D" data-lw="0.8"/>
    ${eye(41.5, 46, { side: -1, iris: '#3a7d44', w: 11.5, h: 7.4, lid: 0.45, look: 1, lash: 1 })}
    ${eye(58.5, 46, { side: 1, iris: '#3a7d44', w: 11.5, h: 7.4, lid: 0.45, look: 1, lash: 1 })}
    ${brow(41.5, 38, { side: -1, angle: 0.3, w: 10, t: 1.8 })}${brow(58.5, 38, { side: 1, angle: -0.2, w: 10, t: 1.8 })}
    ${nose(50, 53)}${smile(51, 59, 8, { smirk: 1.6 })}
    ${blush(37, 55)}${blush(63, 55)}`);
}

/** الصغير أنس: a round little face, a cowlick, wide innocent eyes — and sugar on his cheeks. */
export function anas() {
  const hair = `<path d="M27 44 C25 28 36 18 50 18 C64 18 75 28 73 44 C71 37 68 33 64 31 C58 34 50 34 42 31 C37 33 31 37 27 44Z" fill="#5a3a22" data-shade="0.6"/>
    <path d="M50 19 C49 13 53 9 58 10 C55 12 54 15 55 19Z" fill="#5a3a22"/>`;
  const head = `<path d="M27 44 C27 29 37 22 50 22 C63 22 73 29 73 44 C73 59 63 69 50 69 C37 69 27 59 27 44Z" fill="${SKIN}"/>`;
  const sugar = [[36, 60], [39, 63], [61, 61], [64, 58], [58, 65], [42, 66]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#FFFFFF" data-flat/>`).join('');
  return svg100(`
    ${body('#3D9BE9', '#FFFFFF')}
    <path d="M38 88 L50 95 L62 88" stroke="#FFFFFF" stroke-width="2" fill="none" data-flat/>
    ${neck()}${ears(47)}${head}${hair}
    ${eye(40, 47, { side: -1, iris: '#22a6b8', w: 13, h: 10, look: -0.3, lash: 0.3 })}
    ${eye(60, 47, { side: 1, iris: '#22a6b8', w: 13, h: 10, look: -0.3, lash: 0.3 })}
    ${brow(40, 37.5, { side: -1, angle: -0.6, w: 10, t: 2, color: '#5a3a22' })}${brow(60, 37.5, { side: 1, angle: -0.6, w: 10, t: 2, color: '#5a3a22' })}
    ${nose(50, 55, 0.8)}
    <circle cx="50" cy="61" r="2.6" fill="#5b1f2a" data-noshade data-lw="1.1"/>
    ${blush(35, 57, 4)}${blush(65, 57, 4)}${sugar}`);
}

/** الجار بوشعيب: a red flat cap, a grey moustache, glasses on his nose, curious. */
export function bouchaib() {
  const cap = `<path d="M27 34 C28 20 39 14 52 15 C63 16 71 22 72 31 C60 28 42 29 27 34Z" fill="#E2475F"/>
    <path d="M27 34 C40 29 60 28 72 31 C79 32 82 35 80 37 C70 34 46 34 28 38Z" fill="#B8344A"/>`;
  const stache = `<path d="M40 57 C43 53 47 53 50 55 C53 53 57 53 60 57 C56 58.5 53 58 50 57.5 C47 58 44 58.5 40 57Z" fill="#C9C6C0" data-shade="0.8"/>`;
  const glasses = `<g fill="none" stroke="${INK}" stroke-width="1.4" data-flat><rect x="34.5" y="42.5" width="12" height="9" rx="3"/><rect x="53.5" y="42.5" width="12" height="9" rx="3"/><path d="M46.5 46 H53.5"/></g>`;
  return svg100(`
    ${body('#5E6B7A', '#E2475F')}
    ${neck(TAN2)}${ears(47, TAN)}${face(TAN)}
    <path d="M30 44 C30 40 31 37 33 35 M70 44 C70 40 69 37 67 35" stroke="#C9C6C0" stroke-width="3" fill="none" data-flat/>
    ${cap}
    ${eye(40.5, 47, { side: -1, iris: '#4a6b8a', w: 9, h: 6.2, lash: 0.2, look: -0.6 })}
    ${eye(59.5, 47, { side: 1, iris: '#4a6b8a', w: 9, h: 6.2, lash: 0.2, look: -0.6 })}
    ${glasses}
    ${brow(40, 39.5, { side: -1, angle: -0.8, w: 10, t: 2.2, color: '#C9C6C0' })}${brow(60, 39.5, { side: 1, angle: 0.2, w: 10, t: 2.2, color: '#C9C6C0' })}
    ${nose(50, 53, 1.2)}${stache}
    <path d="M46 63 Q50 61.5 54 63" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round" data-flat/>`);
}

/** الضيفة سلمى: long dark hair with a pink band, a caftan collar, a wink. */
export function salma() {
  const back = `<path d="M23 44 C21 26 34 14 50 14 C66 14 79 26 77 44 C79 60 81 74 77 86 L23 86 C19 74 21 60 23 44Z" fill="#2b1a26" data-shade="0.6"/>`;
  const fringe = `<path d="M27 46 C26 30 36 19 50 19 C64 19 74 30 73 46 C70 38 64 31 56 29 C50 33 41 35 33 37 C30 40 28 43 27 46Z" fill="#2b1a26" data-shade="0.6"/>`;
  const band = `<path d="M29 31 Q50 16 71 31" stroke="#E86FA6" stroke-width="4" fill="none" stroke-linecap="round" data-noshade data-lw="1"/>`;
  const caftan = `<path d="M6 108 C8 84 22 74 38 71 L62 71 C78 74 92 84 94 108Z" fill="#E86FA6"/>
    <path d="M42 72 Q50 82 58 72" stroke="#F2C23D" stroke-width="2.4" fill="none" data-flat/>
    <path d="M50 80 V108" stroke="#F2C23D" stroke-width="2" stroke-dasharray="1.5 3" data-flat/>`;
  const wink = `<path d="M54.5 46.5 Q59.5 42.5 64.5 46.5" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>`;
  return svg100(`
    ${back}${caftan}
    ${neck()}${ears(47)}${face()}${fringe}${band}
    ${eye(40.5, 46, { side: -1, iris: '#7b4bd1', w: 12.5, h: 9, lash: 1 })}${wink}
    ${brow(40, 38.5, { side: -1, angle: -0.3, w: 11, t: 1.8 })}${brow(60, 38.5, { side: 1, angle: 0.2, w: 11, t: 1.8 })}
    ${nose(50, 53)}${smile(50.5, 58, 9, { smirk: 1 })}
    ${blush(35.5, 54.5)}${blush(64.5, 54.5)}
    <circle cx="70" cy="56" r="1.8" fill="#F2C23D" data-lw="0.8"/>`);
}

/* ---------------- items ---------------- */

export function spoon() {
  return svg100(`
    <g transform="rotate(-38 50 50)">
      <rect x="46" y="38" width="8" height="54" rx="4" fill="#C98A4B"/>
      <path d="M48.5 50 V86" stroke="#9A6532" stroke-width="1.2" stroke-linecap="round" data-flat/>
      <ellipse cx="50" cy="26" rx="14" ry="19" fill="#D99A58"/>
      <ellipse cx="50" cy="27" rx="9.5" ry="13.5" fill="#B67B40" data-noline/>
      <path d="M44 20 Q46 14 51 13" stroke="#F1C58E" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>
    </g>`);
}

export function tray() {
  const glass = (x) => `<path d="M${x - 5} 44 L${x - 4} 60 Q${x} 62 ${x + 4} 60 L${x + 5} 44Z" fill="#E9F6F2" opacity="0.95"/>
    <path d="M${x - 4.4} 50 L${x - 3.8} 59.5 Q${x} 61 ${x + 3.8} 59.5 L${x + 4.4} 50Z" fill="#C0602F" data-flat/>
    <path d="M${x - 4} 47 H${x + 4}" stroke="#2FB67C" stroke-width="1.6" data-flat/>`;
  return svg100(`
    <ellipse cx="50" cy="68" rx="44" ry="17" fill="#C9CED6"/>
    <ellipse cx="50" cy="66" rx="37" ry="12" fill="#E6E9EE" data-noline/>
    <ellipse cx="50" cy="66" rx="31" ry="9" fill="none" stroke="#B3B9C2" stroke-width="1.2" stroke-dasharray="3 2" data-flat/>
    <path d="M38 64 C36 52 40 41 50 39 C60 41 64 52 62 64 Q50 68 38 64Z" fill="#D5DAE2"/>
    <path d="M62 52 C70 49 74 43 78 37" stroke="#D5DAE2" stroke-width="3.4" fill="none" stroke-linecap="round" data-noshade/>
    <path d="M38 47 C31 47 30 58 37 60" stroke="#B3B9C2" stroke-width="2.6" fill="none" data-noshade/>
    <path d="M44 39 Q50 30 56 39Z" fill="#C9CED6"/>
    <circle cx="50" cy="30" r="2.4" fill="#F2C23D" data-lw="0.9"/>
    ${glass(24)}${glass(76)}`);
}

export function stool() {
  return svg100(`
    <path d="M34 44 L26 92 M66 44 L74 92 M44 46 L41 94 M56 46 L59 94" stroke="#8A5A33" stroke-width="5.5" stroke-linecap="round" data-noshade/>
    <path d="M30 70 H70" stroke="#7a4c2a" stroke-width="3.5" data-noshade/>
    <ellipse cx="50" cy="40" rx="26" ry="10" fill="#B5733C"/>
    <ellipse cx="50" cy="36" rx="26" ry="10" fill="#D4924F"/>
    <ellipse cx="50" cy="36" rx="16" ry="5.5" fill="none" stroke="#2FB67C" stroke-width="2.2" data-flat/>
    <path d="M50 31 L54 36 L50 41 L46 36Z" fill="#E2475F" data-flat/>`);
}

export function basket() {
  const weave = Array.from({ length: 5 }, (_, i) => `<path d="M${22 + i * 2} ${58 + i * 7} H${78 - i * 2}" stroke="#9A6532" stroke-width="1.4" data-flat/>`).join('');
  return svg100(`
    <path d="M30 56 C26 34 74 34 70 56" stroke="#B5733C" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="52" rx="17" ry="9" fill="#E6B26B" transform="rotate(-12 42 52)"/>
    <ellipse cx="60" cy="51" rx="15" ry="8" fill="#D9A05A" transform="rotate(10 60 51)"/>
    <path d="M35 50 Q41 47 47 50 M55 49 Q60 47 65 50" stroke="#B5733C" stroke-width="1.3" fill="none" data-flat/>
    <path d="M18 54 H82 L74 90 Q50 96 26 90Z" fill="#C98A4B"/>
    ${weave}
    <path d="M18 54 H82" stroke="#9A6532" stroke-width="3" stroke-linecap="round" data-noshade/>`);
}

export function umbrella() {
  return svg100(`
    <path d="M50 30 V80 Q50 90 42 90 Q35 90 35 83" stroke="#5a3a22" stroke-width="4.5" fill="none" stroke-linecap="round" data-noshade/>
    <path d="M10 44 C14 22 30 12 50 12 C70 12 86 22 90 44 C84 39 76 39 70 44 C64 39 56 39 50 44 C44 39 36 39 30 44 C24 39 16 39 10 44Z" fill="#E2475F"/>
    <path d="M30 44 C34 28 42 16 50 12 C42 22 40 33 40 42 M70 44 C66 28 58 16 50 12 C58 22 60 33 60 42" fill="#F4F1EA" opacity="0.9" data-flat/>
    <path d="M50 12 V8" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" data-flat/>`);
}

export function broom() {
  const straw = Array.from({ length: 7 }, (_, i) => `<path d="M${35 + i * 5} 62 L${30 + i * 6.7} 92" stroke="#C9A04E" stroke-width="1.3" data-flat/>`).join('');
  return svg100(`
    <rect x="46.5" y="6" width="7" height="58" rx="3.5" fill="#8A5A33"/>
    <path d="M38 58 H62 L76 94 Q50 99 24 94Z" fill="#E8C46A"/>
    ${straw}
    <path d="M37 64 H63" stroke="#E2475F" stroke-width="3.2" data-noshade/>
    <path d="M38 58 H62" stroke="#2FB67C" stroke-width="3.2" data-noshade/>`);
}

/* ---------------- rooms ---------------- */

const arch = (fill = '#F4E3C3') => `<path d="M14 92 V40 C14 22 30 10 50 10 C70 10 86 22 86 40 V92Z" fill="${fill}" data-shade="0.9"/>`;

export function salon() {
  return svg100(`
    ${arch('#2F4C8A')}
    <path d="M22 92 V44 C22 30 34 20 50 20 C66 20 78 30 78 44 V92Z" fill="#3D5FA8" data-noline/>
    <rect x="8" y="64" width="84" height="18" rx="6" fill="#C0485A"/>
    <rect x="8" y="58" width="84" height="10" rx="5" fill="#D9606F"/>
    ${[22, 40, 58, 76].map((x, i) => `<rect x="${x - 8}" y="46" width="16" height="14" rx="5" fill="${['#F2C23D', '#2FB67C', '#F2C23D', '#2FB67C'][i]}" data-lw="1.4"/>`).join('')}
    <path d="M12 82 V92 M88 82 V92" stroke="#7a2a36" stroke-width="4" data-noshade/>
    <path d="M14 72 H86" stroke="#F2C23D" stroke-width="1.6" stroke-dasharray="3 3" data-flat/>`);
}

export function kitchen() {
  return svg100(`
    <rect x="10" y="78" width="80" height="12" rx="4" fill="#5E6B7A"/>
    <path d="M18 78 C18 72 26 68 50 68 C74 68 82 72 82 78Z" fill="#B5502B"/>
    <path d="M26 69 C30 40 42 22 50 16 C58 22 70 40 74 69Z" fill="#D2693A"/>
    <path d="M34 60 C38 44 44 34 50 28" stroke="#F2C23D" stroke-width="2" fill="none" data-flat/>
    <path d="M30 66 H70" stroke="#F2C23D" stroke-width="2.4" data-flat/>
    <circle cx="50" cy="15" r="4.6" fill="#D2693A"/>
    <path d="M60 14 Q64 8 60 3 M68 20 Q72 14 68 9" stroke="#E9EEF5" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.85" data-flat/>`);
}

export function roof() {
  return svg100(`
    <path d="M30 22 A14 14 0 1 0 44 38 A11 11 0 1 1 30 22Z" fill="#F2C23D"/>
    <path d="M64 16 l1.6 3.4 3.6 .5 -2.6 2.5 .6 3.6 -3.2 -1.7 -3.2 1.7 .6 -3.6 -2.6 -2.5 3.6 -.5Z" fill="#FFE89A" data-lw="0.8"/>
    <path d="M78 34 l1 2.2 2.4 .3 -1.7 1.6 .4 2.4 -2.1 -1.1 -2.1 1.1 .4 -2.4 -1.7 -1.6 2.4 -.3Z" fill="#FFE89A" data-lw="0.8"/>
    <path d="M14 56 Q50 64 86 56" stroke="${INK}" stroke-width="1" fill="none" data-flat/>
    <rect x="22" y="57" width="10" height="13" rx="1.5" fill="#E2475F" transform="rotate(4 27 63)" data-lw="1.2"/>
    <rect x="44" y="59.5" width="12" height="11" rx="1.5" fill="#3D9BE9" data-lw="1.2"/>
    <rect x="66" y="57" width="10" height="13" rx="1.5" fill="#F4F1EA" transform="rotate(-4 71 63)" data-lw="1.2"/>
    <path d="M6 72 H94 V94 H6Z" fill="#E7C9A0"/>
    <path d="M6 72 H94" stroke="#C89F6E" stroke-width="3" data-noshade/>
    ${[14, 30, 46, 62, 78].map((x) => `<rect x="${x}" y="78" width="8" height="10" rx="4" fill="#B98A57" data-lw="1"/>`).join('')}
    <path d="M14 56 V72 M86 56 V72" stroke="#8A5A33" stroke-width="2.6" data-noshade/>`);
}

export function riad() {
  const tiles = Array.from({ length: 6 }, (_, i) => `<path d="M${14 + i * 12} 92 l6 -6 l6 6 l-6 6Z" fill="${i % 2 ? '#2FB67C' : '#3D9BE9'}" data-flat/>`).join('');
  return svg100(`
    <path d="M70 70 V36" stroke="#8A5A33" stroke-width="4" data-noshade/>
    <circle cx="70" cy="28" r="15" fill="#2F9C5A"/>
    ${[[64, 24], [75, 22], [72, 33], [62, 33]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#F08A3E" data-lw="0.8"/>`).join('')}
    <ellipse cx="40" cy="78" rx="30" ry="9" fill="#2A8C8C"/>
    <ellipse cx="40" cy="76" rx="25" ry="6" fill="#7FD3E0" data-noline/>
    <rect x="35" y="50" width="10" height="26" rx="2" fill="#E7C9A0"/>
    <ellipse cx="40" cy="50" rx="13" ry="4.5" fill="#E7C9A0"/>
    <path d="M40 46 C40 34 30 34 28 44 M40 46 C40 34 50 34 52 44" stroke="#7FD3E0" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M6 88 H94 V98 H6Z" fill="#F4E3C3" data-noline/>
    ${tiles}`);
}

export function bedroom() {
  return svg100(`
    <path d="M14 30 Q14 22 22 22 H40 Q48 22 48 30 V58 H14Z" fill="#8A5A33"/>
    <path d="M10 56 H90 V78 H10Z" fill="#A86E3C"/>
    <path d="M12 78 V90 M88 78 V90" stroke="#6b4423" stroke-width="5" stroke-linecap="round" data-noshade/>
    <rect x="18" y="42" width="24" height="14" rx="6" fill="#F4F1EA"/>
    <path d="M40 50 C52 44 76 44 90 50 V66 H40Z" fill="#7B61D9"/>
    <path d="M44 60 H88" stroke="#B8A6F2" stroke-width="2" stroke-dasharray="4 3" data-flat/>
    <path d="M76 14 A11 11 0 1 0 86 30 A8.5 8.5 0 1 1 76 14Z" fill="#F2C23D"/>
    <circle cx="62" cy="22" r="1.6" fill="#FFE89A" data-flat/><circle cx="68" cy="34" r="1.2" fill="#FFE89A" data-flat/>`);
}

export function library() {
  const book = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.2" fill="${c}" data-lw="1.2"/><path d="M${x + 1.5} ${y + 4} H${x + w - 1.5}" stroke="#FFF4DA" stroke-width="1" opacity="0.8" data-flat/>`;
  return svg100(`
    <rect x="12" y="8" width="76" height="86" rx="4" fill="#8A5A33"/>
    <rect x="17" y="13" width="66" height="76" rx="2" fill="#5E3B1E" data-noline/>
    <path d="M17 39 H83 M17 64 H83" stroke="#8A5A33" stroke-width="4" data-noshade/>
    ${book(20, 16, 7, 21, '#E2475F')}${book(28, 19, 6, 18, '#3D9BE9')}${book(35, 15, 8, 22, '#2FB67C')}${book(44, 18, 6, 19, '#F2C23D')}
    <rect x="53" y="22" width="7" height="17" rx="1.2" fill="#7B61D9" transform="rotate(-14 56 30)" data-lw="1.2"/>
    ${book(20, 43, 8, 19, '#F2C23D')}${book(29, 41, 6, 21, '#7B61D9')}${book(36, 44, 7, 18, '#E2475F')}${book(56, 42, 9, 20, '#2FB67C')}${book(66, 45, 6, 17, '#3D9BE9')}
    ${book(22, 68, 9, 19, '#3D9BE9')}${book(32, 70, 6, 17, '#2FB67C')}${book(46, 67, 8, 20, '#E86FA6')}${book(55, 69, 7, 18, '#F2C23D')}${book(70, 68, 7, 19, '#E2475F')}`);
}

export function guests() {
  return svg100(`
    <path d="M38 30 V22 Q38 17 43 17 H57 Q62 17 62 22 V30" stroke="#5a3a22" stroke-width="4" fill="none" data-noshade/>
    <rect x="16" y="28" width="68" height="56" rx="9" fill="#2FB67C"/>
    <path d="M16 46 H84" stroke="#1F8A5C" stroke-width="3" data-noshade/>
    <path d="M34 28 V84 M66 28 V84" stroke="#F2C23D" stroke-width="4" data-noshade/>
    <circle cx="26" cy="88" r="4.5" fill="#3a3346"/><circle cx="74" cy="88" r="4.5" fill="#3a3346"/>
    <rect x="42" y="54" width="16" height="11" rx="2" fill="#FFF4DA" data-lw="1.1"/>
    <path d="M45 58 H55 M45 61.5 H52" stroke="${INK}" stroke-width="1" data-flat/>`);
}

export function pantry() {
  const jar = (x, y, w, h, c, lid) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${c}" opacity="0.95"/><rect x="${x - 1}" y="${y - 4}" width="${w + 2}" height="5" rx="2" fill="${lid}" data-lw="1.1"/>`;
  return svg100(`
    <path d="M8 44 H92 M8 82 H92" stroke="#8A5A33" stroke-width="5" stroke-linecap="round" data-noshade/>
    ${jar(14, 20, 18, 22, '#F2C23D', '#E2475F')}${jar(38, 24, 14, 18, '#E9F6F2', '#2FB67C')}${jar(58, 18, 20, 24, '#D2693A', '#3D9BE9')}
    <path d="M17 32 h12 M61 30 h14" stroke="#FFF4DA" stroke-width="1.4" opacity="0.8" data-flat/>
    <path d="M18 80 C14 66 18 56 30 54 C42 56 46 66 42 80Z" fill="#F4F1EA"/>
    <path d="M25 54 Q30 48 35 54" stroke="#C9A04E" stroke-width="2.2" fill="none" data-flat/>
    <path d="M24 66 H36" stroke="#C9A04E" stroke-width="1.6" data-flat/>
    ${jar(54, 60, 14, 20, '#7B61D9', '#F2C23D')}${jar(72, 64, 14, 16, '#2FB67C', '#E2475F')}`);
}

export function entrance() {
  const studs = [];
  for (let y = 40; y <= 84; y += 11) for (const x of [32, 44, 56, 68]) studs.push(`<circle cx="${x}" cy="${y}" r="1.5" fill="#F2C23D" data-flat/>`);
  return svg100(`
    <path d="M14 94 V42 C14 20 31 8 50 8 C69 8 86 20 86 42 V94Z" fill="#F4E3C3"/>
    <path d="M18 94 V42 C18 24 33 13 50 13 C67 13 82 24 82 42 V94Z" fill="#2F9C7A" data-noline/>
    <path d="M24 94 V44 C24 28 36 19 50 19 C64 19 76 28 76 44 V94Z" fill="#8A5A33"/>
    <path d="M50 21 V94" stroke="#5E3B1E" stroke-width="2.2" data-flat/>
    ${studs.join('')}
    <circle cx="44" cy="62" r="3.4" fill="none" stroke="#F2C23D" stroke-width="2" data-flat/>
    <circle cx="56" cy="62" r="3.4" fill="none" stroke="#F2C23D" stroke-width="2" data-flat/>`);
}

/* ---------------- emblem ---------------- */

/** A plate of كعب الغزال (one bitten) under a big magnifying glass. */
export function clue() {
  const horn = (x, y, r, bite = false) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.35)">
      <path d="M-12 4 C-11 -11 11 -11 12 4 C8 0.5 -8 0.5 -12 4Z" fill="#F4D58D"/>
      ${bite ? `<circle cx="11" cy="-1" r="4.2" fill="#DCE6F2" data-noline/>` : ''}
    </g>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#5A1F3E', '#B0507A', ['#F2C23D', '#FFE89A'])}
    <ellipse cx="44" cy="67" rx="29" ry="11" fill="#9FB3CC"/>
    <ellipse cx="44" cy="65.5" rx="23" ry="7.5" fill="#DCE6F2" data-noline/>
    ${horn(33, 64, -10)}${horn(54, 61, 12, true)}${horn(44, 70, 2)}
    <circle cx="60" cy="58" r="1.2" fill="#F4D58D" data-flat/><circle cx="64" cy="62" r="1" fill="#F4D58D" data-flat/>
    <path d="M73 26 L83 15" stroke="#5a3a22" stroke-width="6.5" stroke-linecap="round"/>
    <circle cx="62" cy="37" r="15" fill="#F2C23D"/>
    <circle cx="62" cy="37" r="10.8" fill="#BDEBF2" data-noline/>
    <path d="M55.5 32 Q58 28 62.5 27.5" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round" data-flat/>
    <text x="62" y="45" font-family="Lalezar" font-size="24" text-anchor="middle" fill="${INK}" data-flat>؟</text>`);
}

export const CLUE_ART = ['zahra', 'hammou', 'ruqaya', 'anas', 'bouchaib', 'salma', 'spoon', 'tray', 'stool', 'basket', 'umbrella', 'broom', 'salon', 'kitchen', 'roof', 'riad', 'bedroom', 'library', 'guests', 'pantry', 'entrance'];
