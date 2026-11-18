// Emblem for «البلد الغامض» (100×100, mascot pass): a globe with its lands, a pin planted in a hidden
// country carrying a little flag with «؟», and a magnifying glass looking closer — clue after clue.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';
const OCEAN = '#3E7BD6';
const LAND = '#2FB67C';
const RED = '#D2554B';
const GOLD = '#F2B33D';

export function balad() {
  const clip = 'baladGlobe';
  return svg100(
    `
    ${base(ROUND, ROUND_IN, '#2B2766', RED, ['#F08A3E', '#FFD08A'])}
    <circle cx="46" cy="52" r="25" fill="${OCEAN}" data-shade="0.82"/>
    <g clip-path="url(#${clip})">
      <path d="M26 40 Q32 30 42 33 Q47 36 44 42 Q40 46 43 51 Q45 57 38 60 Q31 61 28 55 Q22 48 26 40Z" fill="${LAND}" data-lw="0.8"/>
      <path d="M52 30 Q60 28 66 34 Q70 40 64 43 Q58 44 56 40 Q50 37 52 30Z" fill="${LAND}" data-lw="0.8"/>
      <path d="M53 50 Q61 47 66 53 Q70 61 62 68 Q55 73 52 66 Q49 58 53 50Z" fill="${LAND}" data-lw="0.8"/>
      <path d="M22 52 H71 M24 40 Q46 46 69 40 M24 64 Q46 58 69 64" stroke="${CREAM}" stroke-opacity="0.28" stroke-width="0.9" fill="none" data-flat/>
      <path d="M46 27 Q34 52 46 77 M46 27 Q58 52 46 77" stroke="${CREAM}" stroke-opacity="0.28" stroke-width="0.9" fill="none" data-flat/>
    </g>
    <ellipse cx="37" cy="40" rx="6" ry="3.6" fill="#FFFFFF" opacity="0.28" transform="rotate(-30 37 40)" data-noline data-noshade/>
    <path d="M58 57 V33" stroke="${CREAM}" stroke-width="1.8" stroke-linecap="round" data-flat/>
    <path d="M58 33 H74 L70 38.5 L74 44 H58Z" fill="${RED}" data-lw="0.9"/>
    <path d="M68.2 36.2 Q68 34.6 66.3 34.6 Q64.6 34.7 64.7 36.3 Q64.8 37.5 66.3 38.1 V39.3" stroke="${CREAM}" stroke-width="1.5" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="66.3" cy="41.4" r="0.95" fill="${CREAM}" data-flat/>
    <circle cx="58" cy="58" r="2.6" fill="${GOLD}" data-lw="0.8"/>
    <path d="M71 75 L80 84" stroke="#8F5A26" stroke-width="5.4" stroke-linecap="round"/>
    <circle cx="65" cy="69" r="9.5" fill="#BFE7F2" fill-opacity="0.55" stroke="${CREAM}" stroke-width="3.2" data-lw="0.9"/>
    <path d="M60 66 Q62 62.5 66 62.6" stroke="#FFFFFF" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.8" data-flat/>
    <circle cx="24" cy="24" r="1.5" fill="${CREAM}" data-flat/>
    <path d="M78 22 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4Z" fill="${CREAM}" data-flat/>`,
    `<clipPath id="${clip}"><circle cx="46" cy="52" r="25"/></clipPath>`,
  );
}
