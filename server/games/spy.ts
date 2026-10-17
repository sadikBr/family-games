/** «الجاسوس» — server rules. */
import type { SpySettings, SpyView } from '../../src/shared/games/spy';
import { type GameModule } from '../types';

interface State {
  settings: SpySettings;
  participants: string[];
  phase: SpyView['phase'];
}

export const spy: GameModule<State, SpySettings> = {
  id: 'spy',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): SpyView {
    return { game: 'spy', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
