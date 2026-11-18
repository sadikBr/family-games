/**
 * «القاموس العجيب» — the screen. The word on a page of an old dictionary (big, with its vowel marks); while
 * writing: the box with its counter (the draft is kept on the server as I type), then «بانتظار الآخرين» with a
 * tick on everyone who has sent; the vote: the definitions as cards (mine can't be chosen); the reveal: the real
 * meaning in green, who wrote each fake and who voted for it (avatars with an arrow), the host's «صحيح», the
 * round's points; the final podium. The lobby settings: rounds and writing time.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { QAMUS_POINTS, QAMUS_ROUNDS, QAMUS_SECONDS, QAMUS_TEXT_MAX, QAMUS_TEXT_MIN, type QamusRevealCard, type QamusSettings as Settings, type QamusView } from '@/shared/games/qamus';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
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
import { HostNext, MyVerdict, OPTION_LETTERS, QuizFinal, ResultRows, RoundHeader, useMyResultFx } from './islamic-ui';
import { useScreenClock, useSettled } from './touch-motion';

const ROSE = '#C2577A';
const PAPER = '#FBF1DC';
const PAPER_EDGE = '#E9D6B0';
const INK = '#3A2340';
const INK_SOFT = '#7A6070';

export function QamusGame({ room, view }: { room: RoomView; view: QamusView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="qamus" h={h} sub="معانٍ عجيبة… وقاموس أعجب!" />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <QamusRound key={view.round} view={view} h={h} />;
}

function QamusRound({ view, h }: { view: QamusView; h: Helpers }) {
  const r = view.reveal;
  const myCorrect = r ? r.knew.includes(h.me) || (!!r.votes[h.me] && !!r.cards.find((c) => c.id === r.votes[h.me] && (c.real || c.marked))) : null;
  useMyResultFx(view.phase === 'reveal' ? `r${view.round}` : null, myCorrect);
  return (
    <>
      <RoundHeader
        label={view.category}
        round={view.round}
        rounds={view.rounds}
        right={
          <Txt v="tiny" color={C.muted}>
            نقاطك: {num(view.scores[h.me] ?? 0)}
          </Txt>
        }
      />
      {view.endsAt ? <TimerBar key={view.phase} endsAt={view.endsAt} total={view.total} onTick={view.phase !== 'reveal'} /> : null}
      <WordPage view={view} />
      {view.phase === 'write' ? <WritePhase view={view} h={h} /> : null}
      {view.phase === 'vote' ? <VotePhase view={view} h={h} /> : null}
      {view.phase === 'reveal' && r ? <RevealPhase view={view} h={h} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The word                                                            */
/* ------------------------------------------------------------------ */

/** The word on a page of an old dictionary. */
function WordPage({ view }: { view: QamusView }) {
  const width = useContentWidth();
  const inner = Math.min(width, dk(560));
  const settled = useSettled();
  const letters = [...view.word.replace(/[\u064B-\u0652\u0670]/g, '')].length;
  const big = view.phase === 'write';
  const cap = big ? 64 : 48;
  const size = Math.max(30, Math.min(dk(cap), Math.floor((inner - 48) / Math.max(4, letters * 0.62))));
  const kicker = view.phase === 'write' ? 'ما معنى هذه الكلمة؟' : view.phase === 'vote' ? 'أي التعريفات هو الصحيح؟' : 'المعنى في القاموس';
  return (
    <Animated.View entering={settled ? FadeIn.duration(320) : undefined} style={[styles.page, { width: inner, alignSelf: 'center' }]}>
      <View style={styles.pageInner}>
        <Row gap={8} style={{ justifyContent: 'center', alignItems: 'center' }}>
          <View style={styles.rule} />
          <Txt style={styles.kicker}>{kicker}</Txt>
          <View style={styles.rule} />
        </Row>
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: F.display, color: INK, fontSize: size, lineHeight: Math.round(size * 1.75), textAlign: 'center', marginTop: -Math.round(size * 0.1) }}>
          {view.word}
        </Txt>
        {view.reveal ? (
          <Animated.View entering={settled ? FadeInDown.duration(380) : undefined} style={{ marginTop: -6 }}>
            <Txt style={styles.realDef}>{view.reveal.cards.find((c) => c.real)?.text}</Txt>
          </Animated.View>
        ) : (
          <Txt style={styles.pageFoot}>كلمة حقيقية من القاموس</Txt>
        )}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

