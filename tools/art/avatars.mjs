import { INK, blush, brow, eye, nose, smile, svg100 } from './mkit.mjs';

const SKIN = '#F4C7A1';
const SKIN2 = '#E3A983';

function bust({ top = '#1FB5A8', shirt = '#E04B3A', hood = true, strings = true }) {
  return `
  <path d="M6 108 C8 84 22 74 38 71 L62 71 C78 74 92 84 94 108Z" fill="${top}"/>
  ${hood ? `<path d="M30 74 C34 82 42 86 50 86 C58 86 66 82 70 74 C64 70 36 70 30 74Z" fill="${top}" data-shade="0.62"/>` : ''}
  <path d="M41 73 L50 84 L59 73Z" fill="${shirt}"/>
  ${strings ? `<path d="M43 82 V95 M57 82 V95" stroke="#f4f1ea" stroke-width="1.6" fill="none" data-flat/>
  <circle cx="43" cy="96.5" r="1.9" fill="#f4f1ea" data-lw="0.9"/><circle cx="57" cy="96.5" r="1.9" fill="#f4f1ea" data-lw="0.9"/>` : ''}`;
}

const neck = `<path d="M42 62 H58 V75 Q50 79 42 75Z" fill="${SKIN2}" data-noshade/>`;
const ears = (y = 46) => `<ellipse cx="29" cy="${y}" rx="4.2" ry="5.6" fill="${SKIN}"/><ellipse cx="71" cy="${y}" rx="4.2" ry="5.6" fill="${SKIN}"/>`;
const face = `<path d="M29 40 C29 27 38 20 50 20 C62 20 71 27 71 40 C71 54 63 65 50 68 C37 65 29 54 29 40Z" fill="${SKIN}"/>`;

export function boy() {
  const hair = `<path d="M26 46 C24 36 25 29 28 25 L24 18 L33 20 L32 11 L40 17 L44 7 L50 15 L57 6 L60 16 L68 10 L68 19 L77 17 L73 26 C76 31 76 38 74 46
    L71 46 C71 40 70 36 68 34 L66 36 L62 29 L58 34 L54 27 L49 33 L45 27 L40 33 L37 28 L33 34 L31 31 C30 37 29 41 29 46Z" fill="#23202f" data-shade="0.55"/>
    <path d="M34 22 Q38 17 41 13 M52 18 Q55 13 57 9 M63 21 Q66 16 67 13" stroke="#6b6585" stroke-width="1.4" fill="none" stroke-linecap="round" data-flat/>`;
  return svg100(`
    ${bust({})}
    ${neck}${ears()}${face}${hair}
    ${eye(40.5, 45, { side: -1, iris: '#22a6b8', w: 12.5, h: 8.6, fierce: 0.2, lash: 0.25 })}
    ${eye(59.5, 45, { side: 1, iris: '#22a6b8', w: 12.5, h: 8.6, fierce: 0.2, lash: 0.25 })}
    ${brow(40, 37.5, { side: -1, angle: 0.5, w: 12 })}${brow(60, 37.5, { side: 1, angle: 0.5, w: 12 })}
    ${nose(50, 52.5)}${smile(50, 57.5, 9, { smirk: 0.6 })}
    ${blush(36, 54)}${blush(64, 54)}`);
}

/* ---------------- people ---------------- */

