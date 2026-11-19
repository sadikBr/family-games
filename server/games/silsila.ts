/** «سلسلة الذاكرة» — STUB (to be written). */
import { SILSILA_DEFAULTS, type SilsilaSettings, type SilsilaView } from '../../src/shared/games/silsila';
import type { GameModule } from '../types';

interface State {
  settings: SilsilaSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const silsila: GameModule<State, SilsilaSettings> = {
  id: 'silsila',
  start(_ctx, participants, settings) {
    return { settings: { ...SILSILA_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): SilsilaView {
    return { game: 'silsila', phase: 'play', players: s.participants, scores: s.scores };
  },
};
