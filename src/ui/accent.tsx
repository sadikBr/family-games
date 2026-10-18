/**
 * The colour of the game being played (its card colour on the home screen). The room provides it, so
 * shared pieces (cards, titles, banners…) pick up a touch of the game's own colour: every game feels
 * like its own room in the same house, without each screen having to pass a colour around.
 */
import { createContext, useContext } from 'react';

import { C } from '@/theme';

export const AccentContext = createContext<string | null>(null);

/** The current game's colour, or null outside a room. */
export const useRoomAccent = () => useContext(AccentContext);

/** The current game's colour, or saffron outside a room. */
export const useAccent = () => useContext(AccentContext) ?? C.yellow;
