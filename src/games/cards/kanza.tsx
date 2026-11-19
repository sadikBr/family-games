import { useRef, useState } from 'react';
import { View } from 'react-native';

import { GameArt } from '@/art/game-art';
import type { Card } from '@/shared/cards';
import type { KanzaView, RoomView } from '@/shared/protocol';
import { C, F } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers } from '../helpers';
import { CardRow, DOUBLE_TAP_MS, Felt, FeedList, HandRows, LastPlay, PlayingCard, SidesResult, TableStrip, TurnLine, cardsWord, sideLabel, sideScore, stripOrder, tapClock } from './card-ui';
import { CardMotion, CardStage, type Side } from './motion';

const TARGET = 15;

/** Every way to make 15 with this card: 1 or 2 table cards (their ids). */
function kanzaOptions(table: Card[], card: Card): string[][] {
  const need = TARGET - card.rank;
  const out: string[][] = [];
  for (let i = 0; i < table.length; i++) {
    if (table[i].rank === need) out.push([table[i].id]);
    for (let j = i + 1; j < table.length; j++) if (table[i].rank + table[j].rank === need) out.push([table[i].id, table[j].id]);
  }
  return out;
}

/**
 * What a second tap on the selected card does: the chosen table cards when they make 15; with
 * nothing chosen, the card goes on the table when no 15 is possible, or takes the only 15 there
 * is. Null: nothing happens (an incomplete choice, or several ways to make 15: the player picks).
 */
function secondTap(options: string[][], take: string[], total: number): string[] | null {
  if (take.length) return total === TARGET ? take : null;
  if (!options.length) return [];
  if (options.length === 1) return options[0];
  return null;
}

/** Tapping a table card: the choice always stays part of a possible 15 (a card that starts a new one replaces it). */
function nextTake(options: string[][], take: string[], id: string): string[] {
  if (take.includes(id)) return take.filter((x) => x !== id);
  const fits = (ids: string[]) => options.some((o) => ids.every((x) => o.includes(x)));
  const more = [...take, id];
  if (fits(more)) return more;
  return fits([id]) ? [id] : take;
}

export function KanzaGame({ room, view }: { room: RoomView; view: KanzaView }) {
  const h = helpers(room);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase, so it stays mounted from hand to hand (cards then deal in smoothly)
  return (
    <CardStage>
      <KanzaScreen room={room} view={view} />
    </CardStage>
  );
}

