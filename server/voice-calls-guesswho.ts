/**
 * «قراءة الأحداث بصوت» — the calls of «خمّن من؟» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts / voice-calls-party.ts: short, vowelled Modern Standard Arabic, Arabic
 * letters, vowel marks and spaces only, never a verb about a player (nouns: «الجَوْلَةُ لِبابا»).
 *
 * Only the moments worth hearing: a guess (right or wrong), the round and the match. Never every
 * question: the screens show them, and a voice on each one would be noise.
 */
import { voiceAnd } from './voice-calls';
import { voiceRoundTo, voiceWinner } from './voice-calls-party';

export { voiceAnd, voiceRoundTo, voiceWinner };

export const GV = {
  right: 'تَخْمِينٌ صَحِيحٌ',
  wrong: 'تَخْمِينٌ خَاطِئٌ',
  resign: 'انْسِحَابٌ',
} as const;
