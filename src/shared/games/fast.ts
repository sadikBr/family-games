/**
 * «الأسرع» — quick reaction mini-games: the types shared by the server and the app (settings, the view
 * each phone gets, the mini-games' content), the default settings and the game's card on the home screen.
 *
 * Every round is one mini-game. The server sends its content with two moments in server time:
 * `startAt` (the round's screen opens after the instruction) and `showAt` (the stimulus appears — for
 * «اضغط عند الأخضر» the moment the circle turns green). Each phone shows the stimulus at that moment,
 * measures the reaction time itself from when it was really displayed, and sends {answer, ms}. The
 * server checks the answer and ranks the right answers by their ms. The right answer is never in the
 * view before the reveal.
 */

export type FastKind = 'green' | 'odd' | 'stars' | 'stroop' | 'biggest' | 'arrow' | 'match' | 'sum' | 'order';

export const FAST_KINDS: FastKind[] = ['green', 'odd', 'stars', 'stroop', 'biggest', 'arrow', 'match', 'sum', 'order'];

export const FAST_ROUNDS = [8, 12, 16] as const;

export interface FastSettings {
  /** 8, 12 or 16 */
  rounds: number;
}

/** The colours of the mini-games: bright enough to read on the dark stage, far apart for a child's eye. */
export type FastColor = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple';
export const FAST_COLORS: FastColor[] = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];
export const FAST_COLOR_HEX: Record<FastColor, string> = {
  red: '#FF5A6E',
  blue: '#4C9BFF',
  green: '#3DD68C',
  yellow: '#FFD23F',
  orange: '#FF9142',
  purple: '#B98CFF',
};
export const FAST_COLOR_NAME: Record<FastColor, string> = {
  red: 'أحمر',
  blue: 'أزرق',
  green: 'أخضر',
  yellow: 'أصفر',
  orange: 'برتقالي',
  purple: 'بنفسجي',
};

export type FastShapeKind = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond';
export const FAST_SHAPES: FastShapeKind[] = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond'];
/** shapes that look different upside down (the odd one can be the same shape turned over) */
export const FAST_TURNABLE: FastShapeKind[] = ['triangle', 'heart'];

export interface FastShape {
  shape: FastShapeKind;
  color: FastColor;
  /** degrees (0 or 180) */
  rot: number;
}

export type FastDir = 'left' | 'up' | 'down' | 'right';
/** the four direction buttons, left to right on the screen */
export const FAST_DIRS: FastDir[] = ['left', 'up', 'down', 'right'];

/** The animals of «الصورة المطابقة» (the app's own avatar art). */
export const FAST_ANIMALS = ['lion', 'cat', 'fox', 'bear', 'panda', 'rabbit', 'owl', 'frog', 'penguin', 'monkey', 'tiger', 'koala'];

/** Positions are fractions (0..1) of the stage's width and height. */
export type FastSpot = [number, number];

export type FastContent =
  | { kind: 'green' }
  | { kind: 'odd'; cols: number; cells: FastShape[] }
  | { kind: 'stars'; stars: FastSpot[]; options: number[]; showMs: number }
  | { kind: 'stroop'; word: FastColor; ink: FastColor; options: FastColor[] }
  | { kind: 'biggest'; numbers: number[] }
  | { kind: 'arrow'; dir: FastDir }
  | { kind: 'match'; target: string; options: string[] }
  | { kind: 'sum'; a: number; b: number; op: '+' | '-'; options: number[] }
  | { kind: 'order'; labels: number[]; spots: FastSpot[] };

/**
 * An answer: the index of the tapped option (cell, number, button…); 0 for the green tap; the indices
 * tapped one after the other for «اضغط بالترتيب».
 */
export type FastAnswer = number | number[];

export interface FastResult {
  id: string;
  /** what they tapped (null: nothing in time, or a tap before the green) */
  answer: FastAnswer | null;
  /** reaction time in ms (null: no answer) */
  ms: number | null;
  correct: boolean;
  /** tapped before the green */
  early: boolean;
  /** 1 = fastest right answer (equal times share a rank); null when not right */
  rank: number | null;
  /** what the round changed in the total (+5, +3, +2, +1, 0, −1) */
  points: number;
}

