/** «المنقلة» — a wooden Kalah board; your six pits are the bottom row and your store is on the right. */
import { useEffect, useEffectEvent, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { MANCALA_SEEDS, MANCALA_SOW, mancalaStore, type MancalaMove, type MancalaView } from '@/shared/games/mancala';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha, hashRand } from '@/theme';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { EASE } from './cards/motion';
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

type Pt = { x: number; y: number };
type Flight = { from: number; to: number; n: number };

/** The board once `k` seeds of the last move have landed (before any capture goes to the store). */
function landedBoard(last: MancalaMove, k: number) {
  const b = last.before.slice();
  b[last.from] = 0;
  for (let i = 0; i < Math.min(k, last.path.length); i++) b[last.path[i]] += 1;
  return b;
}

/**
 * Seeds that leave the pits after the last one landed: a capture (both pits to the mover's store)
 * and, when the move ends the game, what is left on each side (to its owner's store).
 */
function flightsOf(last: MancalaMove, landed: number[], board: number[]): Flight[] {
  const out: Flight[] = [];
  for (let i = 0; i < 14; i++) {
    if (i === 6 || i === 13 || landed[i] <= board[i]) continue;
    const toMover = !!last.capture && (i === last.capture.pit || i === last.capture.opposite);
    out.push({ from: i, to: mancalaStore(toMover ? last.side : i < 6 ? 0 : 1), n: landed[i] - board[i] });
  }
  return out;
}

/** A few seeds drawn in a small cluster (the hand sowing, seeds going to a store). */
function Handful({ n, seed, hole }: { n: number; seed: number; hole: number }) {
  const shown = Math.max(1, Math.min(n, 4));
  const d = seed * 2.7;
  const spots = [
    [0, 0],
    [0.62, 0.32],
    [-0.62, 0.32],
    [0, -0.62],
  ];
  return (
    <>
      {/* a soft light under the seeds in hand, so they read apart from the seeds lying in the pits */}
      <View style={[styles.handGlow, { width: d, height: d, borderRadius: d, left: -d / 2, top: -d / 2 }]} />
      {spots.slice(0, shown).map(([dx, dy], k) => (
        <View
          key={k}
          style={[
            styles.seed,
            {
              width: seed,
              height: seed,
              borderRadius: seed,
              left: (dx * seed) / 1.4 - seed / 2,
              top: (dy * seed) / 1.4 - seed / 2,
              backgroundColor: SEED_COLORS[Math.floor(hashRand(hole + 50, k) * SEED_COLORS.length)],
            },
          ]}
        />
      ))}
    </>
  );
}

/** The seeds in the sowing hand: they leave the picked pit and stop over each hole, one seed dropped per hole. */
function SowingHand({ pts, per, left, seed, hole }: { pts: Pt[]; per: number; left: number; seed: number; hole: number }) {
  const x = useSharedValue(pts[0].x);
  const y = useSharedValue(pts[0].y);
  const start = useEffectEvent(() => {
    x.set(withSequence(...pts.slice(1).map((p) => withTiming(p.x, { duration: per, easing: EASE }))));
    y.set(withSequence(...pts.slice(1).map((p) => withTiming(p.y, { duration: per, easing: EASE }))));
  });
  useEffect(() => start(), []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.hand, style]}>
      <Handful n={left} seed={seed} hole={hole} />
    </Animated.View>
  );
}

/** Seeds going from a pit to a store (a capture, the end-of-game sweep): one calm glide, fading as they arrive. */
function SeedFlight({ from, to, n, ms, seed, hole }: { from: Pt; to: Pt; n: number; ms: number; seed: number; hole: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: ms, easing: EASE }));
  }, [p, ms]);
  const style = useAnimatedStyle(() => {
    const t = p.get();
    return {
      opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
      transform: [{ translateX: from.x + (to.x - from.x) * t }, { translateY: from.y + (to.y - from.y) * t }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.hand, style]}>
      <Handful n={n} seed={seed} hole={hole} />
    </Animated.View>
  );
}

/** A soft glow behind a hole (where the last seed landed / the store that gives another turn): fades in, then stays. */
function SoftMark({ left, top, width, height, radius, color, strength }: { left: number; top: number; width: number; height: number; radius: number; color: string; strength: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withTiming(strength, { duration: 460, easing: EASE }));
  }, [o, strength]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width, height, borderRadius: radius, backgroundColor: color }, style]} />;
}

/**
 * One move on the board, step by step (the board is keyed by the move: a new move starts over).
 * step 0: the seeds are picked up; 1…n: n seeds landed (about 100 ms apart); n+1: captured / swept
 * seeds on their way to the stores; then the server board. Without `animate` (first screen after
 * joining or reconnecting, reduced motion) the move is not replayed: only its marks show.
 */
