/** «الانقلاب» — STUB (to be written). */
import { COUP_DEFAULTS, type CoupSettings, type CoupView } from '../../src/shared/games/coup';
import type { GameModule } from '../types';

interface State {
  settings: CoupSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const coup: GameModule<State, CoupSettings> = {
  id: 'coup',
  start(_ctx, participants, settings) {
    return { settings: { ...COUP_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): CoupView {
    return { game: 'coup', phase: 'play', players: s.participants, scores: s.scores };
  },
};