export function girl() {
  const back = `<path d="M24 44 C22 26 34 14 50 14 C66 14 78 26 76 44 C78 60 80 72 76 84 L24 84 C20 72 22 60 24 44Z" fill="#3a2230" data-shade="0.6"/>`;
  const fringe = `<path d="M27 46 C26 30 36 19 50 19 C64 19 74 30 73 46 C70 40 67 33 63 29 C58 36 50 38 42 37 C46 34 48 31 49 27 C43 33 35 37 29 40 Z" fill="#3a2230" data-shade="0.6"/>
    <path d="M38 23 Q44 19 52 19" stroke="#7a5068" stroke-width="1.4" fill="none" stroke-linecap="round" data-flat/>`;
  const flower = `<g transform="translate(70 26)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-3.6" rx="2.6" ry="3.4" fill="#ff7aa8" transform="rotate(${a})" data-noshade data-lw="0.9"/>`).join('')}<circle r="2" fill="#ffd34d" data-lw="0.8"/></g>`;
  return svg100(`
    ${back}
    ${bust({ top: '#F06A9B', shirt: '#FFD34D', hood: true, strings: false })}
    ${neck}${ears(47)}${face}${fringe}${flower}
    ${eye(40.5, 46, { side: -1, iris: '#7b4bd1', w: 12.5, h: 9.2, lash: 1 })}
    ${eye(59.5, 46, { side: 1, iris: '#7b4bd1', w: 12.5, h: 9.2, lash: 1 })}
    ${brow(40, 38.5, { side: -1, angle: -0.3, w: 11, t: 1.8 })}${brow(60, 38.5, { side: 1, angle: -0.3, w: 11, t: 1.8 })}
    ${nose(50, 53)}${smile(50, 57.5, 8, { open: true })}
    ${blush(35.5, 54.5)}${blush(64.5, 54.5)}`);
}

export function grandma() {
  const scarf = `<path d="M22 50 C20 28 33 15 50 15 C67 15 80 28 78 50 C80 64 76 74 70 80 L30 80 C24 74 20 64 22 50Z" fill="#2F9C7A"/>
    <path d="M27 60 C30 70 40 76 50 76 C60 76 70 70 73 60" stroke="#F2C14E" stroke-width="2.2" fill="none" data-flat/>
    <g fill="#F2C14E" data-flat>${[33, 41.5, 50, 58.5, 67].map((x, i) => `<circle cx="${x}" cy="${[66.5, 71.5, 73.6, 71.5, 66.5][i]}" r="1.3"/>`).join('')}</g>`;
  const faceIn = `<path d="M32 42 C32 31 40 25 50 25 C60 25 68 31 68 42 C68 55 61 64 50 67 C39 64 32 55 32 42Z" fill="${SKIN}"/>`;
  const glasses = `<g fill="none" stroke="#8a5a2b" stroke-width="1.6" data-flat><circle cx="41" cy="46" r="6.6"/><circle cx="59" cy="46" r="6.6"/><path d="M47.6 45.5 Q50 43.8 52.4 45.5"/></g>
    <g fill="#ffffff" opacity="0.25" data-flat><circle cx="41" cy="46" r="6"/><circle cx="59" cy="46" r="6"/></g>`;
  return svg100(`
    ${bust({ top: '#C0485A', shirt: '#2F9C7A', hood: false, strings: false })}
    ${scarf}${faceIn}
    ${eye(41, 46.5, { side: -1, iris: '#6b3e1e', w: 10, h: 6.4, lid: 0.25, lash: 0.4 })}
    ${eye(59, 46.5, { side: 1, iris: '#6b3e1e', w: 10, h: 6.4, lid: 0.25, lash: 0.4 })}
    ${glasses}
    ${brow(41, 37.5, { side: -1, angle: -0.4, w: 10, t: 1.5, color: '#9a8a8a' })}${brow(59, 37.5, { side: 1, angle: -0.4, w: 10, t: 1.5, color: '#9a8a8a' })}
    <path d="M34 52 q2 2 4 1.6 M66 52 q-2 2 -4 1.6" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.5" data-flat/>
    ${nose(50, 54)}${smile(50, 58.5, 9, { open: true, teeth: true })}
    ${blush(38.5, 56)}${blush(61.5, 56)}`);
}

export function grandpa() {
  const hood = `<path d="M24 76 C22 62 26 56 32 54 L68 54 C74 56 78 62 76 76Z" fill="#8a5a33" data-shade="0.6"/>`;
  const djellaba = `<path d="M6 108 C8 84 22 74 38 71 L62 71 C78 74 92 84 94 108Z" fill="#A8743F"/>
    <path d="M50 74 V108" stroke="#E9D3A5" stroke-width="3" data-flat/><path d="M50 74 V108" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 2" data-flat/>`;
  const fez = `<path d="M36 28 L38 12 Q50 9 62 12 L64 28 Q50 31 36 28Z" fill="#C8273A"/>
    <path d="M52 10.5 Q62 11 63.5 20" stroke="#2b2230" stroke-width="1.1" fill="none" data-flat/>
    <path d="M62 20 h3 l1 6 h-5z" fill="#2b2230" data-flat/>`;
  const beard = `<path d="M31 46 C31 56 34 70 50 79 C66 70 69 56 69 46 C66 52 60 56 50 56 C40 56 34 52 31 46Z" fill="#F1F0EA" data-shade="0.82"/>
    <path d="M38 56 C42 52 47 53 50 55 C53 53 58 52 62 56 C58 58 54 58 50 57 C46 58 42 58 38 56Z" fill="#E4E2DA" data-lw="1.3"/>`;
  return svg100(`
    ${djellaba}${hood}
    ${neck}${ears(45)}${face}${beard}
    <path d="M30 36 C30 30 33 27 36 27 L64 27 C67 27 70 30 70 36 C66 32 60 30 50 30 C40 30 34 32 30 36Z" fill="#E8E6DF"/>
    ${fez}
    ${eye(40.5, 44.5, { side: -1, iris: '#4a6b8a', w: 10.5, h: 6, lid: 0.35, lash: 0.3 })}
    ${eye(59.5, 44.5, { side: 1, iris: '#4a6b8a', w: 10.5, h: 6, lid: 0.35, lash: 0.3 })}
    ${brow(40, 37, { side: -1, angle: -0.2, w: 11, t: 2.6, color: '#EDECE6' })}${brow(60, 37, { side: 1, angle: -0.2, w: 11, t: 2.6, color: '#EDECE6' })}
    <path d="M33 47 l-2.5 -1 M67 47 l2.5 -1" stroke="${INK}" stroke-width="0.9" opacity="0.55" data-flat/>
    ${nose(50, 51.5, 1.2)}
    <path d="M45 63 Q50 66 55 63" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round" data-flat/>`);
}

