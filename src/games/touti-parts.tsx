/**
 * «التوتي» — pieces of the screen: the Moroccan card, the green table with the four seats and the
 * trick, my fanned hand, the auction / trump / «الغناء» panels, the contract line, the «لنا / لهم»
 * score sheet and the end-of-hand breakdown. Play goes anticlockwise: the next player sits on my
 * right, my partner in front of me.
 */
import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SpanishCard } from '@/art/spanish-card';
import { haptic } from '@/lib/sfx';
import { SUITS, type Card, type Suit } from '@/shared/cards';
import type { BSuit } from '@/shared/games/baloot';
import type { ToutiSung, ToutiView, TSide } from '@/shared/games/touti';
import { BID_MAX, SING_PLAIN_BID, SING_TRUMP_BID, T_LAST, cardLabel, suitName } from '@/shared/touti-rules';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Txt, num } from '@/ui/txt';

import { SuitIcon } from './baloot-suit';
import { CardMotion, TurnHalo, WinGlow, useCardLook, useLeaving, type Side } from './cards/motion';
import type { Helpers } from './helpers';

/** a Moroccan card is 1.5 times as tall as it is wide */
export const CARD_H = 1.5;
/** Baloot's suit icon draws the Moroccan suits under its own letters */
const B_OF: Record<Suit, BSuit> = { swords: 'S', cups: 'H', coins: 'D', clubs: 'C' };

export function TSuitIcon({ suit, size = 16 }: { suit: Suit; size?: number }) {
  return <SuitIcon suit={B_OF[suit]} size={size} />;
}

/** «⟨icon⟩ الكوباص» */
export function SuitName({ suit, size = 16, color = C.text, bold }: { suit: Suit; size?: number; color?: string; bold?: boolean }) {
  return (
    <Row gap={4} style={{ alignItems: 'center' }}>
      <TSuitIcon suit={suit} size={size} />
      <Txt v={bold ? 'bold' : 'small'} color={color}>
        {suitName(suit)}
      </Txt>
    </Row>
  );
}

export const ToutiCard = memo(function ToutiCard({
  card,
  width,
  dim,
  selected,
  ring,
  onPress,
  steady,
}: {
  card: Card | null;
  width: number;
  dim?: boolean;
  selected?: boolean;
  /** a coloured border (the card that holds / took the trick) */
  ring?: string;
  onPress?: () => void;
  /** keep the tap target mounted while onPress comes and goes (the hand: no blink at a change of turn) */
  steady?: boolean;
}) {
  const r = width * 0.09 + 2;
  // the lift and the dimming glide; the Pressable sits inside the lifted view, so a second tap on the
  // raised card always lands on it
  const look = useCardLook({ lift: selected ? 12 : 0, dim, dimTo: 0.42 });
  const face = (
    <View
      style={{
        borderRadius: r,
        borderWidth: 2,
        borderColor: selected ? C.yellow : (ring ?? 'transparent'),
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}>
      <SpanishCard card={card} width={width - 4} />
    </View>
  );
  return (
    <Animated.View style={look}>
      {onPress || steady ? (
        <Pressable
          disabled={!onPress}
          onPress={() => {
            if (!onPress) return;
            haptic.tap();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={card ? cardLabel(card) : 'ورقة'}>
          {face}
        </Pressable>
      ) : (
        face
      )}
    </Animated.View>
  );
});

/** A small label on a seat (a call, a role, a pair sung). */
function Chip({ text, tone = 'light', suit }: { text: string; tone?: 'light' | 'gold' | 'dark'; suit?: Suit }) {
  const bg = tone === 'gold' ? C.yellow : tone === 'dark' ? 'rgba(0,0,0,0.35)' : '#FFFDF7';
  const fg = tone === 'dark' ? '#FFFFFF' : C.ink;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 0 }, suit ? { flexDirection: 'row', alignItems: 'center', gap: 3 } : null]}>
      {suit ? <TSuitIcon suit={suit} size={12} /> : null}
      <Txt numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 11, lineHeight: 18, color: fg }}>
        {text}
      </Txt>
    </Animated.View>
  );
}

