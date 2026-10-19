/**
 * «الأسرع» — the screen. Each round: the mini-game's name and what to do (alone on the screen for a
 * moment), then the stimulus at the server's moment (`showAt`, read on the synced clock). The phone
 * measures my reaction from when the stimulus was really displayed (the frame after it was drawn) and
 * sends {answer, ms}; the server judges. Then the reveal: the right answer, the fastest, the round's
 * points; and the final podium.
 */
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import {
  FAST_HINT,
  FAST_ROUNDS,
  FAST_TITLE,
  fastSeconds,
  type FastAnswer,
  type FastKind,
  type FastResult,
  type FastSettings as Settings,
  type FastView,
} from '@/shared/games/fast';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { Stage, answerText } from './fast-stage';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, ResultRows, RevealNote, RoundHeader, SentNote, winnerTitle } from './islamic-ui';
import { useScreenClock } from './touch-motion';

const KIND_ICON: Record<FastKind, IconName> = {
  green: 'bolt',
  odd: 'search',
  stars: 'starFull',
  stroop: 'drop',
  biggest: 'bars',
  arrow: 'next',
  match: 'eye',
  sum: 'calc',
  order: 'layers',
};

/** «0.42 ث» */
const secs = (ms: number) => `${num(fastSeconds(ms))} ث`;
/** «+5», «−1», «0» */
const gainText = (p: number) => (p > 0 ? num(`+${p}`) : p < 0 ? num(`−${-p}`) : num(0));

/** A monotonic clock for reaction times (the wall clock may jump). */
const tickNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** True once the server's clock reaches `at` (re-armed when `at` changes). */
function useReached(at: number): boolean {
  const [hit, setHit] = useState<number | null>(() => (client.serverNow() >= at ? at : null));
  useEffect(() => {
    const t = setTimeout(() => setHit(at), Math.max(0, at - client.serverNow()));
    return () => clearTimeout(t);
  }, [at]);
  return hit === at;
}

/** Calls `onShown` with the time of the first frame after it was drawn (= when the stimulus appeared). */
function ShownMark({ onShown }: { onShown: (t: number) => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => onShown(tickNow()));
    return () => cancelAnimationFrame(id);
  }, [onShown]);
  return null;
}

export function FastGame({ room, view }: { room: RoomView; view: FastView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <FastFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  // a fresh round: fresh taps and a fresh reaction clock
  return <FastRound key={view.round} view={view} h={h} />;
}

function FastRound({ view, h }: { view: FastView; h: Helpers }) {
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  const started = useReached(view.startAt);
  const shownNow = useReached(view.showAt);
  const reveal = view.phase === 'reveal';
  const shown = shownNow || reveal;
  const [tap, setTap] = useState<{ answer: FastAnswer | null; ms: number | null; early: boolean } | null>(null);
  const [seq, setSeq] = useState<number[]>([]);
  const shownAt = useRef<number | null>(null);
  const mine = view.mine ?? tap;
  const live = view.phase === 'play' && started && !mine;
  const maxHeight = Math.max(230, height * 0.44);
  const myResult = view.results?.find((r) => r.id === h.me);

  // my result at the reveal: a vibration only (the family asked for fewer sounds)
  const felt = useRef(reveal);
  useEffect(() => {
    if (!reveal || felt.current || !myResult) return;
    felt.current = true;
    if (myResult.correct) haptic.success();
    else if (myResult.answer !== null || myResult.early) haptic.error();
  }, [reveal, myResult]);

  const send = (answer: FastAnswer | null, early: boolean) => {
    if (!live) return;
    const t0 = shownAt.current;
    const ms = early || t0 === null ? null : Math.round(tickNow() - t0);
    setTap({ answer, ms, early });
    if (early) haptic.error();
    else haptic.medium();
    h.act('answer', { round: view.round, answer, ms, early });
  };
  const onSpot = (i: number) => {
    if (!live || seq.includes(i) || view.content.kind !== 'order') return;
    haptic.tap();
    const next = [...seq, i];
    setSeq(next);
    if (next.length === view.content.labels.length) send(next, false);
  };

  return (
    <>
      <RoundHeader label={FAST_TITLE[view.kind]} round={view.round} rounds={view.rounds} />
      {reveal && view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} /> : null}
      {/* the timer's row is kept from the start, so nothing moves when the circle turns green */}
      {!reveal && started ? shownNow && view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} /> : <View style={{ height: 26 }} /> : null}

      {!started && !reveal ? (
        <Intro view={view} />
      ) : (
        <>
          {!reveal ? (
            <Txt v="small" center color={C.muted}>
              {FAST_HINT[view.kind]}
            </Txt>
          ) : null}
          <Stage
            content={view.content}
            width={width}
            maxHeight={maxHeight}
            shown={shown}
            live={live}
            mine={mine?.answer ?? null}
            right={reveal ? view.answer : null}
            seq={seq}
            onAnswer={(a) => send(a, false)}
            onEarly={() => send(null, true)}
            onSpot={onSpot}
          />
          {shownNow && !reveal ? (
            <ShownMark
              onShown={(t) => {
                // only the first frame counts (a later re-render must not restart my clock)
                if (shownAt.current === null) shownAt.current = t;
              }}
            />
          ) : null}
        </>
      )}

      {reveal ? (
        <Reveal view={view} h={h} mine={myResult} />
      ) : started ? (
        <>
          {mine ? (
            mine.early ? (
              <MyVerdict tone="bad" text="ضغطة مبكرة — قبل الأخضر" />
            ) : (
              <SentNote text={mine.ms !== null ? `وقتك ${secs(mine.ms)} — في انتظار الآخرين` : 'في انتظار الآخرين'} />
            )
          ) : null}
          <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
        </>
      ) : null}
    </>
  );
}

