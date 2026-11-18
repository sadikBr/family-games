/**
 * «البلد الغامض» — the screen. Above, the clues' progress (six steps with their points, the current one
 * filling until the next clue). Then the newest clue, highlighted, with the guess box under it: type a
 * name (suggestions from the region's countries as you type) or open the full list; a wrong guess shows
 * «تخمين خاطئ» and locks the box for 3 s. Then the earlier clues, newest first, softly dimmed; and the
 * players with a tick on the ones who found it (never with what). The reveal: the country with its
 * flag (the flag art of «الأعلام والعواصم») and capital, the clue each one found it at, the scores, and
 * the six clues to read again. The final podium.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import {
  BALAD_CLUES,
  BALAD_INTERVALS,
  BALAD_POINTS,
  BALAD_REGIONS,
  BALAD_ROUNDS,
  baladPool,
  type BaladSettings as Settings,
  type BaladView,
} from '@/shared/games/balad';
import { BALAD_BY_CODE, byName, matchCountry, suggestCountries } from '@/shared/games/balad-countries';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Field } from '@/ui/field';
import { TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { FlagImg } from './flags';
import { helpers, type Helpers } from './helpers';
import { HostNext, MyVerdict, QuizFinal, ResultRows, RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';

const REGION_LABEL = Object.fromEntries(BALAD_REGIONS.map((r) => [r.key, r.label])) as Record<string, string>;
const ORDINAL = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];

export function BaladGame({ room, view }: { room: RoomView; view: BaladView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="balad" h={h} sub="أحسنتم جميعاً!" />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} room={room} view={view} h={h} />;
}

function Round({ room, view, h }: { room: RoomView; view: BaladView; h: Helpers }) {
  const reveal = view.phase === 'reveal';
  const mine = view.results?.find((r) => r.id === h.me);
  const last = view.round >= view.rounds;
  useRoundSounds(view);
  return (
    <>
      <RoundHeader label={REGION_LABEL[view.region] ?? 'البلد الغامض'} round={view.round} rounds={view.rounds} />
      {reveal ? (
        <>
          {view.endsAt ? <TimerBar endsAt={view.endsAt} total={9000} /> : null}
          {view.answer ? <AnswerCard answer={view.answer} /> : null}
          {mine ? (
            <MyVerdict
              tone={mine.clue !== null ? 'good' : 'none'}
              text={mine.clue !== null ? `إجابة صحيحة · ${num(`+${mine.points}`)}` : 'لا إجابة صحيحة في هذه الجولة'}
            />
          ) : null}
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: r.clue !== null ? `عند الدليل ${ORDINAL[r.clue - 1]}` : r.wrong ? `${wrongCount(r.wrong)} · بلا إجابة صحيحة` : 'بلا إجابة صحيحة',
              gain: r.clue !== null ? `+${num(r.points)}` : num(0),
              good: r.clue !== null,
              total: view.scores[r.id],
            }))}
          />
          <HostNext h={h} last={last} />
          <AllClues clues={view.clues} />
        </>
      ) : (
        <>
          <ClueProgress view={view} />
          <NewestClue clues={view.clues} />
          {view.mine ? <FoundCard mine={view.mine} /> : <GuessBox view={view} h={h} />}
          <OlderClues clues={view.clues} />
          <Found room={room} view={view} />
        </>
      )}
    </>
  );
}

/** «محاولة خاطئة واحدة»، «محاولتان خاطئتان»، «3 محاولات خاطئة» */
function wrongCount(n: number) {
  if (n === 1) return 'محاولة خاطئة واحدة';
  if (n === 2) return 'محاولتان خاطئتان';
  return `${num(n)} محاولات خاطئة`;
}

/** My sounds: a soft tap for each new clue, «correct» when I find it, a buzz for a wrong guess. */
function useRoundSounds(view: BaladView) {
  const clues = useRef(view.clues.length);
  const wrong = useRef(view.wrong.length);
  const found = useRef(!!view.mine);
  useEffect(() => {
    if (view.phase === 'clues' && view.clues.length > clues.current && !view.mine) haptic.tap();
    clues.current = view.clues.length;
  }, [view.clues.length, view.phase, view.mine]);
  useEffect(() => {
    if (view.wrong.length > wrong.current) {
      play('buzz');
      haptic.error();
    }
    wrong.current = view.wrong.length;
  }, [view.wrong.length]);
  useEffect(() => {
    if (view.mine && !found.current) {
      play('correct');
      haptic.success();
    }
    found.current = !!view.mine;
  }, [view.mine]);
}