const callText = (c: number | 'pass') => (c === 'pass' ? 'باص' : num(c));

function SeatTag({ v, id, h, width, me, row }: { v: ToutiView; id: string; h: Helpers; width: number; me?: boolean; row?: boolean }) {
  const p = h.player(id);
  const active = v.turn === id;
  const chips: { text: string; tone?: 'light' | 'gold' | 'dark'; suit?: Suit }[] = [];
  const call = v.phase === 'bid' ? v.calls[id] : undefined;
  if (call !== undefined) chips.push({ text: callText(call), tone: call !== 'pass' && v.highBy === id ? 'gold' : 'light' });
  if (v.bidder === id) chips.push({ text: v.bid ? `الشاري ${num(v.bid)}` : 'الشاري', tone: 'gold' });
  for (const x of v.sung.filter((y) => y.by === id)) chips.push({ text: `غناء ${num(`+${x.points}`)}`, suit: x.suit });
  if (v.dealer === id && (v.phase === 'bid' || v.phase === 'trump')) chips.push({ text: 'الموزّع', tone: 'dark' });
  const maxChips = v.phase === 'play' ? 2 : 3;
  return (
    <View style={{ width, alignItems: 'center', gap: 1 }}>
      <Row gap={4} center>
        <View>
          <TurnHalo active={active} size={me ? 26 : 32} />
          <Avatar player={p} size={me ? 26 : 32} ring={active ? C.yellow : undefined} />
        </View>
        {me ? (
          <Txt v="tiny" color="#FFFFFF">
            أنت
          </Txt>
        ) : null}
      </Row>
      {me ? null : (
        <Txt v="tiny" numberOfLines={1} color={active ? C.yellow : '#FFFFFF'} style={{ maxWidth: width, textAlign: 'center' }}>
          {p.name} · {num(v.counts[id] ?? 0)}
        </Txt>
      )}
      <View style={{ flexDirection: row ? 'row' : 'column', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
        {chips.slice(0, maxChips).map((c, i) => (
          <Chip key={`${c.text}${i}`} text={c.text} tone={c.tone} suit={c.suit} />
        ))}
      </View>
    </View>
  );
}

/** Size of the cards in the middle of the table for a table this wide. */
export const trickCardWidth = (w: number) => Math.max(38, Math.min(52, Math.floor((w - 150) / 3)));

/** The green table: partner on top, the next player on my right, the previous one on my left, me at the bottom. */
export function Table({ v, h, width }: { v: ToutiView; h: Helpers; width: number }) {
  const me = v.seats.includes(h.me) ? h.me : v.seats[0];
  const i = v.seats.indexOf(me);
  const right = v.seats[(i + 1) % 4];
  const top = v.seats[(i + 2) % 4];
  const left = v.seats[(i + 3) % 4];
  const tw = trickCardWidth(width);
  const th = tw * CARD_H;
  const TOP = 68;
  const compact = v.phase === 'bid' || v.phase === 'trump';
  // while bidding the middle shows the highest bid; my tag sits right under it (a shorter table)
  const block = 74;
  const height = compact ? TOP + 2 + block + 52 : TOP + th * 2.2 + 30;
  const cx = width / 2;
  const cy = compact ? TOP + 2 + block / 2 : TOP + th * 1.1;
  const dy = th * 0.58;
  const dx = tw * 1.05;
  const pos: Record<string, { x: number; y: number }> = {
    [me]: { x: cx, y: cy + dy },
    [top]: { x: cx, y: cy - dy },
    [left]: { x: cx - dx, y: cy },
    [right]: { x: cx + dx, y: cy },
  };
  const sideW = Math.max(62, Math.min(84, (width - tw * 3.1) / 2 - 4));
  const holder = v.trickWinner;
  const sideOf: Record<string, Side> = { [me]: 'bottom', [top]: 'top', [left]: 'left', [right]: 'right' };
  // where cards go when they leave towards a player: the edge of the table on that player's side
  const seatPoint = (id: string) =>
    id === me ? { x: cx, y: height - 4 } : id === top ? { x: cx, y: 6 } : id === left ? { x: 6, y: cy } : { x: width - 6, y: cy };
  // the completed trick stays (server pause), then gathers in the middle and slides to its taker
  const taker = v.lastTrick?.winner ?? null;
  const trick = useLeaving(v.trick, (t) => t.card.id);
  const lastW = Math.min(24, (width / 2 - tw / 2 - 20) / 4);
  return (
    <View
      style={{
        width,
        height,
        alignSelf: 'center',
        backgroundColor: C.felt,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: v.turn === h.me ? alpha(C.yellow, 0.75) : C.feltDark,
        direction: 'ltr',
        overflow: 'hidden',
      }}>
      <View style={{ position: 'absolute', top: 4, left: 0, right: 0, alignItems: 'center' }}>
        <SeatTag v={v} id={top} h={h} width={Math.min(170, width - 2 * sideW)} row />
      </View>
      <View style={{ position: 'absolute', top: cy - 40, left: 2 }}>
        <SeatTag v={v} id={left} h={h} width={sideW} />
      </View>
      <View style={{ position: 'absolute', top: cy - 40, right: 2 }}>
        <SeatTag v={v} id={right} h={h} width={sideW} />
      </View>
      {compact ? (
        <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, alignItems: 'center' }}>
          <SeatTag v={v} id={me} h={h} width={width - 20} me row />
        </View>
      ) : (
        // during play my card lands at the bottom centre: my tag moves to the corner
        <View style={{ position: 'absolute', bottom: 4, left: 6, width: width / 2 - tw / 2 - 10, alignItems: 'flex-start' }}>
          <SeatTag v={v} id={me} h={h} width={width / 2 - tw / 2 - 10} me row />
        </View>
      )}

      {compact ? (
        <View style={{ position: 'absolute', left: sideW, right: sideW, top: cy - block / 2, height: block, alignItems: 'center', justifyContent: 'center' }}>
          <AuctionCentre v={v} h={h} />
        </View>
      ) : null}

      {!compact && v.lastTrick && v.trick.length < 4 ? (
        // the trick that was just collected, small, in the bottom-right corner (its winning card ringed)
        <Animated.View entering={FadeIn.duration(300).delay(380)} style={{ position: 'absolute', right: 6, bottom: 6 }}>
          {/* the 0.9 opacity on an inner view: the fade-in owns the outer view's opacity */}
          <View style={{ flexDirection: 'row', gap: 2, opacity: 0.9 }}>
            {v.lastTrick.cards.map((x) => (
              <ToutiCard key={x.card.id} card={x.card} width={lastW} ring={x.by === v.lastTrick!.winner ? C.yellow : undefined} />
            ))}
          </View>
        </Animated.View>
      ) : null}

      {compact
        ? null
        : trick.map(({ item: t, leaving }) => {
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
                <WinGlow active={!leaving && won} width={tw} height={th} />
                <ToutiCard card={t.card} width={tw} ring={won ? C.yellow : undefined} />
              </CardMotion>
            );
          })}
    </View>
  );
}

