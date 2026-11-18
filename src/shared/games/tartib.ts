/**
 * «رتّب الأحداث» — a timeline game: every round everyone gets the same 4 or 5 cards (events, inventions,
 * buildings, births of famous people, sports moments…) and puts them in chronological order on their own
 * phone, at the same time. The types shared by the server and the app, the scoring rule, the default
 * settings and the game's card on the home screen.
 */

/** A card's field (each content item has exactly one). */
export type TartibCat = 'world' | 'islam' | 'morocco' | 'science' | 'sport';
/** The lobby's topic: one field, or all of them. */
export type TartibTopic = 'mix' | TartibCat;
/** How close the dates of a round are (rounds get harder as the game goes on). */
export type TartibLevel = 'easy' | 'medium' | 'hard';

export const TARTIB_TOPICS: { key: TartibTopic; label: string }[] = [
  { key: 'mix', label: 'منوّع' },
  { key: 'world', label: 'تاريخ عام' },
  { key: 'islam', label: 'تاريخ إسلامي' },
  { key: 'morocco', label: 'المغرب' },
  { key: 'science', label: 'علوم واختراعات' },
  { key: 'sport', label: 'رياضة' },
];

export const TARTIB_CAT_LABEL: Record<TartibCat, string> = {
  world: 'تاريخ',
  islam: 'تاريخ إسلامي',
  morocco: 'المغرب',
  science: 'علوم',
  sport: 'رياضة',
};

export const TARTIB_LEVEL_LABEL: Record<TartibLevel, string> = { easy: 'سهلة', medium: 'متوسطة', hard: 'صعبة' };

export const TARTIB_ROUNDS = [5, 8, 10] as const;
export const TARTIB_SECONDS = [30, 45, 60] as const;

export interface TartibSettings {
  rounds: number;
  /** seconds per round */
  seconds: number;
  topic: TartibTopic;
}

export const TARTIB_DEFAULTS: TartibSettings = { rounds: 8, seconds: 45, topic: 'mix' };

/** A card as the phones see it while playing: no year, nothing that tells its place. */
export interface TartibCard {
  text: string;
  cat: TartibCat;
}

/** The reveal: one card of the right order (oldest first). */
export interface TartibAnswer {
  /** index into `cards` */
  card: number;
  /** negative = before the Common Era */
  year: number;
  /** the Hijri year, for Islamic history */
  hijri: number | null;
}

export interface TartibResult {
  id: string;
  /** slot → card (null: empty slot); null when nothing was placed */
  order: (number | null)[] | null;
  /** the order was confirmed with «تأكيد» (otherwise what was placed when time ran out) */
  sent: boolean;
  /** cards in their right place */
  right: number;
  perfect: boolean;
  /** the speed bonus (perfect and confirmed orders only) */
  speed: number;
  points: number;
  /** time taken to confirm, in ms */
  ms: number | null;
}

export interface TartibView {
  game: 'tartib';
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  level: TartibLevel;
  topic: TartibTopic;
  /** the round's cards, shuffled (the same order on every phone) */
  cards: TartibCard[];
  endsAt: number | null;
  timerTotal: number;
  /** who has confirmed this round */
  submitted: string[];
  /** my confirmed order (card indexes, oldest first) */
  mine: number[] | null;
  /** my order in progress, as last saved (slot → card), to come back to it after a reconnect */
  draft: (number | null)[] | null;
  /** reveal: the right order with the years */
  answer: TartibAnswer[] | null;
  results: TartibResult[] | null;
  scores: Record<string, number>;
  players: string[];
}

/** +1 a card in its place, +3 more for a perfect order, and up to +2 for a quick perfect one. */
export const TARTIB_PERFECT_BONUS = 3;
export const TARTIB_SPEED_MAX = 2;

/** How many cards of `order` (slot → card) sit in their right slot (`correct` = cards oldest first). */
export function tartibRight(order: readonly (number | null)[], correct: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < correct.length; i++) if (order[i] !== null && order[i] === correct[i]) n++;
  return n;
}

/** The speed bonus of a confirmed perfect order: +2 with two thirds of the time left, +1 with one third. */
export function tartibSpeed(msLeft: number, msTotal: number): number {
  if (msTotal <= 0) return 0;
  const share = msLeft / msTotal;
  return share >= 2 / 3 ? 2 : share >= 1 / 3 ? 1 : 0;
}

/** A round's points. Only a confirmed order gets the speed bonus; a full right order left unconfirmed is still perfect. */
export function tartibPoints(right: number, total: number, sent: boolean, msLeft: number, msTotal: number): { perfect: boolean; speed: number; points: number } {
  const perfect = total > 0 && right === total;
  const speed = perfect && sent ? tartibSpeed(msLeft, msTotal) : 0;
  return { perfect, speed, points: right + (perfect ? TARTIB_PERFECT_BONUS : 0) + speed };
}

/** «1453م»، «44 ق.م» — with Western digits as the app shows them (the screen wraps them with `num`). */
export function tartibYear(year: number): string {
  return year < 0 ? `${-year} ق.م` : `${year}م`;
}

export const TARTIB_INFO = {
  title: 'رتّب الأحداث',
  tagline: 'أيهما كان أولاً؟ رتّبوا الأحداث والاختراعات على خط الزمن.',
  color: '#C77D2E',
  maxPlayers: 12,
  howTo: [
    'في كل جولة تظهر للجميع البطاقات نفسها: أحداث واختراعات ومبانٍ وولادة مشاهير ولحظات رياضية.',
    'رتّبها على هاتفك من الأقدم إلى الأحدث: المس البطاقات بالترتيب فتنزل في الخانات المرقّمة، والمس بطاقة في خانتها لتعيدها. ويمكن أيضاً سحب البطاقة إلى خانة (على الهاتف: المسها مطوّلاً ثم اسحبها).',
    'حين تكتمل الخانات اضغط «تأكيد». وإذا انتهى الوقت قبل التأكيد تُحسب البطاقات الموضوعة في أماكنها.',
    'لكل بطاقة في مكانها الصحيح نقطة، وللترتيب الكامل 3 نقاط إضافية، وللترتيب الكامل السريع نقطة أو نقطتان أخريان.',
    'بعد كل جولة يظهر خط الزمن بالسنوات (والسنة الهجرية للتاريخ الإسلامي) وترتيب كل لاعب. الجولات تصعب شيئاً فشيئاً: التواريخ تتقارب والبطاقات تصير خمساً.',
  ],
};
