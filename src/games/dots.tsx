/** «المربعات» — touch between two dots to draw a line; close a box to take it and play again. */
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { DOTS_SIZES, dotsBoxLines, type DotsLevel, type DotsView } from '@/shared/games/dots';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar } from './duel';
import { helpers, type Helpers } from './helpers';

const INK = '#151726';
const PAPER = '#FFF4DA';
/** One colour per seat (players may have picked the same colour for themselves). */
const DOTS_COLORS = ['#E2475F', '#3D9BE9', '#2FB67C', '#9B6BE0'];

const nameOf = (h: Helpers, view: DotsView, id: string) => (h.players.some((p) => p.id === id) ? h.player(id).name : (view.names[id] ?? '؟'));

/** A small emblem for the result banner: a 2×2 grid with two boxes taken. */
function DotsArt({ size }: { size: number }) {
  const s = size / 2.6;
  const d = size * 0.12;
  const at = (k: number) => size * 0.2 + k * s;
  return (
    <View style={{ width: size, height: size, direction: 'ltr' }}>
      <View style={{ position: 'absolute', left: at(0), top: at(0), width: s, height: s, backgroundColor: C.yellow, borderRadius: 4 }} />
      <View style={{ position: 'absolute', left: at(1), top: at(1), width: s, height: s, backgroundColor: DOTS_COLORS[1], borderRadius: 4 }} />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <View key={`${r}${c}`} style={{ position: 'absolute', left: at(c) - d / 2, top: at(r) - d / 2, width: d, height: d, borderRadius: d, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: INK }} />
        )),
      )}
    </View>
  );
}

function Players({ view, h }: { view: DotsView; h: Helpers }) {
  const active = view.phase === 'play' ? view.turn : null;
  if (view.seats.length === 2) {
    return (
      <DuelBar
        h={h}
        active={active}
        slots={view.seats.map((id, i) => ({ id, color: DOTS_COLORS[i], sub: `${num(view.points[id] ?? 0)} مربع`, score: view.score[id] ?? 0 }))}
      />
    );
  }
  return (
    <Row gap={6} wrap center>
      {view.seats.map((id, i) => {
        const out = !view.active.includes(id);
        const on = active === id;
        return (
          <View key={id} style={[styles.chip, on && { borderColor: DOTS_COLORS[i], backgroundColor: alpha(DOTS_COLORS[i], 0.2) }, out && { opacity: 0.45 }]}>
            <View style={[styles.swatch, { backgroundColor: DOTS_COLORS[i] }]} />
            <Avatar player={h.player(id)} size={24} />
            <View style={{ maxWidth: 76 }}>
              <Txt v="tiny" numberOfLines={1}>
                {nameOf(h, view, id)}
                {id === h.me ? ' (أنت)' : ''}
              </Txt>
              <Txt v="tiny" color={C.yellow} numberOfLines={1}>
                {out ? 'خرج' : `الفوز: ${num(view.score[id] ?? 0)}`}
              </Txt>
            </View>
            <View style={[styles.count, { backgroundColor: DOTS_COLORS[i] }]}>
              <Txt v="tiny" color="#FFFFFF">
                {num(view.points[id] ?? 0)}
              </Txt>
            </View>
          </View>
        );
      })}
    </Row>
  );
}

/** Which line a touch at (x, y) means: the nearest line midpoint (the box is split in four triangles). */
function lineAt(n: number, s: number, pad: number, x: number, y: number) {
  const u = (x - pad) / s, v = (y - pad) / s;
  if (u < -0.6 || v < -0.6 || u > n + 0.6 || v > n + 0.6) return null;
  const bx = Math.min(n - 1, Math.max(0, Math.floor(u)));
  const by = Math.min(n - 1, Math.max(0, Math.floor(v)));
  const fx = u - bx, fy = v - by;
  const [top, bottom, left, right] = dotsBoxLines(n, by * n + bx);
  if (fy <= fx && fy <= 1 - fx) return top;
  if (fy >= fx && fy >= 1 - fx) return bottom;
  return fx < 0.5 ? left : right;
}

