/**
 * «قراءة الأحداث بصوت» — the calls of «من الفاعل؟» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts / voice-calls-boards.ts: short, vowelled Modern Standard Arabic, Arabic
 * letters, vowel marks, spaces and the joining comma only, never a verb about a player (nouns:
 * «الفَوْزُ لِبابا»), never hidden information (which card was shown, the secret file before the end).
 *
 * Only the big moments: the mystery at the start, a suggestion nobody could disprove, a final
 * accusation (right or wrong), and a game left unsolved. Never a call per suggestion or per card.
 */
import { voiceAnd, voiceWinner } from './voice-calls-boards';

export { voiceAnd, voiceWinner };

export const CLUE_VOICE = {
  /** nobody could disprove the suggestion */
  nobody: 'لَا أَحَدَ يَنْفِي',
  right: 'اتِّهَامٌ صَحِيحٌ',
  wrong: 'اتِّهَامٌ خَاطِئٌ',
  /** everyone is out of the guessing */
  unsolved: 'اللُّغْزُ بِلَا حَلٍّ',
} as const;

/** The mysteries (CLUE_MYSTERIES), read at the start of a game. */
export const CLUE_MYSTERY_VOICE = ['مَنْ أَكَلَ كَعْبَ الغَزَالِ', 'مَنْ أَخَذَ حَلْوَى العِيدِ', 'مَنْ أَكَلَ الشَّبَّاكِيَّةَ', 'مَنْ أَخَذَ صَحْنَ البَغْرِيرِ'];

/** A right accusation: «اتِّهَامٌ صَحِيحٌ، الفَوْزُ لِبابا». */
export const voiceSolvedBy = (name: string) => voiceAnd(CLUE_VOICE.right, voiceWinner(name))!;
