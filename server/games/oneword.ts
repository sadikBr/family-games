/** «كلمة واحدة» — server rules. */
import type { OnewordSettings, OnewordView } from '../../src/shared/games/oneword';
import { type GameModule } from '../types';

interface State {
  settings: OnewordSettings;
  participants: string[];
  phase: OnewordView['phase'];
}

export const oneword: GameModule<State, OnewordSettings> = {
  id: 'oneword',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): OnewordView {
    return { game: 'oneword', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
