/** «سلّم الحسنات» — snakes & ladders: good deeds lift you up, bad habits pull you down. */
import { Image } from 'expo-image';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { JUMPS, LADDERS, SNAKES, laddersCell } from '@/shared/islamic';
import type { LaddersView, PlayerPublic, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { DICE_THROW_MS, ThrownDice } from '@/ui/dice3d';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { EASE } from './cards/motion';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { EventCard, FinishOrder, stackOffsets } from './dice-race';
import { winLine } from './duel';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { dk } from '@/ui/layout';


type Pt = { x: number; y: number };

// —— the pawn's walk ————————————————————————————————————————————————————————————————————

/** one square, then the next (a calm step each) */
const STEP_MS = 180;
/** on the foot of a ladder / the head of a snake for a moment before it lifts / pulls */
const JUMP_PAUSE = 260;
/**
 * the dice land first and the number stays readable for a moment before the pawn sets off (the
 * server's bot waits for the whole walk: WALK_MS in server/games/ladders.ts)
 */
const DEPART_MS = DICE_THROW_MS + 550;

/**
 * The snakes drawn on the board picture, head to tail, as points in an 800 × 800 frame (the head
 * and the tail sit on the middle of their squares). The pawn slides along the snake's body.
 */
const SNAKE_BODY: Record<number, [number, number][]> = {
  17: [[506, 712], [526, 740]],
  47: [[283, 490], [302, 516], [345, 530], [360, 565]],
  55: [[374, 392], [410, 396], [432, 412]],
  64: [[497, 320], [508, 366], [542, 404]],
  86: [[343, 165], [366, 214], [380, 246]],
  89: [[108, 165], [118, 214], [148, 264], [138, 314]],
  93: [[181, 84], [208, 128], [222, 165]],
  98: [[581, 85], [609, 128], [620, 162]],
};

/** A smooth curve through the points (Catmull-Rom), sampled. */
function smooth(pts: Pt[], per = 6): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 1; k <= per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

const centre = (sq: number): Pt => (sq <= 0 ? { x: 0.95, y: 0.95 } : laddersCell(sq)); // waiting next to square 1

/** One roll as the pawn shows it: the squares it steps on, then a ladder / snake (or a plain glide). */
interface Walk {
  key: number;
  id: string;
  steps: number[];
  jump: { kind: 'ladder' | 'snake' | 'glide'; path: Pt[]; ms: number } | null;
}

const dist = (pts: Pt[]) => pts.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

function planWalk(key: number, id: string, from: number, to: number, dice: number, exact: boolean): Walk {
  const landing = from + dice > 100 ? (exact ? from : 100) : from + dice;
  const j = JUMPS[landing];
  if ((j ? j.to : landing) !== to || landing < from) {
    // not what one roll would do (a missed update): glide straight there
    return { key, id, steps: [], jump: { kind: 'glide', path: [centre(from), centre(to)], ms: 580 } };
  }
  const steps: number[] = [];
  for (let k = from + 1; k <= landing; k++) steps.push(k);
  if (!j) return { key, id, steps, jump: null };
  const ends = [centre(landing), centre(j.to)];
  if (j.kind === 'ladder') return { key, id, steps, jump: { kind: 'ladder', path: ends, ms: Math.round(Math.max(620, Math.min(1000, dist(ends) * 10 * 110))) } };
  const body = (SNAKE_BODY[landing] ?? []).map(([x, y]) => ({ x: x / 800, y: y / 800 }));
  const path = smooth([ends[0], ...body, ends[1]]);
  return { key, id, steps, jump: { kind: 'snake', path, ms: Math.round(Math.max(850, Math.min(1500, dist(path) * 10 * 135))) } };
}

const walkMs = (w: Walk, reduced: boolean) => (reduced ? 240 : w.steps.length * STEP_MS + (w.jump ? JUMP_PAUSE + w.jump.ms : 0));

/**
 * A pawn: rests on its square (pawns sharing a square sit side by side and make room smoothly);
 * after a roll it waits for the dice, steps square by square, then climbs the ladder or slides
 * down the snake's body. Reduced motion: one short glide.
 */
function Pawn({ player, target, size, walk, toPx, reduced }: { player: PlayerPublic; target: Pt; size: number; walk: Walk | null; toPx: (p: Pt) => Pt; reduced: boolean }) {
  const x = useSharedValue(target.x);
  const y = useSharedValue(target.y);
  const lift = useSharedValue(0);
  const seen = useRef(walk?.key ?? -1);
  const placed = useRef(target);
  const run = useEffectEvent(() => {
    const half = size / 2;
    const moved = placed.current.x !== target.x || placed.current.y !== target.y;
    placed.current = target;
    if (walk && walk.key !== seen.current) {
      seen.current = walk.key;
      if (reduced) {
        x.set(withDelay(DEPART_MS, withTiming(target.x, { duration: 320 })));
        y.set(withDelay(DEPART_MS, withTiming(target.y, { duration: 320 })));
        return;
      }
      // every point of the walk (top-left corner of the pawn); the very last one is its resting place
      const pts: { p: Pt; ms: number; ease: boolean; hop?: boolean }[] = walk.steps.map((sq) => {
        const c = toPx(centre(sq));
        return { p: { x: c.x - half, y: c.y - half }, ms: STEP_MS, ease: true, hop: true };
      });
      if (walk.jump) {
        const path = walk.jump.path.map((q) => {
          const c = toPx(q);
          return { x: c.x - half, y: c.y - half };
        });
        // equal distances take equal… nearly: the timing follows an ease-out curve along the whole path
        const lens = [0];
        for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
        const L = lens[lens.length - 1] || 1;
        const tAt = (s: number) => 1 - Math.cbrt(1 - s); // inverse of 1 − (1 − t)³
        if (path.length === 2) pts.push({ p: path[1], ms: walk.jump.ms, ease: true });
        else for (let i = 1; i < path.length; i++) pts.push({ p: path[i], ms: Math.max(1, walk.jump.ms * (tAt(lens[i] / L) - tAt(lens[i - 1] / L))), ease: false });
      }
      if (!pts.length) return;
      pts[pts.length - 1].p = target;
      const firstJump = walk.steps.length;
      const anim = (v: (p: Pt) => number) =>
        withDelay(
          DEPART_MS,
          withSequence(
            ...pts.map((q, i) => {
              const t = withTiming(v(q.p), { duration: q.ms, easing: q.ease ? EASE : Easing.linear });
              return i === firstJump && i > 0 ? withDelay(JUMP_PAUSE, t) : t;
            }),
          ),
        );
      x.set(anim((p) => p.x));
      y.set(anim((p) => p.y));
      if (walk.steps.length) {
        // each step lifts the pawn a hair off the board (no bounce: up and down in one calm move)
        const hop = Math.max(2, size * 0.1);
        lift.set(withDelay(DEPART_MS, withSequence(...walk.steps.flatMap(() => [withTiming(-hop, { duration: STEP_MS * 0.45, easing: EASE }), withTiming(0, { duration: STEP_MS * 0.55, easing: Easing.in(Easing.quad) })]))));
      }
      return;
    }
    // making room on a shared square, the board resizing… (a walk that is over or replaced goes on)
    if (!moved) return;
    x.set(withTiming(target.x, { duration: 360, easing: EASE }));
    y.set(withTiming(target.y, { duration: 360, easing: EASE }));
  });
  const key = walk?.key ?? -1;
  useEffect(() => run(), [target.x, target.y, key]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() + lift.get() }] }));
  return (
    <Animated.View style={[styles.pawn, style]} pointerEvents="none">
      <Avatar player={player} size={size} ring={player.color} />
    </Animated.View>
  );
}

