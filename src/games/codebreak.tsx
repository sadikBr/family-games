/** «فك الشيفرة» — the screen. */
import type { CodebreakView } from '@/shared/games/codebreak';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function CodebreakGame({ view }: { room: RoomView; view: CodebreakView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function CodebreakSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
