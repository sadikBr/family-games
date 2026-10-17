/**
 * «مسابقة التجويد» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * A verse (or part of it) is shown in the Uthmani script with one word (or a pair of words) coloured; everyone
 * picks the tajweed rule that applies there (رواية حفص عن عاصم). Faster right answers score more.
 */
import type { McqResult } from '../protocol';

export type TajweedTopic = 'noon' | 'meem' | 'madd' | 'qalqala' | 'jalala' | 'lam';

export const TAJWEED_TOPICS: { key: TajweedTopic | 'all'; label: string }[] = [
  { key: 'all', label: 'كل الأحكام' },
  { key: 'noon', label: 'النون الساكنة والتنوين' },
  { key: 'meem', label: 'الميم الساكنة' },
  { key: 'madd', label: 'المدود' },
  { key: 'qalqala', label: 'القلقلة' },
  { key: 'jalala', label: 'لام لفظ الجلالة' },
  { key: 'lam', label: 'اللام الشمسية والقمرية' },
];

/** The question asked for each topic. */
export const TAJWEED_QUESTION: Record<TajweedTopic, string> = {
  noon: 'ما حكم النون الساكنة أو التنوين في الموضع الملوَّن؟',
  meem: 'ما حكم الميم الساكنة في الموضع الملوَّن؟',
  madd: 'ما نوع المدّ في الكلمة الملوَّنة؟',
  qalqala: 'ما نوع القلقلة في الكلمة الملوَّنة؟',
  jalala: 'ما حكم لام لفظ الجلالة في الموضع الملوَّن؟',
  lam: 'ما نوع «ال» في الكلمة الملوَّنة؟',
};

export interface TajweedSettings {
  rounds: number;
  /** seconds per question */
  seconds: number;
  topic: TajweedTopic | 'all';
}

export interface TajweedView {
  game: 'tajweed';
  phase: 'ask' | 'reveal' | 'final';
  round: number;
  rounds: number;
  topic: TajweedTopic;
  /** the topic's name (e.g. «المدود») */
  label: string;
  /** the shown part of the verse, word by word (Uthmani text from quran-data.json) */
  words: string[];
  /** coloured words: indexes into `words`, inclusive */
  hl: [number, number];
  /** words were left out before / after the shown part */
  cutStart: boolean;
  cutEnd: boolean;
  options: string[];
  endsAt: number | null;
  answered: string[];
  myAnswer: number | null;
  /** revealed */
  correct: number | null;
  /** revealed: «سورة الفلق — الآية 2» */
  ref: string | null;
  /** revealed: one line, e.g. «نون ساكنة بعدها باء ⇐ إقلاب» */
  why: string | null;
  results: McqResult[] | null;
  scores: Record<string, number>;
  seconds: number;
}

export const TAJWEED_DEFAULTS: TajweedSettings = { rounds: 10, seconds: 20, topic: 'all' };

export const TAJWEED_INFO = {
  title: 'مسابقة التجويد',
  tagline: 'ما حكم التجويد في الكلمة الملوّنة؟',
  color: '#1F7A6B',
  maxPlayers: 12,
  howTo: [
    'تظهر آية (أو جزء منها) بالرسم العثماني، وفيها كلمة أو كلمتان بلون مختلف.',
    'اختر حكم التجويد الذي ينطبق على الموضع الملوَّن، على رواية حفص عن عاصم.',
    'كل لاعب يجيب من هاتفه: الإجابة الصحيحة بخمسمئة نقطة، ومعها حتى خمسمئة أخرى حسب السرعة.',
    'بعد كل سؤال يظهر سبب الحكم في سطر واحد مع اسم السورة ورقم الآية.',
    'يختار المضيف موضوع الأسئلة: النون الساكنة والتنوين، الميم الساكنة، المدود، القلقلة، لام لفظ الجلالة، اللام الشمسية والقمرية، أو كلها معاً.',
  ],
};
