/** «المربعات» — server rules. */
import type { DotsSettings, DotsView } from '../../src/shared/games/dots';
import { type GameModule } from '../types';

interface State {
  settings: DotsSettings;
  participants: string[];
  phase: DotsView['phase'];
}

export const dots: GameModule<State, DotsSettings> = {
  id: 'dots',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): DotsView {
    return { game: 'dots', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
