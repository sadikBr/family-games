import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from '../helpers';
import { PlayerStrip, Score, type StripEntry } from '../player-strip';
import { useSettled } from '../touch-motion';
import { CardMotion, useCardLook, type Side } from './motion';

type Size = 'xs' | 'sm' | 'md' | 'lg';
const WIDTH: Record<Size, number> = { xs: 30, sm: 46, md: 58, lg: 68 };
const SMALLER: Record<Size, Size> = { lg: 'md', md: 'sm', sm: 'xs', xs: 'xs' };

/** A short hand should sit on one line: step the card size down until it fits the screen. */
function fitSize(size: Size, n: number, gap: number, room: number): Size {
  if (n > 6) return size; // long hands wrap onto several lines anyway
  let s = size;
  while (s !== 'xs' && n * (dk(WIDTH[s]) + 4) + (n - 1) * gap > room) s = SMALLER[s];
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
  steady,
}: {
  card: Card | null;
  size?: Size;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  /** a player's colour around the card (the card they just played) */
  ring?: string;
  onPress?: () => void;
  /**
   * a card of my hand: keep its tap target (disabled) while it can't be tapped. Taking the
   * Pressable away remounts the card's image, which blanks it for a frame on the web whenever the
   * turn changes.
   */
  steady?: boolean;
}) {
  // larger on a computer (src/ui/layout.ts)
  const w = dk(WIDTH[size]);
  // the lift and the dimming glide; the Pressable sits inside the lifted view so the raised card
  // is exactly where a second tap lands
  const look = useCardLook({ lift: selected ? 10 : 0, dim, dimTo: 0.38 });
  const face = (
    <View
      style={[
        styles.cardWrap,
        { borderRadius: w * 0.09 + 3 },
        selected && { borderColor: C.yellow },
        glow && !selected && { borderColor: alpha(C.yellow, 0.6) },
        ring && !selected && { borderColor: ring, borderWidth: 3 },
      ]}>
      <SpanishCard card={card} width={w} />
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
          hitSlop={3}
          accessibilityRole="button"
          accessibilityLabel={card ? `ورقة ${cardName(card)}` : 'الكومة'}>
          {face}
        </Pressable>
      ) : (
        face
      )}
    </Animated.View>
  );
}

/**
 * How the cards of a CardRow move (needs a CardStage around the game): `enter` = how a new card
 * arrives ('deal' into my hand, 'play' onto the table), `from` = the side it comes from when it
 * does not fly from another spot. Cards always glide when the row closes a gap.
 */
export type RowMotion = { enter?: 'deal' | 'play'; from?: Side; source?: boolean };

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
  motion,
  steady,
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
  /** animate the cards (inside a CardStage) */
  motion?: RowMotion;
  /** keep the tap target mounted while onPress comes and goes (a hand: no blink at a change of turn) */
  steady?: boolean;
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
      {cards.map((c) => {
        const face = (
          <PlayingCard
            card={c}
            size={fitted}
            selected={selected.includes(c.id)}
            glow={glow.includes(c.id)}
            dim={dim.includes(c.id)}
            ring={rings?.[c.id]}
            onPress={onPress ? () => onPress(c) : undefined}
            steady={steady}
          />
        );
        if (!motion) return <View key={c.id}>{face}</View>;
        return (
          <CardMotion key={c.id} id={c.id} enter={motion.enter} from={motion.from} source={motion.source} flow>
            {face}
          </CardMotion>
        );
      })}
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
 * framed in their colour. `note` is one small line under the strip (the target…).
 *
 * Team games (pass `sides` with partners, e.g. روندا / الكانزة with four players, التريس): each team is
 * one framed box — «فريقك» first, then «الخصم» — with the team's score shown once and the partners
 * inside it, so nobody mistakes the table for four players each on their own.
 */
