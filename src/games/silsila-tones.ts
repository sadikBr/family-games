/**
 * «سلسلة الذاكرة» — the pads' tones (assets/sounds/silsila-N.wav, made by scripts/silsila-tones.py). The same
 * rules as the app's other sounds (src/lib/sfx.ts): silent when the app's sound is off, and on the web only
 * after the page was clicked or tapped once (a browser refuses sound before that).
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import { isMuted } from '@/lib/sfx';

const SOURCES = [
  require('@/assets/sounds/silsila-0.wav'),
  require('@/assets/sounds/silsila-1.wav'),
  require('@/assets/sounds/silsila-2.wav'),
  require('@/assets/sounds/silsila-3.wav'),
  require('@/assets/sounds/silsila-4.wav'),
  require('@/assets/sounds/silsila-5.wav'),
];

const players: (AudioPlayer | undefined)[] = [];

function webSilent(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return !!ua && !ua.hasBeenActive;
}

function player(pad: number): AudioPlayer | undefined {
  if (!SOURCES[pad]) return undefined;
  let p = players[pad];
  if (!p) {
    p = createAudioPlayer(SOURCES[pad]);
    p.volume = 0.9;
    players[pad] = p;
  }
  return p;
}

/** Load the tones before the first playback, so the first light isn't late on its sound. */
export function warmTones(pads: number) {
  try {
    for (let i = 0; i < pads; i++) player(i);
  } catch {}
}

/** The pad's tone. */
export function playTone(pad: number) {
  if (isMuted() || webSilent()) return;
  try {
    const p = player(pad);
    if (!p) return;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // sound is a bonus, never crash the game because of it
  }
}
