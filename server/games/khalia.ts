/** «خلية الحروف» — STUB (to be written). */
import { KHALIA_DEFAULTS, type KhaliaSettings, type KhaliaView } from '../../src/shared/games/khalia';
import type { GameModule } from '../types';

interface State {
  settings: KhaliaSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const khalia: GameModule<State, KhaliaSettings> = {
  id: 'khalia',
  start(_ctx, participants, settings) {
    return { settings: { ...KHALIA_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): KhaliaView {
    return { game: 'khalia', phase: 'play', players: s.participants, scores: s.scores };
  },
};
