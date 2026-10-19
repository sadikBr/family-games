// Emblem for «الأسرع» (100×100, mascot pass): a stopwatch with a lightning bolt on its face and speed
// lines — quick reaction games.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function fast() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#5A1F66', '#C653D6', ['#F2C23D', '#FFE89A'])}
    <path d="M14 46 H26 M12 54 H24 M16 62 H27" stroke="#FFF4DA" stroke-width="3" stroke-linecap="round" data-flat/>
    <rect x="47" y="15" width="10" height="7" rx="2" fill="#F2C23D"/>
    <rect x="45" y="12" width="14" height="5" rx="2.5" fill="#E2475F"/>
    <path d="M70 26 L75 21" stroke="${INK}" stroke-width="5" stroke-linecap="round" data-flat/>
    <path d="M70 26 L75 21" stroke="#F2C23D" stroke-width="2.6" stroke-linecap="round" data-flat/>
    <circle cx="52" cy="53" r="27" fill="#FFF4DA" data-shade="0.86"/>
    <circle cx="52" cy="53" r="21.5" fill="#FFFFFF" data-noline data-noshade/>
    <path d="M71 53 H67 M33 53 H37 M65.4 39.6 L62.6 42.4 M38.6 66.4 L41.4 63.6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" data-flat/>
    <path d="M55.5 36 L42.5 56 H51 L47.5 70 L62 48.5 H53.5Z" fill="#F2C23D"/>`);
}
