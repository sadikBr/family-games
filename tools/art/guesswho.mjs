// «خمّن من؟»: the 24 family portraits (100×100, mascot pass) and the game's emblem.
// Every portrait is drawn from the attribute table the server answers from
// (src/shared/games/guesswho-chars.ts), so a picture can never disagree with an answer:
// ROWS gives what the questions ask about (drawn big and plain: thick glasses frames, a hijab or a turban
// that hides all the hair, an open smile…), LOOKS what makes each face itself (face shape, eyes, brows,
// nose, extras, the background).
// The portraits are square tiles with their own soft background (the board shows them ~48 px wide):
// a big head (the face is ~58% of the tile) over the shoulders, so the clothes' colour still reads.
import { GW_CHARS } from '../../src/shared/games/guesswho-chars.ts';
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const n = (v) => +v.toFixed(2);

const SKIN = ['#F8D7B8', '#E9B48A', '#C68657', '#8A5434'];
const SKIN_SHADE = ['#E9BC98', '#D49A6E', '#A86E44', '#6C4027'];
const LIP = ['#D9737E', '#C9626A', '#A8504F', '#6E3530'];
const HAIR = { black: '#2B2533', brown: '#7A4724', blond: '#F2C55C', white: '#E6E3DE' };
const BROW = { black: '#241F2B', brown: '#5A3318', blond: '#B98328', white: '#BDB7AC' };
const CLOTH = { red: '#DD3F4E', blue: '#3A7CE2', green: '#33A56A', yellow: '#F2BE38', white: '#F6F2E8', brown: '#A06C3F', purple: '#8E5BCB' };
const LIGHT = { red: '#F07C86', blue: '#7BAAF0', green: '#6FC897', yellow: '#FFDD80', white: '#FFFFFF', brown: '#C99A6B', purple: '#B48DE3' };
const DARK = { red: '#A92736', blue: '#2557AE', green: '#1F7A4B', yellow: '#C98F12', white: '#D9D2C0', brown: '#6E4423', purple: '#6438A0' };
const TRIM = { red: '#F6C945', blue: '#F6C945', green: '#F6C945', yellow: '#DD3F4E', white: '#C9A24A', brown: '#F2D7A0', purple: '#F6C945' };
const IRIS = { brown: '#6B3A1A', blue: '#2C9CF2' };
const GOLD = '#F6C945';

/* ------------------------------ geometry ------------------------------ */

/** The head's proportions by age and face shape (100×100; the head is centred on x = 50). */
function frame(c) {
  const kid = c.age === 'child';
  const f = kid
    ? { top: 20, chin: 78, w: 26.5, jw: 19, jy: 69, eyeY: 53, browY: 45, noseY: 60, mouthY: 66, earY: 55, eyeDX: 10.6, nb: 86 }
    : { top: 16, chin: 79, w: 24, jw: 17.5, jy: 69, eyeY: 48, browY: 40, noseY: 57, mouthY: 65.5, earY: 51, eyeDX: 10, nb: 85 };
  switch (c.look.face) {
    case 'round': f.w += 1.5; f.jw += 4.5; f.chin -= 1.5; f.jy -= 1; break;
    case 'long': f.w -= 1.8; f.jw -= 0.5; f.chin += 1.5; f.top -= 1.5; f.jy += 1; break;
    case 'square': f.w += 0.5; f.jw += 6; f.jy += 4.5; break;
    case 'heart': f.w += 1; f.jw -= 3.5; f.chin += 0.5; break;
  }
  f.shape = c.look.face;
  f.cy = f.eyeY + 1;
  return f;
}

/** The whole head's skin outline (the skull is under the hair). */
function facePath(f, { top = f.top, chin = f.chin, w = f.w } = {}) {
  const { jw, jy, cy } = f;
  const chinW = f.shape === 'square' ? jw * 0.55 : f.shape === 'heart' ? 3 : f.shape === 'round' ? jw * 0.55 : jw * 0.42;
  const side = (s) => {
    const X = (dx) => n(50 + s * dx);
    const c2x = jw + (w - jw) * 0.45, c2y = jy - (jy - cy) * 0.3;
    const k = f.shape === 'square' ? 0.5 : 0.8;
    const c3x = jw - (c2x - jw) * k, c3y = jy + (jy - c2y) * k;
    return { cheek: [X(w), n(cy)], jaw: [X(jw), n(jy)], c1: [X(w), n(cy + (jy - cy) * 0.5)], c2: [X(c2x), n(c2y)], c3: [X(c3x), n(c3y)], c4: [X(chinW), n(chin)] };
  };
  const r = side(1), l = side(-1);
  return `M50 ${top} C${n(50 + w * 0.6)} ${top} ${n(50 + w)} ${n(top + (cy - top) * 0.4)} ${r.cheek.join(' ')}
    C${r.c1.join(' ')} ${r.c2.join(' ')} ${r.jaw.join(' ')} C${r.c3.join(' ')} ${r.c4.join(' ')} 50 ${chin}
    C${l.c4.join(' ')} ${l.c3.join(' ')} ${l.jaw.join(' ')} C${l.c2.join(' ')} ${l.c1.join(' ')} ${l.cheek.join(' ')}
    C${n(50 - w)} ${n(top + (cy - top) * 0.4)} ${n(50 - w * 0.6)} ${top} 50 ${top}Z`;
}

/* ------------------------------ background ----------------------------- */

function background(c) {
  return `<rect x="-2" y="-2" width="104" height="104" fill="${c.look.bg}" data-flat/>
    <circle cx="50" cy="44" r="40" fill="#FFFFFF" opacity="0.38" data-flat/>
    <circle cx="50" cy="44" r="47" fill="none" stroke="#FFFFFF" stroke-width="2.5" opacity="0.25" data-flat/>`;
}

/* ------------------------------- clothes ------------------------------- */

function bodyPath(c, f) {
  const kid = c.age === 'child';
  const x0 = kid ? 7 : 1, x1 = 100 - x0, top = f.nb;
  return `M${x0} 103 C${x0} ${top + 6} ${x0 + 12} ${top} 38 ${top - 1.5} L62 ${top - 1.5} C${x1 - 12} ${top} ${x1} ${top + 6} ${x1} 103Z`;
}

