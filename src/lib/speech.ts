/**
 * «قراءة الأحداث»: the phone reads the game's big calls aloud (روندا، دقة، شاري، باص…) with its own
 * Arabic voice (Android's text-to-speech, the browser's speech synthesis on the web). Off by default;
 * each phone turns it on in the room menu or on the profile screen. The «الصوت مطفأ» switch silences it too.
 *
 * expo-speech is a native module: it's loaded lazily, so Expo Go and older builds simply stay quiet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isMuted } from './sfx';

type SpeechModule = typeof import('expo-speech');

const KEY = 'fg.speakCalls.v1';
let enabled = false;
let loaded = false;
const listeners = new Set<(on: boolean) => void>();

let mod: SpeechModule | null | undefined;
function speechModule(): SpeechModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-speech') as SpeechModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** The Arabic voice to use (a Moroccan one if the phone has it), or null when the phone has none. */
let voiceId: string | null | undefined;
async function pickVoice(): Promise<string | null> {
  if (voiceId) return voiceId;
  const m = speechModule();
  if (!m) return null;
  try {
    const voices = await m.getAvailableVoicesAsync();
    const ar = voices.filter((v) => v.language?.toLowerCase().startsWith('ar'));
    const best =
      ar.find((v) => v.language.toLowerCase().includes('ma')) ??
      ar.find((v) => v.quality === 'Enhanced') ??
      ar[0];
    // not found yet: ask again next time (a browser lists its voices a moment after loading)
    voiceId = best ? best.identifier : undefined;
  } catch {
    voiceId = undefined;
  }
  return voiceId ?? null;
}

export async function initSpeech() {
  if (loaded) return;
  loaded = true;
  try {
    enabled = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {}
  listeners.forEach((l) => l(enabled));
}

export function speakCallsOn() {
  return enabled;
}

export function setSpeakCalls(on: boolean) {
  enabled = on;
  listeners.forEach((l) => l(on));
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  if (on) speak('قِرَاءَةُ الأَحْدَاثِ تَعْمَلُ');
  else speechModule()?.stop();
}

export function onSpeakCallsChange(l: (on: boolean) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Whether this phone can read Arabic aloud (an Arabic voice is installed). */
export async function hasArabicVoice(): Promise<boolean> {
  if (!speechModule()) return false;
  return (await pickVoice()) !== null;
}

/** Read a call aloud now (cuts a previous call short: the newest event matters most). */
export function speak(text: string) {
  if (!enabled || isMuted() || !text) return;
  const m = speechModule();
  if (!m) return;
  void pickVoice().then((voice) => {
    try {
      m.stop();
      m.speak(text, { language: 'ar', ...(voice ? { voice } : {}), rate: 0.95, pitch: 1 });
    } catch {
      // speech is a bonus, never break a game because of it
    }
  });
}
