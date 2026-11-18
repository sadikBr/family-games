/** «أين تقع؟» — STUB (to be written). */
import { AYNA_DEFAULTS, type AynaSettings, type AynaView } from '../../src/shared/games/ayna';
import type { GameModule } from '../types';

interface State {
  settings: AynaSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const ayna: GameModule<State, AynaSettings> = {
  id: 'ayna',
  start(_ctx, participants, settings) {
    return { settings: { ...AYNA_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): AynaView {
    return { game: 'ayna', phase: 'play', players: s.participants, scores: s.scores };
  },
};
