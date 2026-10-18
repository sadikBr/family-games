/** «كلمة واحدة» — the screen. */
import type { OnewordView } from '@/shared/games/oneword';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function OnewordGame({ view }: { room: RoomView; view: OnewordView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function OnewordSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
