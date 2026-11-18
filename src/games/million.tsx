/**
 * «من سيربح المليون؟» — the screen. The deep blue studio («Stage»): the contestant on the hot seat, the
 * question and the four answers (أ ب ج د) as the show's lozenges, the lifelines, the money ladder (a side
 * panel on a computer, a bar that opens on a phone). The contestant taps an answer, then «الإجابة
 * النهائية؟»; the chosen answer is lit for everyone, then the reveal. The others are the audience: a small
 * answer pad of their own (secret), the chart when the audience is asked, the phone-a-friend card (the
 * friend answers there). Between turns the prize won; at the end the standing by prizes.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import {
  MILLION_LADDER,
  MILLION_LETTERS,
  MILLION_ROUNDS,
  MILLION_TIMERS,
  MILLION_TOPICS,
  prizeAt,
  safePrize,
  type MillionLifeline,
  type MillionSettings as Settings,
  type MillionTopic,
  type MillionView,
} from '@/shared/games/million';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { winnerTitle } from './islamic-ui';
import {
  AnswerGrid,
  CREAM,
  GOLD,
  LIT,
  Ladder,
  Lifelines,
  NAVY,
  PollChart,
  QuestionLozenge,
  RIGHT,
  SILVER,
  SecondsLeft,
  Stage,
  WRONG,
  money,
  styles,
  type AnswerState,
} from './million-stage';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';

const TOPIC_LABEL = Object.fromEntries(MILLION_TOPICS.map((t) => [t.key, t.label])) as Record<MillionTopic, string>;
const ASKING = new Set<MillionView['phase']>(['ask', 'poll', 'call']);
const SHOWING = new Set<MillionView['phase']>(['ask', 'poll', 'call', 'lock', 'reveal']);

/** «لا نقاط»، «نقطة واحدة»، «نقطتان»، «3 نقاط»، «11 نقطة» */
function pointsText(n: number) {
  if (n === 0) return 'لا نقاط بعد';
  if (n === 1) return 'نقطة واحدة';
  if (n === 2) return 'نقطتان';
  return n <= 10 ? `${num(n)} نقاط` : `${num(n)} نقطة`;
}

/** «سؤال واحد»، «سؤالان»، «3 أسئلة»، «11 سؤالاً» */
function questionsText(n: number) {
  if (n === 1) return 'سؤال واحد';
  if (n === 2) return 'سؤالان';
  return n <= 10 ? `${num(n)} أسئلة` : `${num(n)} سؤالاً`;
}

