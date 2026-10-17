/** «المراحل العشر» — server rules. */
import type { Phase10Settings, Phase10View } from '../../src/shared/games/phase10';
import { type GameModule } from '../types';

interface State {
  settings: Phase10Settings;
  participants: string[];
  phase: Phase10View['phase'];
}

export const phase10: GameModule<State, Phase10Settings> = {
  id: 'phase10',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): Phase10View {
    return { game: 'phase10', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
