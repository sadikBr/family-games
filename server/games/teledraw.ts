/** «الرسم المتسلسل» — server rules. */
import type { TeledrawSettings, TeledrawView } from '../../src/shared/games/teledraw';
import { type GameModule } from '../types';

interface State {
  settings: TeledrawSettings;
  participants: string[];
  phase: TeledrawView['phase'];
}

export const teledraw: GameModule<State, TeledrawSettings> = {
  id: 'teledraw',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): TeledrawView {
    return { game: 'teledraw', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