/** The middle of the table during the auction: the highest bid and who made it, then the trump choice. */
function AuctionCentre({ v, h }: { v: ToutiView; h: Helpers }) {
  const soft = 'rgba(255,255,255,0.8)';
  if (v.redeal) {
    return (
      <Txt v="bold" center color={soft}>
        لا مزايدة — توزيع جديد
      </Txt>
    );
  }
  if (v.high === null) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Txt v="tiny" color={soft}>
          المزايدة
        </Txt>
        <Txt v="bold" color="#FFFFFF" center>
          تبدأ من {num(70)}
        </Txt>
      </View>
    );
  }
  return (
    <Animated.View key={`${v.high}-${v.phase}`} entering={FadeIn.duration(220)} style={{ alignItems: 'center' }}>
      <Txt v="tiny" color={soft} numberOfLines={1}>
        {v.phase === 'trump' ? 'الشاري — اختيار الطرونفو' : 'أعلى مزايدة'}
      </Txt>
      <Txt style={{ fontFamily: F.display, fontSize: 34, lineHeight: 44, color: C.yellow }}>{num(v.high)}</Txt>
      <Txt v="tiny" color="#FFFFFF" numberOfLines={1}>
        {v.highBy ? h.player(v.highBy).name : ''}
      </Txt>
    </Animated.View>
  );
}

