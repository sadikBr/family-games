import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { SpanishCard } from '@/art/spanish-card';
import { haptic } from '@/lib/sfx';
import { cardName, type Card } from '@/shared/cards';
import type { CardSide, FeedItem, PlayerPublic, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card as Panel, Row } from '@/ui/bits';
import { Podium } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from '../helpers';
import { PlayerStrip, type StripEntry } from '../player-strip';

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
  ring,
  onPress,
}: {
  card: Card | null;
  size?: Size;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  /** a player's colour around the card (the card they just played) */
  ring?: string;
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
        ring && !selected && { borderColor: ring, borderWidth: 3 },
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
      accessibilityLabel={card ? `ورقة ${cardName(card)}` : 'الكومة'}>
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
  rings,
  onPress,
  empty,
  gap = 6,
}: {
  cards: Card[];
  size?: Size;
  selected?: string[];
  glow?: string[];
  dim?: string[];
  /** card id → a player's colour (the card that player just put down) */
  rings?: Record<string, string>;
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
          ring={rings?.[c.id]}
          onPress={onPress ? () => onPress(c) : undefined}
        />
      ))}
    </Row>
  );
}

/** «ورقة» / «ورقتان» / «3 أوراق» / «11 ورقة» */
export const cardsWord = (k: number) => (k === 1 ? 'ورقة' : k === 2 ? 'ورقتان' : k <= 10 ? `${num(k)} أوراق` : `${num(k)} ورقة`);

/**
 * The green table, framed in the game's own colour; the frame turns saffron while it's my turn.
 * `bg` replaces the felt (UNO FLIP's dark side).
 */
export function Felt({ children, minHeight = 130, active, bg }: { children: ReactNode; minHeight?: number; active?: boolean; bg?: string }) {
  const accent = useAccent();
  return (
    <View style={[styles.felt, { minHeight, borderColor: alpha(accent, 0.6) }, bg ? { backgroundColor: bg } : null, active && { borderColor: alpha(C.yellow, 0.85) }]}>
      {children}
    </View>
  );
}

/**
 * The players around the table as one strip of chips (the house PlayerStrip): whose turn it is is
 * framed in their colour. Team games list the players team by team, so partners sit side by side and
 * share their team's score. `note` is one small line under the strip (the target…).
 */
