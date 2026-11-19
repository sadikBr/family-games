/**
 * «أكمل المثل» — the screen. The beginning of the proverb in big Lalezar type on an ink card, an ellipsis
 * where the ending goes; below it the four endings as cards, or a box to type the ending («اكتب البقية»).
 * The reveal writes the ending into the card in the game's colour, its meaning under a thin rule, then
 * who answered what (typed answers as typed) with the round's points. Final: podium and most right answers.
 * Sizes grow with the desktop stage through dk().
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import {
  MATHAL_MODES,
  MATHAL_ROUNDS,
  MATHAL_SECONDS,
  MATHAL_SOURCES,
  MATHAL_SOURCE_LABEL,
  type MathalResult,
  type MathalSettings as Settings,
  type MathalView,
} from '@/shared/games/mathal';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Field } from '@/ui/field';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, OptionGrid, ResultRows, RoundHeader, SentNote, useMyResultFx, winnerTitle } from './islamic-ui';
import { useScreenClock } from './touch-motion';

/** The card's ink (a warm paper white) and the colour of the ending once revealed. */
const INK = '#FFF6E2';
const right = (r: MathalResult) => r.grade === 'exact' || r.grade === 'close';

export function MathalGame({ room, view }: { room: RoomView; view: MathalView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine ? right(mine) : null);
  if (view.phase === 'final') return <MathalFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} />;
}

function Round({ view, h }: { view: MathalView; h: Helpers }) {
  const reveal = view.phase === 'reveal';
  const typed = view.mode === 'typed';
  const mine = view.results?.find((r) => r.id === h.me);
  const last = view.round >= view.rounds;
  const options = view.options ?? [];
  const columns = options.length && options.every((o) => o.length <= 12) ? 2 : 1;
  const waiting = typed ? view.myText === null : view.myChoice === null;
  return (
    <>
      <RoundHeader label={MATHAL_SOURCE_LABEL[view.source]} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && waiting} /> : null}
      <ProverbCard view={view} />
      {typed ? (
        reveal ? null : <TypedBox view={view} h={h} />
      ) : (
        <OptionGrid options={options} mine={view.myChoice} correct={view.correct} onPick={(choice) => h.act('answer', { round: view.round, choice })} columns={columns} />
      )}
      {reveal ? (
        <View style={{ gap: 10 }}>
          {mine ? <MyVerdict tone={right(mine) ? 'good' : mine.grade === 'none' ? 'none' : 'bad'} text={verdict(mine)} /> : null}
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: detail(view, r),
              gain: r.points ? `+${num(r.points)}` : num(0),
              good: right(r),
              total: view.scores[r.id],
              icon: r.fastest ? <Icon name="bolt" size={15} color={C.yellow} /> : undefined,
            }))}
          />
          <HostNext h={h} last={last} />
        </View>
      ) : (
        <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
      )}
    </>
  );
}

function verdict(r: MathalResult): string {
  if (r.grade === 'exact') return `إجابة صحيحة · ${num(`+${r.points}`)}`;
  if (r.grade === 'close') return `إجابة مقبولة بنقص يسير · ${num(`+${r.points}`)}`;
  return r.grade === 'none' ? 'انتهى الوقت قبل جوابك' : 'إجابة خاطئة';
}

/** What a player answered, for the results list. */
function detail(view: MathalView, r: MathalResult): string {
  if (r.grade === 'none') return NO_ANSWER;
  const said = view.mode === 'typed' ? (r.text ?? '') : (view.options?.[r.choice ?? -1] ?? '');
  return r.grade === 'close' ? `${said} (ناقصة)` : said;
}

/**
 * The proverb: its beginning in big Lalezar type with an ellipsis for the ending; at the reveal the
 * ending joins it in the game's colour and the meaning comes under a thin rule.
 */
