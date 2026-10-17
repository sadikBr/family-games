/** «فك الشيفرة» — server rules. */
import type { CodebreakSettings, CodebreakView } from '../../src/shared/games/codebreak';
import { type GameModule } from '../types';

interface State {
  settings: CodebreakSettings;
  participants: string[];
  phase: CodebreakView['phase'];
}

export const codebreak: GameModule<State, CodebreakSettings> = {
  id: 'codebreak',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): CodebreakView {
    return { game: 'codebreak', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
