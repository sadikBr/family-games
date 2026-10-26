/**
 * «قراءة الأحداث بصوت» — the calls of «المثلثات» (the third argument of ctx.say, see Said.voice), under the
 * rules of voice-calls-boards.ts: short, vowelled Modern Standard Arabic, Arabic letters, vowel marks and
 * spaces only, never a verb about a player (nouns: «الفَوْزُ لِبابا»).
 *
 * Only the moments worth hearing at the table: one band completing two or more triangles at once, and
 * the end of the game (the winner, or a tie). Never a call per band.
 */
import { VB, voiceAnd, voiceResult } from './voice-calls-boards';

export { VB, voiceAnd, voiceResult };

/** One band completing several triangles at once: «مُثَلَّثَانِ», «ثَلَاثَةُ مُثَلَّثَاتٍ»…; nothing for one. */
export function voiceTriangles(k: number): string | false {
  if (k < 2) return false;
  if (k === 2) return 'مُثَلَّثَانِ';
  if (k === 3) return 'ثَلَاثَةُ مُثَلَّثَاتٍ';
  if (k === 4) return 'أَرْبَعَةُ مُثَلَّثَاتٍ';
  return 'مُثَلَّثَاتٌ كَثِيرَةٌ';
}
