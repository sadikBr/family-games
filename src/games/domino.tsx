/** «الدومينو» — STUB (to be written): the screen and the lobby settings. */
import type { DominoView } from '@/shared/games/domino';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function DominoGame(_props: { room: RoomView; view: DominoView }) {
  return <Txt center>قريباً</Txt>;
}

export function DominoSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
