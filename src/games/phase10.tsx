/** «المراحل العشر» — the screen. */
import type { Phase10View } from '@/shared/games/phase10';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function Phase10Game({ view }: { room: RoomView; view: Phase10View }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function Phase10Settings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
