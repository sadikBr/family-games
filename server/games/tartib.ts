/** «رتّب الأحداث» — STUB (to be written). */
import { TARTIB_DEFAULTS, type TartibSettings, type TartibView } from '../../src/shared/games/tartib';
import type { GameModule } from '../types';

interface State {
  settings: TartibSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const tartib: GameModule<State, TartibSettings> = {
  id: 'tartib',
  start(_ctx, participants, settings) {
    return { settings: { ...TARTIB_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): TartibView {
    return { game: 'tartib', phase: 'play', players: s.participants, scores: s.scores };
  },
};
