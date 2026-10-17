import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import type { RoomView, TrisView } from '@/shared/protocol';
import { C } from '@/theme';
import { Avatar, Card as Panel, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import { CardRow, DOUBLE_TAP_MS, Felt, PlayingCard, ScoreStrip, Seats, TurnLine, sideLabel, tapClock } from './card-ui';

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
  const strip = <ScoreStrip sides={view.sides} scores={view.scores} h={h} target={view.target} />;

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
          <Txt v="display" center>
            نهاية اليد {view.hand}
          </Txt>
        )}
        <Panel>
          {view.handSummary?.map((r) => (
            <Row key={r.side} gap={8}>
              <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                {sideLabel(view.sides.find((x) => x.key === r.side)!, h)}
              </Txt>
              <Txt color={C.muted}>{view.tricksWon[r.side]} لمّات</Txt>
              <Txt v="h3" color={C.green}>
                +{r.points}
              </Txt>
            </Row>
          ))}
        </Panel>
        {strip}
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

  const order = [partner, ...view.participants.filter((id) => id !== h.me && id !== partner)];
  return (
    <>
      {strip}
      <Seats
        seats={order}
        turn={view.phase === 'play' ? view.turn : null}
        counts={view.handCounts}
        h={h}
        label={(id) => (id === partner ? 'شريكك' : `${view.handCounts[id]} أوراق`)}
      />
      <Felt active={myTurn} minHeight={150}>
        {view.trick.length === 0 ? (
          <>
            <Txt v="small" center color="rgba(255,255,255,0.65)">
              {view.turn === h.me ? 'ابدأ اللمّة بأي ورقة' : `${h.player(view.turn).name} يبدأ اللمّة`}
            </Txt>
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
            ) : null}
          </>
        ) : (
          <Row center gap={10} wrap>
            {view.trick.map((t) => (
              <Animated.View key={t.card.id} entering={FadeIn.duration(150)} style={{ alignItems: 'center', gap: 4 }}>
                <PlayingCard card={t.card} size="md" selected={view.trickWinner === t.by} />
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
      <Txt v="tiny" center color={C.dim}>
        اللمّة {view.trickNo} من 10 · نقاط فريقك في هذه اليد {thirdsText(view.handThirds[mySide] ?? 0)}
      </Txt>
      <TurnLine myTurn={myTurn} name={h.player(view.turn).name} text={view.trick.length ? 'دورك — العب من النوع نفسه إن كان لديك' : 'دورك — ابدأ اللمّة'} />
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
