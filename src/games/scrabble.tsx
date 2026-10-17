/** «شبكة الكلمات» — the screen. */
import type { ScrabbleView } from '@/shared/games/scrabble';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function ScrabbleGame({ view }: { room: RoomView; view: ScrabbleView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function ScrabbleSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