export function MillionGame({ room, view }: { room: RoomView; view: MillionView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <Final room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Play room={room} view={view} h={h} />;
}

/* ------------------------------------------------------------------ */
/* The game in progress                                                */
/* ------------------------------------------------------------------ */

function Play({ room, view, h }: { room: RoomView; view: MillionView; h: Helpers }) {
  const cw = useContentWidth();
  const wide = cw >= 640;
  const ladderW = wide ? Math.min(dk(190), Math.round(cw * 0.27)) : 0;
  const hot = view.hot;
  const showing = SHOWING.has(view.phase) && !!view.question;
  // the friend being called: the call comes first, the question just under it
  const calledNow = showing && view.phase === 'call' && !!view.call && !view.call.done && view.call.friend === h.me;
  return (
    <>
      {calledNow ? <CallCard key={`${view.turn}:${view.step}`} view={view} h={h} /> : null}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
        <Stage style={{ flex: 1 }}>
          <SeatHeader view={view} h={h} />
          {view.phase === 'intro' ? <Intro view={view} h={h} /> : null}
          {showing ? <QuestionBlock key={`${view.turn}:${view.step}`} view={view} h={h} /> : null}
          {view.phase === 'turnEnd' ? <TurnSummary view={view} h={h} /> : null}
        </Stage>
        {wide ? (
          <View style={{ width: ladderW, justifyContent: 'center' }}>
            <Ladder step={view.step} won={view.won} active={view.phase !== 'turnEnd' && view.phase !== 'intro'} />
          </View>
        ) : null}
      </View>
      {view.phase === 'turnEnd' ? <NextTurn view={view} h={h} /> : null}
      {!wide ? <LadderBar view={view} /> : null}
      <PlayerStrip
        room={room}
        gains={false}
        active={hot ? [hot] : []}
        entries={view.players.map((id) => ({
          id,
          score: money(view.prizes[id] ?? 0),
          sub: id === hot ? 'الكرسي الساخن' : ASKING.has(view.phase) && view.answered.includes(id) ? 'جواب سرّي ✓' : `الجمهور · ${num(view.audiencePts[id] ?? 0)}`,
        }))}
      />
    </>
  );
}

/** Who sits in the hot seat, and what is at stake. */
function SeatHeader({ view, h }: { view: MillionView; h: Helpers }) {
  const p = h.player(view.hot);
  const mine = view.hot === h.me;
  return (
    <Row gap={10} style={{ alignItems: 'center' }}>
      <Avatar player={p} size={dk(44)} ring={GOLD} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="tiny" color={GOLD} numberOfLines={1}>
          الكرسي الساخن · {TOPIC_LABEL[view.topic]}
          {view.turns > 1 ? ` · الدور ${num(view.turn)} من ${num(view.turns)}` : ''}
        </Txt>
        <Txt v="bold" color="#FFFFFF" numberOfLines={1}>
          {mine ? `${p.name} (أنت)` : p.name}
        </Txt>
      </View>
      {view.phase !== 'intro' && view.phase !== 'turnEnd' ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="tiny" color={SILVER}>
            السؤال {num(view.step + 1)}
          </Txt>
          <Txt style={{ fontFamily: F.black, color: GOLD, fontSize: dk(17), lineHeight: Math.round(dk(17) * 1.45) }}>{money(MILLION_LADDER[view.step])}</Txt>
        </View>
      ) : null}
    </Row>
  );
}

