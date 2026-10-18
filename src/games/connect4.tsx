/** «أربعة في صف» — tap a column to drop a disc; four in a row wins. */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { COLS, ROWS } from '@/shared/connect4';
import type { Connect4View, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar } from './duel';
import { helpers, type Helpers } from './helpers';

const DISC = { 1: '#E2475F', 2: '#F2C23D' } as const;
const NAME = { 1: 'الأحمر', 2: 'الأصفر' } as const;

function Players({ view, h }: { view: Connect4View; h: Helpers }) {
  return (
    <DuelBar
      h={h}
      active={view.phase === 'play' ? (view.turn === 1 ? view.red : view.yellow) : null}
      slots={([1, 2] as const).map((d) => {
        const id = d === 1 ? view.red : view.yellow;
        return { id, color: DISC[d], sub: NAME[d], score: view.score[id] ?? 0 };
      })}
    />
  );
}

export function Connect4Game({ room, view }: { room: RoomView; view: Connect4View }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 24, 430);
  const cell = W / COLS;
  const [resign, setResign] = useState(false);
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
          sub={view.winner === 'draw' ? 'امتلأت اللوحة' : view.line ? 'أربعة في صف!' : 'انسحب الخصم'}
        />
      ) : (
        <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
          {myTurn ? `اختر عموداً (أنت ${NAME[view.myDisc!]})` : `أنت ${NAME[view.myDisc!]}`}
        </Txt>
      )}

      <View style={[styles.board, { width: W + 12, height: cell * ROWS + 12 }]}>
        {view.board.map((v, i) => {
          const r = Math.floor(i / COLS), c = i % COLS;
          const isLast = view.last === i;
          const drop = isLast
            ? new Keyframe({
                0: { transform: [{ translateY: -(r + 1) * cell }] },
                // falls and settles, no bounce
                100: { transform: [{ translateY: 0 }], easing: Easing.in(Easing.quad) },
              }).duration(220 + r * 45)
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
                  <View style={[styles.discIn, { width: cell * 0.5, height: cell * 0.5, borderRadius: cell }, isLast && !line.size && styles.lastIn]} />
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

      {view.phase === 'final' ? <PlayAgain room={room} /> : <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من الدور؟"
        message="سيفوز خصمك بهذا الدور"
        confirmLabel="انسحب"
        onCancel={() => setResign(false)}
        onConfirm={() => {
          setResign(false);
          h.act('resign');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: '#2F5BD0', borderRadius: 18, borderWidth: 3, borderColor: '#151726' },
  hole: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  holeIn: { position: 'absolute', backgroundColor: '#14295E', borderWidth: 2, borderColor: '#151726' },
  disc: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#151726' },
  discIn: { borderWidth: 2, borderColor: 'rgba(0,0,0,0.18)' },
  win: { borderColor: '#FFFFFF', borderWidth: 4 },
  lastIn: { borderColor: 'rgba(255,255,255,0.85)', borderWidth: 2.5 },
  col: { position: 'absolute', top: 0, bottom: 0, borderRadius: 10 },
});
