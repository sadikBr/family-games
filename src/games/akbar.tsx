/** «أكبر أم أصغر؟» — STUB (to be written): the screen and the lobby settings. */
import type { AkbarView } from '@/shared/games/akbar';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function AkbarGame(_props: { room: RoomView; view: AkbarView }) {
  return <Txt center>قريباً</Txt>;
}

export function AkbarSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
