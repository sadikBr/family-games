/**
 * «خمّن من؟» — the screen. My board of 24 characters (tap one to flip it down or back up), my secret
 * character, the questions and «خمّن».
 * - «أسئلة جاهزة»: the question buttons (an asked one keeps its answer: نعم in green, لا in red).
 * - «أسئلة حرة»: a field to type any question, with the ready ones as quick suggestions (a tap fills the
 *   field). The question shows on the other phone with big «نعم» / «لا» next to that player's secret
 *   portrait; against a bot, what the bot will understand shows while typing.
 * After a question the answer shows on both phones; the asker flips by hand («أسقِط من لا يطابق» helps
 * for a ready question) and taps «إنهاء الدور» — or, with «إسقاط تلقائي» and an answer from the app, the
 * board flips itself and the turn passes. Between rounds both secrets are shown; the match ends with the
 * usual banner.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  GW_BEST_OF,
  GW_CHARS,
  GW_QUESTIONS,
  GW_QUESTION,
  GW_TEXT_MAX,
  type GuesswhoSettings as Settings,
  type GuesswhoView,
  type GwEvent,
  type GwQuestionId,
} from '@/shared/games/guesswho';
import { GW_MATCH_ERROR, gwMatchQuestion } from '@/shared/games/guesswho-match';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal, Toggle } from '@/ui/controls';
import { Field } from '@/ui/field';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar, li, winLine } from './duel';
import { GW_IMG } from './guesswho-art';
import { helpers, type Helpers } from './helpers';
import { HostNext } from './islamic-ui';
import { EASE, useScreenClock, useSettled } from './touch-motion';
import { dk } from '@/ui/layout';

const DOWN = '#252A5E';
const YES = C.green;
const NO = C.red;
const DUNNO = '#7D7AA6';

/** «هو» / «هي» for a character. */
const pron = (char: number) => (GW_CHARS[char].female ? 'هي' : 'هو');
/** «باقي ١٢» */
const standingText = (n: number) => `باقي ${num(n)}`;

/* ------------------------------------------------------------------ */
/* A portrait                                                          */
/* ------------------------------------------------------------------ */

