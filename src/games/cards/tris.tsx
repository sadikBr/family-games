import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { SpanishCard } from '@/art/spanish-card';
import type { Card } from '@/shared/cards';
import type { TrisClaimView } from '@/shared/games/tris-claim';
import type { RoomView, TrisView } from '@/shared/protocol';
import { C, F } from '@/theme';
import { Avatar } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers, type Helpers } from '../helpers';
import { Felt, HandRows, PlayingCard, SidesResult, TableStrip, TurnLine, cardsWord, sideLabel, sideScore, stripOrder, useTapToPlay } from './card-ui';
import { ClaimButton, ClaimNote, ClaimReveal } from './claim';
import { CardMotion, CardStage, EASE, MOTION, SoftNumber, TurnHalo, WinGlow, useLeaving, type Side } from './motion';

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
  const myTurn = view.phase === 'play' && view.turn === h.me;
  // tap a card to select it, tap it again to play it (the button stays for those who prefer it)
  const tap = useTapToPlay({
    canPlay: (id) => myTurn && view.playable.includes(id),
    onPlay: (id) => h.act('play', { card: id }),
  });
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase, so it stays mounted from hand to hand (the new hand deals in smoothly)
  return (
    <CardStage>
      <TrisScreen room={room} view={view} tap={tap} myTurn={myTurn} />
    </CardStage>
  );
}

function TrisScreen({ room, view, tap, myTurn }: { room: RoomView; view: TrisView & TrisClaimView; tap: ReturnType<typeof useTapToPlay>; myTurn: boolean }) {
  const h = helpers(room);
  const mySide = view.sides.find((x) => x.members.includes(h.me))!.key;
  const partner = view.sides.find((x) => x.key === mySide)!.members.find((m) => m !== h.me)!;
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
          <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="tris" size={72} />} title={winnerSide ? `الفوز ${li(sideLabel(winnerSide, h))}` : 'انتهت اللعبة'} />
        ) : (
          <PhaseTitle art={<GameArt id="tris" size={60} />} title={`نهاية اليد ${num(view.hand)}`} />
        )}
        {final ? <SidesResult sides={view.sides} scores={view.scores} h={h} winner={view.winner} /> : null}
        {view.claimed ? <ClaimNote mine={view.claimed.side === mySide} /> : null}
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
        {final ? null : <TableStrip room={room} sides={view.sides} ids={order} turn={null} score={score} note={`الهدف ${num(view.target)} نقطة`} />}
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

  const selected = tap.selected;
  const trickOver = view.phase === 'trickEnd' && !!view.trickWinner;
  return (
    <>
      <TableStrip
        room={room}
        ids={order}
        sides={view.sides}
        turn={view.phase === 'play' ? view.turn : null}
        score={score}
        sub={(id) => (id === partner ? `شريكك · ${cardsWord(view.handCounts[id] ?? 0)}` : cardsWord(view.handCounts[id] ?? 0))}
        note={`الهدف ${num(view.target)} نقطة`}
      />
      <Felt active={myTurn}>
        <TrickTable view={view} h={h} mySide={mySide} />
        {/* one line that never comes and goes: the trick number, then who took it */}
        <Txt v={trickOver ? 'bold' : 'tiny'} center numberOfLines={1} color={trickOver ? C.yellow : 'rgba(255,255,255,0.7)'} style={{ height: 24, lineHeight: 24 }}>
          {trickOver ? `اللمّة لـ ${h.player(view.trickWinner!).name}` : `اللمّة ${num(view.trickNo)} من ${num(10)}`}
        </Txt>
      </Felt>
      {/* «الباقي لنا»: the option above my hand, then the claimer's cards face up */}
      {view.canClaim && !view.claimed ? <ClaimButton onPress={() => h.act('claim')} /> : null}
      {view.claimed ? (
        <ClaimReveal
          claimed={view.claimed}
          mySide={mySide}
          sideNames={(side) => view.sides.find((x) => x.key === side)!.members.map((m) => h.player(m).name).join(' و')}
          h={h}
          renderCard={(c) => <PlayingCard card={c} size="xs" />}
        />
      ) : null}
      {/* the hand glides down (instead of jumping) when the claim option comes */}
      <Animated.View layout={LinearTransition.duration(MOTION.glide).easing(EASE)} style={{ gap: 14 }}>
        <TurnLine myTurn={myTurn} text={view.trick.length ? 'العب من النوع نفسه إن كان لديك' : 'ابدأ اللمّة بأي ورقة'} keep />
        <HandFan cards={view.myHand} playable={view.playable} myTurn={myTurn} selected={selected} onPress={myTurn ? (c) => tap.tap(c.id) : undefined} />
        {/* the button's place is always kept: nothing jumps when a card is selected or played */}
        <View style={{ minHeight: 56, justifyContent: 'center' }}>
          {myTurn && selected ? <Btn size="lg" icon="down" label="العب هذه الورقة" onPress={tap.play} /> : null}
        </View>
      </Animated.View>
    </>
  );
}

