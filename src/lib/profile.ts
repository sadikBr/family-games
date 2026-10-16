import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { PlayerInfo } from '@/shared/protocol';
import { AVATARS, PLAYER_COLORS } from '@/theme';

const KEY = 'fg.profile.v1';

export interface ProfileState {
  loaded: boolean;
  profile: PlayerInfo;
  /** true until the player chose a name */
  isNew: boolean;
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let state: ProfileState = {
  loaded: false,
  isNew: true,
  profile: { id: randomId(), name: '', avatar: randomOf(AVATARS), color: randomOf(PLAYER_COLORS) },
};
const listeners = new Set<() => void>();

function set(next: ProfileState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getProfile() {
  return state.profile;
}

export async function loadProfile() {
  if (state.loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as PlayerInfo;
      // profiles saved before the art avatars used emojis
      if (!AVATARS.includes(saved.avatar)) saved.avatar = randomOf(AVATARS);
      if (!PLAYER_COLORS.includes(saved.color)) saved.color = randomOf(PLAYER_COLORS);
      set({ loaded: true, isNew: !saved.name, profile: { ...state.profile, ...saved } });
      return;
    }
  } catch {
    // storage unavailable: keep the in-memory profile
  }
  set({ ...state, loaded: true });
}

export async function saveProfile(patch: Partial<Omit<PlayerInfo, 'id'>>) {
  const profile = { ...state.profile, ...patch };
  set({ loaded: true, isNew: !profile.name, profile });
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  } catch {}
}

export function useProfile(): ProfileState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
