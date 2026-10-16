import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { cellOf } from '@/shared/ludo';
import type { LudoColor, LudoView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { LastEvent } from './cards/card-ui';

// board image: viewBox -6..156 → the 15×15 grid spans 6/162 … 156/162
const INSET = 6 / 162;
const SPAN = 150 / 162;
const HEX: Record<LudoColor, string> = { red: '#E2475F', green: '#2FB67C', yellow: '#F2B33D', blue: '#3D7BE0' };
const NAME: Record<LudoColor, string> = { red: 'الأحمر', green: 'الأخضر', yellow: 'الأصفر', blue: 'الأزرق' };

export function LudoGame({ room, view }: { room: RoomView; view: LudoView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 32, 460);
  const cell = (boardW * SPAN) / 15;
  const off = boardW * INSET;
  const mySeat = view.seats.find((x) => x.id === h.me);
  if (!mySeat && view.phase !== 'final') return <Spectator room={room} />;

  const myTurn = view.phase !== 'final' && view.turn === h.me;
  const turnSeat = view.seats.find((x) => x.id === view.turn);

  if (view.phase === 'final') {
    const won = view.winner === h.me;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="ludo" size={84} />} title={view.winner ? `فاز ${h.player(view.winner).name}` : 'انتهت اللعبة'} />
        <PlayAgain room={room} />
      </>
    );
  }

  // tokens grouped by cell so stacked pieces fan out a little
  const items: { key: string; color: LudoColor; id: string; t: number; x: number; y: number }[] = [];
  const byCell = new Map<string, number>();
  for (const seat of view.seats) {
    view.tokens[seat.id]?.forEach((p, t) => {
      const [r, c] = cellOf(seat.color, p, t);
      const k = `${r}:${c}`;
      const n = byCell.get(k) ?? 0;
      byCell.set(k, n + 1);
      const shift = p >= 0 ? n * 0.18 : 0;
      items.push({ key: `${seat.id}:${t}`, color: seat.color, id: seat.id, t, x: c + shift, y: r - shift });
    });
  }
  const size = cell * 1.15;

  return (
    <>
      <View style={styles.seats}>
        {view.seats.map((s) => {
          const active = s.id === view.turn;
          const home = view.tokens[s.id]?.filter((p) => p === 56).length ?? 0;
          return (
            <View key={s.id} style={[styles.seat, { borderColor: active ? HEX[s.color] : 'transparent' }, active && { backgroundColor: alpha(HEX[s.color], 0.22) }]}>
              <Avatar player={h.player(s.id)} size={26} ring={HEX[s.color]} />
              <View>
                <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 70 }}>
                  {h.player(s.id).name}
                </Txt>
                <Txt v="tiny" color={C.dim}>
                  {home}/4 في البيت
                </Txt>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ width: boardW, height: boardW, alignSelf: 'center', direction: 'ltr' }}>
        <Image source={BOARD_IMG['ludo-board']} style={StyleSheet.absoluteFill} contentFit="contain" />
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
          <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={boardW} height={boardW} size={boardW * 0.16} linger={2200} />
        </View>
        {items.map((it) => {
          const canMove = myTurn && it.id === h.me && view.movable.includes(it.t);
          return (
            <Animated.View
              key={it.key}
              layout={LinearTransition.duration(260)}
              style={[styles.token, { left: off + it.x * cell - size / 2, top: off + it.y * cell - size * 0.6, width: size, height: size }]}>
              <Pressable
                disabled={!canMove}
                onPress={() => {
                  haptic.medium();
                  h.act('move', { token: it.t });
                }}
                accessibilityLabel={canMove ? `حرّك القطعة ${it.t + 1}` : undefined}
                style={[styles.tokenHit, canMove && { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.25) }]}>
                <Image source={BOARD_IMG[`pawn-${it.color}`]} style={{ width: size, height: size }} contentFit="contain" />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.bottom}>
        <Pressable
          disabled={!(myTurn && view.phase === 'roll')}
          onPress={() => {
            haptic.medium();
            h.act('roll');
          }}
          accessibilityLabel="ارمِ النرد"
          style={[styles.diceBtn, myTurn && view.phase === 'roll' && styles.diceReady]}>
          {view.dice ? (
            <Image source={BOARD_IMG[`dice3d-${view.dice}`]} style={{ width: 70, height: 70 }} contentFit="contain" />
          ) : (
            <View style={styles.rollHint}>
              <Txt v="h3">ارمِ</Txt>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="bold" color={myTurn ? C.yellow : C.muted}>
            {myTurn ? (view.phase === 'roll' ? 'دورك — اضغط على النرد' : 'اختر قطعة لتحريكها') : `دور ${h.player(view.turn).name}…`}
          </Txt>
          {turnSeat ? (
            <View style={[styles.colorTag, { backgroundColor: HEX[turnSeat.color] }]}>
              <Txt v="tiny" color="#fff">
                {NAME[turnSeat.color]}
              </Txt>
            </View>
          ) : null}
          {mySeat ? (
            <Txt style={{ fontFamily: F.bold, fontSize: 12, color: C.dim }}>
              لونك: {NAME[mySeat.color]}
            </Txt>
          ) : null}
        </View>
      </View>
      <LastEvent feed={view.feed} h={h} />
    </>
  );
}

const styles = StyleSheet.create({
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 2 },
  token: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  tokenHit: { borderRadius: 999, borderWidth: 2.5, borderColor: 'transparent' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 20, padding: 12 },
  diceBtn: { padding: 2, borderRadius: 20, borderWidth: 3, borderColor: 'transparent', overflow: 'visible' },
  rollHint: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: C.borderStrong },
  diceReady: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.15) },
  colorTag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 1, borderWidth: 2, borderColor: '#151726' },
});
