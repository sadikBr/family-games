/** «من القائل؟» — the screen. */
import type { QquoteView } from '@/shared/games/qquote';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function QquoteGame({ view }: { room: RoomView; view: QquoteView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function QquoteSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
