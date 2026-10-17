/** «المنقلة» — server rules. */
import type { MancalaSettings, MancalaView } from '../../src/shared/games/mancala';
import { type GameModule } from '../types';

interface State {
  settings: MancalaSettings;
  participants: string[];
  phase: MancalaView['phase'];
}

export const mancala: GameModule<State, MancalaSettings> = {
  id: 'mancala',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): MancalaView {
    return { game: 'mancala', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
