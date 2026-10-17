/** «مسابقة التجويد» — the screen. */
import type { TajweedView } from '@/shared/games/tajweed';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function TajweedGame({ view }: { room: RoomView; view: TajweedView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function TajweedSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
