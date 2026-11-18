/**
 * «الدومينو» — the screen: the score line, the seats (tiles in each hand, the turn), the table with the
 * snake of tiles and its two open ends (domino-board.tsx), «السوق», and my hand at the bottom. A tap on a
 * playable tile plays it when it fits one end only; otherwise the ends it fits glow on the table (and as
 * two buttons under the hand) until one is chosen. Drawing and passing are done by the server. At the end
 * of a round: everyone's tiles counted openly, the points and the score sheet; at the end: a podium (two
 * pairs side by side in team mode). Also the lobby settings.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import {
  DOMINO_TARGETS,
  DOMINO_TURN_SECONDS,
  handPips,
  pipsOf,
  type DominoEnd,
  type DominoSide,
  type DominoTileId,
  type DominoView,
} from '@/shared/games/domino';
import { li } from '@/shared/li';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, CountUp, Podium, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { EASE } from './cards/motion';
import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { DominoBoard } from './domino-board';
import { DominoBack, DominoFace } from './domino-tile';
import { TEAM, helpers, type Helpers } from './helpers';
import { useScreenClock, useSettled } from './touch-motion';

const TEAL = '#2F8F83';

/** «قطعة»، «قطعتان»، «٣ قطع»، «١١ قطعة» */
function tilesWord(n: number): string {
  if (n === 1) return 'قطعة';
  if (n === 2) return 'قطعتان';
  if (n >= 3 && n <= 10) return `${num(n)} قطع`;
  return `${num(n)} قطعة`;
}

const tileLabel = (id: DominoTileId) => {
  const [a, b] = pipsOf(id);
  return `${b}|${a}`;
};

const teamColor = (v: DominoView, side: DominoSide) => (v.teams ? TEAM[v.sides.indexOf(side)]?.color ?? TEAL : undefined);
const sideOf = (v: DominoView, id: string) => v.sides.find((x) => x.members.includes(id)) ?? null;

/** «سارة», «فريق سارة وعلي» */
function sideName(v: DominoView, h: Helpers, side: DominoSide) {
  const names = side.members.map((m) => h.player(m).name);
  return v.teams ? `فريق ${names.join(' و')}` : names[0];
}

/** «الجولة لك»، «الجولة لفريقكم»، «الجولة لسارة» */
function forSide(v: DominoView, h: Helpers, side: DominoSide, mine: string, ours: string) {
  if (side.members.includes(h.me)) return v.teams ? ours : mine;
  return li(sideName(v, h, side));
}