export function TableStrip({
  room,
  ids,
  turn,
  score,
  sub,
  out = [],
  note,
  sides,
}: {
  room: RoomView;
  ids: string[];
  turn: string | null;
  score?: (id: string) => number | string | undefined;
  sub?: (id: string) => string | undefined;
  out?: string[];
  note?: string;
  sides?: CardSide[];
}) {
  if (sides && sides.some((x) => x.members.length > 1)) {
    return <TeamStrip room={room} ids={ids} sides={sides} turn={turn} score={score} sub={sub} out={out} note={note} />;
  }
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

/** TableStrip for team games: one box per team (mine first), the team score once, the partners inside. */
function TeamStrip({
  room,
  ids,
  sides,
  turn,
  score,
  sub,
  out,
  note,
}: {
  room: RoomView;
  ids: string[];
  sides: CardSide[];
  turn: string | null;
  score?: (id: string) => number | string | undefined;
  sub?: (id: string) => string | undefined;
  out: string[];
  note?: string;
}) {
  const settled = useSettled();
  const mine = sides.find((x) => x.members.includes(room.me));
  // the teams in the strip's order (mine first), each with its members in that order too
  const teams = [...sides].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : 0));
  const order = (x: CardSide) => [...x.members].sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
  return (
    <View style={{ gap: 4 }}>
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        {teams.map((x) => {
          const isMine = x === mine;
          const tone = isMine ? C.cyan : C.orange;
          const members = order(x);
          const playing = !!turn && x.members.includes(turn);
          const teamScore = score?.(members[0]);
          const label = isMine ? 'فريقك' : teams.length === 2 ? 'الخصم' : sideLabelNames(x, room);
          return (
            <View
              key={x.key}
              accessibilityLabel={`${label}: ${members.map((m) => room.players.find((p) => p.id === m)?.name ?? '').join(' و ')}${teamScore !== undefined ? ` — ${teamScore}` : ''}`}
              style={[styles.teamBox, { borderColor: alpha(tone, playing ? 0.9 : 0.45), backgroundColor: alpha(tone, playing ? 0.14 : 0.07) }]}>
              <Row gap={6} style={{ paddingHorizontal: 4 }}>
                <Txt v="tiny" color={tone} style={{ flex: 1, fontFamily: F.bold, fontSize: 13 }} numberOfLines={1}>
                  {label}
                </Txt>
                {teamScore !== undefined ? <Score score={teamScore} on={false} small={false} live={settled} gains /> : null}
              </Row>
              {members.map((m) => {
                const p = room.players.find((pl) => pl.id === m);
                if (!p) return null;
                const on = turn === m;
                const line = sub?.(m);
                return (
                  <View
                    key={m}
                    style={[styles.teamChip, { borderColor: on ? p.color : 'transparent', backgroundColor: on ? alpha(p.color, 0.2) : alpha(C.night, 0.35), opacity: out.includes(m) ? 0.45 : 1 }]}>
                    <Avatar player={p} size={26} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt v="tiny" numberOfLines={1} style={{ fontSize: 13 }}>
                        {p.id === room.me ? 'أنت' : p.name}
                      </Txt>
                      {line ? (
                        <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ fontSize: 11 }}>
                          {line}
                        </Txt>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Row>
      {note ? (
        <Txt v="tiny" center color={C.dim}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

const sideLabelNames = (side: CardSide, room: RoomView) => side.members.map((m) => room.players.find((p) => p.id === m)?.name ?? '').join(' و ');

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
export function TurnLine({ myTurn, text, keep }: { myTurn: boolean; name?: string; text?: string; keep?: boolean }) {
  if (keep) return <KeptLine show={myTurn} text={text ?? 'دورك'} />;
  if (!myTurn) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Txt v="bold" center color={C.yellow}>
        {text ?? 'دورك'}
      </Txt>
    </Animated.View>
  );
}

/** `keep`: the line keeps its place and only fades, so the hand under it never jumps when the turn changes. */
function KeptLine({ show, text }: { show: boolean; text: string }) {
  const look = useCardLook({ dim: !show, dimTo: 0 });
  return (
    <Animated.View style={look} accessibilityElementsHidden={!show} importantForAccessibility={show ? 'auto' : 'no-hide-descendants'}>
      <Txt v="bold" center color={C.yellow} numberOfLines={1}>
        {text}
      </Txt>
    </Animated.View>
  );
}

/** The latest event only. */
export function LastEvent({ feed, h }: { feed: FeedItem[]; h: Helpers }) {
  const f = feed[feed.length - 1];
  if (!f) return null;
  return (
    <Animated.View key={f.id} entering={FadeIn.duration(240)} style={styles.event}>
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
export function LastPlay({
  play,
  h,
  title,
  motion,
}: {
  play: { by: string; card: Card; took: Card[] } | null;
  h: Helpers;
  title?: string;
  /** inside a CardStage: the played card glides in (from my hand, or from `from`, the player's side) and the taken cards fly from the table */
  motion?: { from: Side };
}) {
  if (!play) return null;
  const p = h.player(play.by);
  const n = play.took.length;
  // nouns, not verbs: we don't know whether the player is a man or a woman
  const verb = n ? `أخذٌ: ${cardsWord(n + 1)}` : 'ورقة على الطاولة';
  return (
    <Animated.View
      key={`${play.by}-${play.card.id}`}
      entering={FadeInDown.duration(320)}
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
        {/* a card that stayed on the table is shown there too: only a capture flies in here */}
        <CardMotion id={play.card.id} enter={motion && n ? 'play' : 'none'} from={motion?.from} source={false}>
          <PlayingCard card={play.card} size="sm" ring={p.color} />
        </CardMotion>
        {n ? (
          <>
            <Icon name="plus" size={14} color="rgba(255,255,255,0.8)" />
            {play.took.map((c) => (
              <CardMotion key={c.id} id={c.id} enter={motion ? 'play' : 'none'} from={motion?.from} source={false}>
                <PlayingCard card={c} size={n > 3 ? 'xs' : 'sm'} />
              </CardMotion>
            ))}
          </>
        ) : null}
      </Row>
    </Animated.View>
  );
}

/**
 * Tap again on the selected card to play it. A second tap sooner than this after selecting is
 * the same touch reported twice and is dropped; a natural quick double tap (150–350 ms) plays.
 * (It used to be 400 ms, which swallowed real double taps: people felt forced to use the button.)
 */
export const DOUBLE_TAP_MS = 100;
/** Clock for tap handlers only (never call it during render). */
export const tapClock = () => Date.now();

/**
 * «Tap a card to select it, tap it again to play it» — one hook for every card game.
 * `canPlay(id)` says whether that card may be played now (my turn, legal card); `onPlay(id)` sends
 * the move. A quick double tap and a slow second tap both play; tapping another card moves the
 * selection. `selected` is null whenever the selected card is no longer playable (the turn moved
 * on, the hand changed), so a stale selection never lingers. Keep a «play» button for those who
 * prefer it: `selected` tells when to show it, `play()` sends the selected card.
 */
export function useTapToPlay({ canPlay, onPlay }: { canPlay: (id: string) => boolean; onPlay: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  // the latest selection and when it was made, for the tap handler only (taps can come faster than renders)
  const last = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const selected = sel && canPlay(sel) ? sel : null;
  const play = (id: string) => {
    last.current = { id: null, at: 0 };
    setSel(null);
    onPlay(id);
  };
  const tap = (id: string) => {
    if (!canPlay(id)) return;
    const now = tapClock();
    const prev = last.current;
    if (prev.id === id && selected === id) {
      if (now - prev.at < DOUBLE_TAP_MS) return; // the same touch twice
      play(id);
      return;
    }
    last.current = { id, at: now };
    setSel(id);
  };
  const clear = () => {
    last.current = { id: null, at: 0 };
    setSel(null);
  };
  return { selected, tap, clear, play: () => (selected ? play(selected) : undefined) };
}

const ANNOUNCE_MS = 3400;

/**
 * A big call-out over the felt (روندا، ميسا، دقة…). Each new id pops in and hides itself
 * after ~3.4 s. Place it inside <Felt>.
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
      <Animated.View key={announce.id} entering={FadeIn.duration(280)} exiting={FadeOut.duration(320)} style={styles.announce}>
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
  teamBox: { flex: 1, gap: 6, padding: 8, borderRadius: 16, borderWidth: 1.5 },
  teamChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5 },
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