/* ---------------- animals ---------------- */

const hoodie = (top, shirt = '#ffffff') => bust({ top, shirt, hood: true, strings: true });

export function lion() {
  const mane = `<path d="M50 6 L58 14 L69 9 L71 20 L83 20 L79 31 L90 38 L80 45 L87 56 L75 59 L77 71 L65 68 L60 79 L50 72 L40 79 L35 68 L23 71 L25 59 L13 56 L20 45 L10 38 L21 31 L17 20 L29 20 L31 9 L42 14Z" fill="#B85A1E" data-shade="0.6"/>`;
  const head = `<path d="M30 42 C30 28 39 21 50 21 C61 21 70 28 70 42 C70 56 62 65 50 67 C38 65 30 56 30 42Z" fill="#F2A93B"/>`;
  const ear = (x) => `<circle cx="${x}" cy="25" r="6" fill="#F2A93B"/><circle cx="${x}" cy="25.5" r="3" fill="#C8642A" data-flat/>`;
  const muzzle = `<path d="M38 56 C38 49 44 47 50 49 C56 47 62 49 62 56 C62 62 56 65 50 65 C44 65 38 62 38 56Z" fill="#FBE3B6"/>`;
  return svg100(`
    ${hoodie('#E8B52E', '#B85A1E')}
    ${mane}${ear(34)}${ear(66)}${head}${muzzle}
    ${eye(41, 42, { side: -1, iris: '#E0A21A', w: 11, h: 7.6, fierce: 0.5, lash: 0.2 })}
    ${eye(59, 42, { side: 1, iris: '#E0A21A', w: 11, h: 7.6, fierce: 0.5, lash: 0.2 })}
    ${brow(41, 34.5, { side: -1, angle: 0.8, w: 11, color: '#8a3e12' })}${brow(59, 34.5, { side: 1, angle: 0.8, w: 11, color: '#8a3e12' })}
    <path d="M45 51 H55 L50 56Z" fill="#5a2a1a" data-lw="1.2"/>
    <path d="M50 56 V58 M44 59 Q47 62 50 58 Q53 62 56 59" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round" data-flat/>`);
}