function ProverbCard({ view }: { view: MathalView }) {
  const accent = useAccent();
  const width = useContentWidth();
  const shown = view.end !== null;
  const long = view.start.length + (view.end?.length ?? 0) > 46;
  // 29 px on a phone (25 under 340 px, a little less for a long proverb), grown with the desktop stage
  const size = Math.round(dk((width < 340 ? 25 : 29) * (long ? 0.92 : 1)));
  const endColor = C.yellow;
  return (
    <Animated.View key={view.phase} entering={FadeIn.duration(260)} style={[styles.card, { borderColor: alpha(accent, 0.65), backgroundColor: shade(accent, -0.62), padding: Math.min(dk(20), 30) }]}>
      <View style={[styles.corner, styles.cornerTop, { borderColor: alpha(accent, 0.55) }]} />
      <View style={[styles.corner, styles.cornerBottom, { borderColor: alpha(accent, 0.55) }]} />
      <Txt v="tiny" center color={alpha(INK, 0.62)}>
        {shown ? 'المثل كاملاً' : view.mode === 'typed' ? 'اكتب بقية المثل' : 'اختر بقية المثل'}
      </Txt>
      <Text maxFontSizeMultiplier={1.25} style={[styles.proverb, { fontSize: size, lineHeight: Math.round(size * 1.6) }]}>
        {view.start}
        {shown ? (
          <Text style={{ color: endColor }}>{` ${view.end}`}</Text>
        ) : (
          <Text style={{ color: alpha(INK, 0.45) }}>{' ...'}</Text>
        )}
      </Text>
      {view.meaning ? (
        <View style={styles.meaningBox}>
          <View style={[styles.rule, { backgroundColor: alpha(accent, 0.5) }]} />
          <Txt v="tiny" center color={alpha(INK, 0.6)}>
            المعنى
          </Txt>
          <Txt center color={INK} style={{ fontSize: Math.min(dk(16), 21), lineHeight: Math.round(Math.min(dk(16), 21) * 1.6) }}>
            {view.meaning}
          </Txt>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** «اكتب البقية»: one answer per round; small slips are fine. */
function TypedBox({ view, h }: { view: MathalView; h: Helpers }) {
  const accent = useAccent();
  const [text, setText] = useState('');
  if (view.myText !== null) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.sent, { borderColor: alpha(C.green, 0.5) }]}>
        <SentNote text="وصل جوابك" />
        <Txt v="bold" center numberOfLines={2}>
          «{view.myText}»
        </Txt>
        <Txt v="tiny" center color={C.dim}>
          النتيجة عند كشف المثل
        </Txt>
      </Animated.View>
    );
  }
  const t = text.trim();
  const send = () => {
    if (t) h.act('answer', { round: view.round, text: t });
  };
  return (
    <View style={{ gap: 6 }}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Field
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="اكتب بقية المثل…"
          placeholderTextColor={C.dim}
          style={[styles.input, { borderColor: t ? alpha(accent, 0.9) : C.borderStrong, fontSize: Math.min(dk(17), 22) }]}
          maxLength={80}
          returnKeyType="send"
          submitBehavior="submit"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="بقية المثل"
        />
        <Btn size="md" icon="check" label="أرسل" color={C.green} disabled={!t} onPress={send} />
      </Row>
      <Txt v="tiny" center color={C.dim}>
        التشكيل والهمزات والأخطاء الصغيرة مقبولة
      </Txt>
    </View>
  );
}

function MathalFinal({ room, view, h }: { room: RoomView; view: MathalView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  const most = Math.max(0, ...ids.map((id) => view.rights[id] ?? 0));
  const top = ids.filter((id) => (view.rights[id] ?? 0) === most && most > 0);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="mathal" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم جميعاً!" />
      <Podium players={room.players} scores={view.scores} />
      {top.length ? (
        <View style={styles.most}>
          <Txt v="small" color={C.muted}>
            أكثر الأمثال إكمالاً:
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

const ROUND_OPTIONS = MATHAL_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'جولات' : 'جولة'}` }));
const SECOND_OPTIONS = MATHAL_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ثانية` }));

export function MathalSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.mathal;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'mathal', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">المصدر</Txt>
      <ChipPicker editable={editable} value={s.source} onChange={(source) => change({ source })} options={MATHAL_SOURCES} />
      <Txt v="bold">طريقة اللعب</Txt>
      <ChipPicker
        editable={editable}
        value={s.mode}
        // typing takes longer: the time follows the mode (it can still be changed below)
        onChange={(mode) => change({ mode, seconds: mode === 'typed' ? 25 : 15 })}
        options={MATHAL_MODES}
      />
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت الجواب</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
      {s.source !== 'fusha' ? (
        <Txt v="tiny" color={C.dim}>
          الأمثال المغربية مكتوبة بالدارجة كما تُقال، ومعناها بالفصحى.
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1.5, gap: 6, overflow: 'hidden' },
  // two thin corner brackets framing the proverb like a quotation
  corner: { position: 'absolute', width: 22, height: 22 },
  cornerTop: { top: 10, right: 10, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 8 },
  cornerBottom: { bottom: 10, left: 10, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 8 },
  proverb: { fontFamily: F.display, color: INK, textAlign: 'center', writingDirection: 'rtl', paddingHorizontal: 6 },
  meaningBox: { gap: 2, alignItems: 'center', paddingTop: 2 },
  rule: { height: 1.5, width: 56, borderRadius: 1, marginBottom: 6 },
  input: { flex: 1, minWidth: 0, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontFamily: F.bold, borderWidth: 2, textAlign: 'right', writingDirection: 'rtl' },
  sent: { gap: 4, borderRadius: 16, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: alpha(C.green, 0.08) },
  most: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1.5, borderColor: C.borderStrong, paddingVertical: 10, paddingHorizontal: 12, flexWrap: 'wrap' },
});
