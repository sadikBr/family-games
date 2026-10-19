/**
 * «قراءة الأحداث بصوت» — the calls of the quiz and party games (the third argument of ctx.say, see
 * Said.voice). The card games' calls and their rules are in voice-calls.ts; the same rules hold here:
 * - Only the moments a family would call out at the table (a new round, «خطأ», «بُووم», a vote result,
 *   the winner…), never every move.
 * - Short calls: 1 to 5 words, Arabic letters, vowel marks and spaces (two calls are joined by `voiceAnd`).
 *   Ordinary Modern Standard Arabic, vowelled where a word could be read two ways; the game's own jargon
 *   («سْتُوبْ»، «بُووم») fully vowelled.
 * - Never a verb about one player (a man or a woman?): nouns («الفَوْزُ لِبابا»، «مِنْ نَصِيبِ ماما»);
 *   a plural imperative to everyone is fine («أَغْمِضُوا أَعْيُنَكُمْ»).
 * - Never hidden information: no secret word, role, location or answer before the screens show it.
 * - The quiz family is the exception to «short»: the voice reads the question at the start of each round
 *   (for the children and the grandparents), with the options when they are short, then the answer at
 *   the reveal («الجَوَابُ: …»). Quran text is never read by the synthetic voice: a verse question is
 *   asked in plain words («مِنْ أَيِّ سُورَةٍ هَذِهِ الآيَةُ؟»).
 * A call that has no line of its own on the screens rides on `voiceOnly` (an empty text: heard, not shown).
 */
import type { GameCtx } from './types';
import { voiceAnd } from './voice-calls';

export { voiceAnd };

export const PVOICE = {
  /* everywhere */
  timeUp: 'انْتَهَى الوَقْتُ',
  tie: 'تَعَادُلٌ',
  right: 'صَحِيحٌ',
  wrong: 'خَطَأٌ',
  pass: 'تَجَاوُزٌ',
  go: 'انْطَلِقُوا',
  vote: 'وَقْتُ التَّصْوِيتِ',
  clues: 'وَقْتُ التَّلْمِيحَاتِ',

  /* الذئب: the narrator's calls (a role's step only, never who holds it) */
  night: 'اللَّيْلُ، أَغْمِضُوا أَعْيُنَكُمْ',
  wolves: 'الذِّئَابُ، افْتَحُوا أَعْيُنَكُمْ',
  whitewolf: 'دَوْرُ الذِّئْبِ الأَبْيَضِ',
  guard: 'دَوْرُ الحَارِسِ',
  doctor: 'دَوْرُ الطَّبِيبِ',
  seer: 'دَوْرُ العَرَّافَةِ',
  witch: 'دَوْرُ السَّاحِرَةِ',
  morning: 'الصَّبَاحُ',
  noDeath: 'لَمْ يَمُتْ أَحَدٌ',
  noOut: 'لَا إِقْصَاءَ',
  winWolves: 'الفَوْزُ لِلذِّئَابِ',
  winVillage: 'الفَوْزُ لِلْقَرْيَةِ',
  winTanner: 'الفَوْزُ لِلْمَجْنُونِ',
  winWhite: 'الفَوْزُ لِلذِّئْبِ الأَبْيَضِ',

  /* الدخيل / الجاسوس */
  imposterCaught: 'انْكِشَافُ الدَّخِيلِ',
  notImposter: 'لَيْسَ الدَّخِيلَ',
  winImposter: 'الفَوْزُ لِلدَّخِيلِ',
  winCivilians: 'الفَوْزُ لِلْمُوَاطِنِينَ',
  voteTie: 'تَعَادُلُ الأَصْوَاتِ',
  guessRight: 'تَخْمِينٌ صَحِيحٌ',
  guessWrong: 'تَخْمِينٌ خَاطِئٌ',
  accuse: 'اتِّهَامٌ',
  accuseFailed: 'فَشِلَ الاتِّهَامُ',
  spyCaught: 'انْكِشَافُ الجَاسُوسِ',
  notSpy: 'لَيْسَ الجَاسُوسَ',
  winSpy: 'الفَوْزُ لِلْجَاسُوسِ',

  /* اسم ولد اسم بنت */
  stop: 'سْتُوبْ',
  pensUp: 'ارْفَعُوا الأَقْلَامَ',
  /* البطاطا الحارة */
  potatoOn: 'اشْتَعَلَتِ البَطَاطَا',
  boom: 'بُووم',
  /* حروف / ماذا قال الناس؟ */
  steal: 'فُرْصَةُ السَّرِقَةِ',
  stolen: 'سَرِقَةٌ نَاجِحَةٌ',
  fullPath: 'طَرِيقٌ كَامِلٌ',
  /* الأسماء الرمزية */
  assassin: 'الكَلِمَةُ السَّوْدَاءُ',
  noLimit: 'بِلَا حَدٍّ',
  /* المحرّم */
  taboo: 'كَلِمَةٌ مَمْنُوعَةٌ',
  /* الرسم */
  guessIt: 'خَمِّنُوا',
  /* الموجة */
  bullseye: 'إِصَابَةٌ',
  nobodyClose: 'لَمْ يَقْتَرِبْ أَحَدٌ',
  /* الرسم المتسلسل */
  write: 'اخْتِيَارُ الجُمَلِ',
  draw: 'وَقْتُ الرَّسْمِ',
  guess: 'وَقْتُ التَّخْمِينِ',
  reveal: 'وَقْتُ الكَشْفِ',
  /* ابنِ المسجد / قصص الأنبياء */
  mosqueDone: 'اكْتَمَلَ المَسْجِدُ',
  mosqueNot: 'انْتَهَتِ الجَوْلَاتُ',
  storyDone: 'اكْتَمَلَتِ القِصَّةُ',
  storyNot: 'انْطَفَأَتِ الفَوَانِيسُ',
  /* أسماء الله الحسنى (الذاكرة) */
  pair: 'زَوْجٌ',
} as const;

