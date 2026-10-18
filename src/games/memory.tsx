/** «الذاكرة» — turn over two cards; matching pictures are yours and you play again. */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FlipInEasyY } from 'react-native-reanimated';

import { AvatarArt } from '@/art/avatars';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import type { GameId, MemoryView, RoomView } from '@/shared/protocol';
import { C, shade } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar } from '@/ui/bits';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt } from '@/ui/txt';
import { li } from '@/shared/li';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';

const INK = '#151726';
const COLS: Record<number, number> = { 16: 4, 20: 4, 24: 4, 30: 5 };

function Face({ face, size }: { face: string; size: number }) {
  const [kind, id] = face.split(':');
  return kind === 'a' ? <AvatarArt id={id} size={size} /> : <GameArt id={id as GameId} size={size} />;
}

export function MemoryGame({ room, view }: { room: RoomView; view: MemoryView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const accent = useAccent();
  const cols = COLS[view.size] ?? 5;
  const rows = Math.ceil(view.size / cols);
  const W = Math.min(width - 24, 460);
  const cw = (W - (cols - 1) * 8) / cols;
  const ch = Math.min(cw * 1.2, (520 - (rows - 1) * 8) / rows);
  if (!(h.me in view.pairs)) return <Spectator room={room} />;
  const myTurn = view.phase === 'play' && view.turn === h.me && !view.peek;
  const won = view.phase === 'final' && !!view.winner?.includes(h.me);
  const matched = view.flipped.length === 2 && !view.peek;

  return (
    <>
      {won ? <Confetti /> : null}
      {view.phase === 'final' ? (
        <>
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<GameArt id="memory" size={72} />}
            title={view.winner!.length === 1 ? `الفوز ${li(h.player(view.winner![0]).name)}` : 'تعادل!'}
            sub="ذاكرة من حديد!"
          />
          <Podium players={room.players} scores={view.pairs} />
          {view.order.length > 3 ? <Scoreboard players={room.players} scores={view.pairs} unit="زوج" highlight={h.me} /> : null}
        </>
      ) : (
        <PlayerStrip room={room} entries={view.order.map((id) => ({ id, score: view.pairs[id] ?? 0 }))} active={view.phase === 'play' ? [view.turn] : []} />
      )}

      {view.phase === 'play' ? (
        <Txt v="bold" center color={view.peek ? C.orange : matched ? C.green : C.yellow} style={{ minHeight: 26 }}>
          {view.peek
            ? 'ليستا متطابقتين…'
            : matched
              ? view.turn === h.me
                ? 'زوج لك! اقلب بطاقتين من جديد'
                : `زوج لـ ${h.player(view.turn).name} ودورٌ آخر`
              : myTurn
                ? view.flipped.length
                  ? 'اقلب البطاقة الثانية'
                  : 'دورك — اقلب بطاقتين'
                : ''}
        </Txt>
      ) : null}

      <View style={[styles.table, { width: W, direction: 'ltr' }]}>
        {view.faces.map((face, i) => {
          const owner = view.owners[i];
          const open = face !== null;
          return (
            <Pressable
              key={i}
              disabled={!myTurn || open}
              onPress={() => {
                haptic.tap();
                h.act('flip', { card: i });
              }}
              accessibilityLabel={open ? 'بطاقة مكشوفة' : `البطاقة ${i + 1}`}
              style={{ width: cw, height: ch }}>
              {open ? (
                <Animated.View
                  key={`f${i}`}
                  entering={FlipInEasyY.duration(260)}
                  style={[
                    styles.card,
                    styles.front,
                    owner ? { borderColor: h.player(owner).color, borderWidth: 4 } : null,
                    owner && { opacity: view.phase === 'final' || (matched && view.flipped.includes(i)) ? 1 : 0.75 },
                    matched && view.flipped.includes(i) && owner ? { borderWidth: 5, transform: [{ scale: 1.04 }] } : null,
                    view.peek && view.flipped.includes(i) && { borderColor: C.red, borderWidth: 4 },
                  ]}>
                  <Face face={face} size={Math.min(cw, ch) * 0.82} />
                  {owner ? (
                    <Animated.View entering={FadeIn.duration(200)} style={styles.ownerDot}>
                      <Avatar player={h.player(owner)} size={18} />
                    </Animated.View>
                  ) : null}
                </Animated.View>
              ) : (
                <View key={`b${i}`} style={[styles.card, { backgroundColor: accent }]}>
                  <View style={[styles.diamond, { backgroundColor: shade(accent, 0.6), width: Math.min(cw, ch) * 0.34, height: Math.min(cw, ch) * 0.34 }]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {view.phase === 'final' ? <PlayAgain room={room} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  table: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flex: 1, borderRadius: 14, borderWidth: 3, borderColor: INK, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  front: { backgroundColor: '#FFF4DA' },
  diamond: { borderWidth: 2.5, borderColor: INK, borderRadius: 4, transform: [{ rotate: '45deg' }] },
  ownerDot: { position: 'absolute', top: 2, right: 2 },
});
