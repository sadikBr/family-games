// Emblem for «أين تقع؟» (100×100, mascot pass): a folded paper map with a sea and a river, a big red map pin
// standing on it, and a dashed line from the pin to the green target — how far was your pin from the place?
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const CREAM = '#FFF4DA';

export function ayna() {
  // the pin: tip at (40, 69), head centred at (40, 37)
  const r = 14;
  const pin = `M40 69 L${40 - r * 0.82} ${37 + r * 0.57} A${r} ${r} 0 1 1 ${40 + r * 0.82} ${37 + r * 0.57}Z`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#14463E', '#2FA58A', ['#F2B33D', '#FFE08A'])}
    <path d="M17 57 L38 51 L62 57 L83 51 L83 80 L62 86 L38 80 L17 86Z" fill="#F1E2B4" data-shade="0.9"/>
    <path d="M38 51 L62 57 L62 86 L38 80Z" fill="#E2CC90" data-noline data-shade="0.9"/>
    <path d="M62 57 L83 51 L83 66 Q74 70 62 68Z" fill="#5AA9D6" data-noline data-flat/>
    <path d="M17 70 Q26 66 30 74 Q34 82 46 79" stroke="#5AA9D6" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M24 60 Q30 58 32 63 Q28 67 23 65Z" fill="#8CC37A" data-flat/>
    <path d="M38 51 V80 M62 57 V86" stroke="#B89B5C" stroke-width="0.9" data-flat/>
    <path d="M42 69 Q55 77 67 73" stroke="${CREAM}" stroke-width="2.2" stroke-dasharray="3.2 2.6" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="70" cy="72" r="6" fill="#2FB67C" data-lw="1.1"/>
    <circle cx="70" cy="72" r="2.4" fill="${CREAM}" data-flat/>
    <ellipse cx="40" cy="70" rx="5" ry="1.8" fill="#151726" opacity="0.3" data-flat/>
    <path d="${pin}" fill="#E2475F" data-shade="0.82"/>
    <circle cx="40" cy="37" r="5.6" fill="${CREAM}" data-flat/>
    <ellipse cx="34.5" cy="30" rx="2.4" ry="3.6" fill="#FFFFFF" opacity="0.4" transform="rotate(-25 34.5 30)" data-noline data-noshade/>
    <circle cx="70" cy="24" r="1.6" fill="${CREAM}" data-flat/>
    <circle cx="78" cy="34" r="1.1" fill="${CREAM}" data-flat/>`);
}
