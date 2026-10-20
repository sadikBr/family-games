/**
 * «قراءة الأحداث بصوت» — the calls of «كم تقدّر؟», «صح أم خطأ» and «الأعلام والعواصم» (the third argument of
 * ctx.say, see Said.voice), under the rules of voice-calls.ts / voice-calls-party.ts: short, vowelled
 * Modern Standard Arabic, Arabic letters, vowel marks and spaces only, never a verb about one player
 * (nouns: «الأَقْرَبُ بابا»), never an answer before the screens show it.
 *
 * Only the moments that matter: the round's best (the closest guess, the fastest right answer) at the
 * reveal, and the winner at the end (voiceFinal in voice-calls-party.ts).
 */

/** «لِـ» + a player's name as typed («لِبابا»، «لِلحسن»). */
const li = (name: string) => (name.startsWith('ال') ? `لِ${name.slice(1)}` : `لِ${name}`);

export const KNOW_VOICE = {
  /** nobody sent a guess (كم تقدّر؟) */
  noGuess: 'لَا تَقْدِيرَاتٍ',
  /** nobody had the right answer (صح أم خطأ، الأعلام والعواصم) */
  noRight: 'لَا إِجَابَةَ صَحِيحَةً',
} as const;

/** «الأَقْرَبُ بابا» (كم تقدّر؟: the closest guess; several names joined by « و») */
export const voiceClosestTo = (names: string) => `الأَقْرَبُ ${names}`;

/** «إِصَابَةٌ تَامَّةٌ لِبابا» (كم تقدّر؟: the exact number) */
export const voiceExact = (names: string) => `إِصَابَةٌ تَامَّةٌ ${li(names)}`;

/** «أَسْرَعُ إِجَابَةٍ صَحِيحَةٍ لِبابا» (صح أم خطأ، الأعلام والعواصم) */
export const voiceFastestRight = (names: string) => `أَسْرَعُ إِجَابَةٍ صَحِيحَةٍ ${li(names)}`;
