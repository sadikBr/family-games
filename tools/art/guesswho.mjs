// «خمّن من؟»: the 24 family portraits (100×100, mascot pass) and the game's emblem.
// Every portrait is drawn from the attribute table the server answers from
// (src/shared/games/guesswho-chars.ts), so a picture can never disagree with an answer.
// The features the questions ask about are drawn big and bold: they must read on a 50 px card.
import { GW_CHARS } from '../../src/shared/games/guesswho-chars.ts';
import { INK, blush, brow, eye, nose, smile, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const SKIN = ['#F7D5B5', '#EDB98F', '#C98B5E', '#8E5A3A'];
const SKIN_SHADE = ['#E8B994', '#D99C70', '#A86F47', '#6F4329'];
const HAIR = { black: '#2A2433', brown: '#7B4A27', blond: '#EDC35A', white: '#EFEDE8' };
const CLOTH = { red: '#DB3F4D', blue: '#3B7BE0', green: '#36A46B', yellow: '#F2C23D', white: '#F4F0E6', brown: '#9C6B3F', purple: '#8E5BCB' };
// a lighter tint of the clothes for the hijab (the same colour family)
const TINT = { red: '#E65866', blue: '#5B93EC', green: '#4DB57E', yellow: '#F7D772', white: '#FFFFFF', brown: '#B58553', purple: '#A276DA' };
const TRIM = { red: '#F2C23D', blue: '#F2C23D', green: '#F2C23D', yellow: '#DB3F4D', white: '#C9A24A', brown: '#F2D7A0', purple: '#F2C23D' };
const IRIS = { brown: '#6B3E1E', blue: '#2F8FEA' };

/** Proportions by age: a child has a rounder, smaller face and bigger eyes; shoulders follow. */
function frame(age) {
  if (age === 'child') return { top: 25, l: 31, r: 69, chin: 68, eyeY: 47.5, eyeW: 13, eyeH: 9.6, browY: 39.5, noseY: 54, mouthY: 58.5, earY: 48, sh: 10 };
  return { top: 20, l: 29, r: 71, chin: 68, eyeY: 45, eyeW: 12, eyeH: 8.2, browY: 37, noseY: 52, mouthY: 58, earY: 46, sh: 4 };
}

const facePath = (f) =>
  `M${f.l} ${f.top + 20} C${f.l} ${f.top + 7} ${f.l + 9} ${f.top} 50 ${f.top} C${f.r - 9} ${f.top} ${f.r} ${f.top + 7} ${f.r} ${f.top + 20} C${f.r} ${f.top + 34} ${f.r - 8} ${f.chin - 3} 50 ${f.chin} C${f.l + 8} ${f.chin - 3} ${f.l} ${f.top + 34} ${f.l} ${f.top + 20}Z`;

/* ------------------------------ clothes ------------------------------ */

function outfit(c, f) {
  const col = CLOTH[c.color];
  const x0 = 6 + f.sh, x1 = 94 - f.sh;
  const body = `<path d="M${x0} 108 C${x0 + 2} 84 ${x0 + 16} 74 38 71 L62 71 C${x1 - 16} 74 ${x1 - 2} 84 ${x1} 108Z" fill="${col}"/>`;
  switch (c.outfit) {
    case 'jellaba': {
      // the pointed hood behind the neck, the trimmed placket down the front
      const hood = `<path d="M26 79 C22 64 27 56 33 54 L67 54 C73 56 78 64 74 79Z" fill="${col}" data-shade="0.62"/>`;
      return `${hood}${body}
        <path d="M44 73 L50 82 L56 73" fill="none" stroke="${TRIM[c.color]}" stroke-width="2.4" data-flat/>
        <path d="M50 82 V108" stroke="${TRIM[c.color]}" stroke-width="3" data-flat/>
        <path d="M50 84 V108" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 2" data-flat/>`;
    }
    case 'kaftan':
      // a deep V edged with the golden sfifa
      return `${body}
        <path d="M41 72 L50 90 L59 72" fill="none" stroke="#F2C23D" stroke-width="3.2" data-flat/>
        <path d="M50 90 V108" stroke="#F2C23D" stroke-width="3.2" data-flat/>
        <g fill="#F2C23D" data-flat><circle cx="50" cy="95" r="1.6"/><circle cx="50" cy="101" r="1.6"/></g>`;
    case 'shirt':
      return `${body}
        <path d="M40 71 L50 80 L44 85 Z" fill="#FFFFFF" data-lw="1.2"/><path d="M60 71 L50 80 L56 85 Z" fill="#FFFFFF" data-lw="1.2"/>
        <path d="M50 80 V108" stroke="${INK}" stroke-width="1" opacity="0.35" data-flat/>
        <g fill="#FFFFFF" data-flat><circle cx="50" cy="89" r="1.3"/><circle cx="50" cy="97" r="1.3"/></g>`;
    case 'tshirt':
      return `${body}<path d="M41 71.5 Q50 80 59 71.5" fill="none" stroke="#FFFFFF" stroke-width="2.6" data-flat/>`;
    case 'dress':
      // a round white collar
      return `${body}
        <path d="M38 72 Q42 81 50 79 Q58 81 62 72 Q56 75 50 75 Q44 75 38 72Z" fill="#FFFFFF" data-lw="1.2"/>`;
    case 'vest':
      return `<path d="M${x0} 108 C${x0 + 2} 84 ${x0 + 16} 74 38 71 L62 71 C${x1 - 16} 74 ${x1 - 2} 84 ${x1} 108Z" fill="#F4F0E6"/>
        <path d="M${x0} 108 C${x0 + 2} 84 ${x0 + 16} 74 38 71 L48 96 L46 108Z" fill="${col}"/>
        <path d="M${x1} 108 C${x1 - 2} 84 ${x1 - 16} 74 62 71 L52 96 L54 108Z" fill="${col}"/>
        <path d="M44 72 L50 79 L56 72" fill="none" stroke="${INK}" stroke-width="1" opacity="0.4" data-flat/>`;
    case 'cardigan':
      return `<path d="M${x0} 108 C${x0 + 2} 84 ${x0 + 16} 74 38 71 L62 71 C${x1 - 16} 74 ${x1 - 2} 84 ${x1} 108Z" fill="#F4F0E6"/>
        <path d="M${x0} 108 C${x0 + 2} 84 ${x0 + 16} 74 38 71 L46 84 L45 108Z" fill="${col}"/>
        <path d="M${x1} 108 C${x1 - 2} 84 ${x1 - 16} 74 62 71 L54 84 L55 108Z" fill="${col}"/>
        <g fill="#F2C23D" data-flat><circle cx="47.5" cy="92" r="1.5"/><circle cx="47.5" cy="100" r="1.5"/></g>`;
  }
  return body;
}

/* -------------------------------- hair -------------------------------- */

function hairBack(c, f) {
  const h = HAIR[c.hair];
  if (!h) return '';
  if (c.style === 'long') {
    // falls to the shoulders on both sides
    return `<path d="M${f.l - 6} ${f.top + 22} C${f.l - 8} ${f.top + 2} ${f.l + 6} ${f.top - 6} 50 ${f.top - 6} C${f.r - 6} ${f.top - 6} ${f.r + 8} ${f.top + 2} ${f.r + 6} ${f.top + 22} C${f.r + 8} 64 ${f.r + 10} 76 ${f.r + 6} 86 L${f.l - 6} 86 C${f.l - 10} 76 ${f.l - 8} 64 ${f.l - 6} ${f.top + 22}Z" fill="${h}" data-shade="0.6"/>`;
  }
  return '';
}

function hairFront(c, f) {
  const h = HAIR[c.hair];
  if (!h || c.hijab || c.hat === 'turban') return '';
  const t = f.top;
  const strand = c.hair === 'white' || c.hair === 'blond' ? '#FFFFFF' : '#8D86A8';
  if (c.style === 'bald') {
    // a shiny head with white tufts over the ears
    return `<path d="M${f.l - 2} ${t + 27} C${f.l - 3} ${t + 19} ${f.l} ${t + 14} ${f.l + 4} ${t + 12} C${f.l + 5} ${t + 18} ${f.l + 3} ${t + 23} ${f.l + 2} ${t + 28}Z" fill="${h}"/>
      <path d="M${f.r + 2} ${t + 27} C${f.r + 3} ${t + 19} ${f.r} ${t + 14} ${f.r - 4} ${t + 12} C${f.r - 5} ${t + 18} ${f.r - 3} ${t + 23} ${f.r - 2} ${t + 28}Z" fill="${h}"/>
      <path d="M41 ${t + 5} Q46 ${t + 2} 51 ${t + 3}" stroke="#FFFFFF" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round" data-flat/>`;
  }
  if (c.style === 'curly') {
    // a cap of round curls
    const curls = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1.08 - (i / (n - 1)) * 1.16);
      const cx = 50 + Math.cos(a) * (f.r - f.l) * 0.52;
      const cy = t + 16 - Math.sin(a) * 15;
      curls.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6.2" fill="${h}" data-noline/>`);
    }
    // under a cap, curls show below the brim
    if (c.hat !== 'none') for (const x of [f.l - 1, f.r + 1]) curls.push(`<circle cx="${x}" cy="${t + 21}" r="5" fill="${h}"/>`);
    return `<path d="M${f.l - 3} ${t + 24} C${f.l - 5} ${t + 4} ${f.l + 8} ${t - 5} 50 ${t - 5} C${f.r - 8} ${t - 5} ${f.r + 5} ${t + 4} ${f.r + 3} ${t + 24} C${f.r} ${t + 16} ${f.r - 6} ${t + 11} 50 ${t + 10} C${f.l + 6} ${t + 11} ${f.l} ${t + 16} ${f.l - 3} ${t + 24}Z" fill="${h}" data-shade="0.6"/>
      ${curls.join('')}`;
  }
  if (c.style === 'long' || c.style === 'braids') {
    // a parted fringe over the forehead (the long part is behind, or the braids)
    const braids = c.style === 'braids'
      ? [f.l - 2, f.r + 2].map((x) => `<g>${[0, 1, 2, 3].map((k) => `<ellipse cx="${x}" cy="${t + 34 + k * 7.5}" rx="4.6" ry="4.6" fill="${h}"/>`).join('')}
          <path d="M${x - 3} ${t + 61} h6 v3 h-6z" fill="#E2475F" data-lw="1"/></g>`).join('')
      : '';
    return `${braids}<path d="M${f.l - 2} ${t + 26} C${f.l - 3} ${t + 6} ${f.l + 8} ${t - 3} 50 ${t - 3} C${f.r - 8} ${t - 3} ${f.r + 3} ${t + 6} ${f.r + 2} ${t + 26} C${f.r - 2} ${t + 18} ${f.r - 5} ${t + 13} ${f.r - 9} ${t + 10} C${f.r - 15} ${t + 14} 56 ${t + 15} 51 ${t + 14} C${f.l + 12} ${t + 15} ${f.l + 4} ${t + 18} ${f.l - 2} ${t + 26}Z" fill="${h}" data-shade="0.6"/>
      <path d="M${f.l + 8} ${t + 4} Q50 ${t - 2} ${f.r - 10} ${t + 3}" stroke="${strand}" stroke-width="1.3" fill="none" opacity="0.6" stroke-linecap="round" data-flat/>`;
  }
  // short: a neat crop with a side fringe
  return `<path d="M${f.l - 2} ${t + 24} C${f.l - 4} ${t + 5} ${f.l + 8} ${t - 4} 50 ${t - 4} C${f.r - 6} ${t - 4} ${f.r + 4} ${t + 4} ${f.r + 2} ${t + 24} C${f.r - 1} ${t + 16} ${f.r - 3} ${t + 12} ${f.r - 7} ${t + 10} C${f.r - 16} ${t + 13} 50 ${t + 12} ${f.l + 14} ${t + 8} C${f.l + 8} ${t + 12} ${f.l + 2} ${t + 16} ${f.l - 2} ${t + 24}Z" fill="${h}" data-shade="0.6"/>
    <path d="M${f.l + 10} ${t + 2} Q${f.l + 18} ${t - 2} ${f.l + 26} ${t - 1}" stroke="${strand}" stroke-width="1.3" fill="none" opacity="0.6" stroke-linecap="round" data-flat/>`;
}

