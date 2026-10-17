/** «كلمة قرآنية» — the screen. */
import type { QwordView } from '@/shared/games/qword';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function QwordGame({ view }: { room: RoomView; view: QwordView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function QwordSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
