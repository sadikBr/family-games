/** «البلد الغامض» — STUB (to be written): the screen and the lobby settings. */
import type { BaladView } from '@/shared/games/balad';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function BaladGame(_props: { room: RoomView; view: BaladView }) {
  return <Txt center>قريباً</Txt>;
}

export function BaladSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
