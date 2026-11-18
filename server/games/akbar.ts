/** «أكبر أم أصغر؟» — STUB (to be written). */
import { AKBAR_DEFAULTS, type AkbarSettings, type AkbarView } from '../../src/shared/games/akbar';
import type { GameModule } from '../types';

interface State {
  settings: AkbarSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const akbar: GameModule<State, AkbarSettings> = {
  id: 'akbar',
  start(_ctx, participants, settings) {
    return { settings: { ...AKBAR_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): AkbarView {
    return { game: 'akbar', phase: 'play', players: s.participants, scores: s.scores };
  },
};
