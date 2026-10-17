/** «معركة السفن» — your fleet stays on your phone; fire at the other sea until every ship sinks. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { BN, FLEET } from '@/shared/battleship';
import type { BattleshipView, RoomView, ShotResult } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar } from './duel';
import { helpers } from './helpers';

const INK = '#151726';
const SEA = '#2F7FD0';
const SEA_DARK = '#2A74C2';

function Ship({ cells, cell, color, dim }: { cells: number[]; cell: number; color: string; dim?: boolean }) {
  const rs = cells.map((c) => Math.floor(c / BN)), cs = cells.map((c) => c % BN);
  const r0 = Math.min(...rs), c0 = Math.min(...cs);
  const w = (Math.max(...cs) - c0 + 1) * cell, hgt = (Math.max(...rs) - r0 + 1) * cell;
  return (
    <View
      pointerEvents="none"
      style={[styles.ship, { left: c0 * cell + 2, top: r0 * cell + 2, width: w - 4, height: hgt - 4, borderRadius: Math.min(w, hgt) / 2, backgroundColor: color }, dim && { opacity: 0.55 }]}
    />
  );
}

function Shot({ r, size }: { r: ShotResult; size: number }) {
  return r === 'hit' ? (
    <Animated.View entering={ZoomIn.duration(220)} style={[styles.hit, { width: size * 0.62, height: size * 0.62, borderRadius: size }]}>
      <View style={[styles.hitIn, { width: size * 0.26, height: size * 0.26, borderRadius: size }]} />
    </Animated.View>
  ) : (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.miss, { width: size * 0.26, height: size * 0.26, borderRadius: size }]} />
  );
}

function Sea({
  size,
  ships,
  shots,
  onFire,
  last,
}: {
  size: number;
  ships: { cells: number[]; color: string; dim?: boolean }[];
  shots: Record<number, ShotResult>;
  onFire?: (cell: number) => void;
  last?: number | null;
}) {
  const cell = size / BN;
  return (
    <View style={[styles.sea, { width: size + 6, height: size + 6 }]}>
      <View style={{ width: size, height: size }}>
        {Array.from({ length: BN * BN }, (_, i) => {
          const r = Math.floor(i / BN), c = i % BN;
          return <View key={i} pointerEvents="none" style={[styles.water, { left: c * cell, top: r * cell, width: cell, height: cell }, (r + c) % 2 === 1 && { backgroundColor: SEA_DARK }]} />;
        })}
        {ships.map((s, k) => (
          <Ship key={k} cells={s.cells} cell={cell} color={s.color} dim={s.dim} />
        ))}
        {Array.from({ length: BN * BN }, (_, i) => {
          const r = Math.floor(i / BN), c = i % BN;
          const shot = shots[i];
          return (
            <Pressable
              key={`p${i}`}
              disabled={!onFire || !!shot}
              onPress={() => onFire?.(i)}
              accessibilityLabel={`${'ABCDEFGHIJ'[c]}${r + 1}`}
              style={({ pressed }) => [styles.tap, { left: c * cell, top: r * cell, width: cell, height: cell }, pressed && { backgroundColor: alpha(C.yellow, 0.4) }, last === i && styles.last]}>
              {shot ? <Shot r={shot} size={cell} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function BattleshipGame({ room, view }: { room: RoomView; view: BattleshipView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const big = Math.min(width - 30, 420);
  const [resign, setResign] = useState(false);
  // the sea being fired at is the big one: mine while the other player shoots. The switch waits a
  // moment so the result of the last shot stays in view before the seas swap.
  const want = view.phase === 'play' && view.turn !== h.me ? 'mine' : 'enemy';
  const [focus, setFocus] = useState(want);
  useEffect(() => {
    if (want === focus) return;
    const id = setTimeout(() => setFocus(want), 1300);
    return () => clearTimeout(id);
  }, [want, focus]);
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  const enemy = view.players[0] === h.me ? view.players[1] : view.players[0];
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const myFleet = view.myFleet.map((s) => ({ cells: s.cells, color: s.sunk ? '#5B6080' : '#9AA4C2' }));
  const myLeft = view.myFleet.filter((s) => !s.sunk).length;
  const won = view.phase === 'final' && view.winner === h.me;
  const resignModal = (
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
  );

  if (view.phase === 'setup') {
    const ready = view.ready.includes(h.me);
    return (
      <>
        <Txt v="title" center>
          رتّب أسطولك
        </Txt>
        <Txt v="small" center color={C.muted}>
          خصمك لن يرى سفنك. اخلطها حتى يعجبك ترتيبها ثم اضغط «جاهز».
        </Txt>
        <Sea size={big} ships={myFleet} shots={{}} />
        <Row gap={6} center wrap>
          {FLEET.map((n, k) => (
            <View key={k} style={styles.legend}>
              {Array.from({ length: n }, (_, j) => (
                <View key={j} style={styles.legendDot} />
              ))}
            </View>
          ))}
        </Row>
        {ready ? (
          <Txt v="bold" center color={C.green}>
            جاهز! في انتظار {h.player(enemy).name}…
          </Txt>
        ) : (
          <Row gap={8}>
            <Btn flex size="lg" ghost icon="shuffle" label="اخلط" onPress={() => h.act('shuffle')} />
            <Btn
              flex
              size="lg"
              icon="check"
              label="جاهز"
              color={C.green}
              onPress={() => {
                haptic.medium();
                h.act('ready');
              }}
            />
          </Row>
        )}
        <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />
        {resignModal}
      </>
    );
  }

  const small = Math.min(big * 0.62, 260);
  // keyed so that swapping the two seas moves them instead of drawing every shot again
  const enemySea = (size: number) => (
    <View key="enemy" style={{ gap: 4 }}>
      <Txt v="tiny" center color={C.muted}>
        بحر {h.player(enemy).name}
      </Txt>
      <Sea
        size={size}
        ships={[
          ...(view.enemyFleet ?? []).filter((s) => !view.enemySunk.some((x) => x[0] === s[0])).map((cells) => ({ cells, color: '#E58A9A', dim: true })),
          ...view.enemySunk.map((cells) => ({ cells, color: '#5B6080' })),
        ]}
        shots={view.myShots}
        last={view.last && view.last.by === h.me ? view.last.cell : null}
        onFire={
          myTurn
            ? (cell) => {
                haptic.medium();
                h.act('fire', { cell });
              }
            : undefined
        }
      />
    </View>
  );
  const mySea = (size: number) => (
    <View key="mine" style={{ gap: 4 }}>
      <Txt v="tiny" center color={C.muted}>
        أسطولك
      </Txt>
      <Sea size={size} ships={myFleet} shots={view.enemyShots} last={view.last && view.last.by !== h.me ? view.last.cell : null} />
    </View>
  );

  const lastLine = view.last
    ? `${view.last.by === h.me ? 'قذيفتك' : `قذيفة ${h.player(view.last.by).name}`}: ${view.last.result === 'sunk' ? 'أغرقت سفينة!' : view.last.result === 'hit' ? 'إصابة!' : 'في الماء'}`
    : null;

  return (
    <>
      {won ? <Confetti /> : null}
      <DuelBar
        h={h}
        active={view.phase === 'play' ? view.turn : null}
        slots={[
          { id: h.me, color: '#9AA4C2', sub: `بقيت ${num(myLeft)} سفن`, score: view.score[h.me] ?? 0 },
          { id: enemy, color: C.red, sub: `بقيت ${num(view.enemyFleetLeft)} سفن`, score: view.score[enemy] ?? 0 },
        ]}
      />
      {view.phase === 'final' ? (
        <ResultBanner tone={won ? 'good' : 'bad'} art={<GameArt id="battleship" size={72} />} title={`فاز ${h.player(view.winner!).name}`} sub={view.resigned ? (won ? 'انسحب الخصم' : 'انسحبت') : 'أغرق كل السفن!'} />
      ) : myTurn ? (
        <Txt v="bold" center color={C.yellow}>
          اضغط على خانة في بحر {h.player(enemy).name}
        </Txt>
      ) : null}
      {lastLine && view.phase === 'play' ? (
        <Animated.View key={view.last!.id} entering={FadeIn.duration(180)}>
          <Txt v="small" center color={view.last!.result === 'miss' ? C.muted : C.orange}>
            {lastLine}
          </Txt>
        </Animated.View>
      ) : null}

      {focus === 'enemy' ? [enemySea(big), mySea(small)] : [mySea(big), enemySea(small)]}
      {view.phase === 'final' ? <PlayAgain room={room} /> : <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />}
      {resignModal}
    </>
  );
}

const styles = StyleSheet.create({
  sea: { alignSelf: 'center', direction: 'ltr', padding: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: SEA, borderRadius: 14, borderWidth: 3, borderColor: INK, overflow: 'hidden' },
  water: { position: 'absolute', backgroundColor: SEA },
  ship: { position: 'absolute', borderWidth: 2.5, borderColor: INK },
  tap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  last: { borderWidth: 2, borderColor: C.yellow, borderRadius: 4 },
  hit: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F08A3E', borderWidth: 2, borderColor: INK },
  hitIn: { backgroundColor: '#FFE08A' },
  miss: { backgroundColor: alpha('#FFFFFF', 0.85) },
  legend: { flexDirection: 'row', gap: 2, backgroundColor: C.surface, borderRadius: 8, padding: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 3, backgroundColor: '#9AA4C2' },
});