/* ---------------------------- head coverings --------------------------- */

/** The hijab: the cloth over the head and the neck (drawn after the neck), down onto the shoulders. */
function hijabDrape(c) {
  return `<path d="M20 52 C18 28 32 14 50 14 C68 14 82 28 80 52 C81 64 80 74 78 84 C70 90 30 90 22 84 C20 74 19 64 20 52Z" fill="${TINT[c.color]}"/>`;
}

/** The face as the hijab frames it, with the fold of the cloth around it. */
const HIJAB_FACE = 'M31 47 C31 34 39 27.5 50 27.5 C61 27.5 69 34 69 47 C69 59 61 67 50 69.5 C39 67 31 59 31 47Z';
function hijabFace(skin) {
  return `<path d="${HIJAB_FACE}" fill="${skin}"/>
    <path d="M28.5 47 C28.5 32 38 25 50 25 C62 25 71.5 32 71.5 47" fill="none" stroke="${INK}" stroke-width="1" opacity="0.35" data-flat/>`;
}

function hat(c, f) {
  const t = f.top;
  if (c.hat === 'fez') {
    return `<path d="M36 ${t + 8} L38 ${t - 8} Q50 ${t - 11} 62 ${t - 8} L64 ${t + 8} Q50 ${t + 11} 36 ${t + 8}Z" fill="#C8273A"/>
      <path d="M52 ${t - 9.5} Q62 ${t - 9} 63.5 ${t}" stroke="#2b2230" stroke-width="1.3" fill="none" data-flat/>
      <path d="M61.6 ${t} h3.8 l1.2 7 h-6.2z" fill="#2b2230" data-flat/>`;
  }
  if (c.hat === 'turban') {
    return `<path d="M${f.l - 4} ${t + 18} C${f.l - 7} ${t - 4} ${f.l + 6} ${t - 12} 50 ${t - 12} C${f.r - 6} ${t - 12} ${f.r + 7} ${t - 4} ${f.r + 4} ${t + 18} C${f.r - 2} ${t + 12} 60 ${t + 10} 50 ${t + 10} C40 ${t + 10} ${f.l + 2} ${t + 12} ${f.l - 4} ${t + 18}Z" fill="#F7F5EE" data-shade="0.8"/>
      <path d="M${f.l - 1} ${t + 9} C${f.l + 12} ${t - 4} ${f.r - 18} ${t - 6} ${f.r + 1} ${t + 6} M${f.l + 2} ${t + 1} C${f.l + 14} ${t - 9} ${f.r - 14} ${t - 10} ${f.r - 1} ${t - 2}" stroke="#C9C3B2" stroke-width="1.6" fill="none" stroke-linecap="round" data-flat/>`;
  }
  if (c.hat === 'cap') {
    const col = CLOTH[c.color];
    return `<path d="M${f.l - 2} ${t + 13} C${f.l - 3} ${t - 3} ${f.l + 7} ${t - 8} 50 ${t - 8} C${f.r - 7} ${t - 8} ${f.r + 3} ${t - 3} ${f.r + 2} ${t + 13}Z" fill="${col}"/>
      <path d="M${f.l - 6} ${t + 12} C${f.l + 4} ${t + 8} ${f.r - 4} ${t + 8} ${f.r + 6} ${t + 12} C${f.r + 8} ${t + 17} ${f.l - 8} ${t + 17} ${f.l - 6} ${t + 12}Z" fill="${col}" data-shade="0.7"/>
      <circle cx="50" cy="${t - 7.5}" r="2" fill="${col}" data-lw="1"/>
      <path d="M50 ${t - 6} V${t + 9}" stroke="${INK}" stroke-width="0.9" opacity="0.35" data-flat/>`;
  }
  return '';
}

