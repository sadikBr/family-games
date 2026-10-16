import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SpanishCard } from '@/art/spanish-card';
import { haptic } from '@/lib/sfx';
import { SUIT_INFO, type Card } from '@/shared/cards';
import type { CardSide, FeedItem } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from '../helpers';

type Size = 'xs' | 'sm' | 'md' | 'lg';
const WIDTH: Record<Size, number> = { xs: 30, sm: 46, md: 58, lg: 68 };

export function PlayingCard({
  card,
  size = 'md',
  selected,
  dim,
  glow,
  onPress,
}: {
  card: Card | null;
  size?: Size;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  onPress?: () => void;
}) {
  const w = WIDTH[size];
  const face = (
    <View
      style={[
        styles.cardWrap,
        { borderRadius: w * 0.09 + 3, transform: [{ translateY: selected ? -10 : 0 }] },
        selected && { borderColor: C.yellow },
        glow && !selected && { borderColor: alpha(C.yellow, 0.6) },
        dim && { opacity: 0.38 },
      ]}>
      <SpanishCard card={card} width={w} />
    </View>
  );
  if (!onPress) return face;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={3}
      accessibilityRole="button"
      accessibilityLabel={card ? `ورقة ${card.rank} ${SUIT_INFO[card.suit].name}` : 'الكومة'}>
      {face}
    </Pressable>
  );
}

export function CardRow({
  cards,
  size = 'md',
  selected = [],
  glow = [],
  dim = [],
  onPress,
  empty,
  gap = 6,
}: {
  cards: Card[];
  size?: Size;
  selected?: string[];
  glow?: string[];
  dim?: string[];
  onPress?: (c: Card) => void;
  empty?: string;
  gap?: number;
}) {
  if (!cards.length && empty) {
    return (
      <Txt v="small" center color="rgba(255,255,255,0.6)">
        {empty}
      </Txt>
    );
  }
  return (
    <Row wrap gap={gap} center>
      {cards.map((c) => (
        <PlayingCard
          key={c.id}
          card={c}
          size={size}
          selected={selected.includes(c.id)}
          glow={glow.includes(c.id)}
          dim={dim.includes(c.id)}
          onPress={onPress ? () => onPress(c) : undefined}
        />
      ))}
    </Row>
  );
}

/** The green table. */
export function Felt({ children, minHeight = 130, active }: { children: ReactNode; minHeight?: number; active?: boolean }) {
  return <View style={[styles.felt, { minHeight }, active && { borderColor: alpha(C.yellow, 0.7) }]}>{children}</View>;
}

export function sideLabel(side: CardSide, h: Helpers): string {
  return side.members.map((m) => h.player(m).name).join(' و ');
}

/** One compact line of scores. */
export function ScoreStrip({
  sides,
  scores,
  h,
  target,
  lowIsBetter,
}: {
  sides: CardSide[];
  scores: Record<string, number>;
  h: Helpers;
  target?: number;
  lowIsBetter?: boolean;
}) {
  const mine = sides.find((x) => x.members.includes(h.me))?.key;
  const values = sides.map((x) => scores[x.key] ?? 0);
  const best = lowIsBetter ? Math.min(...values) : Math.max(...values);
  return (
    <View style={styles.strip}>
      {sides.map((x) => {
        const v = scores[x.key] ?? 0;
        const lead = v === best && v !== 0;
        return (
          <View key={x.key} style={[styles.stripItem, x.key === mine && styles.stripMine]}>
            <Row gap={-8}>
              {x.members.map((m) => (
                <Avatar key={m} player={h.player(m)} size={22} />
              ))}
            </Row>
            <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 22, color: lead ? C.yellow : C.text }}>{num(v)}</Txt>
          </View>
        );
      })}
      {target ? (
        <Txt v="tiny" color={C.dim}>
          الهدف {target}
        </Txt>
      ) : null}
    </View>
  );
}

/** Opponents / partner around the table: avatar, name, card count; the active one is highlighted. */
export function Seats({
  seats,
  turn,
  counts,
  h,
  out = [],
  label,
}: {
  seats: string[];
  turn: string | null;
  counts: Record<string, number>;
  h: Helpers;
  out?: string[];
  label?: (id: string) => string | null;
}) {
  return (
    <Row gap={8} center wrap>
      {seats.map((id) => {
        const p = h.player(id);
        const active = id === turn;
        return (
          <View key={id} style={[styles.seat, active && styles.seatActive, out.includes(id) && { opacity: 0.35 }]}>
            <Avatar player={p} size={30} />
            <View>
              <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 72 }} color={active ? C.ink : C.text}>
                {p.name}
              </Txt>
              <Txt v="tiny" color={active ? alpha(C.ink, 0.7) : C.dim}>
                {label?.(id) ?? `${counts[id] ?? 0} أوراق`}
              </Txt>
            </View>
          </View>
        );
      })}
    </Row>
  );
}

/** Whose turn it is, in one calm line. */
export function TurnLine({ myTurn, name, text }: { myTurn: boolean; name: string; text?: string }) {
  return (
    <Animated.View key={`${myTurn}-${name}`} entering={FadeIn.duration(180)}>
      <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
        {myTurn ? (text ?? 'دورك') : `دور ${name}…`}
      </Txt>
    </Animated.View>
  );
}

/** The latest event only. */
export function LastEvent({ feed, h }: { feed: FeedItem[]; h: Helpers }) {
  const f = feed[feed.length - 1];
  if (!f) return null;
  return (
    <Animated.View key={f.id} entering={FadeIn.duration(180)} style={styles.event}>
      {f.by ? <Avatar player={h.player(f.by)} size={20} /> : null}
      <Txt v="small" numberOfLines={1} style={{ flexShrink: 1 }}>
        {f.text}
      </Txt>
      {f.points ? (
        <Txt v="tiny" color={C.yellow}>
          +{f.points}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

export function FeedList({ feed, h, max = 4 }: { feed: FeedItem[]; h: Helpers; max?: number }) {
  return (
    <View style={{ gap: 4 }}>
      {feed.slice(-max).map((f) => (
        <Row key={f.id} gap={6}>
          {f.by ? <Avatar player={h.player(f.by)} size={20} /> : null}
          <Txt v="small" color={C.muted} style={{ flex: 1 }} numberOfLines={1}>
            {f.text}
          </Txt>
          {f.points ? (
            <Txt v="tiny" color={C.yellow}>
              +{f.points}
            </Txt>
          ) : null}
        </Row>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  felt: {
    backgroundColor: C.felt,
    borderRadius: 22,
    padding: 14,
    gap: 10,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.feltDark,
  },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  stripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.surface,
  },
  stripMine: { borderWidth: 1, borderColor: alpha(C.yellow, 0.6) },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingStart: 4,
    paddingEnd: 10,
    borderRadius: 999,
    backgroundColor: C.surface,
  },
  seatActive: { backgroundColor: C.yellow },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: '100%',
  },
});
