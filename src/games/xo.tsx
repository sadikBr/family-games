/** «إكس أو» — tic-tac-toe on a big friendly board. */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import type { RoomView, XoView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar } from './duel';
import { helpers } from './helpers';

const INK = '#151726';
const COLOR = { x: '#E2475F', o: '#3DB7E4' } as const;

function Mark({ m, size }: { m: 'x' | 'o'; size: number }) {
  const t = size * (size < 24 ? 0.26 : 0.16);
  const ink = size < 24 ? 1.2 : 2.5;
  if (m === 'o')
    return (
      <View style={{ width: size, height: size, borderRadius: size, borderWidth: ink, borderColor: INK }}>
        <View style={{ flex: 1, borderRadius: size, borderWidth: Math.max(1.5, t - 2 * ink), borderColor: COLOR.o }}>
          <View style={{ flex: 1, borderRadius: size, borderWidth: ink, borderColor: INK }} />
        </View>
      </View>
    );
  const bar = (rot: string) => (
    <View style={{ position: 'absolute', left: (size - t) / 2, top: -size * 0.12, width: t, height: size * 1.24, borderRadius: t, backgroundColor: COLOR.x, borderWidth: ink, borderColor: INK, transform: [{ rotate: rot }] }} />
  );
  return (
    <View style={{ width: size, height: size }}>
      {bar('45deg')}
      {bar('-45deg')}
    </View>
  );
}

export function XoGame({ room, view }: { room: RoomView; view: XoView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 40, 360);
  const cell = W / 3;
  if (view.mine === null && view.phase === 'play') return <Spectator room={room} />;
  const myTurn = view.phase === 'play' && view.turn === view.mine;
  const line = new Set(view.line ?? []);
  const idOf = (m: 'x' | 'o') => (m === 'x' ? view.x : view.o);
  const won = view.phase === 'final' && view.winner === view.mine;

  return (
    <>
      {won ? <Confetti /> : null}
      <DuelBar
        h={h}
        active={view.phase === 'play' ? idOf(view.turn) : null}
        slots={(['x', 'o'] as const).map((m) => ({ id: idOf(m), color: COLOR[m], mark: <Mark m={m} size={14} />, sub: `الفوز: ${num(view.score[idOf(m)] ?? 0)}` }))}
      />
      {view.phase === 'final' ? (
        <ResultBanner
          tone={won ? 'good' : view.winner === 'draw' ? 'neutral' : 'bad'}
          art={<GameArt id="xo" size={72} />}
          title={view.winner === 'draw' ? 'تعادل!' : `فاز ${h.player(idOf(view.winner as 'x' | 'o')).name}`}
          sub={view.winner === 'draw' ? 'لا أحد صفّ ثلاثة' : 'ثلاثة في خط!'}
        />
      ) : (
        <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
          {myTurn ? 'دورك — اختر خانة' : `دور ${h.player(idOf(view.turn)).name}…`}
        </Txt>
      )}

      <View style={[styles.board, { width: W + 6, height: W + 6 }]}>
        {view.board.map((m, i) => {
          const r = Math.floor(i / 3), c = i % 3;
          return (
            <Pressable
              key={i}
              disabled={!myTurn || !!m}
              onPress={() => {
                haptic.medium();
                h.act('mark', { cell: i });
              }}
              accessibilityLabel={`الخانة ${i + 1}`}
              style={({ pressed }) => [
                styles.cell,
                { left: c * cell, top: r * cell, width: cell, height: cell },
                line.has(i) && { backgroundColor: alpha(C.yellow, 0.35) },
                pressed && { backgroundColor: alpha('#7B4BD0', 0.18) },
              ]}>
              {m ? (
                <Animated.View key={m} entering={ZoomIn.springify().damping(12)}>
                  <Mark m={m} size={cell * 0.52} />
                </Animated.View>
              ) : null}
            </Pressable>
          );
        })}
        <View pointerEvents="none" style={[styles.rule, { left: cell - 2, top: 10, bottom: 10, width: 4 }]} />
        <View pointerEvents="none" style={[styles.rule, { left: cell * 2 - 2, top: 10, bottom: 10, width: 4 }]} />
        <View pointerEvents="none" style={[styles.rule, { top: cell - 2, left: 10, right: 10, height: 4 }]} />
        <View pointerEvents="none" style={[styles.rule, { top: cell * 2 - 2, left: 10, right: 10, height: 4 }]} />
      </View>

      {view.phase === 'final' ? <PlayAgain room={room} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: '#FFF4DA', borderRadius: 24, borderWidth: 3, borderColor: INK },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  rule: { position: 'absolute', backgroundColor: '#C9B9E8', borderRadius: 2 },
});
