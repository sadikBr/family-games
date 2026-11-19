/** «من الأرجح؟» — STUB (to be written): the screen and the lobby settings. */
import type { ArjahView } from '@/shared/games/arjah';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function ArjahGame(_props: { room: RoomView; view: ArjahView }) {
  return <Txt center>قريباً</Txt>;
}

export function ArjahSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
