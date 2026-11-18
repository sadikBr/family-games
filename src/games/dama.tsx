import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import type { DamaView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { FadeAside, Glide, HOP, Hint, Lift, SoftMark, glideMs, nudge, useBoardChange } from './board-motion';
import { DuelBar, winLine } from './duel';
import { helpers } from './helpers';
import { dk } from '@/ui/layout';

// the board image has a frame: squares span 9/98 … 89/98 of its width
const INSET = 9 / 98;
const SPAN = 80 / 98;

const pieceImg = (v: number) => BOARD_IMG[`dama-${v > 0 ? 'white' : 'black'}${Math.abs(v) === 2 ? '-king' : ''}`];
type LastMove = NonNullable<DamaView['lastMove']>;

/** Is `prev → board` exactly the last move (so it can be animated)? Not when two moves arrived together. */
function fitsMove(prev: number[] | null, board: number[], lm: LastMove | null): lm is LastMove {
  if (!prev || !lm || prev.length !== board.length || !lm.path.length) return false;
  const to = lm.path[lm.path.length - 1];
  if (!prev[lm.from] || Math.sign(prev[lm.from]) !== Math.sign(board[to])) return false;
  if (lm.captures.some((c) => !prev[c] || board[c])) return false;
  const touched = new Set([lm.from, to, ...lm.captures]);
  return board.every((v, i) => touched.has(i) || v === prev[i]);
}

export function DamaGame({ room, view }: { room: RoomView; view: DamaView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<number | null>(null);
  const [resign, setResign] = useState(false);
  const boardW = Math.min(width - 32, dk(460));
  const sq = (boardW * SPAN) / 8;
  const off = boardW * INSET;
  const lm = view.lastMove;
  const moveKey = `${view.board.join(',')}|${lm ? `${lm.from}-${lm.path.join('-')}` : ''}`;
  const mv = useBoardChange(moveKey, view.board);

  if (!view.myColor && view.phase === 'play') return <Spectator room={room} />;

  const flip = view.myColor === 'black'; // my pieces at the bottom
  const final = view.phase === 'final';
  const myTurn = view.phase === 'play' && view.turn === view.myColor;
  const from = new Set(view.moves.map((m) => m.from));
  const targets = sel === null ? [] : view.moves.filter((m) => m.from === sel);
  const mustCapture = view.moves.some((m) => m.captures.length);
  const pos = (i: number) => {
    let r = Math.floor(i / 8), c = i % 8;
    if (flip) {
      r = 7 - r;
      c = 7 - c;
    }
    return { left: off + c * sq, top: off + r * sq };
  };
  const last = lm ? [lm.from, ...lm.path] : [];
  const lastTo = lm ? lm.path[lm.path.length - 1] : -1;
  // the last move, played while the board was on screen: the piece glides (hopping through every
  // square of a capture chain) and each piece taken fades aside as the mover passes it
  const prev = mv.live && fitsMove(mv.prev, view.board, lm) ? mv.prev : null;
  const xy = (i: number) => ({ x: pos(i).left, y: pos(i).top });
  const hops = lm ? lm.path.length : 0;
  const firstMs = lm ? glideMs(Math.hypot(xy(lm.from).x - xy(lastTo).x, xy(lm.from).y - xy(lastTo).y) / sq) : 0;
  const hopMs = hops > 1 ? HOP : firstMs;
  const slideFrom = (i: number) => {
    if (!lm || !prev || !mv.fresh || i !== lastTo) return null;
    const d = xy(i);
    return [lm.from, ...lm.path.slice(0, -1)].map((k) => ({ x: xy(k).x - d.x, y: xy(k).y - d.y }));
  };
  // the k-th piece taken is jumped during the k-th hop
  const takenAt = (k: number) => {
    const a = k === 0 ? lm!.from : lm!.path[k - 1];
    const b = lm!.path[Math.min(k, hops - 1)];
    return { delay: k * hopMs + hopMs * 0.55, drift: nudge(xy(a), xy(b), sq * 0.18) };
  };

  const tap = (i: number) => {
    if (!myTurn) return;
    const t = targets.find((m) => m.path[m.path.length - 1] === i);
    if (sel !== null && t) {
      haptic.medium();
      h.act('move', { from: sel, to: i });
      setSel(null);
      return;
    }
    if (from.has(i)) {
      haptic.tap();
      setSel(sel === i ? null : i);
    } else setSel(null);
  };

  const won = final && view.winner === view.myColor;
  const reason = { pieces: 'أُكلت كل القطع', blocked: 'لا حركة باقية', resign: 'استسلام الخصم', draw: '50 حركة بدون أكل', left: 'مغادرة الخصم' }[view.reason ?? 'pieces'];

  return (
    <>
      {won ? <Confetti /> : null}
      <DuelBar
        h={h}
        active={final ? null : view[view.turn]}
        slots={(['white', 'black'] as const).map((c) => ({
          id: view[c],
          mark: <Image source={BOARD_IMG[`dama-${c}`]} style={{ width: 16, height: 16 }} contentFit="contain" />,
          sub: `${num(view.counts[c])} قطعة`,
          score: view.score[view[c]] ?? 0,
        }))}
      />
      {final ? (
        <ResultBanner
          tone={view.winner === 'draw' ? 'neutral' : won ? 'good' : 'bad'}
          art={<GameArt id="dama" size={72} />}
          title={view.winner === 'draw' ? 'تعادل' : won ? 'فزت!' : winLine(h.player(view[view.winner as 'white' | 'black']).name)}
          sub={reason}
        />
      ) : (
        // the line keeps its place when it's not my turn, so the board doesn't jump under a moving piece
        <Txt v="bold" center color={C.yellow}>
          {myTurn ? (mustCapture ? 'الأكل إجباري — كُل قطعة!' : sel === null ? 'اختر قطعة لتحريكها' : 'اختر أين تذهب') : ' '}
        </Txt>
      )}
      <View style={{ width: boardW, height: boardW, alignSelf: 'center', direction: 'ltr' }}>
        <Image source={BOARD_IMG['dama-board']} style={StyleSheet.absoluteFill} contentFit="contain" />
        {last.map((i, k) => (
          <SoftMark
            key={`${moveKey}:${k}`}
            animate={mv.fresh}
            delay={hops > 1 ? Math.max(0, k - 1) * hopMs : 0}
            style={[styles.mark, pos(i), { width: sq, height: sq, backgroundColor: alpha(C.yellow, k === 0 || k === last.length - 1 ? 0.28 : 0.16) }]}
          />
        ))}
        {view.board.map((v, i) => {
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          if (!dark) return null;
          const p = pos(i);
          const can = myTurn && from.has(i);
          const isTarget = targets.some((m) => m.path[m.path.length - 1] === i);
          const capIdx = lm ? lm.captures.indexOf(i) : -1;
          const taken = !v && capIdx >= 0;
          const slide = v ? slideFrom(i) : null;
          const piece = v ? (
            <Animated.View key={`${i}:${v}`} entering={!slide && mv.live && mv.prev && mv.prev[i] !== v ? FadeIn.duration(160) : undefined}>
              <Lift on={sel === i} y={3}>
                <View style={styles.piece}>
                  <Image source={pieceImg(v)} style={{ width: sq * 0.92, height: sq * 0.92 }} contentFit="contain" />
                  {can && sel !== i ? <Hint style={[styles.ring, { borderColor: alpha(C.yellow, 0.45) }]} /> : null}
                  {sel === i ? <Hint style={[styles.ring, { borderColor: C.yellow }]} /> : null}
                </View>
              </Lift>
            </Animated.View>
          ) : null;
          return (
            <Pressable key={i} disabled={final} onPress={() => tap(i)} style={[styles.cell, p, { width: sq, height: sq }, i === lastTo && { zIndex: 2 }]} accessibilityLabel={`مربع ${i}${taken ? ' — أُكلت هنا قطعة' : ''}`}>
              {taken ? (
                <SoftMark key={`cap${moveKey}`} animate={!!prev} delay={prev ? takenAt(capIdx).delay + 120 : 0} style={[styles.ghost, { width: sq * 0.5, height: sq * 0.5, borderRadius: sq }]} />
              ) : null}
              {taken && prev ? (
                <FadeAside
                  key={`fade${moveKey}`}
                  reduced={!mv.fresh}
                  {...takenAt(capIdx)}
                  style={{ position: 'absolute', left: (sq - sq * 0.92 - 5) / 2, top: (sq - sq * 0.92 - 5) / 2 }}>
                  <View style={styles.piece}>
                    <Image source={pieceImg(prev[i])} style={{ width: sq * 0.92, height: sq * 0.92 }} contentFit="contain" />
                  </View>
                </FadeAside>
              ) : null}
              {slide ? (
                <Glide key={`${moveKey}:${v}`} steps={slide} ms={firstMs}>
                  {piece}
                </Glide>
              ) : (
                piece
              )}
              {isTarget ? <Hint style={[styles.dot, { width: sq * 0.34, height: sq * 0.34, borderRadius: sq }]} /> : null}
            </Pressable>
          );
        })}
      </View>
      {final ? (
        <PlayAgain room={room} />
      ) : (
        <Row center>
          <Btn size="sm" ghost icon="close" label="استسلام" onPress={() => setResign(true)} />
        </Row>
      )}
      <ConfirmModal
        visible={resign}
        icon="close"
        title="تستسلم؟"
        message="سيفوز خصمك بهذه الجولة"
        confirmLabel="استسلم"
        danger
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
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
  piece: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, padding: 2.5 },
  ring: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 999, borderWidth: 2.5 },
  dot: { position: 'absolute', backgroundColor: alpha(C.yellow, 0.9), borderWidth: 2, borderColor: '#151726' },
  ghost: { position: 'absolute', backgroundColor: alpha(C.red, 0.22), borderWidth: 2, borderColor: alpha(C.red, 0.7) },
});
