/** «من القائل؟» — server rules. */
import type { QquoteSettings, QquoteView } from '../../src/shared/games/qquote';
import { type GameModule } from '../types';

interface State {
  settings: QquoteSettings;
  participants: string[];
  phase: QquoteView['phase'];
}

export const qquote: GameModule<State, QquoteSettings> = {
  id: 'qquote',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): QquoteView {
    return { game: 'qquote', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