/* ----------------------------- face details ---------------------------- */

function beardShape(c, f) {
  const col = c.hair === 'hidden' ? (c.age === 'elder' ? HAIR.white : HAIR.black) : HAIR[c.hair];
  return `<path d="M${f.l + 1} ${f.top + 26} C${f.l + 1} ${f.top + 38} ${f.l + 5} ${f.chin + 6} 50 ${f.chin + 10} C${f.r - 5} ${f.chin + 6} ${f.r - 1} ${f.top + 38} ${f.r - 1} ${f.top + 26} C${f.r - 5} ${f.top + 34} 60 ${f.top + 37} 50 ${f.top + 37} C40 ${f.top + 37} ${f.l + 5} ${f.top + 34} ${f.l + 1} ${f.top + 26}Z" fill="${col}" data-shade="0.75"/>`;
}

function moustache(c, f) {
  const col = c.hair === 'hidden' ? (c.age === 'elder' ? HAIR.white : HAIR.black) : HAIR[c.hair];
  const y = f.mouthY - 2;
  return `<path d="M39.5 ${y + 2.5} C42 ${y - 3} 47 ${y - 3} 50 ${y - 1} C53 ${y - 3} 58 ${y - 3} 60.5 ${y + 2.5} C56 ${y + 1.2} 53 ${y + 1.8} 50 ${y + 1} C47 ${y + 1.8} 44 ${y + 1.2} 39.5 ${y + 2.5}Z" fill="${col}" data-lw="1.3"/>`;
}

