/** «المنقلة» — a wooden Kalah board; your six pits are the bottom row and your store is on the right. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { MANCALA_SEEDS, mancalaStore, type MancalaLevel, type MancalaMove, type MancalaView } from '@/shared/games/mancala';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha, hashRand } from '@/theme';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar } from './duel';
import { helpers, type Helpers } from './helpers';

const INK = '#151726';
const WOOD = '#9A5B2E';
const WOOD_DARK = '#6B3A1A';
const PIT = '#4A2A14';
const SIDE_COLOR = ['#F2B33D', '#3DB7E4'] as const;
const SEED_COLORS = ['#F6E7C8', '#E9B872', '#C9DCA4', '#F2A07B', '#E3D0F0', '#9FD3C7'];

/** Seeds drawn as little dots on a sunflower spiral (deterministic: no randomness while rendering). */
function Seeds({ count, w, h = w, hole, max }: { count: number; w: number; h?: number; hole: number; max: number }) {
  const shown = Math.min(count, max);
  const seed = Math.max(5, Math.min(w, h) * (count > 8 ? 0.16 : 0.2));
  const rx = w / 2 - seed / 2 - 2, ry = h / 2 - seed / 2 - 2;
  return (
    <>
      {Array.from({ length: shown }, (_, k) => {
        const r = Math.sqrt((k + 0.5) / Math.max(shown, 3));
        const a = k * 2.39996 + hole;
        return (
          <View
            key={k}
            style={[
              styles.seed,
              {
                width: seed,
                height: seed,
                borderRadius: seed,
                left: w / 2 + rx * r * Math.cos(a) - seed / 2,
                top: h / 2 + ry * r * Math.sin(a) - seed / 2,
                backgroundColor: SEED_COLORS[Math.floor(hashRand(hole, k) * SEED_COLORS.length)],
              },
            ]}
          />
        );
      })}
    </>
  );
}

/**
 * The board as it looks `step` seeds into the last move. With a capture, one more step shows every seed
 * landed before the captured seeds go to the store; after that, the server board.
 */
function shownBoard(board: number[], last: MancalaMove | null, step: number) {
  if (!last || step >= last.path.length + (last.capture ? 1 : 0)) return board;
  const b = last.before.slice();
  b[last.from] = 0;
  for (let i = 0; i < Math.min(step, last.path.length); i++) b[last.path[i]] += 1;
  return b;
}

function Board({ view, h, myTurn }: { view: MancalaView; h: Helpers; myTurn: boolean }) {
  const { width } = useWindowDimensions();
  const last = view.last;
  const total = last?.path.length ?? 0;
  const pause = last?.capture ? 1 : 0;
  const [step, setStep] = useState(0);
  // seeds land one after another (80–170 ms a seed, about 1.4 s in all); a capture waits a moment
  // on the full pits before the seeds go to the store (the server's bot waits for this: sowingMs)
  useEffect(() => {
    if (!total) return;
    const per = Math.max(80, Math.min(170, 1400 / total));
    let k = 0;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      k += 1;
      setStep(k);
      if (k < total + pause) id = setTimeout(next, k === total ? 750 : per);
    };
    id = setTimeout(next, per);
    return () => clearTimeout(id);
  }, [total, pause]);
  const moving = !!last && step < total + pause;
  const board = shownBoard(view.board, last, step);
  const landing = moving && step > 0 ? last!.path[Math.min(step, total) - 1] : -1;
  const sown = new Set(!moving && last ? last.path : []);

  const bottom = view.mySide ?? 0;
  const top = bottom === 0 ? 1 : 0;
  const W = Math.min(width - 16, 520);
  const padX = 6;
  const storeW = Math.max(30, Math.min(58, W * 0.11));
  const cw = (W - 6 - 2 * padX - 2 * storeW - 8) / 6;
  const rowH = Math.max(48, Math.min(cw * 1.12, 76));
  const pitD = Math.min(cw - 4, rowH - 8);
  const label = 18;
  const H = 2 * rowH + 2 * label + 24;
  const storeH = 2 * rowH + 6;

  const pit = (idx: number, col: number, row: 0 | 1) => {
    const n = board[idx];
    const mine = row === 1 && view.mySide !== null;
    const playable = myTurn && mine && !moving && view.board[idx] > 0;
    const isFrom = last?.from === idx;
    const captured = step >= total && last?.capture && (last.capture.pit === idx || last.capture.opposite === idx);
    const x = padX + storeW + 4 + col * cw;
    const y = row === 0 ? 6 + label : 12 + label + rowH;
    return (
      <Pressable
        key={idx}
        disabled={!playable}
        onPress={() => {
          haptic.medium();
          client.act({ type: 'sow', pit: idx });
        }}
        accessibilityLabel={`حفرة فيها ${n} حبات`}
        style={({ pressed }) => [styles.cell, { left: x, top: y, width: cw, height: rowH }, pressed && { opacity: 0.75 }]}>
        <View
          style={[
            styles.pit,
            { width: pitD, height: pitD, borderRadius: pitD },
            playable && styles.playable,
            landing === idx && styles.landing,
            sown.has(idx) && styles.sown,
            isFrom && !moving && styles.from,
            captured && styles.captured,
          ]}>
          <Seeds count={n} w={pitD - 6} hole={idx} max={14} />
        </View>
        <View pointerEvents="none" style={[styles.countTag, row === 0 ? { top: -label - 2 } : { bottom: -label - 4 }]}>
          <Txt v="tiny" color={playable ? C.yellow : '#FBE9CF'}>
            {num(n)}
          </Txt>
        </View>
      </Pressable>
    );
  };

  const store = (side: 0 | 1, x: number) => {
    const n = board[mancalaStore(side)];
    const id = view.seats[side];
    const hit = landing === mancalaStore(side);
    return (
      <View key={`s${side}`} style={[styles.store, { left: x, top: 6 + label, width: storeW, height: storeH }, hit && styles.landing, { borderColor: alpha(SIDE_COLOR[side], 0.9) }]}>
        <View style={{ width: storeW - 8, height: storeH - 56 }}>
          <Seeds count={n} w={storeW - 8} h={storeH - 56} hole={30 + side} max={40} />
        </View>
        <Txt style={{ fontFamily: F.black, fontSize: storeW > 40 ? 20 : 16, lineHeight: 28, color: '#FFF4DA' }}>{num(n)}</Txt>
        <Txt v="tiny" color={SIDE_COLOR[side]} numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, maxWidth: storeW - 4 }}>
          {id === h.me ? 'أنت' : h.player(id).name}
        </Txt>
      </View>
    );
  };

  return (
    <View style={[styles.board, { width: W, height: H }]}>
      {store(top, padX)}
      {store(bottom, W - 6 - padX - storeW)}
      {[0, 1, 2, 3, 4, 5].map((j) => pit(top * 7 + j, 5 - j, 0))}
      {[0, 1, 2, 3, 4, 5].map((j) => pit(bottom * 7 + j, j, 1))}
    </View>
  );
}

