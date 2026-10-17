import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { useTilt } from '@/lib/tilt';
import type { HeadsUpView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Pill, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, CountdownBig, Podium, PopIn, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, Spectator } from './common';
import { helpers } from './helpers';

function FlashOnce({ ok }: { ok: boolean }) {
  const o = useSharedValue(0.9);
  useEffect(() => {
    o.set(withDelay(200, withTiming(0, { duration: 220 })));
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { backgroundColor: ok ? C.green : C.orange }, st]}>
      <Icon name={ok ? 'check' : 'skip'} size={110} color="#FFFFFF" />
    </Animated.View>
  );
}

/** Flash green / orange when a card is answered (remounts per answer). */
function Flash({ view }: { view: HeadsUpView }) {
  const last = view.history.at(-1);
  if (!last) return null;
  return <FlashOnce key={view.history.length} ok={last.ok} />;
}

function TiltHelp({ up, text }: { up?: boolean; text: string }) {
  return (
    <Row gap={10}>
      <View style={[styles.tiltIcon, up && { transform: [{ rotate: '180deg' }] }]}>
        <Icon name="down" size={20} color={up ? C.orange : C.green} />
      </View>
      <Txt v="bold" style={{ flex: 1 }}>
        {text}
      </Txt>
    </Row>
  );
}

