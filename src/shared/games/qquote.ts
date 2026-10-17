/**
 * «من القائل؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */
import type { McqResult } from '../protocol';

export type QquoteLevel = 'easy' | 'medium' | 'hard';

export interface QquoteSettings {
  rounds: number;
  /** seconds to answer each question */
  seconds: number;
  /** easy: the best-known stories · medium: + well-known ones · hard: every story */
  level: QquoteLevel;
}

export interface QquoteView {
  game: 'qquote';
  phase: 'ask' | 'reveal' | 'final';
  round: number;
  rounds: number;
  /** the level, shown as a chip */
  label: string;
  /** the quoted words, exactly as in the mushaf */
  text: string;
  /** who said it: 4 names */
  options: string[];
  endsAt: number | null;
  /** seconds per question (for the timer bar) */
  seconds: number;
  answered: string[];
  myAnswer: number | null;
  /** revealed */
  correct: number | null;
  /** revealed: «سورة يوسف — الآية 4» */
  ref: string | null;
  results: McqResult[] | null;
  scores: Record<string, number>;
}

export const QQUOTE_DEFAULTS: QquoteSettings = { rounds: 10, seconds: 20, level: 'easy' };

export const QQUOTE_LEVELS: { key: QquoteLevel; label: string }[] = [
  { key: 'easy', label: 'القصص المشهورة' },
  { key: 'medium', label: 'متوسط' },
  { key: 'hard', label: 'كل القصص' },
];

export const QQUOTE_ROUNDS = { min: 5, max: 20, step: 5 };
export const QQUOTE_SECONDS = { min: 10, max: 40, step: 5 };

export const QQUOTE_INFO = {
  title: 'من القائل؟',
  tagline: 'جملة وردت في القرآن على لسان أحدهم… فمن قالها؟',
  color: '#2E8B57',
  maxPlayers: 12,
  howTo: [
    'تظهر كلمات من آية حكى فيها القرآن الكريم قول أحدهم: نبي، أو ملك، أو امرأة صالحة، أو حتى نملة أو هدهد.',
    'اختر من هاتفك من قالها من بين أربعة أسماء قبل نهاية الوقت.',
    'الجواب الصحيح يعطي 500 نقطة، وحتى 500 نقطة أخرى حسب السرعة.',
    'بعد كل سؤال تظهر الإجابة واسم السورة ورقم الآية.',
    'المستوى «القصص المشهورة» للمبتدئين والأطفال، و«كل القصص» لمن يعرف تفاصيل القصص القرآنية.',
  ],
};
