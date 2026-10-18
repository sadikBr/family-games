import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import { GAME_LETTERS, displayLetter, firstLetter, startsWithLetter } from '@/shared/arabic';
import { NAMES_CATEGORIES, type NamesCell, type NamesView, type RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti, Podium, PopIn, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';

const CATS = NAMES_CATEGORIES;
const CAT_ICON: Record<string, IconName> = {
  boy: 'user',
  girl: 'user',
  animal: 'paw',
  plant: 'leaf',
  thing: 'box',
  country: 'globe',
  job: 'hand',
};

/** The category's icon, in the game's colour (one calm colour for all of them). */
function CatMark({ k }: { k: string }) {
  const accent = useAccent();
  return (
    <View style={[styles.catMark, { backgroundColor: alpha(accent, 0.18) }]}>
      <Icon name={CAT_ICON[k] ?? 'star'} size={16} color={accent} />
    </View>
  );
}

/** The round's letter on a disc of the game's colour. */
function LetterBadge({ letter, size = 84 }: { letter: string; size?: number }) {
  const accent = useAccent();
  return (
    <View style={[styles.letter, { width: size, height: size, borderRadius: size / 2, backgroundColor: accent }]}>
      <Txt style={{ fontFamily: F.display, fontSize: size * 0.62, lineHeight: size * 0.95, color: '#FFFFFF' }}>{letter}</Txt>
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
      <RoundHeader label={`الجولة ${num(view.round)} من ${num(view.totalRounds)}`} round={0} rounds={0} />
      <Txt v="display">ما هو الحرف؟</Txt>
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
            الجولة {num(view.round)} من {num(view.totalRounds)} · كل الأجوبة تبدأ بـ «{view.letter}»
          </Txt>
          {locked ? null : <TimerBar endsAt={view.endsAt} total={room.settings.names.seconds * 1000} onTick />}
        </View>
      </Row>

      {/* live progress of the others */}
      <PlayerStrip
        room={room}
        entries={others.map((id) => ({
          id,
          score: num(`${view.progress[id] ?? 0}/${CATS.length}`),
          sub: view.done.includes(id) ? 'اكتملت الأجوبة' : undefined,
        }))}
      />

      {locked ? (
        <ResultBanner tone="bad" title="ستوب" sub={`${stopper ? `${stopper.name} قال «ستوب»` : 'انتهى الوقت'} · ارفعوا الأقلام`} />
      ) : null}

      {CATS.map((c) => {
        const val = answers[c.key] ?? '';
        const good = val.trim().length > 0 && startsWithLetter(val, target);
        const bad = val.trim().length > 0 && !good;
        const article = bad && /^\s*ال/.test(val);
        // the server's dictionary verdict, as long as it is about what is in the box now
        const unknown = good && view.myUnknown.includes(c.key) && (view.myAnswers[c.key] ?? '') === val;
        return (
          <View key={c.key}>
            <View style={[styles.field, good && { borderColor: unknown ? C.orange : C.green }, bad && { borderColor: C.red }]}>
              <Row gap={8}>
                <CatMark k={c.key} />
                <Txt v="bold" style={{ flex: 1 }}>
                  {c.label}
                </Txt>
                {unknown ? (
                  <Icon name="question" size={18} color={C.orange} />
                ) : good ? (
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
              {unknown ? (
                <Txt v="tiny" color={C.orange}>
                  {view.dict === 'strict' ? 'ليست في القاموس: تأكد من الإملاء أو قد تُحسب خطأ' : 'ليست في القاموس — تأكد من الإملاء'}
                </Txt>
              ) : null}
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
          disabled={stopMode && !allFilled}
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
  unknown: { icon: 'question', color: C.orange, note: 'ليست في القاموس' },
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
          // strict check: a word the dictionary doesn't know is voted IN (keep) rather than out
          const keepVote = view.dict === 'strict' && cell.unknown;
          const iKept = cell.keeps.includes(h.me);
          const canVote = reviewing && !mine && cell.verdict !== 'empty' && cell.verdict !== 'letter' && !h.player(h.me).bot;
          const v = VERDICT[cell.verdict];
          // warn mode, or a kept unknown word: a small dictionary mark next to the answer
          const dictMark = cell.unknown && cell.verdict !== 'unknown' && cell.verdict !== 'letter' && cell.verdict !== 'empty';
          return (
            <Pressable
              key={id}
              disabled={!canVote}
              accessibilityHint={canVote ? (keepVote ? 'اضغط لقبول الكلمة رغم أنها ليست في القاموس' : 'اضغط للتصويت ضد هذا الجواب') : undefined}
              onPress={() => {
                haptic.tap();
                client.act({ type: keepVote ? 'keep' : 'reject', player: id, cat: cat.key });
              }}>
              <Row
                gap={8}
                style={[
                  styles.cell,
                  cell.verdict === 'ok' && { backgroundColor: alpha(C.green, 0.14) },
                  cell.verdict !== 'ok' && { backgroundColor: C.bg2 },
                  iRejected && !keepVote && { borderColor: C.red, borderWidth: 2 },
                  iKept && keepVote && { borderColor: C.green, borderWidth: 2 },
                ]}>
                <Avatar player={h.player(id)} size={30} />
                <Txt
                  v="bold"
                  style={{ flex: 1, textDecorationLine: cell.verdict === 'rejected' ? 'line-through' : 'none' }}
                  color={cell.verdict === 'ok' ? C.text : C.dim}
                  numberOfLines={1}>
                  {cell.text || '—'}
                </Txt>
                {dictMark ? <Icon name="question" size={14} color={C.orange} /> : null}
                {keepVote && cell.keeps.length ? (
                  <Row gap={3}>
                    <Icon name="check" size={13} color={C.green} />
                    <Txt v="tiny" color={C.green}>
                      {cell.keeps.length}
                    </Txt>
                  </Row>
                ) : null}
                {!keepVote && cell.rejects.length && cell.verdict !== 'letter' ? (
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
                      {num(`+${cell.points}`)}
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
        <View style={{ gap: 14 }}>
          <Write key={view.round} room={room} view={view} h={h} />
        </View>
      );

    case 'review':
      return (
        <>
          <PhaseTitle art={<LetterBadge letter={view.letter} size={64} />} title="المراجعة" sub={view.dict === 'strict' ? 'اضغط على جواب تراه خاطئاً للتصويت ضده — وعلى كلمة «؟» لقبولها رغم القاموس' : 'اضغط على جواب تراه خاطئاً للتصويت ضده'} />
          <Txt v="small" center color={C.dim}>
            جواب فريد = {num(10)} · مكرر = {num(5)}
          </Txt>
          {CATS.map((c) => (
            <CategoryBoard key={c.key} view={view} h={h} cat={c} />
          ))}
          {h.isHost ? (
            <Btn size="xl" icon="calc" label="احسب النقاط" onPress={() => client.act({ type: 'score' })} />
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
          <PhaseTitle icon="trophy" title={`نتيجة الجولة ${num(view.round)}`} sub="المجموع، وتحت كل اسم نقاط هذه الجولة" />
          <PlayerStrip
            room={room}
            entries={view.participants.map((id) => ({ id, score: view.scores[id] ?? 0, sub: num(`+${view.roundPoints?.[id] ?? 0}`) }))}
            active={best > 0 ? view.participants.filter((id) => (view.roundPoints?.[id] ?? 0) === best) : []}
          />
          {CATS.map((c) => (
            <CategoryBoard key={c.key} view={view} h={h} cat={c} />
          ))}
          {h.isHost ? (
            <Btn size="xl" icon={view.round >= view.totalRounds ? 'trophy' : 'play'} label={view.round >= view.totalRounds ? 'النتيجة النهائية' : 'الجولة التالية'} onPress={() => client.act({ type: 'next' })} />
          ) : (
            <HostNote>المضيف يبدأ الجولة التالية</HostNote>
          )}
        </>
      );
    }

    case 'final': {
      const scores = Object.fromEntries(view.participants.map((id) => [id, view.scores[id] ?? 0]));
      const best = Math.max(0, ...Object.values(scores));
      const winners = Object.keys(scores).filter((id) => scores[id] === best);
      const won = winners.includes(h.me);
      return (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<GameArt id="names" size={84} />}
            title={winners.length === 1 ? `الفوز ${li(h.player(winners[0]).name)}` : 'تعادل!'}
            sub="أبطال الحروف"
          />
          <Podium players={room.players} scores={scores} />
          <Scoreboard players={room.players} scores={scores} highlight={h.me} />
          <PlayAgain room={room} />
        </>
      );
    }
  }
}

const styles = StyleSheet.create({
  letter: {
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
