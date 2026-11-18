/** «الطاولة» — STUB (to be written): the screen and the lobby settings. */
import type { TawlaView } from '@/shared/games/tawla';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function TawlaGame(_props: { room: RoomView; view: TawlaView }) {
  return <Txt center>قريباً</Txt>;
}

export function TawlaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
