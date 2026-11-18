/** «أين تقع؟» — STUB (to be written): the screen and the lobby settings. */
import type { AynaView } from '@/shared/games/ayna';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function AynaGame(_props: { room: RoomView; view: AynaView }) {
  return <Txt center>قريباً</Txt>;
}

export function AynaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
