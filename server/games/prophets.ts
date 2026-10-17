/** «قصص الأنبياء» — server rules. */
import type { ProphetsSettings, ProphetsView } from '../../src/shared/games/prophets';
import { type GameModule } from '../types';

interface State {
  settings: ProphetsSettings;
  participants: string[];
  phase: ProphetsView['phase'];
}

export const prophets: GameModule<State, ProphetsSettings> = {
  id: 'prophets',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): ProphetsView {
    return { game: 'prophets', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
