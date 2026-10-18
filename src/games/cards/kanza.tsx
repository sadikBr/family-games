import { useState } from 'react';
import { View } from 'react-native';

import { GameArt } from '@/art/game-art';
import type { Card } from '@/shared/cards';
import type { KanzaView, RoomView } from '@/shared/protocol';
import { C, F } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import { CardRow, Felt, FeedList, HandRows, LastPlay, SidesResult, TableStrip, TurnLine, cardsWord, sideLabel, sideScore, stripOrder } from './card-ui';

const TARGET = 15;

/** Table cards that can be part of a 15 with this card (max 2 from the table). */
function usable(table: Card[], card: Card): string[] {
  const need = TARGET - card.rank;
  const ids = new Set<string>();
  for (let i = 0; i < table.length; i++) {
    if (table[i].rank === need) ids.add(table[i].id);
    for (let j = i + 1; j < table.length; j++) {
      if (table[i].rank + table[j].rank === need) {
        ids.add(table[i].id);
        ids.add(table[j].id);
      }
    }
  }
  return [...ids];
}

export function KanzaGame({ room, view }: { room: RoomView; view: KanzaView }) {
  const h = helpers(room);
  const [sel, setSel] = useState<string | null>(null);
  const [take, setTake] = useState<string[]>([]);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;

  const mySide = view.sides.find((x) => x.members.includes(h.me))?.key;
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const selected = view.myHand.find((c) => c.id === sel) ?? null;
  const takeCards = view.table.filter((c) => take.includes(c.id));
  const total = (selected?.rank ?? 0) + takeCards.reduce((t, c) => t + c.rank, 0);
  const canTake = !!selected && takeCards.length > 0 && total === TARGET;
  const glow = selected ? usable(view.table, selected).filter((id) => !take.includes(id)) : [];
  const order = stripOrder(view.sides, view.participants, h.me);
  const score = (id: string) => sideScore(view.sides, view.scores, id);

  const submit = (withTake: boolean) => {
    if (!selected) return;
    h.act('play', { card: selected.id, take: withTake ? take : [] });
    setSel(null);
    setTake([]);
  };

  if (view.phase === 'handEnd' || view.phase === 'final') {
    const final = view.phase === 'final';
    const won = final && view.winner === mySide;
    const winnerSide = view.sides.find((x) => x.key === view.winner);
    return (
      <>
        {won ? <Confetti /> : null}
        {final ? (
          <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="kanza" size={72} />} title={winnerSide ? `الفوز ${li(sideLabel(winnerSide, h))}` : 'تعادل'} />
        ) : (
          <PhaseTitle art={<GameArt id="kanza" size={60} />} title={`نهاية اليد ${num(view.hand)} من ${num(view.totalHands)}`} />
        )}
        {final ? <SidesResult sides={view.sides} scores={view.scores} h={h} winner={view.winner} /> : null}
        {view.handSummary ? (
          <HandRows
            title={`اليد ${num(view.hand)} — كل ورقة = 1 · أوروص = رقمها · 1 أوروص = 20`}
            rows={view.handSummary.map((r) => {
              const side = view.sides.find((x) => x.key === r.side)!;
              return {
                key: r.side,
                players: side.members.map((m) => h.player(m)),
                name: sideLabel(side, h),
                detail: cardsWord(r.cards),
                points: num(`+${r.points}`),
                tone: r.points ? 'good' : 'dim',
                extra: r.golds.length ? <CardRow cards={r.golds} size="xs" gap={3} /> : undefined,
              };
            })}
          />
        ) : null}
        {final ? null : <TableStrip room={room} ids={order} turn={null} score={score} />}
        {final ? null : <FeedList feed={view.feed} h={h} />}
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

  // the card the last player dropped stays ringed in their colour until the next play
  const lp = view.lastPlay;
  const rings = lp && !lp.took.length && view.table.some((c) => c.id === lp.card.id) ? { [lp.card.id]: h.player(lp.by).color } : undefined;
  return (
    <>
      <TableStrip
        room={room}
        ids={order}
        turn={view.turn}
        score={score}
        sub={(id) => cardsWord(view.handCounts[id] ?? 0)}
        note={`اليد ${num(view.hand)} من ${num(view.totalHands)} · في الكومة ${num(view.deckLeft)}`}
      />
      <Felt active={myTurn}>
        <CardRow
          cards={view.table}
          size="sm"
          selected={take}
          glow={glow}
          rings={rings}
          empty="الطاولة فارغة"
          onPress={
            myTurn && selected
              ? (c) => setTake((t) => (t.includes(c.id) ? t.filter((x) => x !== c.id) : t.length >= 2 ? [t[1], c.id] : [...t, c.id]))
              : undefined
          }
        />
        <LastPlay play={view.lastPlay} h={h} />
      </Felt>
      {myTurn && selected ? (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt style={{ fontFamily: F.black, fontSize: 22, lineHeight: 32, color: total === TARGET ? C.green : total > TARGET ? C.red : C.text, writingDirection: 'ltr' }}>
            {num(`${[selected, ...takeCards].map((c) => c.rank).join(' + ')} = ${total}`)}
          </Txt>
          <Txt v="small" color={C.muted}>
            اختر من الطاولة ورقة أو ورقتين ليصبح المجموع 15
          </Txt>
        </View>
      ) : (
        <TurnLine myTurn={myTurn} text="اختر ورقة من يدك" />
      )}
      <View style={{ gap: 10, paddingTop: 6 }}>
        <CardRow
          cards={view.myHand}
          size="lg"
          selected={sel ? [sel] : []}
          onPress={
            myTurn
              ? (c) => {
                  setSel(sel === c.id ? null : c.id);
                  setTake([]);
                }
              : undefined
          }
        />
        {myTurn && selected ? (
          <Row gap={10}>
            <Btn flex size="md" icon="grab" label="خذ" color={C.green} disabled={!canTake} onPress={() => submit(true)} />
            <Btn flex size="md" icon="down" label="ضعها" ghost onPress={() => submit(false)} />
          </Row>
        ) : null}
      </View>
    </>
  );
}
