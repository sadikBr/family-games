/** «أين المكان؟» — the screen. */
import type { MapquizView } from '@/shared/games/mapquiz';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MapquizGame({ view }: { room: RoomView; view: MapquizView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function MapquizSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
