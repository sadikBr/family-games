/**
 * Shared, deliberately gentle entrances. The family found big pop-ins and bounces too much: things
 * appear with a short fade and grow only a little (no zoom from nothing, no overshoot).
 */
import { Easing, Keyframe } from 'react-native-reanimated';

/** A panel, answer or marker appearing: fade in while growing from 94 % (200 ms). */
export const SoftIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.94 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.quad) },
}).duration(200);

/** A small marker on a board (a hit, a closed box, an owner dot): a little stronger growth, still no bounce. */
export const MarkIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.75 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.quad) },
}).duration(180);
