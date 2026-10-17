/** «كلمة قرآنية» — server rules. */
import type { QwordSettings, QwordView } from '../../src/shared/games/qword';
import { type GameModule } from '../types';

interface State {
  settings: QwordSettings;
  participants: string[];
  phase: QwordView['phase'];
}

export const qword: GameModule<State, QwordSettings> = {
  id: 'qword',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): QwordView {
    return { game: 'qword', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
