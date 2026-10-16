// App branding: launcher icon (Android adaptive layers + full icon), splash logo.
// Same visual language as the in-app emblem (hero.mjs): khatam star, mint-tea medallion,
// Moroccan teapot, Spanish cards, saffron accents on Majorelle indigo.
import { miniCard } from './badges.mjs';
import { INK } from './mkit.mjs';

const BG = '#141633'; // app background (theme C.bg)

function starPts(cx, cy, r, inner = 0.8, n = 8) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** The Moroccan teapot, centred at 0,0, about 100 units tall at s = 1. */
const teapot = (s) => `<g transform="scale(${s})">
  <path d="M20 2 C32 2 38 -10 44 -26 L52 -24 C46 -4 38 14 20 16Z" fill="#C9CED8"/>
  <path d="M-24 -10 C-46 -12 -46 22 -24 20" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" data-flat/>
  <path d="M-24 -10 C-46 -12 -46 22 -24 20" fill="none" stroke="#C9CED8" stroke-width="4" stroke-linecap="round" data-flat/>
  <path d="M-26 6 C-26 -16 -14 -24 0 -24 C14 -24 26 -16 26 6 C26 22 14 30 0 30 C-14 30 -26 22 -26 6Z" fill="#DDE3EC"/>
  <path d="M-24 8 H24" stroke="#F2B33D" stroke-width="3.4" data-flat/>
  <path d="M-14 -22 C-14 -32 -8 -36 0 -36 C8 -36 14 -32 14 -22Z" fill="#DDE3EC"/>
  <path d="M0 -36 V-42" stroke="${INK}" stroke-width="2.6" data-flat/><circle cy="-45" r="4.4" fill="#F2B33D"/>
  <path d="M-22 30 H22 L18 38 H-18Z" fill="#B8C0CE"/>
</g>`;

/** Star + medallion + cards + teapot, centred at 0,0, radius ≈ 66 at s = 1. */
function emblem() {
  return `
    <polygon points="${starPts(0, 0, 66)}" fill="#1E2A6B"/>
    <polygon points="${starPts(0, 0, 56)}" fill="#2E3FA0" data-noline data-shade="0.8"/>
    <circle cx="0" cy="0" r="40" fill="#13A37F" data-noline data-shade="0.75"/>
    ${miniCard(-30, -6, -24, 'cups', '1', 1.3)}${miniCard(30, -6, 24, 'coins', '1', 1.3)}
    <g transform="translate(0 10)">${teapot(0.82)}</g>`;
}

/** Zellige-like tessellation of small 8-point stars. */
function zellige(w, h, step, color, opacity) {
  let out = '';
  for (let y = 0; y <= h + step; y += step) {
    for (let x = 0; x <= w + step; x += step) {
      const ox = (Math.floor(y / step) % 2) * (step / 2);
      out += `<polygon points="${starPts(x + ox, y, step * 0.3, 0.72)}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${step * 0.035}" data-flat/>`;
    }
  }
  return out;
}

/* ---------------- Android adaptive icon (108 × 108 dp; the safe circle is 66 dp) ---------------- */

export function iconBackground() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
    <defs>
      <radialGradient id="glow" cx="50%" cy="46%" r="60%">
        <stop offset="0" stop-color="#2B3C9E"/><stop offset="0.55" stop-color="#1B2160"/><stop offset="1" stop-color="${BG}"/>
      </radialGradient>
    </defs>
    <rect width="108" height="108" fill="url(#glow)" data-flat/>
    ${zellige(108, 108, 18, '#F2B33D', 0.13)}
  </svg>`;
}

export function iconForeground(scale = 0.47) {
  // emblem radius 66 → scaled so the whole thing sits inside the 66 dp safe circle (r = 33), with a little air
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
    <g transform="translate(54 54.5) scale(${scale})">${emblem()}</g>
  </svg>`;
}

/* The full-bleed icon (iOS, legacy Android, store) = background + iconForeground(0.62), composited in brand.py. */

/* ---------------- splash logo: emblem + wordmark, fits inside a circle (Android 12+ masks the splash icon) ---------------- */

export function splashLogo() {
  const flame = (s) => `<path d="M${-38 * s} 12 L${-72 * s} -14 L${-58 * s} 6 L${-80 * s} 14 L${-56 * s} 24 L${-70 * s} 38 L${-46 * s} 32Z" fill="#F2B33D"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-168 -168 336 336"><g transform="translate(0 -6) scale(0.8)">
    <g transform="translate(0 -22)">
      ${flame(1)}${flame(-1)}
      ${emblem()}
    </g>
    <g transform="translate(0 44)">
      <path d="M-78 54 L-66 38 H66 L78 54 L66 70 H-66Z" fill="#C8273A"/>
      <path d="M-90 48 L-70 42 V66 L-90 72 L-82 60Z M90 48 L70 42 V66 L90 72 L82 60Z" fill="#9A1B2C"/>
      <text x="0" y="64" font-family="Lalezar" font-size="26" text-anchor="middle" fill="#FFF4DA" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round" paint-order="stroke" data-flat>ألعاب العائلة</text>
    </g>
  </g></svg>`;
}
