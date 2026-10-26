/**
 * «قراءة الأحداث بصوت» — the calls of «الممالك الخمس» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts: short, vowelled Modern Standard Arabic, Arabic letters, vowel marks and
 * spaces only, never a verb about a player (nouns: «الخُرُوجُ لِبابا»).
 *
 * Only the big moments: the new wild of each round, a player going out, the winner (voiceWin).
 */

/** The ranks read out, vowelled (11 = J «الوَلَدُ», 12 = Q, 13 = K). */
export const REALMS_RANK_VOICE: Record<number, string> = {
  3: 'الثَّلَاثَةُ',
  4: 'الأَرْبَعَةُ',
  5: 'الخَمْسَةُ',
  6: 'السِّتَّةُ',
  7: 'السَّبْعَةُ',
  8: 'الثَّمَانِيَةُ',
  9: 'التِّسْعَةُ',
  10: 'العَشَرَةُ',
  11: 'الوَلَدُ',
  12: 'المَلِكَةُ',
  13: 'المَلِكُ',
};

/** «جُوكِرُ الجَوْلَةِ الخَمْسَةُ» at the deal of a round. */
export const voiceRealmsWild = (rank: number) => `جُوكِرُ الجَوْلَةِ ${REALMS_RANK_VOICE[rank] ?? ''}`.trim();

/** «الخُرُوجُ لِبابا» when a player lays everything down. */
export const voiceRealmsOut = (name: string) => `الخُرُوجُ لِ${name}`;
