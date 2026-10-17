/** «المستوطنون» — server rules. */
import type { CatanSettings, CatanView } from '../../src/shared/games/catan';
import { type GameModule } from '../types';

interface State {
  settings: CatanSettings;
  participants: string[];
  phase: CatanView['phase'];
}

export const catan: GameModule<State, CatanSettings> = {
  id: 'catan',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): CatanView {
    return { game: 'catan', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
