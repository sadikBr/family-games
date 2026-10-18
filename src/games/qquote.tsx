/** «من القائل؟» — the quoted words (Amiri Quran font), four names, and the reference after the answer. */
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { client } from '@/lib/client';
import { QQUOTE_LEVELS, QQUOTE_ROUNDS, QQUOTE_SECONDS, type QquoteSettings as Settings, type QquoteView } from '@/shared/games/qquote';
import type { RoomView } from '@/shared/protocol';
import { F } from '@/theme';
import { ChipPicker, Stepper } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { AnsweredRow, McqFinal, McqVerdict, OptionGrid, QuestionPanel, ResultsList, RevealNote, RoundHeader, VERSE_INK, useMyResultFx } from './islamic-ui';

export function QquoteGame({ room, view }: { room: RoomView; view: QquoteView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="qquote" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;

  // long quotes get a smaller font so they fit without scrolling much
  const words = view.text.split(' ').length;
  const base = width < 360 ? 21 : 24;
  const size = words > 22 ? base - 3 : words > 14 ? base - 1 : base;

  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.phase === 'ask' ? <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={view.myAnswer === null} /> : null}

      <QuestionPanel id={view.round} verse kicker="من القائل؟">
        <Txt style={[styles.verse, { fontSize: size, lineHeight: size * 2.05 }]}>﴿{view.text}﴾</Txt>
      </QuestionPanel>

      <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} onPick={(choice) => h.act('answer', { choice })} columns={1} />

      {view.phase === 'ask' ? (
        <AnsweredRow ids={view.answered} total={Object.keys(view.scores).length} h={h} />
      ) : view.results ? (
        <View style={{ gap: 10 }}>
          <McqVerdict mine={mine} />
          <RevealNote text={view.correct !== null ? `القائل: ${view.options[view.correct]}` : null} sub={view.ref} />
          <ResultsList results={view.results} h={h} options={view.options} scores={view.scores} />
        </View>
      ) : null}
    </>
  );
}

/** Lobby settings: level, number of questions, seconds per question. */
export function QquoteSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.qquote;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'qquote', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">المستوى</Txt>
      <ChipPicker options={QQUOTE_LEVELS} value={s.level} editable={editable} onChange={(level) => change({ level })} />
      <Stepper label="عدد الأسئلة" value={s.rounds} {...QQUOTE_ROUNDS} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Stepper label="وقت السؤال" value={s.seconds} {...QQUOTE_SECONDS} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${num(v)} ث`} />
    </View>
  );
}

const styles = StyleSheet.create({
  verse: { fontFamily: F.quran, color: VERSE_INK, textAlign: 'center', writingDirection: 'rtl' },
});
