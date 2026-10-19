/** «الخربقة» — 7×7 board: place two pieces per turn, then move and capture by sandwiching. */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { CENTER, N } from '@/shared/kharbga';
import type { KharbgaView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { FadeAside, Glide, Hint, Lift, Settle, SoftMark, glideMs, nudge, useBoardChange } from './board-motion';
import { DuelBar, winLine } from './duel';
import { helpers } from './helpers';

const INK = '#151726';
const PIECE = { 1: '#F5ECD6', 2: '#B8323F' } as const;
const SIDE_NAME = { 1: 'المهاجم', 2: 'المدافع' } as const;
type Last = KharbgaView['last'];

/**
 * What changed between two boards, when it is exactly the latest action: a move (the piece glides,
 * the pieces taken fade aside), or pieces put down / taken back while placing. Null when the boards
 * don't fit (two actions arrived together): then nothing animates.
 */
function kharbgaMotion(prev: number[] | null, board: number[], last: Last) {
  if (!prev || prev.length !== board.length) return null;
  const changed = board.map((_, i) => i).filter((i) => prev[i] !== board[i]);
  if (!changed.length) return null;
  if (last && last.from !== last.to && prev[last.from] && !board[last.from] && !prev[last.to] && board[last.to] === prev[last.from]) {
    const touched = new Set([last.from, last.to, ...last.captured]);
    if (changed.some((i) => !touched.has(i)) || last.captured.some((c) => !prev[c] || board[c])) return null;
    return { move: { from: last.from, to: last.to }, taken: last.captured, appeared: [] as number[], gone: [] as number[] };
  }
  const appeared = changed.filter((i) => !prev[i] && board[i]);
  const gone = changed.filter((i) => prev[i] && !board[i]);
  if (appeared.length + gone.length !== changed.length) return null;
  return { move: null, taken: [] as number[], appeared, gone };
}

const REASON: Record<string, string> = {
  captured: 'أُكلت كل القطع!',
  blocked: 'لا توجد حركات — الفوز للأكثر قطعاً',
  limit: 'طال اللعب بلا أكل — الفوز للأكثر قطعاً',
  resign: 'انسحاب الخصم',
  left: 'مغادرة الخصم',
};

export function KharbgaGame({ room, view }: { room: RoomView; view: KharbgaView }) {
  const h = helpers(room);
  const accent = useAccent();
  const { width } = useWindowDimensions();
  const W = Math.min(width - 24, 440);
  const cell = W / N;
  const [sel, setSel] = useState<{ cell: number; key: string } | null>(null);
  const [resign, setResign] = useState(false);
  const moveKey = `${view.board.join('')}|${view.last ? `${view.last.from}-${view.last.to}` : ''}`;
  const mv = useBoardChange(moveKey, view.board);
  if (view.mySide === null && view.phase !== 'final') return <Spectator room={room} />;

  const myTurn = view.phase !== 'final' && view.turn === view.mySide;
  const idOf = (s: 1 | 2) => (s === 1 ? view.attacker : view.defender);
  const stateKey = `${view.turn}:${view.counts[1]}:${view.counts[2]}:${view.last?.from}:${view.last?.to}`;
  const chosen = view.chainFrom ?? (sel && sel.key === stateKey ? sel.cell : null);
  const targets = new Set(view.moves.filter((m) => m.from === chosen).map((m) => m.to));
  const movable = new Set(view.moves.map((m) => m.from));
  const won = view.phase === 'final' && view.winner === view.mySide;
  // the latest action, made while the board was on screen
  const motion = mv.live ? kharbgaMotion(mv.prev, view.board, view.last) : null;
  const glideIn = mv.fresh ? motion?.move : null;
  const moveMs = glideMs(1);
  // pieces put down together (a random drop) settle one after another, the whole lot within ~0.45 s
  const stagger = motion?.appeared.length ? Math.min(30, 450 / motion.appeared.length) : 0;
  const center = (i: number) => ({ x: (i % N) * cell, y: Math.floor(i / N) * cell });
  const pieceFace = (v: number) => (
    <View style={[styles.piece, { width: cell * 0.72, height: cell * 0.72, borderRadius: cell, backgroundColor: PIECE[v as 1 | 2] }]}>
      <View style={[styles.pieceIn, { width: cell * 0.36, height: cell * 0.36, borderRadius: cell }]} />
    </View>
  );

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
          swatch: PIECE[s],
          sub: view.phase === 'place' ? `${SIDE_NAME[s]} — ${num(view.toPlace[s])} للوضع` : `${SIDE_NAME[s]} — ${num(view.counts[s])} قطعة`,
          score: view.score[idOf(s)] ?? 0,
        }))}
      />

      {view.phase === 'final' ? (
        <ResultBanner
          tone={won ? 'good' : view.winner === 'draw' ? 'neutral' : 'bad'}
          art={<GameArt id="kharbga" size={72} />}
          title={view.winner === 'draw' ? 'تعادل!' : won ? 'فزت!' : winLine(h.player(idOf(view.winner as 1 | 2)).name)}
          sub={view.reason ? REASON[view.reason] : undefined}
        />
      ) : (
        // the line keeps its place when it's empty, so the board doesn't jump under a moving piece
        <Txt v="bold" center color={C.yellow}>
          {hint || ' '}
        </Txt>
      )}

      <View style={[styles.board, { width: W + 6, height: W + 6, borderColor: accent }]}>
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
          const slide = !!v && !!glideIn && glideIn.to === i;
          const takenK = motion && last ? motion.taken.indexOf(i) : -1;
          const appearK = motion && v ? motion.appeared.indexOf(i) : -1;
          const goneHere = !v && !!motion?.gone.includes(i);
          const piece = v ? (
            <Settle key={`${i}:${v}`} animate={appearK >= 0 && mv.fresh} delay={appearK * stagger}>
              <Lift on={isChosen} scale={1.06}>
                {pieceFace(v)}
                {canPick && !isChosen ? <Hint style={[styles.ring, { borderRadius: cell, borderWidth: 3.5, borderColor: alpha(C.yellow, 0.75) }]} /> : null}
                {isChosen ? <Hint style={[styles.ring, { borderRadius: cell, borderWidth: 4, borderColor: C.yellow }]} /> : null}
              </Lift>
            </Settle>
          ) : null;
          return (
            <Pressable
              key={i}
              onPress={() => tap(i)}
              accessibilityLabel={`الخانة ${r + 1}-${c + 1}`}
              style={[styles.cell, { left: c * cell, top: r * cell, width: cell, height: cell }, slide && { zIndex: 2 }]}>
              {lastTo || lastFrom ? (
                <SoftMark key={`last${moveKey}`} animate={mv.fresh} style={[styles.lastSq, { width: cell * 0.9, height: cell * 0.9, borderRadius: cell * 0.2 }]} />
              ) : null}
              {i === CENTER ? <View style={[styles.center, { width: cell * 0.5, height: cell * 0.5 }]} /> : null}
              {isTarget ? <Hint style={[styles.target, { width: cell * 0.42, height: cell * 0.42, borderRadius: cell }]} /> : null}
              {view.last?.captured.includes(i) && !v ? (
                <SoftMark key={`cap${moveKey}`} animate={takenK >= 0} delay={moveMs * 0.7 + 160} style={[styles.ghost, { width: cell * 0.5, height: cell * 0.5, borderRadius: cell }]} />
              ) : null}
              {(takenK >= 0 && last) || goneHere ? (
                <FadeAside
                  key={`fade${moveKey}`}
                  reduced={!mv.fresh}
                  delay={goneHere ? 0 : moveMs * 0.7}
                  drift={last && !goneHere ? nudge(center(last.to), center(i), cell * 0.18) : undefined}
                  style={{ position: 'absolute', left: cell * 0.14, top: cell * 0.14 }}>
                  {pieceFace(mv.prev?.[i] ?? 1)}
                </FadeAside>
              ) : null}
              {slide && glideIn ? (
                <Glide key={`glide${moveKey}`} steps={[{ x: ((glideIn.from % N) - c) * cell, y: (Math.floor(glideIn.from / N) - r) * cell }]} ms={moveMs}>
                  {piece}
                </Glide>
              ) : (
                piece
              )}
            </Pressable>
          );
        })}
      </View>

      {view.phase === 'place' && myTurn ? (
        <Btn
          size="md"
          icon="shuffle"
          label="وزّع الباقي عشوائياً"
          onPress={() => {
            haptic.medium();
            h.act('placeRandom');
          }}
        />
      ) : null}
      {view.phase === 'final' ? (
        <PlayAgain room={room} />
      ) : (
        <Row center gap={8}>
          {view.phase === 'place' && myTurn ? <Btn size="sm" ghost icon="back" label="تراجع" disabled={!view.canUndo} onPress={() => h.act('undo')} /> : null}
          <Btn size="sm" ghost icon="door" label="انسحب" onPress={() => setResign(true)} />
        </Row>
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
  ring: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  lastSq: { position: 'absolute', backgroundColor: alpha(C.yellow, 0.32) },
});