function WritePhase({ view, h }: { view: QamusView; h: Helpers }) {
  const mine = view.mine;
  return (
    <>
      {mine?.sent ? <Sent text={mine.text} round={view.round} h={h} /> : <Writer view={view} h={h} />}
      <Ticks view={view} h={h} label={mine?.sent ? 'بانتظار الآخرين…' : 'التعريفات المرسلة'} />
    </>
  );
}

/** The writing box: the draft goes to the server as I type (sent as it is if time runs out). */
function Writer({ view, h }: { view: QamusView; h: Helpers }) {
  const [text, setText] = useState(view.mine?.text ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const change = (t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => h.act('type', { round: view.round, text: t }), 500);
  };
  const ok = [...text.trim()].length >= QAMUS_TEXT_MIN;
  const send = () => {
    if (!ok) return;
    if (timer.current) clearTimeout(timer.current);
    haptic.medium();
    h.act('send', { round: view.round, text: text.trim() });
  };
  const used = [...text].length;
  return (
    <View style={styles.panel}>
      <Txt v="bold" center>
        اكتب معنى مزيفاً يبدو حقيقياً
      </Txt>
      <Field
        value={text}
        onChangeText={change}
        onSubmitEditing={send}
        placeholder="مثلاً: حجر أملس يُصقل به النحاس"
        placeholderTextColor={C.dim}
        style={[styles.input, { borderColor: text ? alpha(ROSE, 0.75) : C.border }]}
        maxLength={QAMUS_TEXT_MAX}
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        autoCorrect={false}
        accessibilityLabel="التعريف المزيف"
      />
      <Row gap={8} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt v="tiny" color={C.dim} style={{ flex: 1 }}>
          قصير ومقنع، كأنه من القاموس
        </Txt>
        <Txt v="tiny" color={QAMUS_TEXT_MAX - used < 15 ? C.yellow : C.dim} accessibilityLabel={`${num(used)} من ${num(QAMUS_TEXT_MAX)} حرفاً`}>
          {num(used)} / {num(QAMUS_TEXT_MAX)}
        </Txt>
      </Row>
      <Btn size="lg" icon="check" label="أرسل التعريف" color={ROSE} disabled={!ok} onPress={send} />
    </View>
  );
}

function Sent({ text, round, h }: { text: string; round: number; h: Helpers }) {
  const settled = useSettled();
  return (
    <Animated.View entering={settled ? FadeIn.duration(240) : undefined} style={[styles.panel, { alignItems: 'center' }]}>
      <Row gap={6} center>
        <Icon name="check" size={18} color={C.green} />
        <Txt v="bold" color={C.green}>
          أُرسل تعريفك
        </Txt>
      </Row>
      <Txt center style={styles.quote}>
        «{text}»
      </Txt>
      <Btn size="sm" ghost icon="edit" label="تعديل" onPress={() => h.act('edit', { round })} />
    </Animated.View>
  );
}

