/**
 * Over-the-air updates (expo-updates, EAS Update on the «preview» channel): screens, games, texts and
 * sounds reach the phones without a new APK. At launch the phone looks for a newer update and
 * downloads it quietly; it's used at the next launch, or right away when the person taps
 * «أعد التشغيل» on the home screen banner (never in the middle of a game).
 *
 * New native features (a new phone permission or native package) still need a new APK: an update is
 * only offered to APKs with the same «runtime version» (the fixed `runtimeVersion` of app.json, changed by
 * hand together with any native change).
 *
 * expo-updates is a native module: loaded lazily, so Expo Go, the web build and older APKs ignore it.
 */
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

type UpdatesModule = typeof import('expo-updates');

let mod: UpdatesModule | null | undefined;
function updates(): UpdatesModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web' || __DEV__) return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-updates') as UpdatesModule;
    mod = m.isEnabled ? m : null;
  } catch {
    mod = null;
  }
  return mod;
}

/** 'idle' nothing new · 'ready' a newer version is downloaded and waits for a restart */
let state: 'idle' | 'ready' = 'idle';
const listeners = new Set<() => void>();
const set = (s: typeof state) => {
  state = s;
  listeners.forEach((l) => l());
};

let checking = false;
let lastCheck = 0;
async function check() {
  const m = updates();
  if (!m || checking || state === 'ready') return;
  // at most every 10 minutes (the app also checks by itself at every launch)
  if (Date.now() - lastCheck < 10 * 60_000) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const r = await m.checkForUpdateAsync();
    if (r.isAvailable) {
      const f = await m.fetchUpdateAsync();
      if (f.isNew) set('ready');
    }
  } catch {
    // offline, or the update server unreachable: try again later
  } finally {
    checking = false;
  }
}

let started = false;
/** Look for an update now and whenever the app comes back to the foreground. */
export function initUpdates() {
  if (started || !updates()) return;
  started = true;
  void check();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void check();
  });
}

export function useUpdateReady() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state === 'ready',
  );
}

/** Restart into the downloaded version. */
export function applyUpdate() {
  void updates()?.reloadAsync();
}

/** A short label of what this phone runs (profile screen), e.g. «تحديث 2026-10-19» or «نسخة التثبيت». */
export function versionLabel(): string | null {
  const m = updates();
  if (!m) return null;
  // the start of the runtime version: compared with the publish script's output when an update doesn't arrive
  const rv = m.runtimeVersion ? ` (${m.runtimeVersion.slice(0, 6)})` : '';
  if (m.isEmbeddedLaunch || !m.createdAt) return `النسخة المثبّتة${rv}`;
  const d = m.createdAt;
  const two = (n: number) => String(n).padStart(2, '0');
  return `تحديث ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}${rv}`;
}