export function cat() {
  const ears = `<path d="M28 34 L27 12 L44 24Z" fill="#9AA3B5"/><path d="M72 34 L73 12 L56 24Z" fill="#9AA3B5"/>
    <path d="M31 28 L31 17 L40 24Z" fill="#F4A7B9" data-flat/><path d="M69 28 L69 17 L60 24Z" fill="#F4A7B9" data-flat/>`;
  const head = `<path d="M26 46 C25 30 36 21 50 21 C64 21 75 30 74 46 C74 58 64 67 50 67 C36 67 26 58 26 46Z" fill="#9AA3B5"/>`;
  const stripes = `<path d="M50 22 V30 M44 23 L45.5 29 M56 23 L54.5 29" stroke="#5f677c" stroke-width="2.4" stroke-linecap="round" data-flat/>
    <path d="M26 44 L32 45 M26 50 L32 49 M74 44 L68 45 M74 50 L68 49" stroke="#5f677c" stroke-width="2" stroke-linecap="round" data-flat/>`;
  const muzzle = `<path d="M40 56 C40 51 45 50 50 52 C55 50 60 51 60 56 C60 61 55 63 50 63 C45 63 40 61 40 56Z" fill="#EEF0F5"/>`;
  return svg100(`
    ${hoodie('#5B6CE0', '#F4A7B9')}
    ${ears}${head}${stripes}${muzzle}
    ${eye(40.5, 44, { side: -1, iris: '#5ccf6b', w: 12, h: 8.4, lash: 0.5 })}
    ${eye(59.5, 44, { side: 1, iris: '#5ccf6b', w: 12, h: 8.4, lash: 0.5 })}
    ${brow(40.5, 36, { side: -1, angle: 0.1, w: 9, t: 1.8, color: '#4a5266' })}${brow(59.5, 36, { side: 1, angle: 0.1, w: 9, t: 1.8, color: '#4a5266' })}
    <path d="M47.5 53 H52.5 L50 55.5Z" fill="#E86A8A" data-lw="1"/>
    <path d="M50 55.5 V57 M46 58 Q48 60 50 57 Q52 60 54 58" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round" data-flat/>
    <path d="M38 55 L28 53 M38 58 L28 60 M62 55 L72 53 M62 58 L72 60" stroke="#ffffff" stroke-width="1" data-flat/>`);
}

export function fox() {
  const ears = `<path d="M27 36 L22 8 L45 24Z" fill="#F07A26"/><path d="M73 36 L78 8 L55 24Z" fill="#F07A26"/>
    <path d="M29 28 L26 14 L39 24Z" fill="#3a2230" data-flat/><path d="M71 28 L74 14 L61 24Z" fill="#3a2230" data-flat/>`;
  const head = `<path d="M24 40 C26 27 37 21 50 21 C63 21 74 27 76 40 L80 50 L66 56 C62 62 56 67 50 67 C44 67 38 62 34 56 L20 50Z" fill="#F07A26"/>`;
  const cheeks = `<path d="M20 50 L34 56 C38 62 44 67 50 67 C56 67 62 62 66 56 L80 50 C72 58 60 52 50 56 C40 52 28 58 20 50Z" fill="#FFF4E6" data-shade="0.85"/>
    <path d="M44 22 Q50 30 56 22 Q50 26 44 22Z" fill="#FFF4E6" data-flat/>`;
  return svg100(`
    ${hoodie('#2E3C59', '#F07A26')}
    ${ears}${head}${cheeks}
    ${eye(40.5, 43, { side: -1, iris: '#F2B233', w: 12, h: 8, fierce: 0.6, lash: 0.4 })}
    ${eye(59.5, 43, { side: 1, iris: '#F2B233', w: 12, h: 8, fierce: 0.6, lash: 0.4 })}
    ${brow(40, 35.5, { side: -1, angle: 0.7, w: 10, t: 2, color: '#8a3a10' })}${brow(60, 35.5, { side: 1, angle: 0.7, w: 10, t: 2, color: '#8a3a10' })}
    <ellipse cx="50" cy="56.5" rx="3.6" ry="2.6" fill="#2a1d2a" data-lw="1"/>
    ${smile(50, 60.5, 8, { smirk: 1 })}`);
}

