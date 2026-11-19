/** «املأ القائمة» — STUB (to be written): the screen and the lobby settings. */
import type { QaimaView } from '@/shared/games/qaima';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function QaimaGame(_props: { room: RoomView; view: QaimaView }) {
  return <Txt center>قريباً</Txt>;
}

export function QaimaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