export function TableStrip({
  room,
  ids,
  turn,
  score,
  sub,
  out = [],
  note,
}: {
  room: RoomView;
  ids: string[];
  turn: string | null;
  score?: (id: string) => number | string | undefined;
  sub?: (id: string) => string | undefined;
  out?: string[];
  note?: string;
}) {
  const entries: StripEntry[] = ids.map((id) => ({ id, score: score?.(id), sub: sub?.(id), out: out.includes(id) }));
  return (
    <View style={{ gap: 4 }}>
      <PlayerStrip room={room} entries={entries} active={turn ? [turn] : []} />
      {note ? (
        <Txt v="tiny" center color={C.dim}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** Seat order for a strip: team by team (my team first), or the table order when everyone plays alone. */
export function stripOrder(sides: CardSide[], participants: string[], me: string): string[] {
  if (sides.every((x) => x.members.length === 1)) return participants;
  const mine = sides.find((x) => x.members.includes(me));
  const rest = sides.filter((x) => x !== mine);
  return [...(mine ? [mine] : []), ...rest].flatMap((x) => (mine === x ? [me, ...x.members.filter((m) => m !== me)] : x.members));
}

/**
 * The final standings of the sides: a podium when everyone played alone, the teams' totals otherwise
 * (the winning team framed in green).
 */
export function SidesResult({ sides, scores, h, winner, lowIsBetter }: { sides: CardSide[]; scores: Record<string, number>; h: Helpers; winner: string | null; lowIsBetter?: boolean }) {
  if (sides.every((x) => x.members.length === 1)) {
    const players = sides.map((x) => h.player(x.members[0]));
    return <Podium players={players} scores={Object.fromEntries(sides.map((x) => [x.members[0], scores[x.key] ?? 0]))} lowIsBetter={lowIsBetter} />;
  }
  const sorted = [...sides].sort((a, b) => (lowIsBetter ? -1 : 1) * ((scores[b.key] ?? 0) - (scores[a.key] ?? 0)));
  return (
    <View style={{ gap: 8 }}>
      {sorted.map((x) => {
        const won = x.key === winner;
        return (
          <View key={x.key} style={[styles.teamRow, won && { borderColor: C.green, backgroundColor: alpha(C.green, 0.14) }]}>
            <Row gap={-10}>
              {x.members.map((m) => (
                <Avatar key={m} player={h.player(m)} size={34} crown={won} />
              ))}
            </Row>
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
              {sideLabel(x, h)}
              {x.members.includes(h.me) ? ' (أنت)' : ''}
            </Txt>
            <Txt style={{ fontFamily: F.black, fontSize: 22, lineHeight: 30, color: won ? C.green : C.text }}>{num(scores[x.key] ?? 0)}</Txt>
          </View>
        );
      })}
    </View>
  );
}

/** The score of the side a player belongs to. */
export const sideScore = (sides: CardSide[], scores: Record<string, number>, id: string) => scores[sides.find((x) => x.members.includes(id))?.key ?? ''] ?? 0;

/** A hand's results as rows: who, a detail (cards, tricks…), the points; `extra` goes under the row. */
export function HandRows({ rows, title }: { rows: { key: string; players: PlayerPublic[]; name: string; detail?: string; points: string; tone: 'good' | 'bad' | 'plain' | 'dim'; extra?: ReactNode }[]; title?: string }) {
  return (
    <Panel style={{ gap: 10 }}>
      {title ? (
        <Txt v="small" color={C.muted}>
          {title}
        </Txt>
      ) : null}
      {rows.map((r) => (
        <View key={r.key} style={{ gap: 4 }}>
          <Row gap={8}>
            <Row gap={-8}>
              {r.players.map((p) => (
                <Avatar key={p.id} player={p} size={26} />
              ))}
            </Row>
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
              {r.name}
            </Txt>
            {r.detail ? (
              <Txt v="small" color={C.muted}>
                {r.detail}
              </Txt>
            ) : null}
            <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26, minWidth: 40, textAlign: 'center', color: r.tone === 'good' ? C.green : r.tone === 'bad' ? C.red : r.tone === 'dim' ? C.dim : C.text }}>
              {r.points}
            </Txt>
          </Row>
          {r.extra}
        </View>
      ))}
    </Panel>
  );
}


export function sideLabel(side: CardSide, h: Helpers): string {
  return side.members.map((m) => h.player(m).name).join(' و ');
}

/**
 * What to do now, shown only on my turn: whose turn it is is already in the room's turn bar, so
 * nothing is shown while another player plays.
 */
export function TurnLine({ myTurn, text }: { myTurn: boolean; name?: string; text?: string }) {
  if (!myTurn) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Txt v="bold" center color={C.yellow}>
        {text ?? 'دورك'}
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

/**
 * What the last player did, big enough to follow from across the room: their avatar and name in
 * their colour, the card they played, and the cards it took (or «رمى ورقة»). It stays until the
 * next play. `title` replaces the verb line (e.g. «آخر لعبة» on the end-of-hand screen).
 */
export function LastPlay({ play, h, title }: { play: { by: string; card: Card; took: Card[] } | null; h: Helpers; title?: string }) {
  if (!play) return null;
  const p = h.player(play.by);
  const n = play.took.length;
  // nouns, not verbs: we don't know whether the player is a man or a woman
  const verb = n ? `أخذٌ: ${cardsWord(n + 1)}` : 'ورقة على الطاولة';
  return (
    <Animated.View
      key={`${play.by}-${play.card.id}`}
      entering={FadeInDown.duration(240)}
      style={[styles.lastPlay, { borderColor: alpha(p.color, 0.85) }]}
      accessibilityLiveRegion="polite">
      <Row gap={6} center>
        <Avatar player={p} size={22} />
        <Txt v="tiny" numberOfLines={1} color="#FFFFFF" style={{ flexShrink: 1 }}>
          {title ? `${title}: ${p.name}` : p.name}
        </Txt>
        <Txt v="tiny" color={n ? C.yellow : 'rgba(255,255,255,0.75)'}>
          {verb}
        </Txt>
      </Row>
      <Row gap={4} center wrap>
        <PlayingCard card={play.card} size="sm" ring={p.color} />
        {n ? (
          <>
            <Icon name="plus" size={14} color="rgba(255,255,255,0.8)" />
            {play.took.map((c) => (
              <PlayingCard key={c.id} card={c} size={n > 3 ? 'xs' : 'sm'} />
            ))}
          </>
        ) : null}
      </Row>
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
 * A big call-out over the felt (روندا، مسّة، دقة…). Each new id pops in and hides itself
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
      <Animated.View key={announce.id} entering={FadeIn.duration(220)} exiting={FadeOut.duration(250)} style={styles.announce}>
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
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  felt: {
    backgroundColor: C.felt,
    borderRadius: 22,
    padding: 14,
    gap: 10,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.feltDark,
  },
  lastPlay: {
    gap: 4,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  announceWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-start', padding: 8, zIndex: 20 },
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
