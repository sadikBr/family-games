/**
 * «الروابط» — sixteen words, four hidden groups of four (in the style of the «Connections» puzzles): the types
 * shared by the server and the app, the default settings, the game's card on the home screen and the rules
 * both sides use.
 *
 * A puzzle is 16 words (or short names) in 4 groups, each with a theme and a colour by difficulty: yellow
 * (easiest), green, blue, purple (hardest). Select four tiles and press «تحقّق»: a right group locks in as a
 * coloured bar with its theme; a wrong one is a mistake (4 allowed), and «ينقص واحد!» tells when three of the
 * four belong together. The same wrong four again costs nothing (it is just refused).
 *
 * Modes:
 * - «سباق» (race, default): everyone solves the same puzzle on their own phone at once. The others are seen
 *   only as counts (groups found, mistakes), never their selections; the solution is shown to nobody before
 *   the puzzle ends (everyone done, or the time limit). Points per puzzle: each group found by its colour
 *   (10 / 15 / 20 / 25), and a full board adds 5 for each mistake left plus a finishing bonus (10 / 6 / 3
 *   for the first three to finish).
 * - «تعاون» (co-op): one shared board for the family; anyone selects, anyone checks, the mistakes are shared.
 *   The family wins when it solves more than half of the puzzles.
 */

export type RawabitColor = 'yellow' | 'green' | 'blue' | 'purple';
export type RawabitMode = 'race' | 'coop';

/** Easiest first. */
export const RAWABIT_COLORS: RawabitColor[] = ['yellow', 'green', 'blue', 'purple'];
/** The colours on screen. */
export const RAWABIT_HEX: Record<RawabitColor, string> = { yellow: '#F2C14E', green: '#5DBB63', blue: '#4F8FE0', purple: '#A36BD8' };
export const RAWABIT_COLOR_NAME: Record<RawabitColor, string> = { yellow: 'الأصفر', green: 'الأخضر', blue: 'الأزرق', purple: 'البنفسجي' };
/** Points for a group found (race), by its colour. */
export const RAWABIT_POINTS: Record<RawabitColor, number> = { yellow: 10, green: 15, blue: 20, purple: 25 };
/** A full board: points for each mistake left. */
export const RAWABIT_CLEAN_BONUS = 5;
/** A full board: the first, second and third to finish. */
export const RAWABIT_ORDER_BONUS = [10, 6, 3] as const;
/** Mistakes allowed in a puzzle. */
export const RAWABIT_MISTAKES = 4;
/** Words in a group / groups in a puzzle. */
export const RAWABIT_SIZE = 4;

export const RAWABIT_PUZZLES = [1, 3, 5] as const;
/** Minutes per puzzle (0 = no limit). */
export const RAWABIT_MINUTES = [0, 3, 5] as const;

export interface RawabitSettings {
  mode: RawabitMode;
  /** 1, 3 or 5 */
  puzzles: number;
  /** minutes per puzzle: 0 (no limit), 3 or 5 */
  minutes: number;
}

export const RAWABIT_DEFAULTS: RawabitSettings = { mode: 'race', puzzles: 3, minutes: 0 };

/** A puzzle's group as shown once it is found (or at the end). */
export interface RawabitGroup {
  color: RawabitColor;
  theme: string;
  words: string[];
}

/** A group found on a board (co-op: who checked it). */
export interface RawabitFound extends RawabitGroup {
  by: string | null;
}

/** A word on the board; the id says nothing about its group. */
export interface RawabitTile {
  id: number;
  word: string;
}

/** solved: all four groups · out: no mistakes left · time: the time ran out first. */
export type RawabitDone = 'solved' | 'out' | 'time' | null;

/** The last check on a board, so the screen can show it (race: only my own board's). */
export interface RawabitFlash {
  /** bumps with every check on this board */
  seq: number;
  kind: 'right' | 'wrong' | 'away';
  by: string;
  color: RawabitColor | null;
  ids: number[];
}

