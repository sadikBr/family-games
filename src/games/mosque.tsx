/** «ابنِ المسجد» — the screen. */
import type { MosqueView } from '@/shared/games/mosque';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function MosqueGame({ view }: { room: RoomView; view: MosqueView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function MosqueSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
