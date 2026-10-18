/** «الرسم المتسلسل» — the screen. */
import type { TeledrawView } from '@/shared/games/teledraw';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function TeledrawGame({ view }: { room: RoomView; view: TeledrawView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function TeledrawSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
