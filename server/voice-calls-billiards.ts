/**
 * «قراءة الأحداث بصوت» — the calls of «البلياردو» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts / voice-calls-boards.ts: short, vowelled Modern Standard Arabic, Arabic
 * letters, vowel marks and spaces only, never a verb about a player (nouns: «الفَوْزُ لِبابا»).
 *
 * Only the moments a family calls out around a real table: a foul (and the ball in hand), the group a
 * player gets, the 8 or the 9 going down, the rack and the match. Never a call per shot or per ball.
 */
import type { BilliardsGroup } from '../src/shared/games/billiards';
import { voiceAnd, voiceWinner } from './voice-calls-boards';

export { voiceAnd, voiceWinner };

export const BV = {
  foul: 'خَطَأٌ',
  inHand: 'الكُرَةُ فِي اليَدِ',
  eight: 'الكُرَةُ ثَمَانِيَةٌ',
  nine: 'الكُرَةُ تِسْعَةٌ',
  scratch: 'سُقُوطُ البَيْضَاءِ',
  respot: 'الكُرَةُ تَعُودُ إِلَى مَكَانِهَا',
} as const;

export const GROUP_VOICE: Record<BilliardsGroup, string> = {
  solids: 'الكُرَاتُ الكَامِلَةُ',
  stripes: 'الكُرَاتُ المُخَطَّطَةُ',
};

/** «لِلحسن», not «لِالحسن». */
const forName = (name: string) => (name.startsWith('ال') ? name.slice(1) : name);

/** «الكُرَاتُ المُخَطَّطَةُ لِماما». */
export const voiceGroup = (g: BilliardsGroup, name: string) => `${GROUP_VOICE[g]} لِ${forName(name)}`;

/** «الشَّوْطُ لِبابا» (a rack won, the match goes on). */
export const voiceRack = (name: string) => `الشَّوْطُ لِ${forName(name)}`;

/** A foul: «خَطَأٌ، الكُرَةُ فِي اليَدِ». */
export const voiceFoul = () => voiceAnd(BV.foul, BV.inHand)!;
