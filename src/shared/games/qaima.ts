/**
 * «املأ القائمة» — the types shared by the server and the app, the default settings and the game's card on
 * the home screen.
 *
 * Each round shows one list with a closed set of answers («دول أفريقيا»، «مدن مغربية»، «سور جزء عمّ»…).
 * Everyone types, on their own phone and all at once, as many of its items as they can before the time
 * runs out. The server checks each answer (tolerant spelling: hamza shapes, ة/ه, ى/ي, «ال», spaces, vowel
 * marks, one slip in a word of 5+ letters, and the other names people use). 1 point per right answer,
 * +1 when nobody else found it. The reveal shows the whole list: who found what, the unique ones, and
 * the famous ones everybody missed.
 *
 * Before the reveal a phone sees only the list's title and size, its own answers, and how MANY answers
 * each of the others has — never which. The lists themselves stay on the server (server/qaima-lists.ts).
 */

export const QAIMA_SECONDS = [60, 90, 120] as const;
export const QAIMA_ROUNDS = [3, 5, 8] as const;

export interface QaimaSettings {
  /** 3, 5 or 8 */
  rounds: number;
  /** 60, 90 or 120 seconds of typing per round */
  seconds: number;
}

export const QAIMA_DEFAULTS: QaimaSettings = { rounds: 5, seconds: 90 };

export type QaimaTopic = 'geo' | 'islam' | 'science' | 'morocco' | 'sport' | 'lang' | 'animals' | 'food';

export const QAIMA_TOPICS: Record<QaimaTopic, string> = {
  geo: 'جغرافيا',
  islam: 'إسلاميات',
  science: 'علوم',
  morocco: 'المغرب',
  sport: 'رياضة',
  lang: 'لغة',
  animals: 'حيوانات',
  food: 'أكل',
};

/** Points of a round: one per right answer, one more for each answer nobody else found. */
export const qaimaPoints = (found: number, unique: number): number => found + unique;

/** The gentle line under the box after each answer. */
export const QAIMA_NOTE = {
  miss: 'غير موجود في القائمة',
  dup: 'مكتوب من قبل',
} as const;

/** What the server said about my last answer (`seq` grows with each one). */
export interface QaimaNote {
  seq: number;
  kind: 'ok' | 'dup' | 'miss';
  /** ok / dup: the item's name; miss: what I typed */
  text: string;
}

export interface QaimaPrompt {
  title: string;
  topic: QaimaTopic;
  /** how many items the list has */
  size: number;
  /** a short line under the title while typing (which names count…) */
  hint: string | null;
}

/** One item at the reveal, with who found it. */
export interface QaimaChip {
  name: string;
  finders: string[];
}

export interface QaimaResult {
  id: string;
  found: number;
  /** answers nobody else found */
  unique: number;
  points: number;
}

export interface QaimaReveal {
  /** the whole list (in its own order when it has one: months, planets…; else the famous first) */
  items: QaimaChip[];
  /** «أشهر ما فات الجميع»: the famous items nobody found */
  missed: string[];
  /** distinct items found by someone */
  covered: number;
  /** a fact about the list (e.g. «بلوتو كوكب قزم منذ 2006») */
  note: string | null;
  results: QaimaResult[];
}

export interface QaimaView {
  game: 'qaima';
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  seconds: number;
  prompt: QaimaPrompt;
  /** end of the typing time or of the reveal */
  endsAt: number | null;
  /** my right answers this round, in the order I found them (the items' own names) */
  mine: string[];
  /** my last answer's verdict */
  note: QaimaNote | null;
  /** how many right answers each player has this round (never which) */
  counts: Record<string, number>;
  /** the players who said they have nothing more to add */
  done: string[];
  /** reveal only */
  reveal: QaimaReveal | null;
  scores: Record<string, number>;
  players: string[];
}

export const QAIMA_INFO = {
  title: 'املأ القائمة',
  tagline: 'دول أفريقيا، مدن مغربية… اكتبوا أكثر ما يمكن قبل انتهاء الوقت.',
  color: '#D98A2B',
  maxPlayers: 12,
  howTo: [
    'في كل جولة قائمة معروفة العناصر: «دول أفريقيا»، «مدن مغربية»، «سور جزء عمّ»، «ألوان قوس قزح»، «فواكه»…',
    'اكتب على هاتفك أكبر عدد ممكن من عناصرها قبل انتهاء الوقت: اكتب الاسم واضغط «أضف» أو Enter، وتظهر إجاباتك المقبولة تحت الخانة.',
    'لا تهم الهمزات ولا التاء المربوطة ولا «ال» ولا التشكيل، ويُقبل خطأ إملائي واحد في الكلمة الطويلة، والأسماء الأخرى المعروفة (كوت ديفوار = ساحل العاج).',
    'يرى كل لاعب عدد إجابات الآخرين فقط، لا إجاباتهم.',
    'نقطة لكل إجابة صحيحة، ونقطة إضافية لكل إجابة لم يجدها أحد غيرك.',
    'عند انتهاء الوقت تظهر القائمة كاملة: من وجد كل عنصر، والإجابات المنفردة، وأشهر ما فات الجميع.',
    'زر «انتهيت»: حين يضغطه الجميع تنتهي الجولة مبكراً.',
    'في الإعدادات: الوقت (60 أو 90 أو 120 ثانية) وعدد الجولات (3 أو 5 أو 8).',
  ],
};
