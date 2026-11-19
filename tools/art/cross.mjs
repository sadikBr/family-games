// Emblem for «الكلمات المتقاطعة» (100×100, mascot pass): a small tilted crossword — cream cells, a few navy
// black cells, the across word being written lit in saffron with its letters («نار» from the right), a
// blue down word crossing it, and a pencil resting on the corner.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const NAVY = '#1C1A3E';
const SAFFRON = '#F6B53D';
const BLUE = '#BFD3FF';
const INK = '#24203F';

const N = 4;
const CELL = 12.6;
const GAP = 1.6;
const X0 = 50 - (N * CELL + (N - 1) * GAP) / 2;
const Y0 = 47 - (N * CELL + (N - 1) * GAP) / 2;

/** col 0 = the right edge (the grid reads right to left). */
const at = (r, c) => ({ x: X0 + (N - 1 - c) * (CELL + GAP), y: Y0 + r * (CELL + GAP) });
const BLACK = new Set(['1,3', '2,0', '3,3']);
/** the across word on row 1, the down word in col 1 */
const across = (r, c) => r === 1 && c <= 2;
const down = (r, c) => c === 1 && r >= 1;

const ink = (d, w = 2.3) => `<path d="${d}" stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>`;
/** «ن»: a round bowl with its dot above. */
const nun = (cx, cy) => `${ink(`M${cx + 3.6} ${cy - 0.6} Q${cx + 3.8} ${cy + 4.2} ${cx} ${cy + 4.2} Q${cx - 3.8} ${cy + 4.2} ${cx - 3.6} ${cy - 0.6}`, 2.6)}<circle cx="${cx}" cy="${cy - 3.6}" r="1.35" fill="${INK}" data-flat/>`;
/** «ا»: one tall stroke. */
const alif = (cx, cy) => ink(`M${cx} ${cy - 4.6} V${cy + 4}`, 2.6);
/** «ر»: a short stroke curving down to the left. */
const ra = (cx, cy) => ink(`M${cx + 1.6} ${cy - 2.4} Q${cx + 2.4} ${cy + 3.4} ${cx - 3.4} ${cy + 5}`, 2.6);

function cells() {
  let out = '';
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const { x, y } = at(r, c);
      const black = BLACK.has(`${r},${c}`);
      const fill = black ? NAVY : across(r, c) ? SAFFRON : down(r, c) ? BLUE : CREAM;
      out += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.4" fill="${fill}" data-shade="0.88"/>`;
    }
  // «نار» from the right
  const word = [nun, alif, ra];
  word.forEach((f, c) => {
    const { x, y } = at(1, c);
    out += f(x + CELL / 2, y + CELL / 2 + 0.4);
  });
  return out;
}

function pencil() {
  // lying from the bottom left up to the grid's corner
  return `
    <g transform="rotate(-38 30 74)">
      <rect x="14" y="70.5" width="30" height="7" rx="1.4" fill="${SAFFRON}" data-shade="0.85"/>
      <rect x="14" y="70.5" width="5.5" height="7" rx="1.2" fill="#E86FA6"/>
      <rect x="19.5" y="70.5" width="2.2" height="7" fill="#C9CBD9" data-flat/>
      <path d="M44 70.5 L51 74 L44 77.5Z" fill="#F1D3A6"/>
      <path d="M48.6 72.8 L51 74 L48.6 75.2Z" fill="${INK}" data-flat/>
    </g>`;
}

export function cross() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#4A7BD9')}
    <g transform="rotate(-7 50 47)">
      <rect x="${X0 - 2.6}" y="${Y0 - 2.6}" width="${N * CELL + (N - 1) * GAP + 5.2}" height="${N * CELL + (N - 1) * GAP + 5.2}" rx="4.5" fill="${NAVY}" data-shade="0.9"/>
      ${cells()}
    </g>
    ${pencil()}
    <circle cx="76" cy="22" r="1.5" fill="${CREAM}" data-flat/>
    <path d="M80 70 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4Z" fill="${CREAM}" data-flat/>`);
}
