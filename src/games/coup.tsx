/** «الانقلاب» — STUB (to be written): the screen and the lobby settings. */
import type { CoupView } from '@/shared/games/coup';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function CoupGame(_props: { room: RoomView; view: CoupView }) {
  return <Txt center>قريباً</Txt>;
}

export function CoupSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
