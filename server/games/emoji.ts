/** «خمّن من الإيموجي» — STUB (to be written). */
import { EMOJI_DEFAULTS, type EmojiSettings, type EmojiView } from '../../src/shared/games/emoji';
import type { GameModule } from '../types';

interface State {
  settings: EmojiSettings;
  participants: string[];
  scores: Record<string, number>;
}

export const emoji: GameModule<State, EmojiSettings> = {
  id: 'emoji',
  start(_ctx, participants, settings) {
    return { settings: { ...EMOJI_DEFAULTS, ...settings }, participants: [...participants], scores: Object.fromEntries(participants.map((p) => [p, 0])) };
  },
  act() {},
  view(_ctx, s): EmojiView {
    return { game: 'emoji', phase: 'play', players: s.participants, scores: s.scores };
  },
};
