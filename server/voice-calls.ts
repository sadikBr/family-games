/**
 * «قراءة الأحداث بصوت» — the calls the phones read aloud (the third argument of ctx.say, see Said.voice).
 *
 * Every spoken call of the card games lives here, so the family can fix a pronunciation in one place.
 * The rules:
 * - Only the big moments (a روندا, a دقة, a bid, «الباقي لنا», the winner…), never an ordinary card:
 *   a voice on every move would be noise.
 * - Very short: 1 to 4 words.
 * - The game's own Moroccan words, exactly as the screens show them (دقة، ف جوج، ميسا، شاري، باص…).
 * - Written WITH the vowel marks (التشكيل): the phone's Arabic voice reads Modern Standard Arabic, the
 *   marks make it say the word the Moroccan way («تْرِينْكَا», not «تَرِينْكَا»). A sukun on a first
 *   letter («فْ جُوجْ», «بْلُوطْ») is the Moroccan way of starting a word without a vowel.
 * - Arabic letters, vowel marks and spaces only (no digits, no Latin, no punctuation inside a call).
 * - Never a verb about a player (whether it is a man or a woman is unknown): nouns only
 *   («الفَوْزُ لِبابا», «بَاصْ», «شَارِي»). Player names are read as typed, without vowel marks.
 * Two calls in the same move are joined by `voiceAnd` (a comma: the voice makes a short pause).
 */
import type { Suit } from '../src/shared/cards';
import type { BSuit } from '../src/shared/games/baloot';

export const VOICE = {
  /* روندا */
  ronda: 'رُونْدَا',
  rondatan: 'رُونْدْتَانْ',
  trinka: 'تْرِينْكَا',
  daqa: 'دَقَّة',
  missa: 'مِيسَا',
  daqaMissa: 'دَقَّة وْمِيسَا',
  fJouj: 'فْ جُوجْ',
  fTlata: 'فْ تْلَاتَة',
  /** «المفرّق ياكل القاعة» */
  dealerEats: 'المْفَرَّقْ يَاكُلْ القَاعَة',
  /** the dealer took the table with the king: +5 */
  dealerKing: 'القَاعَة بِالرَّايْ',
  /** the dealer's last card took nothing (or was the ace): +5 to the other side */
  dealerFive: 'خَمْسَة لِلْخْصَمْ',

  /* البلوط (السعودي) */
  bs: 'بَسْ',
  sun: 'صَنْ',
  hokm: 'حُكُمْ',
  ashkal: 'أَشْكَلْ',
  confirm: 'تَثْبِيتْ',
  double: 'دَبَلْ',
  triple: 'ثْرِي',
  four: 'فُورْ',
  gahwa: 'قَهْوَة',
  sira: 'سِرَا',
  fifty: 'خَمْسِينْ',
  hundred: 'مِيَّة',
  four100: 'أَرْبَعْمِيَّة',
  balout: 'بَلُوتْ',
  kaboot: 'كَبُّوتْ',
  khasrana: 'خَسْرَانَة',

  /* البلوط (المغربي) */
  shari: 'شَارِي',
  pass: 'بَاصْ',
  forced: 'الفُورْصْ',
  tierce: 'تِيرْسْ',
  quarte: 'كَارْتْ',
  quinte: 'سَانْكْ',
  carre: 'كَارِي',
  belote: 'بْلُوطْ',
  rebelote: 'رِيبْلُوطْ',
  capot: 'كَابُو',
  dkhal: 'دْخَلْ',
  litige: 'لِيتِيجْ',
  bel: 'البِيلْ',

  /* التوتي */
  sing: 'الغْنَا',
  taghtis: 'تْغْطِيسْ',

  /* every team game */
  claim: 'البَاقِي لْنَا',

  /* الكانزة: the 1 of coins (20 points) taken */
  kanzaAce: 'وَاحَدْ أُورُوصْ',
  /* الكونكان */
  konkan: 'كُونْكَانْ',
  /* الكذّاب */
  kdabLie: 'كَذَّابْ وْكَانَتْ كِذْبَة',
  kdabTruth: 'كَذَّابْ وْكَانْ الصَّحّْ',
  /* أونو فليب */
  uno: 'أُونُو',
  unoCaught: 'بْلَا أُونُو',
  flip: 'قَلْبْ',
  plus5: 'زَايْدْ خَمْسَة',
  plus2: 'زَايْدْ جُوجْ',
  skipAll: 'مَنْعْ الجْمِيعْ',
  wildColor: 'جُوكَرْ اللُّونْ',
  /* الرامي */
  firstLay: 'نْزْلَة',
  rami: 'رَامِي',
  ramiSec: 'رَامِي سِيكْ',
} as const;

