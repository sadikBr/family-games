/** «أين المكان؟» — the screen. */
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { MAPQUIZ_REGIONS, type MapquizPoint, type MapquizRegion, type MapquizSettings as Settings, type MapquizView } from '@/shared/games/mapquiz';
import type { RoomView } from '@/shared/protocol';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, QuestionPanel, QuizFinal, ResultRows, RevealNote, RoundHeader, SentNote, useMyResultFx } from './islamic-ui';
import { MapquizMap, type MapPin } from './mapquiz-map';

/** "1,234 كم" */
const km = (v: number) => `${num(v.toLocaleString('en-US'))} كم`;

function Results({ view, h }: { view: MapquizView; h: Helpers }) {
  return (
    <ResultRows
      h={h}
      lines={(view.results ?? []).map((r) => ({
        id: r.id,
        detail: r.km === null ? NO_ANSWER : km(r.km),
        gain: r.points > 0 ? num(`+${r.points}`) : num(0),
        good: r.points > 0,
        total: view.scores[r.id],
      }))}
    />
  );
}

export function MapquizGame({ room, view }: { room: RoomView; view: MapquizView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  const [pending, setPending] = useState<{ round: number; p: MapquizPoint } | null>(null);
  const playing = view.players.includes(h.me);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine ? mine.points >= 500 : null);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="mapquiz" h={h} />;
  if (!playing) return <Spectator room={room} />;

  const pin = pending && pending.round === view.round ? pending.p : null;
  const sent = view.mine !== null;
  const last = view.round >= view.rounds;
  const maxHeight = Math.max(220, height * 0.52);
  const color = (id: string) => h.player(id).color;

  let pins: MapPin[] = [];
  if (view.phase === 'play') {
    const p = view.mine ?? pin;
    if (p) pins = [{ key: h.me, point: p, color: color(h.me), me: true }];
  } else {
    pins = (view.results ?? []).flatMap((r) => (r.guess ? [{ key: r.id, point: r.guess, color: color(r.id), me: r.id === h.me }] : []));
  }

  const confirm = () => {
    if (!pin) return;
    haptic.medium();
    h.act('guess', { lat: pin.lat, lon: pin.lon, round: view.round });
  };

  return (
    <>
      <RoundHeader label={MAPQUIZ_REGIONS[view.region].label} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play' && !sent} /> : null}

      <QuestionPanel id={view.round} kicker={view.phase === 'play' ? 'أين يقع هذا المكان؟' : 'المكان الصحيح'} compact>
        <Txt v="title" center>
          {view.name}
        </Txt>
      </QuestionPanel>

      <MapquizMap
        region={view.region}
        width={width}
        maxHeight={maxHeight}
        pins={pins}
        truth={view.answer}
        onTap={
          view.phase === 'play' && !sent
            ? (p) => {
                haptic.tap();
                setPending({ round: view.round, p });
              }
            : undefined
        }
      />

      {view.phase === 'play' ? (
        <>
          {sent ? (
            <SentNote text="ثُبّت دبوسك — في انتظار الآخرين" />
          ) : (
            <Btn size="lg" icon="check" label={pin ? 'تأكيد الموقع' : 'المس الخريطة لوضع الدبوس'} disabled={!pin} onPress={confirm} />
          )}
          <AnsweredRow ids={view.guessed} total={view.players.length} h={h} />
        </>
      ) : (
        <>
          {mine ? (
            <MyVerdict
              tone={mine.km === null ? 'none' : mine.points >= 500 ? 'good' : 'bad'}
              text={mine.km === null ? 'لم تضع دبوسك في الوقت' : `دبوسك على بعد ${km(mine.km)} · ${num(`+${mine.points}`)}`}
            />
          ) : null}
          <RevealNote text={view.answer?.fact} />
          <Results view={view} h={h} />
          <HostNext h={h} last={last} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const REGIONS = (Object.keys(MAPQUIZ_REGIONS) as MapquizRegion[]).map((key) => ({ key, label: MAPQUIZ_REGIONS[key].label }));

export function MapquizSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.mapquiz;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'mapquiz', patch });
  return (
    <View style={{ gap: 10 }}>
      <Stepper label="عدد الجولات" value={s.rounds} min={3} max={20} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Stepper label="وقت الجولة" value={s.seconds} min={10} max={45} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${num(v)} ث`} />
      <Txt v="bold">الخريطة</Txt>
      <ChipPicker<MapquizRegion> editable={editable} value={s.region} onChange={(region) => change({ region })} options={REGIONS} />
    </View>
  );
}
