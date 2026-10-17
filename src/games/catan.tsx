/** «المستوطنون» — the screen. */
import type { CatanView } from '@/shared/games/catan';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function CatanGame({ view }: { room: RoomView; view: CatanView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function CatanSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
