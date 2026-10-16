import { useState } from 'react';
import { View } from 'react-native';

import { GameArt } from '@/art/game-art';
import { RANKS, rankIndex, type Card } from '@/shared/cards';
import type { RondaView, RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Card as Panel, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import { CardRow, Felt, FeedList, LastEvent, ScoreStrip, Seats, TurnLine, sideLabel } from './card-ui';

/** Cards a play would take: the match + the following sequence. */
function preview(table: Card[], card: Card): string[] {
  const match = table.find((c) => c.rank === card.rank);
  if (!match) return [];
  const took = [match];
  for (let i = rankIndex(card.rank) + 1; i < RANKS.length; i++) {
    const next = table.find((c) => c.rank === RANKS[i]);
    if (!next) break;
    took.push(next);
  }
  return took.map((c) => c.id);
}

export function RondaGame({ room, view }: { room: RoomView; view: RondaView }) {
  const h = helpers(room);
  const [sel, setSel] = useState<string | null>(null);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;

  const mySide = view.sides.find((x) => x.members.includes(h.me))?.key;
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const selected = view.myHand.find((c) => c.id === sel) ?? null;
  const glow = selected ? preview(view.table, selected) : [];
  const play = (id: string) => {
    h.act('play', { card: id });
    setSel(null);
  };
  const strip = <ScoreStrip sides={view.sides} scores={view.scores} h={h} target={view.target} />;

  if (view.phase === 'final') {
    const won = view.winner === mySide;
    const winnerSide = view.sides.find((x) => x.key === view.winner);
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<GameArt id="ronda" size={72} />}
          title={winnerSide ? `فاز ${sideLabel(winnerSide, h)}` : 'انتهت اللعبة'}
        />
        {strip}
        <PlayAgain room={room} />
      </>
    );
  }

  if (view.phase === 'handEnd') {
    return (
      <>
        <Txt v="display" center>
          نهاية اليد {view.hand}
        </Txt>
        <Panel>
          <Txt v="small" color={C.muted}>
            كل ورقة فوق 20 = نقطة
          </Txt>
          {view.handSummary?.map((r) => (
            <Row key={r.side} gap={8}>
              <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                {sideLabel(view.sides.find((x) => x.key === r.side)!, h)}
              </Txt>
              <Txt color={C.muted}>{r.cards} ورقة</Txt>
              <Txt v="h3" color={r.points ? C.green : C.dim}>
                +{r.points}
              </Txt>
            </Row>
          ))}
        </Panel>
        {strip}
        <FeedList feed={view.feed} h={h} />
        {h.isHost ? <Btn size="xl" icon="cards" label="اليد التالية" onPress={() => h.act('next')} /> : <HostNote>المضيف يوزّع اليد التالية</HostNote>}
      </>
    );
  }

  const others = view.participants.filter((id) => id !== h.me);
  return (
    <>
      {strip}
      <Seats seats={others} turn={view.turn} counts={view.handCounts} h={h} />
      <Felt active={myTurn}>
        <CardRow cards={view.table} size="sm" glow={glow} empty="الطاولة فارغة" />
        <LastEvent feed={view.feed} h={h} />
      </Felt>
      <Txt v="tiny" center color={C.dim}>
        اليد {view.hand} · في الكومة {view.deckLeft}
      </Txt>
      <TurnLine myTurn={myTurn} name={h.player(view.turn).name} text="دورك — اختر ورقة" />
      <View style={{ gap: 10, paddingTop: 6 }}>
        <CardRow
          cards={view.myHand}
          size="lg"
          selected={sel ? [sel] : []}
          onPress={myTurn ? (c) => (sel === c.id ? play(c.id) : setSel(c.id)) : undefined}
        />
        {myTurn && selected ? (
          <Btn
            size="lg"
            icon={glow.length ? 'grab' : 'down'}
            label={glow.length ? `العب وخذ ${glow.length + 1} أوراق` : 'العب هذه الورقة'}
            color={glow.length ? C.green : C.yellow}
            onPress={() => play(selected.id)}
          />
        ) : null}
      </View>
    </>
  );
}
