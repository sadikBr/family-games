import { Image } from 'expo-image';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { cellOf } from '@/shared/ludo';
import type { LudoColor, LudoView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { RankList } from './dice-race';
import { winLine } from './duel';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { dk } from '@/ui/layout';

// board image: viewBox -6..156 → the 15×15 grid spans 6/162 … 156/162
const INSET = 6 / 162;
const SPAN = 150 / 162;
const HEX: Record<LudoColor, string> = { red: '#E2475F', green: '#2FB67C', yellow: '#F2B33D', blue: '#3D7BE0' };
const NAME: Record<LudoColor, string> = { red: 'الأحمر', green: 'الأخضر', yellow: 'الأصفر', blue: 'الأزرق' };

/** One square of a piece's walk. */
const HOP_MS = 190;
type Px = { left: number; top: number };

/**
 * A piece on the board. After a move it walks square by square along the track (`hops`: the squares
 * in between), so everyone can count the steps; other changes (back to base, a stack shifting) slide.
 */
function Pawn({ at, hops, delay, z, interactive, children }: { at: Px; hops: Px[]; delay: number; z: number; interactive: boolean; children: ReactNode }) {
  const x = useSharedValue(at.left);
  const y = useSharedValue(at.top);
  const lift = useSharedValue(0);
  const prev = useRef(at);
  useEffect(() => {
    if (prev.current.left === at.left && prev.current.top === at.top) return;
    prev.current = at;
    if (hops.length) {
      const pts = [...hops, at];
      const t = { duration: HOP_MS };
      x.set(withSequence(...pts.map((p) => withTiming(p.left, t))));
      y.set(withSequence(...pts.map((p) => withTiming(p.top, t))));
      lift.set(withSequence(...pts.flatMap(() => [withTiming(-5, { duration: HOP_MS / 2 }), withTiming(0, { duration: HOP_MS / 2 })])));
    } else {
      x.set(withDelay(delay, withTiming(at.left, { duration: 380 })));
      y.set(withDelay(delay, withTiming(at.top, { duration: 380 })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at.left, at.top]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() + lift.get() }] }));
  return (
    <Animated.View pointerEvents={interactive ? 'auto' : 'none'} style={[styles.token, { zIndex: z }, style]}>
      {children}
    </Animated.View>
  );
}