function Board({ view, h, myTurn, animate }: { view: MancalaView; h: Helpers; myTurn: boolean; animate: boolean }) {
  const { width } = useWindowDimensions();
  const last = view.last;
  const total = last?.path.length ?? 0;
  const landed = last ? landedBoard(last, total) : view.board;
  const flights = last ? flightsOf(last, landed, view.board) : [];
  const end = total + (flights.length ? 2 : 0);
  const per = MANCALA_SOW.per(total);
  const pause = last?.capture ? MANCALA_SOW.pause : 550;
  const [step, setStep] = useState(animate ? 0 : end);
  // the server's bot waits for this (sowingMs): keep the timings in MANCALA_SOW
  useEffect(() => {
    if (!animate || !end) return;
    let k = 0;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      k += 1;
      setStep(k);
      if (k < end) id = setTimeout(next, k < total ? per : k === total ? pause : MANCALA_SOW.fly);
    };
    id = setTimeout(next, per);
    return () => clearTimeout(id);
  }, [animate, end, total, per, pause]);
  const moving = !!last && step < end;
  let board = view.board;
  if (last && step < end) board = step <= total ? landedBoard(last, step) : view.board.map((n, i) => (i === 6 || i === 13 ? landed[i] : n));
  const landing = moving && step > 0 && step <= total ? last!.path[step - 1] : -1;
  const sown = new Set(!moving && last ? last.path : []);
  const lastHole = last && step >= total ? last.path[total - 1] : -1;

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
  const seedD = Math.max(7, pitD * 0.2);

  const pitBox = (idx: number) => {
    const row = Math.floor(idx / 7) === top ? 0 : 1;
    const j = idx % 7;
    const col = row === 0 ? 5 - j : j;
    return { x: padX + storeW + 4 + col * cw, y: row === 0 ? 6 + label : 12 + label + rowH, row: row as 0 | 1, col };
  };
  const storeX = (side: 0 | 1) => (side === top ? padX : W - 6 - padX - storeW);
  /** the middle of a hole (where its seeds lie), in the board's coordinates */
  const centre = (idx: number): Pt => {
    if (idx === 6 || idx === 13) {
      const side = idx === 6 ? 0 : 1;
      return { x: storeX(side) + storeW / 2, y: 6 + label + 6 + (storeH - 56) / 2 };
    }
    const b = pitBox(idx);
    return { x: b.x + cw / 2, y: b.y + rowH / 2 };
  };

  const pit = (idx: number) => {
    const n = board[idx];
    const { x, y, row } = pitBox(idx);
    const mine = row === 1 && view.mySide !== null;
    // taps are never held back by the animation: the server's board decides what can be played
    const canTap = myTurn && mine && view.board[idx] > 0;
    const playable = canTap && !moving;
    const isFrom = last?.from === idx;
    const captured = step >= total && step < end && last?.capture && (last.capture.pit === idx || last.capture.opposite === idx);
    return (
      <Pressable
        key={idx}
        disabled={!canTap}
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

  const store = (side: 0 | 1) => {
    const n = board[mancalaStore(side)];
    const id = view.seats[side];
    const hit = landing === mancalaStore(side);
    return (
      <View key={`s${side}`} style={[styles.store, { left: storeX(side), top: 6 + label, width: storeW, height: storeH }, hit && styles.landing, { borderColor: alpha(SIDE_COLOR[side], 0.9) }]}>
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

  // the last seed's hole keeps a soft glow; a store that gives another turn glows in its player's colour
  let mark = null;
  if (last && lastHole >= 0 && !(moving && step < total)) {
    if (lastHole === 6 || lastHole === 13) {
      const side = lastHole === 6 ? 0 : 1;
      mark = <SoftMark key="m" left={storeX(side) - 5} top={6 + label - 5} width={storeW + 10} height={storeH + 10} radius={44} color={SIDE_COLOR[side]} strength={0.42} />;
    } else if (!last.capture) {
      const c = centre(lastHole);
      const d = pitD + 12;
      mark = <SoftMark key="m" left={c.x - d / 2} top={c.y - d / 2} width={d} height={d} radius={d} color="#FFE9C2" strength={0.3} />;
    }
  }

  return (
    <View style={[styles.board, { width: W, height: H }]}>
      {mark}
      {store(top)}
      {store(bottom)}
      {[0, 1, 2, 3, 4, 5].map((j) => pit(top * 7 + j))}
      {[0, 1, 2, 3, 4, 5].map((j) => pit(bottom * 7 + j))}
      {last && animate && step < total ? (
        <SowingHand pts={[last.from, ...last.path].map(centre)} per={per} left={total - step} seed={seedD} hole={last.from} />
      ) : null}
      {last && animate && step === total + 1
        ? flights.map((f) => <SeedFlight key={f.from} from={centre(f.from)} to={centre(f.to)} n={f.n} ms={MANCALA_SOW.fly} seed={seedD} hole={f.from} />)
        : null}
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
  const reduced = useReducedMotion();
  // the move already on the board when this screen opened (joining, reconnecting) is not replayed
  const seq = view.last?.seq ?? 0;
  const [firstSeq, setFirstSeq] = useState(seq);
  if (seq === 0 && firstSeq !== 0) setFirstSeq(0);
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

      <Board key={seq} view={view} h={h} myTurn={myTurn} animate={seq !== firstSeq && !reduced} />

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

/** Lobby settings: seeds per pit (the bots' strength is the room's «مستوى البوتات»). */
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
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: WOOD, borderRadius: 26, borderWidth: 3, borderColor: INK, borderBottomWidth: 7, borderBottomColor: WOOD_DARK },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pit: { backgroundColor: PIT, borderWidth: 3, borderColor: '#3A1F0C', alignItems: 'center', justifyContent: 'center' },
  playable: { borderColor: C.yellow, borderWidth: 3 },
  landing: { borderColor: 'rgba(255,255,255,0.75)', borderWidth: 3, backgroundColor: '#5E3719' },
  sown: { borderColor: 'rgba(255,255,255,0.28)' },
  from: { borderColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' },
  captured: { borderColor: C.green, borderWidth: 3 },
  countTag: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' },
  seed: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(21,23,38,0.55)' },
  handGlow: { position: 'absolute', backgroundColor: 'rgba(255,236,200,0.3)', borderWidth: 1.5, borderColor: 'rgba(255,248,230,0.55)' },
  hand: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, zIndex: 5 },
  store: { position: 'absolute', backgroundColor: PIT, borderRadius: 40, borderWidth: 2.5, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, overflow: 'hidden' },
});
