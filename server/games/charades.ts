/** «تمثيل صامت» — server rules. */
import type { CharadesSettings, CharadesView } from '../../src/shared/games/charades';
import { type GameModule } from '../types';

interface State {
  settings: CharadesSettings;
  participants: string[];
  phase: CharadesView['phase'];
}

export const charades: GameModule<State, CharadesSettings> = {
  id: 'charades',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): CharadesView {
    return { game: 'charades', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
