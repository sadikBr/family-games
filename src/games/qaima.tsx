/**
 * «املأ القائمة» — the screen. While typing: the list's title and size in a card, the timer, the box
 * (Enter or «أضف» sends; a gentle line says «غير موجود في القائمة» or «مكتوب من قبل»), my accepted answers
 * growing below it (newest first), and the others as a strip with their COUNTS only; «انتهيت» ends the
 * round early once everyone pressed it. The reveal: the list's title with how much the family covered,
 * my verdict, the round's results, «أشهر ما فات الجميع», then the whole list as chips — the found ones
 * with their finders' avatars, the unique ones highlighted, the missed ones dimmed. The final podium.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  QAIMA_NOTE,
  QAIMA_ROUNDS,
  QAIMA_SECONDS,
  QAIMA_TOPICS,
  type QaimaChip,
  type QaimaNote,
  type QaimaSettings as Settings,
  type QaimaView,
} from '@/shared/games/qaima';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Field } from '@/ui/field';
import { TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HostNext, MyVerdict, QuizFinal, ResultRows, RevealNote, RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';

/** «لا إجابات»، «إجابة واحدة»، «إجابتان»، «3 إجابات»، «12 إجابة» */
export function answersText(n: number) {
  if (n === 0) return 'لا إجابات';
  if (n === 1) return 'إجابة واحدة';
  if (n === 2) return 'إجابتان';
  return n <= 10 ? `${num(n)} إجابات` : `${num(n)} إجابة`;
}

export function QaimaGame({ room, view }: { room: RoomView; view: QaimaView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="qaima" h={h} sub="قائمة بعد قائمة… أحسنتم جميعاً!" />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} room={room} view={view} h={h} />;
}

