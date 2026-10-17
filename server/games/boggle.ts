/** «حروف مبعثرة» — server rules. */
import type { BoggleSettings, BoggleView } from '../../src/shared/games/boggle';
import { type GameModule } from '../types';

interface State {
  settings: BoggleSettings;
  participants: string[];
  phase: BoggleView['phase'];
}

export const boggle: GameModule<State, BoggleSettings> = {
  id: 'boggle',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): BoggleView {
    return { game: 'boggle', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
