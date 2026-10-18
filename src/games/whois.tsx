/**
 * «من هو؟» — clues appear one at a time; earlier = more points. Either pick from the options (one
 * guess), or — with «typed» on — write the name, with a new try at every clue.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useCountdown } from '@/lib/time';
import type { RoomView, WhoisView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, McqFinal, McqVerdict, MyVerdict, OptionGrid, QuestionPanel, ResultsList, RevealNote, RoundHeader, useMyResultFx } from './islamic-ui';

const POINTS = [400, 300, 200, 100];

export function WhoisGame({ room, view }: { room: RoomView; view: WhoisView }) {
  const h = helpers(room);
  const accent = useAccent();
  const next = useCountdown(view.nextClueAt ?? view.endsAt, 250);
  const mine = view.results?.find((r) => r.id === h.me);
  // options: right / wrong sounds at the reveal; typed: the moment you send a name
  useMyResultFx(!view.typed && view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  useMyResultFx(view.typed && view.myGuess !== null ? `${view.round}:ok` : null, true);
  useMyResultFx(view.typed && view.myTries.length ? `${view.round}:${view.myTries.length}` : null, false);
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="whois" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;
  const asking = view.phase === 'ask';
  const worth = POINTS[Math.min(view.clues.length, 4) - 1];
  const lastClue = view.clues.length >= view.totalClues;

  return (
    <>
      <RoundHeader label={`من هو؟ — ${view.label}`} round={view.round} rounds={view.rounds} />

      <QuestionPanel
        id={view.round}
        below={
          asking ? (
            <Row gap={6} center style={{ paddingTop: 2 }}>
              {Array.from({ length: view.totalClues }, (_, i) => (
                <View key={i} style={[styles.dot, i < view.clues.length && { backgroundColor: accent }]} />
              ))}
              <Txt v="tiny" color={C.muted}>
                {view.nextClueAt ? `التلميح التالي بعد ${num(Math.ceil(next / 1000))} ث` : `آخر فرصة: ${num(Math.ceil(next / 1000))} ث`}
              </Txt>
            </Row>
          ) : null
        }>
        {view.clues.map((c, i) => {
          const fresh = i === view.clues.length - 1 && asking;
          return (
            <Animated.View key={`${view.round}:${i}`} entering={FadeIn.duration(260)} style={[styles.clue, fresh && { backgroundColor: alpha(accent, 0.2) }]}>
              <View style={[styles.clueNum, { backgroundColor: fresh ? accent : alpha(accent, 0.35) }]}>
                <Txt style={styles.clueNumText}>{num(i + 1)}</Txt>
              </View>
              <Txt v="bold" style={{ flex: 1 }} color={fresh || !asking ? C.text : C.muted}>
                {c}
              </Txt>
            </Animated.View>
          );
        })}
      </QuestionPanel>

      {view.typed ? (
        <TypedAnswer view={view} h={h} worth={worth} lastClue={lastClue} />
      ) : (
        <>
          {asking && view.myGuess === null ? (
            <Txt v="small" center color={C.yellow}>
              خمّن الآن واربح {num(worth)} نقطة — لك محاولة واحدة فقط
            </Txt>
          ) : null}
          <OptionGrid options={view.options} mine={view.myGuess} correct={view.answer} onPick={(choice) => h.act('guess', { choice })} />
        </>
      )}

      {asking ? (
        <AnsweredRow ids={view.guessed} total={Object.keys(view.scores).length} h={h} />
      ) : view.results ? (
        <View style={{ gap: 10 }}>
          <McqVerdict mine={mine} />
          <ResultsList results={view.results} h={h} options={view.options} scores={view.scores} />
        </View>
      ) : null}
    </>
  );
}

function TypedAnswer({ view, h, worth, lastClue }: { view: WhoisView; h: Helpers; worth: number; lastClue: boolean }) {
  // the box empties for each new round and after each miss
  const key = `${view.round}:${view.myTries.length}`;
  const [draft, setDraft] = useState({ key: '', text: '' });
  const text = draft.key === key ? draft.text : '';
  const send = () => {
    if (!text.trim()) return;
    h.act('guess', { text: text.trim() });
    setDraft({ key, text: '' });
  };

  if (view.phase !== 'ask') {
    return view.answerName ? (
      <RevealNote kicker="الجواب" text={view.answerName} big />
    ) : null;
  }
  if (view.myGuess !== null) {
    return (
      <View style={{ gap: 4 }}>
        <MyVerdict tone="good" text="أصبت!" />
        <Txt v="tiny" center color={C.muted}>
          انتظر حتى يجيب الآخرون
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {view.myTries.length ? (
        <Row gap={6} center wrap>
          {view.myTries.map((t, i) => (
            <Animated.View key={i} entering={FadeIn.duration(180)} style={styles.miss}>
              <Txt v="tiny" color={C.red} style={{ textDecorationLine: 'line-through' }}>
                {t}
              </Txt>
            </Animated.View>
          ))}
        </Row>
      ) : null}
      {view.locked ? (
        <Txt v="small" center color={C.orange}>
          {lastClue ? 'ليس هو — انتهت محاولاتك في هذه الجولة' : 'ليس هو — جرّب مرة أخرى مع التلميح التالي'}
        </Txt>
      ) : (
        <>
          <Txt v="small" center color={C.yellow}>
            اكتب الاسم الآن واربح {num(worth)} نقطة
          </Txt>
          <Row gap={8}>
            <Field
              value={text}
              onChangeText={(t) => setDraft({ key, text: t })}
              onSubmitEditing={send}
              placeholder="من هو؟ اكتب الاسم"
              placeholderTextColor={C.dim}
              autoCorrect={false}
              maxLength={60}
              returnKeyType="send"
              style={styles.input}
            />
            <Btn size="md" icon="check" label="أرسل" disabled={!text.trim()} onPress={send} />
          </Row>
          <Txt v="tiny" center color={C.dim}>
            الأخطاء الإملائية الصغيرة مقبولة
          </Txt>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clue: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8 },
  clueNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  clueNumText: { fontFamily: F.black, fontSize: 13, lineHeight: 18, color: '#FFFFFF' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.surfaceStrong },
  input: { flex: 1, minWidth: 0, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontFamily: F.bold, fontSize: 17, borderWidth: 2, borderColor: C.yellow },
  miss: { backgroundColor: alpha(C.red, 0.12), borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
});
