/** «أكمل المثل» — STUB (to be written). */
import { MATHAL_DEFAULTS, type MathalSettings, type MathalView } from '../../src/shared/games/mathal';
import type { GameModule } from '../types';

interface State {
  settings: MathalSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const mathal: GameModule<State, MathalSettings> = {
  id: 'mathal',
  start(_ctx, participants, settings) {
    return { settings: { ...MATHAL_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): MathalView {
    return { game: 'mathal', phase: 'play', players: s.participants, scores: s.scores };
  },
};
