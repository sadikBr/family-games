/** «املأ القائمة» — STUB (to be written). */
import { QAIMA_DEFAULTS, type QaimaSettings, type QaimaView } from '../../src/shared/games/qaima';
import type { GameModule } from '../types';

interface State {
  settings: QaimaSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const qaima: GameModule<State, QaimaSettings> = {
  id: 'qaima',
  start(_ctx, participants, settings) {
    return { settings: { ...QAIMA_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): QaimaView {
    return { game: 'qaima', phase: 'play', players: s.participants, scores: s.scores };
  },
};