/** The two teams of حروف, ماذا قال الناس؟, المحرّم, التمثيل الصامت, الأسماء الرمزية. */
export const TEAM_VOICE = {
  red: 'لِلْفَرِيقِ الأَحْمَرِ',
  green: 'لِلْفَرِيقِ الأَخْضَرِ',
  blue: 'لِلْفَرِيقِ الأَزْرَقِ',
} as const;
export type VoiceTeam = keyof typeof TEAM_VOICE;

/** «الفَوْزُ لِلْفَرِيقِ الأَحْمَرِ» */
export const voiceTeamWin = (t: VoiceTeam) => `الفَوْزُ ${TEAM_VOICE[t]}`;
/** The end of a red / blue game by points: the winner team, or «تَعَادُلٌ». */
export const voiceTeamsFinal = ([red, blue]: [number, number]) => (red === blue ? PVOICE.tie : voiceTeamWin(red > blue ? 'red' : 'blue'));
/** «الحَرْفُ لِلْفَرِيقِ الأَحْمَرِ» (حروف) */
export const voiceCell = (t: VoiceTeam) => `الحَرْفُ ${TEAM_VOICE[t]}`;
/** «الجَوْلَةُ لِلْفَرِيقِ الأَزْرَقِ» (ماذا قال الناس؟) */
export const voiceTeamRound = (t: VoiceTeam) => `الجَوْلَةُ ${TEAM_VOICE[t]}`;

/** «لِـ» + a player's name as typed («لِبابا»، «لِلحسن»). */
const li = (name: string) => (name.startsWith('ال') ? `لِ${name.slice(1)}` : `لِ${name}`);
/** «الفَوْزُ لِبابا» */
export const voiceWinner = (name: string) => `الفَوْزُ ${li(name)}`;
/** «الجَوْلَةُ لِبابا» (the best of a round) */
export const voiceRoundTo = (name: string) => `الجَوْلَةُ ${li(name)}`;
/** «التَّخْمِينُ لِبابا» (كلمة واحدة: whose turn to guess) */
export const voiceGuesser = (name: string) => `التَّخْمِينُ ${li(name)}`;
/** «أَقْرَبُ تَخْمِينٍ لِبابا» (الموجة) */
export const voiceClosest = (name: string) => `أَقْرَبُ تَخْمِينٍ ${li(name)}`;
/** «مِنْ نَصِيبِ بابا» (البطاطا: who got burnt) */
export const voiceBurnt = (name: string) => `مِنْ نَصِيبِ ${name}`;
/** «إِقْصَاءُ بابا» (الذئب: the village's vote) */
export const voiceOut = (name: string) => `إِقْصَاءُ ${name}`;
/** «الضَّحِيَّةُ بابا» / «الضَّحَايَا بابا وماما» (الذئب: the night's dead) */
export const voiceDead = (names: string[]) => `${names.length > 1 ? 'الضَّحَايَا' : 'الضَّحِيَّةُ'} ${names.join(' و')}`;
/** «طَلْقَةُ الصَّيَّادِ بابا» (الذئب: the hunter takes someone along — public once it happens) */
export const voiceHunter = (name: string) => `طَلْقَةُ الصَّيَّادِ ${name}`;
/** «العُمْدَةُ بابا» (الذئب) */
export const voiceMayor = (name: string) => `العُمْدَةُ ${name}`;
/** «دَفْتَرُ بابا» (الرسم المتسلسل: the book being revealed) */
export const voiceBook = (name: string) => `دَفْتَرُ ${name}`;
/** «أَفْضَلُ رَسْمَةٍ لِبابا» / «أَطْرَفُ تَخْمِينٍ لِماما» */
export const voiceBestDraw = (name: string) => `أَفْضَلُ رَسْمَةٍ ${li(name)}`;
export const voiceBestGuess = (name: string) => `أَطْرَفُ تَخْمِينٍ ${li(name)}`;
/** «اكْتَمَلَ بِنَاءُ المحراب» (ابنِ المسجد: a piece just finished) */
export const voiceBuilt = (piece: string) => `اكْتَمَلَ بِنَاءُ ${piece}`;
/** «الكَلِمَةُ قطار» (a word everyone may now see: الرسم's reveal) */
export const voiceWord = (word: string) => `الكَلِمَةُ ${word}`;
/** «التَّلْمِيحُ بحر» (a clue given aloud on the screens: الموجة) */
export const voiceClue = (clue: string) => `التَّلْمِيحُ ${clue}`;

