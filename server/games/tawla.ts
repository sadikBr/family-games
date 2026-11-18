/** «الطاولة» — STUB (to be written). */
import { TAWLA_DEFAULTS, type TawlaSettings, type TawlaView } from '../../src/shared/games/tawla';
import type { GameModule } from '../types';

interface State {
  settings: TawlaSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const tawla: GameModule<State, TawlaSettings> = {
  id: 'tawla',
  start(_ctx, participants, settings) {
    return { settings: { ...TAWLA_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): TawlaView {
    return { game: 'tawla', phase: 'play', players: s.participants, scores: s.scores };
  },
};
