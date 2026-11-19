/** «مكية أم مدنية؟» — STUB (to be written): the screen and the lobby settings. */
import type { MakkiView } from '@/shared/games/makki';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MakkiGame(_props: { room: RoomView; view: MakkiView }) {
  return <Txt center>قريباً</Txt>;
}

export function MakkiSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
