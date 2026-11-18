// Emblem for «خلية الحروف» (100×100, mascot pass): a honeycomb of seven hexagons, the centre one in honey with
// the letter «ن» drawn on it, the six around in cream, and a small smiling bee flying over the hive.
import { INK, smile, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const HONEY = '#F2B33D';
const HONEY_DARK = '#C98A12';

/** A flat-topped hexagon of side r centred on (cx, cy). */
function hex(cx, cy, r, fill, extra = '') {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `<path d="M${pts.join(' L')}Z" fill="${fill}" ${extra}/>`;
}

export function khalia() {
  const r = 10.2;
  const d = Math.sqrt(3) * r + 1.6;
  const cx = 47, cy = 57;
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    cells.push(hex(cx + d * Math.cos(a), cy + d * Math.sin(a), r, CREAM, 'data-shade="0.9"'));
  }
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#4A3F9E', ['#F2B33D', '#FFE08A'])}
    ${cells.join('')}
    ${hex(cx, cy, r, HONEY, 'data-shade="0.85"')}
    <path d="M${cx - 5.2} ${cy - 1.2} Q${cx - 5.2} ${cy + 5.2} ${cx} ${cy + 5.2} Q${cx + 5.2} ${cy + 5.2} ${cx + 5.2} ${cy - 1.2}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="${cx}" cy="${cy - 4.6}" r="1.7" fill="${INK}" data-flat/>
    <path d="M${cx + d * 0.87 - 3} ${cy - d / 2 - 2} h6 M${cx - d * 0.87 - 3} ${cy + d / 2 + 2} h6" stroke="${HONEY_DARK}" stroke-width="1.4" stroke-linecap="round" opacity="0.55" data-flat/>
    <g transform="rotate(-14 74 24)">
      <ellipse cx="70" cy="15" rx="5.5" ry="7.5" fill="#FFFFFF" opacity="0.85" transform="rotate(-25 70 15)" data-lw="0.9"/>
      <ellipse cx="78" cy="15" rx="5" ry="7" fill="#FFFFFF" opacity="0.85" transform="rotate(25 78 15)" data-lw="0.9"/>
      <ellipse cx="74" cy="25" rx="10" ry="7.5" fill="${HONEY}"/>
      <path d="M71 18.2 Q69.5 25 71 31.8 M76.5 18.4 Q75 25 76.5 31.6" stroke="${INK}" stroke-width="2.6" fill="none" data-flat/>
      <path d="M84 25 l3.4 -1 -3.2 2.6Z" fill="${INK}" data-flat/>
      <circle cx="66.6" cy="23.6" r="1.6" fill="${INK}" data-flat/>
      <g transform="translate(-0.4 0)">${smile(67.2, 27.4, 3.6)}</g>
      <path d="M65 18.8 Q63 14 60.5 13.5 M67.4 18 Q66.6 13 64.4 11.8" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round" data-flat/>
    </g>
    <path d="M24 26 q4 -3 8 0 t8 0" stroke="${CREAM}" stroke-width="1.2" fill="none" stroke-dasharray="1.5 2.4" opacity="0.7" data-flat/>`);
}
