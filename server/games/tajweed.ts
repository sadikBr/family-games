/** «مسابقة التجويد» — server rules. */
import type { TajweedSettings, TajweedView } from '../../src/shared/games/tajweed';
import { type GameModule } from '../types';

interface State {
  settings: TajweedSettings;
  participants: string[];
  phase: TajweedView['phase'];
}

export const tajweed: GameModule<State, TajweedSettings> = {
  id: 'tajweed',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): TajweedView {
    return { game: 'tajweed', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
