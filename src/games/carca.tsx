/** «المدن والطرق» — the screen. */
import type { CarcaView } from '@/shared/games/carca';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function CarcaGame({ view }: { room: RoomView; view: CarcaView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function CarcaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
