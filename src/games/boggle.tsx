/** «حروف مبعثرة» — the screen. */
import type { BoggleView } from '@/shared/games/boggle';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function BoggleGame({ view }: { room: RoomView; view: BoggleView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function BoggleSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
