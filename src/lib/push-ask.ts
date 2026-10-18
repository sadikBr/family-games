/**
 * The one-line explanation shown before the system asks for notifications (see PushPrompt):
 * a tiny store, so the native push code can wait for the answer.
 */
import { useSyncExternalStore } from 'react';

let open = false;
let resolve: ((ok: boolean) => void) | null = null;
const listeners = new Set<() => void>();

function set(v: boolean) {
  open = v;
  listeners.forEach((l) => l());
}

/** Show the explanation; resolves with the answer. */
export function askUser(): Promise<boolean> {
  resolve?.(false);
  set(true);
  return new Promise((r) => {
    resolve = r;
  });
}

export function answerAsk(ok: boolean) {
  const r = resolve;
  resolve = null;
  set(false);
  r?.(ok);
}

export function usePushAsk(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open,
  );
}
