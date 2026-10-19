/**
 * «قراءة الأحداث»: the phone reads the game's big calls aloud (روندا، دقة، شاري، باص…) with its own
 * Arabic voice (Android's text-to-speech, the browser's speech synthesis on the web). Off by default;
 * each phone turns it on in the room menu or on the profile screen. The «الصوت مطفأ» switch silences it too.
 *
 * Voice: a man's voice is preferred (the family asked for one); the phone's Arabic voices are listed on
 * the profile screen with a «جرّب» button, and the one picked there is kept. Calls are read a little
 * slower and lower than the voice's default, which sounds calmer and says the Moroccan words better.
 *
 * expo-speech is a native module: it's loaded lazily, so Expo Go and older builds simply stay quiet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isMuted } from './sfx';

type SpeechModule = typeof import('expo-speech');
type Voice = Awaited<ReturnType<SpeechModule['getAvailableVoicesAsync']>>[number];

const KEY = 'fg.speakCalls.v1';
const VOICE_KEY = 'fg.speakVoice.v1';
let enabled = false;
let loaded = false;
/** the voice picked on the profile screen ('' = automatic: a man's Arabic voice if there is one) */
let chosen = '';
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

/**
 * Hints that a voice is a man's. Voices don't say their gender: these are the known names of men's
 * Arabic voices (Apple's «Maged», Google's voice codes ard / are, Microsoft's Hamed / Shakir / Jamal…).
 */
const MALE_HINTS = ['male', 'maged', 'majed', 'tarik', 'hamed', 'shakir', 'jamal', 'naayf', 'hamdan', 'ard', 'are', '#male'];
const FEMALE_HINTS = ['female', 'laila', 'mariam', 'zariyah', 'salma', 'mouna', 'hoda', 'arc', 'arz'];

function looksMale(v: Voice): number {
  const s = `${v.identifier} ${v.name}`.toLowerCase();
  if (FEMALE_HINTS.some((h) => new RegExp(`(^|[^a-z])${h}([^a-z]|$)`).test(s))) return -1;
  if (MALE_HINTS.some((h) => new RegExp(`(^|[^a-z])${h}([^a-z]|$)`).test(s))) return 1;
  return 0;
}

/** The phone's Arabic voices, the most likely man's voice first, then the better quality ones. */
export async function arabicVoices(): Promise<{ id: string; label: string; male: boolean }[]> {
  const m = speechModule();
  if (!m) return [];
  try {
    const voices = (await m.getAvailableVoicesAsync()).filter((v) => v.language?.toLowerCase().startsWith('ar'));
    const score = (v: Voice) =>
      looksMale(v) * 10 + (v.language.toLowerCase().includes('ma') ? 3 : 0) + (v.quality === 'Enhanced' ? 2 : 0) + (/network/i.test(v.identifier) ? 1 : 0);
    return voices
      .sort((a, b) => score(b) - score(a))
      .map((v) => ({ id: v.identifier, label: v.name || v.identifier, male: looksMale(v) > 0 }));
  } catch {
    return [];
  }
}

/** The voice to use now, or null when the phone has no Arabic voice (yet: a browser lists them late). */
let voiceId: string | undefined;
async function pickVoice(): Promise<string | null> {
  if (voiceId) return voiceId;
  const list = await arabicVoices();
  voiceId = (chosen && list.find((v) => v.id === chosen)?.id) || list[0]?.id;
  return voiceId ?? null;
}

export async function initSpeech() {
  if (loaded) return;
  loaded = true;
  try {
    const [on, voice] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(VOICE_KEY)]);
    enabled = on === '1';
    chosen = voice ?? '';
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

export function chosenVoice() {
  return chosen;
}

/** Keep a voice ('' = automatic) and say a sample with it. */
export function chooseVoice(id: string) {
  chosen = id;
  voiceId = undefined;
  AsyncStorage.setItem(VOICE_KEY, id).catch(() => {});
  sampleVoice();
}

/** A short sample with the words that are hardest to say right. */
export function sampleVoice() {
  speak('رُونْدَا، دَقَّة، فْ جُوجْ، شَارِي، بَاصْ، الطْرُونْفُو، الفَوْزُ لِبابا', true);
}

/** Whether this phone can read Arabic aloud (an Arabic voice is installed). */
export async function hasArabicVoice(): Promise<boolean> {
  if (!speechModule()) return false;
  return (await pickVoice()) !== null;
}

/** Read a call aloud now (cuts a previous call short: the newest event matters most). */
export function speak(text: string, evenIfOff = false) {
  if ((!enabled && !evenIfOff) || isMuted() || !text) return;
  const m = speechModule();
  if (!m) return;
  void pickVoice().then((voice) => {
    try {
      m.stop();
      // a little slower and lower than the voice's default: calmer, and the Moroccan words come out clearer
      m.speak(text, { language: 'ar', ...(voice ? { voice } : {}), rate: 0.88, pitch: 0.92 });
    } catch {
      // speech is a bonus, never break a game because of it
    }
  });
}
