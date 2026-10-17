/** «القطع الملونة» — server rules. */
import type { BlocksSettings, BlocksView } from '../../src/shared/games/blocks';
import { type GameModule } from '../types';

interface State {
  settings: BlocksSettings;
  participants: string[];
  phase: BlocksView['phase'];
}

export const blocks: GameModule<State, BlocksSettings> = {
  id: 'blocks',

  start(_ctx, participants, settings) {
    return { settings, participants, phase: 'play' };
  },

  act() {},

  view(_ctx, s): BlocksView {
    return { game: 'blocks', phase: s.phase };
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number') settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },
};