function outfit(c, f) {
  const col = CLOTH[c.color], lt = LIGHT[c.color], dk = DARK[c.color];
  const t = f.nb - 1.5;
  const body = (fill = col) => `<path d="${bodyPath(c, f)}" fill="${fill}"/>`;
  const kid = c.age === 'child';
  switch (c.outfit) {
    case 'jellaba': {
      // the pointed hood lying behind the neck, the V-neck and the trimmed placket with its little buttons
      const hood = c.hijab ? '' : `<path d="M28 ${t + 10} C25 ${t - 4} 31 ${t - 12} 37 ${t - 13} L50 ${t - 3} L63 ${t - 13} C69 ${t - 12} 75 ${t - 4} 72 ${t + 10}Z" fill="${col}" data-shade="0.6"/>`;
      const tr = TRIM[c.color];
      return `${hood}${body()}
        <path d="M42 ${t} L50 ${t + 9} L58 ${t}" fill="none" stroke="${tr}" stroke-width="2.6" stroke-linejoin="round" data-flat/>
        <path d="M50 ${t + 9} V104" stroke="${tr}" stroke-width="3.4" data-flat/>
        <g fill="${dk}" data-flat>${[t + 12, t + 15.5, t + 19].map((y) => `<circle cx="50" cy="${y}" r="1.1"/>`).join('')}</g>`;
    }
    case 'kaftan':
      return `${body()}
        <path d="M39.5 ${t} L50 ${t + 13} L60.5 ${t}" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linejoin="round" data-flat/>
        <path d="M39.5 ${t} L50 ${t + 13} L60.5 ${t}" fill="none" stroke="${GOLD}" stroke-width="3.4" stroke-linejoin="round" data-flat/>
        <path d="M50 ${t + 13} V104" stroke="${INK}" stroke-width="5" data-flat/><path d="M50 ${t + 13} V104" stroke="${GOLD}" stroke-width="3" data-flat/>
        <g fill="${lt}" data-flat><circle cx="30" cy="${t + 9}" r="1.3"/><circle cx="70" cy="${t + 9}" r="1.3"/><circle cx="22" cy="${t + 13}" r="1.3"/><circle cx="78" cy="${t + 13}" r="1.3"/></g>`;
    case 'shirt':
      return `${body()}
        <path d="M50 ${t + 5} V104" stroke="${dk}" stroke-width="1.2" data-flat/>
        <g fill="#FFFFFF" data-flat><circle cx="52.5" cy="${t + 10}" r="1.1"/><circle cx="52.5" cy="${t + 15}" r="1.1"/></g>
        <path d="M39 ${t - 0.5} L50 ${t + 6} L43 ${t + 10} L36.5 ${t + 2}Z" fill="${lt}" data-lw="1.3"/>
        <path d="M61 ${t - 0.5} L50 ${t + 6} L57 ${t + 10} L63.5 ${t + 2}Z" fill="${lt}" data-lw="1.3"/>`;
    case 'tshirt': {
      const print = c.id === 'youssef'
        ? `<path d="M39.5 ${t + 0.2} Q50 ${t + 8} 60.5 ${t + 0.2}" fill="none" stroke="#FFFFFF" stroke-width="2" data-flat/><path d="M${kid ? 10 : 6} ${t + 12} L${kid ? 18 : 14} ${t + 6} M${kid ? 90 : 94} ${t + 12} L${kid ? 82 : 86} ${t + 6}" stroke="#FFFFFF" stroke-width="2.4" data-flat/>`
        : c.id === 'nour'
          ? `<path d="M50 ${t + 7} l1.9 3.9 4.3 0.6 -3.1 3 0.7 4.3 -3.8 -2 -3.8 2 0.7 -4.3 -3.1 -3 4.3 -0.6Z" fill="${GOLD}" data-lw="1"/>`
          : `<path d="M50 ${t + 17} C44 ${t + 13} 44.5 ${t + 8} 47.5 ${t + 8} C49 ${t + 8} 50 ${t + 9.5} 50 ${t + 9.5} C50 ${t + 9.5} 51 ${t + 8} 52.5 ${t + 8} C55.5 ${t + 8} 56 ${t + 13} 50 ${t + 17}Z" fill="#FFFFFF" data-lw="1"/>`;
      return `${body()}<path d="M39.5 ${t + 0.2} Q50 ${t + 8} 60.5 ${t + 0.2}" fill="none" stroke="${dk}" stroke-width="2.6" data-flat/>${print}`;
    }
    case 'sweater': {
      // a knitted crew neck with a zigzag band; a shirt collar peeks out for the boy
      const band = Array.from({ length: 12 }, (_, i) => `${i ? 'L' : 'M'}${8 + i * 8} ${t + (i % 2 ? 13 : 9)}`).join(' ');
      const collar = c.age === 'child'
        ? `<path d="M41 ${t - 0.5} L50 ${t + 5} L44.5 ${t + 8.5} Z" fill="#FFFFFF" data-lw="1.2"/><path d="M59 ${t - 0.5} L50 ${t + 5} L55.5 ${t + 8.5} Z" fill="#FFFFFF" data-lw="1.2"/>`
        : '';
      return `${body()}
        <path d="${band}" fill="none" stroke="${lt}" stroke-width="2.4" stroke-linejoin="round" data-flat/>
        <path d="M38.5 ${t - 0.5} Q50 ${t + 9} 61.5 ${t - 0.5}" fill="none" stroke="${dk}" stroke-width="4" data-flat/>
        <path d="M38.5 ${t - 0.5} Q50 ${t + 9} 61.5 ${t - 0.5}" fill="none" stroke="${lt}" stroke-width="1" stroke-dasharray="1 1.4" data-flat/>${collar}`;
    }
    case 'dress':
      // a round white collar
      return `${body()}
        <path d="M37 ${t} Q40 ${t + 9} 50 ${t + 7} Q60 ${t + 9} 63 ${t} Q57 ${t + 3.5} 50 ${t + 3.5} Q43 ${t + 3.5} 37 ${t}Z" fill="#FFFFFF" data-lw="1.3"/>
        <circle cx="50" cy="${t + 12}" r="1.4" fill="${dk}" data-flat/>`;
    case 'vest':
      return `${body('#FFFFFF')}
        <path d="M1 103 C1 ${t + 7} 13 ${t + 1} 38 ${t} L47 ${t + 19} L46 104Z" fill="${col}"/>
        <path d="M99 103 C99 ${t + 7} 87 ${t + 1} 62 ${t} L53 ${t + 19} L54 104Z" fill="${col}"/>
        <g fill="${GOLD}" data-flat><circle cx="44.5" cy="${t + 22}" r="1.3"/><circle cx="55.5" cy="${t + 22}" r="1.3"/></g>`;
    case 'cardigan': {
      const under = c.female ? '#E9DDF7' : '#FFFFFF';
      return `${body(under)}
        <path d="M${kid ? 7 : 1} 103 C${kid ? 7 : 1} ${t + 7} 13 ${t + 1} 38 ${t} L45 ${t + 12} L45 104Z" fill="${col}"/>
        <path d="M${kid ? 93 : 99} 103 C${kid ? 93 : 99} ${t + 7} 87 ${t + 1} 62 ${t} L55 ${t + 12} L55 104Z" fill="${col}"/>
        <g fill="#FFFFFF" data-flat><circle cx="57.5" cy="${t + 15}" r="1.3"/><circle cx="57.5" cy="${t + 20}" r="1.3"/></g>
        ${c.female ? `<path d="M43 ${t + 1} Q50 ${t + 8} 57 ${t + 1}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="0.1 2.6" stroke-linecap="round" data-flat/>` : `<path d="M47.6 ${t + 2} L52.4 ${t + 2} L51.4 ${t + 12} L50 ${t + 14} L48.6 ${t + 12}Z" fill="#2B2F5E" data-lw="1"/>`}`;
    }
  }
  return body();
}

function bowtie(c, f) {
  const y = f.nb + 0.5, a = c.look.accent ?? '#2B2F5E';
  return `<path d="M50 ${y} L43 ${y - 3.5} L43 ${y + 3.5}Z M50 ${y} L57 ${y - 3.5} L57 ${y + 3.5}Z" fill="${a}" data-lw="1.2"/><circle cx="50" cy="${y}" r="1.8" fill="${a}" data-lw="1.2"/>`;
}

/* -------------------------------- hair -------------------------------- */

/** The cap of hair over the skull, from temple to temple; `edge` is the hairline path from the right temple back to the left one. */
function cap(f, edge, { lift = 5, wide = 2, low = 4 } = {}) {
  const { top, w } = f;
  const yT = f.earY - low;
  return `M${n(50 - w - wide)} ${n(yT)} C${n(50 - w - wide - 1.5)} ${n(top + 4)} ${n(50 - w * 0.62)} ${n(top - lift)} 50 ${n(top - lift)}
    C${n(50 + w * 0.62)} ${n(top - lift)} ${n(50 + w + wide + 1.5)} ${n(top + 4)} ${n(50 + w + wide)} ${n(yT)} ${edge}Z`;
}

