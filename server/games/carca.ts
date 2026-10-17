/** «المدن والطرق» — server rules. */
import type { CarcaSettings, CarcaView } from '../../src/shared/games/carca';
import { type GameModule } from '../types';

interface State {
  settings: CarcaSettings;
  participants: string[];
  phase: CarcaView['phase'];
}

export const carca: GameModule<State, CarcaSettings> = {
  id: 'carca',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): CarcaView {
    return { game: 'carca', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
