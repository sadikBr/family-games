import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/art/icons';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import { GAME_LETTERS, displayLetter, firstLetter, startsWithLetter } from '@/shared/arabic';
import { NAMES_CATEGORIES, type NamesCell, type NamesView, type RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti, Podium, PopIn, Scoreboard, Shake, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

const CATS = NAMES_CATEGORIES;
const CAT_ICON: Record<string, { icon: IconName; color: string }> = {
  boy: { icon: 'user', color: C.blue },
  girl: { icon: 'user', color: C.pink },
  animal: { icon: 'paw', color: C.orange },
  plant: { icon: 'leaf', color: C.green },
  thing: { icon: 'box', color: C.purple },
  country: { icon: 'globe', color: C.cyan },
  job: { icon: 'hand', color: C.yellow },
};

function CatMark({ k }: { k: string }) {
  const m = CAT_ICON[k] ?? { icon: 'star', color: C.surfaceStrong };
  return (
    <View style={[styles.catMark, { backgroundColor: m.color }]}>
      <Icon name={m.icon} size={16} color="#FFFFFF" />
    </View>
  );
}

function LetterBadge({ letter, size = 84 }: { letter: string; size?: number }) {
  return (
    <View style={[styles.letter, { width: size, height: size, borderRadius: size / 2 }]}>
      <Txt style={{ fontFamily: F.display, fontSize: size * 0.62, lineHeight: size * 0.95, color: C.ink }}>{letter}</Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Spin                                                                */
/* ------------------------------------------------------------------ */

function Spin({ view }: { view: NamesView }) {
  const left = useCountdown(view.endsAt, 70);
  const landed = left < 700;
  const shown = landed ? view.letter : displayLetter(GAME_LETTERS[Math.floor(left / 85) % GAME_LETTERS.length]);
  return (
    <View style={{ alignItems: 'center', gap: 16, paddingTop: 30 }}>
      <Txt v="h2">الجولة {view.round} من {view.totalRounds}</Txt>
      <Txt v="title">ما هو الحرف؟</Txt>
      {landed ? (
        <PopIn k="landed">
          <LetterBadge letter={shown} size={190} />
        </PopIn>
      ) : (
        <View style={{ opacity: 0.85 }}>
          <LetterBadge letter={shown} size={190} />
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

function Write({ room, view, h }: { room: RoomView; view: NamesView; h: Helpers }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...view.myAnswers }));
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const locked = view.phase === 'stopping';
  const target = firstLetter(view.letter);

  const send = (cat: string, text: string) => client.act({ type: 'answer', cat, text });

  // when STOP is called: flush everything right away
  useEffect(() => {
    if (!locked) return;
    for (const t of Object.values(timers.current)) clearTimeout(t);
    for (const c of CATS) send(c.key, answers[c.key] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const change = (cat: string, text: string) => {
    if (locked) return;
    setAnswers((a) => ({ ...a, [cat]: text }));
    clearTimeout(timers.current[cat]);
    timers.current[cat] = setTimeout(() => send(cat, text), 350);
  };

  const filled = CATS.filter((c) => (answers[c.key] ?? '').trim()).length;
  const allFilled = filled === CATS.length;
  const others = view.participants.filter((id) => id !== h.me);
  const stopper = view.stoppedBy ? h.player(view.stoppedBy) : null;
  const stopMode = room.settings.names.stop;
  const iAmDone = view.done.includes(h.me);

  return (
    <>
      <Row gap={12}>
        <LetterBadge letter={view.letter} size={70} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="tiny" color={C.muted}>
            الجولة {view.round} من {view.totalRounds} · كل الأجوبة تبدأ بـ «{view.letter}»
          </Txt>
          {locked ? null : <TimerBar endsAt={view.endsAt} total={room.settings.names.seconds * 1000} onTick />}
        </View>
      </Row>

      {/* live progress of the others */}
      <Row wrap gap={10} center>
        {others.map((id) => (
          <View key={id} style={{ alignItems: 'center' }}>
            <Avatar player={h.player(id)} size={36} badge={view.done.includes(id) ? 'check' : undefined} />
            <Txt v="tiny" color={view.progress[id] === CATS.length ? C.green : C.muted}>
              {view.progress[id]}/{CATS.length}
            </Txt>
          </View>
        ))}
      </Row>

      {locked ? (
        <ResultBanner tone="bad" title="ستوب" sub={`${stopper ? `${stopper.name} قال ستوب` : 'انتهى الوقت'} · ارفعوا الأقلام`} />
      ) : null}

      {CATS.map((c) => {
        const val = answers[c.key] ?? '';
        const good = val.trim().length > 0 && startsWithLetter(val, target);
        const bad = val.trim().length > 0 && !good;
        const article = bad && /^\s*ال/.test(val);
        return (
          <View key={c.key}>
            <View style={[styles.field, good && { borderColor: C.green }, bad && { borderColor: C.red }]}>
              <Row gap={8}>
                <CatMark k={c.key} />
                <Txt v="bold" style={{ flex: 1 }}>
                  {c.label}
                </Txt>
                {good ? (
                  <Icon name="check" size={18} color={C.green} />
                ) : bad ? (
                  <Txt v="tiny" color={C.red}>
                    {article ? 'بدون «ال»' : `لا يبدأ بـ «${view.letter}»`}
                  </Txt>
                ) : null}
              </Row>
              <Field
                value={val}
                onChangeText={(t) => change(c.key, t)}
                editable={!locked}
                placeholder={`${view.letter}…`}
                placeholderTextColor={C.dim}
                style={styles.input}
                maxLength={30}
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>
        );
      })}

      {!locked && iAmDone ? (
        <Txt v="bold" center color={C.green}>
          أنهيت — في انتظار نهاية الوقت أو انتهاء الجميع (يمكنك التعديل حتى ذلك الحين)
        </Txt>
      ) : null}
      {!locked && !iAmDone ? (
        <Btn
          size="xl"
          icon={stopMode ? 'hand' : 'check'}
          label={stopMode ? (allFilled ? 'ستوب' : `ستوب (${filled}/${CATS.length})`) : allFilled ? 'أنهيت' : `أنهيت (${filled}/${CATS.length})`}
          color={stopMode ? C.red : C.green}
          disabled={!allFilled}
          onPress={() => {
            haptic.heavy();
            for (const t of Object.values(timers.current)) clearTimeout(t);
            for (const c of CATS) send(c.key, answers[c.key] ?? '');
            client.act({ type: 'stop' });
          }}
        />
      ) : null}
      {!locked && h.isHost ? (
        <Btn size="sm" ghost icon="stop" label="أوقف الجولة للجميع" onPress={() => client.act({ type: 'forceStop' })} />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Review & results                                                    */
/* ------------------------------------------------------------------ */

const VERDICT: Record<NamesCell['verdict'], { icon: IconName; color: string; note?: string }> = {
  ok: { icon: 'check', color: C.green },
  empty: { icon: 'minus', color: C.dim, note: 'فارغ' },
  letter: { icon: 'close', color: C.red, note: 'حرف خاطئ' },
  rejected: { icon: 'thumbDown', color: C.red, note: 'مرفوض' },
};

function CategoryBoard({ view, h, cat }: { view: NamesView; h: Helpers; cat: (typeof CATS)[number] }) {
  const reviewing = view.phase === 'review';
  return (
      <Card style={{ gap: 6 }}>
        <Row gap={8}>
          <CatMark k={cat.key} />
          <Txt v="h3">{cat.label}</Txt>
        </Row>
        {view.participants.map((id) => {
          const cell = view.board![id][cat.key];
          const mine = id === h.me;
          const iRejected = cell.rejects.includes(h.me);
          const canVote = reviewing && !mine && cell.verdict !== 'empty' && cell.verdict !== 'letter' && !h.player(h.me).bot;
          const v = VERDICT[cell.verdict];
          return (
            <Pressable
              key={id}
              disabled={!canVote}
              onPress={() => {
                haptic.tap();
                client.act({ type: 'reject', player: id, cat: cat.key });
              }}>
              <Row
                gap={8}
                style={[
                  styles.cell,
                  cell.verdict === 'ok' && { backgroundColor: alpha(C.green, 0.14) },
                  cell.verdict !== 'ok' && { backgroundColor: C.bg2 },
                  iRejected && { borderColor: C.red, borderWidth: 2 },
                ]}>
                <Avatar player={h.player(id)} size={30} />
                <Txt
                  v="bold"
                  style={{ flex: 1, textDecorationLine: cell.verdict === 'rejected' ? 'line-through' : 'none' }}
                  color={cell.verdict === 'ok' ? C.text : C.dim}
                  numberOfLines={1}>
                  {cell.text || '—'}
                </Txt>
                {cell.rejects.length && cell.verdict !== 'letter' ? (
                  <Row gap={3}>
                    <Icon name="thumbDown" size={13} color={C.red} />
                    <Txt v="tiny" color={C.red}>
                      {cell.rejects.length}
                    </Txt>
                  </Row>
                ) : null}
                {v.note ? (
                  <Txt v="tiny" color={C.muted}>
                    {v.note}
                  </Txt>
                ) : null}
                {cell.points !== null ? (
                  <View style={[styles.points, { backgroundColor: cell.points === 10 ? C.green : cell.points === 5 ? C.yellow : C.surfaceStrong }]}>
                    <Txt v="tiny" color={cell.points ? C.ink : C.muted}>
                      +{cell.points}
                    </Txt>
                  </View>
                ) : (
                  <Icon name={v.icon} size={18} color={v.color} />
                )}
              </Row>
            </Pressable>
          );
        })}
      </Card>
  );
}

/* ------------------------------------------------------------------ */

export function NamesGame({ room, view }: { room: RoomView; view: NamesView }) {
  const h = helpers(room);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;

  switch (view.phase) {
    case 'spin':
      return <Spin view={view} />;

    case 'write':
    case 'stopping':
      return (
        <Shake trigger={view.phase === 'stopping' ? view.round : null}>
          <View style={{ gap: 14 }}>
            <Write key={view.round} room={room} view={view} h={h} />
          </View>
        </Shake>
      );

    case 'review':
      return (
        <>
          <PhaseTitle art={<LetterBadge letter={view.letter} size={64} />} title="المراجعة" sub="اضغط على جواب تراه غلطاً للتصويت ضده" />
          <Txt v="small" center color={C.dim}>
            جواب فريد = 10 · مكرر = 5
          </Txt>
          {CATS.map((c) => (
            <CategoryBoard key={c.key} view={view} h={h} cat={c} />
          ))}
          {h.isHost ? (
            <Btn size="xl" icon="calc" label="احسب النقاط" color={C.green} onPress={() => client.act({ type: 'score' })} />
          ) : (
            <HostNote>المضيف يحسب النقاط عندما تنتهون من المراجعة</HostNote>
          )}
        </>
      );

    case 'results': {
      const best = Math.max(...view.participants.map((id) => view.roundPoints?.[id] ?? 0));
      const iWon = (view.roundPoints?.[h.me] ?? 0) === best && best > 0;
      return (
        <>
          {iWon ? <Confetti burst={view.round} /> : null}
          <PhaseTitle icon="trophy" title={`نتيجة الجولة ${view.round}`} />
          <Card>
            <Txt v="h3">نقاط هذه الجولة</Txt>
            <Scoreboard players={room.players} scores={view.roundPoints ?? {}} highlight={h.me} />
          </Card>
          {CATS.map((c) => (
            <CategoryBoard key={c.key} view={view} h={h} cat={c} />
          ))}
          <Card>
            <Txt v="h3">المجموع</Txt>
            <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
          </Card>
          {h.isHost ? (
            <Btn size="xl" icon="play" label={view.round >= view.totalRounds ? 'النتيجة النهائية' : 'الجولة التالية'} color={C.green} onPress={() => client.act({ type: 'next' })} />
          ) : (
            <HostNote>المضيف يبدأ الجولة التالية</HostNote>
          )}
        </>
      );
    }

    case 'final':
      return (
        <>
          <Confetti />
          <PhaseTitle icon="trophy" title="أبطال الحروف" />
          <Podium players={room.players} scores={view.scores} />
          <Card>
            <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
          </Card>
          <PlayAgain room={room} />
        </>
      );
  }
}

const styles = StyleSheet.create({
  letter: {
    backgroundColor: C.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catMark: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  field: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 12,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  input: {
    fontFamily: F.bold,
    fontSize: 19,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    writingDirection: 'rtl',
  },
  cell: { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: 'transparent' },
  points: { borderRadius: 999, paddingHorizontal: 8, minWidth: 40, alignItems: 'center' },
});
