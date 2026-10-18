/** «البلوط» — the screen. */
import type { BalootView } from '@/shared/games/baloot';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function BalootGame({ view }: { room: RoomView; view: BalootView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function BalootSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
