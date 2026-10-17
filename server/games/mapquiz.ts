/** «أين المكان؟» — server rules. */
import type { MapquizSettings, MapquizView } from '../../src/shared/games/mapquiz';
import { type GameModule } from '../types';

interface State {
  settings: MapquizSettings;
  participants: string[];
  phase: MapquizView['phase'];
}

export const mapquiz: GameModule<State, MapquizSettings> = {
  id: 'mapquiz',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): MapquizView {
    return { game: 'mapquiz', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
