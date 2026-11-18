/** «القاموس العجيب» — STUB (to be written). */
import { QAMUS_DEFAULTS, type QamusSettings, type QamusView } from '../../src/shared/games/qamus';
import type { GameModule } from '../types';

interface State {
  settings: QamusSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const qamus: GameModule<State, QamusSettings> = {
  id: 'qamus',
  start(_ctx, participants, settings) {
    return { settings: { ...QAMUS_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): QamusView {
    return { game: 'qamus', phase: 'play', players: s.participants, scores: s.scores };
  },
};
