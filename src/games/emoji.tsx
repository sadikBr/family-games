/** «خمّن من الإيموجي» — STUB (to be written): the screen and the lobby settings. */
import type { EmojiView } from '@/shared/games/emoji';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function EmojiGame(_props: { room: RoomView; view: EmojiView }) {
  return <Txt center>قريباً</Txt>;
}

export function EmojiSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