/** The letters of the Arabic alphabet by name («حَرْفُ البَاء»). */
export const LETTER_VOICE: Record<string, string> = {
  ا: 'الأَلِف',
  أ: 'الأَلِف',
  إ: 'الأَلِف',
  آ: 'الأَلِف',
  ب: 'البَاء',
  ت: 'التَّاء',
  ث: 'الثَّاء',
  ج: 'الجِيم',
  ح: 'الحَاء',
  خ: 'الخَاء',
  د: 'الدَّال',
  ذ: 'الذَّال',
  ر: 'الرَّاء',
  ز: 'الزَّاي',
  س: 'السِّين',
  ش: 'الشِّين',
  ص: 'الصَّاد',
  ض: 'الضَّاد',
  ط: 'الطَّاء',
  ظ: 'الظَّاء',
  ع: 'العَيْن',
  غ: 'الغَيْن',
  ف: 'الفَاء',
  ق: 'القَاف',
  ك: 'الكَاف',
  ل: 'اللَّام',
  م: 'المِيم',
  ن: 'النُّون',
  ه: 'الهَاء',
  و: 'الوَاو',
  ي: 'اليَاء',
  ء: 'الهَمْزَة',
};
/** «حَرْفُ البَاء» */
export const voiceLetter = (l: string) => `حَرْفُ ${LETTER_VOICE[l] ?? l}`;

/** 1–9 in words (الأسماء الرمزية: the clue's number). */
const NUM_VOICE = ['', 'وَاحِد', 'اثْنَان', 'ثَلَاثَة', 'أَرْبَعَة', 'خَمْسَة', 'سِتَّة', 'سَبْعَة', 'ثَمَانِيَة', 'تِسْعَة'];
/** «بحر، ثَلَاثَة» — a codenames clue as the screens show it (0 = no limit). */
export const voiceCodeClue = (word: string, n: number) => voiceAnd(word, n === 0 ? PVOICE.noLimit : (NUM_VOICE[n] ?? ''))!;

/* —— the quiz family ———————————————————————————————————————————————————————————— */

/** Options are read with the question only when they are short (a list of long meanings is not pleasant). */
const shortOptions = (options: string[]) => options.length >= 2 && options.every((o) => o.length <= 30) && options.join('').length <= 100;

/** «ما عاصمة المغرب؟ الرباط، فاس، مراكش، أَمْ طنجة؟» */
export function voiceQuestion(question: string, options: string[] = []): string {
  const q = question.trim();
  if (!shortOptions(options)) return q;
  return `${q} ${options.slice(0, -1).join('، ')}، أَمْ ${options[options.length - 1]}؟`;
}

/** «الجَوَابُ: الرباط» */
export const voiceAnswer = (answer: string) => `الجَوَابُ: ${answer}`;

/** The quiz questions that show Quran text are asked in plain words (the voice never reads a verse). */
export const ASK = {
  surah: 'مِنْ أَيِّ سُورَةٍ هَذِهِ الآيَةُ؟',
  qquote: 'مَنْ قَائِلُ هَذِهِ الكَلِمَاتِ؟',
  tajweed: 'مَا حُكْمُ التَّجْوِيدِ فِي الكَلِمَةِ المُلَوَّنَةِ؟',
  /** أسماء الله الحسنى */
  meaning: (name: string) => `مَا مَعْنَى ${name}؟`,
  name: (meaning: string) => `مَا الاسْمُ الَّذِي مَعْنَاهُ: ${meaning}؟`,
  /** رتّب الخطوات */
  steps: (title: string) => `رَتِّبُوا: ${title}`,
  /** أين المكان؟ */
  where: (place: string) => `أَيْنَ ${place}؟`,
};

/** «التَّرْتِيبُ: الأول، الثاني، …» (رتّب الخطوات: the right order at the reveal) */
export const voiceOrder = (steps: string[]) => `التَّرْتِيبُ: ${steps.join('، ')}`;
/** A rating title («علامة كاملة!») without its punctuation. */
export const voicePlain = (text: string) => text.replace(/[^ء-يً-ْ ]/g, '').replace(/\s+/g, ' ').trim();

/* —— helpers —————————————————————————————————————————————————————————————————— */

/** A call with no line of its own on the screens (the turn bar shows nothing for an empty text). */
export function voiceOnly(ctx: GameCtx, voice: string | undefined) {
  if (voice) ctx.say?.('', undefined, voice);
}

/** The game's winner by score: «الفَوْزُ لِبابا», or «تَعَادُلٌ» when the top score is shared. */
export function voiceFinal(ctx: GameCtx, ids: string[], score: (id: string) => number): string {
  if (!ids.length) return PVOICE.tie;
  const best = Math.max(...ids.map(score));
  const top = ids.filter((id) => score(id) === best);
  return top.length === 1 ? voiceWinner(ctx.playerName(top[0])) : PVOICE.tie;
}
