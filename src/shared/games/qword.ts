/**
 * «كلمة قرآنية» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */
import type { WordleMark } from '../protocol';

export interface QwordSettings {
  /** number of words */
  rounds: number;
  /** race: the round ends as soon as someone finds the word (only they score) */
  race: boolean;
  /** show the kind of word (prophet, surah, place…) during the round */
  hint: boolean;
}

export interface QwordView {
  game: 'qword';
  phase: 'play' | 'reveal' | 'final';
  round: number;
  rounds: number;
  length: number;
  maxTries: number;
  race: boolean;
  /** the kind of word (null when hints are off) */
  hint: string | null;
  myRows: { guess: string; marks: WordleMark[] }[];
  others: { id: string; rows: WordleMark[][]; solved: boolean; done: boolean }[];
  /** revealed (to me once I'm done, to everyone after the round): the word as it is written */
  answer: string | null;
  /** after the round: a verse where the word appears */
  verse: { text: string; ref: string } | null;
  endsAt: number | null;
  /** total of the current timer, for the timer bar */
  timerTotal: number;
  /** half of the players are done, so the round time was cut to a minute */
  hurried: boolean;
  results: { id: string; tries: number | null; points: number }[] | null;
  scores: Record<string, number>;
}

export const QWORD_DEFAULTS: QwordSettings = { rounds: 3, race: false, hint: true };

export const QWORD_INFO = {
  title: 'كلمة قرآنية',
  tagline: 'خمّن كلمة من القرآن الكريم في ست محاولات.',
  color: '#C8A13A',
  maxPlayers: 12,
  howTo: [
    'الكلمة السرية من خمسة حروف، وهي كلمة وردت في القرآن الكريم: اسم نبي أو سورة أو مكان، أو اسم من أسماء الله الحسنى، أو كلمة قرآنية معروفة.',
    'لكل لاعب ست محاولات على هاتفه. بعد كل محاولة: الأخضر حرف في مكانه، والأصفر حرف موجود في مكان آخر، والرمادي حرف غير موجود.',
    'تُكتب الهمزة على الألف ألفاً (أ إ آ = ا)، والألف المقصورة ياءً (ى = ي)، والتاء المربوطة ة كما هي. «ال» تُحسب من الحروف.',
    'تُقبل كل كلمة من خمسة حروف وردت في القرآن أو في القاموس.',
    'تظهر ألوان محاولات الآخرين دون حروفها. النقاط: (7 − عدد المحاولات) × 100، و100 إضافية لأول من يجدها.',
    'في وضع السباق تنتهي الجولة حين يجد أحدهم الكلمة. بعد كل جولة تظهر آية وردت فيها الكلمة مع اسم السورة ورقم الآية.',
  ],
};
