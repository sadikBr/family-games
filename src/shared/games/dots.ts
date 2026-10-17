/**
 * «المربعات» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * Board geometry (n = boxes per side, dots are (n+1)×(n+1)): every line has one index.
 * Horizontal lines come first, row by row: (r, c) with r in 0..n and c in 0..n-1 → r·n + c.
 * Vertical lines follow: (r, c) with r in 0..n-1 and c in 0..n → n(n+1) + r·(n+1) + c.
 * Box (r, c) → r·n + c.
 */

export type DotsLevel = 'easy' | 'medium' | 'hard';
export const DOTS_SIZES = [3, 4, 5, 6] as const;

export interface DotsSettings {
  /** boxes per side */
  size: number;
  /** bot strength */
  level: DotsLevel;
}

export interface DotsView {
  game: 'dots';
  phase: 'play' | 'final';
  /** boxes per side */
  n: number;
  /** everyone who started, in turn order (a seat's index picks its colour) */
  seats: string[];
  /** names captured at the start (a player who left is no longer in the room) */
  names: Record<string, string>;
  /** seats still playing */
  active: string[];
  turn: string | null;
  /** per line: -1 = not drawn, else the seat index of who drew it */
  lines: number[];
  /** per box: -1 = open, else the seat index of its owner */
  boxes: number[];
  last: number | null;
  /** boxes closed by the last line */
  lastBoxes: number[];
  /** boxes per player in this game */
  points: Record<string, number>;
  winners: string[] | null;
  /** how the game ended: every box taken, or everyone else left / resigned */
  reason: 'full' | 'forfeit' | null;
  /** games won in this series (same group of players in the same room) */
  score: Record<string, number>;
  /** my seat index (-1: watching) */
  me: number;
}

export const DOTS_DEFAULTS: DotsSettings = { size: 4, level: 'medium' };

export const DOTS_INFO = {
  title: 'المربعات',
  tagline: 'صِل النقاط وأغلق المربعات… كل مربع لك!',
  color: '#7B61D9',
  maxPlayers: 4,
  howTo: [
    'بالدور، كل لاعب يرسم خطاً واحداً بين نقطتين متجاورتين: المس الفراغ بين النقطتين.',
    'من يرسم الضلع الرابع لمربع يأخذه (يتلوّن بلونه) ويلعب مرة أخرى.',
    'احذر أن ترسم الضلع الثالث لمربع: خصمك سيغلقه ويواصل!',
    'تنتهي اللعبة حين تُؤخذ كل المربعات، والفائز صاحب أكثر المربعات.',
    'من ٢ إلى ٤ لاعبين، ويمكن إضافة بوتات. اختر حجم الشبكة وقوة البوت قبل البدء.',
  ],
};

export const dotsLineCount = (n: number) => 2 * n * (n + 1);

/** The four lines around box b: top, bottom, left, right. */
export function dotsBoxLines(n: number, b: number): [number, number, number, number] {
  const r = Math.floor(b / n), c = b % n;
  const H = n * (n + 1);
  return [r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1];
}

/** The one or two boxes a line borders. */
export function dotsLineBoxes(n: number, e: number): number[] {
  const H = n * (n + 1);
  const out: number[] = [];
  if (e < H) {
    const r = Math.floor(e / n), c = e % n;
    if (r > 0) out.push((r - 1) * n + c);
    if (r < n) out.push(r * n + c);
  } else {
    const k = e - H;
    const r = Math.floor(k / (n + 1)), c = k % (n + 1);
    if (c > 0) out.push(r * n + c - 1);
    if (c < n) out.push(r * n + c);
  }
  return out;
}
