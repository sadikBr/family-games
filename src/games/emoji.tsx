/**
 * «خمّن من الإيموجي» — the screen. The category chip and the timer; the emojis very big in a card (the
 * system's emoji font, first emoji on the right like the words of a sentence, arrows turned to match);
 * the hint line under them (a countdown until it comes out halfway); then my answer: a text box, or four
 * options (the two the hint took away fade and can't be tapped); the others' ticks without what they
 * answered; the reveal: the answer with its one-line explanation, my verdict and everyone's answers; the
 * final podium.
 */
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import {
  EMOJI_CATEGORY_PICKS,
  EMOJI_MODES,
  EMOJI_ROUNDS,
  EMOJI_SECONDS,
  emojiCategoryIcon,
  emojiCategoryLabel,
  type EmojiHint,
  type EmojiSettings as Settings,
  type EmojiView,
} from '@/shared/games/emoji';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
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
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, OPTION_LETTERS, ResultRows, RoundHeader, SentNote, useMyResultFx, winnerTitle } from './islamic-ui';
import { useScreenClock } from './touch-motion';

/** The emojis in colour on every system (web: the platform's emoji font first). */
const EMOJI_FONT = Platform.select({ web: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif', default: undefined });

export function EmojiGame({ room, view }: { room: RoomView; view: EmojiView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <EmojiFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} />;
}

function Round({ view, h }: { view: EmojiView; h: Helpers }) {
  const reveal = view.phase === 'reveal';
  const mine = view.results?.find((r) => r.id === h.me);
  const last = view.round >= view.rounds;
  const answered = view.myText !== null || view.myChoice !== null;
  return (
    <>
      <RoundHeader label={`${emojiCategoryIcon(view.category)} ${emojiCategoryLabel(view.category)}`} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && !answered} /> : null}
      <EmojiCard emojis={view.emojis} round={view.round}>
        {reveal ? null : <HintLine hint={view.hint} hintAt={view.hintAt} />}
      </EmojiCard>
      {view.mode === 'options' && view.options ? (
        <Options view={view} onPick={(choice) => h.act('answer', { round: view.round, choice })} />
      ) : !reveal ? (
        <TypedAnswer view={view} h={h} />
      ) : null}
      {reveal ? (
        <View style={{ gap: 10 }}>
          {mine ? <Verdict result={mine} /> : null}
          <AnswerCard answer={view.answer} explanation={view.explanation} />
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: detailOf(view, r) + (r.correct && r.late ? ' · بعد التلميح' : ''),
              gain: r.correct ? `+${num(r.points)}` : num(0),
              good: r.correct,
              total: view.scores[r.id],
            }))}
          />
          <HostNext h={h} last={last} />
        </View>
      ) : (
        <AnsweredRow ids={view.answered} total={view.players.length} h={h} label="أجاب:" />
      )}
    </>
  );
}

function detailOf(view: EmojiView, r: NonNullable<EmojiView['results']>[number]): string {
  if (view.mode === 'typed') return r.text ?? NO_ANSWER;
  return r.choice === null ? NO_ANSWER : (view.options?.[r.choice] ?? NO_ANSWER);
}

function Verdict({ result }: { result: NonNullable<EmojiView['results']>[number] }) {
  const silent = result.text === null && result.choice === null;
  if (result.correct) return <MyVerdict tone="good" text={`${result.late ? 'إجابة صحيحة بعد التلميح' : 'إجابة صحيحة'} · ${num(`+${result.points}`)}`} />;
  return <MyVerdict tone={silent ? 'none' : 'bad'} text={silent ? 'انتهى الوقت قبل جوابك' : 'إجابة خاطئة'} />;
}

/* ------------------------------------------------------------------ */
/* The emoji card                                                      */
/* ------------------------------------------------------------------ */

/** The row's pieces in reading order: emojis one by one, a run of keycap digits kept together («2022»). */
export function emojiTokens(emojis: string): string[] {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(emojis)].map((g) => g.segment) : splitEmojis(emojis);
  const out: string[] = [];
  for (const g of seg) {
    const keycap = g.includes('⃣');
    if (keycap && out.length && out[out.length - 1].includes('⃣')) out[out.length - 1] += g;
    else out.push(g);
  }
  return out.map(rtlArrows);
}

/** The row and the explanations are read right to left, like the words around them: ➡ and ⬅ turn to keep their meaning. */
export const rtlArrows = (s: string) => s.replace(/[➡⬅]/g, (a) => (a === '➡' ? '⬅' : '➡'));

/** A small fallback grapheme split (emoji + selectors, joiners and keycaps). */
function splitEmojis(s: string): string[] {
  const out: string[] = [];
  let joinNext = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    const glue = cp === 0xfe0f || cp === 0x20e3 || cp === 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff);
    if (out.length && (glue || joinNext)) out[out.length - 1] += ch;
    else out.push(ch);
    joinNext = cp === 0x200d;
  }
  return out;
}

