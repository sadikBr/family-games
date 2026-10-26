/**
 * «سؤال وشرط» — the screen. The two cards of the round side by side (the question in the game's blue, the
 * condition in saffron), the answer box with a live check of the condition, my tries and my last refused
 * word with its hint, who has tried, «تخطّي»; the vote on a word the lists don't know; the round's result
 * (who took the card, a few valid answers, everyone's tries) and the final podium.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  QCOND_CAT_INFO,
  QCOND_ROUNDS,
  QCOND_SECONDS,
  condLabel,
  condMark,
  condMiss,
  meetsCond,
  type QcondAttempt,
  type QcondSettings as Settings,
  type QcondView,
} from '@/shared/games/qcond';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Field } from '@/ui/field';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HostNext, MyVerdict, QuizFinal, ResultRows, RevealNote, RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';

const BLUE = '#2E86C1';
const CARD_INK = '#FFF8E6';

/** «7.4 ث» */
const secs = (ms: number) => `${num((ms / 1000).toFixed(1))} ث`;
/** «محاولة واحدة»، «محاولتان»، «3 محاولات» */
const triesText = (n: number) => (n === 1 ? 'محاولة واحدة' : n === 2 ? 'محاولتان' : `${num(n)} محاولات`);

export function QcondGame({ room, view }: { room: RoomView; view: QcondView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="qcond" h={h} sub="أحسنتم جميعاً!" />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <QcondRound key={view.round} room={room} view={view} h={h} />;
}

function QcondRound({ room, view, h }: { room: RoomView; view: QcondView; h: Helpers }) {
  const myCards = view.scores[h.me] ?? 0;
  return (
    <>
      <RoundHeader
        label="سؤال وشرط"
        round={view.round}
        rounds={view.rounds}
        right={
          <Row gap={4}>
            <Icon name="cards" size={15} color={C.muted} />
            <Txt v="tiny" color={C.muted}>
              بطاقاتك: {num(myCards)}
            </Txt>
          </Row>
        }
      />
      {view.endsAt ? <TimerBar key={view.phase} endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play' && !view.result} /> : null}
      <Cards view={view} />
      {view.phase === 'play' ? <Play room={room} view={view} h={h} /> : null}
      {view.phase === 'vote' && view.vote ? <Vote view={view} h={h} /> : null}
      {view.phase === 'reveal' && view.result ? <Reveal view={view} h={h} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The two cards                                                       */
/* ------------------------------------------------------------------ */

function Cards({ view }: { view: QcondView }) {
  const settled = useSettled();
  const enter = settled ? FadeIn.duration(260) : undefined;
  const cat = QCOND_CAT_INFO[view.cat];
  return (
    <View style={{ gap: 6 }}>
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        <Animated.View entering={enter} style={[styles.card, { backgroundColor: BLUE, borderColor: shade(BLUE, 0.35) }]}>
          <Row gap={4} center>
            <Icon name="question" size={14} color={alpha(CARD_INK, 0.75)} />
            <Txt v="tiny" color={alpha(CARD_INK, 0.75)}>
              السؤال
            </Txt>
          </Row>
          <View style={styles.cardBody}>
            <Txt v="h2" center color={CARD_INK} style={{ fontSize: cat.label.length > 10 ? 18 : 22, lineHeight: cat.label.length > 10 ? 28 : 34 }}>
              {cat.label}
            </Txt>
          </View>
        </Animated.View>
        <Animated.View entering={enter} style={[styles.card, { backgroundColor: C.yellow, borderColor: shade(C.yellow, 0.35) }]}>
          <Row gap={4} center>
            <Icon name="target" size={14} color={alpha(C.ink, 0.7)} />
            <Txt v="tiny" color={alpha(C.ink, 0.7)}>
              الشرط
            </Txt>
          </Row>
          <View style={styles.cardBody}>
            <Txt style={[styles.mark, view.cond.kind === 'noAlif' && styles.struck]}>{condMark(view.cond)}</Txt>
            <Txt v="tiny" center color={C.ink} style={{ fontSize: 13, lineHeight: 19 }}>
              {condLabel(view.cond)}
            </Txt>
          </View>
        </Animated.View>
      </Row>
      <Txt v="tiny" center color={C.dim}>
        «ال» في أول الكلمة لا تُحسب · الهمزة على الألف ألف · ة = ه
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

function Play({ room, view, h }: { room: RoomView; view: QcondView; h: Helpers }) {
  const used = view.tries[h.me] ?? 0;
  const left = Math.max(0, view.maxTries - used);
  const skipped = view.skips.includes(h.me);

  // a refused answer: a short vibration on my phone only
  const last = view.myLast ? `${view.myLast.text}|${view.myLast.hint}` : null;
  const felt = useRef(last);
  useEffect(() => {
    if (last && last !== felt.current) haptic.error();
    felt.current = last;
  }, [last]);

  return (
    <>
      {left > 0 ? <AnswerBox view={view} h={h} /> : <MyVerdict tone="none" text="لا محاولات متبقية في هذه الجولة" />}
      {view.myLast ? <MyVerdict tone="bad" text={`«${view.myLast.text}»: ${view.myLast.hint}`} /> : null}
      <Row gap={8} center>
        <Txt v="tiny" color={C.muted}>
          المحاولات المتبقية:
        </Txt>
        {Array.from({ length: view.maxTries }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i < left ? C.green : C.raised }]} />
        ))}
      </Row>
      <PlayerStrip
        room={room}
        gains={false}
        entries={view.players.map((id) => {
          const n = view.tries[id] ?? 0;
          return { id, score: view.scores[id] ?? 0, sub: view.skips.includes(id) ? 'تخطّي' : n ? `${'✗'.repeat(n)}` : '—' };
        })}
      />
      {view.skipNeeded > 0 ? (
        <Btn
          size="sm"
          ghost
          icon="skip"
          label={skipped ? `إلغاء التخطي (${num(view.skips.length)} من ${num(view.skipNeeded)})` : view.skips.length ? `تخطّي (${num(view.skips.length)} من ${num(view.skipNeeded)})` : 'تخطّي البطاقة'}
          onPress={() => h.act('skip')}
        />
      ) : null}
    </>
  );
}

/** The answer box: a live check of the condition as I type, «أرسل» sends (the server judges). */
function AnswerBox({ view, h }: { view: QcondView; h: Helpers }) {
  const [text, setText] = useState('');
  const t = text.trim();
  const ok = t.length > 1 && meetsCond(t, view.cond);
  const send = () => {
    if (t.length < 2) return;
    haptic.medium();
    h.act('answer', { round: view.round, text: t });
    setText('');
  };
  return (
    <View style={{ gap: 6 }}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Field
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="اكتب جوابك…"
          placeholderTextColor={C.dim}
          style={[styles.input, { borderColor: t ? alpha(ok ? C.green : C.yellow, 0.7) : C.border }]}
          maxLength={30}
          returnKeyType="send"
          submitBehavior="submit"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Btn size="md" icon="check" label="أرسل" color={C.green} disabled={t.length < 2} onPress={send} />
      </Row>
      {t.length > 1 ? (
        <Row gap={6} center>
          <Icon name={ok ? 'check' : 'close'} size={14} color={ok ? C.green : C.dim} />
          <Txt v="tiny" color={ok ? C.green : C.dim}>
            {ok ? condLabel(view.cond) : condMiss(t, view.cond)}
          </Txt>
        </Row>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Vote                                                                */
/* ------------------------------------------------------------------ */

function Vote({ view, h }: { view: QcondView; h: Helpers }) {
  const v = view.vote!;
  const settled = useSettled();
  const canVote = v.voters.includes(h.me);
  const mine = v.yes.includes(h.me) ? 'yes' : v.no.includes(h.me) ? 'no' : null;
  return (
    <Animated.View entering={settled ? FadeIn.duration(220) : undefined} style={[styles.vote, { borderColor: alpha(C.yellow, 0.55) }]}>
      <Row gap={6} center>
        <Icon name="vote" size={16} color={C.yellow} />
        <Txt v="tiny" color={C.muted}>
          كلمة ليست في قوائم اللعبة: تصويت
        </Txt>
      </Row>
      <Row gap={8} center>
        <Avatar player={h.player(v.by)} size={30} />
        <Txt v="small" color={C.muted}>
          {v.by === h.me ? 'جوابك' : `جواب ${h.player(v.by).name}`}
        </Txt>
      </Row>
      <Txt v="title" center>
        {v.question}
      </Txt>
      {canVote ? (
        <Row gap={8}>
          <Btn flex size="md" icon="check" label="نعم" color={C.green} ghost={mine !== 'yes'} onPress={() => h.act('vote', { yes: true })} />
          <Btn flex size="md" icon="close" label="لا" color={C.red} ghost={mine !== 'no'} onPress={() => h.act('vote', { yes: false })} />
        </Row>
      ) : (
        <Txt v="small" center color={C.muted}>
          {v.by === h.me ? 'القرار للآخرين: الأغلبية تقبل الكلمة أو ترفضها' : 'التصويت للآخرين'}
        </Txt>
      )}
      <Txt v="tiny" center color={C.dim}>
        نعم {num(v.yes.length)} · لا {num(v.no.length)} · من {num(v.voters.length)}
      </Txt>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The round's result                                                  */
/* ------------------------------------------------------------------ */

function Reveal({ view, h }: { view: QcondView; h: Helpers }) {
  const r = view.result!;
  const last = view.round >= view.rounds;
  const tries = r.attempts.filter((a) => !a.ok);
  return (
    <>
      <Winner view={view} h={h} />
      {r.examples.length ? <RevealNote kicker={r.winner ? 'أجوبة أخرى ممكنة' : 'أجوبة ممكنة'} text={r.examples.join(' · ')} /> : null}
      {tries.length ? <Tries attempts={tries} h={h} /> : null}
      <ResultRows
        h={h}
        gainLabel="البطاقة"
        totalLabel="البطاقات"
        lines={view.players.map((id) => ({ id, gain: id === r.winner ? num('+1') : num(0), good: id === r.winner, total: view.scores[id] ?? 0 }))}
      />
      <HostNext h={h} last={last} />
    </>
  );
}

function Winner({ view, h }: { view: QcondView; h: Helpers }) {
  const r = view.result!;
  const settled = useSettled();
  if (!r.winner) {
    return (
      <MyVerdict
        tone="none"
        text={r.how === 'skip' ? 'تخطّي البطاقة بطلب الجميع' : 'انتهى الوقت دون جواب صحيح'}
      />
    );
  }
  const me = r.winner === h.me;
  return (
    <Animated.View
      entering={settled ? FadeIn.duration(260) : undefined}
      style={[styles.winner, { backgroundColor: alpha(me ? C.green : BLUE, 0.18), borderColor: alpha(me ? C.green : BLUE, 0.6) }]}>
      <Avatar player={h.player(r.winner)} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="tiny" color={C.muted} numberOfLines={1}>
          {me ? 'البطاقة لك!' : `البطاقة من نصيب ${h.player(r.winner).name}`}
        </Txt>
        <Txt v="title" numberOfLines={1}>
          {r.text}
        </Txt>
        <Txt v="tiny" color={C.dim}>
          {r.how === 'vote' ? 'بقبول الأغلبية' : 'جواب صحيح'}
          {r.ms !== null ? ` · ${secs(r.ms)}` : ''}
        </Txt>
      </View>
      <Icon name="cards" size={26} color={C.yellow} />
    </Animated.View>
  );
}

/** The refused answers of the round, with why. */
function Tries({ attempts, h }: { attempts: QcondAttempt[]; h: Helpers }) {
  return (
    <View style={styles.tries}>
      <Txt v="tiny" color={C.muted}>
        محاولات لم تُقبل ({triesText(attempts.length)}):
      </Txt>
      {attempts.slice(-8).map((a, i) => (
        <Row key={i} gap={6}>
          <Avatar player={h.player(a.id)} size={20} />
          <Txt v="tiny" numberOfLines={1} style={{ flexShrink: 1 }}>
            «{a.text}»
            <Txt v="tiny" color={C.dim}>
              {a.hint ? ` — ${a.hint}` : ''}
            </Txt>
          </Txt>
        </Row>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = QCOND_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'جولات' : 'جولة'}` }));
const SECONDS_OPTIONS = QCOND_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ث` }));

export function QcondSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.qcond;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'qcond', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل جولة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECONDS_OPTIONS} />
      <Row gap={8}>
        <GameArt id="qcond" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          أول جواب صحيح يأخذ البطاقة. لكل لاعب 3 محاولات في الجولة، وكلمة لا تعرفها القوائم يقرّرها تصويت الآخرين.
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, minHeight: 138, borderRadius: 18, borderWidth: 2, paddingVertical: 8, paddingHorizontal: 8, gap: 4 },
  cardBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  mark: { fontFamily: F.display, fontSize: 34, lineHeight: 50, color: C.ink, textAlign: 'center' },
  struck: { textDecorationLine: 'line-through', textDecorationColor: C.red },
  input: {
    flex: 1,
    fontFamily: F.bold,
    fontSize: 18,
    lineHeight: 26,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    writingDirection: 'rtl',
    textAlign: 'right',
    borderWidth: 2,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  vote: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 2, padding: 14, gap: 10 },
  winner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12 },
  tries: { backgroundColor: C.surface, borderRadius: 16, padding: 10, gap: 6 },
});
