/** «ماذا قال الناس؟» — the screen. */
import type { SurveyView } from '@/shared/games/survey';
import type { RoomView } from '@/shared/protocol';
import { Txt } from '@/ui/txt';

export function SurveyGame({ view }: { room: RoomView; view: SurveyView }) {
  return <Txt center>{view.phase}</Txt>;
}

/** Lobby settings for this game (null: none). */
export function SurveySettings(_props: { room: RoomView; editable: boolean }) {
  return null;
}
