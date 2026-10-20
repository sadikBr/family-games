/**
 * «الأعلام والعواصم» — the screen. The question: a big flag (whose country?), a country with its flag
 * (its capital?), a capital (whose?), or a country name above four flags (which is its flag?). Four
 * options; the reveal shows the country with its flag and capital and what everyone picked; the final
 * podium with the most right answers. Flags are small bundled images (src/art/flags.ts).
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { FLAG_IMG } from '@/art/flags';
import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  FLAGS_ASK,
  FLAGS_KIND_LABEL,
  FLAGS_LEVELS,
  FLAGS_MODES,
  FLAGS_REGIONS,
  FLAGS_ROUNDS,
  type FlagsSettings as Settings,
  type FlagsShown,
  type FlagsView,
} from '@/shared/games/flags';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import {
  AnsweredRow,
  HostNext,
  MyVerdict,
  NO_ANSWER,
  OPTION_LETTERS,
  OptionGrid,
  QuestionPanel,
  ResultRows,
  RoundHeader,
  useMyResultFx,
  winnerTitle,
} from './islamic-ui';
import { useScreenClock } from './touch-motion';

/** A country's flag (4:3), with a thin frame so white edges still show on the dark screen. */
export function FlagImg({ code, width, label }: { code: string; width: number; label?: string }) {
  const src = FLAG_IMG[code];
  return (
    <View style={[styles.flagFrame, { width, height: (width * 3) / 4, borderRadius: Math.max(4, width * 0.04) }]} accessibilityLabel={label ?? 'علم'}>
      {src ? <Image source={src} style={{ width: '100%', height: '100%' }} contentFit="fill" transition={0} /> : null}
    </View>
  );
}

export function FlagsGame({ room, view }: { room: RoomView; view: FlagsView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <FlagsFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} />;
}

function Round({ view, h }: { view: FlagsView; h: Helpers }) {
  const width = useContentWidth();
  const reveal = view.phase === 'reveal';
  const mine = view.results?.find((r) => r.id === h.me);
  const last = view.round >= view.rounds;
  const pick = (choice: number) => h.act('answer', { round: view.round, choice });
  const texts = view.options.map((o) => o.text ?? '');
  const columns = texts.some((t) => t.length > 14) ? 1 : 2;
  const detail = (choice: number | null) => (choice === null ? NO_ANSWER : view.kind === 'pickflag' ? `العلم ${OPTION_LETTERS[choice] ?? num(choice + 1)}` : texts[choice]);
  return (
    <>
      <RoundHeader label={FLAGS_KIND_LABEL[view.kind]} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && view.myChoice === null} /> : null}
      <QuestionPanel id={view.round} kicker={FLAGS_ASK[view.kind]} compact={view.kind === 'pickflag'}>
        <Prompt prompt={view.prompt} width={width} kind={view.kind} />
      </QuestionPanel>
      {view.kind === 'pickflag' ? (
        <FlagGrid options={view.options} mine={view.myChoice} correct={view.correct} width={width} onPick={pick} />
      ) : (
        <OptionGrid options={texts} mine={view.myChoice} correct={view.correct} onPick={pick} columns={columns} />
      )}
      {reveal ? (
        <View style={{ gap: 10 }}>
          {mine ? <MyVerdict tone={mine.correct ? 'good' : mine.choice === null ? 'none' : 'bad'} text={mine.correct ? `إجابة صحيحة · ${num(`+${mine.points}`)}` : mine.choice === null ? 'انتهى الوقت قبل جوابك' : 'إجابة خاطئة'} /> : null}
          {view.answer ? <AnswerCard answer={view.answer} /> : null}
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({ id: r.id, detail: detail(r.choice), gain: r.correct ? `+${num(r.points)}` : num(0), good: r.correct, total: view.scores[r.id] }))}
          />
          <HostNext h={h} last={last} />
        </View>
      ) : (
        <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
      )}
    </>
  );
}

function Prompt({ prompt, width, kind }: { prompt: FlagsShown; width: number; kind: FlagsView['kind'] }) {
  if (kind === 'flag' && prompt.flag) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <FlagImg code={prompt.flag} width={Math.min(220, width * 0.62)} />
      </View>
    );
  }
  return (
    <Row gap={12} center>
      {prompt.flag ? <FlagImg code={prompt.flag} width={58} /> : null}
      <Txt v="title" center style={{ flexShrink: 1 }}>
        {prompt.text}
      </Txt>
    </Row>
  );
}

/** Four flags, two by two; the reveal tints the right one green (my wrong one red) and dims the rest. */
function FlagGrid({ options, mine, correct, width, onPick }: { options: FlagsShown[]; mine: number | null; correct: number | null; width: number; onPick: (i: number) => void }) {
  const flagW = Math.min(150, (width - 10) / 2 - 20);
  return (
    <View style={styles.flagGrid}>
      {options.map((o, i) => (
        <FlagOption key={i} code={o.flag ?? ''} index={i} width={flagW} mine={mine} correct={correct} onPick={onPick} />
      ))}
    </View>
  );
}

