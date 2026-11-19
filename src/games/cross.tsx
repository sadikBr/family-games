/** «الكلمات المتقاطعة» — STUB (to be written): the screen and the lobby settings. */
import type { CrossView } from '@/shared/games/cross';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function CrossGame(_props: { room: RoomView; view: CrossView }) {
  return <Txt center>قريباً</Txt>;
}

export function CrossSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
