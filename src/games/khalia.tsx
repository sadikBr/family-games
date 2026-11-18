/** «خلية الحروف» — STUB (to be written): the screen and the lobby settings. */
import type { KhaliaView } from '@/shared/games/khalia';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function KhaliaGame(_props: { room: RoomView; view: KhaliaView }) {
  return <Txt center>قريباً</Txt>;
}

export function KhaliaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
