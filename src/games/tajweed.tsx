/** «مسابقة التجويد» — the screen: the verse with the coloured spot, the rules to choose from, the reason. */
import { StyleSheet, Text, View } from 'react-native';

import { client } from '@/lib/client';
import { TAJWEED_QUESTION, TAJWEED_TOPICS, type TajweedSettings as Settings, type TajweedView } from '@/shared/games/tajweed';
import type { RoomView } from '@/shared/protocol';
import { F } from '@/theme';
import { ChipPicker, Stepper } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { AnsweredRow, McqVerdict, OptionGrid, QuestionPanel, QuizFinal, ResultsList, RevealNote, RoundHeader, VERSE_INK, useMyResultFx } from './islamic-ui';

const MARK = '#FFC93C';

/** The verse: Uthmani text, the coloured words in saffron. */
function Verse({ view }: { view: TajweedView }) {
  const [a, b] = view.hl;
  return (
    <Txt style={styles.verse}>
      {'﴿'}
      {view.cutStart ? '… ' : ''}
      {view.words.map((w, i) => (
        <Text key={i}>
          {i > 0 ? ' ' : ''}
          <Text style={i >= a && i <= b ? styles.mark : undefined}>{w}</Text>
        </Text>
      ))}
      {view.cutEnd ? ' …' : ''}
      {'﴾'}
    </Txt>
  );
}

export function TajweedGame({ room, view }: { room: RoomView; view: TajweedView }) {
  const h = helpers(room);
  const playing = h.me in view.scores;
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);

  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="tajweed" h={h} sub="زادكم الله علماً وحسن تلاوة" />;
  if (!playing) return <Spectator room={room} />;

  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.phase === 'ask' ? <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={view.myAnswer === null} /> : null}

      <QuestionPanel id={view.round} verse kicker={TAJWEED_QUESTION[view.topic]}>
        <Verse view={view} />
      </QuestionPanel>

      <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} onPick={(choice) => h.act('answer', { choice })} columns={2} />

      {view.phase === 'ask' ? (
        <AnsweredRow ids={view.answered} total={Object.keys(view.scores).length} h={h} />
      ) : (
        <View style={{ gap: 10 }}>
          <McqVerdict mine={mine} />
          <RevealNote text={view.why} sub={view.ref} />
          {view.results ? <ResultsList results={view.results} h={h} options={view.options} scores={view.scores} /> : null}
        </View>
      )}
    </>
  );
}

/** Lobby settings: topic, questions, time. */
export function TajweedSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.tajweed;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'tajweed', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الموضوع</Txt>
      <ChipPicker options={TAJWEED_TOPICS} value={settings.topic} editable={editable} onChange={(topic) => change({ topic })} />
      <Stepper label="عدد الأسئلة" value={settings.rounds} min={5} max={30} step={5} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Stepper label="وقت السؤال" value={settings.seconds} min={10} max={40} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${v} ث`} />
    </View>
  );
}

const styles = StyleSheet.create({
  verse: { fontFamily: F.quran, fontSize: 26, lineHeight: 56, color: VERSE_INK, textAlign: 'center', writingDirection: 'rtl' },
  mark: { color: MARK },
});