type Stage = 'wait' | 'walk' | 'jump' | 'done';

export function LaddersGame({ room, view }: { room: RoomView; view: LaddersView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 16, dk(520));
  const [landed, setLanded] = useState(view.rollId);
  const reduced = useReducedMotion();
  const exact = room.settings.ladders.exact;
  // the previous positions, to see who moved and how (a screen that just opened replays nothing)
  const posKey = view.players.map((p) => `${p.id}:${p.pos}`).join(',');
  const [track, setTrack] = useState<{ rollId: number; posKey: string; pos: Record<string, number>; walk: Walk | null }>(() => ({
    rollId: view.rollId,
    posKey,
    pos: Object.fromEntries(view.players.map((p) => [p.id, p.pos])),
    walk: null,
  }));
  if (track.rollId !== view.rollId || track.posKey !== posKey) {
    const moved = view.players.filter((p) => (track.pos[p.id] ?? p.pos) !== p.pos);
    let walk: Walk | null = track.rollId === view.rollId ? track.walk : null;
    if (view.rollId === track.rollId + 1 && moved.length === 1 && view.dice) {
      const p = moved[0];
      walk = planWalk(view.rollId, p.id, track.pos[p.id], p.pos, view.dice, exact);
    }
    setTrack({ rollId: view.rollId, posKey, pos: Object.fromEntries(view.players.map((p) => [p.id, p.pos])), walk });
  }
  const walk = track.walk;
  // where the walking pawn is in its walk: waiting for the dice, stepping, on its ladder/snake, arrived
  const [stageOf, setStageOf] = useState<{ key: number; s: Stage }>({ key: -1, s: 'done' });
  const stage: Stage = !walk ? 'done' : stageOf.key === walk.key ? stageOf.s : 'wait';
  useEffect(() => {
    if (!walk) return;
    const k = walk.key;
    const steps = reduced ? 0 : walk.steps.length * STEP_MS;
    const ts = [
      setTimeout(() => setStageOf({ key: k, s: 'walk' }), DEPART_MS),
      setTimeout(() => setStageOf({ key: k, s: walk.jump ? 'jump' : 'done' }), DEPART_MS + steps),
      setTimeout(() => setStageOf({ key: k, s: 'done' }), DEPART_MS + walkMs(walk, reduced)),
    ];
    return () => ts.forEach(clearTimeout);
  }, [walk, reduced]);

  const me = view.players.find((p) => p.id === h.me);
  if (!me && view.phase !== 'final') return <Spectator room={room} />;

  const final = view.phase === 'final';
  const won = final && view.winner === h.me;
  const myTurn = view.turn === h.me;
  const rolling = view.rollId !== landed;
  // the deed card shows when the pawn reaches its ladder / snake; the result once it has arrived
  const walking = stage !== 'done';
  const beforeJump = stage === 'wait' || stage === 'walk';
  const cell = W / 10;
  const toPx = (q: Pt) => ({ x: q.x * W, y: q.y * W });
  const size = cell * 0.62;
  // pawns sharing a square sit side by side; the walking pawn takes its place there when it arrives
  const offsets = stackOffsets(view.players, size * 0.3);
  const resting = view.players.map((p) => (walk && p.id === walk.id && stage !== 'done' ? { id: p.id, pos: stage === 'wait' ? (track.pos[p.id] ?? p.pos) : -1 } : p));
  const restOffsets = stackOffsets(resting, size * 0.3);
  const square = (pos: number) => (pos ? `الخانة ${num(pos)}` : 'لم يبدأ');

  return (
    <>
      {final && !rolling && !walking ? (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="ladders" size={84} />} title={view.winner ? (won ? 'فزت!' : winLine(h.player(view.winner).name)) : 'انتهت اللعبة'} sub="الحسنات ترفع صاحبها" />
          {view.order ? <FinishOrder order={view.order} players={view.players} h={h} label={square} /> : null}
        </>
      ) : (
        <PlayerStrip room={room} active={[view.turn]} entries={view.players.map((p) => ({ id: p.id, sub: square(p.pos) }))} />
      )}
      <View style={{ width: W, height: W, alignSelf: 'center', direction: 'ltr', borderRadius: 12, overflow: 'visible' }}>
        <Image source={BOARD_IMG['ladders-board']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} contentFit="fill" />
        {[...LADDERS, ...SNAKES].map((d) => {
          const c = laddersCell(d.from);
          const good = LADDERS.includes(d);
          return (
            <View key={d.from} style={[styles.badge, { width: cell * 0.38, height: cell * 0.38, borderRadius: cell, left: c.x * W - cell * 0.48, top: c.y * W + cell * 0.08, backgroundColor: good ? C.green : C.red }]} pointerEvents="none">
              <Icon name={d.icon as IconName} size={cell * 0.26} color="#fff" />
            </View>
          );
        })}
        {view.players.map((p) => {
          const mover = walk?.id === p.id && walking;
          const c = toPx(centre(p.pos));
          const o = (mover ? offsets[p.id] : restOffsets[p.id]) ?? { x: 0, y: 0 };
          return <Pawn key={p.id} player={h.player(p.id)} target={{ x: c.x + o.x - size / 2, y: c.y + o.y - size / 2 }} size={size} walk={walk?.id === p.id ? walk : null} toPx={toPx} reduced={reduced} />;
        })}
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
          <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={W} height={W} size={W * 0.15} linger={2200} onLanded={() => setLanded(view.rollId)} />
        </View>
      </View>

      {final ? (
        <PlayAgain room={room} />
      ) : (
        <>
          <View style={styles.panel}>
            {myTurn && !rolling ? (
              <Btn
                size="xl"
                icon="shuffle"
                label="ارمِ النرد"
                onPress={() => {
                  haptic.medium();
                  h.act('roll');
                }}
              />
            ) : rolling ? (
              <Txt v="bold" center color={C.muted}>
                النرد يتدحرج…
              </Txt>
            ) : null}
            <Txt v="tiny" center color={C.dim}>
              السلالم أعمال صالحة ترفعك، والأفاعي عادات سيئة تُنزلك{exact ? ' — تحتاج الرقم المضبوط للوصول إلى 100' : ''}
            </Txt>
          </View>
          {view.card && !rolling && !(walk?.jump && beforeJump) ? <EventCard card={view.card} h={h} /> : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pawn: { position: 'absolute', left: 0, top: 0 },
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 8 },
  badge: { position: 'absolute', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: alpha('#151726', 0.9) },
});