export function bear() {
  const ear = (x) => `<circle cx="${x}" cy="24" r="8" fill="#8B5A3C"/><circle cx="${x}" cy="24.5" r="4.2" fill="#D9A47E" data-flat/>`;
  const head = `<path d="M26 45 C26 30 36 21 50 21 C64 21 74 30 74 45 C74 59 64 67 50 67 C36 67 26 59 26 45Z" fill="#8B5A3C"/>`;
  const muzzle = `<ellipse cx="50" cy="56" rx="11" ry="8.4" fill="#E2B48E"/>`;
  return svg100(`
    ${hoodie('#3FA34D', '#F2C14E')}
    ${ear(30)}${ear(70)}${head}${muzzle}
    ${eye(40, 43.5, { side: -1, iris: '#7a4a24', w: 11, h: 7.6, lash: 0.2 })}
    ${eye(60, 43.5, { side: 1, iris: '#7a4a24', w: 11, h: 7.6, lash: 0.2 })}
    ${brow(40, 36, { side: -1, angle: -0.2, w: 10, t: 2.2, color: '#4f2f1c' })}${brow(60, 36, { side: 1, angle: -0.2, w: 10, t: 2.2, color: '#4f2f1c' })}
    <ellipse cx="50" cy="52.5" rx="4.4" ry="3.2" fill="#2a1d2a" data-lw="1"/>
    ${smile(50, 57, 9, { open: true })}`);
}

export function panda() {
  const ear = (x) => `<circle cx="${x}" cy="24" r="8" fill="#2b2a38"/>`;
  const head = `<path d="M25 45 C25 30 36 21 50 21 C64 21 75 30 75 45 C75 59 64 67 50 67 C36 67 25 59 25 45Z" fill="#F7F7F4" data-shade="0.8"/>`;
  const patch = (x, s) => `<path d="M${x - 8 * s} ${48} C${x - 10 * s} ${38} ${x - 2 * s} ${34} ${x + 5 * s} ${38} C${x + 9 * s} ${42} ${x + 6 * s} ${52} ${x - 1 * s} ${53} C${x - 5 * s} ${53.5} ${x - 7 * s} ${51} ${x - 8 * s} ${48}Z" fill="#2b2a38" data-noshade/>`;
  return svg100(`
    ${hoodie('#E2475F', '#2b2a38')}
    ${ear(29)}${ear(71)}${head}${patch(40, -1)}${patch(60, 1)}
    ${eye(40.5, 44.5, { side: -1, iris: '#9a6b3a', w: 9.6, h: 7, lash: 0 })}
    ${eye(59.5, 44.5, { side: 1, iris: '#9a6b3a', w: 9.6, h: 7, lash: 0 })}
    <ellipse cx="50" cy="54" rx="4" ry="2.8" fill="#2b2a38" data-lw="1"/>
    ${smile(50, 58.5, 8, { open: true })}
    ${blush(34, 56, 3)}${blush(66, 56, 3)}`);
}

