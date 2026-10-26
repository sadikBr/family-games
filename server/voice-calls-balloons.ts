/**
 * «قراءة الأحداث بصوت» — the calls of «البالونات» (the third argument of ctx.say, see Said.voice), under the
 * rules of voice-calls.ts / voice-calls-party.ts: short, vowelled Modern Standard Arabic, Arabic letters,
 * vowel marks and spaces only, never a verb about one player, never the secret word before the screens
 * show it.
 *
 * Only the important moments: the category when the guessing starts (for the children who don't read
 * yet), the word once the round is over (found: «أَحْسَنْتُمْ، الكَلِمَةُ …»; the last balloon popped:
 * «هَبَطَتِ السَّلَّةُ، الكَلِمَةُ …»), and the winner at the end (voiceFinal in voice-calls-party).
 */
import type { BalloonsCat } from '../src/shared/games/balloons';
import { voiceAnd, voiceWord } from './voice-calls-party';

/** The categories as the screens show them, vowelled. */
export const BALLOONS_CAT_VOICE: Record<BalloonsCat, string> = {
  animal: 'حَيَوَانٌ',
  fruit: 'فَاكِهَةٌ',
  veg: 'خُضَارٌ',
  country: 'بَلَدٌ',
  city: 'مَدِينَةٌ',
  job: 'مِهْنَةٌ',
  tool: 'أَدَاةٌ',
  sport: 'رِيَاضَةٌ',
  food: 'أَكْلَةٌ',
  house: 'شَيْءٌ فِي البَيْتِ',
  boy: 'اسْمُ وَلَدٍ',
  girl: 'اسْمُ بِنْتٍ',
  color: 'لَوْنٌ',
  body: 'عُضْوٌ مِنَ الجِسْمِ',
  school: 'مِنْ أَدَوَاتِ المَدْرَسَةِ',
};

export const BVOICE = {
  /** the word was found */
  found: 'أَحْسَنْتُمْ',
  /** the last balloon popped: the basket is down */
  landed: 'هَبَطَتِ السَّلَّةُ',
} as const;

/** «الفِئَةُ: حَيَوَانٌ» (the guessing starts). */
export const voiceCategory = (cat: BalloonsCat) => `الفِئَةُ ${BALLOONS_CAT_VOICE[cat]}`;

/** The end of a round: «أَحْسَنْتُمْ، الكَلِمَةُ زرافة» / «هَبَطَتِ السَّلَّةُ، الكَلِمَةُ زرافة». */
export const voiceRoundEnd = (won: boolean, word: string) => voiceAnd(won ? BVOICE.found : BVOICE.landed, voiceWord(word))!;
