/** «أسماء الله الحسنى» — the screen. */
import type { AsmaView } from '@/shared/games/asma';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function AsmaGame({ view }: { room: RoomView; view: AsmaView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function AsmaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
