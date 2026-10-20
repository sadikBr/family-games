/**
 * «قراءة الأحداث بصوت» — the calls of «البلياردو» (the third argument of ctx.say, see Said.voice), under
 * the rules of voice-calls.ts / voice-calls-boards.ts: short, vowelled Modern Standard Arabic, Arabic
 * letters, vowel marks and spaces only, never a verb about a player (nouns: «الفَوْزُ لِبابا»).
 *
 * Only the moments a family calls out around a real table: a foul (and the ball in hand), the group a
 * player gets, the 8 or the 9 going down, the rack and the match; in snooker a foul with its penalty,
 * a break of 30 / 50 / 100 or more, a tie on the black, the frame and the match. Never a call per shot
 * or per ball.
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
  tieBlack: 'تَعَادُلٌ، السَّوْدَاءُ تَعُودُ إِلَى مَكَانِهَا',
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

/** «الإِطَارُ لِبابا» (a snooker frame won, the match goes on). */
export const voiceFrame = (name: string) => `الإِطَارُ لِ${forName(name)}`;

/** A snooker penalty (4 … 7 points), vowelled: «أَرْبَعُ نِقَاطٍ». */
const PENALTY_VOICE: Record<number, string> = { 4: 'أَرْبَعُ نِقَاطٍ', 5: 'خَمْسُ نِقَاطٍ', 6: 'سِتُّ نِقَاطٍ', 7: 'سَبْعُ نِقَاطٍ' };

/** A snooker foul: «خَطَأٌ، أَرْبَعُ نِقَاطٍ لِسارة». */
export const voiceSnookerFoul = (penalty: number, to: string) => voiceAnd(BV.foul, `${PENALTY_VOICE[penalty] ?? PENALTY_VOICE[7]} لِ${forName(to)}`)!;

/** A big break (30 or more): «سِلْسِلَةُ خَمْسِينَ فَأَكْثَرَ لِماما»; null under 30. */
export function voiceBreak(points: number, name: string): string | null {
  if (points < 30) return null;
  const n = points >= 100 ? 'مِئَةٍ' : points >= 50 ? 'خَمْسِينَ' : 'ثَلَاثِينَ';
  return `سِلْسِلَةُ ${n} فَأَكْثَرَ لِ${forName(name)}`;
}