function Round({ room, view, h }: { room: RoomView; view: QaimaView; h: Helpers }) {
  const reveal = view.phase === 'reveal' ? view.reveal : null;
  return (
    <>
      <RoundHeader label={QAIMA_TOPICS[view.prompt.topic]} round={view.round} rounds={view.rounds} />
      {reveal ? <RevealPart room={room} view={view} h={h} /> : <PlayPart room={room} view={view} h={h} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Typing                                                              */
/* ------------------------------------------------------------------ */

function PromptCard({ view, covered }: { view: QaimaView; covered?: number }) {
  const accent = useAccent();
  const settled = useSettled();
  const p = view.prompt;
  return (
    <Animated.View entering={settled ? FadeInDown.duration(380) : undefined} style={[styles.prompt, { borderColor: alpha(accent, 0.7), backgroundColor: alpha(accent, 0.14) }]}>
      <Txt v="title" center style={{ fontSize: 24, lineHeight: 36 }}>
        {p.title}
      </Txt>
      <Txt v="small" center color={C.muted}>
        {covered !== undefined ? `الإجابات المختلفة: ${num(covered)} من ${num(p.size)}` : `عددها في القائمة: ${num(p.size)}`}
      </Txt>
      {covered === undefined && p.hint ? (
        <Txt v="tiny" center color={C.dim}>
          {p.hint}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

function PlayPart({ room, view, h }: { room: RoomView; view: QaimaView; h: Helpers }) {
  const iDone = view.done.includes(h.me);
  return (
    <>
      <PromptCard view={view} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick /> : null}
      <EntryBox view={view} h={h} done={iDone} />
      <MyAnswers mine={view.mine} />
      <Others room={room} view={view} />
      <DoneButton view={view} h={h} done={iDone} />
    </>
  );
}

function EntryBox({ view, h, done }: { view: QaimaView; h: Helpers; done: boolean }) {
  const accent = useAccent();
  const width = useContentWidth();
  const [text, setText] = useState('');
  const typed = text.trim();
  const submit = () => {
    if (!typed) return;
    haptic.light();
    h.act('add', { round: view.round, text: typed });
    setText('');
  };
  /** «أضف» on a computer takes the focus: give it back to the box, the next answer is typed at once. */
  const submitByButton = () => {
    submit();
    if (Platform.OS === 'web') setTimeout(() => (globalThis.document?.querySelector('input[aria-label="إجابة"]') as HTMLInputElement | null)?.focus(), 0);
  };
  return (
    <View style={[styles.box, { alignSelf: 'center', width: Math.min(width, dk(560)) }]}>
      <Row gap={8}>
        <Field
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder={done ? 'إجابة أخرى؟ اكتبها هنا…' : 'اكتب إجابة ثم Enter…'}
          placeholderTextColor={C.dim}
          style={[styles.input, { borderColor: typed ? alpha(accent, 0.85) : C.border }]}
          maxLength={50}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          returnKeyType="send"
          submitBehavior="submit"
          blurOnSubmit={false /* the web reads this one: the box keeps the focus after Enter */}
          accessibilityLabel="إجابة"
        />
        <Btn size="md" icon="plus" label="أضف" color={accent} disabled={!typed} onPress={submitByButton} silent />
      </Row>
      <NoteLine note={view.note} />
    </View>
  );
}

/** The verdict of my last answer: shown for a moment, then the line goes quiet. */
function NoteLine({ note }: { note: QaimaNote | null }) {
  const [shown, setShown] = useState<QaimaNote | null>(null);
  const seen = useRef(note?.seq ?? 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = note?.seq ?? 0;
  useEffect(() => {
    // each new view carries a new note object: only a new seq is a new verdict
    if (!note || seq === seen.current) return;
    seen.current = seq;
    setShown(note);
    if (note.kind === 'ok') haptic.tap();
    else haptic.light();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <View style={styles.noteRow}>
      {shown ? (
        <Animated.View key={shown.seq} entering={FadeIn.duration(160)} exiting={FadeOut.duration(260)} style={styles.noteInner}>
          <Icon name={shown.kind === 'ok' ? 'check' : shown.kind === 'dup' ? 'refresh' : 'close'} size={15} color={shown.kind === 'ok' ? C.green : shown.kind === 'dup' ? C.yellow : C.muted} />
          <Txt v="tiny" numberOfLines={1} color={shown.kind === 'ok' ? C.green : shown.kind === 'dup' ? C.yellow : C.muted} style={{ flexShrink: 1 }}>
            {shown.kind === 'ok' ? shown.text : shown.kind === 'dup' ? `${QAIMA_NOTE.dup}: ${shown.text}` : `${QAIMA_NOTE.miss}: «${shown.text}»`}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** My accepted answers, newest first. */
function MyAnswers({ mine }: { mine: string[] }) {
  const settled = useSettled();
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted} center>
        {mine.length ? `إجاباتك: ${num(mine.length)}` : 'تظهر إجاباتك المقبولة هنا'}
      </Txt>
      {mine.length ? (
        <Row gap={6} wrap style={{ justifyContent: 'center' }}>
          {[...mine].reverse().map((name, k) => (
            <Animated.View key={name} entering={settled && k === 0 ? FadeIn.duration(260) : undefined} style={[styles.chip, styles.mineChip]}>
              <Txt v="bold" style={styles.chipText}>
                {name}
              </Txt>
            </Animated.View>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** Everyone's number of answers (never which), a tick on the ones who pressed «انتهيت». */
function Others({ room, view }: { room: RoomView; view: QaimaView }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted} center>
        عدد الإجابات
      </Txt>
      <PlayerStrip
        room={room}
        gains={false}
        active={view.done}
        entries={view.players.map((id) => ({ id, score: view.counts[id] ?? 0, sub: view.done.includes(id) ? '✓ تمّ' : undefined }))}
      />
    </View>
  );
}

function DoneButton({ view, h, done }: { view: QaimaView; h: Helpers; done: boolean }) {
  const waiting = view.players.filter((id) => !view.done.includes(id) && !h.player(id).bot && h.player(id).connected !== false).length;
  if (done)
    return (
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Txt v="tiny" color={C.muted} center>
          {waiting ? `بانتظار ${num(waiting)} قبل نهاية الجولة` : 'نهاية الجولة…'}
        </Txt>
        <Btn size="sm" ghost icon="back" label="تراجع" onPress={() => h.act('done', { round: view.round, undo: true })} />
      </View>
    );
  return <Btn size="md" ghost icon="check" label="انتهيت" onPress={() => h.act('done', { round: view.round })} style={{ alignSelf: 'center' }} />;
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function RevealPart({ room, view, h }: { room: RoomView; view: QaimaView; h: Helpers }) {
  const r = view.reveal!;
  const mine = r.results.find((x) => x.id === h.me);
  return (
    <>
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={16000} /> : null}
      <PromptCard view={view} covered={r.covered} />
      {mine ? (
        <MyVerdict
          tone={mine.found ? 'good' : 'none'}
          text={mine.found ? `${answersText(mine.found)}${mine.unique ? ` · منفردة: ${num(mine.unique)}` : ''} · ${num(`+${mine.points}`)}` : 'لا إجابات في هذه الجولة'}
        />
      ) : null}
      <ResultRows
        h={h}
        lines={r.results.map((x) => ({
          id: x.id,
          detail: x.found ? `${answersText(x.found)}${x.unique ? ` · منفردة: ${num(x.unique)}` : ''}` : 'لا إجابات',
          gain: x.points ? `+${num(x.points)}` : num(0),
          good: x.points > 0,
          total: view.scores[x.id],
        }))}
      />
      <HostNext h={h} last={view.round >= view.rounds} />
      {r.note ? <RevealNote text={r.note} /> : null}
      {r.missed.length ? <Missed names={r.missed} /> : null}
      <FullList room={room} items={r.items} />
    </>
  );
}

function Missed({ names }: { names: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="bold" center>
        أشهر ما فات الجميع
      </Txt>
      <Row gap={6} wrap style={{ justifyContent: 'center' }}>
        {names.map((n) => (
          <View key={n} style={[styles.chip, styles.missedTop]}>
            <Txt v="bold" style={styles.chipText}>
              {n}
            </Txt>
          </View>
        ))}
      </Row>
    </View>
  );
}

/** The whole list: found (with the finders' avatars), unique (highlighted), missed (dimmed). */
function FullList({ room, items }: { room: RoomView; items: QaimaChip[] }) {
  const accent = useAccent();
  const byId = new Map(room.players.map((p) => [p.id, p]));
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold" center>
        القائمة كاملة
      </Txt>
      <Row gap={10} center wrap>
        <Legend color={alpha(accent, 0.3)} border={accent} label="إجابة منفردة" />
        <Legend color={C.surfaceStrong} border={C.borderStrong} label="أكثر من لاعب" />
        <Legend color="transparent" border={C.border} label="فاتت الجميع" dim />
      </Row>
      <Row gap={6} wrap style={{ justifyContent: 'center' }}>
        {items.map((it) => {
          const unique = it.finders.length === 1 && room.players.length > 1;
          const missed = !it.finders.length;
          return (
            <View
              key={it.name}
              style={[
                styles.chip,
                styles.listChip,
                missed && styles.missedChip,
                unique && { backgroundColor: alpha(accent, 0.3), borderColor: accent },
              ]}>
              <Txt v="bold" color={missed ? C.dim : C.text} style={styles.chipText}>
                {it.name}
              </Txt>
              {it.finders.length ? (
                <View style={styles.finders}>
                  {it.finders.slice(0, 3).map((id) => {
                    const p = byId.get(id);
                    return p ? <Avatar key={id} player={p} size={18} /> : null;
                  })}
                  {it.finders.length > 3 ? (
                    <Txt v="tiny" color={C.muted} style={{ fontSize: 11, lineHeight: 16 }}>
                      {`+${it.finders.length - 3}`}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </Row>
    </View>
  );
}

function Legend({ color, border, label, dim }: { color: string; border: string; label: string; dim?: boolean }) {
  return (
    <Row gap={4}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 1.5, borderColor: border, borderStyle: dim ? 'dashed' : 'solid' }} />
      <Txt v="tiny" color={C.muted}>
        {label}
      </Txt>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = QAIMA_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} جولات` }));
const SECOND_OPTIONS = QAIMA_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ثانية` }));

export function QaimaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.qaima;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'qaima', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الوقت في كل جولة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { alignItems: 'center', gap: 2, borderRadius: 20, borderWidth: 2, paddingVertical: 12, paddingHorizontal: 14 },
  box: { gap: 6, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.borderStrong, padding: 12 },
  input: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: C.bg,
    color: C.text,
    fontFamily: F.bold,
    fontSize: 17,
    paddingHorizontal: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  noteRow: { minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  noteInner: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 12 },
  chipText: { fontSize: 14, lineHeight: 22 },
  mineChip: { borderColor: alpha(C.green, 0.6), backgroundColor: alpha(C.green, 0.14) },
  missedTop: { borderColor: alpha(C.yellow, 0.55), backgroundColor: alpha(C.yellow, 0.1) },
  listChip: { borderColor: C.borderStrong, backgroundColor: C.surfaceStrong, paddingHorizontal: 10 },
  finders: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  missedChip: { backgroundColor: 'transparent', borderColor: C.border, borderStyle: 'dashed' },
});
