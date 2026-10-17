/** «مشوار الحياة» — server rules. */
import type { LifeSettings, LifeView } from '../../src/shared/games/life';
import { type GameModule } from '../types';

interface State {
  settings: LifeSettings;
  participants: string[];
  phase: LifeView['phase'];
}

export const life: GameModule<State, LifeSettings> = {
  id: 'life',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): LifeView {
    return { game: 'life', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