export function LudoGame({ room, view }: { room: RoomView; view: LudoView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 32, dk(460));
  const cell = (boardW * SPAN) / 15;
  const off = boardW * INSET;
  const mySeat = view.seats.find((x) => x.id === h.me);
  const final = view.phase === 'final';
  if (!mySeat && !final) return <Spectator room={room} />;

  const myTurn = !final && view.turn === h.me;

  // tokens grouped by cell so stacked pieces fan out a little
  const items: { key: string; color: LudoColor; id: string; t: number; p: number; slot: number; x: number; y: number; canMove: boolean }[] = [];
  const byCell = new Map<string, number>();
  const tapCells = new Set<string>(); // one tappable piece per square: a single tap moves one of my stacked pieces
  for (const seat of view.seats) {
    const toks = view.tokens[seat.id] ?? [];
    toks.forEach((p, t) => {
      const slot = toks.length === 2 ? [0, 3][t] : t; // quick game: the two pieces sit on a diagonal of the base
      const [r, c] = cellOf(seat.color, p, slot);
      const k = `${r}:${c}`;
      const n = byCell.get(k) ?? 0;
      byCell.set(k, n + 1);
      const shift = p >= 0 ? n * 0.18 : 0;
      const canMove = myTurn && view.phase === 'move' && seat.id === h.me && view.movable.includes(t) && !tapCells.has(k);
      if (canMove) tapCells.add(k);
      items.push({ key: `${seat.id}:${t}`, color: seat.color, id: seat.id, t, p, slot, x: c + shift, y: r - shift, canMove });
    });
  }
  // movable pieces are drawn last so nothing covers them
  items.sort((a, b) => Number(a.canMove) - Number(b.canMove));
  const size = cell * 1.15;
  const hit = Math.max(48, cell * 1.9); // tap area around a movable piece
  const px = (x: number, y: number): Px => ({ left: off + x * cell - hit / 2, top: off + y * cell - size * 0.1 - hit / 2 });

  // the last move: the piece walks along the squares in between, captured pieces go home after it lands
  const lm = view.lastMove;
  const lmSeat = lm ? view.seats.find((x) => x.id === lm.by) : undefined;
  const walk: Px[] = [];
  if (lm && lmSeat && lm.from >= 0) {
    for (let q = lm.from + 1; q < lm.to; q++) {
      const [r, c] = cellOf(lmSeat.color, q, 0);
      walk.push(px(c, r));
    }
  }
  const lmKey = lm ? `${lm.by}:${lm.token}:${lm.from}:${lm.to}` : '';
  const landAt = lm && lmSeat && lm.to >= 0 ? cellOf(lmSeat.color, lm.to, 0) : null;
  const fromAt = lm && lmSeat && lm.from >= 0 ? cellOf(lmSeat.color, lm.from, 0) : null;
  const walkMs = (walk.length + 1) * HOP_MS;

  const won = final && view.winner === h.me;
  const ranked = view.ranking.length > 1;

  return (
    <>
      {final ? (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<GameArt id="ludo" size={84} />}
            title={view.winner ? (won ? 'فزت!' : winLine(h.player(view.winner).name)) : 'انتهت اللعبة'}
            sub={ranked ? 'ترتيب الوصول' : undefined}
          />
          {ranked ? (
            <RankList
              rows={view.ranking.map((id) => {
                const seat = view.seats.find((x) => x.id === id);
                return { id, color: seat ? HEX[seat.color] : undefined, label: seat ? NAME[seat.color] : undefined };
              })}
              h={h}
            />
          ) : null}
        </>
      ) : null}
      {final && ranked ? null : (
        <PlayerStrip
          room={room}
          active={final ? [] : [view.turn]}
          entries={view.seats.map((s) => {
            const toks = view.tokens[s.id] ?? [];
            const place = view.ranking.indexOf(s.id);
            return {
              id: s.id,
              color: HEX[s.color],
              sub: place >= 0 ? `المركز ${num(place + 1)}` : `${num(toks.filter((p) => p === 56).length)}/${num(toks.length)} في البيت`,
            };
          })}
        />
      )}

      <View style={{ width: boardW, height: boardW, alignSelf: 'center', direction: 'ltr' }}>
        <Image source={BOARD_IMG['ludo-board']} style={StyleSheet.absoluteFill} contentFit="contain" />
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
          <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={boardW} height={boardW} size={boardW * 0.16} linger={2200} />
        </View>
        {fromAt ? <View key={`from${lmKey}`} pointerEvents="none" style={[styles.fromDot, { left: off + fromAt[1] * cell - cell * 0.18, top: off + fromAt[0] * cell - cell * 0.18, width: cell * 0.36, height: cell * 0.36, borderRadius: cell }]} /> : null}
        {lm?.captured.length && landAt ? (
          <Animated.View
            key={`cap${lmKey}`}
            entering={FadeIn.delay(walkMs).duration(260)}
            pointerEvents="none"
            style={[styles.capture, { left: off + landAt[1] * cell - cell * 0.75, top: off + landAt[0] * cell - cell * 0.75, width: cell * 1.5, height: cell * 1.5, borderRadius: cell }]}
          />
        ) : null}
        {items.map((it) => {
          const { canMove } = it;
          const moved = !!lm && lm.by === it.id && lm.token === it.t && lm.to === it.p;
          const sentHome = !!lm && it.p < 0 && lm.captured.includes(it.id);
          const pawn = (
            <View style={[styles.tokenHit, moved && !canMove && styles.tokenLast, canMove && { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.25) }]}>
              <Image source={BOARD_IMG[`pawn-${it.color}`]} style={{ width: size, height: size }} contentFit="contain" />
            </View>
          );
          // every piece sits in a box as big as the tap area (same size for all, so moves animate cleanly);
          // pieces I can't move let touches through to whatever is under them
          return (
            <Pawn key={it.key} at={px(it.x, it.y)} hops={moved ? walk : []} delay={sentHome ? walkMs : 0} z={canMove ? 10 : moved ? 2 : 1} interactive={canMove}>
              <View style={{ width: hit, height: hit, alignItems: 'center', justifyContent: 'center' }}>
                {canMove ? (
                  <Pressable
                    onPress={() => {
                      haptic.medium();
                      h.act('move', { token: it.t });
                    }}
                    hitSlop={4}
                    accessibilityLabel={`حرّك القطعة ${it.t + 1}`}
                    style={styles.tokenTap}>
                    {pawn}
                  </Pressable>
                ) : (
                  pawn
                )}
              </View>
            </Pawn>
          );
        })}
      </View>

      {final ? <PlayAgain room={room} /> : null}
      {final ? null : (
        <View style={styles.bottom}>
          <Pressable
            disabled={!(myTurn && view.phase === 'roll')}
            onPress={() => {
              haptic.medium();
              h.act('roll');
            }}
            accessibilityLabel="ارمِ النرد"
            style={[styles.diceBtn, myTurn && view.phase === 'roll' && styles.diceReady]}>
            {view.dice ? (
              <Image source={BOARD_IMG[`dice3d-${view.dice}`]} style={{ width: 70, height: 70 }} contentFit="contain" />
            ) : (
              <View style={styles.rollHint}>
                <Txt v="h3">ارمِ</Txt>
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            {myTurn ? (
              <Txt v="bold" color={C.yellow}>
                {view.phase === 'roll' ? 'اضغط على النرد' : view.autoAt ? 'حركة واحدة ممكنة — ستتحرك قطعتك' : 'اختر قطعة لتحريكها'}
              </Txt>
            ) : null}
            {mySeat ? (
              <Row gap={6}>
                <Image source={BOARD_IMG[`pawn-${mySeat.color}`]} style={{ width: 22, height: 22 }} contentFit="contain" />
                <Txt v="small" color={C.muted}>
                  لونك: {NAME[mySeat.color]}
                </Txt>
              </Row>
            ) : null}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  token: { position: 'absolute', left: 0, top: 0 },
  tokenHit: { borderRadius: 999, borderWidth: 2.5, borderColor: 'transparent' },
  tokenLast: { borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.18)' },
  fromDot: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1.5, borderColor: 'rgba(21,23,38,0.5)' },
  capture: { position: 'absolute', borderWidth: 2.5, borderColor: alpha(C.red, 0.85), backgroundColor: alpha(C.red, 0.18) },
  tokenTap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 20, padding: 12 },
  diceBtn: { padding: 2, borderRadius: 20, borderWidth: 3, borderColor: 'transparent', overflow: 'visible' },
  rollHint: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: C.borderStrong },
  diceReady: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.15) },
});
