/** «القاموس العجيب» — STUB (to be written): the screen and the lobby settings. */
import type { QamusView } from '@/shared/games/qamus';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function QamusGame(_props: { room: RoomView; view: QamusView }) {
  return <Txt center>قريباً</Txt>;
}

export function QamusSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
