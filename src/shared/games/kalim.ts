/**
 * «كلم» — the fast word-changing card game (the box's rules, on everyone's phone): the types shared by the
 * server and the app (settings, the view each phone gets), the default settings, the game's card on the
 * home screen and the letter rules both sides use.
 *
 * A three-letter word lies in the middle («الساحة الجماعية»). Every player holds the same number of
 * double-sided letter cards: each card has a different letter on each face, and a player may use either
 * face. There are no turns: the fastest player changes the word by laying ONE of their cards on one of its
 * letters, so that the three letters make a new word («كلم» → «قلم» → «قسم» → «رسم»). A letter can't be
 * laid on the same letter; a word may come back later. The star card stands for any letter (the player
 * says which, and it stays that letter until it is covered).
 *
 * The first to empty their hand wins the round. When nobody can change the word any more (everyone tapped
 * «ما عندي كلمة», or a minute passed without a change), the one with the fewest cards left wins it.
 *
 * Doubtful words: everyday words (and, in «فصحى وعامية», Moroccan words) count at once. Any other word is put
 * to a quick vote of the other people at the table, as on the box («يعلن أحدهم عن توقف اللعبة للتشاور»):
 * accepted = it stays; refused = the card goes back to its player, who waits a moment before trying again.
 *
 * Points (several rounds): one point per card laid, and 3 more for the player who empties their hand first.
 *
 * How letters are compared (the same keys as «البالونات», src/shared/games/balloons.ts): one key for the alif
 * and the hamza (ا أ إ آ ء), ة with ه, ى and ئ with ي, ؤ with و.
 */
import { letterKey } from './balloons';

export { letterKey as kalimKey };

/** The star card's letter. */
export const KALIM_STAR = '*';
/** Letters in the word. */
export const KALIM_LEN = 3;
/** Bonus for emptying the hand first. */
export const KALIM_EMPTY_BONUS = 3;
/** Cards in each hand at the start. */
export const KALIM_HAND_SIZES = [6, 9, 12] as const;
/** Rounds in a game. */
export const KALIM_ROUNDS = [1, 3, 5] as const;
/** No change of the word for this long: the round ends as if everyone were stuck. */
export const KALIM_STALL_MS = 60_000;
/** Time to vote on a doubtful word. */
export const KALIM_VOTE_MS = 15_000;
/** A refused word: its player waits this long before laying another card. */
export const KALIM_LOCK_MS = 3000;

/** 'fusha': فصحى only · 'mixed': فصحى وعامية (Moroccan words count too). */
export type KalimDialect = 'fusha' | 'mixed';

export interface KalimSettings {
  dialect: KalimDialect;
  /** cards per hand: 6, 9 or 12 */
  hand: number;
  /** 1, 3 or 5 */
  rounds: number;
}

export const KALIM_DEFAULTS: KalimSettings = { dialect: 'fusha', hand: 9, rounds: 1 };

/** One card: a letter key on each face (both KALIM_STAR for the star card). */
export interface KalimCard {
  id: number;
  a: string;
  b: string;
}

export const isStarCard = (c: Pick<KalimCard, 'a'>) => c.a === KALIM_STAR;

/** How a key is printed on a card (the alif as the box prints it: «أ»). */
export const cardLetter = (key: string) => (key === 'ا' ? 'أ' : key);

/** The 28 letters, for the star card's picker (alphabetical, 7 a row). */
export const KALIM_KEYS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];

/** A word made of keys («قلم»), from any spelling («قَلَم», «أمل» → «امل»); null if it isn't 3 Arabic letters. */
export function kalimWordKey(text: string): string | null {
  const chars = [...text.replace(/[ً-ْـٰ]/g, '').trim()];
  if (chars.length !== KALIM_LEN) return null;
  const keys = chars.map((c) => letterKey(c));
  return keys.every(Boolean) ? keys.join('') : null;
}

/** One change of the word, kept for the trail under it. */
export interface KalimStep {
  /** the word as shown (its usual spelling when the app knows it: «أمل», «ماء») */
  word: string;
  /** who changed it (null: the starting word) */
  by: string | null;
}