/** A braid from (x0, y0) to (x1, y1): plaited segments leaning left and right, a tie at the end. */
function braid(x0, y0, x1, y1, k, col, tie) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    const a = i % 2 ? 28 : -28;
    out.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="3.2" ry="${n(Math.hypot(x1 - x0, y1 - y0) / k * 0.72)}" transform="rotate(${a} ${n(x)} ${n(y)})" fill="${col}" data-lw="1.3" data-noshade/>`);
  }
  out.push(`<path d="M${n(x1 - 2.4)} ${n(y1 - 1)} h4.8 v3 h-4.8z" fill="${tie}" data-lw="1.1"/><path d="M${n(x1 - 1.6)} ${n(y1 + 2)} l-0.8 3.4 h4.8 l-0.8 -3.4z" fill="${col}" data-lw="1"/>`);
  return out.join('');
}

function hairBack(c, f) {
  const h = HAIR[c.hair];
  if (!h || c.hijab || c.hat === 'turban') return '';
  const { top, w } = f;
  if (c.style === 'long' || c.style === 'wavy') {
    const bottom = c.age === 'child' ? 92 : c.female ? 94 : 88;
    const L = 50 - w - 5, R = 50 + w + 5;
    if (c.style === 'wavy') {
      const waves = (x, s) => `C${x + s * 4} ${bottom - 30} ${x - s * 3} ${bottom - 22} ${x + s * 2} ${bottom - 14} C${x + s * 6} ${bottom - 7} ${x} ${bottom - 3} ${x + s * 4} ${bottom}`;
      return `<path d="M50 ${top - 6} C${R + 6} ${top - 6} ${R + 4} ${top + 22} ${R + 2} ${top + 34} ${waves(R + 2, 1)} L${L - 2 + 4} ${bottom} ${'C' + (L - 2 - 4 + 4) + ' ' + (bottom - 3) + ' ' + (L - 2 + 6 - 6) + ' ' + (bottom - 7) + ' ' + (L - 2 - 2) + ' ' + (bottom - 14)} C${L - 2 + 3} ${bottom - 22} ${L - 2 - 4} ${bottom - 30} ${L - 2} ${top + 34} C${L - 4} ${top + 22} ${L - 6} ${top - 6} 50 ${top - 6}Z" fill="${h}" data-shade="0.62"/>`;
    }
    return `<path d="M50 ${top - 6} C${R + 5} ${top - 6} ${R + 3} ${top + 20} ${R + 2} ${top + 36} C${R + 2} ${bottom - 14} ${R + 5} ${bottom - 6} ${R + 3} ${bottom} L${L - 3} ${bottom} C${L - 5} ${bottom - 6} ${L - 2} ${bottom - 14} ${L - 2} ${top + 36} C${L - 3} ${top + 20} ${L - 5} ${top - 6} 50 ${top - 6}Z" fill="${h}" data-shade="0.62"/>`;
  }
  if (c.style === 'ponytail' && !c.female) return '';
  if (c.style === 'ponytail') {
    // a high ponytail swinging out behind the head, tied with a scrunchie
    const a = c.look.accent ?? '#E8577A';
    return `<path d="M${50 + w - 4} ${top + 4} C${50 + w + 12} ${top - 6} ${50 + w + 20} ${top + 8} ${50 + w + 14} ${top + 26} C${50 + w + 10} ${top + 38} ${50 + w + 16} ${top + 46} ${50 + w + 12} ${top + 52} C${50 + w + 4} ${top + 44} ${50 + w + 6} ${top + 30} ${50 + w + 4} ${top + 20} C${50 + w + 2} ${top + 14} ${50 + w - 2} ${top + 10} ${50 + w - 6} ${top + 10}Z" fill="${h}" data-shade="0.65"/>
      <ellipse cx="${50 + w + 1}" cy="${top + 4}" rx="4.6" ry="3.6" transform="rotate(-35 ${50 + w + 1} ${top + 4})" fill="${a}" data-lw="1.3"/>`;
  }
  return '';
}

function hairFront(c, f) {
  const h = HAIR[c.hair];
  if (!h || c.hijab || c.hat === 'turban') return '';
  const { top, w, earY } = f;
  const hl = top + (c.age === 'child' ? 12 : 11);
  const sheen = c.hair === 'black' ? '#5D5470' : c.hair === 'brown' ? '#A86F43' : '#FFFFFF';
  const shine = (x0, y0, x1, y1) => `<path d="M${n(x0)} ${n(y0)} Q${n((x0 + x1) / 2)} ${n(Math.min(y0, y1) - 2.5)} ${n(x1)} ${n(y1)}" stroke="${sheen}" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round" data-flat/>`;
  const R = 50 + w, L = 50 - w;
  // a young man's long hair is tied in a low ponytail hanging over his shoulder: a crop from the front
  if (!c.female && c.style === 'ponytail') {
    return hairFront({ ...c, style: 'short' }, f);
  }
  switch (c.style) {
    case 'bald': {
      // a shiny head with tufts over the ears
      const tuft = (s) => `<path d="M${n(50 + s * (w + 2))} ${earY + 1} C${n(50 + s * (w + 4))} ${earY - 6} ${n(50 + s * (w + 2))} ${earY - 13} ${n(50 + s * (w - 3))} ${earY - 16} C${n(50 + s * (w - 1))} ${earY - 11} ${n(50 + s * (w - 2))} ${earY - 5} ${n(50 + s * (w - 1))} ${earY + 1}Z" fill="${h}" data-lw="1.6"/>`;
      return `${tuft(-1)}${tuft(1)}<path d="M38 ${top + 6} Q44 ${top + 2} 50 ${top + 2.5}" stroke="#FFFFFF" stroke-width="2.2" fill="none" opacity="0.65" stroke-linecap="round" data-flat/>`;
    }
    case 'short': {
      if (c.look.extras.includes('receding')) {
        // a high forehead with the hair swept back at the temples
        const edge = `L${n(R + 0.5)} ${earY - 3} C${n(R - 0.5)} ${hl + 4} ${n(R - 2)} ${hl - 1} ${n(R - 5)} ${hl - 5} C${n(R - 8)} ${hl - 1} ${n(56)} ${hl} 50 ${hl + 1}
          C${n(44)} ${hl} ${n(L + 8)} ${hl - 1} ${n(L + 5)} ${hl - 5} C${n(L + 2)} ${hl - 1} ${n(L + 0.5)} ${hl + 4} ${n(L - 0.5)} ${earY - 3}`;
        return `<path d="${cap(f, edge, { lift: 3.5, wide: 1.5 })}" fill="${h}" data-shade="0.62"/>
          <path d="M44 ${hl - 2} Q50 ${hl - 6} 56 ${hl - 2}" stroke="${INK}" stroke-width="1" fill="none" opacity="0.35" data-flat/>${shine(R - 18, top - 1, R - 8, top + 2)}`;
      }
      // a neat crop with a side parting and a swoop of fringe
      const edge = `L${n(R)} ${earY - 4} C${n(R - 1)} ${hl + 4} ${n(R - 4)} ${hl} ${n(R - 9)} ${hl - 1} C${n(56)} ${hl - 2} ${n(46)} ${hl + 1} ${n(L + 9)} ${hl + 5} C${n(L + 4)} ${hl + 7} ${n(L + 1)} ${hl + 10} ${n(L)} ${earY - 4}`;
      return `<path d="${cap(f, edge, { lift: c.age === 'child' ? 6 : 5 })}" fill="${h}" data-shade="0.62"/>
        <path d="M${n(L + 14)} ${top - 2} Q${n(L + 10)} ${hl - 4} ${n(L + 9)} ${hl + 4}" stroke="${INK}" stroke-width="1" fill="none" opacity="0.4" data-flat/>${shine(R - 18, top - 1, R - 8, top + 2)}`;
    }
    case 'spiky': {
      const edge = `L${n(R)} ${earY - 4} C${n(R - 2)} ${hl + 2} ${n(R - 6)} ${hl - 1} ${n(R - 10)} ${hl + 2} L${n(57)} ${hl - 2} L${n(51)} ${hl + 3} L${n(44)} ${hl - 1} L${n(L + 9)} ${hl + 3} C${n(L + 4)} ${hl} ${n(L + 1)} ${hl + 4} ${n(L)} ${earY - 4}`;
      return `<path d="${cap(f, edge, { lift: 8 })}" fill="${h}" data-shade="0.62"/>`;
    }
    case 'curly': {
      // short curls: a round, bumpy cap
      const bumps = [];
      const k = 11;
      for (let i = 0; i < k; i++) {
        const a = Math.PI * (1.12 - (i / (k - 1)) * 1.24);
        bumps.push(`<circle cx="${n(50 + Math.cos(a) * (w + 1.5))}" cy="${n(top + 16 - Math.sin(a) * 19)}" r="${c.age === 'child' ? 5.6 : 5}" fill="${h}" data-noline/>`);
      }
      const fringe = [];
      for (let i = 0; i < 5; i++) fringe.push(`<circle cx="${n(50 - w * 0.62 + i * w * 0.31)}" cy="${n(hl - 1 + (i % 2) * 1.5 + Math.abs(i - 2) * 0.8)}" r="4" fill="${h}" data-noline/>`);
      const edge = `L${n(R + 1)} ${earY - 4} C${n(R - 2)} ${hl + 4} ${n(R - 6)} ${hl + 1} 50 ${hl + 1} C${n(L + 6)} ${hl + 1} ${n(L + 2)} ${hl + 4} ${n(L - 1)} ${earY - 4}`;
      const outline = [];
      // the bumpy outline drawn under the bumps so each curl keeps a dark edge
      for (let i = 0; i < k; i++) {
        const a = Math.PI * (1.12 - (i / (k - 1)) * 1.24);
        outline.push(`<circle cx="${n(50 + Math.cos(a) * (w + 1.5))}" cy="${n(top + 16 - Math.sin(a) * 19)}" r="${c.age === 'child' ? 5.6 : 5}" fill="${h}" data-lw="1.8" data-noshade/>`);
      }
      return `${outline.join('')}<path d="${cap(f, edge, { lift: 3, wide: 2.5 })}" fill="${h}" data-noline data-shade="0.62"/>${bumps.join('')}${fringe.join('')}
        ${[[-0.45, 2], [0.15, -1], [0.55, 4]].map(([dx, dy]) => `<path d="M${n(50 + dx * w - 2)} ${n(top + dy + 2)} q2 -2.4 4 0" stroke="${sheen}" stroke-width="1.3" fill="none" opacity="0.75" stroke-linecap="round" data-flat/>`).join('')}`;
    }
    case 'long':
    case 'wavy':
    case 'braids':
    case 'ponytail': {
      // a middle (or side) parting over the forehead; the length is behind, or in the braids
      const side = c.style === 'ponytail' || c.id === 'layla';
      const edge = side
        ? `L${n(R + 1.5)} ${earY + 2} C${n(R - 1)} ${hl + 4} ${n(R - 6)} ${hl + 1} ${n(R - 12)} ${hl - 1} C${n(52)} ${hl - 2} ${n(44)} ${hl + 2} ${n(L + 6)} ${hl + 9} C${n(L + 2)} ${hl + 12} ${n(L)} ${earY - 2} ${n(L - 1.5)} ${earY + 2}`
        : `L${n(R + 1.5)} ${earY + 2} C${n(R)} ${hl + 8} ${n(R - 6)} ${hl + 2} 51 ${hl - 2} L50 ${hl - 5} L49 ${hl - 2} C${n(L + 6)} ${hl + 2} ${n(L)} ${hl + 8} ${n(L - 1.5)} ${earY + 2}`;
      let extra = '';
      if (c.style === 'braids' && !c.look.extras.includes('onebraid')) {
        const a = c.look.accent ?? GOLD;
        extra = [-1, 1].map((s) => {
          const x = 50 + s * (w + 1.5);
          return `${braid(x, earY + 1, x + s * 1.5, earY + 27, 4, h, h)}
            <path d="M${n(x + s * 1.5)} ${earY + 26} l-5 -3.6 l0 7.2 Z M${n(x + s * 1.5)} ${earY + 26} l5 -3.6 l0 7.2 Z" fill="${a}" data-lw="1.2"/><circle cx="${n(x + s * 1.5)}" cy="${earY + 26}" r="1.8" fill="${a}" data-lw="1.1"/>`;
        }).join('');
      }
      if (c.look.extras.includes('onebraid')) {
        // one long braid over the right shoulder
        extra = braid(R + 1, earY + 1, R - 5, earY + 36, 6, h, c.look.accent ?? GOLD);
      }
      if ((c.style === 'long' || c.style === 'wavy') && c.female) {
        // front locks over the shoulders
        extra = [-1, 1].map((s) => {
          const x = 50 + s * (w + 1.5);
          const bottom = c.age === 'child' ? 90 : c.female ? 92 : 87;
          return `<path d="M${n(x - s * 3)} ${earY - 2} C${n(x + s * 3)} ${earY + 6} ${n(x + s * 1)} ${bottom - 12} ${n(x + s * 5)} ${bottom} L${n(x - s * 2)} ${bottom - 2} C${n(x - s * 3)} ${bottom - 12} ${n(x - s * 2)} ${earY + 8} ${n(x - s * 4.5)} ${earY + 2}Z" fill="${h}" data-shade="0.7"/>`;
        }).join('');
      }
      const strands = c.hair === 'white'
        ? `<path d="M50 ${top - 4} V${hl - 4}" stroke="#8C857A" stroke-width="1.6" stroke-linecap="round" data-flat/>
          <path d="M49 ${hl - 5} C45 ${top + 3} 39 ${top + 5} ${n(L + 3)} ${hl + 6} M51 ${hl - 5} C55 ${top + 3} 61 ${top + 5} ${n(R - 3)} ${hl + 6} M49 ${top} C43 ${top + 1} 37 ${top + 7} ${n(L + 1)} ${hl + 13} M51 ${top} C57 ${top + 1} 63 ${top + 7} ${n(R - 1)} ${hl + 13}" stroke="#958E83" stroke-width="1.2" fill="none" stroke-linecap="round" data-flat/>`
        : '';
      return `<path d="${cap(f, edge, { lift: 5.5, wide: 3, low: -2 })}" fill="${h}" data-shade="0.62"/>${strands}${extra}${shine(L + 8, top + 2, L + 18, top - 1)}`;
    }
  }
  return '';
}

