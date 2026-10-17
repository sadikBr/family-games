/**
 * «رتّب الخطوات» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export type StepsCategory = 'worship' | 'quran' | 'seerah' | 'history';
export type StepsLevel = 'easy' | 'medium' | 'hard';

export const STEPS_CATEGORIES: { key: StepsCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'worship', label: 'العبادات والعقيدة' },
  { key: 'quran', label: 'القرآن الكريم' },
  { key: 'seerah', label: 'الأنبياء والسيرة' },
  { key: 'history', label: 'التاريخ والتقويم' },
];

export interface StepsSettings {
  rounds: number;
  /** seconds per round */
  seconds: number;
  category: StepsCategory | 'all';
  /** how many mistakes the bots make */
  level: StepsLevel;
}

export interface StepsResult {
  id: string;
  /** what they sent: indexes into `items`, in their order (null: nothing sent in time) */
  order: number[] | null;
  /** steps in the right position */
  right: number;
  points: number;
  /** time taken to send, in ms */
  ms: number | null;
}

export interface StepsView {
  game: 'steps';
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  /** label of the sequence's category */
  label: string;
  title: string;
  /** the steps, shuffled (the same order on every phone) */
  items: string[];
  endsAt: number | null;
  timerTotal: number;
  /** who has sent an order this round */
  submitted: string[];
  /** my sent order */
  mine: number[] | null;
  /** reveal: the right order (indexes into `items`) and a short note */
  correct: number[] | null;
  note: string | null;
  results: StepsResult[] | null;
  scores: Record<string, number>;
  players: string[];
}

/** Points for a round: up to 600 for the steps in their place, plus up to 400 for speed when all are right. */
export const STEPS_PLACE_POINTS = 600;
export const STEPS_SPEED_POINTS = 400;

/** How many steps of `order` sit in their right position (`correct` = the right order). */
export function stepsRight(order: readonly number[], correct: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < correct.length; i++) if (order[i] === correct[i]) n++;
  return n;
}

/** Round score: positions right (scaled to 600), plus a speed bonus (up to 400) only for a perfect order. */
export function stepsPoints(right: number, total: number, msLeft: number, msTotal: number): number {
  if (total <= 0) return 0;
  const base = Math.round((STEPS_PLACE_POINTS * right) / total);
  if (right < total) return base;
  const share = msTotal > 0 ? Math.max(0, Math.min(1, msLeft / msTotal)) : 0;
  return base + Math.round(STEPS_SPEED_POINTS * share);
}

export const STEPS_DEFAULTS: StepsSettings = { rounds: 6, seconds: 60, category: 'all', level: 'medium' };

export const STEPS_INFO = {
  title: 'رتّب الخطوات',
  tagline: 'الوضوء والصلاة والعمرة… رتّب خطواتها كما ينبغي.',
  color: '#3D7BE0',
  maxPlayers: 12,
  howTo: [
    'تظهر للجميع خطوات عبادة أو حدث أو قائمة مخلوطة: الوضوء، العمرة، الأشهر الهجرية، غزوات النبي ﷺ…',
    'المس الخطوات بالترتيب لتبني قائمتك. لتصحيح خطوة المسها في القائمة فتعود، ويصير مكانها هو الخانة التالية التي تملؤها.',
    'حين تكتمل القائمة اضغط «أرسل». لا يمكن التعديل بعد الإرسال.',
    'لكل خطوة في مكانها الصحيح نصيب من 600 نقطة، فمن رتّب نصف الخطوات صحيحة نال 300. ومن رتّبها كلها صحيحة نال أيضاً حتى 400 نقطة للسرعة.',
    'بعد كل جولة يظهر الترتيب الصحيح ونتيجة كل لاعب. الأعلى نقاطاً بعد كل الجولات يفوز.',
  ],
};
