/** «ماذا قال الناس؟» — server rules. */
import type { SurveySettings, SurveyView } from '../../src/shared/games/survey';
import { type GameModule } from '../types';

interface State {
  settings: SurveySettings;
  participants: string[];
  phase: SurveyView['phase'];
}

export const survey: GameModule<State, SurveySettings> = {
  id: 'survey',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): SurveyView {
    return { game: 'survey', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
