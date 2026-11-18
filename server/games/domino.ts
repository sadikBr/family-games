/** «الدومينو» — STUB (to be written). */
import { DOMINO_DEFAULTS, type DominoSettings, type DominoView } from '../../src/shared/games/domino';
import type { GameModule } from '../types';

interface State {
  settings: DominoSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const domino: GameModule<State, DominoSettings> = {
  id: 'domino',
  start(_ctx, participants, settings) {
    return { settings: { ...DOMINO_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): DominoView {
    return { game: 'domino', phase: 'play', players: s.participants, scores: s.scores };
  },
};