/** My cards, overlapping in a gentle fan; illegal cards dimmed while it is my turn. */
export function HandFan({
  cards,
  width,
  playable,
  myTurn,
  selected,
  onPress,
}: {
  cards: Card[];
  width: number;
  playable: string[];
  myTurn: boolean;
  selected: string | null;
  onPress?: (c: Card) => void;
}) {
  const n = cards.length;
  if (!n) return null;
  const w = Math.max(48, Math.min(64, Math.floor(width / 4.8)));
  const step = n > 1 ? Math.min(w + 4, (width - w) / (n - 1)) : 0;
  const total = w + step * (n - 1);
  const start = (width - total) / 2;
  const mid = (n - 1) / 2;
  return (
    <View style={{ width, height: w * CARD_H + 22, direction: 'ltr', alignSelf: 'center' }}>
      {cards.map((c, k) => {
        const off = k - mid;
        const sel = selected === c.id;
        return (
          <CardMotion
            key={c.id}
            id={c.id}
            enter="deal"
            from="top"
            place={{ x: start + k * step, y: 12 + Math.abs(off) * Math.abs(off) * 0.45, rot: off * 1.8 }}
            // the selected card comes to the front: the whole raised card answers the second tap
            style={{ zIndex: sel ? 50 : k + 1 }}>
            <ToutiCard card={c} width={w} selected={sel} dim={myTurn && !playable.includes(c.id)} onPress={onPress ? () => onPress(c) : undefined} steady />
          </CardMotion>
        );
      })}
    </View>
  );
}

function Pill({ text, color = C.surfaceStrong }: { text: string; color?: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10 }}>
      <Txt v="tiny" color="#FFFFFF" style={{ lineHeight: 22 }}>
        {text}
      </Txt>
    </View>
  );
}

/** «90 · الطرونفو: ⟨icon⟩ الكوباص — الشاري: بابا», or the auction's state before that. */
export function ContractBar({ v, h }: { v: ToutiView; h: Helpers }) {
  const accent = useAccent();
  if (!v.bid) {
    return (
      <Row center gap={6} wrap>
        <Pill text="المزايدة" color={alpha(accent, 0.55)} />
        <Txt v="tiny" color={C.muted}>
          اليد {num(v.hand)} · التوزيع: {h.player(v.dealer).name}
        </Txt>
      </Row>
    );
  }
  return (
    <Row center gap={6} wrap>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: alpha(accent, 0.2),
          borderColor: accent,
          borderWidth: 1.5,
          borderRadius: 999,
          paddingHorizontal: 10,
        }}>
        <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 26, color: C.yellow }}>{num(v.bid)}</Txt>
        {v.trump ? (
          <>
            <Txt v="tiny" color={C.muted}>
              الطرونفو:
            </Txt>
            <SuitName suit={v.trump} bold color="#FFFFFF" />
          </>
        ) : (
          <Txt v="tiny" color={C.muted}>
            الطرونفو قيد الاختيار
          </Txt>
        )}
      </View>
      <Txt v="small" color={C.muted} numberOfLines={1}>
        الشاري: {h.player(v.bidder).name}
      </Txt>
    </Row>
  );
}

