/**
 * "Majorelle night" — a calm, deep indigo base with saffron and mint-tea accents.
 * Flat surfaces, one accent per screen, colour used for meaning (turns, success, danger).
 */
export const C = {
  bg: '#141633',
  bg2: '#1A1D42',
  bg3: '#101229',
  surface: '#1F2350',
  surfaceStrong: '#2A2F66',
  raised: '#262A5C',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F7F4EC',
  muted: '#B4B1D4',
  dim: '#7D7AA6',
  ink: '#1B1830',
  // accents
  yellow: '#F2B33D', // saffron — primary
  green: '#2FB67C', // mint tea — success
  red: '#E2475F', // pomegranate — danger
  blue: '#4F5BD5', // majorelle
  purple: '#7B61D9',
  pink: '#E86FA6',
  cyan: '#22B8B0',
  orange: '#F08A3E',
  night: '#0B0E24',
  felt: '#1E6B4A',
  feltDark: '#155238',
  wood: '#6B4423',
} as const;

export const F = {
  display: 'Lalezar_400Regular',
  body: 'BalooBhaijaan2_500Medium',
  bold: 'BalooBhaijaan2_700Bold',
  black: 'BalooBhaijaan2_800ExtraBold',
  /** Uthmani Quran text */
  quran: 'AmiriQuran_400Regular',
} as const;

export const R = { sm: 12, md: 18, lg: 24 } as const;

/** Avatar art ids (see src/art/avatars.tsx). */
export const AVATARS = [
  'lion', 'cat', 'fox', 'bear', 'panda', 'rabbit', 'owl', 'frog',
  'penguin', 'monkey', 'tiger', 'koala', 'girl', 'boy', 'grandma', 'grandpa',
];

export const PLAYER_COLORS = [
  '#E2475F', '#F08A3E', '#F2B33D', '#2FB67C', '#22B8B0',
  '#4F5BD5', '#7B61D9', '#E86FA6', '#3D9BE9', '#A3B18A',
];

/** Darken / lighten a hex color by `amount` (-1..1). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = (c: number) =>
    Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  r = f(r);
  g = f(g);
  b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Deterministic pseudo-random number in [0, 1) — pure, safe to call during render. */
export function hashRand(a: number, b = 0): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
