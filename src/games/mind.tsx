/** «العقل الواحد» — STUB (to be written): the screen and the lobby settings. */
import type { MindView } from '@/shared/games/mind';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MindGame(_props: { room: RoomView; view: MindView }) {
  return <Txt center>قريباً</Txt>;
}

export function MindSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