function EmojiCard({ emojis, round, children }: { emojis: string; round: number; children?: ReactNode }) {
  const accent = useAccent();
  const width = useContentWidth();
  const tokens = emojiTokens(emojis);
  const cardW = Math.min(width, dk(560));
  // as big as the row allows: one line for up to four emojis, two even lines past that
  const units = tokens.reduce((n, t) => n + (t.includes('⃣') ? 0.85 * (t.match(/⃣/g)?.length ?? 1) : 1), 0);
  const perLine = units > 4 ? Math.ceil(units / 2) : units;
  // …and never wider than the card for the longest piece (a run of keycaps such as «2022» stays on one line)
  const widest = Math.max(1, ...tokens.map((t) => t.match(/⃣/g)?.length ?? 1));
  const size = Math.round(Math.max(30, Math.min(dk(72), (cardW - 40) / (Math.max(perLine, widest) * 1.42))));
  return (
    <Animated.View key={round} entering={FadeIn.duration(260)} style={[styles.card, { borderColor: alpha(accent, 0.6), backgroundColor: alpha(accent, 0.08) }]}>
      <View style={styles.emojiRow} accessible accessibilityLabel="الإيموجي">
        {tokens.map((t, i) => (
          <Text key={i} allowFontScaling={false} style={[styles.emoji, { fontSize: size, lineHeight: Math.round(size * 1.28), fontFamily: EMOJI_FONT }]}>
            {t}
          </Text>
        ))}
      </View>
      {children}
    </Animated.View>
  );
}

