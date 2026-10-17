/** «القطع الملونة» — the screen. */
import type { BlocksView } from '@/shared/games/blocks';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function BlocksGame({ view }: { room: RoomView; view: BlocksView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function BlocksSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