/** A young man's low ponytail, from behind his right ear down over the shoulder (drawn under the face). */
function lowTail(c, f) {
  if (c.female || c.style !== 'ponytail' || !HAIR[c.hair]) return '';
  const h = HAIR[c.hair];
  const x = 50 + f.w + 1, y = f.earY - 2;
  return `<path d="M${n(x - 6)} ${y} C${n(x + 4)} ${y - 2} ${n(x + 9)} ${y + 8} ${n(x + 9)} ${y + 18} C${n(x + 9)} ${y + 26} ${n(x + 13)} ${y + 34} ${n(x + 10)} ${y + 42} C${n(x + 4)} ${y + 36} ${n(x + 1)} ${y + 28} ${n(x + 1)} ${y + 20} C${n(x + 1)} ${y + 12} ${n(x - 2)} ${y + 8} ${n(x - 6)} ${y + 6}Z" fill="${h}" data-shade="0.65"/>
    <path d="M${n(x + 5)} ${y + 16} C${n(x + 6)} ${y + 24} ${n(x + 7)} ${y + 30} ${n(x + 9)} ${y + 36}" stroke="#A86F43" stroke-width="1.3" fill="none" opacity="0.8" stroke-linecap="round" data-flat/>
    <rect x="${n(x + 0.6)}" y="${y + 9}" width="8.6" height="4" rx="1.8" transform="rotate(-14 ${n(x + 5)} ${y + 11})" fill="#2B2F5E" data-lw="1.1"/>`;
}

/* ---------------------------- head coverings --------------------------- */

