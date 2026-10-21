/**
 * «التفاعلات» on this phone: show the reactions the others send (on by default). Turned off in the room
 * menu, the phone still shows my own reactions (as the confirmation that they were sent).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'fg.reactions.v1';
let on = true;
let loading = false;
const listeners = new Set<() => void>();

function load() {
  if (loading) return;
  loading = true;
  try {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === '0' && on) {
          on = false;
          listeners.forEach((l) => l());
        }
      })
      .catch(() => {});
  } catch {}
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function reactionsOn() {
  load();
  return on;
}

export function setReactionsOn(v: boolean) {
  on = v;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
}

export function useReactionsOn() {
  return useSyncExternalStore(subscribe, () => on, () => on);
}