export interface FastView {
  game: 'fast';
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  kind: FastKind;
  /** server time: the instruction gives way to the round's screen */
  startAt: number;
  /** server time: the stimulus appears (the green moment for «اضغط عند الأخضر») */
  showAt: number;
  /** play: the last moment to answer; reveal: the next round */
  endsAt: number | null;
  timerTotal: number;
  content: FastContent;
  /** who has answered this round */
  answered: string[];
  /** my own answer this round (not judged before the reveal) */
  mine: { answer: FastAnswer | null; ms: number | null; early: boolean } | null;
  /** reveal / final: the right answer */
  answer: FastAnswer | null;
  results: FastResult[] | null;
  scores: Record<string, number>;
  players: string[];
  /** the fastest right answer of the game so far */
  best: { id: string; ms: number; kind: FastKind } | null;
}

/** Points by rank among the right answers: 1st 5, 2nd 3, 3rd 2, every other right answer 1. */
export const FAST_RANK_POINTS = [5, 3, 2];
export const FAST_RIGHT_POINTS = 1;
/** A wrong answer or a tap before the green costs a point (a total never goes below zero). */
export const FAST_WRONG_POINTS = -1;

export const FAST_TITLE: Record<FastKind, string> = {
  green: 'اضغط عند الأخضر',
  odd: 'أيّ شكل مختلف؟',
  stars: 'عُدّ النجوم',
  stroop: 'اللون والكلمة',
  biggest: 'الأكبر',
  arrow: 'اتبع السهم',
  match: 'الصورة المطابقة',
  sum: 'حساب سريع',
  order: 'اضغط بالترتيب',
};

/** One short line under the title: what to do, for a six-year-old. */
export const FAST_HINT: Record<FastKind, string> = {
  green: 'انتظر حتى تصير الدائرة خضراء ثم اضغط بسرعة. لا تضغط وهي حمراء!',
  odd: 'كل الأشكال متشابهة إلا شكلاً واحداً. اضغط عليه.',
  stars: 'تظهر النجوم لحظة قصيرة. كم نجمة رأيت؟',
  stroop: 'اضغط على لون الكتابة، لا على الكلمة المكتوبة.',
  biggest: 'اضغط على أكبر عدد.',
  arrow: 'اضغط على الزر الذي يشير إلى جهة السهم.',
  match: 'اضغط على الصورة نفسها.',
  sum: 'احسب واضغط على الجواب الصحيح.',
  order: 'اضغط على الأعداد بالترتيب: 1 ثم 2 ثم 3…',
};

/** «0.42 ث» */
export const fastSeconds = (ms: number) => (ms / 1000).toFixed(2);

export const FAST_DEFAULTS: FastSettings = { rounds: 8 };

export const FAST_INFO = {
  title: 'الأسرع',
  tagline: 'ألعاب سريعة للصغار والكبار: من يضغط أولاً؟',
  color: '#C653D6',
  maxPlayers: 12,
  howTo: [
    'في كل جولة لعبة صغيرة مختلفة تدوم ثواني: اضغط عند الأخضر، أيّ شكل مختلف؟، عُدّ النجوم، اللون والكلمة، الأكبر، اتبع السهم، الصورة المطابقة، حساب سريع، اضغط بالترتيب.',
    'يظهر اسم اللعبة وما المطلوب، ثم تظهر على كل الهواتف في اللحظة نفسها. اضغط على الجواب الصحيح بأسرع ما يمكن.',
    'يقيس كل هاتف سرعة صاحبه من لحظة ظهور اللعبة على شاشته، فلا يضرّ بطء الشبكة أحداً.',
    'الأسرع بجواب صحيح يأخذ 5 نقاط، والثاني 3، والثالث 2، وكل جواب صحيح بعدهم نقطة. الخطأ أو الضغط قبل الأخضر ينقص نقطة.',
    'بعد كل جولة ترون الجواب الصحيح ومن كان الأسرع. في الإعدادات: 8 أو 12 أو 16 جولة.',
  ],
};
