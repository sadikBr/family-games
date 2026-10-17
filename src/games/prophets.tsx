/** «قصص الأنبياء» — the screen. */
import type { ProphetsView } from '@/shared/games/prophets';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function ProphetsGame({ view }: { room: RoomView; view: ProphetsView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function ProphetsSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