/** Everyone, with a tick on the ones done (sent / voted). */
function Ticks({ view, h, label }: { view: QamusView; h: Helpers; label: string }) {
  const width = useContentWidth();
  const many = view.players.length > 6;
  const size = width < 340 || many ? 34 : dk(40);
  return (
    <View style={{ gap: 8, alignItems: 'center' }}>
      <Txt v="tiny" color={C.muted}>
        {label} {num(view.done.length)} من {num(view.players.length)}
      </Txt>
      <Row wrap gap={8} style={{ justifyContent: 'center' }}>
        {view.players.map((id) => {
          const p = h.player(id);
          const done = view.done.includes(id);
          return (
            <View key={id} style={{ alignItems: 'center', width: size + 18 }} accessibilityLabel={`${p.name}: ${done ? 'جاهز' : 'لم ينته بعد'}`}>
              <View style={[styles.tickRing, { borderColor: done ? C.green : C.borderStrong, borderStyle: done ? 'solid' : 'dashed', borderRadius: (size + 8) / 2 }]}>
                <Avatar player={p} size={size} dim={!done} badge={done ? 'check' : undefined} />
              </View>
              <Txt numberOfLines={1} style={styles.tickName}>
                {id === h.me ? 'أنت' : p.name}
              </Txt>
            </View>
          );
        })}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Voting                                                              */
/* ------------------------------------------------------------------ */

function VotePhase({ view, h }: { view: QamusView; h: Helpers }) {
  const cards = view.cards ?? [];
  const settled = useSettled();
  return (
    <>
      {view.iKnew ? (
        <MyVerdict tone="good" text={`المعنى الحقيقي بقلمك! ${num(`+${QAMUS_POINTS.knew}`)}`} />
      ) : (
        <Txt v="small" center color={C.muted}>
          {view.myVote ? 'يمكن تغيير الاختيار حتى يصوّت الجميع' : 'اختر التعريف الذي تراه صحيحاً (لا تعريفك)'}
        </Txt>
      )}
      <View style={{ gap: 8 }}>
        {cards.map((c, i) => {
          const chosen = view.myVote === c.id;
          const locked = c.mine || view.iKnew;
          return (
            <Animated.View key={c.id} entering={settled ? FadeInDown.delay(Math.min(i, 8) * 60).duration(260) : undefined}>
              <Pressable
                disabled={locked}
                onPress={() => {
                  haptic.medium();
                  h.act('vote', { round: view.round, card: c.id });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen, disabled: locked }}
                accessibilityLabel={`${c.text}${c.mine ? ' — تعريفك' : ''}`}
                style={({ pressed }) => [
                  styles.defCard,
                  chosen && { borderColor: ROSE, backgroundColor: alpha(ROSE, 0.16) },
                  c.mine && { opacity: 0.55, borderStyle: 'dashed' },
                  pressed && { transform: [{ scale: 0.985 }] },
                ]}>
                <View style={[styles.letter, { backgroundColor: chosen ? ROSE : alpha(ROSE, 0.25) }]}>
                  {chosen ? <Icon name="check" size={15} color="#FFFFFF" /> : <Txt style={styles.letterText}>{OPTION_LETTERS[i] ?? num(i + 1)}</Txt>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt style={styles.defText}>{c.text}</Txt>
                  {c.mine ? (
                    <Txt v="tiny" color={C.dim}>
                      تعريفك
                    </Txt>
                  ) : null}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <Ticks view={view} h={h} label="الأصوات" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The reveal                                                          */
/* ------------------------------------------------------------------ */

function RevealPhase({ view, h }: { view: QamusView; h: Helpers }) {
  const r = view.reveal!;
  const settled = useSettled();
  const last = view.round >= view.rounds;
  const myVote = r.votes[h.me];
  const voted = myVote ? r.cards.find((c) => c.id === myVote) : undefined;
  const mineCard = r.cards.find((c) => !c.real && c.authors.includes(h.me));
  const fooled = mineCard && !mineCard.marked ? mineCard.voters.filter((v) => v !== h.me).length : 0;
  let verdict: { tone: 'good' | 'bad' | 'none'; text: string };
  if (r.knew.includes(h.me)) verdict = { tone: 'good', text: `المعنى الحقيقي بقلمك · ${num(`+${QAMUS_POINTS.knew}`)}` };
  else if (voted && (voted.real || voted.marked)) verdict = { tone: 'good', text: `اختيار صحيح · ${num(`+${QAMUS_POINTS.real}`)}` };
  else if (voted) verdict = { tone: 'bad', text: voted.authors.length ? `فخّ من ${voted.authors.map((a) => (a === h.me ? 'أنت' : h.player(a).name)).join(' و')}!` : 'تعريف مزيف' };
  else verdict = { tone: 'none', text: 'بلا تصويت' };
  const real = r.cards.filter((c) => c.real || c.marked);
  const fakes = r.cards.filter((c) => !c.real && !c.marked);
  return (
    <>
      <MyVerdict tone={verdict.tone} text={fooled ? `${verdict.text} · أصوات لتعريفك: ${num(fooled)}` : verdict.text} />
      <View style={{ gap: 8 }}>
        {real.map((c, i) => (
          <RevealCard key={c.id} card={c} h={h} knew={c.real ? r.knew.filter((p) => !r.cards.some((x) => x.marked && x.authors.includes(p))) : []} index={i} settled={settled} />
        ))}
        {fakes.map((c, i) => (
          <RevealCard key={c.id} card={c} h={h} knew={[]} index={real.length + i} settled={settled} />
        ))}
      </View>
      <ResultRows
        h={h}
        gainLabel="الجولة"
        lines={view.players.map((id) => {
          const wrote = r.wrote[id];
          const detail = r.knew.includes(id) ? 'المعنى الحقيقي' : wrote ? `«${wrote}»` : 'بلا تعريف';
          const g = r.gains[id] ?? 0;
          return { id, detail, gain: g ? num(`+${g}`) : num(0), good: g > 0, total: view.scores[id] ?? 0 };
        })}
      />
      <HostNext h={h} last={last} />
      {h.isHost ? (
        <Txt v="tiny" center color={C.dim}>
          تعريف يقول المعنى الحقيقي؟ اضغط «صحيح» تحته: ثلاث نقاط لكاتبه، ونقطتان لمن اختاره
        </Txt>
      ) : null}
    </>
  );
}

function RevealCard({ card, h, knew, index, settled }: { card: QamusRevealCard; h: Helpers; knew: string[]; index: number; settled: boolean }) {
  const good = card.real || card.marked;
  const tone = good ? C.green : ROSE;
  const writers = card.real ? knew : card.authors;
  return (
    <Animated.View
      entering={settled ? FadeInDown.delay(Math.min(index, 8) * 90).duration(300) : undefined}
      style={[styles.revealCard, { borderColor: alpha(tone, good ? 0.8 : 0.35), backgroundColor: good ? alpha(C.green, 0.12) : C.surface }]}>
      <Row gap={6} style={{ alignItems: 'center' }}>
        {good ? <Icon name="check" size={15} color={C.green} /> : null}
        <Txt v="tiny" color={good ? C.green : C.muted} style={{ flex: 1 }}>
          {card.real ? 'المعنى الحقيقي' : card.marked ? 'صحيح أيضاً (باختيار المضيف)' : writers.length ? 'تعريف مزيف' : 'تعريف مزيف (صاحبه خارج اللعبة)'}
        </Txt>
        {!card.real && writers.length > 0 && h.isHost ? (
          <Btn size="sm" ghost={!card.marked} color={C.green} icon={card.marked ? 'close' : 'check'} label={card.marked ? 'إلغاء' : 'صحيح'} onPress={() => h.act('mark', { card: card.id, on: !card.marked })} />
        ) : null}
      </Row>
      <Txt style={[styles.defText, good && { color: C.text }]}>{card.text}</Txt>
      {writers.length ? (
        <Row gap={6} wrap style={{ alignItems: 'center' }}>
          <Icon name="edit" size={13} color={C.muted} />
          {writers.map((id) => (
            <Row key={id} gap={4} style={{ alignItems: 'center' }}>
              <Avatar player={h.player(id)} size={22} />
              <Txt v="tiny">{id === h.me ? 'أنت' : h.player(id).name}</Txt>
            </Row>
          ))}
          {card.real ? (
            <Txt v="tiny" color={C.green}>
              {num(`+${QAMUS_POINTS.knew}`)}
            </Txt>
          ) : null}
        </Row>
      ) : null}
      <View style={styles.votesBar}>
        {card.voters.length ? (
          <>
            <Txt v="tiny" color={C.muted}>
              الأصوات:
            </Txt>
            {card.voters.map((id) => (
              <View key={id} style={styles.voter} accessibilityLabel={`صوت ${h.player(id).name}`}>
                <Avatar player={h.player(id)} size={24} />
                <Icon name="forward" size={12} color={tone} />
              </View>
            ))}
            <Txt v="tiny" color={good ? C.green : C.muted} style={{ marginStart: 2 }}>
              {good
                ? `${num(card.voters.length)} × ${num(`+${QAMUS_POINTS.real}`)}`
                : writers.length
                  ? `${num(`+${card.voters.length * QAMUS_POINTS.fooled}`)} ${writers.length > 1 ? 'لكل كاتب' : 'لكاتبه'}`
                  : ''}
            </Txt>
          </>
        ) : (
          <Txt v="tiny" color={C.dim}>
            لا أصوات
          </Txt>
        )}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = QAMUS_ROUNDS.map((n) => ({ key: String(n), label: `${num(n)} جولات` }));
const SECONDS_LABEL: Record<number, string> = { 60: 'دقيقة', 90: 'دقيقة ونصف', 120: 'دقيقتان' };
const SECONDS_OPTIONS = QAMUS_SECONDS.map((n) => ({ key: String(n), label: SECONDS_LABEL[n] ?? `${num(n)} ث` }));

export function QamusSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.qamus;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'qamus', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كتابة التعريف</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECONDS_OPTIONS} />
      <Row gap={8}>
        <GameArt id="qamus" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          كلمة نادرة حقيقية في كل جولة: اكتبوا لها معاني مزيفة مقنعة، ثم ابحثوا عن المعنى الحقيقي بينها.
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: PAPER, borderRadius: 18, padding: 6, borderWidth: 1, borderColor: PAPER_EDGE },
  pageInner: { borderRadius: 13, borderWidth: 1.5, borderColor: alpha(ROSE, 0.55), paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  rule: { height: 1.5, width: 26, backgroundColor: alpha(ROSE, 0.6), borderRadius: 1 },
  kicker: { fontFamily: F.bold, fontSize: 13, lineHeight: 20, color: ROSE, textAlign: 'center' },
  pageFoot: { fontFamily: F.bold, fontSize: 12, lineHeight: 18, color: INK_SOFT, textAlign: 'center', marginTop: -8 },
  realDef: { fontFamily: F.black, fontSize: 17, lineHeight: 27, color: '#1F7A55', textAlign: 'center' },
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 14, gap: 10 },
  input: {
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: C.bg3,
    color: C.text,
    fontFamily: F.bold,
    fontSize: 17,
    lineHeight: 27,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'right',
    writingDirection: 'rtl',
    textAlignVertical: 'top',
  },
  quote: { fontFamily: F.bold, fontSize: 17, lineHeight: 27, color: C.text },
  tickRing: { padding: 2, borderWidth: 2 },
  tickName: { fontFamily: F.bold, fontSize: 11, lineHeight: 16, color: C.muted, textAlign: 'center', maxWidth: '100%' },
  defCard: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.borderStrong,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  letter: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: F.black, fontSize: 14, lineHeight: 20, color: C.text },
  defText: { fontFamily: F.bold, fontSize: 16, lineHeight: 25, color: C.text, textAlign: 'right' },
  revealCard: { borderRadius: 16, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  voter: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  votesBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
});
