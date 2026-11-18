/**
 * «أكبر أم أصغر؟» — the screen. Asking: the kind and the question, two big cards side by side (one above
 * the other on a narrow phone) with «أو» between them, the timer, who answered; my tap tints my card and
 * dims the other. Reveal: both values count up gently with their units and a bar grows under each (the
 * bigger one full), the right card turns green, under each card the players who chose it; my verdict
 * (points, the streak's multiplier), the round's standings with the streak flames. Final: podium and the
 * longest streak. Sizes go through dk() so the cards grow on a computer's stage.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  AKBAR_ROUNDS,
  AKBAR_SECONDS,
  AKBAR_TOPICS,
  AKBAR_TOPIC_LABEL,
  formatValue,
  type AkbarResult,
  type AkbarSettings as Settings,
  type AkbarTopic,
  type AkbarUnit,
  type AkbarView,
  type Side,
} from '@/shared/games/akbar';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar, useCountUp } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, ResultRows, RevealNote, RoundHeader, SentNote, useMyResultFx, winnerTitle } from './islamic-ui';
import { SETTLE_MS, screenAge, useScreenClock } from './touch-motion';

const FLAME = C.orange;
const secs = (ms: number) => `${num((ms / 1000).toFixed(1))} ث`;
const multText = (m: number) => num(`×${m}`);
/** Only the digits run left to right («36.8 مليون نسمة» keeps its Arabic order). */
const isoDigits = (t: string) => t.replace(/\d[\d.,]*/g, (m) => num(m));

export function AkbarGame({ room, view }: { room: RoomView; view: AkbarView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <AkbarFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} mine={mine} />;
}

/** Right answers in a row: a flame and the count, with the multiplier it gives («×1.5»). */
function StreakChip({ n, big }: { n: number; big?: boolean }) {
  if (n < 2) return null;
  const mult = n >= 5 ? 2 : n >= 3 ? 1.5 : 1;
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.streak, big && styles.streakBig]} accessibilityLabel={`سلسلة من ${n} إجابات صحيحة`}>
      <Icon name="flame" size={big ? 18 : 14} color={FLAME} />
      <Txt style={[styles.streakText, big && { fontSize: 15, lineHeight: 22 }]}>{num(n)}</Txt>
      {mult > 1 ? <Txt style={[styles.streakMult, big && { fontSize: 13, lineHeight: 20 }]}>{multText(mult)}</Txt> : null}
    </Animated.View>
  );
}

function Round({ view, h, mine }: { view: AkbarView; h: Helpers; mine: AkbarResult | undefined }) {
  const reveal = view.phase === 'reveal';
  const last = view.round >= view.rounds;
  const pick = (side: Side) => {
    if (reveal || view.mine !== null) return;
    h.act('answer', { round: view.round, choice: side });
  };
  const note = [view.approx ? 'أرقام تقريبية' : null, view.asOf ? `حسب أرقام ${num(view.asOf)}` : null].filter(Boolean).join(' · ');
  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} right={<StreakChip n={view.streaks[h.me] ?? 0} />} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && view.mine === null} /> : null}
      <Animated.View key={view.round} entering={FadeIn.duration(220)}>
        <Txt v="title" center style={{ fontSize: dk(24), lineHeight: dk(36) }}>
          {view.ask}
        </Txt>
      </Animated.View>
      <Cards view={view} h={h} onPick={pick} />
      {reveal ? (
        <View style={{ gap: 10 }}>
          {note ? (
            <Txt v="tiny" center color={C.dim}>
              {note}
            </Txt>
          ) : null}
          {mine ? <Verdict mine={mine} /> : null}
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: r.choice === null ? NO_ANSWER : `${view.names[r.choice]} · ${secs(r.ms ?? 0)}`,
              gain: r.correct ? `+${num(r.points)}` : num(0),
              good: r.correct,
              total: view.scores[r.id],
              icon: <StreakChip n={r.streak} />,
            }))}
          />
          <HostNext h={h} last={last} />
        </View>
      ) : (
        <>
          {view.mine !== null ? <SentNote text="تم إرسال جوابك — في انتظار الآخرين" /> : null}
          <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
        </>
      )}
    </>
  );
}

