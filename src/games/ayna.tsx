/** «أين تقع؟» — the screen (the place, the map, the pin, the reveal, the podium) and the lobby settings. */
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  AYNA_MAPS,
  AYNA_MAP_SETTINGS,
  AYNA_ROUNDS,
  AYNA_SECONDS,
  AYNA_TYPE_LABEL,
  type AynaMapSetting,
  type AynaPoint,
  type AynaSettings as Settings,
  type AynaView,
} from '@/shared/games/ayna';
import type { RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { AynaMap, type AynaPin } from './ayna-map';
import { helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, QuestionPanel, QuizFinal, ResultRows, RoundHeader, SentNote, useMyResultFx } from './islamic-ui';

/** "1,234 كم" */
const km = (v: number) => `${num(v.toLocaleString('en-US'))} كم`;

export function AynaGame({ room, view }: { room: RoomView; view: AynaView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  /** my pin as I tap it (the server has it too; this one moves at once) */
  const [local, setLocal] = useState<{ round: number; p: AynaPoint } | null>(null);
  const playing = view.players.includes(h.me);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine ? mine.points >= 500 : null);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="ayna" h={h} sub="أحسنتم جميعاً" />;
  if (!playing) return <Spectator room={room} />;

  const confirmed = view.confirmed.includes(h.me);
  const pin = (local && local.round === view.round ? local.p : null) ?? view.mine;
  const last = view.round >= view.rounds;
  const maxHeight = Math.min(Math.max(220, height * 0.5), dk(560));
  const color = (id: string) => h.player(id).color;

  let pins: AynaPin[] = [];
  if (view.phase === 'play') {
    if (pin) pins = [{ key: h.me, point: pin, color: color(h.me), me: true }];
  } else {
    pins = (view.results ?? []).flatMap((r) => (r.guess ? [{ key: r.id, point: r.guess, color: color(r.id), me: r.id === h.me, player: h.player(r.id) }] : []));
  }

  const place = (p: AynaPoint) => {
    haptic.tap();
    setLocal({ round: view.round, p });
    h.act('pin', { lat: p.lat, lon: p.lon, round: view.round });
  };
  const confirm = () => {
    if (!pin) return;
    haptic.medium();
    h.act('confirm', { lat: pin.lat, lon: pin.lon, round: view.round });
  };

  return (
    <>
      <RoundHeader label={AYNA_MAPS[view.map].label} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play' && !confirmed} /> : null}

      <QuestionPanel
        id={view.round}
        kicker={view.phase === 'play' ? `${AYNA_TYPE_LABEL[view.type]} · أين تقع؟` : 'المكان الصحيح'}
        compact
        below={
          view.answer?.where ? (
            <Txt v="small" center color={C.muted}>
              {view.answer.where}
            </Txt>
          ) : null
        }>
        <Txt v="title" center>
          {view.name}
        </Txt>
      </QuestionPanel>

      <AynaMap
        key={`${view.round}-${view.phase}`}
        map={view.map}
        width={width}
        maxHeight={maxHeight}
        pins={pins}
        truth={view.answer}
        onTap={view.phase === 'play' && !confirmed ? place : undefined}
      />

      {view.phase === 'play' ? (
        <>
          {confirmed ? (
            <SentNote text="ثُبّت دبوسك — في انتظار الآخرين" />
          ) : (
            <Btn size="lg" icon="check" label={pin ? 'تأكيد' : 'المس الخريطة لوضع الدبوس'} disabled={!pin} onPress={confirm} />
          )}
          <AnsweredRow ids={view.confirmed} total={view.players.length} h={h} label="التأكيد:" />
        </>
      ) : (
        <>
          {mine ? (
            <MyVerdict
              tone={mine.km === null ? 'none' : mine.points >= 500 ? 'good' : 'bad'}
              text={mine.km === null ? 'لا دبوس لك في هذه الجولة' : `دبوسك على بعد ${km(mine.km)} · ${num(`+${mine.points}`)}`}
            />
          ) : null}
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: r.km === null ? NO_ANSWER : `${km(r.km)}${r.confirmed ? '' : ' · دون تأكيد'}`,
              gain: r.points > 0 ? num(`+${r.points}`) : num(0),
              good: r.points > 0,
              total: view.scores[r.id],
            }))}
          />
          <HostNext h={h} last={last} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = AYNA_ROUNDS.map((n) => ({ key: String(n), label: `${num(n)} جولات` }));
const SECOND_OPTIONS = AYNA_SECONDS.map((n) => ({ key: String(n), label: `${num(n)} ث` }));

export function AynaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.ayna;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'ayna', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الخريطة</Txt>
      <ChipPicker<AynaMapSetting> editable={editable} value={s.map} onChange={(map) => change({ map })} options={AYNA_MAP_SETTINGS} />
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل جولة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
    </View>
  );
}