export function rabbit() {
  const ears = `<path d="M36 30 C30 18 30 4 37 3 C44 4 44 18 43 28Z" fill="#F1EEF4"/><path d="M64 30 C70 18 70 4 63 3 C56 4 56 18 57 28Z" fill="#F1EEF4"/>
    <path d="M37.5 26 C34 18 34 9 37.5 8 C41 9 41 18 40.5 26Z" fill="#F6A8C0" data-flat/><path d="M62.5 26 C66 18 66 9 62.5 8 C59 9 59 18 59.5 26Z" fill="#F6A8C0" data-flat/>`;
  const head = `<path d="M27 47 C27 32 37 24 50 24 C63 24 73 32 73 47 C73 60 63 67 50 67 C37 67 27 60 27 47Z" fill="#F1EEF4" data-shade="0.82"/>`;
  return svg100(`
    ${hoodie('#7B61D9', '#F6A8C0')}
    ${ears}${head}
    ${eye(40.5, 46, { side: -1, iris: '#d94f7a', w: 11.5, h: 8.4, lash: 0.8 })}
    ${eye(59.5, 46, { side: 1, iris: '#d94f7a', w: 11.5, h: 8.4, lash: 0.8 })}
    <path d="M47.6 54 H52.4 L50 56.4Z" fill="#E86A8A" data-lw="1"/>
    <path d="M50 56.4 V58 M46 58.6 Q48 60.6 50 58 Q52 60.6 54 58.6" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round" data-flat/>
    <path d="M47.6 59.4 H52.4 V63 H47.6Z" fill="#ffffff" data-lw="0.9"/><path d="M50 59.4 V63" stroke="${INK}" stroke-width="0.8" data-flat/>
    ${blush(34, 55)}${blush(66, 55)}`);
}

export function owl() {
  const body = `<path d="M24 50 C22 32 34 20 50 20 C66 20 78 32 76 50 C76 62 66 70 50 70 C34 70 24 62 24 50Z" fill="#9A6B45"/>
    <path d="M26 30 L22 16 L36 24Z" fill="#9A6B45"/><path d="M74 30 L78 16 L64 24Z" fill="#9A6B45"/>`;
  const discs = `<circle cx="39.5" cy="44" r="11" fill="#F2DFC0"/><circle cx="60.5" cy="44" r="11" fill="#F2DFC0"/>`;
  const chest = `<path d="M38 60 Q50 54 62 60 Q58 70 50 71 Q42 70 38 60Z" fill="#E7C9A0" data-noshade/>
    <path d="M44 63 q1.5 1.5 3 0 M51 63 q1.5 1.5 3 0 M47.5 67 q1.5 1.5 3 0" stroke="#9A6B45" stroke-width="1" fill="none" data-flat/>`;
  return svg100(`
    ${hoodie('#2E7D6B', '#F2B233')}
    ${body}${discs}${chest}
    ${eye(39.5, 44.5, { side: -1, iris: '#F28A1E', w: 12, h: 9.6, lash: 0 })}
    ${eye(60.5, 44.5, { side: 1, iris: '#F28A1E', w: 12, h: 9.6, lash: 0 })}
    ${brow(39, 33.5, { side: -1, angle: 0.6, w: 12, t: 2.6, color: '#5b3a22' })}${brow(61, 33.5, { side: 1, angle: 0.6, w: 12, t: 2.6, color: '#5b3a22' })}
    <path d="M46 51 L54 51 L50 59Z" fill="#F2B233" data-lw="1.2"/>`);
}

export function frog() {
  const head = `<path d="M18 52 C18 40 30 34 50 34 C70 34 82 40 82 52 C82 63 68 70 50 70 C32 70 18 63 18 52Z" fill="#5CBF4A"/>`;
  const bumps = `<circle cx="34" cy="34" r="12" fill="#5CBF4A"/><circle cx="66" cy="34" r="12" fill="#5CBF4A"/>`;
  return svg100(`
    ${hoodie('#F2B233', '#5CBF4A')}
    ${bumps}${head}
    ${eye(34, 34, { side: -1, iris: '#3a2a1a', w: 14, h: 11, lash: 0 })}
    ${eye(66, 34, { side: 1, iris: '#3a2a1a', w: 14, h: 11, lash: 0 })}
    <path d="M30 56 Q50 70 70 56" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="44" cy="48" r="1.2" fill="${INK}" data-flat/><circle cx="56" cy="48" r="1.2" fill="${INK}" data-flat/>
    ${blush(28, 56, 4)}${blush(72, 56, 4)}`);
}