/* ------------------------------------------------------------------ */
/* Clues                                                               */
/* ------------------------------------------------------------------ */

/** Six steps with their points; the current one fills until the next clue. */
function ClueProgress({ view }: { view: BaladView }) {
  const accent = useAccent();
  const left = useCountdown(view.nextAt, 100);
  const n = view.clues.length;
  const ratio = view.interval > 0 ? Math.min(1, Math.max(0, 1 - left / view.interval)) : 1;
  const secs = Math.ceil(left / 1000);
  const lastClue = n >= BALAD_CLUES;
  return (
    <View style={{ gap: 4 }}>
      <Row gap={4}>
        {BALAD_POINTS.map((p, i) => {
          const past = i < n - 1;
          const now = i === n - 1;
          return (
            <View key={i} style={{ flex: 1, gap: 2 }}>
              <View style={[styles.step, { backgroundColor: past ? alpha(accent, 0.55) : C.surfaceStrong }]}>
                {now ? <View style={[styles.stepFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: accent }]} /> : null}
              </View>
              <Txt v="tiny" center color={now ? C.text : past ? C.dim : C.muted} style={{ fontSize: 11, lineHeight: 16 }}>
                {num(p)}
              </Txt>
            </View>
          );
        })}
      </Row>
      <Txt v="tiny" center color={C.muted}>
        {view.mine
          ? `الدليل ${ORDINAL[n - 1]} من ${num(BALAD_CLUES)}`
          : lastClue
            ? `الدليل الأخير · ينتهي الوقت بعد ${num(secs)} ث`
            : `الدليل ${ORDINAL[n - 1]} · التخمين الآن بـ${num(BALAD_POINTS[n - 1])} نقطة · التالي بعد ${num(secs)} ث`}
      </Txt>
    </View>
  );
}

/** The newest clue, highlighted: it fades in softly with a small lift. */
function NewestClue({ clues }: { clues: string[] }) {
  const accent = useAccent();
  const settled = useSettled();
  const i = clues.length - 1;
  if (i < 0) return null;
  return (
    <Animated.View
      key={i}
      entering={settled ? FadeInDown.duration(420).easing(Easing.out(Easing.cubic)) : undefined}
      style={[styles.newest, { borderColor: alpha(accent, 0.75), backgroundColor: alpha(accent, 0.14) }]}>
      <View style={[styles.clueNo, { backgroundColor: accent }]}>
        <Txt style={styles.clueNoText}>{num(i + 1)}</Txt>
      </View>
      <Txt v="bold" style={{ flex: 1, fontSize: 17, lineHeight: 28 }}>
        {clues[i]}
      </Txt>
    </Animated.View>
  );
}

/** The earlier clues, newest first, a little dimmer the older they are. */
function OlderClues({ clues }: { clues: string[] }) {
  const older = clues.slice(0, -1).map((t, i) => ({ t, i })).reverse();
  if (!older.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {older.map(({ t, i }, k) => (
        <ClueLine key={i} n={i + 1} text={t} fade={Math.max(0.55, 0.92 - k * 0.09)} />
      ))}
    </View>
  );
}

function ClueLine({ n, text, fade = 1 }: { n: number; text: string; fade?: number }) {
  const settled = useSettled();
  const reduced = useReducedMotion();
  const o = useSharedValue(fade);
  useEffect(() => {
    o.set(reduced ? fade : withTiming(fade, { duration: 600 }));
  }, [fade, o, reduced]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View entering={settled ? FadeIn.duration(300) : undefined} style={[styles.clueLine, anim]}>
      <View style={styles.clueNoSmall}>
        <Txt style={[styles.clueNoText, { fontSize: 12, lineHeight: 18 }]}>{num(n)}</Txt>
      </View>
      <Txt v="small" style={{ flex: 1 }}>
        {text}
      </Txt>
    </Animated.View>
  );
}

