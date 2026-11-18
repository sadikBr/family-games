/** «رتّب الأحداث» — STUB (to be written): the screen and the lobby settings. */
import type { TartibView } from '@/shared/games/tartib';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function TartibGame(_props: { room: RoomView; view: TartibView }) {
  return <Txt center>قريباً</Txt>;
}

export function TartibSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