export function penguin() {
  const head = `<path d="M24 48 C24 30 36 20 50 20 C64 20 76 30 76 48 C76 62 64 70 50 70 C36 70 24 62 24 48Z" fill="#2b2f45"/>`;
  const face = `<path d="M30 48 C30 38 36 32 43 33 C46 33.5 48 35 50 37 C52 35 54 33.5 57 33 C64 32 70 38 70 48 C70 60 61 67 50 67 C39 67 30 60 30 48Z" fill="#F7F7F4" data-shade="0.82"/>`;
  return svg100(`
    ${hoodie('#2D9CDB', '#F2994A')}
    ${head}${face}
    ${eye(41, 45, { side: -1, iris: '#3a5a8a', w: 10.5, h: 8, lash: 0.3 })}
    ${eye(59, 45, { side: 1, iris: '#3a5a8a', w: 10.5, h: 8, lash: 0.3 })}
    <path d="M43 53 Q50 50 57 53 Q50 60 43 53Z" fill="#F2994A" data-lw="1.2"/>
    ${blush(35, 55)}${blush(65, 55)}`);
}

export function monkey() {
  const ear = (x) => `<circle cx="${x}" cy="44" r="8" fill="#8A5A3C"/><circle cx="${x}" cy="44" r="4.6" fill="#F0C9A0" data-flat/>`;
  const head = `<path d="M27 44 C27 29 37 21 50 21 C63 21 73 29 73 44 C73 58 63 67 50 67 C37 67 27 58 27 44Z" fill="#8A5A3C"/>`;
  const face = `<path d="M33 46 C33 38 38 33 43 34 C46 34.6 48 36.5 50 38 C52 36.5 54 34.6 57 34 C62 33 67 38 67 46 C67 54 64 59 61 61 C58 64 54 66 50 66 C46 66 42 64 39 61 C36 59 33 54 33 46Z" fill="#F0C9A0"/>`;
  return svg100(`
    ${hoodie('#E86FA6', '#F2C14E')}
    ${ear(25)}${ear(75)}${head}${face}
    <path d="M44 26 Q50 22 50 30 Q53 23 57 27" stroke="#5a3520" stroke-width="2.2" fill="none" stroke-linecap="round" data-flat/>
    ${eye(42, 44, { side: -1, iris: '#7a4a24', w: 10, h: 7.6, lash: 0.2 })}
    ${eye(58, 44, { side: 1, iris: '#7a4a24', w: 10, h: 7.6, lash: 0.2 })}
    <circle cx="48" cy="53" r="1.1" fill="${INK}" data-flat/><circle cx="52" cy="53" r="1.1" fill="${INK}" data-flat/>
    ${smile(50, 57, 11, { open: true, teeth: true })}`);
}

