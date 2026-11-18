/** «أكمل المثل» — STUB (to be written): the screen and the lobby settings. */
import type { MathalView } from '@/shared/games/mathal';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MathalGame(_props: { room: RoomView; view: MathalView }) {
  return <Txt center>قريباً</Txt>;
}

export function MathalSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