/** A small emblem for the result banner: one pit full of seeds. */
function MancalaArt({ size }: { size: number }) {
  return (
    <View style={[styles.pit, { width: size, height: size, borderRadius: size, borderColor: WOOD_DARK, borderWidth: 4 }]}>
      <Seeds count={9} w={size - 8} hole={7} max={9} />
    </View>
  );
}

export function MancalaGame({ room, view }: { room: RoomView; view: MancalaView }) {
  const h = helpers(room);
  const [resign, setResign] = useState(false);
  if (view.mySide === null && view.phase === 'play') return <Spectator room={room} />;
  const me = view.mySide;
  const myTurn = view.phase === 'play' && view.turn === me;
  const name = (side: 0 | 1) => (view.seats[side] === h.me ? 'أنت' : h.player(view.seats[side]).name);
  const won = view.phase === 'final' && view.winner === me;
  const last = view.last;
  const s0 = view.board[mancalaStore(0)], s1 = view.board[mancalaStore(1)];

  let line = '';
  if (view.phase === 'play') {
    const byMe = last?.side === me;
    if (last?.capture) line = byMe ? `أكلت ${num(last.capture.seeds)} حبات! ` : `أكلةٌ لـ${name(last.side)}: ${num(last.capture.seeds)} حبات. `;
    if (myTurn) line += last?.extra && byMe ? 'آخر حبة في خزانتك: العب مرة أخرى!' : 'اختر حفرة من صفّك';
    else if (last?.extra && !byMe) line += `آخر حبة في خزانة ${name(view.turn)}: دورٌ آخر…`;
  }

  return (
    <>
      {won ? <Confetti /> : null}
      {view.phase === 'final' ? (
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<MancalaArt size={60} />}
          title={view.winner === 'draw' ? 'تعادل!' : won ? 'فزت!' : `الفوز ${li(h.player(view.seats[view.winner as 0 | 1]).name)}`}
          sub={view.reason === 'forfeit' ? 'انسحب الخصم' : `${num(Math.max(s0, s1))} مقابل ${num(Math.min(s0, s1))}`}
        />
      ) : null}
      <DuelBar
        h={h}
        active={view.phase === 'play' ? view.seats[view.turn] : null}
        slots={([0, 1] as const).map((side) => ({
          id: view.seats[side],
          color: SIDE_COLOR[side],
          sub: `في الخزانة: ${num(view.board[mancalaStore(side)])}`,
          score: view.score[view.seats[side]] ?? 0,
        }))}
      />
      {view.phase !== 'final' && line ? (
        <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
          {line}
        </Txt>
      ) : null}

      <Board key={last?.seq ?? 0} view={view} h={h} myTurn={myTurn} />

      {view.phase === 'final' ? <PlayAgain room={room} /> : <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من اللعبة؟"
        message="سيفوز خصمك بهذه اللعبة"
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

/** Lobby settings: seeds per pit and bot strength. */
export function MancalaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.mancala;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'mancala', patch });
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold">عدد الحبات في كل حفرة</Txt>
      <ChipPicker
        options={MANCALA_SEEDS.map((n) => ({ key: String(n), label: String(n) }))}
        value={String(settings.seeds)}
        editable={editable}
        onChange={(v) => change({ seeds: Number(v) })}
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
        onChange={(level: MancalaLevel) => change({ level })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: WOOD, borderRadius: 26, borderWidth: 3, borderColor: INK, borderBottomWidth: 7, borderBottomColor: WOOD_DARK },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pit: { backgroundColor: PIT, borderWidth: 3, borderColor: '#3A1F0C', alignItems: 'center', justifyContent: 'center' },
  playable: { borderColor: C.yellow, borderWidth: 3 },
  landing: { borderColor: '#FFFFFF', borderWidth: 3, backgroundColor: '#5E3719' },
  sown: { borderColor: 'rgba(255,255,255,0.28)' },
  from: { borderColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' },
  captured: { borderColor: C.green, borderWidth: 3 },
  countTag: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' },
  seed: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(21,23,38,0.55)' },
  store: { position: 'absolute', backgroundColor: PIT, borderRadius: 40, borderWidth: 2.5, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, overflow: 'hidden' },
});
