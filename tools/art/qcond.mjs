// Emblem for «سؤال وشرط» (100×100, mascot pass): the game's two cards fanned out — a blue question card
// with «؟» and a saffron condition card with «ج» (a word that starts with jeem) — and a small pencil.
import { INK, svg100 } from './mkit.mjs';
import { HEX, HEX_IN, base } from './games2.mjs';

export function qcond() {
  return svg100(`
    ${base(HEX, HEX_IN, '#123E66', '#2E86C1', ['#F2C23D', '#FFE89A'])}
    <g transform="translate(37 52) rotate(-12)">
      <rect x="-15" y="-21" width="30" height="42" rx="5" fill="#3D9BE0" data-shade="0.9"/>
      <rect x="-11" y="-17" width="22" height="34" rx="3" fill="none" stroke="#DDF1FF" stroke-width="1.4" data-flat/>
      <text x="0" y="13" font-size="36" font-family="Lalezar" fill="#FFF4DA" text-anchor="middle" data-flat>؟</text>
    </g>
    <g transform="translate(62 50) rotate(10)">
      <rect x="-15" y="-21" width="30" height="42" rx="5" fill="#F2C23D" data-shade="0.9"/>
      <rect x="-11" y="-17" width="22" height="34" rx="3" fill="none" stroke="#FFF4DA" stroke-width="1.4" data-flat/>
      <text x="0" y="8" font-size="30" font-family="Lalezar" fill="${INK}" text-anchor="middle" data-flat>ج</text>
    </g>
    <g transform="translate(79 77) rotate(-35) scale(0.85)">
      <rect x="-3" y="-14" width="6" height="22" rx="1.5" fill="#E2475F"/>
      <path d="M-3 8 L0 14 L3 8Z" fill="#FFE0B0" data-lw="0.8"/>
      <path d="M-1 12 L0 14 L1 12Z" fill="${INK}" data-noshade/>
    </g>`);
}
