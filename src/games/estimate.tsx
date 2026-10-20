/**
 * «كم تقدّر؟» — the screen. Asking: the question, the unit, my own number pad (the digits typed show
 * with thousands separators and, for a big number, in words: «37 مليون»); a keyboard on the web types
 * too, Western or Arabic-Indic digits. Reveal: every guess on a number line with the true answer, the
 * «did you know» line, my place and the round's points. Final: podium.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  ESTIMATE_MAX_DIGITS,
  ESTIMATE_ROUNDS,
  ESTIMATE_SECONDS,
  formatNumber,
  numberWords,
  parseGuess,
  relativeError,
  type EstimateResult,
  type EstimateSettings as Settings,
  type EstimateView,
} from '@/shared/games/estimate';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, QuestionPanel, QuestionText, ResultRows, RevealNote, RoundHeader, SentNote, useMyResultFx, winnerTitle } from './islamic-ui';
import { SETTLE_MS, screenAge, useScreenClock } from './touch-motion';

/** «210 متر», «1956 م» */
const withUnitText = (n: number, unit: string, year: boolean) => (unit ? `${num(formatNumber(n, year))} ${unit}` : num(formatNumber(n, year)));
/** «فرق 12%» */
function diffText(r: EstimateResult, answer: number): string {
  if (r.guess === null) return NO_ANSWER;
  if (r.exact) return 'بالضبط!';
  const rel = relativeError(r.guess, answer);
  return rel === null ? `فرق ${num(formatNumber(r.diff ?? 0))}` : `فرق ${num(`${rel < 0.1 ? (rel * 100).toFixed(1) : Math.round(rel * 100)}%`)}`;
}

export function EstimateGame({ room, view }: { room: RoomView; view: EstimateView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  // a sound only for the round's best guess (the family asked for fewer sounds)
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.place === 1 ? true : null);
  if (view.phase === 'final') return <EstimateFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <EstimateRound key={view.round} view={view} h={h} />;
}

function EstimateRound({ view, h }: { view: EstimateView; h: Helpers }) {
  const reveal = view.phase === 'reveal';
  const mine = view.results?.find((r) => r.id === h.me);
  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && view.mine === null} /> : null}
      <QuestionPanel
        id={view.round}
        compact={!reveal && view.mine === null}
        below={
          <Txt v="tiny" center color={C.muted}>
            {view.year ? 'الجواب: سنة' : `الجواب بـ: ${view.unit || 'عدد'}`}
            {view.approx ? ' · تقريباً' : ''}
          </Txt>
        }>
        <QuestionText>{view.question}</QuestionText>
      </QuestionPanel>

      {reveal && view.answer !== null ? (
        <Reveal view={view} h={h} mine={mine} />
      ) : view.mine !== null ? (
        <>
          <SentNote text={`تقديرك: ${withUnitText(view.mine, view.year ? '' : view.unit, view.year)}`} />
          <Txt v="small" center color={C.muted}>
            في انتظار الآخرين…
          </Txt>
          <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
        </>
      ) : (
        <>
          <GuessPad view={view} onSend={(guess) => h.act('answer', { round: view.round, guess })} />
          <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The number pad                                                      */
/* ------------------------------------------------------------------ */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** One key press on the typed text (digits, one decimal point, at most ESTIMATE_MAX_DIGITS digits). */
export function pressKey(text: string, key: string): string {
  if (key === 'del') return text.slice(0, -1);
  if (key === '.') return text.includes('.') ? text : text === '' ? '0.' : `${text}.`;
  if (!/^\d$/.test(key)) return text;
  if (text.replace('.', '').length >= ESTIMATE_MAX_DIGITS) return text;
  // no leading zeros («007» is 7)
  if (text === '0') return key;
  return text + key;
}

/** A physical key (web) as a pad key: Western, Arabic-Indic and Persian digits, «.» «٫» «,», Backspace. */
function keyOf(e: { key: string }): string | null {
  const k = e.key;
  if (/^\d$/.test(k)) return k;
  const a = ARABIC_DIGITS.indexOf(k);
  if (a >= 0) return String(a);
  const p = PERSIAN_DIGITS.indexOf(k);
  if (p >= 0) return String(p);
  if (k === '.' || k === '٫' || k === ',') return '.';
  if (k === 'Backspace') return 'del';
  if (k === 'Enter') return 'enter';
  return null;
}

function GuessPad({ view, onSend }: { view: EstimateView; onSend: (guess: number) => void }) {
  const accent = useAccent();
  const width = useContentWidth();
  const [text, setText] = useState('');
  const value = text === '' || text.endsWith('.') ? parseGuess(text.replace(/\.$/, '')) : parseGuess(text);
  const words = value !== null && !view.year ? numberWords(value) : null;
  const sent = useRef(false);
  const send = () => {
    if (value === null || sent.current) return;
    sent.current = true;
    haptic.medium();
    onSend(value);
  };
  const press = (key: string) => {
    haptic.tap();
    setText((t) => pressKey(t, key));
  };
  // the web: the keyboard types too
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyOf(e);
      if (!k) return;
      e.preventDefault();
      if (k === 'enter') sendRef.current();
      else setText((t) => pressKey(t, k));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // the keys share the width (3 columns, 8 px apart), never taller than 54 px
  const keyW = (Math.min(width, 360) - 16) / 3;
  const keyH = Math.min(54, Math.max(42, keyW * 0.5));
  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <View style={[styles.display, { borderColor: alpha(accent, 0.6), width: Math.min(width, 360) }]}>
        <Txt style={[styles.displayText, !text && { color: C.dim }]} numberOfLines={1} adjustsFontSizeToFit>
          {text ? num(displayText(text, view.year)) : 'اكتب رقماً'}
        </Txt>
        {view.unit && !view.year ? (
          <Txt v="small" color={C.muted} numberOfLines={1}>
            {view.unit}
          </Txt>
        ) : null}
      </View>
      <Txt v="tiny" color={C.muted} style={{ minHeight: 18 }}>
        {words ? num(words) : ' '}
      </Txt>
      <View style={[styles.pad, { width: Math.min(width, 360) }]}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'امسح' : k === '.' ? 'فاصلة' : k}
            style={({ pressed }) => [styles.key, { width: keyW, height: keyH }, pressed && { backgroundColor: C.raised }]}>
            {k === 'del' ? <Icon name="next" size={22} color={C.text} /> : <Txt style={styles.keyText}>{k}</Txt>}
          </Pressable>
        ))}
      </View>
      <Btn size="lg" icon="check" label="أرسل التقدير" disabled={value === null} onPress={send} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

