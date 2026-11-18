/**
 * Small shared state of the desktop screens: which category of the home page is in view (the sidebar
 * lights it up) and a request from the sidebar to scroll to one.
 */
import { useSyncExternalStore } from 'react';

let active = -1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setActiveSection(i: number) {
  if (i === active) return;
  active = i;
  emit();
}

export function useActiveSection() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => active,
    () => -1,
  );
}

/** The home page's element id for a category («fav» or its index in GAME_GROUPS). */
export const sectionId = (key: string) => `dk-sec-${key}`;

/** Scroll the home page to a category; false when it isn't on screen (the caller navigates instead). */
export function scrollToSection(key: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(sectionId(key));
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