export function tiger() {
  const ear = (x) => `<circle cx="${x}" cy="25" r="7" fill="#F28C28"/><circle cx="${x}" cy="25.5" r="3.6" fill="#2b2230" data-flat/>`;
  const head = `<path d="M24 44 C24 29 36 21 50 21 C64 21 76 29 76 44 L80 52 L70 56 C66 63 58 67 50 67 C42 67 34 63 30 56 L20 52Z" fill="#F28C28"/>`;
  const white = `<path d="M30 56 C34 48 42 48 50 52 C58 48 66 48 70 56 C66 63 58 67 50 67 C42 67 34 63 30 56Z" fill="#FFF6E8" data-shade="0.85"/>`;
  const stripes = `<g fill="#2b2230" data-flat>
    <path d="M50 21 L47 30 L50 28 L53 30Z"/><path d="M41 22 L43 29 L39 26Z"/><path d="M59 22 L57 29 L61 26Z"/>
    <path d="M24 42 L33 44 L25 46Z"/><path d="M22 49 L31 50 L24 53Z"/><path d="M76 42 L67 44 L75 46Z"/><path d="M78 49 L69 50 L76 53Z"/></g>`;
  return svg100(`
    ${hoodie('#1F2A44', '#F28C28')}
    ${ear(30)}${ear(70)}${head}${white}${stripes}
    ${eye(40.5, 43, { side: -1, iris: '#9ad43a', w: 12, h: 8, fierce: 0.8, lash: 0.3 })}
    ${eye(59.5, 43, { side: 1, iris: '#9ad43a', w: 12, h: 8, fierce: 0.8, lash: 0.3 })}
    ${brow(40, 35.5, { side: -1, angle: 0.9, w: 10, t: 2.2 })}${brow(60, 35.5, { side: 1, angle: 0.9, w: 10, t: 2.2 })}
    <path d="M46 53 H54 L50 57Z" fill="#E86A8A" data-lw="1.1"/>
    <path d="M50 57 V58.5 M45 59.5 Q47.5 62 50 58.5 Q52.5 62 55 59.5" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M45 60 L46 63.4 L47.4 60.6 M55 60 L54 63.4 L52.6 60.6" fill="#fff" stroke="${INK}" stroke-width="0.6" data-flat/>`);
}

export function koala() {
  const ear = (x) => `<circle cx="${x}" cy="32" r="12" fill="#A7AEBD"/><circle cx="${x}" cy="33" r="7" fill="#EBE3E8" data-flat/>`;
  const head = `<path d="M26 47 C26 32 37 24 50 24 C63 24 74 32 74 47 C74 60 63 67 50 67 C37 67 26 60 26 47Z" fill="#A7AEBD"/>`;
  return svg100(`
    ${hoodie('#22B8B0', '#F2C14E')}
    ${ear(25)}${ear(75)}${head}
    ${eye(39.5, 45, { side: -1, iris: '#4a3a2a', w: 10, h: 7.4, lid: 0.15, lash: 0.2 })}
    ${eye(60.5, 45, { side: 1, iris: '#4a3a2a', w: 10, h: 7.4, lid: 0.15, lash: 0.2 })}
    <path d="M43 50 C43 46 46 45 50 45 C54 45 57 46 57 50 C57 56 54 59 50 59 C46 59 43 56 43 50Z" fill="#2b2a38" data-lw="1.2"/>
    ${smile(50, 62, 7)}
    ${blush(34, 55)}${blush(66, 55)}`);
}

export function robot() {
  const head = `<rect x="24" y="22" width="52" height="44" rx="14" fill="#DDE3F0"/>`;
  const visor = `<rect x="30" y="32" width="40" height="20" rx="10" fill="#1E2236" data-noshade/>
    <ellipse cx="41" cy="42" rx="4.6" ry="5.2" fill="#3EF0C5" data-flat/><ellipse cx="59" cy="42" rx="4.6" ry="5.2" fill="#3EF0C5" data-flat/>
    <ellipse cx="42.2" cy="40.4" rx="1.6" ry="1.8" fill="#ffffff" data-flat/><ellipse cx="60.2" cy="40.4" rx="1.6" ry="1.8" fill="#ffffff" data-flat/>
    <path d="M44 58 H56" stroke="#7d86a3" stroke-width="2.4" stroke-linecap="round" data-flat/>`;
  return svg100(`
    ${bust({ top: '#7D86A3', shirt: '#3EF0C5', hood: false, strings: false })}
    <rect x="44" y="64" width="12" height="10" fill="#9AA3BD" data-noshade/>
    <rect x="18" y="38" width="8" height="16" rx="3" fill="#AEB6CC"/><rect x="74" y="38" width="8" height="16" rx="3" fill="#AEB6CC"/>
    <path d="M50 22 V12" stroke="${INK}" stroke-width="2.4" data-flat/><circle cx="50" cy="10" r="4" fill="#F2B233"/>
    ${head}${visor}`);
}