/** The hijab: the cloth round the head and the neck, down onto the shoulders (drawn over the clothes). */
function hijabBack(c, f) {
  const col = LIGHT[c.color] === '#FFFFFF' ? CLOTH[c.color] : CLOTH[c.color];
  const ex = c.look.extras;
  const tp = f.top - 6;
  const drape = `<path d="M${50 - f.w - 9} ${f.cy} C${50 - f.w - 11} ${tp + 4} ${50 - f.w + 2} ${tp} 50 ${tp} C${50 + f.w - 2} ${tp} ${50 + f.w + 11} ${tp + 4} ${50 + f.w + 9} ${f.cy}
    C${50 + f.w + 10} ${f.cy + 18} ${50 + f.w + 14} ${f.nb - 2} ${82} ${f.nb + 4} C${88} ${f.nb + 8} ${86} 100 ${80} 104 L20 104 C14 100 12 ${f.nb + 8} 18 ${f.nb + 4}
    C${50 - f.w - 14} ${f.nb - 2} ${50 - f.w - 10} ${f.cy + 18} ${50 - f.w - 9} ${f.cy}Z" fill="${col}" data-shade="0.66"/>`;
  // the fold under the chin, the hanging end over one shoulder
  const fold = `<path d="M${50 - f.w + 2} ${f.chin - 8} C${50 - f.w + 6} ${f.chin + 6} ${50 + f.w - 6} ${f.chin + 6} ${50 + f.w - 2} ${f.chin - 8}" fill="none" stroke="${DARK[c.color]}" stroke-width="1.4" opacity="0.6" data-flat/>
    <path d="M${50 + 6} ${f.chin + 4} C${62} ${f.nb + 4} ${66} ${f.nb + 10} ${64} 104" fill="none" stroke="${DARK[c.color]}" stroke-width="1.4" opacity="0.55" data-flat/>`;
  let pattern = '';
  if (ex.includes('dots')) {
    const pts = [[24, 34], [76, 32], [20, 52], [80, 54], [30, 20], [70, 18], [50, 10], [26, 92], [74, 92], [16, 72], [84, 74]];
    pattern = `<g data-flat>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y + (f.top - 16)}" r="1.5" fill="${LIGHT[c.color]}"/>`).join('')}</g>`;
  }
  const flap = ex.includes('pin')
    ? ''
    : `<path d="M${n(50 + f.w + 4)} ${n(f.chin - 8)} C${n(56)} ${n(f.nb)} 30 ${n(f.nb + 2)} 16 104 L40 104 C46 ${n(f.nb + 12)} ${n(62)} ${n(f.nb + 8)} ${n(50 + f.w + 10)} ${n(f.nb - 2)}Z" fill="${col}" data-shade="0.78"/>`;
  return `${drape}${fold}${pattern}${flap}`;
}

/** The face as the hijab frames it. */
function hijabFacePath(f) {
  const top = f.top + 9;
  return facePath(f, { top, w: f.w - 1.5 });
}

/** The band over the forehead (an under-scarf, or the cloth's edge) and the pin. */
function hijabFront(c, f) {
  const ex = c.look.extras;
  const top = f.top + 9;
  const w = f.w - 1.5;
  const band = ex.includes('cream') ? '#FFF3DD' : ex.includes('trim') ? GOLD : DARK[c.color];
  // the cloth's edge round the face: a thick line on the top half of the face outline
  const arc = `M${n(50 - w - 0.8)} ${n(f.cy + 2)} C${n(50 - w - 0.8)} ${n(top + 6)} ${n(50 - w * 0.6)} ${n(top - 0.8)} 50 ${n(top - 0.8)} C${n(50 + w * 0.6)} ${n(top - 0.8)} ${n(50 + w + 0.8)} ${n(top + 6)} ${n(50 + w + 0.8)} ${n(f.cy + 2)}`;
  let out = `<path d="${arc}" fill="none" stroke="${INK}" stroke-width="${ex.includes('cream') || ex.includes('trim') ? 5.6 : 4.4}" stroke-linecap="round" data-flat/>
    <path d="${arc}" fill="none" stroke="${band}" stroke-width="${ex.includes('cream') || ex.includes('trim') ? 3.4 : 2.2}" stroke-linecap="round" data-flat/>`;
  if (ex.includes('pin')) out += `<circle cx="${n(50 + w + 3)}" cy="${n(f.chin - 6)}" r="2.2" fill="${c.look.accent ?? GOLD}" data-lw="1.2"/>`;
  return out;
}

function hat(c, f) {
  const { top, w } = f;
  const col = CLOTH[c.color], dk = DARK[c.color], lt = LIGHT[c.color];
  if (c.hat === 'fez') {
    // the red fez, a little tilted, with its black tassel
    const y0 = top + 9, y1 = top - 10;
    return `<g transform="rotate(-5 50 ${y0})">
      <path d="M${34} ${y0} L${37.5} ${y1} Q50 ${y1 - 3} ${62.5} ${y1} L${66} ${y0} Q50 ${y0 + 4.5} ${34} ${y0}Z" fill="#C8273A" data-shade="0.6"/>
      <ellipse cx="50" cy="${y1}" rx="12.5" ry="2.6" fill="#A81E30" data-lw="1.4"/>
      <path d="M50 ${y1} C56 ${y1 - 2} 62 ${y1 + 1} 63 ${y1 + 9}" stroke="${INK}" stroke-width="1.6" fill="none" data-flat/>
      <path d="M61 ${y1 + 8} h4.4 l1.4 8 h-7.2z" fill="#2B2533" data-lw="1"/></g>`;
  }
  if (c.hat === 'turban') {
    // a white turban wound round the head, the folds crossing over the forehead
    const y = top + 13;
    return `<path d="M${50 - w - 4} ${y} C${50 - w - 7} ${top - 6} ${50 - w + 4} ${top - 14} 50 ${top - 14} C${50 + w - 4} ${top - 14} ${50 + w + 7} ${top - 6} ${50 + w + 4} ${y} C${50 + w - 4} ${y - 4} ${60} ${y - 5} 50 ${y - 4} C${40} ${y - 5} ${50 - w + 4} ${y - 4} ${50 - w - 4} ${y}Z" fill="#FBF8F0" data-shade="0.82"/>
      <g fill="none" stroke="#CFC6B0" stroke-width="1.7" stroke-linecap="round" data-flat>
        <path d="M${50 - w - 2} ${y - 6} C${50 - w + 10} ${top - 4} ${50 + 6} ${top - 7} ${50 + w + 2} ${top - 1}"/>
        <path d="M${50 - w} ${top} C${50 - 10} ${top - 9} ${50 + 10} ${top - 11} ${50 + w - 2} ${top - 6}"/>
        <path d="M${50 + w + 2} ${y - 4} C${50 + w - 8} ${top + 2} ${50 - 4} ${top} ${50 - w + 2} ${top - 4}"/></g>
      <path d="M${50 - w - 4} ${y} C${50 - w + 4} ${y - 4} 40 ${y - 5} 50 ${y - 4} C60 ${y - 5} ${50 + w - 4} ${y - 4} ${50 + w + 4} ${y}" fill="none" stroke="#E2D9C4" stroke-width="2.2" data-flat/>`;
  }
  if (c.hat === 'cap') {
    // a peaked cap in the clothes' colour, the peak towards the viewer
    const y = top + 11;
    return `<path d="M${50 - w - 2} ${y} C${50 - w - 3} ${top - 4} ${50 - w + 6} ${top - 9} 50 ${top - 9} C${50 + w - 6} ${top - 9} ${50 + w + 3} ${top - 4} ${50 + w + 2} ${y}Z" fill="${col}" data-shade="0.66"/>
      <path d="M50 ${top - 8} V${y - 1}" stroke="${dk}" stroke-width="1.2" data-flat/>
      <circle cx="50" cy="${top - 8.5}" r="2.2" fill="${col}" data-lw="1.2"/>
      <path d="M${50 - w - 3} ${y - 1} C${50 - w + 6} ${y - 4} ${50 + w - 6} ${y - 4} ${50 + w + 3} ${y - 1} C${50 + w + 6} ${y + 6} ${50 - w - 6} ${y + 6} ${50 - w - 3} ${y - 1}Z" fill="${dk}" data-shade="0.75"/>
      <circle cx="${50 - 8}" cy="${top + 1}" r="3" fill="#FFFFFF" data-lw="1.2"/>`;
  }
  if (c.hat === 'beanie') {
    // a knitted beanie with a folded cuff and a pompom
    const y = top + 14;
    const ribs = Array.from({ length: 9 }, (_, i) => `<path d="M${n(50 - w - 1 + (i + 0.5) * ((2 * w + 2) / 9))} ${y - 6.5} v6" stroke="${dk}" stroke-width="1.1" opacity="0.6" data-flat/>`).join('');
    return `<circle cx="50" cy="${top - 4.5}" r="4.4" fill="${lt}" data-lw="1.6"/>
      <path d="M${50 - w - 1} ${y - 5} C${50 - w - 2} ${top - 1} ${50 - w + 6} ${top - 5} 50 ${top - 5} C${50 + w - 6} ${top - 5} ${50 + w + 2} ${top - 1} ${50 + w + 1} ${y - 5}Z" fill="${col}" data-shade="0.66"/>
      <path d="M${50 - w - 2} ${y - 7.5} Q50 ${y - 10} ${50 + w + 2} ${y - 7.5} L${50 + w + 2.5} ${y} Q50 ${y - 2.5} ${50 - w - 2.5} ${y}Z" fill="${col}" data-noshade/>${ribs}`;
  }
  return '';
}

/* ----------------------------- face details ---------------------------- */

const browCol = (c) => {
  if (c.hair !== 'hidden') return BROW[c.hair];
  return c.age === 'elder' ? '#A39C92' : c.skin >= 2 ? '#1F1A22' : '#3A2A22';
};
const facialHairCol = (c) => (c.hair === 'hidden' ? (c.age === 'elder' ? HAIR.white : HAIR.black) : HAIR[c.hair]);

function eyes(c, f) {
  const L = c.look;
  const iris = IRIS[c.eyes];
  const kid = c.age === 'child';
  const out = [];
  for (const s of [-1, 1]) {
    const cx = 50 + s * f.eyeDX, cy = f.eyeY;
    let w, h, r, lid = 0, lower = 0;
    switch (L.eyeShape) {
      case 'round': w = kid ? 11 : 10; h = kid ? 11.5 : 10; r = kid ? 4.1 : 3.7; break;
      case 'wide': w = 11; h = 12.5; r = 3.6; break;
      case 'almond': w = 11.5; h = 7.4; r = 3.5; break;
      case 'small': w = c.eyes === 'blue' ? 10 : 9; h = c.eyes === 'blue' ? 6.8 : 6; r = c.eyes === 'blue' ? 3.3 : 2.9; break;
      case 'kind': w = 10.5; h = 6.8; r = 3.3; lower = 1.6; break;
    }
    if (c.mouth === 'laugh' && L.eyeShape !== 'wide') lower += 1.2;
    const l = cx - w / 2, rr = cx + w / 2;
    const isRound = L.eyeShape === 'round' || L.eyeShape === 'wide';
    const tilt = L.eyeShape === 'kind' ? h * 0.22 : L.eyeShape === 'small' ? 0 : -h * 0.06;
    // the white: an ellipse for round eyes, a lens (pointed corners) for the others
    const outer = s > 0 ? rr : l, inner = s > 0 ? l : rr;
    const d = isRound
      ? `M${n(l)} ${n(cy)} C${n(l)} ${n(cy - h * 0.66)} ${n(rr)} ${n(cy - h * 0.66)} ${n(rr)} ${n(cy)} C${n(rr)} ${n(cy + h * 0.66 - lower)} ${n(l)} ${n(cy + h * 0.66 - lower)} ${n(l)} ${n(cy)}Z`
      : `M${n(inner)} ${n(cy + 0.4)} C${n(inner + (outer - inner) * 0.2)} ${n(cy - h * 0.85)} ${n(outer - (outer - inner) * 0.18)} ${n(cy - h * 0.8)} ${n(outer)} ${n(cy + tilt)} C${n(outer - (outer - inner) * 0.2)} ${n(cy + h * 0.62 - lower)} ${n(inner + (outer - inner) * 0.25)} ${n(cy + h * 0.66 - lower)} ${n(inner)} ${n(cy + 0.4)}Z`;
    const id = `gwe${c.id}${s > 0 ? 'r' : 'l'}`;
    const iy = cy + (isRound ? 0.4 : 0.2);
    const look = L.eyeShape === 'wide' ? 0 : c.mouth === 'hmm' ? -s * 0 + 1.2 : 0;
    const ix = cx + look;
    // the upper lid line: thick, so the eye reads at 48 px
    const lidD = isRound
      ? `M${n(l - 0.3)} ${n(cy + 0.3)} C${n(l)} ${n(cy - h * 0.7)} ${n(rr)} ${n(cy - h * 0.7)} ${n(rr + 0.3)} ${n(cy + 0.3)}`
      : `M${n(inner)} ${n(cy + 0.4)} C${n(inner + (outer - inner) * 0.2)} ${n(cy - h * 0.85)} ${n(outer - (outer - inner) * 0.18)} ${n(cy - h * 0.8)} ${n(outer)} ${n(cy + tilt)}`;
    const lash = c.female && c.age !== 'elder'
      ? `<path d="M${n(outer)} ${n(isRound ? cy - h * 0.1 : cy + tilt)} l${s * 2.4} ${-1.8} M${n(outer - s * 1.6)} ${n(cy - h * (isRound ? 0.42 : 0.5))} l${s * 1.8} ${-2}" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" data-flat/>`
      : '';
    out.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>
      <path d="${d}" fill="#FFFFFF" data-noshade data-lw="1"/>
      <g clip-path="url(#${id})">
        <circle cx="${n(ix)}" cy="${n(iy)}" r="${r}" fill="${iris}" data-flat/>
        <circle cx="${n(ix)}" cy="${n(iy)}" r="${r}" fill="none" stroke="${INK}" stroke-width="0.6" opacity="0.5" data-flat/>
        <circle cx="${n(ix)}" cy="${n(iy)}" r="${n(r * (c.eyes === 'blue' ? 0.38 : 0.45))}" fill="${INK}" data-flat/>
        <circle cx="${n(ix + r * 0.38)}" cy="${n(iy - r * 0.4)}" r="${n(r * 0.32)}" fill="#FFFFFF" data-flat/>
        <path d="${d}" fill="none" stroke="${INK}" stroke-width="1.1" opacity="0.22" transform="translate(0 1.1)" data-flat/>
      </g>
      <path d="${lidD}" fill="none" stroke="${INK}" stroke-width="${c.female ? 2 : 1.7}" stroke-linecap="round" data-flat/>${lash}`);
    if (L.eyeShape === 'kind' || c.age === 'elder') {
      // the smiling lower lid
      out.push(`<path d="M${n(cx - w * 0.38)} ${n(cy + h * 0.62 - lower + 0.9)} Q${n(cx)} ${n(cy + h * 0.62 - lower - 0.6)} ${n(cx + w * 0.38)} ${n(cy + h * 0.62 - lower + 0.9)}" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.45" stroke-linecap="round" data-flat/>`);
    }
  }
  return out.join('');
}

