/** «أين المكان؟» — the screen. */
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { MAPQUIZ_REGIONS, type MapquizLevel, type MapquizPoint, type MapquizRegion, type MapquizSettings as Settings, type MapquizView } from '@/shared/games/mapquiz';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, IconBubble, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, RoundHeader, useMyResultFx } from './islamic-ui';
import { MapquizMap, type MapPin } from './mapquiz-map';

const ACCENT = '#22B8B0';

/** "1,234 كم" */
const km = (v: number) => `${num(v.toLocaleString('en-US'))} كم`;

function Results({ view, h }: { view: MapquizView; h: Helpers }) {
  const rows = [...(view.results ?? [])].sort((a, b) => b.points - a.points || (a.km ?? 1e9) - (b.km ?? 1e9));
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r) => (
        <Row key={r.id} gap={8} style={[styles.result, r.id === h.me && { backgroundColor: alpha(C.yellow, 0.12) }]}>
          <Avatar player={h.player(r.id)} size={26} />
          <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
            {h.player(r.id).name}
          </Txt>
          <Txt v="tiny" color={r.km === null ? C.dim : C.muted}>
            {r.km === null ? 'لم يُجب' : km(r.km)}
          </Txt>
          <Txt style={[styles.points, { color: r.points > 0 ? C.green : C.dim }]}>{r.points > 0 ? num(`+${r.points}`) : num(0)}</Txt>
        </Row>
      ))}
    </View>
  );
}

function Final({ room, view, h }: { room: RoomView; view: MapquizView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<IconBubble icon="globe" size={64} color={alpha('#FFFFFF', 0.16)} iconColor="#FFFFFF" />}
        title={winners.length === 1 ? `فاز ${h.player(winners[0]).name}` : 'تعادل!'}
        sub="بارك الله فيكم جميعاً"
      />
      <Podium players={room.players} scores={view.scores} />
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
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
  if (view.phase === 'final') return <Final room={room} view={view} h={h} />;
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

      <Animated.View key={view.round} entering={FadeIn.duration(220)} style={styles.prompt}>
        <Txt v="tiny" center color={C.muted}>
          {view.phase === 'play' ? 'أين يقع هذا المكان؟' : 'المكان الصحيح'}
        </Txt>
        <Txt v="title" center>
          {view.name}
        </Txt>
      </Animated.View>

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
        sent ? (
          <>
            <Txt v="bold" center color={C.green}>
              ثُبّت دبوسك — في انتظار الآخرين
            </Txt>
            <AnsweredRow ids={view.guessed} total={view.players.length} h={h} />
          </>
        ) : (
          <>
            <Btn size="lg" icon="check" label={pin ? 'تأكيد الموقع' : 'المس الخريطة لوضع الدبوس'} color={C.green} disabled={!pin} onPress={confirm} />
            <AnsweredRow ids={view.guessed} total={view.players.length} h={h} />
          </>
        )
      ) : (
        <>
          {view.answer ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.fact}>
              <Txt v="bold" center>
                {view.answer.fact}
              </Txt>
              {mine ? (
                <Txt v="h3" center color={mine.km === null ? C.muted : mine.points >= 500 ? C.green : C.yellow}>
                  {mine.km === null ? 'لم تضع دبوسك في الوقت' : `دبوسك على بعد ${km(mine.km)} · ${num(`+${mine.points}`)}`}
                </Txt>
              ) : null}
            </Animated.View>
          ) : null}
          <Results view={view} h={h} />
          {h.isHost ? (
            <Btn size="lg" icon="play" label={last ? 'النتيجة النهائية' : 'الجولة التالية'} onPress={() => h.act('next')} />
          ) : (
            <HostNote>{last ? 'النتيجة النهائية بعد قليل' : 'الجولة التالية بعد قليل'}</HostNote>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const LEVELS: { key: MapquizLevel; label: string }[] = [
  { key: 'easy', label: 'سهل' },
  { key: 'medium', label: 'متوسط' },
  { key: 'hard', label: 'صعب' },
];
const REGIONS = (Object.keys(MAPQUIZ_REGIONS) as MapquizRegion[]).map((key) => ({ key, label: MAPQUIZ_REGIONS[key].label }));

export function MapquizSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.mapquiz;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'mapquiz', patch });
  return (
    <View style={{ gap: 10 }}>
      <Stepper label="عدد الجولات" value={s.rounds} min={3} max={20} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Stepper label="وقت الجولة" value={s.seconds} min={10} max={45} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${v} ث`} />
      <Txt v="bold">الخريطة</Txt>
      <ChipPicker<MapquizRegion> editable={editable} value={s.region} onChange={(region) => change({ region })} options={REGIONS} />
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker<MapquizLevel> editable={editable} value={s.level} onChange={(level) => change({ level })} options={LEVELS} />
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { backgroundColor: C.surface, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 2, borderColor: alpha(ACCENT, 0.6) },
  fact: { backgroundColor: C.surface, borderRadius: 18, padding: 12, gap: 6 },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  points: { fontFamily: F.black, fontSize: 15, lineHeight: 22, minWidth: 52, textAlign: 'center' },
});
