/** Shared pieces for the one-die race games («رحلة الحج», «سلّم الحسنات»). */
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from '@/art/icons';
import type { BoardCard, PlayerPublic } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { DICE_THROW_MS } from '@/ui/dice3d';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from './helpers';

type Pt = { x: number; y: number };

/** A player's token: hops square by square after the dice land, then slides along ladders / snakes. */
export function RaceToken({
  player,
  pos,
  at,
  size,
  offset,
  rollId,
  dice,
  landingOf,
}: {
  player: PlayerPublic;
  pos: number;
  at: (sq: number) => Pt; // pixel centre of a square
  size: number;
  offset: Pt;
  rollId: number;
  dice: number | null;
  landingOf: (from: number, dice: number) => number;
}) {
  const p = at(pos);
  const tx = p.x + offset.x - size / 2;
  const ty = p.y + offset.y - size / 2;
  const x = useSharedValue(tx);
  const y = useSharedValue(ty);
  const lift = useSharedValue(0);
  const prev = useRef({ pos, rollId });

  useEffect(() => {
    const from = prev.current.pos;
    const rolled = prev.current.rollId !== rollId;
    prev.current = { pos, rollId };
    if (from === pos) {
      x.set(withTiming(tx, { duration: 200 }));
      y.set(withTiming(ty, { duration: 200 }));
      return;
    }
    const landing = rolled && dice ? landingOf(from, dice) : pos;
    const hopTo = landing > from && landing - from <= 12 ? landing : from;
    const xs = [];
    const ys = [];
    const ls = [];
    for (let k = from + 1; k <= hopTo; k++) {
      const c = at(k);
      const last = k === hopTo && hopTo === pos;
      xs.push(withTiming(last ? tx : c.x - size / 2, { duration: 170 }));
      ys.push(withTiming(last ? ty : c.y - size / 2, { duration: 170 }));
      ls.push(withTiming(-size * 0.4, { duration: 85 }), withTiming(0, { duration: 85 }));
    }
    if (hopTo !== pos) {
      // ladder / snake / event: slide the rest of the way
      xs.push(withDelay(xs.length ? 250 : 0, withTiming(tx, { duration: 650 })));
      ys.push(withDelay(xs.length > 1 ? 250 : 0, withTiming(ty, { duration: 650 })));
    }
    // the dice land first; the number stays readable for a moment before the token sets off
    const delay = rolled ? DICE_THROW_MS + 400 : 0;
    x.set(withDelay(delay, withSequence(...xs)));
    y.set(withDelay(delay, withSequence(...ys)));
    if (ls.length) lift.set(withDelay(delay, withSequence(...ls)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, tx, ty]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() + lift.get() }] }));
  return (
    <Animated.View style={[styles.token, style]} pointerEvents="none">
      <Avatar player={player} size={size} ring={player.color} />
    </Animated.View>
  );
}

/** Small offsets so tokens on the same square don't hide each other. */
export function stackOffsets<T extends { id: string; pos: number }>(players: T[], spread: number): Record<string, Pt> {
  const out: Record<string, Pt> = {};
  const groups = new Map<number, string[]>();
  for (const p of players) groups.set(p.pos, [...(groups.get(p.pos) ?? []), p.id]);
  for (const ids of groups.values()) {
    ids.forEach((id, i) => {
      const n = ids.length;
      if (n === 1) out[id] = { x: 0, y: 0 };
      else {
        const a = (i / n) * Math.PI * 2;
        out[id] = { x: Math.cos(a) * spread, y: Math.sin(a) * spread };
      }
    });
  }
  return out;
}

const MEDAL = [C.yellow, '#C9CED8', '#D08A55'];

/** A ranked list for the end of a game: medal, avatar framed in the player's game colour, name, a short line. */
export function RankList({ rows, h }: { rows: { id: string; label?: string; color?: string }[]; h: Helpers }) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ gap: 6 }}>
      {rows.map((r, i) => {
        const pl = h.player(r.id);
        return (
          <View key={r.id} style={[styles.place, r.id === h.me && { backgroundColor: alpha(C.yellow, 0.1) }]}>
            <View style={[styles.rank, { backgroundColor: MEDAL[i] ?? C.surfaceStrong }]}>
              <Txt v="tiny" color={i < 3 ? C.ink : C.text}>
                {num(i + 1)}
              </Txt>
            </View>
            <Avatar player={pl} size={32} ring={r.color ?? pl.color} />
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
              {pl.name}
              {r.id === h.me ? ' (أنت)' : ''}
            </Txt>
            {r.label ? (
              <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ maxWidth: 150 }}>
                {r.label}
              </Txt>
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );
}

/** End of a race: everyone in finishing order (furthest first; same square → who got there first). */
export function FinishOrder({ order, players, h, label }: { order: string[]; players: { id: string; pos: number }[]; h: Helpers; label: (pos: number) => string }) {
  const rows = order.flatMap((id) => players.filter((p) => p.id === id)).map((p) => ({ id: p.id, label: label(p.pos) }));
  return <RankList rows={rows} h={h} />;
}

const CARD_STYLE: Record<BoardCard['kind'], { color: string; icon: IconName }> = {
  station: { color: '#2F9E6E', icon: 'star' },
  event: { color: '#E09A1A', icon: 'sparkle' },
  ladder: { color: '#2FB67C', icon: 'heart' },
  snake: { color: '#E2475F', icon: 'down' },
  right: { color: '#2FB67C', icon: 'check' },
  wrong: { color: '#E2475F', icon: 'close' },
  zad: { color: '#7B61D9', icon: 'gift' },
};

export function EventCard({ card, h, extra }: { card: BoardCard; h: Helpers; extra?: ReactNode }) {
  const st = CARD_STYLE[card.kind];
  return (
    <Animated.View key={card.id} entering={FadeIn.duration(260)} style={[styles.card, { borderColor: st.color }]}>
      <View style={[styles.cardHead, { backgroundColor: st.color }]}>
        <Icon name={st.icon} size={18} color="#fff" />
        <Txt v="h3" color="#fff" style={{ flex: 1 }}>
          {card.title}
        </Txt>
        <Avatar player={h.player(card.by)} size={22} />
      </View>
      <View style={{ padding: 12, gap: 4 }}>
        {card.day ? (
          <Txt v="tiny" color={C.yellow}>
            {card.day}
          </Txt>
        ) : null}
        <Txt v="bold">{card.text}</Txt>
        {extra}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  token: { position: 'absolute', left: 0, top: 0 },
  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, overflow: 'hidden' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
});
