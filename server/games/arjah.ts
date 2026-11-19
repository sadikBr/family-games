/** «من الأرجح؟» — STUB (to be written). */
import { ARJAH_DEFAULTS, type ArjahSettings, type ArjahView } from '../../src/shared/games/arjah';
import type { GameModule } from '../types';

interface State {
  settings: ArjahSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const arjah: GameModule<State, ArjahSettings> = {
  id: 'arjah',
  start(_ctx, participants, settings) {
    return { settings: { ...ARJAH_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): ArjahView {
    return { game: 'arjah', phase: 'play', players: s.participants, scores: s.scores };
  },
};
