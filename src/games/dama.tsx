import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import type { DamaView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

// the board image has a frame: squares span 9/98 … 89/98 of its width
const INSET = 9 / 98;
const SPAN = 80 / 98;

const pieceImg = (v: number) => BOARD_IMG[`dama-${v > 0 ? 'white' : 'black'}${Math.abs(v) === 2 ? '-king' : ''}`];

function PlayerChip({ id, color, active, count, h }: { id: string; color: 'white' | 'black'; active: boolean; count: number; h: Helpers }) {
  const p = h.player(id);
  return (
    <View style={[styles.chip, active && styles.chipActive]}>
      <Avatar player={p} size={30} />
      <View style={{ flex: 1 }}>
        <Txt v="tiny" numberOfLines={1} color={active ? C.ink : C.text}>
          {p.name}
        </Txt>
        <Txt v="tiny" color={active ? alpha(C.ink, 0.7) : C.dim}>
          {count} قطعة
        </Txt>
      </View>
      <Image source={BOARD_IMG[`dama-${color}`]} style={{ width: 26, height: 26 }} contentFit="contain" />
    </View>
  );
}

export function DamaGame({ room, view }: { room: RoomView; view: DamaView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<number | null>(null);
  const [resign, setResign] = useState(false);
  const boardW = Math.min(width - 32, 460);
  const sq = (boardW * SPAN) / 8;
  const off = boardW * INSET;

  if (!view.myColor && view.phase === 'play') return <Spectator room={room} />;

  const flip = view.myColor === 'black'; // my pieces at the bottom
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
  const last = view.lastMove ? [view.lastMove.from, view.lastMove.path[view.lastMove.path.length - 1]] : [];

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

  const me = view.myColor;
  const opp = me === 'white' ? 'black' : 'white';
  const oppId = view[opp];

  if (view.phase === 'final') {
    const won = view.winner === me;
    const reason = { pieces: 'أكل كل القطع', blocked: 'لم تبق له حركة', resign: 'استسلم الخصم', draw: '50 حركة بدون أكل', left: 'غادر الخصم' }[view.reason ?? 'pieces'];
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={view.winner === 'draw' ? 'neutral' : won ? 'good' : 'bad'}
          art={<GameArt id="dama" size={84} />}
          title={view.winner === 'draw' ? 'تعادل' : `فاز ${h.player(view[view.winner as 'white' | 'black']).name}`}
          sub={reason}
        />
        <PlayAgain room={room} />
      </>
    );
  }

  return (
    <>
      <PlayerChip id={oppId} color={opp} active={view.turn === opp} count={view.counts[opp]} h={h} />
      <View style={{ width: boardW, height: boardW, alignSelf: 'center', direction: 'ltr' }}>
        <Image source={BOARD_IMG['dama-board']} style={StyleSheet.absoluteFill} contentFit="contain" />
        {last.map((i) => (
          <View key={`l${i}`} style={[styles.mark, pos(i), { width: sq, height: sq, backgroundColor: alpha(C.yellow, 0.28) }]} />
        ))}
        {view.board.map((v, i) => {
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          if (!dark) return null;
          const p = pos(i);
          const can = myTurn && from.has(i);
          const isTarget = targets.some((m) => m.path[m.path.length - 1] === i);
          return (
            <Pressable key={i} onPress={() => tap(i)} style={[styles.cell, p, { width: sq, height: sq }]} accessibilityLabel={`مربع ${i}`}>
              {v ? (
                <Animated.View key={`${i}:${v}`} entering={FadeIn.duration(140)} style={[styles.piece, sel === i && styles.pieceSel, can && sel !== i && styles.pieceCan]}>
                  <Image source={pieceImg(v)} style={{ width: sq * 0.92, height: sq * 0.92 }} contentFit="contain" />
                </Animated.View>
              ) : null}
              {isTarget ? <View style={[styles.dot, { width: sq * 0.34, height: sq * 0.34, borderRadius: sq }]} /> : null}
            </Pressable>
          );
        })}
      </View>
      <PlayerChip id={view[me!]} color={me!} active={myTurn} count={view.counts[me!]} h={h} />
      <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
        {myTurn ? (mustCapture ? 'دورك — الأكل إجباري!' : sel === null ? 'دورك — اختر قطعة' : 'اختر أين تذهب') : `دور ${h.player(oppId).name}…`}
      </Txt>
      <Row center>
        <Btn size="sm" ghost icon="close" label="استسلام" onPress={() => setResign(true)} />
      </Row>
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10 },
  chipActive: { backgroundColor: C.yellow },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
  piece: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2.5, borderColor: 'transparent' },
  pieceSel: { borderColor: C.yellow, transform: [{ translateY: -3 }] },
  pieceCan: { borderColor: alpha(C.yellow, 0.45) },
  dot: { position: 'absolute', backgroundColor: alpha(C.yellow, 0.9), borderWidth: 2, borderColor: '#151726' },
});
