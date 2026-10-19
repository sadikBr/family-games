import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { DEFAULT_PORT } from '@/shared/protocol';

const KEY = 'fg.serverUrl.v1';

/** The family's deployed server: a release build (an APK or an over-the-air update) built without
 * EXPO_PUBLIC_SERVER_URL still finds it, instead of looking for a server on the phone itself. */
const DEPLOYED_SERVER = 'wss://family-games-production-a937.up.railway.app';

/**
 * Where is the game server?
 * 1. EXPO_PUBLIC_SERVER_URL (for a deployed server)
 * 2. A release build: the deployed server
 * 3. In development: the same computer that runs `expo start` (all phones already reach it)
 */
export function defaultServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (env && !env.includes('REPLACE-ME')) return normalizeServerUrl(env);
  if (!__DEV__ && Platform.OS !== 'web') return normalizeServerUrl(DEPLOYED_SERVER);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `ws://${window.location.hostname}:${DEFAULT_PORT}/ws`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `ws://${host}:${DEFAULT_PORT}/ws`;
  return `ws://localhost:${DEFAULT_PORT}/ws`;
}

/** Accepts "192.168.1.5", "192.168.1.5:5757", "https://my-server.com", "ws://..." */
export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!s) return defaultServerUrl();
  if (s.startsWith('https://')) s = `wss://${s.slice(8)}`;
  else if (s.startsWith('http://')) s = `ws://${s.slice(7)}`;
  else if (!/^wss?:\/\//.test(s)) {
    const hasPort = /:\d+$/.test(s.split('/')[0]);
    s = `ws://${s.split('/')[0]}${hasPort ? '' : `:${DEFAULT_PORT}`}`;
  }
  const url = s.replace(/\/+$/, '');
  return url.endsWith('/ws') ? url : `${url}/ws`;
}

let override: string | null = null;

export async function loadServerOverride() {
  try {
    override = await AsyncStorage.getItem(KEY);
  } catch {}
  return override;
}

export function getServerOverride() {
  return override;
}

export async function setServerOverride(url: string | null) {
  override = url ? normalizeServerUrl(url) : null;
  try {
    if (override) await AsyncStorage.setItem(KEY, override);
    else await AsyncStorage.removeItem(KEY);
  } catch {}
}

export function serverUrl() {
  return override ?? defaultServerUrl();
}

/** True for a server on the internet (it may need a moment to wake up), false for a computer on the Wi-Fi. */
export function isRemoteServer(url: string) {
  return url.startsWith('wss://');
}