/** The word now. */
export interface KalimBoard {
  /** the three keys, first letter first (the screens draw them right to left) */
  keys: string[];
  /** the letters as shown (hamza seats, ة, ى from the word's usual spelling when known) */
  shown: string[];
  /** a star card lies there (standing for keys[i]) */
  star: boolean[];
  /** cards piled on each letter (the starting letter counts 1) */
  pile: number[];
  /** who laid the top card of each letter (null: the starting word) */
  by: (string | null)[];
}

/** The last change, so the screens can animate it. */
export interface KalimMove {
  /** bumps with every change of the word (the play's `base`) */
  seq: number;
  by: string;
  pos: number;
  word: string;
  star: boolean;
}

/** A doubtful word waiting for the others' vote. */
export interface KalimVote {
  by: string;
  /** the word proposed (as shown) */
  word: string;
  pos: number;
  /** the letter laid (the star's chosen letter for a star) */
  key: string;
  star: boolean;
  /** the big dictionary knows it (rare), or nobody's list does */
  inDict: boolean;
  /** the people asked */
  voters: string[];
  yes: string[];
  no: string[];
  endsAt: number;
}

export interface KalimRoundResult {
  /** emptied: someone laid their last card · stuck: nobody could change the word · left: too few players */
  how: 'emptied' | 'stuck' | 'left';
  /** the round's winners (one who emptied their hand, or the fewest cards left) */
  winners: string[];
  /** cards left in each hand at the end */
  left: Record<string, number>;
  gains: Record<string, number>;
}

export interface KalimView {
  game: 'kalim';
  phase: 'play' | 'vote' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  dialect: KalimDialect;
  board: KalimBoard;
  /** the word's changes so far this round, oldest first (the last few) */
  trail: KalimStep[];
  /** changes of the word this round (the base a play must name) */
  seq: number;
  /** my cards (empty for a spectator) */
  hand: KalimCard[];
  /** everyone's number of cards */
  counts: Record<string, number>;
  /** who tapped «ما عندي كلمة» for this word */
  stuck: string[];
  /** I may not lay a card before this (a refused word) */
  lockUntil: number | null;
  vote: KalimVote | null;
  /** play: the round ends at this time if the word doesn't change; reveal: the next round */
  endsAt: number | null;
  timerTotal: number;
  last: KalimMove | null;
  result: KalimRoundResult | null;
  scores: Record<string, number>;
  players: string[];
}

export const KALIM_INFO = {
  title: 'كلم',
  tagline: 'غيّروا الكلمة حرفاً واحداً… والأسرع يفرغ يده أولاً!',
  color: '#D6336C',
  maxPlayers: 6,
  howTo: [
    'في الساحة كلمة من 3 حروف، ولكل لاعب العدد نفسه من بطاقات الحروف. على كل بطاقة حرفان: حرف على كل وجه، والحرف الصغير في الزاوية هو حرف الوجه الآخر.',
    'لا أدوار في «كلم»: الأسرع هو من يلعب. اختر بطاقة (اضغطها مرة ثانية لقلبها)، ثم اضغط الحرف الذي تضعها عليه في الكلمة، لتصير كلمة جديدة: كلم ← قلم ← قسم ← رسم.',
    'بطاقة واحدة في كل مرة، ولا يوضع الحرف على مثله. ويمكن أن تعود كلمة لُعبت من قبل.',
    'بطاقة النجمة تصلح لأي حرف: تختار الحرف عند وضعها، وتبقى ذلك الحرف حتى تُغطّى.',
    'الكلمات المعروفة تُقبل فوراً. والكلمة الغريبة تُعرض على البقية للتصويت: إن قبلوها بقيت، وإلا عادت البطاقة إلى صاحبها وانتظر ثلاث ثوانٍ.',
    'الفائز من يفرغ يده أولاً. وإذا لم يستطع أحد تغيير الكلمة (ضغط الجميع «ما عندي كلمة»، أو مرّت دقيقة بلا تغيير) فالفوز لصاحب أقل البطاقات.',
    'في الإعدادات: كلمات فصحى فقط أو فصحى وعامية، وعدد البطاقات في كل يد (6، 9 أو 12)، وعدد الجولات. لكل بطاقة توضع نقطة، و3 نقاط لمن يفرغ يده أولاً.',
  ],
};
