/** «قطار المغرب» — STUB (to be written): the screen and the lobby settings. */
import type { TrainView } from '@/shared/games/train';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function TrainGame(_props: { room: RoomView; view: TrainView }) {
  return <Txt center>قريباً</Txt>;
}

export function TrainSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
