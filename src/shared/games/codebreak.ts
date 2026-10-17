/**
 * «فك الشيفرة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * A code is a list of colour indexes (0 … colors−1), one per peg.
 */

export type CodebreakLevel = 'easy' | 'medium' | 'hard';

export interface CodebreakSettings {
  rounds: number;
  /** 4 or 5 pegs in the code */
  pegs: number;
  /** 6 or 8 colours to choose from */
  colors: number;
  /** may a colour appear twice in the code? */
  repeats: boolean;
  /** tries per round: 8 … 12 */
  maxTries: number;
  /** how well the bots play */
  level: CodebreakLevel;
}

export const CODEBREAK_PEGS = [4, 5] as const;
export const CODEBREAK_COLORS = [6, 8] as const;
export const CODEBREAK_TRIES = { min: 8, max: 12 } as const;

/** black: right colour in the right place · white: right colour in another place */
export interface CodebreakMarks {
  black: number;
  white: number;
}

export interface CodebreakRow extends CodebreakMarks {
  guess: number[];
}

export interface CodebreakResult {
  id: string;
  /** tries used to crack it (null: not cracked) */
  tries: number | null;
  /** time from the start of the round to cracking it */
  ms: number | null;
  /** cracked it before everyone else */
  first: boolean;
  points: number;
}

export interface CodebreakView {
  game: 'codebreak';
  phase: 'play' | 'reveal' | 'final';
  round: number;
  rounds: number;
  pegs: number;
  colors: number;
  repeats: boolean;
  maxTries: number;
  /** everyone who plays (seat order) and their names, kept for players who left */
  players: string[];
  names: Record<string, string>;
  myRows: CodebreakRow[];
  /** the others' progress: only their black / white marks, never their colours */
  others: { id: string; rows: CodebreakMarks[]; solved: boolean; done: boolean }[];
  /** the secret code: once the round is over, or once I'm done */
  code: number[] | null;
  endsAt: number | null;
  timerTotal: number;
  /** the round time was cut because half of the players are done */
  hurried: boolean;
  results: CodebreakResult[] | null;
  scores: Record<string, number>;
}

/** Black and white marks of a guess against the code. */
export function codebreakMarks(guess: readonly number[], code: readonly number[]): CodebreakMarks {
  let black = 0;
  const g = new Map<number, number>();
  const c = new Map<number, number>();
  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) black++;
    else {
      g.set(guess[i], (g.get(guess[i]) ?? 0) + 1);
      c.set(code[i], (c.get(code[i]) ?? 0) + 1);
    }
  }
  let white = 0;
  for (const [k, n] of g) white += Math.min(n, c.get(k) ?? 0);
  return { black, white };
}

export const CODEBREAK_DEFAULTS: CodebreakSettings = { rounds: 3, pegs: 4, colors: 6, repeats: false, maxTries: 10, level: 'medium' };

export const CODEBREAK_INFO = {
  title: 'فك الشيفرة',
  tagline: 'خمّن الرمز السري من الدلائل قبل الجميع.',
  color: '#7B61D9',
  maxPlayers: 6,
  howTo: [
    'اللعبة تخفي رمزاً سرياً من 4 ألوان (أو 5)، ونفس الرمز للجميع. كل واحد يحاول فكّه على هاتفه، والأسرع يفوز.',
    'المس الألوان لتملأ الخانات، والمس خانة لتفرغها، ثم «تحقق».',
    'بعد كل محاولة تظهر دلائل: نقطة ممتلئة ● = لون صحيح في مكانه الصحيح، ونقطة فارغة ○ = لون موجود في الرمز لكن في مكان آخر.',
    'لكل لون رمز خاص به (دائرة، مثلث، مربع…) حتى يميّز الجميع الألوان بسهولة.',
    'النقاط: كلما قلّت المحاولات وكنت أسرع زادت نقاطك، وأول من يفك الرمز يأخذ مكافأة. ترى تقدّم الآخرين (دلائلهم فقط، بدون ألوانهم).',
    'في الإعدادات: عدد الجولات، 4 أو 5 خانات، 6 أو 8 ألوان، تكرار الألوان، وعدد المحاولات.',
  ],
};
