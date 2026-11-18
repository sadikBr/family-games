/** «الروابط» — STUB (to be written): the screen and the lobby settings. */
import type { RawabitView } from '@/shared/games/rawabit';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function RawabitGame(_props: { room: RoomView; view: RawabitView }) {
  return <Txt center>قريباً</Txt>;
}

export function RawabitSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
