/** «الروابط» — STUB (to be written). */
import { RAWABIT_DEFAULTS, type RawabitSettings, type RawabitView } from '../../src/shared/games/rawabit';
import type { GameModule } from '../types';

interface State {
  settings: RawabitSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const rawabit: GameModule<State, RawabitSettings> = {
  id: 'rawabit',
  start(_ctx, participants, settings) {
    return { settings: { ...RAWABIT_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): RawabitView {
    return { game: 'rawabit', phase: 'play', players: s.participants, scores: s.scores };
  },
};
