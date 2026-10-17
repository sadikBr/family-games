/** «رتّب الخطوات» — the screen. */
import type { StepsView } from '@/shared/games/steps';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function StepsGame({ view }: { room: RoomView; view: StepsView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function StepsSettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
