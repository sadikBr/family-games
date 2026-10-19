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
  turn: require('@/assets/sounds/turn.wav'),
  lose: require('@/assets/sounds/lose.wav'),
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

/** «دورك!» — a chime and a double buzz, so a phone lying on the table gets noticed. */
export function alertTurn() {
  play('turn');
  haptic.heavy();
  if (canBuzz) setTimeout(() => haptic.heavy(), 180);
}

/**
 * Sound + vibration for a server-side game event — only the ones that matter (the family found the
 * app too noisy). Always heard: the end of a game (win / lose), the start, the potato exploding and
 * being thrown at ME, a werewolf death, my own answer right / wrong. A general reveal (a روندا, a
 * dice result, the round's answer…) at most once every few seconds. Silent (a light vibration at most):
 * every card played, a player joining, skips, the server's countdown ticks, other players' answers.
 */
let lastSoft = 0;
function soft(name: SoundName) {
  const now = Date.now();
  if (now - lastSoft < 4000) return;
  lastSoft = now;
  play(name);
}

export function playFx(kind: FxKind, me: string, target?: string) {
  const mine = target === me;
  switch (kind) {
    case 'join':
      haptic.light();
      break;
    case 'start':
      play('start');
      haptic.medium();
      break;
    case 'correct':
      // my own answer: always; someone else's: quiet; the round's general «correct»: now and then
      if (mine) play('correct');
      else if (!target) soft('correct');
      haptic.success();
      break;
    case 'skip':
      break;
    case 'buzz':
      if (mine || !target) play('buzz');
      if (mine) haptic.error();
      break;
    case 'throw':
      // the potato coming to me matters; passing between others doesn't
      if (mine) {
        play('throw');
        haptic.heavy();
      }
      break;
    case 'boom':
      play('boom');
      haptic.heavy();
      if (mine) {
        setTimeout(() => haptic.heavy(), 150);
        setTimeout(() => haptic.error(), 320);
      }
      break;
    case 'reveal':
      soft('reveal');
      haptic.medium();
      break;
    case 'death':
      play('death');
      haptic.error();
      break;
    case 'win':
      // a win aimed at someone else is a loss for me
      if (target && target !== me) {
        play('lose');
        haptic.light();
      } else {
        play('win');
        haptic.success();
      }
      break;
    case 'tick':
      break;
    case 'card':
      if (mine) haptic.tap();
      break;
  }
}