function Board({ view, h, myTurn }: { view: DotsView; h: Helpers; myTurn: boolean }) {
  const { width } = useWindowDimensions();
  const n = view.n;
  const W = Math.min(width - 16, 460);
  const s = W / (n + 0.9);
  const pad = (W - n * s) / 2;
  const t = Math.max(5, Math.round(s * 0.13)); // line thickness
  const dot = Math.max(10, Math.round(s * 0.2));
  const [hover, setHover] = useState<number | null>(null);
  const H = n * (n + 1);
  const free = (e: number | null) => e !== null && view.lines[e] < 0;

  const track = (ev: GestureResponderEvent) => {
    const e = lineAt(n, s, pad, ev.nativeEvent.locationX, ev.nativeEvent.locationY);
    const next = free(e) ? e : null;
    if (next !== hover) {
      if (next !== null) haptic.tap();
      setHover(next);
    }
  };
  const release = () => {
    if (hover !== null && myTurn && view.lines[hover] < 0) {
      haptic.medium();
      client.act({ type: 'line', line: hover });
    }
    setHover(null);
  };

  const geo = (e: number, th: number) => {
    if (e < H) {
      const r = Math.floor(e / n), c = e % n;
      return { left: pad + c * s, top: pad + r * s - th / 2, width: s, height: th };
    }
    const k = e - H;
    const r = Math.floor(k / (n + 1)), c = k % (n + 1);
    return { left: pad + c * s - th / 2, top: pad + r * s, width: th, height: s };
  };
  const lastBoxes = new Set(view.lastBoxes);
  const mine = view.me >= 0 ? DOTS_COLORS[view.me] : C.yellow;

  return (
    <View
      style={[styles.board, { width: W, height: W }]}
      onStartShouldSetResponder={() => myTurn}
      onMoveShouldSetResponder={() => myTurn}
      onResponderTerminationRequest={() => false}
      onResponderGrant={track}
      onResponderMove={track}
      onResponderRelease={release}
      onResponderTerminate={() => setHover(null)}
      accessibilityLabel="شبكة النقاط: المس بين نقطتين لترسم خطاً">
      {view.boxes.map((o, b) => {
        if (o < 0) return null;
        const r = Math.floor(b / n), c = b % n;
        const owner = view.seats[o];
        return (
          <Animated.View
            key={`b${b}`}
            pointerEvents="none"
            entering={lastBoxes.has(b) ? ZoomIn.duration(240) : undefined}
            style={[styles.box, { left: pad + c * s + t / 2, top: pad + r * s + t / 2, width: s - t, height: s - t, backgroundColor: alpha(DOTS_COLORS[o], 0.82) }]}>
            <Txt style={{ fontSize: s * 0.42, lineHeight: s * 0.6, color: '#FFFFFF' }}>{nameOf(h, view, owner).trim().charAt(0)}</Txt>
          </Animated.View>
        );
      })}
      {view.last !== null && view.lines[view.last] >= 0 ? (
        <Animated.View key={`halo${view.last}`} pointerEvents="none" entering={FadeIn.duration(220)} style={[styles.halo, geo(view.last, t + 10), { borderRadius: t }]} />
      ) : null}
      {view.lines.map((o, e) =>
        o < 0 ? (
          <View key={`l${e}`} pointerEvents="none" style={[styles.ghost, geo(e, 2)]} />
        ) : (
          <Animated.View
            key={`l${e}`}
            pointerEvents="none"
            entering={view.last === e ? FadeIn.duration(180) : undefined}
            style={[styles.line, geo(e, t), { backgroundColor: DOTS_COLORS[o] }]}
          />
        ),
      )}
      {hover !== null ? <View pointerEvents="none" style={[styles.line, geo(hover, t), { backgroundColor: alpha(mine, 0.55), borderColor: mine }]} /> : null}
      {Array.from({ length: (n + 1) * (n + 1) }, (_, k) => {
        const r = Math.floor(k / (n + 1)), c = k % (n + 1);
        return <View key={`d${k}`} pointerEvents="none" style={[styles.dot, { left: pad + c * s - dot / 2, top: pad + r * s - dot / 2, width: dot, height: dot, borderRadius: dot }]} />;
      })}
    </View>
  );
}

