/** «العقل الواحد» — STUB (to be written). */
import { MIND_DEFAULTS, type MindSettings, type MindView } from '../../src/shared/games/mind';
import type { GameModule } from '../types';

interface State {
  settings: MindSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const mind: GameModule<State, MindSettings> = {
  id: 'mind',
  start(_ctx, participants, settings) {
    return { settings: { ...MIND_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): MindView {
    return { game: 'mind', phase: 'play', players: s.participants, scores: s.scores };
  },
};
