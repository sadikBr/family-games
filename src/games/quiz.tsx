/** «مسابقة إسلامية», «من أي سورة؟» and «معلومات عامة» — same timed multiple-choice screen. */
import { StyleSheet, View } from 'react-native';

import type { McqView, RoomView } from '@/shared/protocol';
import { F } from '@/theme';
import { TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { AnsweredRow, McqFinal, McqVerdict, OptionGrid, QuestionPanel, QuestionText, ResultsList, RevealNote, RoundHeader, VERSE_INK, useMyResultFx } from './islamic-ui';

export function McqGame({ room, view }: { room: RoomView; view: McqView }) {
  const h = helpers(room);
  const playing = h.me in view.scores;
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game={view.game} h={h} />;
  if (!playing) return <Spectator room={room} />;
  const verse = view.game === 'surah';
  const total = room.settings[view.game].seconds * 1000;

  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.phase === 'ask' ? <TimerBar endsAt={view.endsAt} total={total} onTick={view.myAnswer === null} /> : null}

      <QuestionPanel id={view.round} verse={verse} kicker={verse ? 'من أي سورة هذه الآية؟' : undefined}>
        {verse ? <Txt style={styles.verse}>﴿{view.text}﴾</Txt> : <QuestionText>{view.text}</QuestionText>}
      </QuestionPanel>

      <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} onPick={(choice) => h.act('answer', { choice })} columns={verse ? 2 : 1} />

      {view.phase === 'ask' ? (
        <AnsweredRow ids={view.answered} total={Object.keys(view.scores).length} h={h} />
      ) : (
        <View style={{ gap: 10 }}>
          <McqVerdict mine={mine} />
          <RevealNote text={view.ref} />
          {view.results ? <ResultsList results={view.results} h={h} options={view.options} scores={view.scores} /> : null}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  verse: { fontFamily: F.quran, fontSize: 24, lineHeight: 50, color: VERSE_INK, textAlign: 'center', writingDirection: 'rtl' },
});