function Verdict({ mine }: { mine: AkbarResult }) {
  if (mine.choice === null) return <MyVerdict tone="none" text="انتهى الوقت قبل جوابك" />;
  if (!mine.correct) return <MyVerdict tone="bad" text="إجابة خاطئة" />;
  const parts = [`إجابة صحيحة · ${num(`+${mine.points}`)}`];
  if (mine.mult > 1) parts.push(`سلسلة ${num(mine.streak)} ${multText(mine.mult)}`);
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <MyVerdict tone="good" text={parts.join(' · ')} />
      {mine.streak >= 2 && mine.mult === 1 ? (
        <Txt v="tiny" color={C.muted} center>
          إجابة صحيحة أخرى تعطي {multText(1.5)}
        </Txt>
      ) : mine.streak === 4 ? (
        <Txt v="tiny" color={C.muted} center>
          إجابة صحيحة أخرى تعطي {multText(2)}
        </Txt>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The two cards                                                       */
/* ------------------------------------------------------------------ */

function Cards({ view, h, onPick }: { view: AkbarView; h: Helpers; onPick: (side: Side) => void }) {
  const width = useContentWidth();
  // two columns from ~300 px of content (a 360 px phone); one above the other below (a 320 px phone)
  const stacked = width < 300;
  const [live] = useState(() => screenAge() > SETTLE_MS);
  const sides: Side[] = [0, 1];
  return (
    <View style={[styles.cards, stacked && { flexDirection: 'column' }]}>
      {sides.map((side) => (
        <View key={side} style={stacked ? null : { flex: 1, minWidth: 0 }}>
          <ThingCard view={view} side={side} h={h} stacked={stacked} live={live} onPick={() => onPick(side)} />
        </View>
      ))}
      <View pointerEvents="none" style={[styles.orWrap, stacked ? styles.orStacked : styles.orSide]}>
        <View style={styles.or}>
          <Txt style={styles.orText}>أو</Txt>
        </View>
      </View>
    </View>
  );
}

function ThingCard({ view, side, h, stacked, live, onPick }: { view: AkbarView; side: Side; h: Helpers; stacked: boolean; live: boolean; onPick: () => void }) {
  const accent = useAccent();
  const reduced = useReducedMotion();
  const revealed = view.correct !== null;
  const isMine = view.mine === side;
  const right = revealed && view.correct === side;
  const wrongMine = revealed && isMine && !right;
  const tone = right ? C.green : wrongMine ? C.red : isMine ? C.yellow : null;
  const dim = revealed ? false : view.mine !== null && !isMine;
  const op = useSharedValue(dim ? 0.45 : 1);
  useEffect(() => {
    op.set(reduced ? (dim ? 0.45 : 1) : withTiming(dim ? 0.45 : 1, { duration: 300, easing: Easing.out(Easing.cubic) }));
  }, [dim, reduced, op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.get() }));
  const locked = revealed || view.mine !== null;
  const choosers = (view.results ?? []).filter((r) => r.choice === side);
  const name = view.names[side];
  return (
    <Animated.View style={anim}>
      <Pressable
        disabled={locked}
        onPress={() => {
          haptic.medium();
          onPick();
        }}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected: isMine, disabled: locked }}
        style={({ pressed }) => [
          styles.card,
          { minHeight: stacked ? dk(92) : dk(150), borderColor: tone ?? alpha(accent, 0.7), backgroundColor: tone ? alpha(tone, 0.14) : C.surface },
          pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
        ]}>
        {right ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(260)} style={[styles.mark, { backgroundColor: C.green }]}>
            <Icon name="check" size={14} color="#FFFFFF" />
          </Animated.View>
        ) : wrongMine ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(260)} style={[styles.mark, { backgroundColor: C.red }]}>
            <Icon name="close" size={14} color="#FFFFFF" />
          </Animated.View>
        ) : null}
        <Txt center numberOfLines={4} style={[styles.name, { fontSize: dk(name.length > 22 ? 17 : 20), lineHeight: dk(name.length > 22 ? 26 : 30) }]}>
          {name}
        </Txt>
        {revealed && view.values && view.bars && view.unit ? (
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Value value={view.values[side]} unit={view.unit} live={live} good={right} />
            <Bar share={view.bars[side]} live={live} good={right} />
            <Row gap={4} center wrap style={{ minHeight: dk(24) }}>
              {choosers.slice(0, 8).map((r) => (
                <Avatar key={r.id} player={h.player(r.id)} size={dk(22)} />
              ))}
              {choosers.length > 8 ? (
                <Txt v="tiny" color={C.muted}>
                  +{num(choosers.length - 8)}
                </Txt>
              ) : null}
            </Row>
          </View>
        ) : isMine ? (
          <Txt v="tiny" color={C.yellow} center>
            اختيارك
          </Txt>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The value, counting up calmly (a year simply fades in). */
function Value({ value, unit, live, good }: { value: number; unit: AkbarUnit; live: boolean; good: boolean }) {
  const counts = unit !== 'year' && unit !== 'players' && unit !== 'count';
  const shown = useCountUp(value, { from: 0, delay: 120, ms: 720, enabled: live && counts });
  return (
    <Animated.View entering={live ? FadeIn.duration(300) : undefined}>
      <Txt center numberOfLines={2} adjustsFontSizeToFit style={[styles.value, { color: good ? C.green : C.text, fontSize: dk(18), lineHeight: dk(27) }]}>
        {isoDigits(formatValue(shown, unit))}
      </Txt>
    </Animated.View>
  );
}

/** A bar as long as the value's share of the bigger one, growing in once. */
function Bar({ share, live, good }: { share: number; live: boolean; good: boolean }) {
  const reduced = useReducedMotion();
  const to = Math.max(0.03, Math.min(1, share));
  const w = useSharedValue(live && !reduced ? 0 : to);
  useEffect(() => {
    if (live && !reduced) w.set(withDelay(120, withTiming(to, { duration: 720, easing: Easing.out(Easing.cubic) })));
    else w.set(to);
  }, [to, live, reduced, w]);
  const st = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: good ? C.green : C.muted }, st]} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

