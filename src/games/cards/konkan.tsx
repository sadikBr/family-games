import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { isKonkanMeld, type Card } from '@/shared/cards';
import type { KonkanViewPlus } from '@/shared/games/konkan';
import type { KonkanView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import { CardRow, Felt, HandRows, PlayingCard, TableStrip, TurnLine, cardsWord } from './card-ui';

export function KonkanGame({ room, view: base }: { room: RoomView; view: KonkanView }) {
  const h = helpers(room);
  const view = base as KonkanViewPlus;
  const [sel, setSel] = useState<string[]>([]);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;

  const myTurn = view.phase === 'play' && view.turn === h.me;
  const drawing = myTurn && view.step === 'draw';
  const playing = myTurn && view.step === 'play';
  const selected: Card[] = view.myHand.filter((c) => sel.includes(c.id));
  const validMeld = isKonkanMeld(selected);
  // the card just taken from the discard pile can't be thrown straight back (unless it's the last one)
  const justTaken = selected.length === 1 && selected[0].id === view.takenDiscard && view.myHand.length > 1;
  const toggle = (c: Card) => setSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]));
  const clear = () => setSel([]);
  const amOut = !view.active.includes(h.me);

  if (view.phase === 'handEnd' || view.phase === 'final') {
    const final = view.phase === 'final';
    const won = final && view.winner === h.me;
    return (
      <>
        {won || (!final && view.handWinner === h.me) ? <Confetti /> : null}
        <ResultBanner
          tone={(final ? view.winner : view.handWinner) === h.me ? 'good' : 'neutral'}
          art={<GameArt id="konkan" size={72} />}
          title={final ? `الفوز ${li(h.player(view.winner).name)}` : view.handWinner ? `${h.player(view.handWinner).name}: كونكان` : 'انتهت الأوراق'}
        />
        {final ? <Podium players={view.participants.map((id) => h.player(id))} scores={view.scores} lowIsBetter /> : null}
        <View style={{ gap: 6 }}>
          <Txt v="small" center color={C.muted}>
            نقاط الخسارة — من يصل {num(view.limit)} يخرج
          </Txt>
          <Scoreboard players={room.players} scores={view.scores} lowIsBetter highlight={h.me} />
        </View>
        {view.handSummary ? (
          <HandRows
            title="الأوراق الباقية في اليد (الصور = 10)"
            rows={view.handSummary.map((r) => ({
              key: r.id,
              players: [h.player(r.id)],
              name: h.player(r.id).name,
              points: num(`+${r.points}`),
              tone: r.points ? 'bad' : 'good',
              extra: r.cards.length ? <CardRow cards={r.cards} size="xs" gap={3} /> : undefined,
            }))}
          />
        ) : null}
        {final ? (
          <PlayAgain room={room} />
        ) : h.isHost ? (
          <Btn size="xl" icon="cards" label="اليد التالية" onPress={() => h.act('next')} />
        ) : (
          <HostNote>المضيف يوزّع اليد التالية</HostNote>
        )}
      </>
    );
  }

  return (
    <>
      <TableStrip
        room={room}
        ids={view.participants}
        turn={view.turn}
        score={(id) => view.scores[id] ?? 0}
        sub={(id) => (view.active.includes(id) ? cardsWord(view.handCounts[id] ?? 0) : 'خارج اللعبة')}
        out={view.participants.filter((id) => !view.active.includes(id))}
        note={`نقاط الخسارة — من يصل ${num(view.limit)} يخرج`}
      />

      {/* table: piles + melds */}
      <Felt active={myTurn} minHeight={0}>
        <Row center gap={18}>
          <Pressable disabled={!drawing} onPress={() => h.act('drawStock')} style={[styles.pile, drawing && styles.pileActive]}>
            <PlayingCard card={null} size="md" />
            <Txt v="tiny" center color="rgba(255,255,255,0.8)">
              الكومة ({view.stockLeft})
            </Txt>
          </Pressable>
          <Pressable disabled={!drawing || !view.discardTop} onPress={() => h.act('drawDiscard')} style={[styles.pile, drawing && view.discardTop && styles.pileActive]}>
            {view.discardTop ? (
              <Animated.View key={view.discardTop.id} entering={FadeIn.duration(200)}>
                <PlayingCard card={view.discardTop} size="md" ring={view.discardBy ? h.player(view.discardBy).color : undefined} />
                {view.discardBy ? (
                  <View style={styles.thrower} pointerEvents="none">
                    <Avatar player={h.player(view.discardBy)} size={20} />
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <View style={{ width: 58, height: 87 }} />
            )}
            <Txt v="tiny" center color="rgba(255,255,255,0.8)" numberOfLines={1} style={{ maxWidth: 90 }}>
              {view.discardBy ? `من ${h.player(view.discardBy).name}` : 'المرمية'}
            </Txt>
          </Pressable>
        </Row>
        {view.melds.map((m) => {
          const fits = playing && selected.length > 0 && isKonkanMeld([...m.cards, ...selected]);
          const fresh = view.lastMeld?.id === m.id ? h.player(view.lastMeld.by).color : null;
          return (
            <Animated.View key={m.id} entering={FadeIn.duration(160)}>
              <Pressable
                disabled={!fits}
                onPress={() => {
                  haptic.tap();
                  h.act('layoff', { cards: sel, meld: m.id });
                  clear();
                }}
                style={[styles.meld, fresh ? { borderColor: alpha(fresh, 0.9) } : null, fits && styles.meldFits]}>
                <Avatar player={h.player(m.owner)} size={22} />
                <View style={{ flex: 1 }}>
                  <CardRow cards={m.cards} size="xs" gap={3} />
                </View>
                {fits ? (
                  <Txt v="tiny" color={C.yellow}>
                    أضف هنا
                  </Txt>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </Felt>

      {amOut ? (
        <Txt v="bold" center color={C.muted}>
          خرجت من اللعبة — تابع الآخرين
        </Txt>
      ) : (
        <TurnLine
          myTurn={myTurn}
          text={drawing ? 'اسحب من الكومة أو خذ المرمية' : 'نزّل مجموعاتك ثم ارمِ ورقة'}
        />
      )}

      <View style={{ gap: 10, paddingTop: 6 }}>
        <CardRow cards={view.myHand} size="md" gap={5} selected={sel} onPress={playing ? toggle : undefined} />
        {playing ? (
          <>
            <Row gap={10}>
              <Btn
                flex
                size="md"
                icon="layers"
                label="نزّل"
                color={C.green}
                disabled={!validMeld}
                onPress={() => {
                  h.act('meld', { cards: sel });
                  clear();
                }}
              />
              <Btn
                flex
                size="md"
                icon="trash"
                label="ارمِ"
                ghost
                disabled={selected.length !== 1 || justTaken}
                onPress={() => {
                  h.act('discard', { card: sel[0] });
                  clear();
                }}
              />
            </Row>
            <Txt v="tiny" center color={C.dim}>
              {selected.length === 0
                ? 'اختر 3 أوراق أو أكثر لتنزيل مجموعة، أو ورقة واحدة لرميها'
                : justTaken
                  ? 'لا يمكنك رمي الورقة التي أخذتها للتو'
                  : validMeld
                    ? 'مجموعة صحيحة'
                    : 'أو اضغط على مجموعة فوق الطاولة لإضافة الأوراق إليها'}
            </Txt>
          </>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pile: { alignItems: 'center', gap: 4, padding: 6, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow },
  meld: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  meldFits: { borderColor: C.yellow },
  thrower: { position: 'absolute', top: -8, right: -8 },
});
