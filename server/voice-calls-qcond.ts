/**
 * «قراءة الأحداث بصوت» — the calls of «سؤال وشرط» (the third argument of ctx.say, see Said.voice), under the
 * rules of voice-calls.ts / voice-calls-party.ts: vowelled Modern Standard Arabic, Arabic letters, vowel marks
 * and spaces only (two calls joined by voiceAnd), never a verb about one player.
 *
 * Like the quiz family, the voice reads the two cards at the start of each round (for the children and the
 * grandparents): «مَدِينَةٌ، تَبْدَأُ بِحَرْفِ الجِيمِ». Then the round's winner («الجَوْلَةُ لِماما», voiceRoundTo),
 * «انْتَهَى الوَقْتُ» or «تَجَاوُزٌ», and the game's winner at the end (voiceFinal).
 */
import type { QcondCat, QcondCond } from '../src/shared/games/qcond';
import { LETTER_VOICE, voiceAnd } from './voice-calls-party';

/** The question cards as the screens show them, vowelled. */
export const QCOND_CAT_VOICE: Record<QcondCat, string> = {
  boy: 'اسْمُ وَلَدٍ',
  girl: 'اسْمُ بِنْتٍ',
  animal: 'حَيَوَانٌ',
  fruit: 'فَاكِهَةٌ',
  veg: 'خُضَارٌ',
  color: 'لَوْنٌ',
  body: 'عُضْوٌ مِنَ الجِسْمِ',
  job: 'مِهْنَةٌ',
  sport: 'رِيَاضَةٌ',
  school: 'مِنْ أَدَوَاتِ المَدْرَسَةِ',
  country: 'دَوْلَةٌ',
  city: 'مَدِينَةٌ',
  mcity: 'مَدِينَةٌ مَغْرِبِيَّةٌ',
  house: 'شَيْءٌ فِي البَيْتِ',
  food: 'أَكْلَةٌ',
};

/** 3–10 after «مِنْ» (genitive): «مِنْ أَرْبَعَةِ حُرُوفٍ». */
const NUM_GEN: Record<number, string> = {
  3: 'ثَلَاثَةِ',
  4: 'أَرْبَعَةِ',
  5: 'خَمْسَةِ',
  6: 'سِتَّةِ',
  7: 'سَبْعَةِ',
  8: 'ثَمَانِيَةِ',
  9: 'تِسْعَةِ',
  10: 'عَشَرَةِ',
};

/** The condition card, vowelled: «تَبْدَأُ بِحَرْفِ الجِيم». */
export function voiceCond(c: QcondCond): string {
  const name = LETTER_VOICE[c.letter ?? ''] ?? '';
  switch (c.kind) {
    case 'start':
      return `تَبْدَأُ بِحَرْفِ ${name}`;
    case 'end':
      if (c.letter === 'ه') return 'تَنْتَهِي بِالتَّاءِ المَرْبُوطَةِ أَوِ الهَاءِ';
      if (c.letter === 'ا') return 'تَنْتَهِي بِالأَلِفِ';
      return `تَنْتَهِي بِحَرْفِ ${name}`;
    case 'has':
      return `فِيهَا حَرْفُ ${name}`;
    case 'len':
      return `مِنْ ${NUM_GEN[c.n ?? 0] ?? ''} حُرُوفٍ`;
    case 'min':
      return `مِنْ ${NUM_GEN[c.n ?? 0] ?? ''} حُرُوفٍ أَوْ أَكْثَرَ`;
    case 'noAlif':
      return 'لَيْسَ فِيهَا حَرْفُ الأَلِفِ';
  }
}

/** The two cards of a round: «مَدِينَةٌ، تَبْدَأُ بِحَرْفِ الجِيم». */
export const voiceCards = (cat: QcondCat, cond: QcondCond) => voiceAnd(QCOND_CAT_VOICE[cat], voiceCond(cond))!;

/** The others refused a word the lists don't know. */
export const QCOND_REFUSED = 'رُفِضَ الجَوَابُ';
