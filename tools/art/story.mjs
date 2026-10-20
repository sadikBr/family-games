// Emblem for «قصة جماعية» (100×100, mascot pass): an open storybook whose lines are written in four
// colours (one sentence each, by a different hand; right-aligned, as Arabic is written), a quill
// resting on the right page, and sound waves rising from it (the story read aloud at the end).
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function story() {
  const line = (x1, x2, y, c) => `<path d="M${x1} ${y} H${x2}" stroke="${c}" stroke-width="2.6" stroke-linecap="round" data-flat/>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#4E1C30', '#A04D6A', ['#F2C23D', '#FFE89A'])}
    <path d="M17 41 Q33 35 50 41 V77 Q33 71 17 77Z" fill="#7A3A22" data-noshade/>
    <path d="M83 41 Q67 35 50 41 V77 Q67 71 83 77Z" fill="#7A3A22" data-noshade/>
    <path d="M20 38 Q35 32 50 39 V73 Q35 67 20 72Z" fill="#FFF4DA" data-shade="0.88"/>
    <path d="M80 38 Q65 32 50 39 V73 Q65 67 80 72Z" fill="#FFF4DA" data-shade="0.88"/>
    <path d="M50 39 V73" stroke="${INK}" stroke-width="1.6" data-flat/>
    ${line(25, 45, 45.5, '#E2475F')}${line(28, 45, 51.5, '#3D7BE0')}${line(25, 45, 57.5, '#2FB67C')}${line(32, 45, 63.5, '#F08A3E')}
    ${line(55, 75, 45.5, '#7B61D9')}${line(60, 75, 51.5, '#E2475F')}
    <g transform="translate(66 60) rotate(-38)">
      <path d="M0 -20 C7 -14 7 -3 1.5 7 L-1.5 7 C-7 -3 -7 -14 0 -20Z" fill="#F2C23D" data-lw="1"/>
      <path d="M0 -17 V9" stroke="#B5892B" stroke-width="1.2" data-flat/>
      <path d="M-1.4 7 L0 12 L1.4 7Z" fill="${INK}" data-noshade/>
    </g>
    <path d="M42 29 Q50 23 58 29" stroke="#FFF4DA" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M36 23 Q50 13 64 23" stroke="#FFF4DA" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>`);
}
