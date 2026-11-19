/** «قطار المغرب» — STUB (to be written). */
import { TRAIN_DEFAULTS, type TrainSettings, type TrainView } from '../../src/shared/games/train';
import type { GameModule } from '../types';

interface State {
  settings: TrainSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const train: GameModule<State, TrainSettings> = {
  id: 'train',
  start(_ctx, participants, settings) {
    return { settings: { ...TRAIN_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): TrainView {
    return { game: 'train', phase: 'play', players: s.participants, scores: s.scores };
  },
};
