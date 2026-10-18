import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import type { RoomView, TrisView } from '@/shared/protocol';
import { C } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import { CardRow, DOUBLE_TAP_MS, Felt, HandRows, PlayingCard, SidesResult, TableStrip, TurnLine, cardsWord, sideLabel, sideScore, stripOrder, tapClock } from './card-ui';

const STRENGTH = [3, 2, 1, 12, 11, 10, 7, 6, 5, 4];

/** Who holds the trick so far: the strongest card of the suit that was led. */
function leading(trick: TrisView['trick']): string | null {
  if (!trick.length) return null;
  const lead = trick[0].card.suit;
  return trick
    .filter((t) => t.card.suit === lead)
    .reduce((best, t) => (STRENGTH.indexOf(t.card.rank) < STRENGTH.indexOf(best.card.rank) ? t : best)).by;
}

const thirdsText = (t: number) => num(`${Math.floor(t / 3) || (t % 3 ? '' : '0')}${['', '⅓', '⅔'][t % 3]}`);

export function TrisGame({ room, view }: { room: RoomView; view: TrisView }) {
  const h = helpers(room);
  const [sel, setSel] = useState<string | null>(null);
  const [selAt, setSelAt] = useState(0);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;

  const mySide = view.sides.find((x) => x.members.includes(h.me))!.key;
  const partner = view.sides.find((x) => x.key === mySide)!.members.find((m) => m !== h.me)!;
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const selected = view.myHand.find((c) => c.id === sel && view.playable.includes(c.id)) ?? null;
  const play = (id: string) => {
    h.act('play', { card: id });
    setSel(null);
  };
  const order = stripOrder(view.sides, view.participants, h.me);
  const score = (id: string) => sideScore(view.sides, view.scores, id);

  if (view.phase === 'final' || view.phase === 'handEnd') {
    const final = view.phase === 'final';
    const won = final && view.winner === mySide;
    const winnerSide = view.sides.find((x) => x.key === view.winner);
    return (
      <>
        {won ? <Confetti /> : null}
        {final ? (
          <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="tris" size={72} />} title={winnerSide ? `فاز ${sideLabel(winnerSide, h)}` : 'انتهت اللعبة'} />
        ) : (
          <PhaseTitle art={<GameArt id="tris" size={60} />} title={`نهاية اليد ${num(view.hand)}`} />
        )}
        {final ? <SidesResult sides={view.sides} scores={view.scores} h={h} winner={view.winner} /> : null}
        {view.handSummary ? (
          <HandRows
            title={`اليد ${num(view.hand)}`}
            rows={view.handSummary.map((r) => {
              const side = view.sides.find((x) => x.key === r.side)!;
              return {
                key: r.side,
                players: side.members.map((m) => h.player(m)),
                name: sideLabel(side, h),
                detail: `${num(view.tricksWon[r.side] ?? 0)} لمّات`,
                points: num(`+${r.points}`),
                tone: r.points ? 'good' : 'dim',
              };
            })}
          />
        ) : null}
        {final ? null : <TableStrip room={room} ids={order} turn={null} score={score} note={`الهدف ${num(view.target)} نقطة`} />}
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

  // while the trick is open, the card that would take it glows softly
  const holder = view.phase === 'play' && view.trick.length > 1 ? leading(view.trick) : null;
  return (
    <>
      <TableStrip
        room={room}
        ids={order}
        turn={view.phase === 'play' ? view.turn : null}
        score={score}
        sub={(id) => (id === partner ? `شريكك · ${cardsWord(view.handCounts[id] ?? 0)}` : cardsWord(view.handCounts[id] ?? 0))}
        note={`الهدف ${num(view.target)} · اللمّة ${num(view.trickNo)} من ${num(10)} · لفريقك في هذه اليد ${thirdsText(view.handThirds[mySide] ?? 0)}`}
      />
      <Felt active={myTurn} minHeight={150}>
        {view.trick.length === 0 ? (
          <>
            {view.lastTrick ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 4 }}>
                <Txt v="tiny" color="rgba(255,255,255,0.7)">
                  آخر أكلة — لـ {h.player(view.lastTrick.winner).name}
                </Txt>
                <Row center gap={6}>
                  {view.lastTrick.cards.map((t) => (
                    <View key={t.card.id} style={{ alignItems: 'center', gap: 2 }}>
                      <PlayingCard card={t.card} size="xs" glow={t.by === view.lastTrick!.winner} />
                      <Avatar player={h.player(t.by)} size={16} />
                    </View>
                  ))}
                </Row>
              </Animated.View>
            ) : (
              <Txt v="small" center color="rgba(255,255,255,0.65)">
                لمّة جديدة
              </Txt>
            )}
          </>
        ) : (
          <Row center gap={10} wrap>
            {view.trick.map((t) => (
              <Animated.View key={t.card.id} entering={FadeInDown.duration(220)} style={{ alignItems: 'center', gap: 4 }}>
                <PlayingCard
                  card={t.card}
                  size="md"
                  selected={view.trickWinner === t.by}
                  glow={holder === t.by}
                />
                <Avatar player={h.player(t.by)} size={22} ring={view.trickWinner === t.by ? C.yellow : undefined} />
              </Animated.View>
            ))}
          </Row>
        )}
        {view.phase === 'trickEnd' && view.trickWinner ? (
          <Txt v="bold" center color={C.yellow}>
            اللمّة لـ {h.player(view.trickWinner).name}
          </Txt>
        ) : null}
      </Felt>
      <TurnLine myTurn={myTurn} text={view.trick.length ? 'العب من النوع نفسه إن كان لديك' : 'ابدأ اللمّة بأي ورقة'} />
      <View style={{ gap: 10, paddingTop: 6 }}>
        <CardRow
          cards={view.myHand}
          size="md"
          gap={5}
          selected={selected ? [selected.id] : []}
          dim={myTurn ? view.myHand.filter((c) => !view.playable.includes(c.id)).map((c) => c.id) : []}
          onPress={
            myTurn
              ? (c) => {
                  if (!view.playable.includes(c.id)) return;
                  const now = tapClock();
                  if (sel !== c.id) {
                    setSel(c.id);
                    setSelAt(now);
                  } else if (now - selAt >= DOUBLE_TAP_MS) play(c.id);
                }
              : undefined
          }
        />
        {myTurn && selected ? <Btn size="lg" icon="down" label="العب هذه الورقة" onPress={() => play(selected.id)} /> : null}
      </View>
    </>
  );
}