/** The typed text with thousands separators («1,500,000», «29.5»). */
function displayText(text: string, year: boolean): string {
  const [int, dec] = text.split('.');
  const grouped = year ? int : int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function Reveal({ view, h, mine }: { view: EstimateView; h: Helpers; mine: EstimateResult | undefined }) {
  const answer = view.answer as number;
  const results = view.results ?? [];
  const last = view.round >= view.rounds;
  return (
    <>
      <RevealNote kicker="الجواب الصحيح" big text={withUnitText(answer, view.unit, view.year)} sub={view.fact} />
      <NumberLine answer={answer} year={view.year} results={results} h={h} />
      {mine ? <MyVerdict tone={mine.guess === null ? 'none' : mine.place === 1 ? 'good' : 'bad'} text={verdict(mine, answer)} /> : null}
      <ResultRows
        h={h}
        lines={results.map((r) => ({
          id: r.id,
          detail: r.guess === null ? NO_ANSWER : `${num(formatNumber(r.guess, view.year))} · ${diffText(r, answer)}`,
          gain: r.points > 0 ? `+${num(r.points)}` : num(0),
          good: r.points > 0,
          total: view.scores[r.id],
        }))}
      />
      <HostNext h={h} last={last} />
    </>
  );
}

function verdict(r: EstimateResult, answer: number): string {
  if (r.guess === null) return 'انتهى الوقت قبل تقديرك';
  const place = r.place === 1 ? 'الأقرب!' : `المركز ${num(r.place ?? 0)}`;
  return `${r.exact ? 'إصابة بالضبط!' : place} · ${diffText(r, answer)} · ${r.points > 0 ? `+${num(r.points)}` : num(0)}`;
}

const AV = 28;
const LANE = AV + 6;

/**
 * Every guess on a number line (small on the left, big on the right) with the true answer as a gold
 * mark. Far guesses (more than 1.5× the answer away) are pinned to the edge with an arrow. Avatars that
 * would overlap go to the next lane down.
 */
export function NumberLine({ answer, year, results, h }: { answer: number; year: boolean; results: EstimateResult[]; h: Helpers }) {
  const width = useContentWidth();
  const [live] = useState(() => screenAge() > SETTLE_MS);
  const guesses = results.filter((r) => r.guess !== null) as (EstimateResult & { guess: number })[];
  const layout = useMemo(() => {
    const cap = year && answer >= 300 ? 400 : Math.max(Math.abs(answer), 1) * 1.5;
    const inRange = (v: number) => Math.abs(v - answer) <= cap;
    const values = [answer, ...guesses.map((g) => g.guess).filter(inRange)];
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi - lo < 1e-9) {
      const d = Math.max(Math.abs(answer) * 0.1, 1);
      lo -= d;
      hi += d;
    }
    const pad = (hi - lo) * 0.08;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const W = width - 2 * (AV / 2 + 4);
    const x = (v: number) => AV / 2 + 4 + (W * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo);
    // lanes: sort by position, put each avatar in the first lane where it doesn't touch the last one
    const sorted = [...guesses].sort((a, b) => a.guess - b.guess);
    const laneEnds: number[] = [];
    const placed = sorted.map((g) => {
      const gx = x(g.guess);
      let lane = laneEnds.findIndex((end) => gx - end >= AV + 2);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(gx);
      } else laneEnds[lane] = gx;
      const out = g.guess < lo ? 'left' : g.guess > hi ? 'right' : null;
      return { g, gx, lane: Math.min(lane, 3), out };
    });
    return { x, lo, hi, placed, lanes: Math.min(Math.max(1, laneEnds.length), 4) };
  }, [answer, year, guesses, width]);
  const ax = layout.x(answer);
  const height = 30 + 10 + layout.lanes * LANE + 18;
  return (
    <View style={{ height, direction: 'ltr' }} accessibilityLabel="التقديرات على خط الأعداد">
      {/* the answer's label */}
      <View style={[styles.answerTag, { left: Math.min(Math.max(0, ax - 50), width - 100) }]}>
        <Txt style={styles.answerTagText} numberOfLines={1}>
          {num(formatNumber(answer, year))}
        </Txt>
      </View>
      {/* the line */}
      <View style={[styles.track, { top: 36 }]} />
      <View style={[styles.answerMark, { left: ax - 1.5, top: 26, height: 20 + layout.lanes * LANE }]} />
      {layout.placed.map(({ g, gx, lane, out }, k) => (
        <Animated.View
          key={g.id}
          entering={live ? FadeIn.delay(120 + Math.min(k, 8) * 90).duration(360) : undefined}
          style={{ position: 'absolute', left: gx - AV / 2, top: 30, alignItems: 'center' }}>
          <View style={[styles.tick, { height: 10 + lane * LANE, backgroundColor: g.place === 1 ? C.yellow : C.borderStrong }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {out === 'left' ? <Icon name="next" size={12} color={C.muted} /> : null}
            <Avatar player={h.player(g.id)} size={AV} />
            {out === 'right' ? <Icon name="back" size={12} color={C.muted} /> : null}
          </View>
        </Animated.View>
      ))}
      {/* the two ends */}
      <Txt v="tiny" color={C.dim} style={[styles.end, { left: 0 }]}>
        {num(endLabel(layout.lo, layout.hi - layout.lo, year))}
      </Txt>
      <Txt v="tiny" color={C.dim} style={[styles.end, { right: 0, textAlign: 'right' }]}>
        {num(endLabel(layout.hi, layout.hi - layout.lo, year))}
      </Txt>
    </View>
  );
}

/** An end of the line, rounded to what the span needs. */
function endLabel(v: number, span: number, year: boolean): string {
  if (span >= 20) return formatNumber(Math.round(v), year);
  return formatNumber(Math.round(v * 10) / 10, year);
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

function EstimateFinal({ room, view, h }: { room: RoomView; view: EstimateView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  const mostWins = Math.max(0, ...Object.values(view.wins));
  const closest = ids.filter((id) => (view.wins[id] ?? 0) === mostWins && mostWins > 0);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="estimate" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم جميعاً!" />
      <Podium players={room.players} scores={view.scores} />
      {closest.length ? (
        <Animated.View entering={FadeIn.duration(260)}>
          <RevealNote kicker="الأقرب في أكثر الجولات" text={closest.map((id) => h.player(id).name).join(' و')} sub={`${num(mostWins)} ${mostWins <= 10 && mostWins > 2 ? 'جولات' : 'جولة'}`} />
        </Animated.View>
      ) : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = ESTIMATE_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'أسئلة' : 'سؤالاً'}` }));
const SECOND_OPTIONS = ESTIMATE_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ثانية` }));

export function EstimateSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.estimate;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'estimate', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الأسئلة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل سؤال</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
    </View>
  );
}

const styles = StyleSheet.create({
  display: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
  },
  displayText: { fontFamily: F.black, fontSize: 28, lineHeight: 40, color: C.text, flexShrink: 1 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, direction: 'ltr' },
  key: { borderRadius: 14, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: F.black, fontSize: 22, lineHeight: 32, color: C.text },
  track: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: C.borderStrong },
  answerMark: { position: 'absolute', width: 3, borderRadius: 1.5, backgroundColor: C.yellow },
  answerTag: { position: 'absolute', top: 0, width: 100, alignItems: 'center' },
  answerTagText: { fontFamily: F.black, fontSize: 15, lineHeight: 22, color: C.yellow },
  tick: { width: 2, borderRadius: 1, marginBottom: 0 },
  end: { position: 'absolute', bottom: 0 },
});
