/** «المنقلة» — the screen. */
import type { MancalaView } from '@/shared/games/mancala';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MancalaGame({ view }: { room: RoomView; view: MancalaView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function MancalaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
