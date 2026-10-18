/**
 * The quiz family's shared pieces (the Islamic quizzes, «معلومات عامة», «ابنِ المسجد»…), so every
 * quiz reads the same way and only its tint changes: round header, question panel, answer buttons,
 * who answered, my verdict, the round's results, the host's «next» button and the final screen.
 * Everything takes the game's own colour from `useAccent()`.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { haptic, play } from '@/lib/sfx';
import type { GameId, McqResult, RoomView } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner } from './common';
import type { Helpers } from './helpers';

/**
 * When a round's answer is revealed, MY sound and vibration: «correct» if I got it right, «wrong» otherwise.
 * `key` identifies the reveal (null while asking); `correct` is my result (null if I'm not playing).
 */
export function useMyResultFx(key: string | null, correct: boolean | null) {
  const last = useRef(key); // a screen opened during a reveal stays quiet
  useEffect(() => {
    if (key === null || correct === null || last.current === key) return;
    last.current = key;
    if (correct) {
      play('correct');
      haptic.success();
    } else {
      play('buzz');
      haptic.error();
    }
  }, [key, correct]);
}

/** The letters on the answer buttons (أ ب ج د…). */
export const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];

/** Uthmani text on the dark panel of a verse. */
export const VERSE_INK = '#FFF8E6';

export function RoundHeader({ label, round, rounds, right }: { label: string; round: number; rounds: number; right?: ReactNode }) {
  const accent = useAccent();
  return (
    <Row gap={8} style={{ justifyContent: 'space-between' }}>
      <View style={[styles.chip, { backgroundColor: alpha(accent, 0.22), borderColor: alpha(accent, 0.5) }]}>
        <Txt v="tiny" color={C.text} numberOfLines={1}>
          {label}
        </Txt>
      </View>
      {right}
      <Txt v="tiny" color={C.muted}>
        {round > 0 ? `${num(round)} من ${num(rounds)}` : ''}
      </Txt>
    </Row>
  );
}

/**
 * The question: one panel framed in the game's colour — the focal point of the round. `kicker` is
 * the small line above it («من أي سورة هذه الآية؟»); `verse` turns it into the dark panel of a verse.
 */
export function QuestionPanel({ id, kicker, verse, compact, children, below }: { id: string | number; kicker?: string; verse?: boolean; compact?: boolean; children: ReactNode; below?: ReactNode }) {
  const accent = useAccent();
  return (
    <Animated.View
      key={id}
      entering={FadeIn.duration(220)}
      style={[
        styles.panel,
        { borderColor: alpha(accent, 0.6) },
        compact && styles.panelCompact,
        verse && { backgroundColor: shade(accent, -0.58), borderColor: alpha(shade(accent, 0.35), 0.75) },
      ]}>
      {kicker ? (
        <Txt v="tiny" center color={verse ? alpha(VERSE_INK, 0.7) : C.muted}>
          {kicker}
        </Txt>
      ) : null}
      {children}
      {below}
    </Animated.View>
  );
}

/** Text of the question (one size for the whole family). */
export function QuestionText({ children }: { children: ReactNode }) {
  return (
    <Txt v="h2" center>
      {children}
    </Txt>
  );
}

/**
 * Answer buttons. `mine` = what I picked, `correct` = revealed answer (null while asking).
 * `counted` = the answer that counts when it isn't mine (the family's vote); `keepOthers` leaves the
 * other buttons bright after I picked (their voters are shown); `extra(i)` adds a line under a button.
 */
