/** «مشوار الحياة» — the screen. */
import type { LifeView } from '@/shared/games/life';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function LifeGame({ view }: { room: RoomView; view: LifeView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function LifeSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
