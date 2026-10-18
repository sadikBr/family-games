import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { play } from '@/lib/sfx';
import { useElapsed } from '@/lib/time';
import type { PotatoView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';

/** The potato. On the holder's phone it breathes gently (up to 5 % bigger), faster as time passes. */
function Potato({ size = 120, heat = 0, tremble }: { size?: number; heat?: number; tremble?: boolean }) {
  const r = useSharedValue(1);
  const beat = Math.round(520 - heat * 300);
  useEffect(() => {
    if (!tremble) {
      r.set(1);
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    r.set(withRepeat(withSequence(withTiming(1.05, { duration: beat, easing: ease }), withTiming(1, { duration: beat, easing: ease })), -1));
  }, [r, beat, tremble]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: r.get() }] }));
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

  const accent = useAccent();
  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const topic = (
    <View style={[styles.topic, { borderColor: alpha(accent, 0.5) }]}>
      <Txt v="tiny" color={C.muted}>
        الموضوع
      </Txt>
      <Txt v="title" center>
        {view.category}
      </Txt>
      <Txt v="tiny" color={C.muted}>
        الجولة {num(view.round)} من {num(view.totalRounds)}
        {view.phase === 'play' ? ` · ${num(view.passes)} رمية` : ''}
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
              {iHold ? 'البطاطا معك، أنت تبدأ' : `البداية مع ${holder.name}`}
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
        const targets = view.targets;
        return (
          <>
            {topic}
            {botSaid}
            <View style={[styles.hot, { borderColor: alpha(C.red, 0.3 + heat * 0.6) }]}>
              <Potato heat={heat} tremble />
              <Txt v="display" center>
                بسرعة، قل كلمة
              </Txt>
              {view.fromId ? (
                <Txt v="small" center color={C.muted}>
                  جاءتك من {player(view.fromId).name}
                </Txt>
              ) : null}
            </View>
            <Txt v="h3" center color={C.muted}>
              ثم ارمِها لـ
            </Txt>
            <Row wrap gap={8} center>
              {targets.map((id) => (
                <PlayerTag key={id} player={player(id)} size={64} onPress={() => act('throw', { to: id })} />
              ))}
            </Row>
            {targets.length ? null : (
              <Txt v="small" center color={C.dim}>
                لا يوجد لاعب متصل الآن لترمي له — انتظر قليلاً
              </Txt>
            )}
          </>
        );
      }
      return (
        <>
          {topic}
          {botSaid}
          <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
            <Avatar player={holder} size={96} ring={holder.color} />
            <Txt v="title" center>
              البطاطا عند {holder.name}
            </Txt>
            <Txt center color={C.muted} v="small">
              {view.fromId ? `جاءت من ${player(view.fromId).name} · ` : ''}استعد، قد تصلك في أي لحظة
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
          <ResultBanner tone="bad" art={<Avatar player={loser} size={72} />} title={meLost ? 'انفجرت فيك' : 'بوم'} sub={`انفجرت البطاطا في يد ${loser.name}`} />
          <View style={{ gap: 6 }}>
            <Txt v="small" center color={C.muted}>
              الحروق (الأقل أفضل)
            </Txt>
            <PlayerStrip room={room} entries={view.participants.map((id) => ({ id, score: view.burns[id] ?? 0 }))} active={view.loserId ? [view.loserId] : []} />
          </View>
          {isHost ? (
            <Btn size="xl" icon="play" label={view.round >= view.totalRounds ? 'النتيجة النهائية' : 'الجولة التالية'} onPress={() => act('next')} />
          ) : (
            <HostNote>المضيف يبدأ الجولة التالية</HostNote>
          )}
        </>
      );
    }

    case 'final': {
      const burns = Object.fromEntries(view.participants.map((id) => [id, view.burns[id] ?? 0]));
      const least = Math.min(...Object.values(burns));
      const winners = Object.keys(burns).filter((id) => burns[id] === least);
      const won = winners.includes(me);
      return (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<GameArt id="potato" size={84} />}
            title={winners.length === 1 ? `فاز ${player(winners[0]).name}` : 'تعادل!'}
            sub="الفوز لأقل الحروق"
          />
          <Podium players={room.players} scores={burns} lowIsBetter />
          <Scoreboard players={room.players} scores={burns} lowIsBetter unit="حروق" highlight={me} />
          <PlayAgain room={room} />
        </>
      );
    }
  }
}

const styles = StyleSheet.create({
  topic: { alignItems: 'center', gap: 0, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, backgroundColor: C.surface },
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