function FlagOption({ code, index, width, mine, correct, onPick }: { code: string; index: number; width: number; mine: number | null; correct: number | null; onPick: (i: number) => void }) {
  const accent = useAccent();
  const reduced = useReducedMotion();
  const revealed = correct !== null;
  const isRight = revealed && correct === index;
  const isWrong = revealed && mine === index && !isRight;
  const isMine = !revealed && mine === index;
  const dim = revealed ? !isRight && !isWrong : mine !== null && !isMine;
  const tone = isRight ? C.green : isWrong ? C.red : isMine ? C.yellow : null;
  const op = useSharedValue(dim ? 0.4 : 1);
  useEffect(() => {
    const to = dim ? 0.4 : 1;
    op.set(reduced ? to : withDelay(revealed && dim ? 160 : 0, withTiming(to, { duration: 340, easing: Easing.out(Easing.cubic) })));
  }, [dim, revealed, reduced, op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.get() }));
  const locked = revealed || mine !== null;
  return (
    <Animated.View style={[styles.flagCell, anim]}>
      <Pressable
        disabled={locked}
        onPress={() => {
          haptic.medium();
          onPick(index);
        }}
        accessibilityRole="button"
        accessibilityLabel={`العلم ${OPTION_LETTERS[index]}`}
        accessibilityState={{ selected: isMine, disabled: locked }}
        style={({ pressed }) => [styles.flagBtn, { borderColor: tone ?? C.borderStrong, backgroundColor: tone ? alpha(tone, 0.18) : C.surface }, pressed && { opacity: 0.85 }]}>
        <FlagImg code={code} width={width} label={`العلم ${OPTION_LETTERS[index]}`} />
        <View style={[styles.flagLetter, { backgroundColor: tone ?? alpha(accent, 0.32) }]}>
          {isRight || isWrong ? <Icon name={isRight ? 'check' : 'close'} size={13} color="#FFFFFF" /> : <Txt style={styles.flagLetterText}>{OPTION_LETTERS[index]}</Txt>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The reveal's country: its flag, its name and its capital. */
function AnswerCard({ answer }: { answer: NonNullable<FlagsView['answer']> }) {
  const accent = useAccent();
  return (
    <Animated.View entering={FadeIn.duration(240)} style={[styles.answer, { backgroundColor: alpha(accent, 0.14), borderColor: alpha(accent, 0.45) }]}>
      {answer.flag ? <FlagImg code={answer.flag} width={64} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Txt v="h3">{answer.name}</Txt>
        {answer.capital ? (
          <Txt v="small" color={C.muted}>
            العاصمة: {answer.capital}
          </Txt>
        ) : null}
      </View>
    </Animated.View>
  );
}

function FlagsFinal({ room, view, h }: { room: RoomView; view: FlagsView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  const most = Math.max(0, ...ids.map((id) => view.rights[id] ?? 0));
  const top = ids.filter((id) => (view.rights[id] ?? 0) === most && most > 0);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="flags" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم جميعاً!" />
      <Podium players={room.players} scores={view.scores} />
      {top.length ? (
        <View style={[styles.answer, { justifyContent: 'center', borderColor: C.borderStrong }]}>
          <Txt v="small" color={C.muted}>
            أكثر الإجابات الصحيحة:
          </Txt>
          <Txt v="bold">
            {top.map((id) => h.player(id).name).join(' و')} ({num(most)} من {num(view.rounds)})
          </Txt>
        </View>
      ) : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = FLAGS_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'أسئلة' : 'سؤالاً'}` }));

export function FlagsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.flags;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'flags', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الأسئلة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">نوع الأسئلة</Txt>
      <ChipPicker editable={editable} value={s.mode} onChange={(mode) => change({ mode })} options={FLAGS_MODES} />
      <Txt v="bold">المنطقة</Txt>
      <ChipPicker editable={editable} value={s.region} onChange={(region) => change({ region })} options={FLAGS_REGIONS} />
      <Txt v="bold">المستوى</Txt>
      <ChipPicker editable={editable} value={s.level} onChange={(level) => change({ level })} options={FLAGS_LEVELS} />
    </View>
  );
}

const styles = StyleSheet.create({
  flagFrame: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.06)' },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  flagCell: { flexBasis: '40%', flexGrow: 1 },
  flagBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, paddingTop: 30, paddingBottom: 12, paddingHorizontal: 8 },
  flagLetter: { position: 'absolute', top: 6, start: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  flagLetterText: { fontFamily: F.black, fontSize: 12, lineHeight: 18, color: C.text },
  answer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12, flexWrap: 'wrap' },
});
