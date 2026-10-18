/**
 * Push notifications — web version: none (the in-app invitation still works while the page is open).
 * The phone version is push.native.ts.
 */

/** Set up notifications; `onCall` runs when a group-call notification is tapped. Returns a clean-up. */
export function initPush(_onCall: (code: string) => void): () => void {
  return () => {};
}

/** After the first group create / join: explain, then ask for permission (once). */
export async function askForPushOnce(): Promise<void> {}