function brows(c, f) {
  const col = browCol(c);
  const t = { thick: 2.9, thin: 1.5, arched: 1.9, raised: 2.2, flat: 2.3, bushy: 3.4 }[c.look.brows];
  const out = [];
  for (const s of [-1, 1]) {
    const cx = 50 + s * f.eyeDX;
    let y = f.browY, inY = 0, outY = 0, arch = 3, w = 11.5;
    switch (c.look.brows) {
      case 'raised': y -= 2.5; arch = 3.8; break;
      case 'arched': arch = 4; outY = 1; break;
      case 'flat': arch = 1.2; inY = 0.6; break;
      case 'bushy': w = 12.5; arch = 2.4; break;
      case 'thin': arch = 2.6; break;
    }
    if (c.look.eyeShape === 'kind' || c.age === 'elder') { inY = -0.8; outY = 1.2; }
    else if (c.smile) { inY = -0.9; outY = 0.6; }
    if (c.mouth === 'serious') { inY = 1.4; arch = 1; }
    if (c.mouth === 'surprised') { y -= 1.6; arch += 1; }
    if (c.mouth === 'hmm' && s > 0) { y -= 2.5; arch += 1; }
    const xi = cx - s * w / 2, xo = cx + s * w / 2;
    const yi = y + inY, yo = y + outY;
    const top = Math.min(yi, yo) - arch;
    out.push(`<path d="M${n(xi)} ${n(yi + t * 0.5)} Q${n(cx)} ${n(top)} ${n(xo)} ${n(yo + 0.6)} Q${n(cx)} ${n(top + t)} ${n(xi)} ${n(yi + t)}Z" fill="${col}" ${c.look.brows === 'bushy' ? 'data-lw="1"' : 'data-flat'}/>`);
  }
  return out.join('');
}

function nose(c, f) {
  const y = f.noseY, sh = SKIN_SHADE[c.skin];
  switch (c.look.nose) {
    case 'button':
      return `<path d="M47.6 ${y + 0.6} Q50 ${y + 3} 52.4 ${y + 0.6}" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.75" data-flat/>
        <ellipse cx="50.6" cy="${y - 1.2}" rx="1.3" ry="0.9" fill="#FFFFFF" opacity="0.5" data-flat/>`;
    case 'small':
      return `<path d="M50.6 ${y - 3.2} Q52.6 ${y} 49.4 ${y + 1.1}" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.75" data-flat/>`;
    case 'long':
      return `<path d="M49.4 ${y - 9} Q50 ${y - 3} 52.8 ${y} Q51.4 ${y + 2.2} 48.6 ${y + 1.2}" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.75" data-flat/>`;
    case 'wide':
      return `<path d="M45.6 ${y} Q46 ${y + 2.6} 48.4 ${y + 1.8} Q50 ${y + 3} 51.6 ${y + 1.8} Q54 ${y + 2.6} 54.4 ${y}" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.75" data-flat/>
        <path d="M50 ${y - 6} Q50.6 ${y - 2} 51.4 ${y - 0.5}" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.4" data-flat/>`;
    case 'round':
      return `<ellipse cx="50" cy="${y - 0.4}" rx="4.4" ry="3.6" fill="${sh}" data-noshade data-lw="1.2"/>
        <ellipse cx="48.7" cy="${y - 1.6}" rx="1.4" ry="1" fill="#FFFFFF" opacity="0.5" data-flat/>`;
  }
  return '';
}

function mouth(c, f) {
  const y = f.mouthY, kid = c.age === 'child';
  const lip = LIP[c.skin];
  const beardy = c.beard && c.beardStyle !== 'none';
  switch (c.mouth) {
    case 'grin':
    case 'gap': {
      const w = kid ? 14 : 15;
      const l = 50 - w / 2, r = 50 + w / 2;
      const gap = c.mouth === 'gap' ? `<rect x="50.6" y="${y - 0.4}" width="2.8" height="3.2" fill="#5B1F2A" data-flat/>` : '';
      return `<path d="M${l} ${y - 1} Q50 ${y + 1} ${r} ${y - 1} Q${r - 1} ${y + 9} 50 ${y + 9} Q${l + 1} ${y + 9} ${l} ${y - 1}Z" fill="#5B1F2A" data-noshade data-lw="1.4"/>
        <path d="M${l + 1.5} ${y - 0.2} Q50 ${y + 1.6} ${r - 1.5} ${y - 0.2} L${r - 2} ${y + 2.6} Q50 ${y + 3.8} ${l + 2} ${y + 2.6}Z" fill="#FFFFFF" data-flat/>${gap}
        <path d="M${l + 4} ${y + 7} Q50 ${y + 4.2} ${r - 4} ${y + 7} Q50 ${y + 9.2} ${l + 4} ${y + 7}Z" fill="#E8667A" data-flat/>`;
    }
    case 'laugh': {
      const w = kid ? 15 : 16;
      const l = 50 - w / 2, r = 50 + w / 2;
      return `<path d="M${l} ${y - 1.5} Q50 ${y} ${r} ${y - 1.5} Q${r} ${y + 9.6} 50 ${y + 9.6} Q${l} ${y + 9.6} ${l} ${y - 1.5}Z" fill="#5B1F2A" data-noshade data-lw="1.4"/>
        <path d="M${l + 1.6} ${y - 0.6} Q50 ${y + 1} ${r - 1.6} ${y - 0.6} L${r - 2.4} ${y + 2.2} Q50 ${y + 3.4} ${l + 2.4} ${y + 2.2}Z" fill="#FFFFFF" data-flat/>
        <path d="M${l + 3.8} ${y + 7.6} Q50 ${y + 4} ${r - 3.8} ${y + 7.6} Q50 ${y + 9.8} ${l + 3.8} ${y + 7.6}Z" fill="#E8667A" data-flat/>`;
    }
    case 'gentle':
      // a clear, closed smile with little dimples at the corners
      return `<path d="M43.5 ${y} Q50 ${y + 6} 56.5 ${y}" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round" data-flat/>
        <path d="M42.6 ${y - 1.4} q0.6 1.1 1.8 1.2 M57.4 ${y - 1.4} q-0.6 1.1 -1.8 1.2" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round" data-flat/>`;
    case 'calm': {
      // a neutral, relaxed mouth: closed lips, no upturn
      if (c.female || beardy) return `<path d="M45 ${y + 1.6} Q50 ${y + 0.6} 55 ${y + 1.6} Q50 ${y + 4.6} 45 ${y + 1.6}Z" fill="${lip}" data-lw="1.2"/>`;
      return `<path d="M45.5 ${y + 1.8} Q50 ${y + 1.2} 54.5 ${y + 1.8}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round" data-flat/>
        <path d="M47.8 ${y + 4.2} Q50 ${y + 4.9} 52.2 ${y + 4.2}" fill="none" stroke="${INK}" stroke-width="1" opacity="0.35" stroke-linecap="round" data-flat/>`;
    }
    case 'surprised':
      return `<ellipse cx="50" cy="${y + 2.6}" rx="3.2" ry="3.9" fill="#5B1F2A" data-noshade data-lw="1.4"/>
        <ellipse cx="50" cy="${y + 4.6}" rx="1.9" ry="1.1" fill="#E8667A" data-flat/>`;
    case 'serious':
      if (beardy || c.female) return `<path d="M44.5 ${y + 2.4} Q50 ${y + 1.2} 55.5 ${y + 2.4} Q50 ${y + 4.4} 44.5 ${y + 2.4}Z" fill="${lip}" data-lw="1.2"/>`;
      return `<path d="M44.5 ${y + 2.8} Q50 ${y + 1.2} 55.5 ${y + 2.8}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round" data-flat/>`;
    case 'hmm':
      // thinking: the mouth pushed to one side
      return `<path d="M45 ${y + 2.6} Q48 ${y + 1.2} 51 ${y + 2.4} T56.5 ${y + 0.6}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round" data-flat/>`;
  }
  return '';
}