const CARD_W = { sm: 46, md: 58 } as const;

/**
 * The trick on the green table: partner on top, the next player on my right, the previous one on
 * my left, me at the bottom. Each card slides in from its player's side (mine flies from my hand),
 * the trick that was taken gathers in the middle and slides to the taker.
 */
function TrickTable({ view, h, mySide }: { view: TrisView; h: Helpers; mySide: string }) {
  const width = useContentWidth() - 32; // inside the felt's padding and frame
  const size = width >= 280 ? 'md' : 'sm';
  const tw = CARD_W[size] + 4; // the card and its 2 px frame
  const th = CARD_W[size] * 1.5 + 4;
  const dy = Math.round(th * 0.6);
  const dx = Math.round(tw * 1.15);
  const height = 2 * dy + th + 8;
  const cx = width / 2;
  const cy = height / 2;
  const seats = view.participants;
  const i = seats.indexOf(h.me);
  const me = h.me;
  const right = seats[(i + 1) % 4];
  const top = seats[(i + 2) % 4];
  const left = seats[(i + 3) % 4];
  const pos: Record<string, { x: number; y: number }> = {
    [me]: { x: cx, y: cy + dy },
    [top]: { x: cx, y: cy - dy },
    [left]: { x: cx - dx, y: cy },
    [right]: { x: cx + dx, y: cy },
  };
  const sideOf: Record<string, Side> = { [me]: 'bottom', [top]: 'top', [left]: 'left', [right]: 'right' };
  const trick = useLeaving(view.trick, (t) => t.card.id);
  const taker = view.lastTrick?.winner ?? null;
  // while the trick is open, the card that would take it glows softly; once complete, the winner's
  const holder = view.trickWinner ?? (view.trick.length > 1 ? leading(view.trick) : null);
  const AV = 26;
  const avatarAt: Record<string, { left: number; top: number }> = {
    [top]: { left: cx + tw / 2 + 10, top: 6 },
    [me]: { left: cx + tw / 2 + 10, top: height - AV - 6 },
    [left]: { left: 8, top: cy - AV / 2 },
    [right]: { left: width - AV - 8, top: cy - AV / 2 },
  };
  // where a taken trick goes: towards the taker's avatar
  const seatPoint = (id: string) => ({ x: avatarAt[id].left + AV / 2, y: avatarAt[id].top + AV / 2 });
  const cornerW = cx - tw / 2 - 12;
  const mini = Math.min(18, Math.floor((cornerW - 6) / 4) - 2);
  const last = view.phase === 'play' ? view.lastTrick : null;
  return (
    <View style={{ width, height, alignSelf: 'center', direction: 'ltr' }}>
      {seats.map((id) => {
        const p = h.player(id);
        const active = view.phase === 'play' && view.turn === id;
        return (
          <View key={id} style={{ position: 'absolute', ...avatarAt[id] }}>
            <TurnHalo active={active} size={AV} />
            <Avatar player={p} size={AV} ring={active ? C.yellow : undefined} />
          </View>
        );
      })}

      {/* my team's points in this hand, top corner */}
      <View style={{ position: 'absolute', left: 6, top: 4, width: cornerW, alignItems: 'flex-start' }}>
        <Txt v="tiny" numberOfLines={1} color="rgba(255,255,255,0.7)" style={{ lineHeight: 16 }}>
          لفريقك في اليد
        </Txt>
        <SoftNumber
          value={view.handThirds[mySide] ?? 0}
          render={(v) => <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26, color: '#FFFFFF' }}>{thirdsText(v)}</Txt>}
        />
      </View>

      {/* the trick taken just before, small, bottom corner (the winning card framed) */}
      {last ? (
        <Animated.View key={last.cards[0]?.card.id} entering={FadeIn.duration(300).delay(420)} style={{ position: 'absolute', left: 6, bottom: 4, width: cornerW, gap: 2, alignItems: 'flex-start' }}>
          <Txt v="tiny" numberOfLines={1} color="rgba(255,255,255,0.7)" style={{ lineHeight: 16 }}>
            آخر أكلة
          </Txt>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {last.cards.map((x) => (
              <MiniCard key={x.card.id} card={x.card} width={mini} won={x.by === last.winner} />
            ))}
          </View>
        </Animated.View>
      ) : null}

      {trick.map(({ item: t, leaving }) => {
        const p = pos[t.by];
        if (!p) return null;
        const won = leaving ? taker === t.by : holder === t.by;
        const dest = leaving && taker ? seatPoint(taker) : p;
        return (
          <CardMotion
            key={t.card.id}
            id={t.card.id}
            enter="play"
            from={sideOf[t.by]}
            source={false}
            place={{ x: p.x - tw / 2, y: p.y - th / 2 }}
            leaving={leaving}
            leave={{ via: { x: cx - p.x, y: cy - p.y }, to: { x: dest.x - p.x, y: dest.y - p.y }, scale: 0.72 }}
            style={{ zIndex: leaving ? (won ? 2 : 1) : won ? 7 : 6 }}>
            <WinGlow active={!leaving && won && !!view.trickWinner} width={tw} height={th} />
            <PlayingCard card={t.card} size={size} glow={won} ring={won && view.trickWinner ? C.yellow : undefined} />
          </CardMotion>
        );
      })}
    </View>
  );
}

