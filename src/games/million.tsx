/** «من سيربح المليون؟» — STUB (to be written): the screen and the lobby settings. */
import type { MillionView } from '@/shared/games/million';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MillionGame(_props: { room: RoomView; view: MillionView }) {
  return <Txt center>قريباً</Txt>;
}

export function MillionSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
