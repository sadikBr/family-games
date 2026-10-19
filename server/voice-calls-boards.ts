/**
 * «قراءة الأحداث بصوت» — the calls of the board, dice and word games (the third argument of ctx.say,
 * see Said.voice). The card games' calls live in voice-calls.ts; same rules here:
 * - Only the moments a family would call out at the table (كش ملك, إصابة, ستة, اللص, the winner…),
 *   never an ordinary move: a voice on every move would be noise.
 * - Very short: 1 to 5 words.
 * - Game words WITH the vowel marks (التشكيل), so the phone's Arabic voice says them right
 *   («كِشْ مَلِكْ», «سُلَّمْ»). Plain Modern Standard Arabic (the numbers of points) only needs marks
 *   where a word could be misread.
 * - Arabic letters, vowel marks and spaces only (no digits, no Latin); two calls of the same move are
 *   joined by `voiceAnd` (a comma: the voice makes a short pause).
 * - Never a verb about a player (whether it is a man or a woman is unknown): nouns only
 *   («الفَوْزُ لِبابا», «حَلٌّ لِماما»). Player names are read as typed, without vowel marks.
 * - Never hidden information: a secret word or code, the letters someone found, a fleet's position.
 */
import { voiceAnd, voiceRound, voiceWin } from './voice-calls';

export { voiceAnd };

export const VB = {
  /* every game */
  draw: 'تَعَادُلْ',
  resign: 'انْسِحَابْ',
  surrender: 'اسْتِسْلَامْ',
  extraTurn: 'دَوْرٌ إِضَافِيّْ',

  /* الشطرنج */
  check: 'كِشْ مَلِكْ',
  mate: 'كِشْ مَاتْ',
  promotion: 'تَرْقِيَة',
  queenTaken: 'أَكْلُ الوَزِيرْ',

  /* الضامة، الخربڨة: a move that takes several pieces, a man crowned */
  capture2: 'أَكْلٌ مُزْدَوِجْ',
  captureBig: 'أَكْلٌ كَبِيرْ',
  crowned: 'مَلِكٌ جَدِيدْ',

  /* أربعة في خط، XO */
  fourInRow: 'أَرْبَعَةٌ فِي صَفّْ',
  fullLine: 'خَطٌّ كَامِلْ',

  /* المنقلة */
  capture: 'أَكْلْ',

  /* النقاط والمربعات: two boxes with one line */
  twoBoxes: 'مُرَبَّعَانْ',

  /* معركة السفن */
  hit: 'إِصَابَة',
  sunk: 'غَرَقْ',

  /* البلوكات: every piece placed */
  allPieces: 'كُلُّ القِطَعْ',

  /* لودو */
  six: 'سِتَّة',
  home: 'وُصُولْ',
  turnLost: 'ضَاعَ الدَّوْرْ',

  /* السلم والثعبان (سلّم الحسنات) */
  ladder: 'سُلَّمْ',
  snake: 'ثُعْبَانْ',

  /* العقارات */
  buy: 'شِرَاءْ',
  jail: 'إِلَى السِّجْنْ',
  jailOut: 'خُرُوجٌ مِنَ السِّجْنْ',
  bankrupt: 'إِفْلَاسْ',
  hotel: 'فُنْدُقْ',
  auction: 'مَزَادْ',
  doubles: 'زَوْجْ',
  deal: 'صَفْقَة',

  /* المستوطنون */
  robber: 'اللِّصّْ',
  longest: 'أَطْوَلُ طَرِيقْ',
  army: 'أَكْبَرُ جَيْشْ',
  knight: 'فَارِسْ',

  /* المدن والطرق */
  city: 'مَدِينَةٌ كَامِلَة',
  road: 'طَرِيقٌ كَامِلْ',
  monastery: 'دَيْرٌ كَامِلْ',

  /* سكرابل (plain words, read with the points: no marks needed, and the call stays short) */
  bingo: 'سبعة أحرف',
  bigWord: 'كلمة كبيرة',

  /* كلمة السر */
  lastTry: 'المُحَاوَلَةُ الأَخِيرَة',

  /* الذاكرة */
  pair: 'زَوْجْ',
} as const;

/** «لِلحسن», not «لِالحسن»: the voice helpers put «لِ» before the name. */
const forName = (name: string) => (name.startsWith('ال') ? name.slice(1) : name);