function AkbarFinal({ room, view, h }: { room: RoomView; view: AkbarView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const top = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === top);
  const won = winners.includes(h.me);
  const longest = Math.max(0, ...ids.map((id) => view.best[id] ?? 0));
  const streakers = ids.filter((id) => (view.best[id] ?? 0) === longest && longest >= 2);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="akbar" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم جميعاً!" />
      <Podium players={room.players} scores={view.scores} />
      {streakers.length ? (
        <RevealNote kicker="أطول سلسلة إجابات صحيحة" text={streakers.map((id) => h.player(id).name).join(' و')} sub={`${num(longest)} ${longest <= 10 ? 'إجابات' : 'إجابة'} متتالية`} />
      ) : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const TOPIC_OPTIONS = AKBAR_TOPICS.map((t) => ({ key: t, label: AKBAR_TOPIC_LABEL[t] }));
const ROUND_OPTIONS = AKBAR_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'أسئلة' : 'سؤالاً'}` }));
const SECOND_OPTIONS = AKBAR_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ${s <= 10 ? 'ثوانٍ' : 'ثانية'}` }));

export function AkbarSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.akbar;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'akbar', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الموضوع</Txt>
      <ChipPicker<AkbarTopic> editable={editable} value={s.topic} onChange={(v) => change({ topic: v })} options={TOPIC_OPTIONS} />
      <Txt v="bold">عدد الأسئلة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل سؤال</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  card: { flexGrow: 1, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 10 },
  name: { fontFamily: F.display, color: C.text },
  value: { fontFamily: F.black },
  mark: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: C.borderStrong, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 8, borderRadius: 4 },
  orWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  orSide: { top: 0, bottom: 0, left: '50%', width: 34, marginLeft: -17 },
  orStacked: { left: 0, right: 0, top: '50%', height: 34, marginTop: -17 },
  or: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.bg2, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  orText: { fontFamily: F.display, fontSize: 15, lineHeight: 22, color: C.muted },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: alpha(FLAME, 0.16), borderWidth: 1, borderColor: alpha(FLAME, 0.5) },
  streakBig: { paddingHorizontal: 10, paddingVertical: 3 },
  streakText: { fontFamily: F.black, fontSize: 13, lineHeight: 19, color: FLAME },
  streakMult: { fontFamily: F.bold, fontSize: 11, lineHeight: 17, color: C.text },
});
