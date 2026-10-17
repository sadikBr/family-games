/** «تمثيل صامت» — the screen. */
import type { CharadesView } from '@/shared/games/charades';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function CharadesGame({ view }: { room: RoomView; view: CharadesView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function CharadesSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
