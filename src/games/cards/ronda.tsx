import { View } from 'react-native';

import { GameArt } from '@/art/game-art';
import { RANKS, rankIndex, type Card } from '@/shared/cards';
import type { RondaView, RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import {
  AnnounceBanner,
  CardRow,
  FeedList,
  Felt,
  HandRows,
  LastPlay,
  SidesResult,
  TableStrip,
  TurnLine,
  cardsWord,
  sideLabel,
  sideScore,
  stripOrder,
  useTapToPlay,
} from './card-ui';
import { CardStage } from './motion';

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
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const tap = useTapToPlay({
    canPlay: (id) => myTurn && view.myHand.some((c) => c.id === id),
    onPlay: (id) => h.act('play', { card: id }),
  });
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase, so it stays mounted from hand to hand (cards then deal in smoothly)
  return (
    <CardStage>
      <RondaScreen room={room} view={view} tap={tap} myTurn={myTurn} />
    </CardStage>
  );
}

function RondaScreen({ room, view, tap, myTurn }: { room: RoomView; view: RondaView; tap: ReturnType<typeof useTapToPlay>; myTurn: boolean }) {
  const h = helpers(room);
  const mySide = view.sides.find((x) => x.members.includes(h.me))?.key;
  const selected = view.myHand.find((c) => c.id === tap.selected) ?? null;
  const glow = selected ? preview(view.table, selected) : [];
  const order = stripOrder(view.sides, view.participants, h.me);
  const score = (id: string) => sideScore(view.sides, view.scores, id);
  const summary = view.handSummary ? (
    <HandRows
      title={`اليد ${num(view.hand)} — كل ورقة فوق ${num(view.base)} = نقطة`}
      rows={view.handSummary.map((r) => {
        const side = view.sides.find((x) => x.key === r.side)!;
        return { key: r.side, players: side.members.map((m) => h.player(m)), name: sideLabel(side, h), detail: cardsWord(r.cards), points: num(`+${r.points}`), tone: r.points ? 'good' : 'dim' };
      })}
    />
  ) : null;

  if (view.phase === 'final') {
    const won = view.winner === mySide;
    const winnerSide = view.sides.find((x) => x.key === view.winner);
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<GameArt id="ronda" size={72} />}
          title={winnerSide ? `الفوز ${li(sideLabel(winnerSide, h))}` : 'انتهت اللعبة'}
        />
        <SidesResult sides={view.sides} scores={view.scores} h={h} winner={view.winner} />
        {summary}
        <PlayAgain room={room} />
      </>
    );
  }

  if (view.phase === 'handEnd') {
    return (
      <>
        <PhaseTitle art={<GameArt id="ronda" size={60} />} title={`نهاية اليد ${num(view.hand)}`} />
        {summary}
        <TableStrip room={room} ids={order} turn={null} score={score} note={`الهدف ${num(view.target)} نقطة`} />
        <FeedList feed={view.feed} h={h} />
        {h.isHost ? <Btn size="xl" icon="cards" label="اليد التالية" onPress={() => h.act('next')} /> : <HostNote>المضيف يوزّع اليد التالية</HostNote>}
      </>
    );
  }

  // the card the last player dropped stays ringed in their colour until the next play
  const lp = view.lastPlay;
  const rings = lp && !lp.took.length && view.table.some((c) => c.id === lp.card.id) ? { [lp.card.id]: h.player(lp.by).color } : undefined;
  // my cards come from the bottom (my hand), everyone else's from the top (the strip)
  const fromSide = lp && lp.by === h.me ? 'bottom' : 'top';
  return (
    <>
      <TableStrip
        room={room}
        ids={order}
        turn={view.turn}
        score={score}
        sub={(id) => cardsWord(view.handCounts[id] ?? 0)}
        note={`الهدف ${num(view.target)} · اليد ${num(view.hand)} · في الكومة ${num(view.deckLeft)}`}
      />
      <Felt active={myTurn}>
        <CardRow cards={view.table} size="sm" glow={glow} rings={rings} empty="الطاولة فارغة" motion={{ enter: 'play', from: fromSide }} />
        <LastPlay play={view.lastPlay} h={h} motion={{ from: fromSide }} />
        <AnnounceBanner announce={view.announce} h={h} />
      </Felt>
      <TurnLine myTurn={myTurn} text="اختر ورقة، واضغطها مرة ثانية للعب" keep />
      <View style={{ gap: 10, paddingTop: 6 }}>
        <CardRow cards={view.myHand} size="lg" selected={tap.selected ? [tap.selected] : []} onPress={myTurn ? (c) => tap.tap(c.id) : undefined} motion={{ enter: 'deal', from: 'top' }} />
        {/* the button's place is always kept: nothing jumps when a card is selected or played */}
        <View style={{ minHeight: 56, justifyContent: 'center' }}>
          {myTurn && selected ? (
            <Btn
              size="lg"
              icon={glow.length ? 'grab' : 'down'}
              label={glow.length ? `العب وخذ ${glow.length + 1} أوراق` : 'العب هذه الورقة'}
              color={glow.length ? C.green : C.yellow}
              onPress={tap.play}
            />
          ) : null}
        </View>
      </View>
    </>
  );
}
