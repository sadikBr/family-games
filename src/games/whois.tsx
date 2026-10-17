/** «من هو؟» — clues appear one at a time; one guess each, earlier = more points. */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useCountdown } from '@/lib/time';
import type { RoomView, WhoisView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { AnsweredRow, McqFinal, OptionGrid, ResultsList, RoundHeader, useMyResultFx } from './islamic-ui';

const POINTS = [400, 300, 200, 100];

export function WhoisGame({ room, view }: { room: RoomView; view: WhoisView }) {
  const h = helpers(room);
  const next = useCountdown(view.nextClueAt ?? view.endsAt, 250);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="whois" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;
  const asking = view.phase === 'ask';
  const worth = POINTS[Math.min(view.clues.length, 4) - 1];

  return (
    <>
      <RoundHeader label={`من هو؟ — ${view.label}`} round={view.round} rounds={view.rounds} />

      <View style={{ gap: 8 }}>
        {view.clues.map((c, i) => (
          <Animated.View key={`${view.round}:${i}`} entering={FadeInDown.duration(260)} style={[styles.clue, i === view.clues.length - 1 && asking && styles.clueNew]}>
            <View style={styles.clueNum}>
              <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 18, color: C.ink }}>{num(i + 1)}</Txt>
            </View>
            <Txt v="bold" style={{ flex: 1 }}>
              {c}
            </Txt>
          </Animated.View>
        ))}
        {asking ? (
          <Row gap={8} center>
            {Array.from({ length: view.totalClues }, (_, i) => (
              <View key={i} style={[styles.dot, i < view.clues.length && { backgroundColor: C.yellow }]} />
            ))}
            <Txt v="tiny" color={C.muted}>
              {view.nextClueAt ? `التلميح التالي بعد ${num(Math.ceil(next / 1000))} ث` : `آخر فرصة: ${num(Math.ceil(next / 1000))} ث`}
            </Txt>
          </Row>
        ) : null}
      </View>

      {asking && view.myGuess === null ? (
        <Txt v="small" center color={C.yellow}>
          خمّن الآن واربح {num(worth)} نقطة — لك محاولة واحدة فقط
        </Txt>
      ) : null}

      <OptionGrid options={view.options} mine={view.myGuess} correct={view.answer} onPick={(choice) => h.act('guess', { choice })} />

      {asking ? (
        <AnsweredRow ids={view.guessed} total={Object.keys(view.scores).length} h={h} />
      ) : view.results ? (
        <ResultsList results={view.results} h={h} options={view.options} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  clue: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 16, padding: 12 },
  clueNew: { borderWidth: 2, borderColor: alpha(C.yellow, 0.6) },
  clueNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.surfaceStrong },
});
