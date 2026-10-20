/**
 * «صح أم خطأ» — a statement appears, everyone taps «صح» or «خطأ» on their own phone; a right answer
 * scores 500 and up to 500 more for speed (like the other quizzes). The reveal shows the right answer, a
 * one-line explanation and who answered what. The types shared by the server and the app.
 */

export const TRUEFALSE_ROUNDS = [10, 15, 20] as const;
export const TRUEFALSE_SECONDS = [8, 12, 15] as const;

export interface TruefalseSettings {
  /** 10, 15 or 20 */
  rounds: number;
  /** seconds per statement: 8, 12 or 15 */
  seconds: number;
}

export const TRUEFALSE_DEFAULTS: TruefalseSettings = { rounds: 10, seconds: 12 };

export type TruefalseCat = 'morocco' | 'arab' | 'islam' | 'science' | 'space' | 'body' | 'nature' | 'geo' | 'animals' | 'sport' | 'life' | 'history';

export const TRUEFALSE_CAT_LABEL: Record<TruefalseCat, string> = {
  morocco: 'المغرب',
  arab: 'العالم العربي',
  islam: 'تاريخ إسلامي',
  science: 'علوم',
  space: 'الفضاء',
  body: 'جسم الإنسان',
  nature: 'الطبيعة',
  geo: 'جغرافيا',
  animals: 'الحيوانات',
  sport: 'رياضة',
  life: 'الحياة اليومية',
  history: 'تاريخ',
};

/** A right answer: this much, and up to TRUEFALSE_SPEED_POINTS more the faster it came. */
export const TRUEFALSE_POINTS = 500;
export const TRUEFALSE_SPEED_POINTS = 500;

export interface TruefalseResult {
  id: string;
  /** what they tapped (null: nothing in time) */
  answer: boolean | null;
  correct: boolean;
  points: number;
  /** ms from the statement to the tap (null: no answer) */
  ms: number | null;
}

export interface TruefalseView {
  game: 'truefalse';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  label: string;
  statement: string;
  /** ask: the end of the timer; reveal: the next round */
  endsAt: number | null;
  timerTotal: number;
  answered: string[];
  /** my own tap this round */
  mine: boolean | null;
  /** reveal / final: whether the statement is true, and why */
  truth: boolean | null;
  why: string | null;
  results: TruefalseResult[] | null;
  scores: Record<string, number>;
  players: string[];
  /** right answers so far, per player (the final shows them) */
  rights: Record<string, number>;
}

export const TRUEFALSE_INFO = {
  title: 'صح أم خطأ',
  tagline: 'جملة على الشاشة: صحيحة أم خاطئة؟ أجب بسرعة!',
  color: '#2E9E8F',
  maxPlayers: 12,
  howTo: [
    'تظهر جملة على كل الهواتف: معلومة عن المغرب أو العلوم أو الحيوانات أو التاريخ أو الرياضة…',
    'اضغط «صح» إن كانت صحيحة أو «خطأ» إن كانت خاطئة، قبل انتهاء الوقت. لا يمكن تغيير الجواب بعد الضغط.',
    'الجواب الصحيح يعطي 500 نقطة، وحتى 500 نقطة إضافية حسب السرعة. الجواب الخاطئ لا يعطي شيئاً.',
    'بعد كل جملة يظهر الجواب مع شرح قصير، وما أجاب به كل واحد.',
    'في الإعدادات: 10 أو 15 أو 20 جملة، و8 أو 12 أو 15 ثانية لكل جملة.',
  ],
};
