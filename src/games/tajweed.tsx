/** «مسابقة التجويد» — the screen: the verse with the coloured spot, the rules to choose from, the reason. */
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { TAJWEED_QUESTION, TAJWEED_TOPICS, type TajweedSettings as Settings, type TajweedView } from '@/shared/games/tajweed';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { IconBubble } from '@/ui/bits';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { AnsweredRow, OptionGrid, ResultsList, RoundHeader, useMyResultFx } from './islamic-ui';

const GREEN = '#0F4D3A';
const INK = '#FFF8E6';
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

  if (view.phase === 'final') {
    const best = Math.max(...Object.values(view.scores));
    const winners = Object.keys(view.scores).filter((id) => view.scores[id] === best);
    const won = winners.includes(h.me);
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<IconBubble icon="book" size={64} color={alpha('#FFFFFF', 0.16)} iconColor={MARK} />}
          title={winners.length === 1 ? `فاز ${h.player(winners[0]).name}` : 'تعادل!'}
          sub="زادكم الله علماً وحسن تلاوة"
        />
        <Podium players={room.players} scores={view.scores} />
        <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
        <PlayAgain room={room} />
      </>
    );
  }
  if (!playing) return <Spectator room={room} />;

  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.phase === 'ask' ? <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={view.myAnswer === null} /> : null}

      <Animated.View key={view.round} entering={FadeIn.duration(220)} style={styles.card}>
        <Txt v="tiny" center color={alpha(INK, 0.7)}>
          {TAJWEED_QUESTION[view.topic]}
        </Txt>
        <Verse view={view} />
      </Animated.View>

      <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} onPick={(choice) => h.act('answer', { choice })} columns={2} />

      {view.phase === 'ask' ? (
        <AnsweredRow ids={view.answered} total={Object.keys(view.scores).length} h={h} />
      ) : (
        <View style={{ gap: 8 }}>
          {view.why ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.why}>
              <Txt v="bold" center>
                {view.why}
              </Txt>
              {view.ref ? (
                <Txt v="tiny" center color={C.yellow}>
                  {view.ref}
                </Txt>
              ) : null}
            </Animated.View>
          ) : null}
          {view.results ? <ResultsList results={view.results} h={h} options={view.options} /> : null}
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
  card: { backgroundColor: GREEN, borderRadius: 22, padding: 16, gap: 6, minHeight: 120, justifyContent: 'center', borderWidth: 2, borderColor: alpha('#F4C02E', 0.5) },
  verse: { fontFamily: F.quran, fontSize: 26, lineHeight: 56, color: INK, textAlign: 'center', writingDirection: 'rtl' },
  mark: { color: MARK },
  why: { backgroundColor: alpha(C.green, 0.18), borderColor: alpha(C.green, 0.6), borderWidth: 2, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
});
