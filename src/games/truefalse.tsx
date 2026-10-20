/**
 * «صح أم خطأ» — the screen: the statement, two big buttons («صح» on the right, «خطأ» on the left), who
 * answered; the reveal: the right answer with its one-line explanation and what everyone tapped; the
 * final podium with the most right answers.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { TRUEFALSE_ROUNDS, TRUEFALSE_SECONDS, type TruefalseResult, type TruefalseSettings as Settings, type TruefalseView } from '@/shared/games/truefalse';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, QuestionPanel, QuestionText, ResultRows, RevealNote, RoundHeader, SentNote, useMyResultFx, winnerTitle } from './islamic-ui';
import { useScreenClock } from './touch-motion';

const secs = (ms: number) => `${num((ms / 1000).toFixed(1))} ث`;
const word = (b: boolean) => (b ? 'صح' : 'خطأ');

export function TruefalseGame({ room, view }: { room: RoomView; view: TruefalseView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <TruefalseFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} mine={mine} />;
}

function Round({ view, h, mine }: { view: TruefalseView; h: Helpers; mine: TruefalseResult | undefined }) {
  const reveal = view.phase === 'reveal';
  const last = view.round >= view.rounds;
  const pick = (b: boolean) => {
    if (reveal || view.mine !== null) return;
    h.act('answer', { round: view.round, choice: b ? 0 : 1 });
  };
  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && view.mine === null} /> : null}
      <QuestionPanel id={view.round} kicker="صحيحة أم خاطئة؟">
        <QuestionText>{view.statement}</QuestionText>
      </QuestionPanel>
      <View style={styles.row}>
        {[true, false].map((b) => (
          <TfButton key={String(b)} value={b} mine={view.mine} truth={view.truth} onPress={() => pick(b)} />
        ))}
      </View>
      {reveal ? (
        <View style={{ gap: 10 }}>
          {mine ? (
            <MyVerdict
              tone={mine.correct ? 'good' : mine.answer === null ? 'none' : 'bad'}
              text={mine.correct ? `إجابة صحيحة · ${num(`+${mine.points}`)}` : mine.answer === null ? 'انتهى الوقت قبل جوابك' : 'إجابة خاطئة'}
            />
          ) : null}
          <RevealNote kicker={view.truth ? 'الجملة صحيحة' : 'الجملة خاطئة'} text={view.why} />
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: r.answer === null ? NO_ANSWER : `${word(r.answer)} · ${secs(r.ms ?? 0)}`,
              gain: r.correct ? `+${num(r.points)}` : num(0),
              good: r.correct,
              total: view.scores[r.id],
            }))}
          />
          <HostNext h={h} last={last} />
        </View>
      ) : (
        <>
          {view.mine !== null ? <SentNote text={`جوابك: ${word(view.mine)} — في انتظار الآخرين`} /> : null}
          <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
        </>
      )}
    </>
  );
}

/**
 * «صح» / «خطأ». Asking: both bright; my tap tints mine and dims the other. Reveal: the right one turns
 * green with a check, my wrong one red; the colours fade in calmly (~0.35 s).
 */
function TfButton({ value, mine, truth, onPress }: { value: boolean; mine: boolean | null; truth: boolean | null; onPress: () => void }) {
  const reduced = useReducedMotion();
  const revealed = truth !== null;
  const isMine = mine === value;
  const right = revealed && truth === value;
  const wrongMine = revealed && isMine && !right;
  const base = value ? C.green : C.red;
  const tone = right ? C.green : wrongMine ? C.red : isMine ? C.yellow : null;
  const dim = revealed ? !right && !wrongMine : mine !== null && !isMine;
  const op = useSharedValue(dim ? 0.4 : 1);
  useEffect(() => {
    op.set(reduced ? (dim ? 0.4 : 1) : withTiming(dim ? 0.4 : 1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [dim, reduced, op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.get() }));
  const locked = revealed || mine !== null;
  return (
    <Animated.View style={[{ flex: 1 }, anim]}>
      <Pressable
        disabled={locked}
        onPress={() => {
          haptic.medium();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={value ? 'صح' : 'خطأ'}
        accessibilityState={{ selected: isMine, disabled: locked }}
        style={({ pressed }) => [
          styles.btn,
          { borderColor: tone ?? alpha(base, 0.75), backgroundColor: alpha(tone ?? base, tone ? 0.3 : 0.16) },
          pressed && { opacity: 0.85 },
        ]}>
        <View style={[styles.badge, { backgroundColor: tone ?? base }]}>
          <Icon name={value ? 'check' : 'close'} size={26} color="#FFFFFF" />
        </View>
        <Txt style={styles.btnText}>{value ? 'صح' : 'خطأ'}</Txt>
        {revealed && right ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(260)}>
            <Txt v="tiny" color={C.green}>
              الجواب الصحيح
            </Txt>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function TruefalseFinal({ room, view, h }: { room: RoomView; view: TruefalseView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  const most = Math.max(0, ...ids.map((id) => view.rights[id] ?? 0));
  const top = ids.filter((id) => (view.rights[id] ?? 0) === most && most > 0);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="truefalse" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم جميعاً!" />
      <Podium players={room.players} scores={view.scores} />
      {top.length ? <RevealNote kicker="أكثر الإجابات الصحيحة" text={top.map((id) => h.player(id).name).join(' و')} sub={`${num(most)} من ${num(view.rounds)}`} /> : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

const ROUND_OPTIONS = TRUEFALSE_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'جمل' : 'جملة'}` }));
const SECOND_OPTIONS = TRUEFALSE_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ${s <= 10 ? 'ثوانٍ' : 'ثانية'}` }));

export function TruefalseSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.truefalse;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'truefalse', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجمل</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل جملة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  btn: { minHeight: 108, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.display, fontSize: 24, lineHeight: 36, color: C.text },
});
