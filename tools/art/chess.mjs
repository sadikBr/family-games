// Chess pieces (100×100), rendered through the mascot pass. color: 'w' | 'b'.
import { svg100 } from './mkit.mjs';

const FILL = { w: '#FBF4E2', b: '#2E3352' };
const TRIM = { w: '#E9B23A', b: '#E9B23A' };
const SLIT = { w: '#C9B48A', b: '#596089' };

const base = (c) => `<path d="M22 88 H78 V82 C78 77 74 74 69 74 H31 C26 74 22 77 22 82Z" fill="${FILL[c]}"/>
  <path d="M28 74 H72 L68 66 H32Z" fill="${FILL[c]}"/>`;

export function piece(c, t) {
  const f = FILL[c];
  let body = '';
  switch (t) {
    case 'p':
      body = `<path d="M36 66 C38 54 42 48 44 44 H56 C58 48 62 54 64 66Z" fill="${f}"/>
        <path d="M38 46 H62 L58 40 H42Z" fill="${f}"/>
        <circle cx="50" cy="29" r="12" fill="${f}"/>`;
      break;
    case 'r':
      body = `<path d="M34 66 L37 36 H63 L66 66Z" fill="${f}"/>
        <path d="M30 36 H70 V20 H62 V26 H56 V20 H44 V26 H38 V20 H30Z" fill="${f}"/>
        <path d="M38 48 H62" stroke="${SLIT[c]}" stroke-width="2.4" data-flat/>`;
      break;
    case 'b':
      body = `<path d="M36 66 C36 56 40 52 44 50 H56 C60 52 64 56 64 66Z" fill="${f}"/>
        <path d="M50 14 C62 22 66 34 60 46 C56 52 44 52 40 46 C34 34 38 22 50 14Z" fill="${f}"/>
        <path d="M53 26 L45 38" stroke="${SLIT[c]}" stroke-width="3" stroke-linecap="round" data-flat/>
        <circle cx="50" cy="12" r="4.5" fill="${TRIM[c]}"/>`;
      break;
    case 'n':
      body = `<path d="M32 66 C32 54 38 48 42 44 C36 42 28 44 24 40 C20 36 24 30 30 28 C34 20 42 14 52 14 C66 14 74 28 72 44 C71 52 68 58 68 66Z" fill="${f}"/>
        <path d="M46 16 L44 8 L52 13Z" fill="${f}"/>
        <circle cx="44" cy="27" r="2.6" fill="${c === 'w' ? '#2E3352' : '#FBF4E2'}" data-noline data-noshade/>
        <path d="M27 36 C29 37 31 37 33 36" stroke="${SLIT[c]}" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>
        <path d="M56 18 C64 24 66 34 64 44" stroke="${TRIM[c]}" stroke-width="3.6" fill="none" stroke-linecap="round" data-flat/>`;
      break;
    case 'q':
      body = `<path d="M34 66 C36 54 40 46 42 40 H58 C60 46 64 54 66 66Z" fill="${f}"/>
        <path d="M30 26 L38 40 H62 L70 26 L60 33 L56 20 L50 31 L44 20 L40 33Z" fill="${f}"/>
        ${[30, 44, 56, 70].map((x, i) => `<circle cx="${x}" cy="${i === 1 || i === 2 ? 18 : 24}" r="4" fill="${TRIM[c]}"/>`).join('')}
        <circle cx="50" cy="27" r="4" fill="${TRIM[c]}"/>
        <path d="M40 46 H60" stroke="${TRIM[c]}" stroke-width="2.6" data-flat/>`;
      break;
    case 'k':
      body = `<path d="M34 66 C36 54 40 46 42 40 H58 C60 46 64 54 66 66Z" fill="${f}"/>
        <path d="M32 26 C32 36 38 40 42 40 H58 C62 40 68 36 68 26 C62 22 56 26 50 30 C44 26 38 22 32 26Z" fill="${f}"/>
        <path d="M47 8 H53 V13 H58 V19 H53 V27 H47 V19 H42 V13 H47Z" fill="${TRIM[c]}"/>
        <path d="M40 46 H60" stroke="${TRIM[c]}" stroke-width="2.6" data-flat/>`;
      break;
  }
  return svg100(`${base(c)}${body}`);
}