/** The Moroccan suits (روندا، التوتي، هزّ 2، البلوط المغربي). */
export const SUIT_VOICE: Record<Suit, string> = {
  coins: 'أُورُوصْ',
  cups: 'الكُوبَاصْ',
  swords: 'شْبَاضَا',
  clubs: 'البَاسْطُوصْ',
};

/** The Saudi Baloot suits (سبيت، هاص، ديمن، شريا). */
export const B_SUIT_VOICE: Record<BSuit, string> = { S: 'سْبِيتْ', H: 'هَاصْ', D: 'دَيْمَنْ', C: 'شِرِيَّا' };
/** The same cards on the Moroccan deck (البلوط المغربي): ♠ شباضا، ♥ الكوباص، ♦ أوروص، ♣ الباسطوص. */
export const B_SUIT_VOICE_MA: Record<BSuit, string> = { S: SUIT_VOICE.swords, H: SUIT_VOICE.cups, D: SUIT_VOICE.coins, C: SUIT_VOICE.clubs };

/** «الطْرُونْفُو الكُوبَاصْ» */
export const voiceTrump = (suitVoice: string) => `الطْرُونْفُو ${suitVoice}`;
/** «حُكُمْ سْبِيتْ» (the second round of the Saudi bidding names the suit) */
export const voiceHokm = (s: BSuit) => `${VOICE.hokm} ${B_SUIT_VOICE[s]}`;

const TENS: Record<number, string> = {
  1: 'عَشْرَة',
  2: 'عِشْرِينْ',
  3: 'تْلَاتِينْ',
  4: 'رْبْعِينْ',
  5: 'خَمْسِينْ',
  6: 'سِتِّينْ',
  7: 'سَبْعِينْ',
  8: 'تْمَانِينْ',
  9: 'تَسْعِينْ',
};
const HUNDREDS: Record<number, string> = { 1: 'مْيَة', 2: 'مِيتِينْ' };

/** A Touti bid (70 … 230, steps of 10) in Moroccan words: «مْيَة وْعِشْرِينْ». */
export function voiceBid(n: number): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  if (!h) return TENS[t] ?? '';
  const hw = HUNDREDS[h] ?? '';
  return t ? `${hw} وْ${TENS[t]}` : hw;
}

/** «هَزّْ جُوجْ» / «هَزّْ رْبْعَة»… — the cards waiting for the next player in هزّ 2 (2, 4, 6, 8). */
const HEZ: Record<number, string> = { 2: 'جُوجْ', 4: 'رْبْعَة', 6: 'سْتَّة', 8: 'تْمْنْيَة' };
export const voiceHez = (pending: number) => `هَزّْ ${HEZ[pending] ?? HEZ[2]}`;

/** «الفَوْزُ لِبابا» — the winner of the game (a team: its players' names joined by و). */
export const voiceWin = (name: string) => `الفَوْزُ لِ${name}`;
/** «الجُولَة لِبابا» — the winner of a round (أونو، هزّ 2). */
export const voiceRound = (name: string) => `الجُولَة لِ${name}`;
/** «اليَدْ لِبابا وماما» — the winner of a hand (التريس). */
export const voiceHand = (name: string) => `اليَدْ لِ${name}`;
/** A team's name for the voice: «بابا وماما». */
export const voiceTeam = (names: string[]) => names.join(' و');

/** Two calls of the same move («دَقَّة، المْفَرَّقْ يَاكُلْ القَاعَة»); empty parts are skipped. */
export const voiceAnd = (...parts: (string | undefined | null | false)[]) => parts.filter(Boolean).join('، ') || undefined;
