import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { play } from '@/lib/sfx';
import { useElapsed } from '@/lib/time';
import type { PotatoView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';

/** The potato. On the holder's phone it trembles a little, more as time passes. */
function Potato({ size = 120, heat = 0, tremble }: { size?: number; heat?: number; tremble?: boolean }) {
  const r = useSharedValue(0);
  const amp = 1.5 + heat * 4;
  useEffect(() => {
    if (!tremble) {
      r.set(0);
      return;
    }
    r.set(withRepeat(withSequence(withTiming(-amp, { duration: 90 }), withTiming(amp, { duration: 90 })), -1, true));
  }, [r, amp, tremble]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return (
    <Animated.View style={[styles.potato, { width: size, height: size }, st]}>
      <GameArt id="potato" size={size} />
    </Animated.View>
  );
}

/** Ticking that speeds up — only on the phone holding the potato. */
function useTicking(active: boolean, elapsed: number) {
  const interval = Math.max(220, 900 - elapsed / 45);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => play('tick'), interval);
    return () => clearInterval(t);
  }, [active, interval]);
}

export function PotatoGame({ room, view }: { room: RoomView; view: PotatoView }) {
  const { me, isHost, player, act } = helpers(room);
  const holder = player(view.holderId);
  const iHold = view.holderId === me;
  const elapsed = useElapsed(view.phase === 'play' ? view.startedAt : null, 500);
  const heat = Math.min(1, elapsed / 40000);
  useTicking(view.phase === 'play' && iHold, Math.round(elapsed / 2000) * 2000);

  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const topic = (
    <View style={styles.topic}>
      <Txt v="tiny" color={C.muted}>
        الموضوع
      </Txt>
      <Txt v="title" center>
        {view.category}
      </Txt>
      <Txt v="tiny" color={C.dim}>
        الجولة {view.round} من {view.totalRounds}
        {view.phase === 'play' ? ` · ${view.passes} رمية` : ''}
      </Txt>
    </View>
  );
  const botSaid =
    view.phase === 'play' && view.lastWord ? (
      <Animated.View key={`${view.passes}`} entering={FadeIn.duration(160)} style={styles.said}>
        <Avatar player={player(view.lastWord.by)} size={28} />
        <Txt v="small" color={C.ink}>
          {player(view.lastWord.by).name}: «{view.lastWord.word}»
        </Txt>
      </Animated.View>
    ) : null;

  switch (view.phase) {
    case 'ready':
      return (
        <>
          {topic}
          <Card style={{ alignItems: 'center' }}>
            <Potato size={110} />
            <Txt v="h2" center>
              {iHold ? 'البطاطا معك، أنت تبدأ' : `${holder.name} يبدأ`}
            </Txt>
            <Txt v="small" center color={C.muted}>
              قل كلمة من الموضوع، ثم ارمِ البطاطا لهاتف لاعب آخر. لا تكرروا الكلمات.
            </Txt>
          </Card>
          {iHold || isHost ? (
            <Btn size="xl" icon="flame" label="شغّل البطاطا" color={C.red} onPress={() => act('start')} />
          ) : (
            <HostNote>في انتظار {holder.name}</HostNote>
          )}
        </>
      );

    case 'play': {
      if (iHold) {
        const targets = view.participants.filter(
          (id) => id !== me && player(id).connected && !(view.participants.length > 2 && id === view.fromId),
        );
        return (
          <>
            {topic}
            {botSaid}
            <View style={[styles.hot, { borderColor: alpha(C.red, 0.3 + heat * 0.6) }]}>
              <Potato heat={heat} tremble />
              <Txt v="display" center>
                بسرعة، قل كلمة
              </Txt>
            </View>
            <Txt v="h3" center color={C.muted}>
              ثم ارمِها لـ
            </Txt>
            <Row wrap gap={8} center>
              {targets.map((id) => (
                <PlayerTag key={id} player={player(id)} size={64} onPress={() => act('throw', { to: id })} />
              ))}
            </Row>
          </>
        );
      }
      return (
        <>
          {topic}
          {botSaid}
          <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
            <Avatar player={holder} size={96} ring={C.orange} />
            <Txt v="title" center>
              البطاطا عند {holder.name}
            </Txt>
            <Txt center color={C.muted} v="small">
              استعد، قد تصلك في أي لحظة
            </Txt>
          </Card>
        </>
      );
    }

    case 'boom': {
      const loser = player(view.loserId);
      const meLost = view.loserId === me;
      return (
        <>
          <ResultBanner tone="bad" art={<Avatar player={loser} size={72} />} title={meLost ? 'انفجرت فيك' : 'بوم'} sub={`${loser.name} احترق`} />
          <Card>
            <Txt v="h3">الحروق</Txt>
            <Txt v="tiny" color={C.dim}>
              الأقل أفضل
            </Txt>
            <Scoreboard players={room.players} scores={view.burns} lowIsBetter highlight={view.loserId ?? undefined} />
          </Card>
          {isHost ? (
            <Btn size="xl" icon="play" label={view.round >= view.totalRounds ? 'النتيجة النهائية' : 'الجولة التالية'} onPress={() => act('next')} />
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
          <PhaseTitle icon="trophy" title="الأبطال المقاومون للحرارة" />
          <Podium players={room.players} scores={view.burns} lowIsBetter />
          <Card>
            <Scoreboard players={room.players} scores={view.burns} lowIsBetter highlight={me} />
          </Card>
          <PlayAgain room={room} />
        </>
      );
  }
}

const styles = StyleSheet.create({
  topic: { alignItems: 'center', gap: 0, paddingVertical: 10, borderRadius: 18, backgroundColor: C.surface },
  potato: { alignItems: 'center', justifyContent: 'center' },
  said: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: C.text,
    borderRadius: 999,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: 12,
  },
  hot: { borderRadius: 24, padding: 16, gap: 6, alignItems: 'center', borderWidth: 2, backgroundColor: C.surface },
});
