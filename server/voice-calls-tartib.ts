/**
 * «قراءة الأحداث بصوت» — the calls of «رتّب الأحداث» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts / voice-calls-party.ts: short, vowelled Modern Standard Arabic, never a verb
 * about one player, never an answer before the screens show it. Only the round's start, the perfect
 * orders at the reveal, and the winner at the end (voiceFinal in voice-calls-party.ts).
 */

/** «لِـ» + a player's name as typed («لِبابا»، «لِلحسن»). */
const li = (name: string) => (name.startsWith('ال') ? `لِ${name.slice(1)}` : `لِ${name}`);

export const TARTIB_VOICE = {
  /** a round starts */
  ask: 'رَتِّبُوا الأَحْدَاثَ مِنَ الأَقْدَمِ إِلَى الأَحْدَثِ',
  /** nobody had the whole order right */
  noPerfect: 'لَا تَرْتِيبَ كَامِلًا فِي هَذِهِ الجَوْلَةِ',
} as const;

/** «تَرْتِيبٌ كَامِلٌ لِبابا» (several names joined by « و») */
export const voicePerfect = (names: string) => `تَرْتِيبٌ كَامِلٌ ${li(names)}`;
