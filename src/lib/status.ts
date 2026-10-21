/**
 * My status («حالتي»): the one I chose (kept on the phone), and the one sent to the server — the
 * chosen one, except that a chosen «متاح» becomes «بعيد» while the app is in the background or
 * untouched for AUTO_AWAY_MS, and «متاح» again as soon as I'm back (see effectiveStatus).
 * The game client (client.ts) sends it in its hello and whenever it changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { cleanStatus, effectiveStatus, type MyStatus } from '@/shared/status';

const KEY = 'fg.status.v1';
/** how often the «untouched for a while» rule is checked */
const CHECK_MS = 30_000;

export interface StatusState {
  /** what I chose («متاح» by default) */
  chosen: MyStatus;
  /** what the server is told (the automatic «بعيد» included) */
  effective: MyStatus;
}

let chosen: MyStatus = 'available';
let active = AppState.currentState !== 'background';
let lastTouch = Date.now();
let state: StatusState = { chosen, effective: 'available' };
let started = false;
const listeners = new Set<() => void>();

function recompute() {
  const effective = effectiveStatus(chosen, { active, idleMs: Date.now() - lastTouch });
  if (effective === state.effective && chosen === state.chosen) return;
  state = { chosen, effective };
  listeners.forEach((l) => l());
}

/** A touch (or a key / the mouse on the web): I'm here. Cheap enough to call on every touch. */
export function markActivity() {
  lastTouch = Date.now();
  if (state.effective !== effectiveStatus(chosen, { active, idleMs: 0 })) recompute();
}

function start() {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      active = true;
      lastTouch = Date.now();
    } else if (s === 'background') active = false;
    else return; // iOS «inactive»: a passing state
    recompute();
  });
  setInterval(() => {
    if (active) recompute();
  }, CHECK_MS);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, markActivity, { passive: true });
  }
}

/** Read my chosen status from the phone (before the first connection), and start the automatic rules. */
export async function loadStatus() {
  try {
    const saved = cleanStatus(await AsyncStorage.getItem(KEY));
    if (saved) chosen = saved;
  } catch {
    // storage unavailable: «متاح»
  }
  start();
  recompute();
}

export async function setMyStatus(s: MyStatus) {
  chosen = s;
  lastTouch = Date.now();
  recompute();
  try {
    await AsyncStorage.setItem(KEY, s);
  } catch {}
}

/** The status to send right now. */
export function myStatus(): MyStatus {
  return state.effective;
}

export function onStatusChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useMyStatus(): StatusState {
  return useSyncExternalStore(onStatusChange, () => state, () => state);
}
