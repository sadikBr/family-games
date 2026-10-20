/**
 * «قراءة الأحداث بصوت» — the calls of «قصة جماعية» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts / voice-calls-party.ts: short, vowelled Modern Standard Arabic, Arabic
 * letters, vowel marks and spaces only, never a verb about one player (nouns: «قِصَّةُ بابا»).
 *
 * The stories themselves are NOT read through these calls: the reveal screen reads each sentence with
 * the phone's voice («اقرأ القصة بصوت» on that screen), so the server says nothing aloud during the
 * reveal — two voices would cut each other off.
 */

export const SVOICE = {
  start: 'بِدَايَةُ القِصَصِ',
  reveal: 'وَقْتُ قِرَاءَةِ القِصَصِ',
  vote: 'التَّصْوِيتُ لِأَجْمَلِ قِصَّةٍ',
  tie: 'تَعَادُلُ القِصَصِ',
  none: 'لَا أَصْوَاتَ',
} as const;

/** «أَجْمَلُ قِصَّةٍ، قِصَّةُ بابا» (the vote's winner, named after the player who started it). */
export const voiceBestStory = (owner: string) => `أَجْمَلُ قِصَّةٍ، قِصَّةُ ${owner}`;
