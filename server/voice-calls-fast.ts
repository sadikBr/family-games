/**
 * «قراءة الأحداث بصوت» — the calls of «الأسرع» (the third argument of ctx.say, see Said.voice), under the
 * rules of voice-calls.ts / voice-calls-party.ts: short, vowelled Modern Standard Arabic, Arabic letters,
 * vowel marks and spaces only, never a verb about one player (nouns: «الأَسْرَعُ بابا»), never an answer
 * before the screens show it.
 *
 * The voice names each mini-game while its instruction is on the screens (for the children who don't
 * read yet), names the fastest at the reveal, and the winner at the end (voiceFinal in voice-calls-party).
 */
import type { FastKind } from '../src/shared/games/fast';

/** The mini-games' names as the screens show them, vowelled. */
export const FAST_VOICE: Record<FastKind, string> = {
  green: 'اضْغَطْ عِنْدَ الأَخْضَرِ',
  odd: 'أَيُّ شَكْلٍ مُخْتَلِفٌ',
  stars: 'عُدَّ النُّجُومَ',
  stroop: 'اللَّوْنُ وَالكَلِمَةُ',
  biggest: 'الأَكْبَرُ',
  arrow: 'اتَّبِعِ السَّهْمَ',
  match: 'الصُّورَةُ المُطَابِقَةُ',
  sum: 'حِسَابٌ سَرِيعٌ',
  order: 'اضْغَطْ بِالتَّرْتِيبِ',
};

/** «الأَسْرَعُ بابا» (the reveal of a round). */
export const voiceFastest = (name: string) => `الأَسْرَعُ ${name}`;

/** Nobody had the right answer this round. */
export const FAST_NONE = 'لَا إِجَابَةَ صَحِيحَةً';
