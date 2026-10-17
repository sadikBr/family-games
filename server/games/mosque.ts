/** «ابنِ المسجد» — server rules. */
import type { MosqueSettings, MosqueView } from '../../src/shared/games/mosque';
import { type GameModule } from '../types';

interface State {
  settings: MosqueSettings;
  participants: string[];
  phase: MosqueView['phase'];
}

export const mosque: GameModule<State, MosqueSettings> = {
  id: 'mosque',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): MosqueView {
    return { game: 'mosque', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