function glasses(f) {
  const y = f.eyeY + 0.5, r = f.eyeW * 0.6;
  return `<g fill="none" stroke="${INK}" stroke-width="2.3" data-flat><circle cx="40.5" cy="${y}" r="${r}"/><circle cx="59.5" cy="${y}" r="${r}"/>
    <path d="M${40.5 + r} ${y - 0.5} Q50 ${y - 3} ${59.5 - r} ${y - 0.5}"/><path d="M${40.5 - r} ${y - 1} L${f.l - 1} ${y - 2.5} M${59.5 + r} ${y - 1} L${f.r + 1} ${y - 2.5}"/></g>
    <g fill="#FFFFFF" opacity="0.16" data-flat><circle cx="40.5" cy="${y}" r="${r - 1}"/><circle cx="59.5" cy="${y}" r="${r - 1}"/></g>`;
}

function earrings(c, f) {
  const y = f.earY + 7;
  const xs = c.style === 'long' || c.style === 'braids' ? [f.l - 1.5, f.r + 1.5] : [f.l - 0.5, f.r + 0.5];
  return xs.map((x) => `<path d="M${x} ${y - 2} V${y}" stroke="#C9971F" stroke-width="1" data-flat/><circle cx="${x}" cy="${y + 2.6}" r="2.8" fill="#F5C842" data-lw="1"/>`).join('');
}

