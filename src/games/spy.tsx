/** «الجاسوس» — the screen. */
import type { SpyView } from '@/shared/games/spy';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function SpyGame({ view }: { room: RoomView; view: SpyView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function SpySettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
