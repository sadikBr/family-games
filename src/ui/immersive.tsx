/**
 * Full screen for a game: the game asks the room screen to hide its header (and everything around the
 * game) while it is on. The room provides it; elsewhere it does nothing.
 */
import { createContext, use } from 'react';

export const ImmersiveContext = createContext<(on: boolean) => void>(() => {});

/** `set(on)`: hide (true) or show (false) the room's header around the game. */
export function useImmersive() {
  return use(ImmersiveContext);
}