function MiniCard({ card, width, won }: { card: Card; width: number; won: boolean }) {
  return (
    <View style={{ borderRadius: 3, borderWidth: 1.5, borderColor: won ? C.yellow : 'transparent' }}>
      <SpanishCard card={card} width={width} />
    </View>
  );
}

/**
 * My ten cards in one gentle fan (they overlap; each card's corner stays visible). The selected
 * card rises and comes to the front, so the whole raised card answers the second tap; cards that
 * can't be played now are dimmed while it's my turn.
 */
function HandFan({ cards, playable, myTurn, selected, onPress }: { cards: Card[]; playable: string[]; myTurn: boolean; selected: string | null; onPress?: (c: Card) => void }) {
  const width = useContentWidth();
  const n = cards.length;
  const size = width >= 300 ? 'md' : 'sm';
  const w = CARD_W[size] + 4;
  const ch = CARD_W[size] * 1.5 + 4;
  const step = n > 1 ? Math.min(w + 4, (width - w) / (n - 1)) : 0;
  const total = w + step * (n - 1);
  const start = (width - total) / 2;
  const mid = (n - 1) / 2;
  const curve = n > 6 ? 0.55 : 0.8;
  const tilt = n > 6 ? 1.6 : 2.2;
  return (
    <View style={{ width, height: ch + 26, direction: 'ltr', alignSelf: 'center' }}>
      {cards.map((c, k) => {
        const off = k - mid;
        const sel = selected === c.id;
        return (
          <CardMotion
            key={c.id}
            id={c.id}
            enter="deal"
            from="top"
            place={{ x: start + k * step, y: 14 + off * off * curve, rot: off * tilt }}
            style={{ zIndex: sel ? 50 : k + 1 }}>
            <PlayingCard card={c} size={size} selected={sel} dim={myTurn && !playable.includes(c.id)} onPress={onPress ? () => onPress(c) : undefined} steady />
          </CardMotion>
        );
      })}
    </View>
  );
}
