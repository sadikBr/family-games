/**
 * Per-phone game preferences for the home screen: favourite games, the games played recently, and
 * whether the short welcome was dismissed. Kept in AsyncStorage; the home screen reads them through
 * useGamePrefs().
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { GAME_IDS, type GameId } from '@/shared/protocol';

const KEY = 'fg.gamePrefs.v1';
const MAX_RECENT = 8;

export interface GamePrefs {
  favorites: GameId[];
  /** most recent first */
  recent: GameId[];
  /** the first-time welcome on the home screen was dismissed */
  welcomed: boolean;
  /** read from storage yet (not saved): the welcome waits for it so it never flashes */
  loaded: boolean;
}

let prefs: GamePrefs = { favorites: [], recent: [], welcomed: false, loaded: false };
const listeners = new Set<() => void>();
let loading = false;

const valid = (ids: unknown): GameId[] => (Array.isArray(ids) ? ids.filter((x): x is GameId => GAME_IDS.includes(x as GameId)) : []);

function emit() {
  for (const l of listeners) l();
}

function set(next: GamePrefs) {
  prefs = next;
  emit();
  try {
    const { favorites, recent, welcomed } = prefs;
    AsyncStorage.setItem(KEY, JSON.stringify({ favorites, recent, welcomed })).catch(() => {});
  } catch {
    // storage unavailable: keep the in-memory prefs
  }
}

function load() {
  if (loading) return;
  loading = true;
  const done = (saved: Partial<GamePrefs> | null) => {
    prefs = saved
      ? { favorites: valid(saved.favorites), recent: valid(saved.recent).slice(0, MAX_RECENT), welcomed: saved.welcomed === true, loaded: true }
      : { ...prefs, loaded: true };
    emit();
  };
  try {
    AsyncStorage.getItem(KEY)
      .then((raw) => done(raw ? (JSON.parse(raw) as Partial<GamePrefs>) : null))
      .catch(() => done(null));
  } catch {
    done(null);
  }
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useGamePrefs(): GamePrefs {
  return useSyncExternalStore(subscribe, () => prefs, () => prefs);
}

export function toggleFavorite(id: GameId) {
  load();
  const on = prefs.favorites.includes(id);
  set({ ...prefs, favorites: on ? prefs.favorites.filter((x) => x !== id) : [id, ...prefs.favorites] });
}

/** A game was played on this phone: it goes to the front of «لعبتموها مؤخراً». */
export function notePlayed(id: GameId) {
  load();
  if (prefs.recent[0] === id) return;
  set({ ...prefs, recent: [id, ...prefs.recent.filter((x) => x !== id)].slice(0, MAX_RECENT) });
}

/** «فهمت» on the home screen's welcome: it never shows again on this phone. */
export function dismissWelcome() {
  load();
  if (!prefs.welcomed) set({ ...prefs, welcomed: true });
}