/** The auction on my turn: a number to bid (stepper from the lowest allowed to 230), or «باص». */
export function BidPanel({ v, width, onBid }: { v: ToutiView; width: number; onBid: (bid: number | 'pass') => void }) {
  const opts = v.myBids;
  const low = opts[0] ?? BID_MAX;
  const [pick, setPick] = useState(low);
  // a raise by someone else moves the lowest bid allowed: the stepper never shows less
  const value = Math.max(pick, low);
  if (!opts.length) return null;
  const hint =
    value >= SING_TRUMP_BID ? 'بهذه المزايدة يُغنّى زوج الطرونفو (40) والأزواج الأخرى (20)' : value >= SING_PLAIN_BID ? 'بهذه المزايدة تُغنّى الأزواج العادية (20)، وزوج الطرونفو من 90' : 'بمزايدة 70 لا غناء';
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8 }}>
      <Txt v="bold" center color={C.yellow}>
        {v.high === null ? 'زايد من 70، أو «باص»' : `أعلى مزايدة ${num(v.high)} — زايد فوقها أو «باص»`}
      </Txt>
      <Row center gap={10}>
        <IconBtn icon="minus" size={44} label="أقل" onPress={() => setPick(Math.max(low, value - 10))} />
        <Txt style={{ fontFamily: F.display, fontSize: 30, lineHeight: 40, minWidth: 70, textAlign: 'center', color: C.text }}>{num(value)}</Txt>
        <IconBtn icon="plus" size={44} label="أكثر" onPress={() => setPick(Math.min(BID_MAX, value + 10))} />
      </Row>
      <Txt v="tiny" center color={C.muted}>
        {hint}
      </Txt>
      <Row gap={8} center>
        <Btn size="md" label={`مزايدة ${num(value)}`} color={C.yellow} style={{ width: (width - 8) * 0.6 }} onPress={() => onBid(value)} />
        <Btn size="md" label="باص" ghost style={{ width: (width - 8) * 0.4 }} onPress={() => onBid('pass')} />
      </Row>
    </Animated.View>
  );
}

/** A suit to name as the trump. */
function SuitBtn({ suit, count, width, onPress }: { suit: Suit; count: number; width: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`الطرونفو ${suitName(suit)}`}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width,
        alignItems: 'center',
        gap: 1,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: '#FBF6EA',
        borderBottomWidth: 3,
        borderBottomColor: alpha(C.ink, 0.25),
        opacity: pressed ? 0.75 : 1,
      })}>
      <TSuitIcon suit={suit} size={26} />
      <Txt numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 12, lineHeight: 18, color: C.ink }}>
        {suitName(suit)}
      </Txt>
      <Txt numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 10, lineHeight: 15, color: alpha(C.ink, 0.6) }}>
        {count === 0 ? 'لا أوراق' : count === 1 ? 'ورقة' : count === 2 ? 'ورقتان' : `${num(count)} أوراق`}
      </Txt>
    </Pressable>
  );
}

/** The bidder names the trump. */
export function TrumpPanel({ v, width, onPick }: { v: ToutiView; width: number; onPick: (suit: Suit) => void }) {
  const bw = (width - 18) / 4;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8 }}>
      <Txt v="bold" center color={C.yellow}>
        المزايدة لك بـ {num(v.bid ?? 0)} — اختر الطرونفو
      </Txt>
      <Row gap={6} center>
        {SUITS.map((s) => (
          <SuitBtn key={s} suit={s} count={v.myHand.filter((c) => c.suit === s).length} width={bw} onPress={() => onPick(s)} />
        ))}
      </Row>
    </Animated.View>
  );
}

