// Emblem for «أكمل المثل» (100×100, mascot pass): an unrolled parchment scroll across the violet disc, a line
// of ink writing on it that stops at three saffron dots (the ending to find), and a quill ready to finish it.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const PAPER = '#FFF1D2';
const PAPER_DARK = '#E9CF9A';
const SAFFRON = '#F2B33D';

export function mathal() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#8E5BD0', ['#F2B33D', '#FFE29A'])}
    <g transform="rotate(-6 50 48)">
      <rect x="20" y="31" width="60" height="32" rx="3" fill="${PAPER}" data-shade="0.9"/>
      <rect x="14" y="28" width="9" height="38" rx="4.5" fill="${PAPER_DARK}"/>
      <rect x="77" y="28" width="9" height="38" rx="4.5" fill="${PAPER_DARK}"/>
      <ellipse cx="18.5" cy="28.6" rx="4.5" ry="1.8" fill="#C9A86A" data-noline data-flat/>
      <ellipse cx="81.5" cy="28.6" rx="4.5" ry="1.8" fill="#C9A86A" data-noline data-flat/>
      <path d="M71 40 Q67 37 63 40 T55 40 Q51 43 47 40 M44 40 Q40 37 36 40 T29 40" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
      <path d="M71 52 Q67 49 63 52 T56 52" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
      <circle cx="48" cy="52.5" r="2.4" fill="${SAFFRON}" data-flat/>
      <circle cx="40.5" cy="52.5" r="2.4" fill="${SAFFRON}" data-flat/>
      <circle cx="33" cy="52.5" r="2.4" fill="${SAFFRON}" data-flat/>
    </g>
    <path d="M73 85 Q60 72 64 58 Q76 63 79 78 Z" fill="#FFFFFF" data-shade="0.86"/>
    <path d="M73 85 Q68 72 69 62" stroke="#C9C2E8" stroke-width="1.2" fill="none" data-flat/>
    <path d="M71.5 84 L75.5 90" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" data-flat/>
    <circle cx="26" cy="77" r="1.6" fill="${PAPER}" data-flat/>
    <circle cx="33" cy="82" r="1.1" fill="${PAPER}" data-flat/>`);
}