function KanzaScreen({ room, view }: { room: RoomView; view: KanzaView }) {
  const h = helpers(room);
  const [sel, setSel] = useState<string | null>(null);
  const [take, setTake] = useState<string[]>([]);
  // when the card was selected, for the tap handler only (the same touch reported twice is dropped)
  const selAt = useRef(0);
  const handW = useContentWidth();

  const mySide = view.sides.find((x) => x.members.includes(h.me))?.key;
  const myTurn = view.phase === 'play' && view.turn === h.me;
  // a stale selection (the turn moved on, the card is gone) never lingers
  const selected = myTurn ? (view.myHand.find((c) => c.id === sel) ?? null) : null;
  const takeCards = selected ? view.table.filter((c) => take.includes(c.id)) : [];
  const total = (selected?.rank ?? 0) + takeCards.reduce((t, c) => t + c.rank, 0);
  const canTake = !!selected && takeCards.length > 0 && total === TARGET;
  const options = selected ? kanzaOptions(view.table, selected) : [];
  const usableIds = [...new Set(options.flat())];
  const glow = usableIds.filter((id) => !take.includes(id));
  const order = stripOrder(view.sides, view.participants, h.me);
  const score = (id: string) => sideScore(view.sides, view.scores, id);

  const send = (card: Card, withTake: string[]) => {
    h.act('play', { card: card.id, take: withTake });
    setSel(null);
    setTake([]);
    selAt.current = 0;
  };
  const tapHand = (c: Card) => {
    const now = tapClock();
    if (selected?.id !== c.id) {
      selAt.current = now;
      setSel(c.id);
      setTake([]);
      return;
    }
    if (now - selAt.current < DOUBLE_TAP_MS) return; // the same touch twice
    const move = secondTap(options, takeCards.map((x) => x.id), total);
    if (move) send(c, move);
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
        {final ? null : <TableStrip room={room} sides={view.sides} ids={order} turn={null} score={score} />}
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
  // my cards come from the bottom (my hand), everyone else's from the top (the strip)
  const fromSide = lp && lp.by === h.me ? 'bottom' : 'top';
  const tableW = handW - 32; // inside the felt's padding and frame
  // what the second tap would do, said in the hint line
  const hint = !selected
    ? 'اختر ورقة، واضغطها مرة ثانية للعب'
    : take.length
      ? canTake
        ? 'اضغط ورقتك مرة ثانية للأخذ'
        : 'أكمل المجموع 15 من الطاولة'
      : !options.length
        ? 'لا 15 بهذه الورقة — اضغطها مرة ثانية لوضعها'
        : options.length === 1
          ? 'اضغطها مرة ثانية لأخذ ما يضيء على الطاولة'
          : 'اختر من الطاولة ما يكمل 15';
  return (
    <>
      <TableStrip
        room={room}
        ids={order}
        sides={view.sides}
        turn={view.turn}
        score={score}
        sub={(id) => cardsWord(view.handCounts[id] ?? 0)}
        note={`اليد ${num(view.hand)} من ${num(view.totalHands)} · في الكومة ${num(view.deckLeft)}`}
      />
      <Felt active={myTurn}>
        <PlacedCards
          cards={view.table}
          size="sm"
          width={tableW}
          selected={take}
          glow={glow}
          // with a card selected, the table cards that can't make 15 with it step back
          dim={selected ? view.table.filter((c) => !usableIds.includes(c.id)).map((c) => c.id) : []}
          rings={rings}
          empty="الطاولة فارغة"
          onPress={selected ? (c) => setTake((t) => nextTake(options, t, c.id)) : undefined}
          enter="play"
          from={fromSide}
        />
        <LastPlay play={view.lastPlay} h={h} motion={{ from: fromSide }} />
      </Felt>
      {/* the sum and the hint keep their place: the hand under them never jumps */}
      <View style={{ alignItems: 'center', justifyContent: 'flex-end', minHeight: 58 }}>
        {selected ? (
          <Txt style={{ fontFamily: F.black, fontSize: 22, lineHeight: 32, color: total === TARGET ? C.green : total > TARGET ? C.red : C.text, writingDirection: 'ltr' }}>
            {num(`${[selected, ...takeCards].map((c) => c.rank).join(' + ')} = ${total}`)}
          </Txt>
        ) : null}
        {selected ? (
          <Txt v="small" center color={C.muted} numberOfLines={1}>
            {hint}
          </Txt>
        ) : (
          <TurnLine myTurn={myTurn} text={hint} keep />
        )}
      </View>
      <View style={{ gap: 10 }}>
        <PlacedCards cards={view.myHand} size="lg" width={handW} selected={selected ? [selected.id] : []} onPress={myTurn ? tapHand : undefined} enter="deal" from="top" />
        <View style={{ minHeight: 48, justifyContent: 'center' }}>
          {selected ? (
            <Row gap={10}>
              <Btn flex size="md" icon="grab" label="خذ" color={C.green} disabled={!canTake} onPress={() => send(selected, takeCards.map((c) => c.id))} />
              <Btn flex size="md" icon="down" label="ضعها" ghost onPress={() => send(selected, [])} />
            </Row>
          ) : null}
        </View>
      </View>
    </>
  );
}

const CARD_W = { sm: 46, lg: 68 } as const;

/**
 * Cards in centred lines, first card on the right, each card placed by hand: a card that goes
 * away lets the others glide together, a new one slides in (or flies from where it was).
 */
function PlacedCards({
  cards,
  size,
  width,
  gap = 6,
  selected = [],
  glow = [],
  dim = [],
  rings,
  onPress,
  empty,
  enter,
  from,
}: {
  cards: Card[];
  size: 'sm' | 'lg';
  width: number;
  gap?: number;
  selected?: string[];
  glow?: string[];
  dim?: string[];
  rings?: Record<string, string>;
  onPress?: (c: Card) => void;
  empty?: string;
  enter: 'play' | 'deal';
  from: Side;
}) {
  const cw = CARD_W[size] + 4;
  const ch = CARD_W[size] * 1.5 + 4;
  const lift = 10; // room for the selected card's lift
  if (!cards.length && empty) {
    // an empty table keeps the height of one line of cards: the felt never jumps
    return (
      <View style={{ height: ch + lift, justifyContent: 'center' }}>
        <Txt v="small" center color="rgba(255,255,255,0.6)">
          {empty}
        </Txt>
      </View>
    );
  }
  const perLine = Math.max(1, Math.floor((width + gap) / (cw + gap)));
  const lines = Math.max(1, Math.ceil(cards.length / perLine));
  return (
    <View style={{ width, height: lines * ch + (lines - 1) * gap + lift, alignSelf: 'center', direction: 'ltr' }}>
      {cards.map((c, k) => {
        const line = Math.floor(k / perLine);
        const inLine = Math.min(perLine, cards.length - line * perLine);
        const col = k % perLine;
        const start = (width - (inLine * cw + (inLine - 1) * gap)) / 2;
        return (
          <CardMotion
            key={c.id}
            id={c.id}
            enter={enter}
            from={from}
            place={{ x: start + (inLine - 1 - col) * (cw + gap), y: lift + line * (ch + gap) }}
            style={{ zIndex: selected.includes(c.id) ? 5 : 1 }}>
            <PlayingCard
              card={c}
              size={size}
              selected={selected.includes(c.id)}
              glow={glow.includes(c.id)}
              dim={dim.includes(c.id)}
              ring={rings?.[c.id]}
              onPress={onPress ? () => onPress(c) : undefined}
              steady
            />
          </CardMotion>
        );
      })}
    </View>
  );
}
