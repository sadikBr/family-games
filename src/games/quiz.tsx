/** «مسابقة إسلامية», «من أي سورة؟» and «معلومات عامة» — same timed multiple-choice screen. */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { McqView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { AnsweredRow, McqFinal, OptionGrid, ResultsList, RoundHeader } from './islamic-ui';

export function McqGame({ room, view }: { room: RoomView; view: McqView }) {
  const h = helpers(room);
  const playing = h.me in view.scores;
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game={view.game} h={h} />;
  if (!playing) return <Spectator room={room} />;
  const verse = view.game === 'surah';
  const total = room.settings[view.game].seconds * 1000;

  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.phase === 'ask' ? <TimerBar endsAt={view.endsAt} total={total} onTick /> : null}

      <Animated.View key={view.round} entering={FadeIn.duration(220)} style={[styles.card, verse && styles.verseCard]}>
        {verse ? (
          <>
            <Txt v="tiny" center color={alpha('#FFFFFF', 0.6)}>
              من أي سورة هذه الآية؟
            </Txt>
            <Txt style={styles.verse}>﴿{view.text}﴾</Txt>
          </>
        ) : (
          <Txt v="h2" center>
            {view.text}
          </Txt>
        )}
      </Animated.View>

      <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} onPick={(choice) => h.act('answer', { choice })} columns={verse ? 2 : 1} />

      {view.phase === 'ask' ? (
        <AnsweredRow ids={view.answered} total={Object.keys(view.scores).length} h={h} />
      ) : (
        <View style={{ gap: 8 }}>
          {view.ref ? (
            <Txt v="bold" center color={C.yellow}>
              {view.ref}
            </Txt>
          ) : null}
          {view.results ? <ResultsList results={view.results} h={h} options={view.options} /> : null}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: 22, padding: 18, gap: 8, minHeight: 110, justifyContent: 'center' },
  verseCard: { backgroundColor: '#0F4D3A', borderWidth: 2, borderColor: alpha('#F4C02E', 0.5) },
  verse: { fontFamily: F.quran, fontSize: 24, lineHeight: 50, color: '#FFF8E6', textAlign: 'center', writingDirection: 'rtl' },
});