function beard(c, f) {
  if (!c.beard) return '';
  const col = facialHairCol(c);
  const { w, jw, jy, chin, mouthY, cy } = f;
  if (c.beardStyle === 'long') {
    // a long white beard flowing onto the chest
    return `<path d="M${n(50 - w + 0.5)} ${n(cy + 3)} C${n(50 - w)} ${n(jy + 8)} ${n(50 - jw)} ${n(chin + 8)} ${n(50 - 7)} ${n(chin + 18)} C${n(50 - 4)} ${n(chin + 21)} ${n(50 - 1)} ${n(chin + 19)} 50 ${n(chin + 22)} C${n(51)} ${n(chin + 19)} ${n(54)} ${n(chin + 21)} ${n(57)} ${n(chin + 18)} C${n(50 + jw)} ${n(chin + 8)} ${n(50 + w)} ${n(jy + 8)} ${n(50 + w - 0.5)} ${n(cy + 3)}
      C${n(50 + w - 4)} ${n(mouthY - 4)} ${n(58)} ${n(mouthY - 3)} 50 ${n(mouthY - 3)} C${n(42)} ${n(mouthY - 3)} ${n(50 - w + 4)} ${n(mouthY - 4)} ${n(50 - w + 0.5)} ${n(cy + 3)}Z" fill="${col}" data-shade="0.8"/>
      <path d="M44 ${n(chin + 4)} q1 6 -1 11 M50 ${n(chin + 6)} v10 M56 ${n(chin + 4)} q-1 6 1 11" stroke="#CFC8BA" stroke-width="1.2" fill="none" stroke-linecap="round" data-flat/>`;
  }
  if (c.beardStyle === 'full') {
    return `<path d="M${n(50 - w + 0.3)} ${n(cy + 1)} C${n(50 - w)} ${n(jy + 4)} ${n(50 - jw + 1)} ${n(chin + 5)} 50 ${n(chin + 6)} C${n(50 + jw - 1)} ${n(chin + 5)} ${n(50 + w)} ${n(jy + 4)} ${n(50 + w - 0.3)} ${n(cy + 1)}
      C${n(50 + w - 3)} ${n(mouthY - 5)} ${n(57)} ${n(mouthY - 3.5)} 50 ${n(mouthY - 3.5)} C${n(43)} ${n(mouthY - 3.5)} ${n(50 - w + 3)} ${n(mouthY - 5)} ${n(50 - w + 0.3)} ${n(cy + 1)}Z" fill="${col}" data-shade="0.75"/>`;
  }
  // short: a trimmed beard along the jaw, thicker at the chin
  return `<path d="M${n(50 - w + 0.3)} ${n(cy + 2)} C${n(50 - w + 0.5)} ${n(jy + 3)} ${n(50 - jw)} ${n(chin + 3)} 50 ${n(chin + 3.5)} C${n(50 + jw)} ${n(chin + 3)} ${n(50 + w - 0.5)} ${n(jy + 3)} ${n(50 + w - 0.3)} ${n(cy + 2)}
    C${n(50 + w - 2.5)} ${n(jy - 3)} ${n(50 + jw - 3)} ${n(mouthY + 4)} ${n(56)} ${n(mouthY + 6)} C${n(53)} ${n(mouthY + 7.5)} ${n(47)} ${n(mouthY + 7.5)} ${n(44)} ${n(mouthY + 6)} C${n(50 - jw + 3)} ${n(mouthY + 4)} ${n(50 - w + 2.5)} ${n(jy - 3)} ${n(50 - w + 0.3)} ${n(cy + 2)}Z" fill="${col}" data-shade="0.75"/>`;
}

function moustache(c, f) {
  if (!c.moustache) return '';
  const col = facialHairCol(c);
  const y = f.mouthY - 1.6;
  if (c.id === 'driss') {
    // a big bushy white moustache
    return `<path d="M38 ${y + 3.5} C40 ${y - 3.5} 46 ${y - 4} 50 ${y - 1.6} C54 ${y - 4} 60 ${y - 3.5} 62 ${y + 3.5} C59 ${y + 4.5} 56 ${y + 1.6} 50 ${y + 2} C44 ${y + 1.6} 41 ${y + 4.5} 38 ${y + 3.5}Z" fill="${col}" data-lw="1.5"/>`;
  }
  if (c.id === 'said') {
    // a neat, thin moustache
    return `<path d="M43 ${y + 1.6} C45 ${y - 1.2} 48 ${y - 1.2} 50 ${y} C52 ${y - 1.2} 55 ${y - 1.2} 57 ${y + 1.6} C54 ${y + 0.8} 52 ${y + 1.2} 50 ${y + 1.1} C48 ${y + 1.2} 46 ${y + 0.8} 43 ${y + 1.6}Z" fill="${col}" data-lw="1.2"/>`;
  }
  return `<path d="M40.5 ${y + 2.6} C42.5 ${y - 2.6} 47 ${y - 3} 50 ${y - 1} C53 ${y - 3} 57.5 ${y - 2.6} 59.5 ${y + 2.6} C56 ${y + 1.6} 53 ${y + 2} 50 ${y + 1.2} C47 ${y + 2} 44 ${y + 1.6} 40.5 ${y + 2.6}Z" fill="${col}" data-lw="1.4"/>`;
}

function glasses(c, f) {
  const st = c.glassesStyle;
  if (st === 'none') return '';
  const y = f.eyeY + 0.3, dx = f.eyeDX;
  const frameCol = c.look.accent && (c.id === 'maryam' || c.id === 'sara') ? c.look.accent : INK;
  const lens = (cx) => {
    if (st === 'round') return `<circle cx="${n(cx)}" cy="${n(y)}" r="${c.age === 'child' ? 7.4 : 7}"/>`;
    if (st === 'square') return `<rect x="${n(cx - 7.4)}" y="${n(y - 5.6)}" width="14.8" height="11.4" rx="2.6"/>`;
    if (st === 'half') return `<path d="M${n(cx - 7)} ${n(y + 1.6)} H${n(cx + 7)} C${n(cx + 7)} ${n(y + 9.5)} ${n(cx - 7)} ${n(y + 9.5)} ${n(cx - 7)} ${n(y + 1.6)}Z"/>`;
    // cat-eye: the outer corners swept up
    const s = cx > 50 ? 1 : -1;
    return `<path d="M${n(cx - s * 6.6)} ${n(y - 3.6)} Q${n(cx)} ${n(y - 5.4)} ${n(cx + s * 8.4)} ${n(y - 6.4)} Q${n(cx + s * 7.6)} ${n(y + 6.4)} ${n(cx)} ${n(y + 5.4)} Q${n(cx - s * 7)} ${n(y + 5)} ${n(cx - s * 6.6)} ${n(y - 3.6)}Z"/>`;
  };
  const by = st === 'half' ? y + 2.4 : y - 1.2;
  const inner = st === 'square' ? 7.4 : st === 'cat' ? 6.6 : 7;
  const bridge = `<path d="M${n(50 - dx + inner)} ${n(by)} Q50 ${n(by - 2.4)} ${n(50 + dx - inner)} ${n(by)}"/>`;
  const arms = `<path d="M${n(50 - dx - inner - (st === 'cat' ? 1.8 : 0))} ${n(by - 0.6)} L${n(50 - f.w - 0.6)} ${n(by - 1.6)} M${n(50 + dx + inner + (st === 'cat' ? 1.8 : 0))} ${n(by - 0.6)} L${n(50 + f.w + 0.6)} ${n(by - 1.6)}"/>`;
  const shapes = `${lens(50 - dx)}${lens(50 + dx)}${bridge}${arms}`;
  const thick = frameCol === INK ? 2.8 : 3.8;
  return `<g fill="#FFFFFF" opacity="0.2" data-flat>${lens(50 - dx)}${lens(50 + dx)}</g>
    <g fill="none" stroke="${INK}" stroke-width="${thick}" stroke-linejoin="round" data-flat>${shapes}</g>
    ${frameCol === INK ? '' : `<g fill="none" stroke="${frameCol}" stroke-width="1.9" stroke-linejoin="round" data-flat>${shapes}</g>`}
    <g stroke="#FFFFFF" stroke-width="1.1" opacity="0.75" stroke-linecap="round" data-flat><path d="M${n(50 - dx - 4.4)} ${n(y - 1.5)} l2 -2.2"/><path d="M${n(50 + dx - 4.4)} ${n(y - 1.5)} l2 -2.2"/></g>`;
}

