/**
 * UNO FLIP: every card has a light face and a dark face.
 * Light: red / yellow / green / blue — Draw One, Reverse, Skip, Flip, Wild, Wild Draw Two.
 * Dark: pink / teal / orange / purple — Draw Five, Reverse, Skip Everyone, Flip, Wild, Wild Draw Color.
 */
export type UnoSide = 'light' | 'dark';
export type LightColor = 'red' | 'yellow' | 'green' | 'blue';
export type DarkColor = 'pink' | 'teal' | 'orange' | 'purple';
export type UnoColor = LightColor | DarkColor;
export type UnoKind = 'num' | 'draw1' | 'reverse' | 'skip' | 'flip' | 'wild' | 'wild2' | 'draw5' | 'skipAll' | 'wildColor';

export interface UnoFace {
  kind: UnoKind;
  color: UnoColor | null; // null for wilds
  n?: number; // 1..9 for number cards
}

export interface UnoCard {
  id: string;
  light: UnoFace;
  dark: UnoFace;
}

export const LIGHT_COLORS: LightColor[] = ['red', 'yellow', 'green', 'blue'];
export const DARK_COLORS: DarkColor[] = ['pink', 'teal', 'orange', 'purple'];
export const colorsOf = (side: UnoSide): UnoColor[] => (side === 'light' ? LIGHT_COLORS : DARK_COLORS);

export const UNO_COLOR_INFO: Record<UnoColor, { name: string; hex: string }> = {
  red: { name: 'أحمر', hex: '#E23B3B' },
  yellow: { name: 'أصفر', hex: '#F4C21B' },
  green: { name: 'أخضر', hex: '#3AA845' },
  blue: { name: 'أزرق', hex: '#2D6FD8' },
  pink: { name: 'وردي', hex: '#E6338F' },
  teal: { name: 'فيروزي', hex: '#14A3A0' },
  orange: { name: 'برتقالي', hex: '#F27B1F' },
  purple: { name: 'بنفسجي', hex: '#7A3CC2' },
};

export const isWild = (f: UnoFace) => f.kind === 'wild' || f.kind === 'wild2' || f.kind === 'wildColor';

function facesFor(side: UnoSide): UnoFace[] {
  const out: UnoFace[] = [];
  const actions: UnoKind[] = side === 'light' ? ['draw1', 'reverse', 'skip', 'flip'] : ['draw5', 'reverse', 'skipAll', 'flip'];
  for (const color of colorsOf(side)) {
    for (let n = 1; n <= 9; n++) out.push({ kind: 'num', color, n }, { kind: 'num', color, n });
    for (const kind of actions) out.push({ kind, color }, { kind, color });
  }
  const wilds: UnoKind[] = side === 'light' ? ['wild', 'wild2'] : ['wild', 'wildColor'];
  for (const kind of wilds) for (let k = 0; k < 4; k++) out.push({ kind, color: null });
  return out; // 112
}

/** Fresh deck: light and dark faces paired at random. */
export function makeUnoDeck(rand: () => number = Math.random): UnoCard[] {
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const light = shuffle(facesFor('light'));
  const dark = shuffle(facesFor('dark'));
  return shuffle(light.map((l, i) => ({ id: `u${i}`, light: l, dark: dark[i] })));
}

export const faceOf = (c: UnoCard, side: UnoSide) => (side === 'light' ? c.light : c.dark);
export const otherSide = (side: UnoSide): UnoSide => (side === 'light' ? 'dark' : 'light');

/** Can `f` be played on top face `top` when the colour in play is `color`? */
export function canPlayFace(f: UnoFace, top: UnoFace, color: UnoColor): boolean {
  if (isWild(f)) return true;
  if (f.color === color) return true;
  if (f.kind === 'num') return top.kind === 'num' && top.n === f.n;
  return f.kind === top.kind;
}

/** End-of-round points for a card left in hand (active side). */
export function unoPoints(f: UnoFace): number {
  switch (f.kind) {
    case 'num':
      return f.n ?? 0;
    case 'draw1':
      return 10;
    case 'reverse':
    case 'skip':
    case 'flip':
    case 'draw5':
      return 20;
    case 'skipAll':
      return 30;
    case 'wild':
      return 40;
    case 'wild2':
      return 50;
    case 'wildColor':
      return 60;
  }
}

export const UNO_KIND_NAME: Record<UnoKind, string> = {
  num: '',
  draw1: '+1',
  reverse: 'عكس',
  skip: 'منع',
  flip: 'قلب',
  wild: 'جوكر',
  wild2: 'جوكر +2',
  draw5: '+5',
  skipAll: 'منع الجميع',
  wildColor: 'جوكر اللون',
};

export function faceName(f: UnoFace): string {
  if (f.kind === 'num') return `${f.n} ${UNO_COLOR_INFO[f.color!].name}`;
  if (isWild(f)) return UNO_KIND_NAME[f.kind];
  return `${UNO_KIND_NAME[f.kind]} ${UNO_COLOR_INFO[f.color!].name}`;
}
