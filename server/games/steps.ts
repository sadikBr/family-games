/** «رتّب الخطوات» — server rules. */
import type { StepsSettings, StepsView } from '../../src/shared/games/steps';
import { type GameModule } from '../types';

interface State {
  settings: StepsSettings;
  participants: string[];
  phase: StepsView['phase'];
}

export const steps: GameModule<State, StepsSettings> = {
  id: 'steps',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): StepsView {
    return { game: 'steps', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