/** «التلميح بعد 12 ثانية», then the hint itself (it fades in). */
function HintLine({ hint, hintAt }: { hint: EmojiHint | null; hintAt: number | null }) {
  const left = useCountdown(hint ? null : hintAt, 250);
  if (!hint) {
    const secs = Math.ceil(left / 1000);
    return (
      <Row gap={6} center style={styles.hintWait}>
        <Icon name="clock" size={14} color={C.dim} />
        <Txt v="tiny" color={C.dim}>
          {secs > 0 ? `التلميح بعد ${secondsText(secs)}` : 'التلميح الآن'}
        </Txt>
      </Row>
    );
  }
  return (
    <Animated.View entering={FadeIn.duration(320)} style={styles.hint}>
      <Row gap={6} center wrap>
        <Icon name="sparkle" size={15} color={C.yellow} />
        <Txt v="bold" color={C.yellow} style={{ fontSize: 14, lineHeight: 21 }}>
          تلميح:
        </Txt>
        <Txt v="bold" style={{ fontSize: 14, lineHeight: 21, flexShrink: 1 }} center>
          {hint.text}
        </Txt>
      </Row>
      {hint.words !== null && hint.letter ? (
        <Txt v="tiny" color={C.muted} center>
          {wordsText(hint.words)} · أول حرف: «{hint.letter}»{hint.al ? ' بعد «ال»' : ''}
        </Txt>
      ) : hint.removed.length ? (
        <Txt v="tiny" color={C.muted} center>
          حُذف اختياران خاطئان
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/** «ثانية»، «ثانيتين»، «5 ثوانٍ»، «12 ثانية» (after «بعد») */
function secondsText(n: number): string {
  if (n === 1) return 'ثانية';
  if (n === 2) return 'ثانيتين';
  return n <= 10 ? `${num(n)} ثوانٍ` : `${num(n)} ثانية`;
}

/** «كلمة واحدة»، «كلمتان»، «3 كلمات»، «11 كلمة» */
function wordsText(n: number): string {
  if (n === 1) return 'كلمة واحدة';
  if (n === 2) return 'كلمتان';
  return n <= 10 ? `${num(n)} كلمات` : `${num(n)} كلمة`;
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

function TypedAnswer({ view, h }: { view: EmojiView; h: Helpers }) {
  const [text, setText] = useState('');
  if (view.myText !== null) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={{ gap: 2, alignItems: 'center' }}>
        <SentNote text="تم إرسال جوابك" />
        <Txt v="small" color={C.muted} center numberOfLines={2}>
          «{view.myText}»
        </Txt>
      </Animated.View>
    );
  }
  const send = () => {
    const t = text.trim();
    if (!t) return;
    haptic.medium();
    h.act('answer', { round: view.round, text: t });
  };
  return (
    <View style={{ gap: 6 }}>
      <Row gap={8}>
        <Field
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="اكتب جوابك هنا"
          placeholderTextColor={C.dim}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={60}
          returnKeyType="send"
          style={styles.input}
          accessibilityLabel="جوابك"
        />
        <Btn size="md" icon="check" label="أرسل" disabled={!text.trim()} onPress={send} />
      </Row>
      <Txt v="tiny" center color={C.dim}>
        محاولة واحدة · الأخطاء الإملائية الصغيرة مقبولة
      </Txt>
    </View>
  );
}

/** The four options: mine in yellow; the two the hint removed faded; at the reveal the right one green. */
function Options({ view, onPick }: { view: EmojiView; onPick: (i: number) => void }) {
  const accent = useAccent();
  const options = view.options ?? [];
  const revealed = view.correct !== null;
  const removed = view.hint?.removed ?? [];
  const one = options.some((o) => o.length > 16);
  const locked = revealed || view.myChoice !== null;
  return (
    <View style={[styles.grid, one && { flexDirection: 'column' }]}>
      {options.map((o, i) => {
        const isRight = revealed && view.correct === i;
        const isMine = view.myChoice === i;
        const isWrong = revealed && isMine && !isRight;
        const gone = removed.includes(i) && !isMine && !isRight;
        const tone = isRight ? C.green : isWrong ? C.red : isMine ? C.yellow : null;
        const dim = gone || (revealed ? !isRight && !isWrong : view.myChoice !== null && !isMine);
        return (
          <Animated.View key={i} style={[one ? styles.full : styles.half, { opacity: dim ? (gone ? 0.3 : 0.45) : 1 }]}>
            <Pressable
              disabled={locked || gone}
              onPress={() => {
                haptic.medium();
                onPick(i);
              }}
              accessibilityRole="button"
              accessibilityLabel={o}
              accessibilityState={{ selected: isMine, disabled: locked || gone }}
              style={({ pressed }) => [
                styles.option,
                { borderColor: tone ?? C.borderStrong, backgroundColor: tone ? alpha(tone, 0.18) : C.surface },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}>
              <View style={[styles.letter, { backgroundColor: tone ?? alpha(accent, 0.32) }]}>
                {isRight || isWrong ? (
                  <Icon name={isRight ? 'check' : 'close'} size={13} color="#FFFFFF" />
                ) : (
                  <Txt style={[styles.letterText, { color: isMine ? C.ink : C.text }]}>{OPTION_LETTERS[i]}</Txt>
                )}
              </View>
              <Txt style={[styles.optText, gone && { textDecorationLine: 'line-through', color: C.dim }]}>{o}</Txt>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The reveal: the answer, big, and what the emojis meant. */
function AnswerCard({ answer, explanation }: { answer: string | null; explanation: string | null }) {
  const accent = useAccent();
  if (!answer) return null;
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.answer, { backgroundColor: alpha(accent, 0.14), borderColor: alpha(accent, 0.5) }]}>
      <Txt v="tiny" color={C.muted} center>
        الجواب
      </Txt>
      <Txt v="title" center style={{ fontSize: 23, lineHeight: 36 }}>
        {answer}
      </Txt>
      {explanation ? (
        <Text style={[styles.explain, { fontFamily: F.body }]}>{rtlArrows(explanation)}</Text>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

function EmojiFinal({ room, view, h }: { room: RoomView; view: EmojiView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me);
  const most = Math.max(0, ...ids.map((id) => view.rights[id] ?? 0));
  const top = ids.filter((id) => (view.rights[id] ?? 0) === most && most > 0);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="emoji" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="أحسنتم فكّ الرموز!" />
      <Podium players={room.players} scores={view.scores} />
      {top.length ? (
        <View style={[styles.most, { borderColor: C.borderStrong }]}>
          <Txt v="small" color={C.muted}>
            أكثر الإجابات الصحيحة:
          </Txt>
          <Txt v="bold" center>
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

const ROUND_OPTIONS = EMOJI_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'جولات' : 'جولة'}` }));
const SECOND_OPTIONS = EMOJI_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ثانية` }));

export function EmojiSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.emoji;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'emoji', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الفئة</Txt>
      <ChipPicker editable={editable} value={s.category} onChange={(category) => change({ category })} options={EMOJI_CATEGORY_PICKS} />
      <Txt v="bold">طريقة الإجابة</Txt>
      <ChipPicker editable={editable} value={s.mode} onChange={(mode) => change({ mode })} options={EMOJI_MODES} />
      <Txt v="tiny" color={C.dim}>
        {s.mode === 'typed' ? 'الكتابة أصعب: 5 نقاط إضافية لكل جواب صحيح.' : 'أربعة اختيارات، ويحذف التلميح اثنين منها.'}
      </Txt>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل جولة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 2, paddingVertical: 14, paddingHorizontal: 12, gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 132 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 4 },
  emoji: { textAlign: 'center', color: C.text, includeFontPadding: false },
  hintWait: { paddingTop: 2 },
  hint: { alignSelf: 'stretch', gap: 2, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 2 },
  input: { flex: 1, minWidth: 0, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontFamily: F.bold, fontSize: 17, borderWidth: 2, borderColor: C.yellow, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexBasis: '40%', flexGrow: 1, minWidth: 0 },
  full: { width: '100%' },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 2, paddingVertical: 8, paddingHorizontal: 10 },
  letter: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: F.black, fontSize: 12, lineHeight: 18 },
  optText: { flex: 1, fontFamily: F.bold, fontSize: 15, lineHeight: 22, textAlign: 'center', color: C.text },
  answer: { borderRadius: 18, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  explain: { fontSize: 14, lineHeight: 23, color: C.muted, textAlign: 'center', writingDirection: 'rtl' },
  most: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12, flexWrap: 'wrap' },
});
