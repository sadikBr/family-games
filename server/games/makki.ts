/** «مكية أم مدنية؟» — STUB (to be written). */
import { MAKKI_DEFAULTS, type MakkiSettings, type MakkiView } from '../../src/shared/games/makki';
import type { GameModule } from '../types';

interface State {
  settings: MakkiSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const makki: GameModule<State, MakkiSettings> = {
  id: 'makki',
  start(_ctx, participants, settings) {
    return { settings: { ...MAKKI_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): MakkiView {
    return { game: 'makki', phase: 'play', players: s.participants, scores: s.scores };
  },
};