export function DominoGame({ room, view }: { room: RoomView; view: DominoView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <Final room={room} v={view} h={h} />;
  if (!view.seats.includes(h.me)) return <Spectator room={room} />;
  return <Table v={view} h={h} />;
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

function Table({ v, h }: { v: DominoView; h: Helpers }) {
  const cw = useContentWidth();
  const myTurn = v.phase === 'play' && v.turn === h.me;
  const [sel, setSel] = useState<DominoTileId | null>(null);
  // a move sent waits for the next position (a refusal shows as a message and frees it after a moment)
  const seq = v.last?.seq ?? 0;
  const [sentAt, setSentAt] = useState<number | null>(null);
  const pending = sentAt !== null && sentAt === seq && myTurn;
  useEffect(() => {
    if (sentAt === null) return;
    const t = setTimeout(() => setSentAt(null), 2500);
    return () => clearTimeout(t);
  }, [sentAt]);

  const moveOf = (t: DominoTileId) => v.moves.find((m) => m.tile === t);
  const selected = sel && myTurn && !pending && moveOf(sel) ? sel : null;
  const choosing: DominoEnd[] = selected ? moveOf(selected)!.ends : [];
  const equalEnds = !!v.ends && v.ends[0] === v.ends[1];

  const send = (tile: DominoTileId, end: DominoEnd) => {
    haptic.tap();
    setSel(null);
    setSentAt(seq);
    h.act('play', { round: v.round, tile, end });
  };
  const tap = (t: DominoTileId) => {
    if (!myTurn || pending) return;
    const m = moveOf(t);
    if (!m) return;
    if (m.ends.length === 1) return send(t, m.ends[0]);
    // equal ends: the side with more room
    if (equalEnds) return send(t, v.anchor < v.line.length - 1 - v.anchor ? 'L' : 'R');
    setSel(selected === t ? null : t);
  };

  const mine = v.myHand;
  const hint = !myTurn
    ? ''
    : pending
      ? '…'
      : v.opening
        ? `ابدأ الجولة بالقطعة ${tileLabel(v.opening)}`
        : selected
          ? 'اختر الطرف: اضغط على طرف مضيء'
          : !v.line.length
            ? 'دورك: ابدأ بأي قطعة'
            : 'دورك: اختر قطعة مضيئة';
  const emptyText = v.opening ? `البداية بالقطعة ${tileLabel(v.opening)}` : v.turn ? `البداية ${li(h.player(v.turn).name)} بأي قطعة` : '';

  return (
    <>
      <ScoreLine v={v} h={h} />
      <Seats v={v} h={h} width={cw} />
      <View style={{ gap: 6 }}>
        <DominoBoard line={v.line} anchor={v.anchor} width={cw} lastSeq={v.last?.kind === 'play' ? v.last.seq : null} choosing={choosing} onEnd={(end) => selected && send(selected, end)} empty={emptyText} />
        {v.deadline && v.phase === 'play' ? <TimerBar key={`${v.turn}|${seq}`} endsAt={v.deadline} total={v.turnSec * 1000} onTick={myTurn} /> : null}
        <InfoRow v={v} />
      </View>
      {v.phase === 'roundEnd' && v.result ? (
        <RoundEnd v={v} h={h} />
      ) : (
        <View style={{ gap: 6 }}>
          <View style={{ minHeight: 26, justifyContent: 'center' }}>
            {myTurn ? (
              <Txt v="bold" center color={C.yellow} numberOfLines={1}>
                {hint}
              </Txt>
            ) : (
              <Txt v="tiny" center color={C.muted}>
                في يدك {tilesWord(mine.length)} · المجموع {num(handPips(mine))}
              </Txt>
            )}
          </View>
          <Hand tiles={mine} width={cw} playable={myTurn && !pending ? v.moves.map((m) => m.tile) : null} selected={selected} onTap={tap} />
          {/* the two ends as buttons too, keeping their place so the hand never jumps */}
          <View style={{ minHeight: 52, justifyContent: 'center' }}>
            {selected && choosing.length === 2 && v.ends ? (
              <Row gap={10} style={{ direction: 'ltr', justifyContent: 'center' }}>
                <Btn size="md" label={`الطرف ${num(v.ends[0])}`} color={C.yellow} onPress={() => send(selected, 'L')} />
                <Btn size="md" label={`الطرف ${num(v.ends[1])}`} color={C.yellow} onPress={() => send(selected, 'R')} />
              </Row>
            ) : null}
          </View>
        </View>
      )}
    </>
  );
}

/** Round, target and (teams) the two scores. */
function ScoreLine({ v, h }: { v: DominoView; h: Helpers }) {
  const my = sideOf(v, h.me);
  const big = (n: number) => <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24 }}>{num(n)}</Txt>;
  return (
    <Row gap={8} center wrap style={{ justifyContent: 'center' }}>
      <View style={styles.pill}>
        <Txt v="tiny" color={C.muted}>
          الجولة {num(v.round)}
        </Txt>
      </View>
      {v.teams && my ? (
        <View style={[styles.pill, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <View style={[styles.dot, { backgroundColor: teamColor(v, my) }]} />
          <Txt v="tiny" color={C.muted}>
            لنا
          </Txt>
          {big(my.score)}
          <Txt v="tiny" color={C.dim}>
            ·
          </Txt>
          <Txt v="tiny" color={C.muted}>
            لهم
          </Txt>
          {big(v.sides.find((x) => x !== my)!.score)}
        </View>
      ) : null}
      <View style={styles.pill}>
        <Txt v="tiny" color={C.muted}>
          الهدف {num(v.target)}
        </Txt>
      </View>
    </Row>
  );
}

/** The seats in the order of play from me: avatar, name, tiles in hand, score (each for themselves). */
function Seats({ v, h, width }: { v: DominoView; h: Helpers; width: number }) {
  const at = Math.max(0, v.seats.indexOf(h.me));
  const order = [...v.seats.slice(at), ...v.seats.slice(0, at)];
  const n = order.length;
  const gap = 6;
  const w = (width - gap * (n - 1)) / n;
  const settled = useSettled();
  return (
    <Row gap={gap} style={{ justifyContent: 'center' }}>
      {order.map((id) => {
        const p = h.player(id);
        const on = v.turn === id && v.phase === 'play';
        const side = sideOf(v, id);
        const tc = side ? teamColor(v, side) : undefined;
        const count = v.counts[id] ?? 0;
        return (
          <View
            key={id}
            accessibilityLabel={`${p.name}: ${count} قطع${!v.teams && side ? `، ${side.score} نقطة` : ''}${on ? ' — دوره الآن' : ''}`}
            style={[styles.seat, { width: w, borderColor: on ? p.color : C.border, backgroundColor: on ? alpha(p.color, 0.2) : C.surface }]}>
            <Avatar player={p} size={w < 80 ? 28 : Math.min(dk(32), 44)} />
            <Txt v="tiny" numberOfLines={1} style={{ fontSize: 12, maxWidth: w - 8 }}>
              {id === h.me ? 'أنت' : p.name}
            </Txt>
            <Row gap={4} center>
              <DominoBack size={8} color={tc ?? TEAL} />
              <Txt v="bold" style={{ fontSize: 14, lineHeight: 20 }}>
                {num(count)}
              </Txt>
              {!v.teams && side ? (
                <>
                  <Txt v="tiny" color={C.dim}>
                    ·
                  </Txt>
                  <Txt v="bold" color={C.yellow} style={{ fontSize: 14, lineHeight: 20 }}>
                    <CountUp value={side.score} enabled={settled} />
                  </Txt>
                </>
              ) : null}
            </Row>
            {tc ? <View style={[styles.teamBar, { backgroundColor: tc }]} /> : null}
          </View>
        );
      })}
    </Row>
  );
}

/** «السوق» and the open ends, in words. */
function InfoRow({ v }: { v: DominoView }) {
  const n = v.boneyard;
  return (
    <Row gap={8} center wrap style={{ justifyContent: 'center' }}>
      {n > 0 ? (
        <View style={[styles.pill, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Row gap={2}>
            <DominoBack size={7} />
            <DominoBack size={7} />
          </Row>
          <Txt v="tiny" color={C.muted}>
            {v.drawOn ? `السوق: ${tilesWord(n)}` : `السوق مغلق: ${tilesWord(n)}`}
          </Txt>
        </View>
      ) : v.drawOn ? (
        <View style={styles.pill}>
          <Txt v="tiny" color={C.muted}>
            السوق فارغ
          </Txt>
        </View>
      ) : null}
      {v.ends ? (
        <View style={styles.pill}>
          <Txt v="tiny" color={C.muted}>
            الطرفان: {num(v.ends[0])} و{num(v.ends[1])}
          </Txt>
        </View>
      ) : null}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* My hand                                                             */
/* ------------------------------------------------------------------ */

function Hand({ tiles, width, playable, selected, onTap }: { tiles: DominoTileId[]; width: number; playable: DominoTileId[] | null; selected: DominoTileId | null; onTap: (t: DominoTileId) => void }) {
  const gap = 6;
  // seven a row: each tile has a 2 px padding and a 2.5 px ring around it
  const hu = Math.max(22, Math.min(Math.floor((width - gap * 6) / 7) - 9, dk(44)));
  const settled = useSettled();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap, rowGap: 10, direction: 'ltr', paddingTop: 10 }} accessibilityLabel="قطعك">
      {tiles.map((t) => (
        <HandTile key={t} id={t} hu={hu} can={playable ? playable.includes(t) : null} on={selected === t} fresh={settled} onPress={() => onTap(t)} />
      ))}
    </View>
  );
}

function HandTile({ id, hu, can, on, fresh, onPress }: { id: DominoTileId; hu: number; can: boolean | null; on: boolean; fresh: boolean; onPress: () => void }) {
  const [a, b] = pipsOf(id);
  const reduced = useReducedMotion();
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.set(reduced ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 180, easing: EASE }));
  }, [on, reduced, lift]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * lift.value }] }));
  const ring = on ? C.yellow : can ? alpha(C.green, 0.95) : 'transparent';
  return (
    <Animated.View entering={fresh && !reduced ? FadeIn.duration(300) : undefined} style={style}>
      <Pressable
        onPress={onPress}
        disabled={!can}
        accessibilityRole="button"
        accessibilityLabel={`قطعة ${b} و${a}${can ? ' — يمكن لعبها' : ''}`}
        style={{ padding: 2, borderRadius: hu * 0.22, borderWidth: 2.5, borderColor: ring, opacity: can === false ? 0.42 : 1, backgroundColor: on ? alpha(C.yellow, 0.25) : 'transparent' }}>
        <DominoFace first={b} second={a} w={hu} h={hu * 2} />
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The end of a round                                                  */
/* ------------------------------------------------------------------ */

function RoundEnd({ v, h }: { v: DominoView; h: Helpers }) {
  const r = v.result!;
  const win = r.winner ? v.sides.find((x) => x.key === r.winner) ?? null : null;
  const left = Math.ceil(useCountdown(v.nextAt) / 1000);
  const good = !!win && win.members.includes(h.me);
  return (
    <>
      <Animated.View entering={FadeIn.duration(260)} style={[styles.result, { borderColor: alpha(good ? C.green : C.yellow, 0.6), backgroundColor: alpha(good ? C.green : C.yellow, 0.12) }]}>
        <Txt v="display" center>
          {r.how === 'domino' ? 'دومينو!' : 'اللعبة مقفلة'}
        </Txt>
        <Txt v="bold" center color={C.text}>
          {win ? `الجولة ${forSide(v, h, win, 'لك', 'لفريقكم')} · ${num(`+${r.points}`)}` : 'تعادل في أقل مجموع: لا نقاط في هذه الجولة'}
        </Txt>
        <Txt v="tiny" center color={C.muted}>
          {r.how === 'domino' ? 'للفائز مجموع النقاط الباقية في أيدي الخصوم' : 'لا أحد يستطيع اللعب: يفوز صاحب أقل مجموع'}
        </Txt>
      </Animated.View>
      <HandsShown v={v} h={h} />
      <ScoreSheet v={v} h={h} />
      <View style={{ gap: 6 }}>
        {h.isHost ? <Btn size="lg" icon="next" label="الجولة التالية" onPress={() => h.act('next', { round: v.round })} /> : null}
        <HostNote>{left > 0 ? `تبدأ الجولة التالية بعد ${num(left)} ث` : 'تبدأ الجولة التالية الآن'}</HostNote>
      </View>
    </>
  );
}

/** Everyone's tiles at the end of a round, with their pip totals. */
function HandsShown({ v, h }: { v: DominoView; h: Helpers }) {
  const r = v.result!;
  const cw = useContentWidth();
  const u = Math.max(9, Math.min(dk(13), Math.floor((cw - 150) / 14)));
  return (
    <View style={{ gap: 6 }}>
      {v.seats.map((id) => {
        const p = h.player(id);
        const side = sideOf(v, id);
        const won = !!side && side.key === r.winner;
        const hand = r.hands[id] ?? [];
        return (
          <View key={id} style={[styles.handRow, won && { borderColor: alpha(C.green, 0.6), backgroundColor: alpha(C.green, 0.12) }]}>
            <Avatar player={p} size={28} />
            <View style={{ width: 62 }}>
              <Txt v="tiny" numberOfLines={1}>
                {id === h.me ? 'أنت' : p.name}
              </Txt>
              {v.teams && side ? <View style={[styles.teamBar, { position: 'relative', marginTop: 2, backgroundColor: teamColor(v, side) }]} /> : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 3, direction: 'ltr' }}>
              {hand.length ? (
                hand.map((t) => {
                  const [a, b] = pipsOf(t);
                  return <DominoFace key={t} first={b} second={a} w={u} h={u * 2} />;
                })
              ) : (
                <Txt v="tiny" color={C.green}>
                  يد فارغة
                </Txt>
              )}
            </View>
            <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24, minWidth: 30, textAlign: 'center' }} color={won ? C.green : C.text}>
              {num(r.pips[id] ?? 0)}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

/** One column per side (avatars on top), one row per round, the totals at the bottom. */
function ScoreSheet({ v, h }: { v: DominoView; h: Helpers }) {
  const rows = v.history.slice(-8);
  const hidden = v.history.length - rows.length;
  return (
    <View style={styles.sheet}>
      <Row gap={4}>
        <View style={styles.sheetLabel} />
        {v.sides.map((x) => (
          <View key={x.key} style={styles.sheetCol}>
            <Row gap={2} center>
              {x.members.map((m) => (
                <Avatar key={m} player={h.player(m)} size={22} />
              ))}
            </Row>
          </View>
        ))}
      </Row>
      {hidden > 0 ? (
        <Txt v="tiny" center color={C.dim}>
          …
        </Txt>
      ) : null}
      {rows.map((r) => (
        <Row key={r.round} gap={4}>
          <Txt v="tiny" color={C.muted} style={styles.sheetLabel}>
            {r.how === 'blocked' ? `${num(r.round)} · مقفلة` : num(r.round)}
          </Txt>
          {v.sides.map((x) => (
            <Txt key={x.key} v="bold" center color={r.winner === x.key ? C.green : C.dim} style={styles.sheetCol}>
              {r.winner === x.key ? num(`+${r.points}`) : '—'}
            </Txt>
          ))}
        </Row>
      ))}
      <View style={{ height: 1, backgroundColor: C.border }} />
      <Row gap={4}>
        <Txt v="tiny" color={C.muted} style={styles.sheetLabel}>
          المجموع
        </Txt>
        {v.sides.map((x) => (
          <Txt key={x.key} center style={[styles.sheetCol, { fontFamily: F.black, fontSize: 17, lineHeight: 26 }]} color={x.key === v.winner ? C.yellow : C.text}>
            {num(x.score)}
          </Txt>
        ))}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

function Final({ room, v, h }: { room: RoomView; v: DominoView; h: Helpers }) {
  const win = v.winner ? v.sides.find((x) => x.key === v.winner) ?? null : null;
  const mine = !!win && win.members.includes(h.me);
  const title = !win ? 'انتهت اللعبة' : v.teams ? (mine ? 'الفوز لفريقكم!' : `الفوز ${li(sideName(v, h, win))}`) : mine ? 'الفوز لك!' : `الفوز ${li(sideName(v, h, win))}`;
  const sub = win ? `${num(win.score)} نقطة من ${num(v.target)}` : undefined;
  const scores = Object.fromEntries(v.sides.flatMap((x) => x.members.map((m) => [m, x.score])));
  return (
    <>
      {mine ? <Confetti /> : null}
      <ResultBanner tone={mine ? 'good' : 'neutral'} art={<GameArt id="domino" size={84} />} title={title} sub={sub} />
      {v.teams ? <TeamPodium v={v} h={h} /> : <Podium players={room.players.filter((p) => p.id in scores)} scores={scores} />}
      {v.result ? (
        <>
          <Txt v="bold" center color={C.muted}>
            {v.result.how === 'domino' ? 'آخر جولة: دومينو!' : 'آخر جولة: اللعبة مقفلة'}
          </Txt>
          <HandsShown v={v} h={h} />
        </>
      ) : null}
      {v.history.length ? <ScoreSheet v={v} h={h} /> : null}
      <PlayAgain room={room} />
    </>
  );
}

/** Two pairs side by side: the winners on the higher step. */
function TeamPodium({ v, h }: { v: DominoView; h: Helpers }) {
  const cw = useContentWidth();
  const sides = [...v.sides].sort((a, b) => (a.key === v.winner ? -1 : b.key === v.winner ? 1 : b.score - a.score));
  const colW = Math.min(150, (Math.min(cw, dk(520)) - 20) / 2);
  return (
    <Row gap={14} style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
      {sides.map((x, i) => {
        const tc = teamColor(v, x) ?? TEAL;
        return (
          <View key={x.key} style={{ width: colW, alignItems: 'center', gap: 6 }}>
            <Row gap={4} center>
              {x.members.map((m) => (
                <Avatar key={m} player={h.player(m)} size={i === 0 ? 54 : 44} crown={i === 0} />
              ))}
            </Row>
            <Txt v="tiny" center numberOfLines={2}>
              {x.members.map((m) => (m === h.me ? 'أنت' : h.player(m).name)).join(' و')}
            </Txt>
            <View style={[styles.step, { height: i === 0 ? 80 : 52, backgroundColor: alpha(tc, 0.85) }]}>
              <Txt style={{ fontFamily: F.black, fontSize: 22, lineHeight: 30, color: C.text }}>{num(x.score)}</Txt>
            </View>
          </View>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const TARGET_LABEL: Record<number, string> = { 51: '51 (قصيرة)', 101: '101 نقطة', 151: '151 (طويلة)' };

export function DominoSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.domino;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'domino', patch });
  const n = room.players.length;
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">نهاية اللعبة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.target)} onChange={(x) => change({ target: Number(x) })} options={DOMINO_TARGETS.map((t) => ({ key: String(t), label: TARGET_LABEL[t] }))} />
      <Toggle label="اسحب من السوق" value={s.draw} editable={editable} onChange={(x) => change({ draw: x })} />
      <Txt v="tiny" color={C.muted}>
        {s.draw ? 'مع لاعبين أو ثلاثة: من لا يستطيع اللعب يسحب من السوق حتى يجد قطعة مناسبة.' : 'بلا سحب: من لا يستطيع اللعب يمرّ دوره، وقد تُقفل اللعبة مبكراً.'}
      </Txt>
      <Toggle label="فريقان (الشريكان متقابلان)" value={s.teams} editable={editable} onChange={(x) => change({ teams: x })} />
      <Txt v="tiny" color={C.muted}>
        {n === 4 ? '' : 'مع 4 لاعبين فقط. '}
        {s.teams ? 'الأول والثالث ضد الثاني والرابع، ونقاط الشريكين واحدة.' : 'كل لاعب لنفسه.'} لا سوق مع 4 لاعبين.
      </Txt>
      <Txt v="bold">وقت الدور</Txt>
      <ChipPicker<string>
        editable={editable}
        value={String(s.turnSec)}
        onChange={(x) => change({ turnSec: Number(x) })}
        options={DOMINO_TURN_SECONDS.map((t) => ({ key: String(t), label: t === 0 ? 'بلا وقت' : `${num(t)} ث` }))}
      />
      <Row gap={8}>
        <GameArt id="domino" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          7 قطع لكل لاعب. ضع قطعة تطابق أحد الطرفين؛ من يفرغ يده أولاً يأخذ نقاط ما بقي في أيدي الخصوم.
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2, borderWidth: 1, borderColor: C.borderStrong },
  dot: { width: 10, height: 10, borderRadius: 5 },
  seat: { alignItems: 'center', gap: 1, paddingTop: 6, paddingBottom: 6, borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
  teamBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
  result: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', paddingVertical: 6, paddingHorizontal: 8 },
  sheet: { backgroundColor: C.surface, borderRadius: 16, padding: 10, gap: 4 },
  sheetLabel: { width: 70 },
  sheetCol: { flex: 1, alignItems: 'center' },
  step: { width: '100%', borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
