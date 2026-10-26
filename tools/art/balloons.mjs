// Emblem for «البالونات» (100×100, mascot pass): three balloons (one with the letter «ب» drawn on it) lifting a
// little wicker basket, with two letter boxes beside it (a found «ا», a hidden one) — guess the word before the balloons pop.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function balloons() {
  const balloon = (cx, cy, rx, ry, c, rot = 0) => `
    <g transform="rotate(${rot} ${cx} ${cy + ry})">
      <path d="M${cx} ${cy + ry} Q${cx + 2} ${cy + ry + 10} ${50} 66" stroke="#FFF4DA" stroke-width="1.4" fill="none" data-flat/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/>
      <path d="M${cx - 2.6} ${cy + ry + 3.4} L${cx} ${cy + ry - 0.4} L${cx + 2.6} ${cy + ry + 3.4}Z" fill="${c}" data-lw="0.9"/>
      <ellipse cx="${cx - rx * 0.38}" cy="${cy - ry * 0.4}" rx="${rx * 0.2}" ry="${ry * 0.3}" fill="#FFFFFF" opacity="0.45" data-noline data-noshade/>
    </g>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#6A1F48', '#E86FA6', ['#F2C23D', '#FFE89A'])}
    ${balloon(33, 36, 10.5, 12.5, '#22B8B0', -8)}
    ${balloon(67, 36, 10.5, 12.5, '#F2B33D', 8)}
    ${balloon(50, 29, 13, 15.5, '#E2475F')}
    <path d="M40 27 Q40.5 34 50 34 Q59.5 34 60 27" stroke="#FFF4DA" stroke-width="3.6" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="50" cy="39.5" r="2.2" fill="#FFF4DA" data-flat/>
    <path d="M42 70 L50 66 L58 70" stroke="#FFF4DA" stroke-width="1.3" fill="none" data-flat/>
    <path d="M38 70 H62 L59 83 Q50 85 41 83Z" fill="#C98A45" data-shade="0.85"/>
    <rect x="36.5" y="68" width="27" height="4.5" rx="2.2" fill="#A86B30"/>
    <path d="M40 76 H60 M41 80 H59" stroke="#8F5A26" stroke-width="1.1" data-flat/>
    <rect x="68" y="66" width="13" height="16" rx="3" fill="#FFF4DA" data-shade="0.9"/>
    <path d="M71.5 77.5 H77.5" stroke="${INK}" stroke-width="2" stroke-linecap="round" data-flat/>
    <rect x="19" y="66" width="13" height="16" rx="3" fill="#FFF4DA" data-shade="0.9"/>
    <path d="M25.5 70 V78" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" data-flat/>`);
}