function mouth(c, f) {
  if (c.smile) return smile(50, f.mouthY - 0.5, c.age === 'child' ? 12 : 13, { open: true, teeth: true });
  // a calm closed mouth: a short straight line
  const lip = c.female ? '#B8495A' : INK;
  return `<path d="M45.5 ${f.mouthY + 2} H54.5" fill="none" stroke="${lip}" stroke-width="2" stroke-linecap="round" data-flat/>`;
}

function eyes(c, f) {
  const elder = c.age === 'elder';
  const o = { iris: IRIS[c.eyes], w: f.eyeW, h: elder ? f.eyeH * 0.82 : f.eyeH, lid: elder ? 0.3 : 0, lash: c.female ? 1 : 0.3 };
  const browCol = c.hair === 'white' || (elder && c.hair === 'hidden') ? '#B9B4AA' : c.hair === 'blond' ? '#B8862E' : c.hair === 'brown' ? '#5A3519' : INK;
  const t = c.female ? 1.7 : 2.5;
  const wr = elder
    ? `<path d="M${f.l + 3} ${f.eyeY + 1} l-2.5 -1 M${f.l + 3} ${f.eyeY + 3.5} l-2.5 0.5 M${f.r - 3} ${f.eyeY + 1} l2.5 -1 M${f.r - 3} ${f.eyeY + 3.5} l2.5 0.5" stroke="${INK}" stroke-width="0.9" opacity="0.55" data-flat/>
       <path d="M43 ${f.top + 8} Q50 ${f.top + 6.5} 57 ${f.top + 8} M44.5 ${f.top + 11} Q50 ${f.top + 9.8} 55.5 ${f.top + 11}" stroke="${INK}" stroke-width="0.8" fill="none" opacity="0.4" data-flat/>
       <path d="M41.5 ${f.noseY + 1} q-2.4 3.5 -0.6 7.5 M58.5 ${f.noseY + 1} q2.4 3.5 0.6 7.5 M36 ${f.eyeY + 5} q4 2 8 0.6 M64 ${f.eyeY + 5} q-4 2 -8 0.6" stroke="${INK}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round" data-flat/>`
    : '';
  return `${eye(40.5, f.eyeY, { side: -1, ...o })}${eye(59.5, f.eyeY, { side: 1, ...o })}
    ${brow(40.5, f.browY, { side: -1, angle: -0.2, w: 11, t, color: browCol })}${brow(59.5, f.browY, { side: 1, angle: -0.2, w: 11, t, color: browCol })}${wr}`;
}