function AllClues({ clues }: { clues: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted} center>
        الدلائل الستة
      </Txt>
      {clues.map((t, i) => (
        <ClueLine key={i} n={i + 1} text={t} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Guessing                                                            */
/* ------------------------------------------------------------------ */

function GuessBox({ view, h }: { view: BaladView; h: Helpers }) {
  const accent = useAccent();
  const width = useContentWidth();
  const [text, setText] = useState('');
  const [list, setList] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lockLeft = useCountdown(view.lockedUntil, 100);
  const locked = lockLeft > 0;
  const pool = useMemo(() => baladPool(view.region).map((c) => c.code), [view.region]);
  const tried = useMemo(() => new Set(view.wrong), [view.wrong]);
  const fresh = (codes: string[]) => codes.filter((c) => !tried.has(BALAD_BY_CODE[c]?.name ?? ''));
  const typed = text.trim();
  const sugg = typed ? fresh(suggestCountries(typed, pool, 6)) : [];
  const all = useMemo(() => byName(pool), [pool]);
  const shownAll = typed ? all.filter((c) => sugg.includes(c) || suggestCountries(typed, [c], 1).length) : all;
  const lastWrong = view.wrong[view.wrong.length - 1];

  const send = (payload: { code?: string; text?: string }) => {
    if (locked) return;
    haptic.medium();
    setNote(null);
    setText('');
    setList(false);
    h.act('guess', { round: view.round, ...payload });
  };
  const submit = () => {
    if (!typed || locked) return;
    const code = matchCountry(typed) ?? (sugg.length === 1 ? sugg[0] : null);
    if (!code) {
      setNote('اسم غير معروف: اختر بلداً من الاقتراحات');
      return;
    }
    if (tried.has(BALAD_BY_CODE[code]?.name ?? '')) {
      setNote(`«${BALAD_BY_CODE[code]?.name}» جُرِّب من قبل`);
      return;
    }
    send({ code });
  };
  const inputW = Math.min(width, dk(560));

  return (
    <View style={[styles.box, { alignSelf: 'center', width: inputW }]}>
      {locked && lastWrong ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.wrongNote}>
          <Icon name="close" size={16} color={C.red} />
          <Txt v="bold" style={{ flexShrink: 1 }}>
            تخمين خاطئ: {lastWrong}
          </Txt>
          <Txt v="tiny" color={C.muted}>
            · {num(Math.ceil(lockLeft / 1000))} ث
          </Txt>
        </Animated.View>
      ) : null}
      <Row gap={8}>
        <Field
          value={text}
          onChangeText={(t) => {
            setText(t);
            setNote(null);
          }}
          onSubmitEditing={submit}
          editable={!locked}
          placeholder={locked ? 'انتظر قليلاً…' : 'اكتب اسم البلد…'}
          placeholderTextColor={C.dim}
          style={[styles.input, { borderColor: typed ? alpha(accent, 0.8) : C.border, opacity: locked ? 0.5 : 1 }]}
          maxLength={40}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="send"
          submitBehavior="submit"
          accessibilityLabel="اسم البلد"
        />
        <Btn size="md" icon="check" label="خمّن" color={accent} disabled={!typed || locked} onPress={submit} />
      </Row>
      {note ? (
        <Txt v="tiny" color={C.yellow} center>
          {note}
        </Txt>
      ) : null}
      {sugg.length ? (
        <Row gap={6} wrap style={{ justifyContent: 'center' }}>
          {sugg.map((c) => (
            <CountryChip key={c} code={c} disabled={locked} strong onPress={() => send({ code: c })} />
          ))}
        </Row>
      ) : null}
      <Pressable onPress={() => setList((v) => !v)} accessibilityRole="button" style={styles.listToggle} hitSlop={6}>
        <Icon name={list ? 'close' : 'search'} size={15} color={C.muted} />
        <Txt v="tiny" color={C.muted}>
          {list ? 'إخفاء القائمة' : `اختر من القائمة (${num(all.length)} بلداً)`}
        </Txt>
      </Pressable>
      {list ? (
        <Row gap={6} wrap style={{ justifyContent: 'center' }}>
          {shownAll.map((c) => (
            <CountryChip key={c} code={c} disabled={locked || tried.has(BALAD_BY_CODE[c]?.name ?? '')} onPress={() => send({ code: c })} />
          ))}
        </Row>
      ) : null}
      {view.wrong.length ? (
        <Row gap={6} wrap style={{ justifyContent: 'center' }}>
          <Txt v="tiny" color={C.dim}>
            تخمينات خاطئة:
          </Txt>
          {view.wrong.map((w) => (
            <Txt key={w} v="tiny" color={C.dim} style={{ textDecorationLine: 'line-through' }}>
              {w}
            </Txt>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

function CountryChip({ code, onPress, disabled, strong }: { code: string; onPress: () => void; disabled?: boolean; strong?: boolean }) {
  const accent = useAccent();
  const name = BALAD_BY_CODE[code]?.name ?? code;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => [
        styles.chip,
        strong && { borderColor: alpha(accent, 0.7), backgroundColor: alpha(accent, 0.16) },
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
      ]}>
      <Txt v="bold" style={{ fontSize: 14, lineHeight: 22 }}>
        {name}
      </Txt>
    </Pressable>
  );
}

/** My right guess, while the others go on. */
function FoundCard({ mine }: { mine: NonNullable<BaladView['mine']> }) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.box, styles.found]}>
      <Row gap={8} center>
        <Icon name="check" size={20} color={C.green} />
        <Txt v="h3" color={C.green}>
          إجابة صحيحة: {mine.name}
        </Txt>
      </Row>
      <Txt v="small" center color={C.muted}>
        عند الدليل {ORDINAL[mine.clue - 1]} · {num(`+${mine.points}`)} نقطة · بانتظار الآخرين
      </Txt>
    </Animated.View>
  );
}

/** Everyone, with a tick on the ones who found it and at which clue (not with what). */
function Found({ room, view }: { room: RoomView; view: BaladView }) {
  const at = new Map(view.found.map((f) => [f.id, f.clue]));
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted} center>
        الإجابات الصحيحة: {num(view.found.length)} من {num(view.players.length)}
      </Txt>
      <PlayerStrip
        room={room}
        active={view.found.map((f) => f.id)}
        gains={false}
        entries={view.players.map((id) => ({ id, score: view.scores[id] ?? 0, sub: at.has(id) ? `✓ عند الدليل ${num(at.get(id) ?? 0)}` : '…' }))}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function AnswerCard({ answer }: { answer: NonNullable<BaladView['answer']> }) {
  const accent = useAccent();
  const width = useContentWidth();
  const flagW = Math.min(width * 0.42, dk(170));
  return (
    <Animated.View entering={FadeIn.duration(320)} style={[styles.answer, { backgroundColor: alpha(accent, 0.14), borderColor: alpha(accent, 0.5) }]}>
      <Txt v="tiny" color={C.muted} center>
        البلد الغامض
      </Txt>
      {answer.flag ? <FlagImg code={answer.flag} width={flagW} label={`علم ${answer.name}`} /> : null}
      <Txt v="title" center>
        {answer.name}
      </Txt>
      {answer.capital ? (
        <Txt v="small" color={C.muted} center>
          العاصمة: {answer.capital}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = BALAD_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} جولات` }));
const INTERVAL_OPTIONS = BALAD_INTERVALS.map((s) => ({ key: String(s), label: `${num(s)} ثوانٍ` }));

export function BaladSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.balad;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'balad', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">الوقت بين دليلين</Txt>
      <ChipPicker<string> editable={editable} value={String(s.interval)} onChange={(v) => change({ interval: Number(v) })} options={INTERVAL_OPTIONS} />
      <Txt v="bold">المنطقة</Txt>
      <ChipPicker editable={editable} value={s.region} onChange={(region) => change({ region })} options={BALAD_REGIONS} />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { height: 8, borderRadius: 4, overflow: 'hidden' },
  stepFill: { position: 'absolute', top: 0, bottom: 0, start: 0 },
  newest: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 18, borderWidth: 2, paddingVertical: 12, paddingHorizontal: 12 },
  clueNo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  clueNoSmall: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong, marginTop: 1 },
  clueNoText: { fontFamily: F.black, fontSize: 14, lineHeight: 20, color: '#FFFFFF' },
  clueLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 10 },
  box: { gap: 8, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.borderStrong, padding: 12 },
  found: { borderColor: alpha(C.green, 0.6), backgroundColor: alpha(C.green, 0.12), alignItems: 'center' },
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
  wrongNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: alpha(C.red, 0.16), borderWidth: 1, borderColor: alpha(C.red, 0.55) },
  chip: { minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surfaceStrong, paddingHorizontal: 14 },
  listToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36 },
  answer: { alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 12 },
});