/** A character's portrait: a square tile with its own soft background, the head big over the shoulders. */
export function GwFace({ char, size }: { char: number; size: number }) {
  const c = GW_CHARS[char];
  return (
    <View style={{ width: size, height: size, overflow: 'hidden', backgroundColor: c.look.bg }}>
      <Image
        source={GW_IMG[c.id]}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={0}
        accessibilityLabel={c.name}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

function Card({
  char,
  w,
  down,
  live,
  picked,
  onPress,
  disabled,
}: {
  char: number;
  w: number;
  down: boolean;
  live: boolean;
  picked: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const reduced = useReducedMotion();
  const d = useSharedValue(down ? 1 : 0);
  useEffect(() => {
    // a gentle fade to the card's back; at once on a screen that just opened
    d.set(live && !reduced ? withTiming(down ? 1 : 0, { duration: 260, easing: EASE }) : down ? 1 : 0);
  }, [down, live, reduced, d]);
  const face = useAnimatedStyle(() => ({ opacity: 1 - 0.8 * d.get() }));
  const back = useAnimatedStyle(() => ({ opacity: 0.86 * d.get() }));
  const c = GW_CHARS[char];
  const img = w - 4;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${c.name}${down ? ' — مُسقَطة' : ''}`}
      style={({ pressed }) => [styles.card, { width: w }, picked && styles.picked, pressed && !disabled && { opacity: 0.8 }]}>
      <Animated.View style={face}>
        <View style={{ borderRadius: 7, overflow: 'hidden' }}>
          <GwFace char={char} size={img} />
        </View>
      </Animated.View>
      <Txt v="tiny" center numberOfLines={1} adjustsFontSizeToFit color={down ? C.dim : C.text} style={{ fontSize: w < 50 ? 10 : 11.5, lineHeight: w < 50 ? 14 : 16 }}>
        {c.name}
      </Txt>
      <Animated.View pointerEvents="none" style={[styles.back, { height: img }, back]}>
        <Icon name="close" size={Math.round(img * 0.42)} color={alpha('#FFFFFF', 0.55)} />
      </Animated.View>
    </Pressable>
  );
}

function Board({
  down,
  onTap,
  picked,
  disabled,
  live,
}: {
  down: Set<number>;
  onTap: (char: number) => void;
  picked: number | null;
  disabled: boolean;
  live: boolean;
}) {
  const width = useContentWidth();
  const gap = 4;
  const cols = 6;
  const w = Math.floor((Math.min(width, dk(460)) - gap * (cols - 1)) / cols);
  return (
    <View style={[styles.board, { gap, width: w * cols + gap * (cols - 1) }]}>
      {GW_CHARS.map((_, i) => (
        <Card key={i} char={i} w={w} down={down.has(i)} live={live} picked={picked === i} disabled={disabled} onPress={() => onTap(i)} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

/** The ready questions `by` asked, with their answers (a question nobody answered counts as asked). */
function asks(log: GwEvent[], by: string) {
  const m = new Map<GwQuestionId, boolean | null>();
  for (const e of log) if (e.kind === 'ask' && e.by === by && e.q) m.set(e.q, e.yes);
  return m;
}

const ynColor = (yes: boolean | null) => (yes === null ? DUNNO : yes ? YES : NO);

/** «نعم» / «لا» / «لا أعرف» as a small coloured tag. */
function YesNo({ yes, big }: { yes: boolean | null; big?: boolean }) {
  return (
    <View style={[styles.yn, { backgroundColor: ynColor(yes) }, big && styles.ynBig]}>
      <Txt v="bold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: big ? (yes === null ? 15 : 18) : 11, lineHeight: big ? 26 : 15 }}>
        {yes === null ? 'لا أعرف' : yes ? 'نعم' : 'لا'}
      </Txt>
    </View>
  );
}

/** A question as listed in the history: the ready question's short label, or what was typed. */
function askLabel(e: Extract<GwEvent, { kind: 'ask' }>): string {
  // (typed to a bot: the question it was understood as is the one answered)
  if (e.q && (!e.text || !e.human)) return GW_QUESTION[e.q].short;
  return e.text || '…';
}

function QuestionChips({
  asked,
  selected,
  onSelect,
  enabled,
}: {
  asked: Map<GwQuestionId, boolean | null>;
  selected: GwQuestionId | null;
  onSelect: (q: GwQuestionId) => void;
  enabled: boolean;
}) {
  const list = GW_QUESTIONS;
  return (
    <Row wrap gap={5} center>
      {list.map((q) => {
        const ans = asked.get(q.id);
        const done = ans !== undefined;
        const on = selected === q.id;
        return (
          <Pressable
            key={q.id}
            disabled={!enabled || done}
            onPress={() => {
              haptic.tap();
              onSelect(q.id);
            }}
            accessibilityLabel={`${q.text}${done ? ` — ${ans === null ? 'لا أعرف' : ans ? 'نعم' : 'لا'}` : ''}`}
            style={[
              styles.chip,
              done && { backgroundColor: alpha(ynColor(ans), 0.16), borderColor: alpha(ynColor(ans), 0.6) },
              on && styles.chipOn,
              !enabled && !done && { opacity: 0.55 },
            ]}>
            <Txt v="bold" color={on ? C.ink : C.text} style={{ fontSize: 12.5, lineHeight: 18 }}>
              {q.short}
            </Txt>
            {done ? <YesNo yes={ans} /> : null}
          </Pressable>
        );
      })}
    </Row>
  );
}

/** One player's questions and guesses this round, with their answers. */
function History({ log, by, title }: { log: GwEvent[]; by: string; title: string }) {
  const mine = log.filter((e) => e.by === by);
  if (!mine.length) return null;
  return (
    <View style={styles.panel}>
      <Txt v="tiny" color={C.muted}>
        {title}
      </Txt>
      <Row wrap gap={5}>
        {mine.map((e) => (
          <View key={e.n} style={[styles.smallChip, { borderColor: alpha(e.kind === 'ask' ? ynColor(e.yes) : NO, 0.6) }]}>
            <Txt v="tiny" numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, flexShrink: 1 }}>
              {e.kind === 'ask' ? askLabel(e) : `تخمين: ${GW_CHARS[e.char].name}`}
            </Txt>
            {e.kind === 'ask' ? <YesNo yes={e.yes} /> : null}
          </View>
        ))}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The latest answer                                                   */
/* ------------------------------------------------------------------ */

function LastAnswer({ view, h }: { view: GuesswhoView; h: Helpers }) {
  const e = view.log[view.log.length - 1];
  if (!e || view.pauseUntil === null) return null;
  const mine = e.by === h.me;
  const who = mine ? 'سؤالك' : `سؤال ${h.player(e.by).name}`;
  return (
    <Animated.View key={e.n} entering={FadeIn.duration(220)} style={[styles.answer, { borderColor: alpha(e.kind === 'ask' ? ynColor(e.yes) : NO, 0.7) }]}>
      <Row gap={8}>
        <Avatar player={h.player(e.by)} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {e.kind === 'ask' ? (
            <>
              <Txt v="tiny" color={C.muted}>
                {e.human ? (mine ? `${who} · جواب ${h.player(view.players.find((p) => p !== h.me)).name}` : `${who} · جوابك`) : who}
              </Txt>
              <Txt v="bold" style={{ fontSize: 16, lineHeight: 24 }}>
                {e.text || (e.q ? GW_QUESTION[e.q].text : '…')}
              </Txt>
              {e.text && e.q && !e.human ? (
                <Txt v="tiny" color={C.yellow} style={{ fontSize: 12.5, lineHeight: 18 }}>
                  {`${e.neg ? 'فُهم بصيغة معاكسة' : 'فُهم السؤال'}: ${GW_QUESTION[e.q].text}`}
                </Txt>
              ) : null}
              {e.yes === null ? (
                <Txt v="tiny" color={C.muted} style={{ fontSize: 12, lineHeight: 17 }}>
                  لا جواب في الوقت
                </Txt>
              ) : null}
            </>
          ) : (
            <>
              <Txt v="tiny" color={C.muted}>
                {mine ? 'تخمينك' : `تخمين ${h.player(e.by).name}`}
              </Txt>
              <Txt v="bold" style={{ fontSize: 16, lineHeight: 24 }}>
                {`هل ${pron(e.char)} ${GW_CHARS[e.char].name}؟`}
              </Txt>
            </>
          )}
        </View>
        {e.kind === 'ask' ? <YesNo yes={e.yes} big /> : <YesNo yes={false} big />}
      </Row>
      {view.pauseUntil ? <TimerBar endsAt={view.pauseUntil} total={view.pauseTotal} /> : null}
    </Animated.View>
  );
}

/** My secret character, small, next to the status line. */
function MySecret({ char }: { char: number }) {
  return (
    <View style={styles.secret}>
      <View style={{ borderRadius: 8, overflow: 'hidden' }}>
        <GwFace char={char} size={46} />
      </View>
      <View>
        <Txt v="tiny" color={C.muted} style={{ fontSize: 11, lineHeight: 15 }}>
          شخصيتك
        </Txt>
        <Txt v="bold" numberOfLines={1} style={{ fontSize: 15, lineHeight: 21 }}>
          {GW_CHARS[char].name}
        </Txt>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The game                                                            */
/* ------------------------------------------------------------------ */

export function GuesswhoGame({ room, view }: { room: RoomView; view: GuesswhoView }) {
  useScreenClock();
  const h = helpers(room);
  const player = view.players.includes(h.me);
  if (!player && view.phase === 'play') return <Spectator room={room} />;
  if (view.phase !== 'play') return <RoundOver room={room} view={view} h={h} />;
  return <Play key={view.round} view={view} h={h} />;
}

function Players({ view, h }: { view: GuesswhoView; h: Helpers }) {
  return (
    <DuelBar
      h={h}
      active={view.turn}
      slots={view.players.map((id) => ({ id, sub: view.phase === 'play' ? standingText(view.standing[id] ?? 0) : undefined, score: view.wins[id] ?? 0 }))}
    />
  );
}

/** A question waiting for MY answer: big «نعم» / «لا» next to my secret portrait. */
function AnswerCard({ view, h }: { view: GuesswhoView; h: Helpers }) {
  const p = view.pending!;
  const key = `${p.by}:${p.until}`;
  const [sent, setSent] = useState<string | null>(null);
  const answer = (yes: boolean) => {
    if (sent === key) return;
    haptic.medium();
    setSent(key);
    h.act('answer', { yes });
  };
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.answer, { borderColor: alpha(C.yellow, 0.7) }]}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap={6}>
            <Avatar player={h.player(p.by)} size={24} />
            <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
              {`سؤال من ${h.player(p.by).name}`}
            </Txt>
          </Row>
          <Txt v="bold" style={{ fontSize: 18, lineHeight: 27 }}>
            {p.text ?? '…'}
          </Txt>
          <Txt v="tiny" color={C.muted} style={{ fontSize: 12, lineHeight: 17 }}>
            الجواب عن شخصيتك السرية
          </Txt>
        </View>
        {view.mySecret !== null ? (
          <View style={styles.answerSecret}>
            <View style={{ borderRadius: 10, overflow: 'hidden' }}>
              <GwFace char={view.mySecret} size={78} />
            </View>
            <Txt v="bold" center numberOfLines={1} style={{ fontSize: 13, lineHeight: 18 }}>
              {GW_CHARS[view.mySecret].name}
            </Txt>
          </View>
        ) : null}
      </Row>
      <Row gap={8}>
        <Btn flex size="lg" icon="check" label="نعم" color={YES} disabled={sent === key} onPress={() => answer(true)} />
        <Btn flex size="lg" icon="close" label="لا" color={NO} disabled={sent === key} onPress={() => answer(false)} />
      </Row>
      <TimerBar endsAt={p.until} total={p.total} />
    </Animated.View>
  );
}

/** My question, waiting for the other player's answer. */
function WaitCard({ view, h, other }: { view: GuesswhoView; h: Helpers; other: string }) {
  const p = view.pending!;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.answer, { borderColor: alpha(C.blue, 0.6) }]}>
      <Txt v="tiny" color={C.muted}>
        سؤالك
      </Txt>
      <Txt v="bold" style={{ fontSize: 16, lineHeight: 24 }}>
        {p.text ?? '…'}
      </Txt>
      <Row gap={6}>
        <Avatar player={h.player(other)} size={22} />
        <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
          {`بانتظار جواب ${h.player(other).name}…`}
        </Txt>
      </Row>
      <TimerBar endsAt={p.until} total={p.total} />
    </Animated.View>
  );
}

/** «أسئلة حرة»: type a question (the ready ones fill the field), then «اسأل». */
function FreeAsk({
  view,
  h,
  other,
  text,
  setText,
  mine,
}: {
  view: GuesswhoView;
  h: Helpers;
  other: string;
  text: string;
  setText: (t: string) => void;
  mine: Map<GwQuestionId, boolean | null>;
}) {
  const vsBot = view.bots.includes(other);
  const t = text.trim();
  // the field holds a ready question as it is: it goes as that question
  const ready = GW_QUESTIONS.find((q) => q.text === t);
  const match = vsBot && t && !ready ? gwMatchQuestion(t) : null;
  const send = () => {
    if (!t) return;
    haptic.medium();
    if (ready) h.act('ask', { q: ready.id });
    else h.act('ask', { text: t });
  };
  return (
    <>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Field
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="اكتب سؤالاً جوابه نعم أو لا…"
          placeholderTextColor={C.dim}
          style={[styles.input, { borderColor: t ? alpha(C.yellow, 0.7) : C.border }]}
          maxLength={GW_TEXT_MAX}
          returnKeyType="send"
          submitBehavior="submit"
          autoCorrect={false}
          accessibilityLabel="السؤال"
        />
        <Btn size="md" icon="question" label="اسأل" disabled={!t || (!!match && !match.ok)} onPress={send} />
      </Row>
      <Txt v="tiny" center color={match ? (match.ok ? C.green : C.yellow) : C.muted} style={{ fontSize: 12.5, lineHeight: 18 }}>
        {match
          ? match.ok
            ? `${match.neg ? 'سيُفهم بصيغة معاكسة' : 'سيُفهم السؤال'}: ${GW_QUESTION[match.q].text}`
            : GW_MATCH_ERROR[match.why]
          : vsBot
            ? 'مع البوت: سؤال بسيط عن صفة واحدة، أو سؤال جاهز'
            : `الجواب من ${h.player(other).name}: نعم أو لا`}
      </Txt>
      <Txt v="tiny" color={C.muted}>
        أسئلة جاهزة
      </Txt>
      <QuestionChips asked={mine} selected={ready?.id ?? null} onSelect={(x) => setText(GW_QUESTION[x].text)} enabled />
    </>
  );
}

function Play({ view, h }: { view: GuesswhoView; h: Helpers }) {
  const settled = useSettled();
  const other = view.players[0] === h.me ? view.players[1] : view.players[0];
  const myTurn = view.turn === h.me;
  const pending = view.pending;
  const toAnswer = !!pending && pending.by !== h.me;
  const open = myTurn && view.pauseUntil === null && !pending;
  const free = view.mode === 'free';
  // what I'm choosing belongs to this turn only: a new turn (or an answer) starts afresh
  const token = `${view.turn}:${view.log.length}:${open}`;
  const [sel, setSel] = useState<{ token: string; q: GwQuestionId | null; guessing: boolean; pick: number | null; text: string }>({ token, q: null, guessing: false, pick: null, text: '' });
  const cur = sel.token === token ? sel : { token, q: null, guessing: false, pick: null, text: '' };
  const { q, guessing, pick } = cur;
  const choose = (patch: Partial<typeof cur>) => setSel({ ...cur, ...patch });
  const [resign, setResign] = useState(false);

  // my taps show at once; the server's board takes over as soon as it changes
  const server = new Set(view.myDown);
  const downKey = view.myDown.join(',');
  const [opt, setOpt] = useState<{ base: string; map: Record<number, boolean> }>({ base: downKey, map: {} });
  const optMap = opt.base === downKey ? opt.map : {};
  const down = new Set<number>();
  for (let i = 0; i < GW_CHARS.length; i++) if (optMap[i] ?? server.has(i)) down.add(i);

  const flip = (i: number) => {
    if (guessing) {
      if (down.has(i)) return;
      haptic.tap();
      choose({ pick: i });
      return;
    }
    haptic.light();
    const next = !down.has(i);
    setOpt({ base: downKey, map: { ...optMap, [i]: next } });
    h.act('flip', { char: i, down: next });
  };

  const mine = asks(view.log, h.me);
  const standing = GW_CHARS.length - down.size;
  const manualPause = myTurn && view.pauseUntil !== null && view.manual;
  const last = view.log[view.log.length - 1];
  // «أسقِط من لا يطابق» works from the answers to ready questions only
  const lastReady = !!last && last.kind === 'ask' && last.by === h.me && !!last.q && last.yes !== null;
  const myReady = view.log.filter((e) => e.kind === 'ask' && e.by === h.me && e.q && e.yes !== null);
  const showDropAll = !manualPause && myReady.length > 0 && (!view.autoFlip || myReady.some((e) => e.kind === 'ask' && e.human));

  const status = guessing
    ? 'اختر الشخصية في اللوحة'
    : toAnswer
      ? 'سؤال عن شخصيتك: أجب بنعم أو لا'
      : pending
        ? 'بانتظار الجواب…'
        : open
          ? 'دورك: اسأل أو خمّن'
          : myTurn
            ? manualPause
              ? lastReady
                ? 'أسقِط من لا يطابق ثم أنهِ الدور'
                : 'أسقِط الشخصيات بلمسها ثم أنهِ الدور'
              : 'الجواب…'
            : `الدور ${li(h.player(other).name)}`;

  return (
    <>
      <Players view={view} h={h} />
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        {view.mySecret !== null && !toAnswer ? <MySecret char={view.mySecret} /> : null}
        <View style={[styles.status, (open || toAnswer) && { borderColor: alpha(C.yellow, 0.6) }]}>
          <Txt v="tiny" color={C.muted}>
            {`الجولة ${num(view.round)}${view.bestOf > 1 ? ` · الأفضل من ${num(view.bestOf)}` : ''}`}
          </Txt>
          <Txt v="bold" color={open || toAnswer ? C.yellow : C.text} numberOfLines={2} style={{ fontSize: 15, lineHeight: 21 }}>
            {status}
          </Txt>
        </View>
      </Row>

      {toAnswer ? <AnswerCard key={`${pending.by}:${pending.until}`} view={view} h={h} /> : pending ? <WaitCard view={view} h={h} other={other} /> : null}
      {pending ? null : <LastAnswer view={view} h={h} />}
      {manualPause ? (
        <Row gap={8} center wrap>
          {lastReady ? <Btn size="sm" ghost icon="down" label="أسقِط من لا يطابق" onPress={() => h.act('dropAll')} /> : null}
          <Btn size="sm" icon="next" label="إنهاء الدور" onPress={() => h.act('done')} />
        </Row>
      ) : null}
      {!open ? null : guessing ? (
        <View style={styles.panel}>
          <Txt v="bold" center>
            {pick !== null ? `هل ${pron(pick)} ${GW_CHARS[pick].name}؟` : 'المس شخصية في اللوحة'}
          </Txt>
          <Txt v="tiny" center color={C.muted}>
            {view.wrongLoses ? 'التخمين الخاطئ يخسر الجولة' : 'التخمين الخاطئ يضيّع الدور فقط'}
          </Txt>
          <Row gap={8}>
            <Btn flex size="md" ghost label="إلغاء" onPress={() => choose({ guessing: false, pick: null })} />
            <Btn
              flex
              size="md"
              icon="target"
              label="خمّن"
              color={C.red}
              disabled={pick === null}
              onPress={() => {
                if (pick === null) return;
                haptic.medium();
                h.act('guess', { char: pick });
                choose({ guessing: false, pick: null });
              }}
            />
          </Row>
        </View>
      ) : (
        <View style={styles.panel}>
          {free ? (
            <FreeAsk view={view} h={h} other={other} text={cur.text} setText={(t) => choose({ text: t })} mine={mine} />
          ) : (
            <>
              {q ? (
                <Row gap={8}>
                  <Txt v="bold" style={{ flex: 1, fontSize: 16, lineHeight: 24 }}>
                    {GW_QUESTION[q].text}
                  </Txt>
                  <Btn
                    size="sm"
                    icon="question"
                    label="اسأل"
                    disabled={!open}
                    onPress={() => {
                      haptic.medium();
                      h.act('ask', { q });
                      choose({ q: null });
                    }}
                  />
                </Row>
              ) : (
                <Txt v="tiny" center color={C.muted}>
                  اختر سؤالاً عن شخصية الخصم
                </Txt>
              )}
              <QuestionChips asked={mine} selected={q} onSelect={(x) => choose({ q: x })} enabled={open} />
            </>
          )}
          <Btn
            size="md"
            icon="target"
            color={standing === 1 ? C.yellow : C.red}
            label={standing === 1 ? 'خمّن الآن!' : 'خمّن الشخصية'}
            disabled={!open}
            onPress={() => {
              // one character left standing: it is already chosen
              const left = GW_CHARS.map((_, i) => i).filter((i) => !down.has(i));
              choose({ q: null, guessing: true, pick: left.length === 1 ? left[0] : null });
            }}
          />
        </View>
      )}

      <Board down={down} onTap={flip} picked={guessing ? pick : null} disabled={false} live={settled} />

      {!open ? <History log={view.log} by={h.me} title="أسئلتك عن شخصية الخصم" /> : null}
      {showDropAll ? (
        <Row center>
          <Btn size="sm" ghost icon="down" label="أسقِط من لا يطابق" onPress={() => h.act('dropAll')} />
        </Row>
      ) : null}

      <History log={view.log} by={other} title={`أسئلة ${h.player(other).name} عن شخصيتك`} />

      <Row center>
        <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />
      </Row>
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من المباراة؟"
        message="سيفوز خصمك بالمباراة"
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

/* ------------------------------------------------------------------ */
/* Between rounds and the end                                          */
/* ------------------------------------------------------------------ */

function howText(view: GuesswhoView, h: Helpers): string {
  const last = view.log[view.log.length - 1];
  const loser = view.players.find((p) => p !== view.roundWinner) ?? '';
  switch (view.how) {
    case 'guess':
      return last && last.kind === 'guess' ? `تخمين صحيح: ${GW_CHARS[last.char].name}` : 'تخمين صحيح';
    case 'wrong':
      return last && last.kind === 'guess' ? `تخمين خاطئ من ${h.player(loser).name}: ليس ${GW_CHARS[last.char].name}` : 'تخمين خاطئ';
    case 'resign':
      return `انسحاب ${h.player(loser).name}`;
    case 'leave':
      return `مغادرة ${h.player(loser).name}`;
  }
  return '';
}

function SecretCard({ id, char, h }: { id: string; char: number; h: Helpers }) {
  const p = h.player(id);
  return (
    <View style={styles.reveal}>
      <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: p.color }}>
        <GwFace char={char} size={96} />
      </View>
      <Txt v="h3" center numberOfLines={1}>
        {GW_CHARS[char].name}
      </Txt>
      <Txt v="tiny" center color={C.muted} numberOfLines={1}>
        {id === h.me ? 'شخصيتك' : `شخصية ${p.name}`}
      </Txt>
    </View>
  );
}

function RoundOver({ room, view, h }: { room: RoomView; view: GuesswhoView; h: Helpers }) {
  const final = view.phase === 'final';
  const winner = final ? view.winner : view.roundWinner;
  const won = winner === h.me;
  const player = view.players.includes(h.me);
  const tone = !player ? 'neutral' : won ? 'good' : 'bad';
  const title = !winner ? 'انتهت المباراة' : won ? (final ? 'الفوز لك!' : 'الجولة لك!') : final ? winLine(h.player(winner).name) : `الجولة ${li(h.player(winner).name)}`;
  return (
    <>
      {final && won ? <Confetti /> : null}
      <Players view={view} h={h} />
      <ResultBanner tone={tone} art={final ? <GameArt id="guesswho" size={72} /> : undefined} title={title} sub={howText(view, h)} />
      {view.secrets ? (
        <Row gap={10} center>
          {/* mine first (on the right) */}
          {(player ? [h.me, ...view.players.filter((p) => p !== h.me)] : view.players).map((id) => (
            <SecretCard key={id} id={id} char={view.secrets![id]} h={h} />
          ))}
        </Row>
      ) : null}
      {view.bestOf > 1 ? (
        <Txt v="bold" center color={C.muted}>
          {view.players.map((id) => `${h.player(id).name} ${num(view.wins[id] ?? 0)}`).join('  ·  ')}
        </Txt>
      ) : null}
      {final ? (
        <PlayAgain room={room} />
      ) : (
        <>
          {view.nextAt ? <TimerBar endsAt={view.nextAt} total={view.nextTotal} /> : null}
          <HostNext h={h} last={false} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const BEST_OF_OPTIONS = GW_BEST_OF.map((n) => ({ key: String(n), label: n === 1 ? 'جولة واحدة' : `الأفضل من ${num(n)}` }));

export function GuesswhoSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.guesswho;
  // (settings saved before «طريقة الأسئلة» existed: the default)
  const mode = s.mode ?? 'free';
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'guesswho', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.bestOf)} onChange={(v) => change({ bestOf: Number(v) })} options={BEST_OF_OPTIONS} />
      <Txt v="bold">طريقة الأسئلة</Txt>
      <ChipPicker<'free' | 'ready'>
        editable={editable}
        value={mode}
        onChange={(v) => change({ mode: v })}
        options={[
          { key: 'free', label: 'أسئلة حرة' },
          { key: 'ready', label: 'أسئلة جاهزة' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        {mode === 'free'
          ? 'سؤال مكتوب، والجواب من الخصم: نعم أو لا. مع البوت: سؤال بسيط عن صفة واحدة، أو سؤال جاهز.'
          : 'أسئلة من قائمة ثابتة، والجواب من التطبيق حسب صورة الشخصية.'}
      </Txt>
      <Toggle
        label={mode === 'free' ? 'إسقاط تلقائي (حين يجيب التطبيق عن سؤال جاهز، ضد البوت)' : 'إسقاط تلقائي (يُسقط التطبيق من لا يطابق الجواب)'}
        value={s.autoFlip}
        editable={editable}
        onChange={(v) => change({ autoFlip: v })}
      />
      <Txt v="bold">التخمين الخاطئ</Txt>
      <ChipPicker<'lose' | 'turn'>
        editable={editable}
        value={s.wrongLoses ? 'lose' : 'turn'}
        onChange={(v) => change({ wrongLoses: v === 'lose' })}
        options={[
          { key: 'lose', label: 'يخسر الجولة' },
          { key: 'turn', label: 'يضيّع الدور فقط' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  card: { alignItems: 'center', backgroundColor: C.surface, borderRadius: 9, padding: 2, borderWidth: 1.5, borderColor: 'transparent' },
  picked: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.3) },
  back: { position: 'absolute', top: 2, left: 2, right: 2, borderRadius: 7, backgroundColor: DOWN, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceStrong, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9, borderWidth: 1.5, borderColor: C.borderStrong },
  chipOn: { backgroundColor: C.yellow, borderColor: C.yellow },
  smallChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1 },
  yn: { borderRadius: 999, paddingHorizontal: 6, minWidth: 26, alignItems: 'center' },
  ynBig: { paddingHorizontal: 12, paddingVertical: 4, minWidth: 54 },
  panel: { backgroundColor: C.surface, borderRadius: 16, padding: 10, gap: 8, borderWidth: 1, borderColor: C.border },
  answer: { backgroundColor: C.surface, borderRadius: 16, padding: 10, gap: 8, borderWidth: 1.5 },
  answerSecret: { alignItems: 'center', gap: 2, backgroundColor: alpha(C.yellow, 0.14), borderRadius: 12, padding: 4, borderWidth: 1.5, borderColor: alpha(C.yellow, 0.5) },
  input: {
    flex: 1,
    fontFamily: F.bold,
    fontSize: 16,
    lineHeight: 24,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    writingDirection: 'rtl',
    textAlign: 'right',
    borderWidth: 2,
  },
  status: { flex: 1, minWidth: 0, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1.5, borderColor: C.border, justifyContent: 'center' },
  secret: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: alpha(C.yellow, 0.14), borderRadius: 14, padding: 5, paddingLeft: 10, borderWidth: 1.5, borderColor: alpha(C.yellow, 0.5) },
  reveal: { alignItems: 'center', gap: 2, backgroundColor: C.surface, borderRadius: 16, padding: 10, flex: 1, maxWidth: 170 },
});
