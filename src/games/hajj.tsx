/** «رحلة الحج» — race along the Hajj journey; every pilgrim stops at each station. */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { HAJJ_COLS, HAJJ_LEN, HAJJ_STATIONS, hajjCell } from '@/shared/islamic';
import type { HajjView, RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Btn } from '@/ui/btn';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { LastEvent } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { EventCard, RaceStrip, RaceToken, stackOffsets } from './dice-race';
import { helpers } from './helpers';
import { OptionGrid } from './islamic-ui';

const ASPECT = 70 / 90; // board image height / width
const nextStation = (pos: number) => Math.min(HAJJ_LEN - 1, (Math.floor(pos / 4) + 1) * 4);
const stationName = (pos: number) => {
  if (pos === 0) return 'في الانطلاق';
  const passed = Math.floor(pos / 4) - 1;
  return pos % 4 === 0 ? HAJJ_STATIONS[pos / 4 - 1].title : passed >= 0 ? `بعد ${HAJJ_STATIONS[passed].title}` : 'في الطريق';
};

export function HajjGame({ room, view }: { room: RoomView; view: HajjView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 16, 560);
  const H = W * ASPECT;
  const [landed, setLanded] = useState(view.rollId);
  const me = view.players.find((p) => p.id === h.me);
  if (!me && view.phase !== 'final') return <Spectator room={room} />;

  if (view.phase === 'final') {
    const won = view.winner === h.me;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<GameArt id="hajj" size={84} />}
          title={view.winner ? `${h.player(view.winner).name} أتمّ الرحلة أولاً` : 'انتهت الرحلة'}
          sub="حجّاً مبروراً وسعياً مشكوراً"
        />
        {view.card ? <EventCard card={view.card} h={h} /> : null}
        <PlayAgain room={room} />
      </>
    );
  }

  const myTurn = view.turn === h.me;
  const rolling = view.rollId !== landed;
  const at = (sq: number) => {
    const c = hajjCell(sq);
    return { x: c.x * W, y: c.y * H };
  };
  const size = (W / HAJJ_COLS) * 0.55;
  const offsets = stackOffsets(view.players, size * 0.35);
  const q = view.question;

  return (
    <>
      <RaceStrip players={view.players} turn={view.turn} h={h} label={stationName} />
      <View style={{ width: W, height: H, alignSelf: 'center', direction: 'ltr', borderRadius: 14, overflow: 'hidden' }}>
        <Image source={BOARD_IMG['hajj-board']} style={StyleSheet.absoluteFill} contentFit="fill" />
        {view.players.map((p) => (
          <RaceToken
            key={p.id}
            player={h.player(p.id)}
            pos={p.pos}
            at={at}
            size={size}
            offset={offsets[p.id]}
            rollId={view.rollId}
            dice={view.dice}
            landingOf={(from, d) => Math.min(nextStation(from), from + d)}
          />
        ))}
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
          <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={W} height={H} size={W * 0.13} linger={2200} onLanded={() => setLanded(view.rollId)} />
        </View>
      </View>

      {q && !rolling ? (
        <View style={styles.panel}>
          <Txt v="tiny" color={C.yellow}>
            {q.for === h.me ? 'سؤال لك — أجب صحيحاً وتقدّم خانتين' : `سؤال لـ${h.player(q.for).name}`}
          </Txt>
          <Txt v="h3">{q.text}</Txt>
          <TimerBar endsAt={q.endsAt} total={20000} onTick={q.for === h.me} />
          <OptionGrid options={q.options} mine={null} correct={null} disabled={q.for !== h.me} onPick={(choice) => h.act('answer', { choice })} columns={1} />
        </View>
      ) : (
        <View style={styles.panel}>
          {myTurn && view.phase === 'roll' && !rolling ? (
            <Btn
              size="xl"
              icon="shuffle"
              label="ارمِ النرد"
              onPress={() => {
                haptic.medium();
                h.act('roll');
              }}
            />
          ) : (
            <Txt v="bold" center color={C.muted}>
              {rolling ? 'النرد يتدحرج…' : `دور ${h.player(view.turn).name}…`}
            </Txt>
          )}
        </View>
      )}

      {view.card && !rolling ? <EventCard card={view.card} h={h} /> : null}
      <LastEvent feed={view.feed} h={h} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 10 },
});
