/** «المربعات» — the screen. */
import type { DotsView } from '@/shared/games/dots';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function DotsGame({ view }: { room: RoomView; view: DotsView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function DotsSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
