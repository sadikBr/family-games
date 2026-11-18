/** «من سيربح المليون؟» — STUB (to be written). */
import { MILLION_DEFAULTS, type MillionSettings, type MillionView } from '../../src/shared/games/million';
import type { GameModule } from '../types';

interface State {
  settings: MillionSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const million: GameModule<State, MillionSettings> = {
  id: 'million',
  start(_ctx, participants, settings) {
    return { settings: { ...MILLION_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): MillionView {
    return { game: 'million', phase: 'play', players: s.participants, scores: s.scores };
  },
};