/** «الغناء»: the pairs I may sing now (12 + 11 of a suit), or let it go. */
export function SingPanel({ v, width, onSing }: { v: ToutiView; width: number; onSing: (suit: Suit | null) => void }) {
  if (!v.mySing.length) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8, alignItems: 'center' }}>
      <Txt v="bold" center color={C.yellow}>
        الغناء: الملك والفارس من شكل واحد
      </Txt>
      {v.mySing.map((p) => {
        const pair = v.myHand.filter((c) => c.suit === p.suit && (c.rank === 12 || c.rank === 11)).sort((a, b) => b.rank - a.rank);
        return (
          <Pressable
            key={p.suit}
            accessibilityRole="button"
            accessibilityLabel={`غناء ${suitName(p.suit)}`}
            onPress={() => {
              haptic.tap();
              onSing(p.suit);
            }}
            style={({ pressed }) => ({
              width,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: C.yellow,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Row gap={3} style={{ direction: 'ltr' }}>
              {pair.map((c) => (
                <ToutiCard key={c.id} card={c} width={30} />
              ))}
            </Row>
            <Txt style={{ fontFamily: F.display, fontSize: 18, lineHeight: 28, color: C.ink }}>
              غناء {suitName(p.suit)} {num(`+${p.points}`)}
            </Txt>
          </Pressable>
        );
      })}
      <Btn size="md" label="بلا غناء" ghost style={{ width }} onPress={() => onSing(null)} />
    </Animated.View>
  );
}

/** The pairs sung this hand, face up for everyone. */
export function SungLine({ sung, h, trump }: { sung: ToutiSung[]; h: Helpers; trump: Suit | null }) {
  if (!sung.length) return null;
  return (
    <Row center gap={6} wrap>
      {sung.map((x) => (
        <Animated.View
          key={x.suit}
          entering={FadeIn.duration(250)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: x.suit === trump ? C.yellow : C.borderStrong }}>
          <Avatar player={h.player(x.by)} size={18} />
          <Row gap={2} style={{ direction: 'ltr' }}>
            <ToutiCard card={{ id: `${x.suit}-12`, suit: x.suit, rank: 12 }} width={18} />
            <ToutiCard card={{ id: `${x.suit}-11`, suit: x.suit, rank: 11 }} width={18} />
          </Row>
          <Txt v="tiny" color={x.suit === trump ? C.yellow : C.text}>
            {num(`+${x.points}`)}
          </Txt>
        </Animated.View>
      ))}
    </Row>
  );
}

const sideWord = (side: TSide, mine: TSide | null, v: ToutiView, h: Helpers) =>
  mine ? (side === mine ? 'لنا' : 'لهم') : v.sides.find((x) => x.key === side)!.members.map((m) => h.player(m).name).join(' و');

/** «لنا / لهم»: one row per hand (the bid that was won or lost) and the totals, like a real score sheet. */
export function ScoreSheet({ v, h, compact }: { v: ToutiView; h: Helpers; compact?: boolean }) {
  const mine = (v.sides.find((x) => x.members.includes(h.me))?.key ?? null) as TSide | null;
  const cols: TSide[] = mine ? [mine, mine === 'A' ? 'B' : 'A'] : ['A', 'B'];
  const rows = compact ? v.history.slice(-4) : v.history;
  return (
    <View style={{ backgroundColor: '#FBF6EA', borderRadius: 14, padding: 10, gap: 2 }}>
      <Row gap={8}>
        {cols.map((s) => (
          <Txt key={s} numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 20, lineHeight: 30, color: C.ink }}>
            {sideWord(s, mine, v, h)}
          </Txt>
        ))}
      </Row>
      <View style={{ height: 2, backgroundColor: C.ink, opacity: 0.7 }} />
      {rows.map((r, k) => (
        <Row key={k} gap={8}>
          {cols.map((s) => (
            <View key={s} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
              <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24, color: r[s] ? C.ink : alpha(C.ink, 0.35) }}>{r[s] ? num(r[s]) : '—'}</Txt>
              {/* the defenders' row of a lost bid */}
              {!r.success && r[s] ? <Txt style={{ fontFamily: F.bold, fontSize: 10, lineHeight: 16, color: C.red }}>تغطيس</Txt> : null}
            </View>
          ))}
        </Row>
      ))}
      {v.history.length ? <View style={{ height: 1.5, backgroundColor: C.ink, opacity: 0.5 }} /> : null}
      <Row gap={8}>
        {cols.map((s) => (
          <Txt key={s} style={{ flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 24, lineHeight: 34, color: v.winner === s ? C.green : C.ink }}>
            {num(v.scores[s])}
          </Txt>
        ))}
      </Row>
      <Txt v="tiny" center color={alpha(C.ink, 0.6)}>
        الهدف {num(v.target)}
      </Txt>
    </View>
  );
}

