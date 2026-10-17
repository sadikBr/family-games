/**
 * Per-phone game preferences for the home screen: favourite games and the games played recently.
 * Kept in AsyncStorage; the home screen reads them through useGamePrefs().
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
}

let prefs: GamePrefs = { favorites: [], recent: [] };
const listeners = new Set<() => void>();
let loaded = false;

const valid = (ids: unknown): GameId[] => (Array.isArray(ids) ? ids.filter((x): x is GameId => GAME_IDS.includes(x as GameId)) : []);

function set(next: GamePrefs) {
  prefs = next;
  for (const l of listeners) l();
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const j = JSON.parse(raw) as Partial<GamePrefs>;
      prefs = { favorites: valid(j.favorites), recent: valid(j.recent).slice(0, MAX_RECENT) };
      for (const l of listeners) l();
    })
    .catch(() => {});
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

/** A game was played on this phone: it goes to the front of «لعبتم مؤخراً». */
export function notePlayed(id: GameId) {
  load();
  if (prefs.recent[0] === id) return;
  set({ ...prefs, recent: [id, ...prefs.recent.filter((x) => x !== id)].slice(0, MAX_RECENT) });
}