function Intro({ view, h }: { view: MillionView; h: Helpers }) {
  const settled = useSettled();
  const p = h.player(view.hot);
  const mine = view.hot === h.me;
  return (
    <Animated.View entering={settled ? FadeIn.duration(400) : undefined} style={{ alignItems: 'center', gap: 6, paddingVertical: dk(18) }}>
      <View style={{ padding: 4, borderRadius: 999, borderWidth: 2, borderColor: alpha(GOLD, 0.6) }}>
        <Avatar player={p} size={dk(96)} ring={GOLD} />
      </View>
      <Txt v="display" center color={GOLD}>
        الكرسي الساخن
      </Txt>
      <Txt v="h2" center color="#FFFFFF">
        {mine ? 'دورك الآن!' : `دور ${p.name}`}
      </Txt>
      <Txt v="small" center color={SILVER}>
        خمسة عشر سؤالاً نحو {money(1_000_000)} · السؤال الأول بعد لحظات
      </Txt>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The question                                                        */
/* ------------------------------------------------------------------ */

function QuestionBlock({ view, h }: { view: MillionView; h: Helpers }) {
  const iHot = view.hot === h.me;
  const [sel, setSel] = useState<number | null>(null);
  const [walkAsk, setWalkAsk] = useState(false);
  const [pickFriend, setPickFriend] = useState(false);
  const q = view.question!;
  const asking = view.phase === 'ask';
  const chosen = iHot && asking && sel !== null && !view.removed.includes(sel) ? sel : null;
  const stateOf = (i: number): AnswerState => {
    if (view.removed.includes(i)) return 'gone';
    if (view.correct !== null) {
      if (i === view.correct) return 'right';
      if (i === view.locked) return 'wrong';
      return 'idle';
    }
    if (view.locked === i) return 'locked';
    if (chosen === i) return 'chosen';
    return 'idle';
  };
  const can: Record<MillionLifeline, boolean> = { fifty: true, audience: view.canAudience, friend: view.canFriend };
  const onLife = (l: MillionLifeline) => {
    if (l === 'friend') return setPickFriend(true);
    h.act(l);
  };
  const keep = prizeAt(view.won);
  return (
    <>
      <Clock view={view} mine={iHot} />
      <QuestionLozenge text={q.text} kicker={q.label} />
      <AnswerGrid
        options={q.options}
        stateOf={stateOf}
        mineOf={(i) => !iHot && view.myAnswer === i}
        disabled={!iHot || !asking}
        onPick={iHot && asking ? (i) => setSel(i === sel ? null : i) : undefined}
      />
      <Status view={view} h={h} chosen={chosen} />
      {iHot && asking && chosen !== null ? (
        <Row gap={8}>
          <Btn flex size="md" color={LIT} label="الإجابة النهائية؟" onPress={() => h.act('final', { choice: chosen })} />
          <Btn size="md" ghost icon="close" onPress={() => setSel(null)} />
        </Row>
      ) : null}
      {view.poll ? <PollChart counts={view.poll} removed={view.removed} /> : null}
      {view.call && !(view.phase === 'call' && !view.call.done && view.call.friend === h.me) ? <CallLine view={view} h={h} /> : null}
      {!iHot ? <AudiencePad view={view} h={h} /> : null}
      {pickFriend && iHot && asking && !view.used.friend ? <FriendPicker view={view} h={h} onClose={() => setPickFriend(false)} /> : null}
      <Lifelines used={view.used} can={can} enabled={iHot && asking} onUse={onLife} />
      {iHot && asking ? (
        <Btn size="sm" ghost icon="door" label={`انسحب بـ ${money(keep)}`} onPress={() => setWalkAsk(true)} />
      ) : null}
      <ConfirmModal
        visible={walkAsk && iHot && asking}
        icon="door"
        title={`الانسحاب بـ ${money(keep)}؟`}
        message="الجائزة لك وينتهي الدور هنا."
        confirmLabel="انسحب"
        cancelLabel="أكمل اللعب"
        onConfirm={() => {
          setWalkAsk(false);
          h.act('walk');
        }}
        onCancel={() => setWalkAsk(false)}
      />
    </>
  );
}

/** The question's clock; paused while a lifeline waits for someone. */
function Clock({ view, mine }: { view: MillionView; mine: boolean }) {
  if (view.phase === 'ask' && view.endsAt && view.timerTotal) return <TimerBar key={`${view.turn}:${view.step}`} endsAt={view.endsAt} total={view.timerTotal} onTick={mine} />;
  if ((view.phase === 'poll' || view.phase === 'call') && view.pausedLeft !== null) {
    return (
      <Row gap={6} center>
        <Icon name="clock" size={14} color={SILVER} />
        <Txt v="tiny" color={SILVER}>
          الوقت متوقف · بقي {num(Math.ceil(view.pausedLeft / 1000))} ث
        </Txt>
      </Row>
    );
  }
  return null;
}

/** One line under the answers: what happens now. */
function Status({ view, h, chosen }: { view: MillionView; h: Helpers; chosen: number | null }) {
  const settled = useSettled();
  const iHot = view.hot === h.me;
  const name = h.player(view.hot).name;
  let text = '';
  let color = SILVER;
  if (view.phase === 'ask') {
    if (iHot) text = chosen === null ? 'اختر إجابة، ثم أكّدها' : `الاختيار «${MILLION_LETTERS[chosen]}»: هل هي الإجابة النهائية؟`;
    else text = `القرار الآن بيد ${name}…`;
  } else if (view.phase === 'poll') text = `الجمهور يصوّت… الأصوات ${num(view.answered.length)} من ${num(view.audience.length)}`;
  else if (view.phase === 'call') text = '';
  else if (view.phase === 'lock' && view.locked !== null) {
    text = `الإجابة النهائية: «${MILLION_LETTERS[view.locked]}»… لحظة!`;
    color = LIT;
  } else if (view.phase === 'reveal') {
    const prize = view.outcome === 'wrong' ? safePrize(view.won) : prizeAt(view.won);
    const right = view.correct !== null ? `«${MILLION_LETTERS[view.correct]}»` : '';
    switch (view.outcome) {
      case 'right':
        text = `إجابة صحيحة! الرصيد ${money(prize)}`;
        color = RIGHT;
        break;
      case 'million':
        text = `المليون من نصيب ${name}!`;
        color = GOLD;
        break;
      case 'wrong':
        text = `إجابة خاطئة · الجائزة ${money(prize)}`;
        color = WRONG;
        break;
      case 'walk':
        text = `انسحاب بـ ${money(prize)} · الإجابة الصحيحة ${right}`;
        color = GOLD;
        break;
      case 'time':
        text = `انتهى الوقت · الجائزة ${money(prize)} · الإجابة الصحيحة ${right}`;
        color = GOLD;
        break;
      default:
        text = `انتهى الدور · الجائزة ${money(prize)}`;
    }
  }
  if (!text) return null;
  return (
    <Animated.View key={`${view.phase}:${view.outcome}`} entering={settled ? FadeIn.duration(320) : undefined}>
      <Txt v="bold" center color={color}>
        {text}
      </Txt>
    </Animated.View>
  );
}

/** «اتصل بمن؟»: the players who can take the call. */
function FriendPicker({ view, h, onClose }: { view: MillionView; h: Helpers; onClose: () => void }) {
  const can = view.audience.filter((id) => {
    const p = h.player(id);
    return p.connected !== false || !!p.bot;
  });
  return (
    <View style={[styles.card, { borderColor: alpha(GOLD, 0.6) }]}>
      <Row gap={6} style={{ alignItems: 'center' }}>
        <Txt v="bold" color="#FFFFFF" style={{ flex: 1 }}>
          اتصل بمن؟
        </Txt>
        <Btn size="sm" ghost icon="close" label="إلغاء" onPress={onClose} />
      </Row>
      <Row gap={8} wrap center>
        {can.map((id) => {
          const p = h.player(id);
          return (
            <Pressable
              key={id}
              onPress={() => {
                onClose();
                h.act('friend', { to: id });
              }}
              accessibilityRole="button"
              accessibilityLabel={`اتصل بـ${p.name}`}
              style={({ pressed }) => [{ alignItems: 'center', gap: 2, width: 76, paddingVertical: 6, borderRadius: 14, backgroundColor: pressed ? alpha(GOLD, 0.2) : alpha('#FFFFFF', 0.06) }]}>
              <Avatar player={p} size={40} />
              <Txt v="tiny" color={CREAM} numberOfLines={1}>
                {p.name}
              </Txt>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The audience                                                        */
/* ------------------------------------------------------------------ */

/** My own secret answer as the audience. */
function AudiencePad({ view, h }: { view: MillionView; h: Helpers }) {
  const callingMe = view.phase === 'call' && view.call && !view.call.done && view.call.friend === h.me;
  if (callingMe || !view.audience.includes(h.me)) return null;
  const open = ASKING.has(view.phase);
  const mine = view.myAnswer;
  const revealed = view.correct !== null;
  let line: { text: string; color: string } | null = null;
  if (revealed) {
    if (mine === null) line = { text: 'لا جواب منك على هذا السؤال', color: C.dim };
    else if (mine === view.correct) line = { text: `جوابك «${MILLION_LETTERS[mine]}» صحيح · نقطة جمهور`, color: RIGHT };
    else line = { text: `جوابك «${MILLION_LETTERS[mine]}» خاطئ`, color: WRONG };
  } else if (mine !== null) line = { text: `جوابك: «${MILLION_LETTERS[mine]}» · سرّي حتى الكشف`, color: CREAM };
  else if (!open) line = { text: 'انتهى وقت جواب الجمهور', color: C.dim };
  return (
    <View style={[styles.card, { gap: 8 }]}>
      <Row gap={6} style={{ alignItems: 'center' }}>
        <Icon name="users" size={16} color={SILVER} />
        <Txt v="tiny" color={view.phase === 'poll' && mine === null ? GOLD : SILVER} style={{ flex: 1 }}>
          {view.phase === 'poll' && mine === null ? 'سؤال للجمهور: صوّت الآن!' : `أنت في الجمهور: جوابك سرّي · ${pointsText(view.audiencePts[h.me] ?? 0)}`}
        </Txt>
        {view.phase === 'poll' ? <SecondsLeft endsAt={view.endsAt} color={GOLD} /> : null}
      </Row>
      {open && mine === null ? (
        <Row gap={8} style={{ justifyContent: 'center' }}>
          {MILLION_LETTERS.map((l, i) => {
            const gone = view.removed.includes(i);
            return (
              <Pressable
                key={l}
                disabled={gone}
                onPress={() => h.act('answer', { choice: i })}
                accessibilityRole="button"
                accessibilityLabel={`جوابي ${l}`}
                style={({ pressed }) => [padKey, { opacity: gone ? 0.25 : 1, backgroundColor: pressed ? alpha(GOLD, 0.35) : NAVY }]}>
                <Txt style={{ fontFamily: F.black, fontSize: 20, lineHeight: 30, color: GOLD }}>{l}</Txt>
              </Pressable>
            );
          })}
        </Row>
      ) : null}
      {line ? (
        <Txt v="bold" center color={line.color}>
          {line.text}
        </Txt>
      ) : null}
    </View>
  );
}

const padKey = { flex: 1, maxWidth: 72, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: alpha(GOLD, 0.6), alignItems: 'center' as const, justifyContent: 'center' as const };

/* ------------------------------------------------------------------ */
/* Phone a friend                                                      */
/* ------------------------------------------------------------------ */

/** The call in one line on the stage: waiting for the friend, or the friend's answer. */
function CallLine({ view, h }: { view: MillionView; h: Helpers }) {
  const call = view.call!;
  const friend = h.player(call.friend);
  const waiting = view.phase === 'call' && !call.done;
  return (
    <Row gap={8} style={{ alignItems: 'center', backgroundColor: alpha('#FFFFFF', 0.06), borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 }}>
      <Avatar player={friend} size={30} ring={GOLD} />
      <Txt v="bold" color={waiting ? SILVER : call.answer === null ? C.dim : CREAM} style={{ flex: 1 }}>
        {waiting
          ? `اتصال بصديق: بانتظار جواب ${friend.name}…`
          : call.answer === null
            ? `انتهت المكالمة دون جواب من ${friend.name}`
            : `جواب ${friend.name}: «${MILLION_LETTERS[call.answer]}» — ${call.sure ? 'متأكد' : 'غير متأكد'}`}
      </Txt>
      {waiting ? <SecondsLeft endsAt={call.endsAt} color={GOLD} /> : null}
    </Row>
  );
}

/** The friend's own card: the call, four letters, «متأكد» or «غير متأكد». */
function CallCard({ view, h }: { view: MillionView; h: Helpers }) {
  const call = view.call!;
  const [pick, setPick] = useState<number | null>(null);
  const friend = h.player(call.friend);
  const hotName = h.player(view.hot).name;
  const waiting = view.phase === 'call' && !call.done;
  const iFriend = call.friend === h.me;
  return (
    <View style={[styles.card, { borderColor: alpha(GOLD, 0.6) }]}>
      <Row gap={10} style={{ alignItems: 'center' }}>
        <Avatar player={friend} size={40} ring={GOLD} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="tiny" color={GOLD}>
            اتصل بصديق
          </Txt>
          <Txt v="bold" color="#FFFFFF" numberOfLines={1}>
            {iFriend ? `اتصال من ${hotName}` : friend.name}
          </Txt>
        </View>
        {waiting ? <SecondsLeft endsAt={call.endsAt} color={GOLD} /> : null}
      </Row>
      {waiting && iFriend ? (
        <>
          <Txt v="small" color={CREAM}>
            اقرأ السؤال تحت هذه البطاقة، واختر الجواب الأقرب إلى الصواب:
          </Txt>
          <Row gap={8} style={{ justifyContent: 'center' }}>
            {MILLION_LETTERS.map((l, i) => {
              const gone = view.removed.includes(i);
              const on = pick === i;
              return (
                <Pressable
                  key={l}
                  disabled={gone}
                  onPress={() => setPick(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`الجواب ${l}`}
                  accessibilityState={{ selected: on }}
                  style={[padKey, { opacity: gone ? 0.25 : 1, backgroundColor: on ? GOLD : NAVY }]}>
                  <Txt style={{ fontFamily: F.black, fontSize: 20, lineHeight: 30, color: on ? NAVY : GOLD }}>{l}</Txt>
                </Pressable>
              );
            })}
          </Row>
          {pick !== null ? (
            <Row gap={8}>
              <Btn flex size="sm" icon="check" color={RIGHT} label="متأكد" onPress={() => h.act('tell', { choice: pick, sure: true })} />
              <Btn flex size="sm" icon="question" color={LIT} label="غير متأكد" onPress={() => h.act('tell', { choice: pick, sure: false })} />
            </Row>
          ) : (
            <Txt v="tiny" center color={SILVER}>
              ثم اختر: متأكد أو غير متأكد
            </Txt>
          )}
        </>
      ) : waiting ? (
        <Txt v="small" center color={SILVER}>
          بانتظار جواب {friend.name}…
        </Txt>
      ) : call.answer === null ? (
        <Txt v="bold" center color={C.dim}>
          انتهت المكالمة دون جواب
        </Txt>
      ) : (
        <Txt v="bold" center color={CREAM}>
          جواب {friend.name}: «{MILLION_LETTERS[call.answer]}» — {call.sure ? 'متأكد' : 'غير متأكد'}
        </Txt>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The ladder on a phone                                               */
/* ------------------------------------------------------------------ */

function LadderBar({ view }: { view: MillionView }) {
  const [open, setOpen] = useState(false);
  const active = view.phase !== 'turnEnd' && view.phase !== 'intro';
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'إخفاء سلّم الجوائز' : 'عرض سلّم الجوائز'}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: NAVY, borderRadius: 14, borderWidth: 1, borderColor: alpha(GOLD, 0.35), paddingVertical: 8, paddingHorizontal: 12, opacity: pressed ? 0.85 : 1 }]}>
        <Icon name="layers" size={16} color={GOLD} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="tiny" color={SILVER} numberOfLines={1}>
            الرصيد {money(prizeAt(view.won))} · المضمون {money(safePrize(view.won))}
          </Txt>
        </View>
        <Txt v="tiny" color={GOLD}>
          {open ? 'إخفاء السلّم' : 'السلّم'}
        </Txt>
        <View style={{ transform: [{ scaleY: open ? -1 : 1 }] }}>
          <Icon name="down" size={14} color={GOLD} />
        </View>
      </Pressable>
      {open ? <Ladder step={view.step} won={view.won} active={active} compact /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Between turns and at the end                                        */
/* ------------------------------------------------------------------ */

const OUTCOME_LINE: Record<string, (won: number) => string> = {
  million: () => 'خمسة عشر سؤالاً… المليون!',
  wrong: (won) => `إجابة خاطئة عند السؤال ${num(won + 1)}`,
  walk: (won) => `انسحاب بعد ${questionsText(won)}`,
  time: (won) => `انتهى الوقت عند السؤال ${num(won + 1)}`,
  away: () => 'انتهى الدور لغياب طويل',
};

function TurnSummary({ view, h }: { view: MillionView; h: Helpers }) {
  const settled = useSettled();
  const t = view.history[view.history.length - 1];
  if (!t) return null;
  const p = h.player(t.id);
  return (
    <Animated.View entering={settled ? FadeIn.duration(360) : undefined} style={{ alignItems: 'center', gap: 4, paddingVertical: 10 }}>
      <Txt v="tiny" color={SILVER}>
        جائزة {t.id === h.me ? 'دورك' : `دور ${p.name}`}
      </Txt>
      <Txt style={{ fontFamily: F.display, color: GOLD, fontSize: dk(40), lineHeight: Math.round(dk(40) * 1.5) }}>{money(t.prize)}</Txt>
      <Txt v="small" color={CREAM} center>
        {(OUTCOME_LINE[t.outcome] ?? (() => ''))(t.won)}
      </Txt>
    </Animated.View>
  );
}

function NextTurn({ view, h }: { view: MillionView; h: Helpers }) {
  const last = view.turn >= view.turns;
  return h.isHost ? (
    <Btn size="md" icon={last ? 'trophy' : 'next'} label={last ? 'النتيجة النهائية' : 'الدور التالي'} onPress={() => h.act('next')} />
  ) : (
    <HostNote>{last ? 'النتيجة النهائية بعد قليل' : 'الدور التالي بعد قليل'}</HostNote>
  );
}

function ranked(view: MillionView): string[] {
  return [...view.players].sort((a, b) => (view.prizes[b] ?? 0) - (view.prizes[a] ?? 0) || (view.audiencePts[b] ?? 0) - (view.audiencePts[a] ?? 0));
}

function Final({ room, view, h }: { room: RoomView; view: MillionView; h: Helpers }) {
  const order = ranked(view);
  const top = order.filter((id) => (view.prizes[id] ?? 0) === (view.prizes[order[0]] ?? 0) && (view.audiencePts[id] ?? 0) === (view.audiencePts[order[0]] ?? 0));
  const won = top.includes(h.me);
  const solo = view.players.length === 1;
  const title = solo ? `الجائزة: ${money(view.prizes[order[0]] ?? 0)}` : winnerTitle(top.map((id) => h.player(id).name));
  // equal prize and audience points share a place
  const places = order.map((id) => 1 + order.findIndex((o) => view.prizes[o] === view.prizes[id] && view.audiencePts[o] === view.audiencePts[id]));
  return (
    <>
      {won && (view.prizes[h.me] ?? 0) > 0 ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="million" size={84} />} title={title} sub={solo ? 'شكراً على اللعب!' : 'الترتيب بمجموع الجوائز، ونقاط الجمهور عند التعادل'} />
      <Stage>
        {order.map((id, i) => {
          const place = places[i];
          const p = h.player(id);
          const turns = view.history.filter((t) => t.id === id);
          return (
            <Row key={id} gap={10} style={{ alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6, borderRadius: 14, backgroundColor: id === h.me ? alpha(GOLD, 0.14) : 'transparent' }}>
              <Txt style={{ fontFamily: F.black, color: place === 1 ? GOLD : SILVER, fontSize: 18, lineHeight: 26, minWidth: 22, textAlign: 'center' }}>{num(place)}</Txt>
              <Avatar player={p} size={36} ring={place === 1 ? GOLD : undefined} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="bold" color="#FFFFFF" numberOfLines={1}>
                  {p.name}
                  {id === h.me ? ' (أنت)' : ''}
                </Txt>
                <Txt v="tiny" color={SILVER} numberOfLines={1}>
                  {turns.length > 1 ? turns.map((t) => money(t.prize)).join(' + ') + ' · ' : ''}
                  {solo ? `${questionsText(turns[0]?.won ?? 0)} صحيحة` : `الجمهور: ${num(view.audiencePts[id] ?? 0)}`}
                </Txt>
              </View>
              <Txt style={{ fontFamily: F.black, color: GOLD, fontSize: 18, lineHeight: 26 }}>{money(view.prizes[id] ?? 0)}</Txt>
            </Row>
          );
        })}
      </Stage>
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = MILLION_ROUNDS.map((n) => ({ key: String(n), label: n === 1 ? 'مرة لكل لاعب' : 'مرتان لكل لاعب' }));
const TIMER_OPTIONS = MILLION_TIMERS.map((n) => ({ key: String(n), label: n === 0 ? 'بلا وقت' : `${num(n)} ثانية` }));

export function MillionSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.million;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'million', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الأسئلة</Txt>
      <ChipPicker<MillionTopic> editable={editable} value={s.topic} onChange={(v) => change({ topic: v })} options={MILLION_TOPICS} />
      <Txt v="bold">الجلوس على الكرسي الساخن</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل سؤال</Txt>
      <ChipPicker<string> editable={editable} value={String(s.timer)} onChange={(v) => change({ timer: Number(v) })} options={TIMER_OPTIONS} />
      <Row gap={8}>
        <GameArt id="million" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          الأسئلة تزداد صعوبة من 100 إلى المليون، والبقية جمهور يجيب سرّاً ويساعد عند «اسأل الجمهور».
        </Txt>
      </Row>
    </View>
  );
}
