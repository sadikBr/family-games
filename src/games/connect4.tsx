/** «أربعة في صف» — tap a column to drop a disc; four in a row wins. */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { COLS, ROWS } from '@/shared/connect4';
import type { Connect4View, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

const DISC = { 1: '#E2475F', 2: '#F2C23D' } as const;
const NAME = { 1: 'الأحمر', 2: 'الأصفر' } as const;

function Players({ view, h }: { view: Connect4View; h: Helpers }) {
  return (
    <Row gap={10} style={{ justifyContent: 'center' }}>
      {([1, 2] as const).map((d) => {
        const id = d === 1 ? view.red : view.yellow;
        const active = view.phase === 'play' && view.turn === d;
        return (
          <View key={d} style={[styles.player, active && { borderColor: DISC[d], backgroundColor: alpha(DISC[d], 0.18) }]}>
            <View style={[styles.dot, { backgroundColor: DISC[d] }]} />
            <Avatar player={h.player(id)} size={30} />
            <View>
              <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 90 }}>
                {h.player(id).name}
              </Txt>
              <Txt v="tiny" color={C.dim}>
                الفوز: {num(view.score[id] ?? 0)}
              </Txt>
            </View>
          </View>
        );
      })}
    </Row>
  );
}

export function Connect4Game({ room, view }: { room: RoomView; view: Connect4View }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 24, 430);
  const cell = W / COLS;
  if (view.myDisc === null && view.phase === 'play') return <Spectator room={room} />;
  const myTurn = view.phase === 'play' && view.turn === view.myDisc;
  const line = new Set(view.line ?? []);

  return (
    <>
      {view.phase === 'final' && view.winner === view.myDisc ? <Confetti /> : null}
      <Players view={view} h={h} />
      {view.phase === 'final' ? (
        <ResultBanner
          tone={view.winner === view.myDisc ? 'good' : view.winner === 'draw' ? 'neutral' : 'bad'}
          art={<GameArt id="connect4" size={72} />}
          title={view.winner === 'draw' ? 'تعادل!' : `فاز ${h.player(view.winner === 1 ? view.red : view.yellow).name}`}
          sub={view.winner === 'draw' ? 'امتلأت اللوحة' : 'أربعة في صف!'}
        />
      ) : (
        <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
          {myTurn ? `دورك — اختر عموداً (أنت ${NAME[view.myDisc!]})` : `دور ${h.player(view.turn === 1 ? view.red : view.yellow).name}…`}
        </Txt>
      )}

      <View style={[styles.board, { width: W + 12, height: cell * ROWS + 12 }]}>
        {view.board.map((v, i) => {
          const r = Math.floor(i / COLS), c = i % COLS;
          const isLast = view.last === i;
          const drop = isLast
            ? new Keyframe({
                0: { transform: [{ translateY: -(r + 1) * cell }] },
                100: { transform: [{ translateY: 0 }], easing: Easing.bounce },
              }).duration(260 + r * 60)
            : undefined;
          return (
            <View key={i} style={[styles.hole, { left: 6 + c * cell, top: 6 + r * cell, width: cell, height: cell }]}>
              <View style={[styles.holeIn, { width: cell * 0.8, height: cell * 0.8, borderRadius: cell }]} />
              {v ? (
                <Animated.View
                  key={`${i}:${v}`}
                  entering={drop}
                  style={[
                    styles.disc,
                    { width: cell * 0.8, height: cell * 0.8, borderRadius: cell, backgroundColor: DISC[v as 1 | 2] },
                    line.has(i) && styles.win,
                  ]}>
                  <View style={[styles.discIn, { width: cell * 0.5, height: cell * 0.5, borderRadius: cell }]} />
                </Animated.View>
              ) : null}
            </View>
          );
        })}
        {myTurn
          ? Array.from({ length: COLS }, (_, c) => {
              const full = view.board[c] !== 0;
              return (
                <Pressable
                  key={`col${c}`}
                  disabled={full}
                  onPress={() => {
                    haptic.medium();
                    h.act('drop', { col: c });
                  }}
                  accessibilityLabel={`العمود ${c + 1}`}
                  style={({ pressed }) => [styles.col, { left: 6 + c * cell, width: cell }, pressed && { backgroundColor: alpha('#FFFFFF', 0.12) }]}
                />
              );
            })
          : null}
      </View>

      {view.phase === 'final' ? <PlayAgain room={room} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  player: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 2, borderColor: 'transparent' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#151726' },
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: '#2F5BD0', borderRadius: 18, borderWidth: 3, borderColor: '#151726' },
  hole: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  holeIn: { position: 'absolute', backgroundColor: '#14295E', borderWidth: 2, borderColor: '#151726' },
  disc: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#151726' },
  discIn: { borderWidth: 2, borderColor: 'rgba(0,0,0,0.18)' },
  win: { borderColor: '#FFFFFF', borderWidth: 4 },
  col: { position: 'absolute', top: 0, bottom: 0, borderRadius: 10 },
});