export interface RawabitBoardView {
  /** the words not yet in a found group, in the puzzle's order (each phone may shuffle its own) */
  tiles: RawabitTile[];
  found: RawabitFound[];
  /** the tiles selected (race: mine · co-op: the family's) */
  sel: number[];
  mistakes: number;
  done: RawabitDone;
  /** finishing order of a full board (race), 1 = first */
  rank: number | null;
  flash: RawabitFlash | null;
}

/** Another player's progress (race): counts only. */
export interface RawabitProgress {
  found: number;
  mistakes: number;
  done: RawabitDone;
  rank: number | null;
}

export interface RawabitPlayerResult {
  id: string;
  /** colours found, in the order found */
  found: RawabitColor[];
  mistakes: number;
  done: RawabitDone;
  rank: number | null;
  /** the puzzle's points: groups + mistakes left + finishing bonus */
  groups: number;
  clean: number;
  order: number;
  gain: number;
}

/** The end of a puzzle: every group, and how each one did. */
export interface RawabitReveal {
  groups: RawabitGroup[];
  /** race: one line per player */
  results: RawabitPlayerResult[];
  /** co-op: the family's board */
  team: { found: RawabitColor[]; mistakes: number; done: RawabitDone } | null;
}

export interface RawabitView {
  game: 'rawabit';
  mode: RawabitMode;
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  puzzle: number;
  puzzles: number;
  /** race: my board · co-op: the family's (null for someone watching a race) */
  board: RawabitBoardView | null;
  /** race: everyone's counts (co-op: empty) */
  progress: Record<string, RawabitProgress>;
  /** play: the time limit (null without one) · reveal: the next puzzle */
  endsAt: number | null;
  timerTotal: number;
  reveal: RawabitReveal | null;
  /** race: points · co-op: groups found by each one */
  scores: Record<string, number>;
  /** co-op: puzzles solved so far (and this one, once solved) */
  solved: number;
  players: string[];
}

export const RAWABIT_INFO = {
  title: 'الروابط',
  tagline: 'ست عشرة كلمة: رتّبوها في أربع مجموعات خفية.',
  color: '#2E9E6A',
  maxPlayers: 10,
  howTo: [
    'على اللوحة ست عشرة كلمة، في أربع مجموعات خفية من أربع كلمات، لكل مجموعة رابط واحد: فواكه، مدن مغربية، كلمات تأتي بعد «ماء»، أسماء حروف…',
    'اختر أربع كلمات ثم اضغط «تحقّق». المجموعة الصحيحة تُقفل في شريط ملوّن يكشف رابطها. والخاطئة خطأ واحد من أربعة مسموحة، و«ينقص واحد!» تعني أن ثلاثاً منها من مجموعة واحدة.',
    'الألوان بحسب الصعوبة: الأصفر أسهلها، ثم الأخضر، ثم الأزرق، والبنفسجي أصعبها. احذر الكلمات الخادعة: تبدو من مجموعة وهي من أخرى، وكل كلمة لها مكان واحد فقط.',
    'زر «خلط» يغيّر ترتيب الكلمات على شاشتك فقط، و«إلغاء التحديد» يمسح اختيارك.',
    '«سباق»: الجميع يحلّ اللغز نفسه في الوقت نفسه، كلٌّ على هاتفه، ولا يرى أحد اختيارات غيره، بل عدد مجموعاتهم وأخطائهم فقط. النقاط: الأصفر 10، الأخضر 15، الأزرق 20، البنفسجي 25، ولمن يكمل اللوحة 5 نقاط عن كل خطأ لم يُستعمل، و10 ثم 6 ثم 3 لأول ثلاثة يكملونها.',
    '«تعاون»: لوحة واحدة للعائلة كلها، يحدّد أي واحد ويتحقق أي واحد، والأخطاء مشتركة. تفوز العائلة إذا حلّت أكثر من نصف الألغاز.',
    'في الإعدادات: الوضع، وعدد الألغاز (1 أو 3 أو 5)، ووقت لكل لغز (بلا وقت، 3 أو 5 دقائق).',
  ],
};