/* ------------------------------- portrait ------------------------------- */

export function portrait(id) {
  const c = GW_CHARS.find((x) => x.id === id);
  if (!c) throw new Error(`no character ${id}`);
  const f = frame(c.age);
  const skin = SKIN[c.skin], skin2 = SKIN_SHADE[c.skin];
  const neck = `<path d="M42 ${f.chin - 6} H58 V75 Q50 79 42 75Z" fill="${skin2}" data-noshade/>`;
  const ears = `<ellipse cx="${f.l}" cy="${f.earY}" rx="4.2" ry="5.6" fill="${skin}"/><ellipse cx="${f.r}" cy="${f.earY}" rx="4.2" ry="5.6" fill="${skin}"/>`;
  const face = c.hijab ? hijabFace(skin) : `<path d="${facePath(f)}" fill="${skin}"/>`;
  const parts = [
    hairBack(c, f),
    outfit(c, f),
    neck,
    c.hijab ? hijabDrape(c) : '',
    c.hijab ? '' : ears,
    c.earrings ? earrings(c, f) : '',
    face,
    c.beard ? beardShape(c, f) : '',
    hairFront(c, f),
    eyes(c, f),
    nose(50, f.noseY, c.age === 'child' ? 0.9 : 1.1),
    mouth(c, f),
    c.moustache ? moustache(c, f) : '',
    c.glasses ? glasses(f) : '',
    hat(c, f),
    c.age === 'child' || (c.smile && !c.beard) ? `${blush(36, f.noseY + 2.5)}${blush(64, f.noseY + 2.5)}` : '',
  ];
  return svg100(parts.join('\n'));
}

export const GW_IDS = GW_CHARS.map((c) => c.id);

/* -------------------------------- emblem -------------------------------- */

// Emblem for «خمّن من؟» (100×100, mascot pass): a little board of faces, one flipped down, and a big
// question mark over it — the classic guessing game.
export function guesswho() {
  const card = (x, y, col, skin, up = true) =>
    up
      ? `<rect x="${x}" y="${y}" width="17" height="21" rx="3" fill="#FFF4DA" data-shade="0.9"/>
         <circle cx="${x + 8.5}" cy="${y + 9}" r="4.6" fill="${skin}" data-lw="1.2"/>
         <path d="M${x + 2.5} ${y + 21} C${x + 3} ${y + 15} ${x + 14} ${y + 15} ${x + 14.5} ${y + 21}Z" fill="${col}" data-lw="1.2"/>`
      : `<rect x="${x}" y="${y + 13}" width="17" height="8" rx="2.5" fill="#2E5FB8"/>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#174A6B', '#3FA7D6', ['#F2C23D', '#FFE89A'])}
    <rect x="17" y="55" width="66" height="29" rx="6" fill="#2E5FB8" data-shade="0.75"/>
    ${card(21, 59, '#DB3F4D', '#EDB98F')}${card(41.5, 59, '#36A46B', '#C98B5E', false)}${card(62, 59, '#F2C23D', '#8E5A3A')}
    <path d="M38.5 28 C38.5 15 61.5 13 62 26 C62.5 35 51 35 51 43" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" data-flat/>
    <path d="M38.5 28 C38.5 15 61.5 13 62 26 C62.5 35 51 35 51 43" fill="none" stroke="#FFD23F" stroke-width="6" stroke-linecap="round" data-flat/>
    <circle cx="51" cy="50.5" r="4.6" fill="#FFD23F" data-lw="2"/>`);
}