function earrings(c, f) {
  if (!c.earrings) return '';
  const y = f.earY + 5;
  const long = ['long', 'wavy', 'braids'].includes(c.style);
  return [-1, 1]
    .map((s) => {
      const x = 50 + s * (f.w + (long ? 0.4 : 0.8));
      if (c.id === 'layla') return `<circle cx="${n(x)}" cy="${y + 4.4}" r="4.4" fill="none" stroke="${INK}" stroke-width="3.2" data-flat/><circle cx="${n(x)}" cy="${y + 4.4}" r="4.4" fill="none" stroke="${GOLD}" stroke-width="1.8" data-flat/>`;
      if (c.age === 'elder') return `<circle cx="${n(x)}" cy="${y + 1.6}" r="2.6" fill="#FFFFFF" data-lw="1.2"/><circle cx="${n(x)}" cy="${y + 5.6}" r="2.2" fill="#FFFFFF" data-lw="1.2"/>`;
      return `<path d="M${n(x)} ${y - 1} V${y + 1}" stroke="${INK}" stroke-width="1" data-flat/><circle cx="${n(x)}" cy="${y + 3.2}" r="3" fill="${GOLD}" data-lw="1.3"/>`;
    })
    .join('');
}

function cheeks(c, f) {
  const out = [];
  const L = c.look;
  const y = f.noseY + 3;
  if (c.age === 'child' || c.female || (c.smile && c.age === 'elder')) {
    const op = c.skin >= 3 ? 0.32 : 0.42;
    out.push(`<ellipse cx="${n(50 - f.w * 0.62)}" cy="${y}" rx="4" ry="2.4" fill="#FF6F86" opacity="${op}" data-flat/><ellipse cx="${n(50 + f.w * 0.62)}" cy="${y}" rx="4" ry="2.4" fill="#FF6F86" opacity="${op}" data-flat/>`);
  }
  if (L.extras.includes('freckles')) {
    const pts = [[-1, 0], [-0.4, -1.4], [0.3, 0.8]];
    out.push(`<g fill="#B5703F" opacity="0.8" data-flat>${[-1, 1].map((s) => pts.map(([dx, dy]) => `<circle cx="${n(50 + s * (f.w * 0.55 + dx * 2))}" cy="${n(y - 1.6 + dy * 1.6)}" r="0.75"/>`).join('')).join('')}</g>`);
  }
  if (L.extras.includes('dimples')) out.push(`<path d="M${42} ${f.mouthY + 4} q0.5 1.4 -0.4 2.2 M${58} ${f.mouthY + 4} q-0.5 1.4 0.4 2.2" stroke="${INK}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round" data-flat/>`);
  if (L.extras.includes('mole')) out.push(`<circle cx="${57.5}" cy="${f.mouthY - 2.6}" r="0.9" fill="#4A2A22" data-flat/>`);
  if (L.extras.includes('bandaid')) {
    out.push(`<g transform="rotate(-28 ${n(50 + f.w * 0.6)} ${y - 1})"><rect x="${n(50 + f.w * 0.6 - 5)}" y="${y - 3}" width="10" height="4.2" rx="2" fill="#F6D2A6" data-lw="1.1"/><rect x="${n(50 + f.w * 0.6 - 1.6)}" y="${y - 3}" width="3.2" height="4.2" fill="#E8B57E" data-flat/></g>`);
  }
  return out.join('');
}

function wrinkles(c, f) {
  if (c.age !== 'elder') return '';
  const { eyeY, eyeDX, noseY, mouthY } = f;
  const forehead = !c.hijab && c.hat !== 'turban' && c.hat !== 'fez'
    ? `<path d="M42 ${f.browY - 7} Q50 ${f.browY - 9} 58 ${f.browY - 7} M44 ${f.browY - 11} Q50 ${f.browY - 12.5} 56 ${f.browY - 11}" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.4" stroke-linecap="round" data-flat/>`
    : '';
  return `<g stroke="${INK}" fill="none" stroke-linecap="round" data-flat>
    <path d="M${n(50 - eyeDX - 6.6)} ${eyeY - 1} l-2.6 -1.4 M${n(50 - eyeDX - 6.6)} ${eyeY + 1.6} l-2.6 1.2 M${n(50 + eyeDX + 6.6)} ${eyeY - 1} l2.6 -1.4 M${n(50 + eyeDX + 6.6)} ${eyeY + 1.6} l2.6 1.2" stroke-width="1.1" opacity="0.65"/>
    ${c.beard ? '' : `<path d="M${n(50 - 7)} ${noseY + 1} q-3.4 4.4 -1.2 9.8 M${n(50 + 7)} ${noseY + 1} q3.4 4.4 1.2 9.8" stroke-width="1.5" opacity="0.7"/>`}
    <path d="M${n(50 - eyeDX - 3.4)} ${eyeY + 5.6} q3.4 2 7 0.4 M${n(50 + eyeDX + 3.4)} ${eyeY + 5.6} q-3.4 2 -7 0.4" stroke-width="1" opacity="0.55"/>
    ${c.beard ? '' : `<path d="M${46} ${mouthY + 9} q4 1.4 8 0" stroke-width="0.8" opacity="0.35"/>`}
  </g>${forehead}`;
}

function hairAccessory(c, f) {
  const ex = c.look.extras;
  const a = c.look.accent ?? '#E8577A';
  if (ex.includes('headband')) {
    const y = f.top + 4;
    return `<path d="M${n(50 - f.w - 2)} ${f.top + 15} C${n(50 - f.w - 1)} ${y - 6} ${n(50 + f.w + 1)} ${y - 6} ${n(50 + f.w + 2)} ${f.top + 15}" fill="none" stroke="${INK}" stroke-width="5.2" stroke-linecap="round" data-flat/>
      <path d="M${n(50 - f.w - 2)} ${f.top + 15} C${n(50 - f.w - 1)} ${y - 6} ${n(50 + f.w + 1)} ${y - 6} ${n(50 + f.w + 2)} ${f.top + 15}" fill="none" stroke="${a}" stroke-width="3" stroke-linecap="round" data-flat/>`;
  }
  if (ex.includes('bow') && c.style === 'curly') {
    // a big bow on top of the curls
    const x = 50 + f.w * 0.55, y = f.top - 1;
    return `<g transform="rotate(18 ${n(x)} ${y})"><path d="M${n(x)} ${y} L${n(x - 8)} ${y - 5} Q${n(x - 10)} ${y} ${n(x - 8)} ${y + 5}Z M${n(x)} ${y} L${n(x + 8)} ${y - 5} Q${n(x + 10)} ${y} ${n(x + 8)} ${y + 5}Z" fill="${a}" data-lw="1.4"/><circle cx="${n(x)}" cy="${y}" r="2.4" fill="${a}" data-lw="1.3"/></g>`;
  }
  return '';
}

/* ------------------------------- portrait ------------------------------- */

export function portrait(id) {
  const c = GW_CHARS.find((x) => x.id === id);
  if (!c) throw new Error(`no character ${id}`);
  const f = frame(c);
  const skin = SKIN[c.skin], skin2 = SKIN_SHADE[c.skin];
  const kid = c.age === 'child';
  const nw = kid ? 6.5 : 7.5;
  const neck = `<path d="M${50 - nw} ${f.chin - 8} H${50 + nw} V${f.nb + 1} Q50 ${f.nb + 5} ${50 - nw} ${f.nb + 1}Z" fill="${skin2}" data-noshade/>`;
  const ear = (s) => `<ellipse cx="${n(50 + s * (f.w - 0.3))}" cy="${f.earY}" rx="4.2" ry="5.6" fill="${skin}"/>
    <path d="M${n(50 + s * (f.w + 1.6))} ${f.earY - 2.4} q${s * -1.6} 2.4 0 4.8" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.45" data-flat/>`;
  const face = c.hijab ? `<path d="${hijabFacePath(f)}" fill="${skin}"/>` : `<path d="${facePath(f)}" fill="${skin}"/>`;
  const parts = [
    background(c),
    hairBack(c, f),
    outfit(c, f),
    neck,
    c.look.extras.includes('bowtie') ? bowtie(c, f) : '',
    c.hijab ? hijabBack(c, f) : '',
    lowTail(c, f),
    c.hijab ? '' : ear(-1) + ear(1),
    earrings(c, f),
    face,
    beard(c, f),
    hairFront(c, f),
    hairAccessory(c, f),
    c.hijab ? hijabFront(c, f) : '',
    wrinkles(c, f),
    cheeks(c, f),
    brows(c, f),
    eyes(c, f),
    nose(c, f),
    mouth(c, f),
    moustache(c, f),
    glasses(c, f),
    hat(c, f),
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
