/** «الكلمات المتقاطعة» — STUB (to be written). */
import { CROSS_DEFAULTS, type CrossSettings, type CrossView } from '../../src/shared/games/cross';
import type { GameModule } from '../types';

interface State {
  settings: CrossSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const cross: GameModule<State, CrossSettings> = {
  id: 'cross',
  start(_ctx, participants, settings) {
    return { settings: { ...CROSS_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): CrossView {
    return { game: 'cross', phase: 'play', players: s.participants, scores: s.scores };
  },
};
