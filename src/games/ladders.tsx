/** «سلّم الحسنات» — snakes & ladders: good deeds lift you up, bad habits pull you down. */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { LADDERS, SNAKES, laddersCell } from '@/shared/islamic';
import type { LaddersView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Btn } from '@/ui/btn';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { LastEvent } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { EventCard, RaceStrip, RaceToken, stackOffsets } from './dice-race';
import { helpers } from './helpers';

export function LaddersGame({ room, view }: { room: RoomView; view: LaddersView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 16, 520);
  const [landed, setLanded] = useState(view.rollId);
  const me = view.players.find((p) => p.id === h.me);
  if (!me && view.phase !== 'final') return <Spectator room={room} />;

  if (view.phase === 'final') {
    const won = view.winner === h.me;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="ladders" size={84} />} title={view.winner ? `فاز ${h.player(view.winner).name}` : 'انتهت اللعبة'} sub="الحسنات ترفع صاحبها" />
        <PlayAgain room={room} />
      </>
    );
  }

  const exact = room.settings.ladders.exact;
  const myTurn = view.turn === h.me;
  const rolling = view.rollId !== landed;
  const cell = W / 10;
  const at = (sq: number) => {
    if (sq <= 0) return { x: W - cell * 0.5, y: W - cell * 0.5 }; // waiting on square 1
    const c = laddersCell(sq);
    return { x: c.x * W, y: c.y * W };
  };
  const size = cell * 0.62;
  const offsets = stackOffsets(view.players, size * 0.3);

  return (
    <>
      <RaceStrip players={view.players} turn={view.turn} h={h} label={(pos) => (pos ? `الخانة ${num(pos)}` : 'لم يبدأ')} />
      <View style={{ width: W, height: W, alignSelf: 'center', direction: 'ltr', borderRadius: 12, overflow: 'visible' }}>
        <Image source={BOARD_IMG['ladders-board']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} contentFit="fill" />
        {[...LADDERS, ...SNAKES].map((d) => {
          const c = laddersCell(d.from);
          const good = LADDERS.includes(d);
          return (
            <View key={d.from} style={[styles.badge, { width: cell * 0.38, height: cell * 0.38, borderRadius: cell, left: c.x * W - cell * 0.48, top: c.y * W + cell * 0.08, backgroundColor: good ? C.green : C.red }]} pointerEvents="none">
              <Icon name={d.icon as IconName} size={cell * 0.26} color="#fff" />
            </View>
          );
        })}
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
            landingOf={(from, d) => (from + d > 100 ? (exact ? from : 100) : from + d)}
          />
        ))}
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
          <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={W} height={W} size={W * 0.15} linger={2200} onLanded={() => setLanded(view.rollId)} />
        </View>
      </View>

      <View style={styles.panel}>
        {myTurn && !rolling ? (
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
        <Txt v="tiny" center color={C.dim}>
          السلالم أعمال صالحة ترفعك، والأفاعي عادات سيئة تُنزلك{exact ? ' — تحتاج الرقم المضبوط للوصول إلى 100' : ''}
        </Txt>
      </View>
      {view.card && !rolling ? <EventCard card={view.card} h={h} /> : null}
      <LastEvent feed={view.feed} h={h} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 8 },
  badge: { position: 'absolute', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: alpha('#151726', 0.9) },
});
