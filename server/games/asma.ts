/** «أسماء الله الحسنى» — server rules. */
import type { AsmaSettings, AsmaView } from '../../src/shared/games/asma';
import { type GameModule } from '../types';

interface State {
  settings: AsmaSettings;
  participants: string[];
  phase: AsmaView['phase'];
}

export const asma: GameModule<State, AsmaSettings> = {
  id: 'asma',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): AsmaView {
    return { game: 'asma', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