export function DotsGame({ room, view }: { room: RoomView; view: DotsView }) {
  const h = helpers(room);
  const [resign, setResign] = useState(false);
  if (view.me < 0 && view.phase === 'play') return <Spectator room={room} />;
  const meId = view.seats[view.me];
  const playing = view.phase === 'play' && view.active.includes(meId);
  const myTurn = view.phase === 'play' && view.turn === meId;
  const won = view.phase === 'final' && view.winners?.length === 1 && view.winners[0] === meId;
  const justScored = view.lastBoxes.length > 0 && view.last !== null && view.lines[view.last] === view.seats.indexOf(view.turn ?? '');
  const finalScores = Object.fromEntries(view.active.map((id) => [id, view.points[id] ?? 0]));
  const many = view.seats.length > 2;

  let title = '';
  let sub = '';
  if (view.phase === 'final') {
    const ws = view.winners ?? [];
    title = ws.length === 1 ? (ws[0] === meId ? 'فزت!' : `فاز ${nameOf(h, view, ws[0])}`) : 'تعادل!';
    sub = view.reason === 'forfeit' ? 'انسحب الآخرون' : ws.length === 1 ? `${num(view.points[ws[0]] ?? 0)} مربعات من ${num(view.n * view.n)}` : 'نفس عدد المربعات';
  }

  return (
    <>
      {won ? <Confetti /> : null}
      <Players view={view} h={h} />
      {view.phase === 'final' ? (
        <ResultBanner tone={won ? 'good' : view.winners?.includes(meId) ? 'neutral' : 'bad'} art={<DotsArt size={64} />} title={title} sub={sub} />
      ) : (
        <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
          {myTurn
            ? justScored
              ? 'أغلقت مربعاً! العب مرة أخرى'
              : 'دورك — المس بين نقطتين لترسم خطاً'
            : !playing
              ? 'خرجت من هذه اللعبة… تابع الآخرين'
              : justScored
                ? `${nameOf(h, view, view.turn!)} أغلق مربعاً ويلعب مرة أخرى…`
                : `دور ${nameOf(h, view, view.turn!)}…`}
        </Txt>
      )}

      <Board view={view} h={h} myTurn={myTurn} />

      {view.phase === 'final' && many ? <Scoreboard players={room.players} scores={finalScores} unit="مربع" highlight={h.me} /> : null}
      {view.phase === 'final' ? (
        <PlayAgain room={room} />
      ) : playing ? (
        <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />
      ) : null}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من اللعبة؟"
        message={view.active.length > 2 ? 'ستخرج من هذه اللعبة ويكمل الآخرون بدونك' : 'سيفوز خصمك بهذه اللعبة'}
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

/** Lobby settings: grid size and bot strength. */
export function DotsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.dots;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'dots', patch });
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold">حجم الشبكة (عدد المربعات)</Txt>
      <ChipPicker
        options={DOTS_SIZES.map((n) => ({ key: String(n), label: `${n}×${n}` }))}
        value={String(settings.size)}
        editable={editable}
        onChange={(v) => change({ size: Number(v) })}
      />
      <Txt v="bold">قوة البوت</Txt>
      <ChipPicker
        options={[
          { key: 'easy', label: 'سهل' },
          { key: 'medium', label: 'متوسط' },
          { key: 'hard', label: 'صعب' },
        ]}
        value={settings.level}
        editable={editable}
        onChange={(level: DotsLevel) => change({ level })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: PAPER, borderRadius: 22, borderWidth: 3, borderColor: INK },
  box: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  ghost: { position: 'absolute', backgroundColor: 'rgba(21,23,38,0.14)', borderRadius: 1 },
  line: { position: 'absolute', borderRadius: 6, borderWidth: 1.5, borderColor: INK },
  halo: { position: 'absolute', backgroundColor: 'rgba(242,179,61,0.75)' },
  dot: { position: 'absolute', backgroundColor: INK, borderWidth: 2, borderColor: '#3A3D5C' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 3, paddingHorizontal: 6, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: INK },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: INK },
});