export function OptionGrid({
  options,
  mine,
  correct,
  counted,
  disabled,
  keepOthers,
  extra,
  onPick,
  columns = 2,
}: {
  options: string[];
  mine: number | null;
  correct: number | null;
  counted?: number | null;
  disabled?: boolean;
  keepOthers?: boolean;
  extra?: (i: number) => ReactNode;
  onPick: (i: number) => void;
  columns?: 1 | 2;
}) {
  const accent = useAccent();
  const revealed = correct !== null;
  const locked = disabled || mine !== null || revealed;
  const marked = counted !== undefined ? counted : mine;
  const two = columns === 2;
  return (
    <View style={[styles.grid, !two && { flexDirection: 'column' }]}>
      {options.map((o, i) => {
        const isRight = revealed && correct === i;
        const isWrong = revealed && marked === i && !isRight;
        const isMine = !revealed && mine === i;
        const dim = revealed ? !isRight && !isWrong : locked && !isMine && !keepOthers && mine !== null;
        const tone = isRight ? C.green : isWrong ? C.red : isMine ? C.yellow : null;
        const more = extra?.(i);
        return (
          <Pressable
            key={i}
            disabled={locked}
            onPress={() => {
              haptic.medium();
              onPick(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={o}
            accessibilityState={{ selected: isMine, disabled: locked }}
            style={({ pressed }) => [
              styles.option,
              two ? styles.half : styles.full,
              tone ? { borderColor: tone, backgroundColor: alpha(tone, 0.2) } : null,
              dim && { opacity: 0.42 },
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}>
            <View style={[styles.letter, two && styles.letterSmall, { backgroundColor: tone ?? alpha(accent, 0.32) }]}>
              {isRight || isWrong ? (
                <Icon name={isRight ? 'check' : 'close'} size={two ? 14 : 16} color="#FFFFFF" />
              ) : (
                <Txt style={[styles.letterText, two && { fontSize: 12 }, { color: isMine ? C.ink : C.text }]}>{OPTION_LETTERS[i] ?? num(i + 1)}</Txt>
              )}
            </View>
            <View style={styles.optBody}>
              <Txt style={[styles.optText, two && { fontSize: 15, lineHeight: 22 }]}>{o}</Txt>
              {more}
            </View>
            {/* balances the letter, so the answer sits in the middle of the button */}
            {two ? null : <View style={{ width: 28 }} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Who answered so far: their avatars, then an empty seat for each one still thinking. */
export function AnsweredRow({ ids, total, h, label = 'أجاب' }: { ids: string[]; total: number; h: Helpers; label?: string }) {
  const left = Math.max(0, total - ids.length);
  return (
    <Row gap={6} center wrap>
      <Txt v="tiny" color={C.muted}>
        {label} {num(ids.length)} من {num(total)}
      </Txt>
      {ids.map((id) => (
        <Avatar key={id} player={h.player(id)} size={22} />
      ))}
      {Array.from({ length: Math.min(left, 12) }, (_, i) => (
        <View key={`e${i}`} style={styles.seat} />
      ))}
    </Row>
  );
}

/** My result of the round, in one calm line: right (green), wrong (red) or nothing (muted). */
export function MyVerdict({ tone, text }: { tone: 'good' | 'bad' | 'none'; text: string }) {
  const color = tone === 'good' ? C.green : tone === 'bad' ? C.red : C.muted;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.verdict, { borderColor: alpha(color, 0.7), backgroundColor: alpha(color, 0.16) }]}>
      <Icon name={tone === 'good' ? 'check' : tone === 'bad' ? 'close' : 'clock'} size={16} color={color} />
      <Txt v="bold" color={tone === 'none' ? C.muted : C.text} style={{ flexShrink: 1 }} center>
        {text}
      </Txt>
    </Animated.View>
  );
}

/** My answer is in: a quiet line while the others finish. */
export function SentNote({ text }: { text: string }) {
  return (
    <Row gap={6} center>
      <Icon name="check" size={16} color={C.green} />
      <Txt v="bold" color={C.green}>
        {text}
      </Txt>
    </Row>
  );
}

/** What to learn from the round (the reference, the rule, the fact), in the game's tint. */
export function RevealNote({ text, sub, kicker, big }: { text?: string | null; sub?: string | null; kicker?: string; big?: boolean }) {
  const accent = useAccent();
  if (!text && !sub) return null;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.note, { backgroundColor: alpha(accent, 0.14), borderColor: alpha(accent, 0.45) }]}>
      {kicker ? (
        <Txt v="tiny" center color={C.muted}>
          {kicker}
        </Txt>
      ) : null}
      {text ? (
        <Txt v={big ? 'title' : 'bold'} center>
          {text}
        </Txt>
      ) : null}
      {sub ? (
        <Txt v="small" center color={C.muted}>
          {sub}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

export interface ResultLine {
  id: string;
  /** what they answered (or «بلا جواب») */
  detail?: string;
  /** the round's points («+800», «0») */
  gain: string;
  good: boolean;
  /** their total so far; the list is then sorted by it */
  total?: number;
  /** a small mark next to the points (the fast-answer bolt…) */
  icon?: ReactNode;
}

/** The round's results, one row per player (me in yellow), sorted by total — the standings after each question. */
export function ResultRows({
  lines,
  h,
  gainLabel = 'الجولة',
  totalLabel = 'المجموع',
  gainColor = C.green,
  ordered,
}: {
  lines: ResultLine[];
  h: Helpers;
  gainLabel?: string;
  totalLabel?: string;
  gainColor?: string;
  /** keep the lines in the given order */
  ordered?: boolean;
}) {
  const totals = lines.some((l) => l.total !== undefined);
  const sorted = ordered ? lines : [...lines].sort((a, b) => (totals ? (b.total ?? 0) - (a.total ?? 0) : Number(b.good) - Number(a.good)));
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ gap: 6 }}>
      <Row gap={8} style={styles.resHead}>
        <View style={{ flex: 1 }} />
        <Txt v="tiny" color={C.dim} style={styles.gainCol}>
          {gainLabel}
        </Txt>
        {totals ? (
          <Txt v="tiny" color={C.dim} style={styles.totalCol}>
            {totalLabel}
          </Txt>
        ) : null}
      </Row>
      {sorted.map((l) => {
        const me = l.id === h.me;
        return (
          <Row key={l.id} gap={8} style={[styles.result, me && { borderColor: alpha(C.yellow, 0.55), backgroundColor: alpha(C.yellow, 0.08) }]}>
            <Avatar player={h.player(l.id)} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="bold" numberOfLines={1} style={{ fontSize: 14, lineHeight: 21 }}>
                {h.player(l.id).name}
                {me ? ' (أنت)' : ''}
              </Txt>
              {l.detail ? (
                <Txt v="tiny" numberOfLines={1} color={l.good ? C.muted : C.dim}>
                  {l.detail}
                </Txt>
              ) : null}
            </View>
            {l.icon}
            <View style={[styles.gainCol, styles.gain, l.good && { backgroundColor: alpha(gainColor, 0.16) }]}>
              <Txt style={[styles.gainText, { color: l.good ? gainColor : C.dim }]}>{l.gain}</Txt>
            </View>
            {totals ? <Txt style={[styles.totalCol, styles.totalText]}>{num(l.total ?? 0)}</Txt> : null}
          </Row>
        );
      })}
    </Animated.View>
  );
}

/** «بلا جواب» for a player who didn't answer (no verb about them: we don't know if it's he or she). */
export const NO_ANSWER = 'بلا جواب';

/** The multiple-choice results (what each one chose, the round's points, the total). */
export function ResultsList({ results, h, options, scores }: { results: McqResult[]; h: Helpers; options: string[]; scores?: Record<string, number> }) {
  return (
    <ResultRows
      h={h}
      lines={results.map((r) => ({
        id: r.id,
        detail: r.text !== undefined ? (r.text ?? NO_ANSWER) : r.choice === null ? NO_ANSWER : options[r.choice],
        gain: r.correct ? `+${num(r.points)}` : num(0),
        good: r.correct,
        total: scores?.[r.id],
      }))}
    />
  );
}

/** My verdict for a multiple-choice round. */
export function McqVerdict({ mine }: { mine: McqResult | undefined }) {
  if (!mine) return null;
  const silent = mine.text !== undefined ? mine.text === null : mine.choice === null;
  if (mine.correct) return <MyVerdict tone="good" text={`إجابة صحيحة · ${num(`+${mine.points}`)}`} />;
  return <MyVerdict tone={silent ? 'none' : 'bad'} text={silent ? 'انتهى الوقت قبل جوابك' : 'إجابة خاطئة'} />;
}

/** The host moves on to the next round; the others see who decides. */
export function HostNext({ h, last }: { h: Helpers; last: boolean }) {
  return h.isHost ? (
    <Btn size="lg" icon={last ? 'trophy' : 'next'} label={last ? 'النتيجة النهائية' : 'الجولة التالية'} onPress={() => h.act('next')} />
  ) : (
    <HostNote>{last ? 'النتيجة النهائية بعد قليل' : 'الجولة التالية بعد قليل'}</HostNote>
  );
}

/** «الفوز من نصيب ماما» — no verb about the winner (we don't know if it's he or she). */
export function winnerTitle(names: string[]) {
  return names.length === 1 ? `الفوز من نصيب ${names[0]}` : 'تعادل!';
}

/** The house final: banner → podium → scoreboard → play again. */
export function QuizFinal({ room, scores, game, h, sub = 'بارك الله فيكم جميعاً' }: { room: RoomView; scores: Record<string, number>; game: GameId; h: Helpers; sub?: string }) {
  const ids = Object.keys(scores);
  const best = ids.length ? Math.max(...ids.map((id) => scores[id])) : 0;
  const winners = ids.filter((id) => scores[id] === best);
  const won = winners.includes(h.me);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id={game} size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub={sub} />
      <Podium players={room.players} scores={scores} />
      <Scoreboard players={room.players} scores={scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

export function McqFinal({ room, scores, game, h }: { room: RoomView; scores: Record<string, number>; game: GameId; h: Helpers }) {
  return <QuizFinal room={room} scores={scores} game={game} h={h} />;
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, flexShrink: 1 },
  panel: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 2, padding: 16, gap: 8, minHeight: 104, justifyContent: 'center' },
  panelCompact: { minHeight: 0, paddingVertical: 8, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexBasis: '40%', flexGrow: 1, minWidth: 0 },
  full: { width: '100%' },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.borderStrong,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  letter: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  letterSmall: { width: 22, height: 22, borderRadius: 11 },
  letterText: { fontFamily: F.black, fontSize: 14, lineHeight: 20 },
  optBody: { flex: 1, minWidth: 0, gap: 4, alignItems: 'center' },
  optText: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, textAlign: 'center', color: C.text },
  seat: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong },
  verdict: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', maxWidth: '100%', borderRadius: 999, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 16 },
  note: { borderRadius: 16, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  resHead: { paddingHorizontal: 10, marginBottom: -2 },
  result: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', paddingVertical: 6, paddingHorizontal: 10 },
  gainCol: { minWidth: 52, textAlign: 'center' },
  gain: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  gainText: { fontFamily: F.black, fontSize: 14, lineHeight: 21 },
  totalCol: { minWidth: 48, textAlign: 'center' },
  totalText: { fontFamily: F.black, fontSize: 16, lineHeight: 23, color: C.text },
});
