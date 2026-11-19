/** «القنبلة» — STUB (to be written): the screen and the lobby settings. */
import type { BombView } from '@/shared/games/bomb';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function BombGame(_props: { room: RoomView; view: BombView }) {
  return <Txt center>قريباً</Txt>;
}

export function BombSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
