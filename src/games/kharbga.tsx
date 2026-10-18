/** «الخربقة» — 7×7 board: place two pieces per turn, then move and capture by sandwiching. */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { CENTER, N } from '@/shared/kharbga';
import type { KharbgaView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { MarkIn } from '@/ui/motion';

import { LastEvent } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar, SlideIn } from './duel';
import { helpers } from './helpers';

const INK = '#151726';
const PIECE = { 1: '#F5ECD6', 2: '#B8323F' } as const;
const SIDE_NAME = { 1: 'المهاجم', 2: 'المدافع' } as const;
const REASON: Record<string, string> = {
  captured: 'أكل كل القطع!',
  blocked: 'لا توجد حركات — فاز الأكثر قطعاً',
  limit: 'طال اللعب بلا أكل — فاز الأكثر قطعاً',
  resign: 'انسحب الخصم',
  left: 'غادر الخصم',
};

export function KharbgaGame({ room, view }: { room: RoomView; view: KharbgaView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 24, 440);
  const cell = W / N;
  const [sel, setSel] = useState<{ cell: number; key: string } | null>(null);
  const [resign, setResign] = useState(false);
  if (view.mySide === null && view.phase !== 'final') return <Spectator room={room} />;

  const myTurn = view.phase !== 'final' && view.turn === view.mySide;
  const idOf = (s: 1 | 2) => (s === 1 ? view.attacker : view.defender);
  const stateKey = `${view.turn}:${view.counts[1]}:${view.counts[2]}:${view.last?.from}:${view.last?.to}`;
  const chosen = view.chainFrom ?? (sel && sel.key === stateKey ? sel.cell : null);
  const targets = new Set(view.moves.filter((m) => m.from === chosen).map((m) => m.to));
  const movable = new Set(view.moves.map((m) => m.from));
  const won = view.phase === 'final' && view.winner === view.mySide;

  const tap = (i: number) => {
    if (!myTurn) return;
    if (view.phase === 'place') {
      if (view.board[i] || i === CENTER) return;
      haptic.tap();
      h.act('place', { cell: i });
      return;
    }
    if (chosen !== null && targets.has(i)) {
      haptic.medium();
      h.act('move', { from: chosen, to: i });
      setSel(null);
      return;
    }
    if (view.chainFrom === null && movable.has(i)) {
      haptic.tap();
      setSel({ cell: i, key: stateKey });
    }
  };

  const hint = (() => {
    if (view.phase === 'final') return '';
    if (!myTurn) return '';
    if (view.phase === 'place') return `ضع قطعتين على خانات فارغة (بقي لك ${num(view.toPlace[view.mySide!])})`;
    if (view.chainFrom !== null) return 'أكلت! واصل الأكل بنفس القطعة';
    if (!view.moves.length) return 'لا حركة لديك…';
    return chosen === null ? 'اختر قطعة لتحرّكها' : 'اختر الخانة المضيئة';
  })();

  return (
    <>
      {won ? <Confetti /> : null}
      <DuelBar
        h={h}
        active={view.phase === 'final' ? null : idOf(view.turn)}
        slots={([1, 2] as const).map((s) => ({
          id: idOf(s),
          color: PIECE[s],
          sub: view.phase === 'place' ? `${SIDE_NAME[s]} — يضع ${num(view.toPlace[s])}` : `${SIDE_NAME[s]} — ${num(view.counts[s])} قطعة`,
          score: view.score[idOf(s)] ?? 0,
        }))}
      />

      {view.phase === 'final' ? (
        <ResultBanner
          tone={won ? 'good' : view.winner === 'draw' ? 'neutral' : 'bad'}
          art={<GameArt id="kharbga" size={72} />}
          title={view.winner === 'draw' ? 'تعادل!' : `فاز ${h.player(idOf(view.winner as 1 | 2)).name}`}
          sub={view.reason ? REASON[view.reason] : undefined}
        />
      ) : hint ? (
        <Txt v="bold" center color={C.yellow}>
          {hint}
        </Txt>
      ) : null}

      <View style={[styles.board, { width: W + 6, height: W + 6 }]}>
        {/* grid lines through the centres of the squares */}
        {Array.from({ length: N }, (_, k) => (
          <View key={`h${k}`} pointerEvents="none" style={[styles.line, { left: cell / 2, right: cell / 2, top: cell * (k + 0.5) - 1, height: 2 }]} />
        ))}
        {Array.from({ length: N }, (_, k) => (
          <View key={`v${k}`} pointerEvents="none" style={[styles.line, { top: cell / 2, bottom: cell / 2, left: cell * (k + 0.5) - 1, width: 2 }]} />
        ))}
        {view.board.map((v, i) => {
          const r = Math.floor(i / N), c = i % N;
          const isTarget = targets.has(i);
          const isChosen = chosen === i;
          const canPick = myTurn && view.phase === 'move' && view.chainFrom === null && movable.has(i);
          const last = view.last;
          // the last move's square — or, while placing (or just after), the pieces put down in the latest turn
          const lastTo = !!last && (last.to === i || (last.from === i && !!v));
          const lastFrom = !!last && last.from === i && last.from !== last.to && !v;
          const slide = !!v && !!last && last.to === i && last.from !== last.to && !view.board[last.from];
          const piece = v ? (
            <Animated.View
              key={`${i}:${v}`}
              entering={slide ? undefined : MarkIn}
              style={[
                styles.piece,
                { width: cell * 0.72, height: cell * 0.72, borderRadius: cell, backgroundColor: PIECE[v as 1 | 2] },
                canPick && styles.pickable,
                isChosen && styles.chosen,
                lastTo && !isChosen && !canPick && styles.lastTo,
              ]}>
              <View style={[styles.pieceIn, { width: cell * 0.36, height: cell * 0.36, borderRadius: cell }]} />
            </Animated.View>
          ) : null;
          return (
            <Pressable
              key={i}
              onPress={() => tap(i)}
              accessibilityLabel={`الخانة ${r + 1}-${c + 1}`}
              style={[styles.cell, { left: c * cell, top: r * cell, width: cell, height: cell }, slide && { zIndex: 2 }]}>
              {lastFrom ? <View style={[styles.fromDot, { width: cell * 0.24, height: cell * 0.24, borderRadius: cell }]} /> : null}
              {i === CENTER ? <View style={[styles.center, { width: cell * 0.5, height: cell * 0.5 }]} /> : null}
              {isTarget ? <View style={[styles.target, { width: cell * 0.42, height: cell * 0.42, borderRadius: cell }]} /> : null}
              {view.last?.captured.includes(i) && !v ? (
                <Animated.View key={`cap${view.last.from}-${view.last.to}`} exiting={FadeOut} style={[styles.ghost, { width: cell * 0.6, height: cell * 0.6, borderRadius: cell }]} />
              ) : null}
              {slide && last ? (
                <SlideIn key={`${last.from}-${last.to}:${v}`} steps={[{ x: ((last.from % N) - c) * cell, y: (Math.floor(last.from / N) - r) * cell }]} ms={240}>
                  {piece}
                </SlideIn>
              ) : (
                piece
              )}
            </Pressable>
          );
        })}
      </View>

      {view.phase === 'place' && myTurn ? (
        <Row gap={8}>
          <Btn flex size="md" ghost icon="back" label="تراجع" disabled={!view.canUndo} onPress={() => h.act('undo')} />
          <Btn
            flex
            size="md"
            icon="shuffle"
            label="وزّع الباقي عشوائياً"
            onPress={() => {
              haptic.medium();
              h.act('placeRandom');
            }}
          />
        </Row>
      ) : null}
      {view.phase === 'final' ? (
        <PlayAgain room={room} />
      ) : (
        <>
          <LastEvent feed={view.feed} h={h} />
          <Btn size="sm" ghost icon="door" label="انسحب" onPress={() => setResign(true)} />
        </>
      )}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من الدور؟"
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
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: '#E9C88E', borderRadius: 18, borderWidth: 3, borderColor: INK },
  line: { position: 'absolute', backgroundColor: alpha('#7A4A22', 0.55) },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', backgroundColor: '#2E8B57', borderWidth: 2, borderColor: INK, transform: [{ rotate: '45deg' }] },
  target: { position: 'absolute', backgroundColor: alpha(C.yellow, 0.85), borderWidth: 2, borderColor: INK },
  ghost: { position: 'absolute', backgroundColor: alpha(C.red, 0.4), borderWidth: 2, borderColor: alpha(C.red, 0.8) },
  piece: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: INK },
  pieceIn: { borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.18)' },
  pickable: { borderColor: '#2E8B57', borderWidth: 3.5 },
  chosen: { borderColor: C.yellow, borderWidth: 4, transform: [{ scale: 1.1 }] },
  lastTo: { borderColor: '#3D7BE0', borderWidth: 3.5 },
  fromDot: { position: 'absolute', backgroundColor: alpha('#3D7BE0', 0.45), borderWidth: 1.5, borderColor: alpha('#3D7BE0', 0.9) },
});
