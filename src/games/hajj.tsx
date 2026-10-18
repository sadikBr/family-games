/** «رحلة الحج» — race along the Hajj journey: stop at each station, answer its question together, play provision cards. */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { HAJJ_COLS, HAJJ_STATIONS, ZAD_INFO, hajjCell, type ZadKind } from '@/shared/islamic';
import type { HajjView, HajjZad, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { EventCard, FinishOrder, RaceToken, stackOffsets } from './dice-race';
import { winLine } from './duel';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { AnsweredRow, OptionGrid, useMyResultFx } from './islamic-ui';

const ASPECT = 70 / 90; // board image height / width
const ZAD_LOOK: Record<ZadKind, { color: string; icon: IconName }> = {
  talbiya: { color: '#E09A1A', icon: 'sparkle' },
  dalil: { color: '#2F7FD0', icon: 'go' },
  zamzam: { color: '#22B8B0', icon: 'drop' },
  sadaqa: { color: '#2FB67C', icon: 'gift' },
  sabr: { color: '#7B61D9', icon: 'heart' },
};

/** One provision card in my hand. */
function ZadCard({ card, active, onPress }: { card: HajjZad; active: boolean; onPress?: () => void }) {
  const info = ZAD_INFO[card.kind];
  const look = ZAD_LOOK[card.kind];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.title}: ${info.text}`}
      style={({ pressed }) => [
        styles.zad,
        { borderColor: look.color, backgroundColor: alpha(look.color, active ? 0.38 : 0.14) },
        !onPress && !info.auto && { opacity: 0.6 },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}>
      <View style={[styles.zadIcon, { backgroundColor: look.color }]}>
        <Icon name={look.icon} size={16} color="#FFFFFF" />
      </View>
      <Txt v="tiny" center style={{ fontFamily: F.black }} numberOfLines={1}>
        {info.title}
      </Txt>
      <Txt center style={styles.zadText} numberOfLines={3}>
        {info.text}
      </Txt>
    </Pressable>
  );
}
const stationName = (pos: number) => {
  if (pos === 0) return 'في الانطلاق';
  const passed = Math.floor(pos / 4) - 1;
  return pos % 4 === 0 ? HAJJ_STATIONS[pos / 4 - 1].title : passed >= 0 ? `بعد ${HAJJ_STATIONS[passed].title}` : 'في الطريق';
};

export function HajjGame({ room, view }: { room: RoomView; view: HajjView }) {
  const h = helpers(room);
  const accent = useAccent();
  const { width } = useWindowDimensions();
  const W = Math.min(width - 16, 560);
  const H = W * ASPECT;
  const [landed, setLanded] = useState(view.rollId);
  const [sadaqa, setSadaqa] = useState<{ turn: string; card: number } | null>(null);
  const me = view.players.find((p) => p.id === h.me);
  const myQuiz = view.quiz?.results?.find((r) => r.id === h.me);
  useMyResultFx(view.quiz && myQuiz ? `${view.quiz.station}:${view.quiz.text}` : null, myQuiz?.correct ?? null);
  if (!me && view.phase !== 'final') return <Spectator room={room} />;

  const final = view.phase === 'final';
  const won = final && view.winner === h.me;
  const myTurn = view.turn === h.me;
  const rolling = view.rollId !== landed;
  const at = (sq: number) => {
    const c = hajjCell(sq);
    return { x: c.x * W, y: c.y * H };
  };
  const size = (W / HAJJ_COLS) * 0.55;
  const offsets = stackOffsets(view.players, size * 0.35);
  const q = view.question;
  const quiz = view.quiz;
  const canPlay = myTurn && view.phase === 'roll' && !rolling && !view.mods.played;
  const choosing = sadaqa && sadaqa.turn === `${view.rollId}` && view.myHand.some((c) => c.id === sadaqa.card) ? sadaqa : null;
  const mods = [view.mods.bonus ? `+${view.mods.bonus} على الرمية` : '', view.mods.pass ? 'تعبر المحطة القادمة' : '', view.mods.again ? 'رمية إضافية بعدها' : ''].filter(Boolean);
  // while someone else plays: the dice in the air, or the provision card they played for this turn
  const waitLine = rolling ? 'النرد يتدحرج…' : !myTurn && view.phase === 'roll' && mods.length ? `${h.player(view.turn).name}: ${mods.join(' · ')}` : '';

  return (
    <>
      {final && !rolling ? (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<GameArt id="hajj" size={84} />}
            title={view.winner ? (won ? 'فزت!' : winLine(h.player(view.winner).name)) : 'انتهت الرحلة'}
            sub="حجّاً مبروراً وسعياً مشكوراً"
          />
          {view.order ? <FinishOrder order={view.order} players={view.players} h={h} label={stationName} /> : null}
        </>
      ) : (
        <PlayerStrip room={room} active={[view.turn]} entries={view.players.map((p) => ({ id: p.id, sub: stationName(p.pos) }))} />
      )}
      <View style={{ width: W, height: H, alignSelf: 'center', direction: 'ltr', borderRadius: 14, overflow: 'hidden' }}>
        <Image source={BOARD_IMG['hajj-board']} style={StyleSheet.absoluteFill} contentFit="fill" />
        {view.players.map((p) => (
          <RaceToken
            key={p.id}
            player={h.player(p.id)}
            pos={p.pos}
            at={at}
            size={size}
            offset={offsets[p.id]}
            rollId={view.rollId}
            dice={view.dice}
            landingOf={() => view.landing ?? p.pos}
          />
        ))}
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
          <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={W} height={H} size={W * 0.13} linger={2200} onLanded={() => setLanded(view.rollId)} />
        </View>
      </View>

      {final ? (
        <>
          {view.card && !rolling ? <EventCard card={view.card} h={h} /> : null}
          <PlayAgain room={room} />
        </>
      ) : quiz && !rolling ? (
        <Animated.View key={quiz.text} entering={FadeIn.duration(220)} style={[styles.panel, styles.quiz, { borderColor: alpha(accent, 0.6) }]}>
          <Txt v="tiny" color={accent}>
            سؤال محطة {quiz.station} — للجميع: الإجابة الصحيحة تعطيك بطاقة زاد، والأسرع يتقدّم خطوة
          </Txt>
          <Txt v="h3">{quiz.text}</Txt>
          {quiz.correct === null ? <TimerBar endsAt={quiz.endsAt} total={15000} onTick={quiz.myAnswer === null} /> : null}
          <OptionGrid options={quiz.options} mine={quiz.myAnswer} correct={quiz.correct} disabled={quiz.myAnswer !== null || quiz.correct !== null} onPick={(choice) => h.act('quiz', { choice })} />
          {quiz.results ? (
            <Row gap={6} wrap center>
              {quiz.results.map((r) => (
                <View key={r.id} style={[styles.result, { borderColor: r.correct ? C.green : C.red }]}>
                  <Avatar player={h.player(r.id)} size={22} badge={r.first ? 'star' : undefined} />
                  <Txt v="tiny" color={r.correct ? C.green : C.red}>
                    {r.correct ? (r.first ? 'الأسرع!' : 'صحيح') : 'خطأ'}
                  </Txt>
                </View>
              ))}
            </Row>
          ) : (
            <AnsweredRow ids={quiz.answered} total={view.players.length} h={h} />
          )}
        </Animated.View>
      ) : q && !rolling ? (
        <View style={[styles.panel, styles.quiz, { borderColor: alpha(accent, 0.6) }]}>
          <Txt v="tiny" color={accent}>
            {q.for === h.me ? 'سؤال لك — أجب صحيحاً وتقدّم خطوة وخذ بطاقة زاد' : `سؤال لـ${h.player(q.for).name}`}
          </Txt>
          <Txt v="h3">{q.text}</Txt>
          <TimerBar endsAt={q.endsAt} total={20000} onTick={q.for === h.me} />
          <OptionGrid options={q.options} mine={null} correct={null} disabled={q.for !== h.me} onPick={(choice) => h.act('answer', { choice })} columns={1} />
        </View>
      ) : (canPlay && choosing) || (myTurn && view.phase === 'roll' && !rolling) || waitLine ? (
        <View style={styles.panel}>
          {canPlay && choosing ? (
            <View style={{ gap: 8 }}>
              <Txt v="bold" center>
                مع من تتصدّق؟ تتقدّمان معاً خطوة
              </Txt>
              <Row gap={8} wrap center>
                {view.players
                  .filter((p) => p.id !== h.me)
                  .map((p) => (
                    <Btn key={p.id} size="sm" ghost label={h.player(p.id).name} onPress={() => {
                      haptic.medium();
                      h.act('play', { card: choosing.card, target: p.id });
                      setSadaqa(null);
                    }} />
                  ))}
                <Btn size="sm" ghost icon="close" label="إلغاء" onPress={() => setSadaqa(null)} />
              </Row>
            </View>
          ) : myTurn && view.phase === 'roll' && !rolling ? (
            <View style={{ gap: 8 }}>
              {mods.length ? (
                <Txt v="small" center color={C.yellow}>
                  هذا الدور: {mods.join(' · ')}
                </Txt>
              ) : null}
              <Btn
                size="xl"
                icon="shuffle"
                label="ارمِ النرد"
                onPress={() => {
                  haptic.medium();
                  h.act('roll');
                }}
              />
            </View>
          ) : (
            <Txt v="bold" center color={rolling ? C.muted : C.yellow}>
              {waitLine}
            </Txt>
          )}
        </View>
      ) : null}

      {!final && me && view.myHand.length ? (
        <View style={{ gap: 6 }}>
          <Txt v="tiny" color={C.muted}>
            زادك {canPlay ? '— اضغط بطاقة لتستعملها قبل الرمي (بطاقة واحدة في الدور)' : ''}
          </Txt>
          <Row gap={8} style={{ justifyContent: 'center' }}>
            {view.myHand.map((c) => (
              <ZadCard
                key={c.id}
                card={c}
                active={choosing?.card === c.id}
                onPress={
                  canPlay && !ZAD_INFO[c.kind].auto
                    ? () => {
                        haptic.tap();
                        if (c.kind === 'sadaqa') setSadaqa({ turn: `${view.rollId}`, card: c.id });
                        else h.act('play', { card: c.id });
                      }
                    : undefined
                }
              />
            ))}
          </Row>
        </View>
      ) : null}

      {!final && view.card && !rolling ? <EventCard card={view.card} h={h} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 10 },
  quiz: { borderWidth: 1.5 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 999, paddingVertical: 2, paddingStart: 2, paddingEnd: 8 },
  zad: { flex: 1, maxWidth: 130, minWidth: 0, alignItems: 'center', gap: 2, borderWidth: 2, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 6 },
  zadIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#151726' },
  zadText: { fontFamily: F.bold, fontSize: 10.5, lineHeight: 15, color: C.muted },
});
