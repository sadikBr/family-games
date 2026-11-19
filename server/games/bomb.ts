/** «القنبلة» — STUB (to be written). */
import { BOMB_DEFAULTS, type BombSettings, type BombView } from '../../src/shared/games/bomb';
import type { GameModule } from '../types';

interface State {
  settings: BombSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const bomb: GameModule<State, BombSettings> = {
  id: 'bomb',
  start(_ctx, participants, settings) {
    return { settings: { ...BOMB_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): BombView {
    return { game: 'bomb', phase: 'play', players: s.participants, scores: s.scores };
  },
};
