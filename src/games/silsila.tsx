/** «سلسلة الذاكرة» — STUB (to be written): the screen and the lobby settings. */
import type { SilsilaView } from '@/shared/games/silsila';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function SilsilaGame(_props: { room: RoomView; view: SilsilaView }) {
  return <Txt center>قريباً</Txt>;
}

export function SilsilaSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
