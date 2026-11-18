// Emblem for «القاموس العجيب» (100×100, mascot pass): an old dictionary open on a rose cover — a head-word and
// its lines on one page, a big question mark on the other (which meaning is the real one?), a golden quill
// for the fake definitions, and a few sparkles.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const PAPER = '#FBF1DC';
const ROSE = '#C2577A';
const INK = '#2B2766';
const GOLD = '#F6B53D';

const sparkle = (x, y, r) => `<path d="M${x} ${y - r} l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3} -${r * 0.7} ${r * 0.3} -${r * 0.3} ${r * 0.7} -${r * 0.3} -${r * 0.7} -${r * 0.7} -${r * 0.3} ${r * 0.7} -${r * 0.3}Z" fill="${PAPER}" data-flat/>`;

export function qamus() {
  return svg100(`
    ${base(ROUND, ROUND_IN, INK, '#4A3F9E', ['#C2577A', '#F09AB8'])}
    <path d="M50 76 Q33 69 14 72 L14 37 Q33 33 50 39 Q67 33 86 37 L86 72 Q67 69 50 76Z" fill="${ROSE}" data-lw="1.2"/>
    <path d="M50 72 Q34 66 18 68 L18 36 Q34 32 50 38Z" fill="${PAPER}" data-shade="0.92"/>
    <path d="M50 72 Q66 66 82 68 L82 36 Q66 32 50 38Z" fill="${PAPER}" data-shade="0.92"/>
    <path d="M50 38 V72" stroke="${ROSE}" stroke-opacity="0.55" stroke-width="1.2" data-flat/>
    <rect x="57" y="43" width="19" height="5.5" rx="2.6" fill="${ROSE}" data-flat/>
    <rect x="56" y="52" width="21" height="2" rx="1" fill="${INK}" opacity="0.45" data-flat/>
    <rect x="59" y="57" width="18" height="2" rx="1" fill="${INK}" opacity="0.45" data-flat/>
    <rect x="56" y="62" width="21" height="2" rx="1" fill="${INK}" opacity="0.45" data-flat/>
    <path d="M28 47.5 Q28 41.5 34 41.5 Q40 41.5 40 47 Q40 51 34.6 53.2 L34.6 57" fill="none" stroke="${ROSE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <circle cx="34.6" cy="63" r="2.6" fill="${ROSE}" data-flat/>
    <g transform="rotate(38 70 28)">
      <path d="M70 9 Q79 22 71 45 Q61 23 70 9Z" fill="${GOLD}" data-lw="1"/>
      <path d="M70 13 Q71 28 71 49" stroke="#B9791F" stroke-width="1.1" fill="none" stroke-linecap="round" data-flat/>
    </g>
    ${sparkle(24, 24, 4.2)}
    ${sparkle(31, 15, 2.4)}
    ${sparkle(50, 84, 3)}`);
}
