import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { SpanishCard } from '@/art/spanish-card';
import { haptic } from '@/lib/sfx';
import { SUIT_INFO, type Card } from '@/shared/cards';
import type { CardSide, FeedItem } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from '../helpers';

type Size = 'xs' | 'sm' | 'md' | 'lg';
const WIDTH: Record<Size, number> = { xs: 30, sm: 46, md: 58, lg: 68 };
const SMALLER: Record<Size, Size> = { lg: 'md', md: 'sm', sm: 'xs', xs: 'xs' };

/** A short hand should sit on one line: step the card size down until it fits the screen. */
function fitSize(size: Size, n: number, gap: number, room: number): Size {
  if (n > 6) return size; // long hands wrap onto several lines anyway
  let s = size;
  while (s !== 'xs' && n * (WIDTH[s] + 4) + (n - 1) * gap > room) s = SMALLER[s];
  return s;
}

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
  const room = useContentWidth() - 16;
  const fitted = fitSize(size, cards.length, gap, room);
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
          size={fitted}
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

/** What the previous player did: their avatar, the card, and what it took (or «رمى ورقة»). */
export function LastPlay({ play, h }: { play: { by: string; card: Card; took: Card[] } | null; h: Helpers }) {
  if (!play) return null;
  return (
    <Animated.View key={`${play.by}-${play.card.id}`} entering={FadeIn.duration(200)} style={styles.lastPlay}>
      <Avatar player={h.player(play.by)} size={24} />
      <PlayingCard card={play.card} size="xs" />
      {play.took.length ? (
        <>
          <Txt v="tiny" color="rgba(255,255,255,0.8)">
            أخذ
          </Txt>
          <Row wrap gap={2} style={{ flexShrink: 1 }}>
            {play.took.map((c) => (
              <PlayingCard key={c.id} card={c} size="xs" />
            ))}
          </Row>
        </>
      ) : (
        <Txt v="tiny" color="rgba(255,255,255,0.8)">
          رمى ورقة
        </Txt>
      )}
    </Animated.View>
  );
}

/**
 * Tap again on the selected card to play it — but a second tap this soon after selecting
 * is an accidental double tap and is ignored.
 */
export const DOUBLE_TAP_MS = 400;
/** Clock for tap handlers only (never call it during render). */
export const tapClock = () => Date.now();

const ANNOUNCE_MS = 2500;

/**
 * A big call-out over the felt (روندا، مسّة، إسطي…). Each new id pops in and hides itself
 * after ~2.5 s. Place it inside <Felt>.
 */
export function AnnounceBanner({ announce, h }: { announce: { by: string | null; text: string; id: number } | null; h: Helpers }) {
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  const id = announce?.id ?? null;
  useEffect(() => {
    if (id === null) return;
    const t = setTimeout(() => setHiddenId(id), ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [id]);
  if (!announce || hiddenId === announce.id) return null;
  return (
    <View pointerEvents="none" style={styles.announceWrap}>
      <Animated.View key={announce.id} entering={ZoomIn.springify().damping(12)} exiting={FadeOut.duration(250)} style={styles.announce}>
        {announce.by ? <Avatar player={h.player(announce.by)} size={34} /> : null}
        <Txt center style={[styles.announceText, announce.text.length > 22 && { fontSize: 18, lineHeight: 28 }]}>
          {announce.text}
        </Txt>
      </Animated.View>
    </View>
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
  lastPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  announceWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', padding: 10, zIndex: 20 },
  announce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
    backgroundColor: C.yellow,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 3,
    borderColor: C.ink,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  announceText: { fontFamily: F.display, fontSize: 26, lineHeight: 38, color: C.ink, flexShrink: 1 },
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