/** The end-of-hand breakdown: what the bidding team made against its bid, and who scores it. */
export function HandBreakdown({ v, h }: { v: ToutiView; h: Helpers }) {
  const r = v.result;
  if (!r) return null;
  const mine = (v.sides.find((x) => x.members.includes(h.me))?.key ?? null) as TSide | null;
  const cols: TSide[] = mine ? [mine, mine === 'A' ? 'B' : 'A'] : ['A', 'B'];
  const sungPts = r.sung.reduce((t, x) => t + x.points, 0);
  const line = (label: string, val: (s: TSide) => string, bold?: boolean) => (
    <Row gap={8} key={label}>
      <Txt v={bold ? 'bold' : 'small'} color={bold ? C.text : C.muted} style={{ flex: 1.3 }} numberOfLines={1}>
        {label}
      </Txt>
      {cols.map((s) => (
        <Txt key={s} v={bold ? 'h3' : 'bold'} color={bold ? (r.points[s] ? C.yellow : C.dim) : C.text} style={{ flex: 1, textAlign: 'center' }}>
          {val(s)}
        </Txt>
      ))}
    </Row>
  );
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 18, padding: 12, gap: 4 }}>
      <Row center gap={6} wrap>
        <Txt v="bold">المزايدة {num(r.bid)}</Txt>
        <Txt v="small" color={C.muted}>
          ·
        </Txt>
        <SuitName suit={r.trump} bold />
        <Txt v="small" color={C.muted}>
          · الشاري: {h.player(r.bidder).name}
        </Txt>
      </Row>
      <Txt v="bold" center color={r.success ? C.green : C.red}>
        {r.success ? `نجاح المزايدة: ${num(r.made)} من ${num(r.bid)}` : `تغطيس: ${num(r.made)} من ${num(r.bid)} — المزايدة للخصمين`}
      </Txt>
      <Row gap={8}>
        <View style={{ flex: 1.3 }} />
        {cols.map((s) => (
          <Txt key={s} v="tiny" color={s === r.bidSide ? C.yellow : C.muted} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {sideWord(s, mine, v, h)}
            {s === r.bidSide ? ' (الشاري)' : ''}
          </Txt>
        ))}
      </Row>
      {line('نقاط الأوراق', (s) => num(r.cards[s] - (r.last === s ? T_LAST : 0)))}
      {line('الدير', (s) => (r.last === s ? num(T_LAST) : '—'))}
      {line('الأكلات', (s) => num(r.tricks[s]))}
      {line('الغناء', (s) => (s === r.bidSide && sungPts ? num(`+${sungPts}`) : '—'))}
      {line('مجموع الشاري', (s) => (s === r.bidSide ? num(r.made) : '—'))}
      <View style={{ height: 1, backgroundColor: C.borderStrong, marginVertical: 2 }} />
      {line('نقاط اليد', (s) => (r.points[s] ? num(`+${r.points[s]}`) : '—'), true)}
      <Txt v="tiny" center color={C.dim}>
        النقاط الخام لا تُسجَّل: يربح فريق واحد قيمة المزايدة
      </Txt>
    </View>
  );
}

/** One line under the table: trick number, and the bidding team's count against its bid. */
export function InfoRow({ v }: { v: ToutiView }) {
  if (v.phase !== 'play' || !v.bidder) return null;
  const bidSide = (v.sides.find((x) => x.members.includes(v.bidder!))?.key ?? 'A') as TSide;
  const def: TSide = bidSide === 'A' ? 'B' : 'A';
  const made = v.cards[bidSide] + v.sung.reduce((t, x) => t + x.points, 0);
  return (
    <Txt v="tiny" center color={C.dim} numberOfLines={1}>
      الأكلة {num(Math.min(v.trickNo, 10))} من {num(10)} · الشاري {num(made)} من {num(v.bid ?? 0)} · الخصمان {num(v.cards[def])}
    </Txt>
  );
}