export function HeadsUpGame({ room, view }: { room: RoomView; view: HeadsUpView }) {
  const { me, isHost, player, act } = helpers(room);
  const guesser = player(view.guesserId);
  const isGuesser = view.guesserId === me;
  const card = view.card;
  const [tiltOn, setTiltOn] = useState(true);

  useTilt(view.phase === 'play' && isGuesser && tiltOn, (t) => {
    if (card) act('mark', { index: card.index, ok: t === 'down' });
  });

  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const score = view.history.filter((h) => h.ok).length;
  const header = (
    <Txt v="small" center color={C.dim}>
      {view.category.label} · الدور {view.turn} من {view.totalTurns}
    </Txt>
  );
  const mark = (ok: boolean) => card && act('mark', { index: card.index, ok });

  switch (view.phase) {
    case 'ready':
      return (
        <>
          {header}
          {isGuesser ? (
            <>
              <PhaseTitle icon="user" title="دورك في التخمين" sub="ضع الهاتف على جبينك والشاشة نحو العائلة" />
              <Card style={{ gap: 10 }}>
                <TiltHelp text="أمِل الهاتف إلى الأسفل: أصبت" />
                <TiltHelp up text="أمِل الهاتف إلى الأعلى: تخطٍّ" />
                <Txt v="small" color={C.muted}>
                  ويستطيع أفراد العائلة الضغط على «صحيح» أو «تخطَّ» من هواتفهم
                </Txt>
              </Card>
              <Btn size="xl" icon="play" label="ابدأ" color={C.green} onPress={() => act('start')} />
            </>
          ) : (
            <>
              <PhaseTitle art={<Avatar player={guesser} size={96} />} title={`${guesser.name} سيخمّن`} sub="ستظهر الكلمة على هاتفك. مثّلها أو صفها بدون أن تقولها" />
              {isHost ? <Btn size="md" ghost icon="play" label="ابدأ الدور" onPress={() => act('start')} /> : null}
            </>
          )}
        </>
      );

    case 'countdown':
      return (
        <View style={{ flex: 1, minHeight: 420, justifyContent: 'center', gap: 10 }}>
          <Txt v="h2" center>
            {isGuesser ? 'ضع الهاتف على جبينك' : `استعدوا، ${guesser.name} يخمّن`}
          </Txt>
          <CountdownBig endsAt={view.endsAt} />
        </View>
      );

    case 'play':
      if (isGuesser) {
        // this screen faces the family
        return (
          <View style={{ gap: 14 }}>
            <TimerBar endsAt={view.endsAt} total={room.settings.headsup.seconds * 1000} onTick />
            <View style={styles.forehead}>
              <Flash view={view} />
              {card ? (
                <PopIn k={card.index}>
                  <Txt style={styles.foreheadWord} adjustsFontSizeToFit numberOfLines={2}>
                    {card.word}
                  </Txt>
                </PopIn>
              ) : null}
            </View>
            <Row gap={10}>
              <Btn flex size="lg" icon="check" label="صحيح" color={C.green} silent onPress={() => mark(true)} />
              <Btn flex size="lg" icon="skip" label="تخطَّ" color={C.orange} silent onPress={() => mark(false)} />
            </Row>
            <Btn size="sm" ghost label={tiltOn ? 'إيقاف الإمالة' : 'تشغيل الإمالة'} onPress={() => setTiltOn((t) => !t)} />
          </View>
        );
      }
      return (
        <View style={{ gap: 14 }}>
          <TimerBar endsAt={view.endsAt} total={room.settings.headsup.seconds * 1000} />
          <Row gap={10} center>
            <Avatar player={guesser} size={36} />
            <Txt v="bold">{guesser.name} يخمّن</Txt>
            <Pill label={`${score}`} icon="check" color={alpha(C.green, 0.25)} />
          </Row>
          <View style={styles.wordCard}>
            <Flash view={view} />
            {card ? (
              <PopIn k={card.index}>
                <Txt v="display" size={48} center adjustsFontSizeToFit numberOfLines={2}>
                  {card.word}
                </Txt>
              </PopIn>
            ) : null}
            <Txt v="small" center color={C.muted}>
              مثّلها أو صِفها بدون أن تقولها
            </Txt>
          </View>
          <Row gap={10}>
            <Btn flex size="xl" icon="check" label="صحيح" color={C.green} silent onPress={() => mark(true)} />
            <Btn flex size="xl" icon="skip" label="تخطَّ" color={C.orange} silent onPress={() => mark(false)} />
          </Row>
          {isHost ? <Btn size="sm" ghost icon="stop" label="إنهاء الدور" onPress={() => act('endTurn')} /> : null}
        </View>
      );

    case 'turnEnd':
      return (
        <>
          <PhaseTitle art={<Avatar player={guesser} size={80} />} title={`${guesser.name}: +${score}`} sub="انتهى الوقت" />
          <Card>
            {view.history.length === 0 ? (
              <Txt center color={C.muted}>
                لا توجد كلمات
              </Txt>
            ) : (
              <Row wrap gap={6}>
                {view.history.map((h, i) => (
                  <Pill key={i} label={h.word} icon={h.ok ? 'check' : 'skip'} color={h.ok ? alpha(C.green, 0.25) : alpha(C.orange, 0.2)} />
                ))}
              </Row>
            )}
          </Card>
          <Card>
            <Scoreboard players={room.players} scores={view.scores} highlight={view.guesserId} />
          </Card>
          {isHost || isGuesser ? (
            <Btn size="xl" icon="play" label={view.turn >= view.totalTurns ? 'النتيجة النهائية' : 'اللاعب التالي'} onPress={() => act('next')} />
          ) : (
            <HostNote>في انتظار الدور التالي</HostNote>
          )}
        </>
      );

    case 'final':
      return (
        <>
          <Confetti />
          <PhaseTitle icon="trophy" title="النتيجة النهائية" />
          <Podium players={room.players} scores={view.scores} />
          <Card>
            <Scoreboard players={room.players} scores={view.scores} highlight={me} />
          </Card>
          <PlayAgain room={room} />
        </>
      );
  }
}

const styles = StyleSheet.create({
  forehead: {
    minHeight: 380,
    borderRadius: 28,
    backgroundColor: '#FBF7EC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    overflow: 'hidden',
  },
  foreheadWord: {
    fontFamily: F.display,
    fontSize: 72,
    lineHeight: 104,
    color: C.ink,
    textAlign: 'center',
  },
  wordCard: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: alpha(C.cyan, 0.6),
    overflow: 'hidden',
  },
  tiltIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  flash: { alignItems: 'center', justifyContent: 'center', zIndex: 5, borderRadius: 22 },
});
