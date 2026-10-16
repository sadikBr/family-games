import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { FxKind } from '@/shared/protocol';

const SOURCES = {
  pop: require('@/assets/sounds/pop.wav'),
  correct: require('@/assets/sounds/correct.wav'),
  skip: require('@/assets/sounds/skip.wav'),
  buzz: require('@/assets/sounds/buzz.wav'),
  boom: require('@/assets/sounds/boom.wav'),
  throw: require('@/assets/sounds/throw.wav'),
  tick: require('@/assets/sounds/tick.wav'),
  start: require('@/assets/sounds/start.wav'),
  win: require('@/assets/sounds/win.wav'),
  reveal: require('@/assets/sounds/reveal.wav'),
  death: require('@/assets/sounds/death.wav'),
  card: require('@/assets/sounds/card.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const MUTE_KEY = 'fg.muted.v1';
const players: Partial<Record<SoundName, AudioPlayer>> = {};
let muted = false;
let ready = false;
const muteListeners = new Set<(m: boolean) => void>();

export async function initSfx() {
  if (ready) return;
  ready = true;
  try {
    muted = (await AsyncStorage.getItem(MUTE_KEY)) === '1';
  } catch {}
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  } catch {}
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  muteListeners.forEach((l) => l(m));
  AsyncStorage.setItem(MUTE_KEY, m ? '1' : '0').catch(() => {});
}

export function onMuteChange(l: (m: boolean) => void) {
  muteListeners.add(l);
  return () => {
    muteListeners.delete(l);
  };
}

export function play(name: SoundName) {
  if (muted) return;
  try {
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      players[name] = p;
    }
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // sound is a bonus, never crash a game because of it
  }
}

const canBuzz = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  tap() {
    if (canBuzz) Haptics.selectionAsync().catch(() => {});
  },
  light() {
    if (canBuzz) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (canBuzz) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy() {
    if (canBuzz) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success() {
    if (canBuzz) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error() {
    if (canBuzz) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};

/** Sound + vibration for a server-side game event. */
export function playFx(kind: FxKind, me: string, target?: string) {
  switch (kind) {
    case 'join':
      play('pop');
      haptic.light();
      break;
    case 'start':
      play('start');
      haptic.medium();
      break;
    case 'correct':
      play('correct');
      haptic.success();
      break;
    case 'skip':
      play('skip');
      haptic.light();
      break;
    case 'buzz':
      play('buzz');
      haptic.error();
      break;
    case 'throw':
      play('throw');
      if (target === me) haptic.heavy();
      break;
    case 'boom':
      play('boom');
      haptic.heavy();
      if (target === me) {
        setTimeout(() => haptic.heavy(), 150);
        setTimeout(() => haptic.error(), 320);
      }
      break;
    case 'reveal':
      play('reveal');
      haptic.medium();
      break;
    case 'death':
      play('death');
      haptic.error();
      break;
    case 'win':
      play('win');
      haptic.success();
      break;
    case 'tick':
      play('tick');
      haptic.tap();
      break;
    case 'card':
      play('card');
      haptic.tap();
      break;
  }
}
