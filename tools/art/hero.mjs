import { INK } from './mkit.mjs';
import { coin, cup, miniCard } from './badges.mjs';

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 8;
    const rr = i % 2 ? r * 0.8 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function hero() {
  const flame = (s) => `<path d="M${100 - 62 * s} 92 L${100 - 96 * s} 66 L${100 - 82 * s} 86 L${100 - 104 * s} 94 L${100 - 80 * s} 104 L${100 - 94 * s} 118 L${100 - 70 * s} 112Z" fill="#F2B33D"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -8 224 186"><defs></defs>
    ${flame(1)}${flame(-1)}
    <polygon points="${star(100, 80, 66)}" fill="#1E2A6B"/>
    <polygon points="${star(100, 80, 56)}" fill="#2E3FA0" data-noline data-shade="0.8"/>
    <circle cx="100" cy="80" r="40" fill="#13A37F" data-noline data-shade="0.75"/>
    ${miniCard(70, 82, -26, 'cups', '1', 1.25)}${miniCard(130, 82, 26, 'coins', '1', 1.25)}
    <g transform="translate(100 82)">
      <path d="M20 2 C32 2 38 -10 44 -26 L52 -24 C46 -4 38 14 20 16Z" fill="#C9CED8"/>
      <path d="M-24 -10 C-46 -12 -46 22 -24 20" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" data-flat/>
      <path d="M-24 -10 C-46 -12 -46 22 -24 20" fill="none" stroke="#C9CED8" stroke-width="4" stroke-linecap="round" data-flat/>
      <path d="M-26 6 C-26 -16 -14 -24 0 -24 C14 -24 26 -16 26 6 C26 22 14 30 0 30 C-14 30 -26 22 -26 6Z" fill="#DDE3EC"/>
      <path d="M-24 8 H24" stroke="#F2B33D" stroke-width="3.4" data-flat/>
      <path d="M-14 -22 C-14 -32 -8 -36 0 -36 C8 -36 14 -32 14 -22Z" fill="#DDE3EC"/>
      <path d="M0 -36 V-42" stroke="${INK}" stroke-width="2.6" data-flat/><circle cy="-45" r="4.4" fill="#F2B33D"/>
      <path d="M-22 30 H22 L18 38 H-18Z" fill="#B8C0CE"/>
    </g>
    <path d="M22 128 L34 112 H166 L178 128 L166 144 H34Z" fill="#C8273A"/>
    <path d="M10 122 L30 116 V140 L10 146 L18 134Z M190 122 L170 116 V140 L190 146 L182 134Z" fill="#9A1B2C"/>
    <text x="100" y="138" font-family="Lalezar" font-size="26" text-anchor="middle" fill="#FFF4DA" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round" paint-order="stroke" data-flat>ألعاب العائلة</text>
  </svg>`;
}
