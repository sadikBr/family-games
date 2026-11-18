/** «البلد الغامض» — STUB (to be written). */
import { BALAD_DEFAULTS, type BaladSettings, type BaladView } from '../../src/shared/games/balad';
import type { GameModule } from '../types';

interface State {
  settings: BaladSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const balad: GameModule<State, BaladSettings> = {
  id: 'balad',
  start(_ctx, participants, settings) {
    return { settings: { ...BALAD_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): BaladView {
    return { game: 'balad', phase: 'play', players: s.participants, scores: s.scores };
  },
};
