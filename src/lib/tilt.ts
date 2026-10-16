import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export type Tilt = 'down' | 'up';

/**
 * Heads-Up style tilt detection while the phone is held on the forehead (portrait).
 *  - screen tilted towards the floor  → 'down' (correct)
 *  - screen tilted towards the ceiling → 'up'   (skip)
 * The phone has to come back to upright before the next tilt counts.
 */
export function useTilt(enabled: boolean, onTilt: (t: Tilt) => void) {
  const cb = useRef(onTilt);
  useEffect(() => {
    cb.current = onTilt;
  }, [onTilt]);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    // iOS reports gravity with the opposite sign of Android
    const sign = Platform.OS === 'ios' ? -1 : 1;
    let armed = false;
    let lastFire = 0;
    Accelerometer.setUpdateInterval(60);
    const sub = Accelerometer.addListener(({ z }) => {
      const zz = z * sign; // +1 = screen facing up, -1 = screen facing down
      const now = Date.now();
      if (Math.abs(zz) < 0.45) {
        armed = true;
        return;
      }
      if (!armed || now - lastFire < 700) return;
      if (zz < -0.72) {
        armed = false;
        lastFire = now;
        cb.current('down');
      } else if (zz > 0.72) {
        armed = false;
        lastFire = now;
        cb.current('up');
      }
    });
    return () => sub.remove();
  }, [enabled]);
}