/** The mini-game's name and what to do, alone on the screen until the round opens. */
function Intro({ view }: { view: FastView }) {
  const accent = useAccent();
  const left = useCountdown(view.startAt, 50);
  const [total] = useState(() => Math.max(1, view.startAt - client.serverNow()));
  const ratio = Math.max(0, Math.min(1, left / total));
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={{ backgroundColor: C.surface, borderRadius: 22, borderWidth: 2, borderColor: alpha(accent, 0.6), padding: 18, gap: 10, alignItems: 'center', minHeight: 230, justifyContent: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: alpha(accent, 0.28), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
        {view.kind === 'green' ? (
          // a red light, then a green one
          <>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.red }} />
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.green }} />
          </>
        ) : (
          <Icon name={KIND_ICON[view.kind]} size={34} color={C.text} />
        )}
      </View>
      <Txt v="display" center>
        {FAST_TITLE[view.kind]}
      </Txt>
      <Txt v="bold" center color={C.muted}>
        {FAST_HINT[view.kind]}
      </Txt>
      <Txt v="tiny" center color={C.dim}>
        استعدّ…
      </Txt>
      <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: C.raised, overflow: 'hidden' }}>
        <View style={{ width: `${ratio * 100}%`, height: 6, borderRadius: 3, backgroundColor: accent }} />
      </View>
    </Animated.View>
  );
}

function detailOf(r: FastResult): string {
  if (r.early) return 'ضغطة مبكرة';
  if (r.answer === null) return NO_ANSWER;
  if (!r.correct) return `خطأ · ${secs(r.ms ?? 0)}`;
  return secs(r.ms ?? 0);
}

/** The round's result: the fastest, my verdict, the right answer, everyone's points. */
function Reveal({ view, h, mine }: { view: FastView; h: Helpers; mine: FastResult | undefined }) {
  const results = view.results ?? [];
  const first = results.filter((r) => r.rank === 1);
  const last = view.round >= view.rounds;
  const answer = answerText(view.content, view.answer);
  return (
    <>
      <Fastest ids={first.map((r) => r.id)} ms={first[0]?.ms ?? null} h={h} />
      {mine ? <MyVerdict tone={mine.correct ? 'good' : mine.answer === null && !mine.early ? 'none' : 'bad'} text={verdict(mine)} /> : null}
      {answer ? <RevealNote text={answer} /> : null}
      <ResultRows
        h={h}
        lines={results.map((r) => ({ id: r.id, detail: detailOf(r), gain: gainText(r.points), good: r.points > 0, total: view.scores[r.id] }))}
      />
      <HostNext h={h} last={last} />
    </>
  );
}

function verdict(r: FastResult): string {
  if (r.early) return `ضغطة مبكرة · ${gainText(r.points)}`;
  if (r.answer === null) return 'انتهى الوقت قبل ضغطتك';
  if (!r.correct) return `جواب خاطئ · ${gainText(r.points)}`;
  const place = r.rank === 1 ? 'الأسرع!' : `المركز ${num(r.rank ?? 0)}`;
  return `${place} · ${secs(r.ms ?? 0)} · ${gainText(r.points)}`;
}

/** «الأسرع» with the winner's avatar, name and time (or nobody right). */
function Fastest({ ids, ms, h }: { ids: string[]; ms: number | null; h: Helpers }) {
  const accent = useAccent();
  if (!ids.length || ms === null) {
    return (
      <Txt v="bold" center color={C.muted}>
        لا إجابة صحيحة في هذه الجولة
      </Txt>
    );
  }
  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', maxWidth: '100%', backgroundColor: alpha(accent, 0.18), borderColor: alpha(accent, 0.55), borderWidth: 1.5, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14 }}>
      <Icon name="bolt" size={22} color={C.yellow} />
      <Row gap={-6}>
        {ids.slice(0, 3).map((id) => (
          <Avatar key={id} player={h.player(id)} size={34} />
        ))}
      </Row>
      <View style={{ flexShrink: 1 }}>
        <Txt v="tiny" color={C.muted}>
          الأسرع
        </Txt>
        <Txt v="h3" numberOfLines={1}>
          {ids.map((id) => (id === h.me ? 'أنت' : h.player(id).name)).join(' و')}
        </Txt>
      </View>
      <Txt v="h2" color={C.yellow}>
        {secs(ms)}
      </Txt>
    </Animated.View>
  );
}

/** The house final: banner → podium → the game's fastest tap → scoreboard → play again. */
function FastFinal({ room, view, h }: { room: RoomView; view: FastView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="fast" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم جميعاً!" />
      <Podium players={room.players} scores={view.scores} />
      {view.best ? <RevealNote kicker="أسرع ضغطة في اللعبة" text={`${h.player(view.best.id).name} · ${secs(view.best.ms)}`} sub={FAST_TITLE[view.best.kind]} /> : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

// «8 جولات», «12 جولة» (the counted noun is plural up to ten)
const ROUND_OPTIONS = FAST_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'جولات' : 'جولة'}` }));

export function FastSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.fast;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'fast', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
    </View>
  );
}
