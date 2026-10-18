/** «البلوط» — server rules. */
import type { BalootSettings, BalootView } from '../../src/shared/games/baloot';
import { type GameModule } from '../types';

interface State {
  settings: BalootSettings;
  participants: string[];
  phase: BalootView['phase'];
}

export const baloot: GameModule<State, BalootSettings> = {
  id: 'baloot',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): BalootView {
    return { game: 'baloot', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
