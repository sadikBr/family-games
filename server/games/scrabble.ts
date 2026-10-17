/** «شبكة الكلمات» — server rules. */
import type { ScrabbleSettings, ScrabbleView } from '../../src/shared/games/scrabble';
import { type GameModule } from '../types';

interface State {
  settings: ScrabbleSettings;
  participants: string[];
  phase: ScrabbleView['phase'];
}

export const scrabble: GameModule<State, ScrabbleSettings> = {
  id: 'scrabble',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): ScrabbleView {
    return { game: 'scrabble', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