/** «الفَوْزُ لِبابا». */
export const voiceWinner = (name: string) => voiceWin(forName(name));
/** The end of a game: «الفَوْزُ لِبابا», or «تَعَادُلْ» when nobody won alone. */
export const voiceResult = (name: string | null | undefined) => (name ? voiceWinner(name) : VB.draw);
/** «الجُولَة لِبابا» (بوغل، فك الشيفرة). */
export const roundWin = (name: string) => voiceRound(forName(name));
/** «أَوَّلُ حَلٍّ لِبابا» / «حَلٌّ لِماما» (كلمة السر، فك الشيفرة) — never the answer itself. */
export const voiceSolved = (name: string, first: boolean) => `${first ? 'أَوَّلُ حَلٍّ' : 'حَلٌّ'} لِ${forName(name)}`;
/** «المُحَاوَلَةُ الأَخِيرَةُ لِبابا». */
export const voiceLastTry = (name: string) => `المُحَاوَلَةُ الأَخِيرَةُ لِ${forName(name)}`;

const PLACES = ['الأَوَّلُ', 'الثَّانِي', 'الثَّالِثُ', 'الرَّابِعُ'];
/** «المَرْكَزُ الثَّانِي لِماما» (سودوكو: who finished, in order); nothing after the 4th. */
export const voicePlace = (place: number, name: string) => (PLACES[place] ? `المَرْكَزُ ${PLACES[place]} لِ${forName(name)}` : undefined);

const DICE = ['', 'وَاحِدْ', 'اثْنَانْ', 'ثَلَاثَة', 'أَرْبَعَة', 'خَمْسَة', 'سِتَّة', 'سَبْعَة', 'ثَمَانِيَة', 'تِسْعَة', 'عَشَرَة', 'أَحَدَ عَشَرْ', 'اثْنَا عَشَرْ'];
/** A roll (1 … 12) in words: «ثَمَانِيَة». */
export const voiceDice = (n: number) => DICE[n] ?? '';

/** سكرابل: a word worth this many points or more is «a big word» (read aloud with its points). */
export const BIG_WORD = 30;

/* Points in words, with the counted noun: «ثلاث وثمانون نقطة» (plain MSA: no marks needed). */
const UNITS = ['', 'إحدى', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع'];
const SMALL = ['', 'نقطة واحدة', 'نقطتان', 'ثلاث نقاط', 'أربع نقاط', 'خمس نقاط', 'ست نقاط', 'سبع نقاط', 'ثماني نقاط', 'تسع نقاط', 'عشر نقاط'];
const TEENS = ['', 'إحدى', 'اثنتا', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

/** 1 … 999 points in words: «نقطتان», «خمس عشرة نقطة», «مئة واثنتان وأربعون نقطة». */
export function voicePoints(n: number): string {
  n = Math.max(0, Math.min(999, Math.round(n)));
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = (k: number): string => {
    if (k <= 10) return SMALL[k];
    if (k < 20) return `${TEENS[k - 10]} عشرة نقطة`;
    const u = k % 10;
    return `${u ? `${UNITS[u]} و` : ''}${TENS[Math.floor(k / 10)]} نقطة`;
  };
  if (!h) return r ? rest(r) : 'صفر';
  if (!r) return h === 2 ? 'مئتا نقطة' : `${HUNDREDS[h]} نقطة`;
  return `${HUNDREDS[h]} و${rest(r)}`;
}

/** رحلة الحج: the stations as the voice should say them (keyed by the station's title). */
export const HAJJ_STATION_VOICE: Record<string, string> = {
  'الميقات': 'المِيقَاتْ',
  'طواف القدوم': 'طَوَافُ القُدُومْ',
  'السعي': 'السَّعْيْ',
  'منى': 'مِنًى',
  'عرفات': 'عَرَفَاتْ',
  'مزدلفة': 'مُزْدَلِفَة',
  'جمرة العقبة': 'جَمْرَةُ العَقَبَة',
  'النحر والحلق': 'النَّحْرُ وَالحَلْقْ',
  'طواف الإفاضة': 'طَوَافُ الإِفَاضَة',
  'أيام التشريق': 'أَيَّامُ التَّشْرِيقْ',
  'طواف الوداع': 'طَوَافُ الوَدَاعْ',
};
