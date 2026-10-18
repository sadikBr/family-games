/**
 * The «ملك العقار» board: 40 squares around a square centre, drawn with Views.
 * Clockwise from «انطلاق» in the bottom-right corner.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Zellige } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { BOARD, GROUP_COLOR, type EstateSquare } from '@/shared/estate';
import type { EstateView, PlayerPublic } from '@/shared/protocol';
import { F, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { Txt } from '@/ui/txt';

export const INK = '#151726';
export const PAPER = '#FBF4E2';
const TABLE = '#1E6B4A';

export interface Geom {
  W: number;
  K: number; // corner size
  E: number; // edge square width
}
export const geomFor = (W: number): Geom => {
  const K = W * 0.14;
  return { W, K, E: (W - 2 * K) / 9 };
};

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';
export function rectOf(g: Geom, i: number): { x: number; y: number; w: number; h: number; side: Side } {
  const { W, K, E } = g;
  if (i === 0) return { x: W - K, y: W - K, w: K, h: K, side: 'corner' };
  if (i < 10) return { x: W - K - i * E, y: W - K, w: E, h: K, side: 'bottom' };
  if (i === 10) return { x: 0, y: W - K, w: K, h: K, side: 'corner' };
  if (i < 20) return { x: 0, y: W - K - (i - 10) * E, w: K, h: E, side: 'left' };
  if (i === 20) return { x: 0, y: 0, w: K, h: K, side: 'corner' };
  if (i < 30) return { x: K + (i - 21) * E, y: 0, w: E, h: K, side: 'top' };
  if (i === 30) return { x: W - K, y: 0, w: K, h: K, side: 'corner' };
  return { x: W - K, y: K + (i - 31) * E, w: K, h: E, side: 'right' };
}

/** Where tokens stand: the middle of the square, away from the colour band. */
export function spotOf(g: Geom, i: number) {
  const r = rectOf(g, i);
  const band = g.K * 0.24;
  let { x, y, w, h } = r;
  if (r.side === 'bottom') {
    y += band;
    h -= band;
  }
  if (r.side === 'top') h -= band;
  if (r.side === 'left') w -= band;
  if (r.side === 'right') {
    x += band;
    w -= band;
  }
  return { x: x + w / 2, y: y + h / 2 };
}

export function squareIcon(sq: EstateSquare): IconName | null {
  switch (sq.kind) {
    case 'station':
      return 'train';
    case 'utility':
      return sq.icon === 'power' ? 'bolt' : 'drop';
    case 'tax':
      return 'coins';
    case 'luck':
      return 'question';
    case 'family':
      return 'gift';
    case 'jail':
      return 'bars';
    case 'rest':
      return 'tea';
    case 'gotojail':
      return 'siren';
    case 'go':
      return 'go';
    default:
      return null;
  }
}

export const shortName = (sq: EstateSquare) =>
  sq.kind === 'station' ? sq.name.replace('محطة ', '') : sq.kind === 'family' ? 'العائلة' : sq.name;

const ICON_TINT: Partial<Record<EstateSquare['kind'], string>> = {
  luck: '#E86F1E',
  family: '#1A9C94',
  tax: '#B0832B',
  station: INK,
  utility: '#3D7BE0',
  jail: INK,
  rest: '#1F8A5B',
  gotojail: '#D6334B',
  go: '#D6334B',
};

function Square({ g, i, view, colorOf, onPress, focus }: { g: Geom; i: number; view: EstateView; colorOf: (id: string) => string; onPress: (i: number) => void; focus?: string }) {
  const sq = BOARD[i];
  const r = rectOf(g, i);
  const prop = view.props[i];
  const band = g.K * 0.24;
  const fs = Math.max(6.5, g.E * 0.25);
  const icon = squareIcon(sq);
  const corner = r.side === 'corner';

  const bandStyle =
    r.side === 'bottom'
      ? { top: 0, left: 0, right: 0, height: band }
      : r.side === 'top'
        ? { bottom: 0, left: 0, right: 0, height: band }
        : r.side === 'left'
          ? { right: 0, top: 0, bottom: 0, width: band }
          : { left: 0, top: 0, bottom: 0, width: band };
  const ownerStyle =
    r.side === 'bottom'
      ? { bottom: 0, left: 0, right: 0, height: 5 }
      : r.side === 'top'
        ? { top: 0, left: 0, right: 0, height: 5 }
        : r.side === 'left'
          ? { left: 0, top: 0, bottom: 0, width: 5 }
          : { right: 0, top: 0, bottom: 0, width: 5 };
  const vertical = r.side === 'left' || r.side === 'right';
  const content = {
    position: 'absolute' as const,
    left: r.side === 'right' ? band : 0,
    right: r.side === 'left' ? band : 0,
    top: r.side === 'bottom' ? band : 0,
    bottom: r.side === 'top' ? band : 0,
  };

  let houses: ReactNode = null;
  if (prop && prop.houses > 0) {
    const hs = band * 0.62;
    houses = (
      <View style={[styles.houses, bandStyle, { flexDirection: vertical ? 'column' : 'row' }]}>
        {prop.houses === 5 ? (
          <View style={[styles.hotel, vertical ? { width: hs, height: hs * 2 } : { width: hs * 2, height: hs }]} />
        ) : (
          Array.from({ length: prop.houses }, (_, k) => <View key={k} style={[styles.house, { width: hs * 0.82, height: hs * 0.82 }]} />)
        )}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(i)}
      accessibilityLabel={sq.name}
      style={[styles.square, { left: r.x, top: r.y, width: r.w, height: r.h }, corner && { backgroundColor: '#F3E6C4' }]}>
      {prop ? <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colorOf(prop.owner), 0.2) }]} /> : null}
      {sq.kind === 'city' ? <View style={[styles.band, bandStyle, { backgroundColor: GROUP_COLOR[sq.group] }]} /> : null}
      {houses}
      <View style={[content, styles.content, vertical && !corner && { flexDirection: 'row', gap: 2, paddingHorizontal: 2 }]}>
        {icon ? <Icon name={icon} size={corner ? g.K * 0.42 : Math.min(g.E, g.K) * 0.42} color={ICON_TINT[sq.kind] ?? INK} /> : null}
        {sq.kind !== 'luck' ? (
          <Txt
            numberOfLines={2}
            adjustsFontSizeToFit
            style={{ fontFamily: F.display, fontSize: corner ? fs * 1.15 : fs, lineHeight: (corner ? fs * 1.15 : fs) * 1.35, color: INK, textAlign: 'center', flexShrink: 1 }}>
            {sq.kind === 'tax' ? String(sq.amount) : shortName(sq)}
          </Txt>
        ) : null}
        {sq.kind === 'city' && !prop ? (
          <Txt style={{ fontFamily: F.bold, fontSize: fs * 0.88, lineHeight: fs * 1.15, color: '#6B6480', textAlign: 'center' }}>{String(sq.price)}</Txt>
        ) : null}
      </View>
      {prop ? <View style={[styles.owner, ownerStyle, { backgroundColor: colorOf(prop.owner) }]} /> : null}
      {prop?.mortgaged ? (
        <View style={styles.mortgaged}>
          <Txt style={{ fontFamily: F.display, fontSize: fs, lineHeight: fs * 1.4, color: '#fff' }}>رهن</Txt>
        </View>
      ) : null}
      {focus ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 2.5, borderColor: focus }]} /> : null}
    </Pressable>
  );
}

/** A player's token. It hops square by square after the dice land. */
function Token({ g, player, pos, slot, slots, size, delay }: { g: Geom; player: PlayerPublic; pos: number; slot: number; slots: number; size: number; delay: number }) {
  const offset = (k: number) => {
    if (slots <= 1) return { dx: 0, dy: 0 };
    const cols = slots <= 2 ? 2 : 3;
    const c = k % cols;
    const r = Math.floor(k / cols);
    const rows = Math.ceil(slots / cols);
    return { dx: (c - (cols - 1) / 2) * size * 0.5, dy: (r - (rows - 1) / 2) * size * 0.5 };
  };
  const { dx, dy } = offset(slot);
  const spot = spotOf(g, pos);
  const tx = spot.x + dx - size / 2;
  const ty = spot.y + dy - size / 2;
  const x = useSharedValue(tx);
  const y = useSharedValue(ty);
  const lift = useSharedValue(0);
  const prev = useRef(pos);

  useEffect(() => {
    const from = prev.current;
    prev.current = pos;
    const d = (pos - from + 40) % 40;
    if (from === pos || d === 0) {
      x.set(withTiming(tx, { duration: 200 }));
      y.set(withTiming(ty, { duration: 200 }));
      return;
    }
    if (d <= 12) {
      const xs = [];
      const ys = [];
      const ls = [];
      for (let k = 1; k <= d; k++) {
        const last = k === d;
        const c = spotOf(g, (from + k) % 40);
        xs.push(withTiming(last ? tx : c.x - size / 2, { duration: 150 }));
        ys.push(withTiming(last ? ty : c.y - size / 2, { duration: 150 }));
        ls.push(withTiming(-size * 0.35, { duration: 75 }), withTiming(0, { duration: 75 }));
      }
      x.set(withDelay(delay, withSequence(...xs)));
      y.set(withDelay(delay, withSequence(...ys)));
      lift.set(withDelay(delay, withSequence(...ls)));
    } else {
      x.set(withDelay(delay, withTiming(tx, { duration: 500 })));
      y.set(withDelay(delay, withTiming(ty, { duration: 500 })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, tx, ty]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() + lift.get() }] }));
  return (
    <Animated.View style={[styles.token, style]} pointerEvents="none">
      <Avatar player={player} size={size} ring={player.color} />
    </Animated.View>
  );
}

export function EstateBoard({
  W,
  view,
  player,
  onSquare,
  focus,
  children,
}: {
  W: number;
  view: EstateView;
  player: (id: string) => PlayerPublic;
  onSquare: (i: number) => void;
  /** the square where the player on turn landed, framed in their colour */
  focus?: { sq: number; color: string } | null;
  /** drawn in the middle of the board */
  children?: ReactNode;
}) {
  const g = geomFor(W);
  const colorOf = (id: string) => player(id).color;
  const alive = view.players.filter((p) => !p.bankrupt);
  const size = Math.min(g.E, g.K) * 0.78;
  return (
    <View style={[styles.board, { width: W, height: W }]}>
      <View style={[styles.centre, { left: g.K, top: g.K, width: W - 2 * g.K, height: W - 2 * g.K }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Zellige width={W - 2 * g.K} height={W - 2 * g.K} opacity={0.06} />
        </View>
        {children}
      </View>
      {BOARD.map((_, i) => (
        <Square key={i} g={g} i={i} view={view} colorOf={colorOf} onPress={onSquare} focus={focus?.sq === i ? focus.color : undefined} />
      ))}
      {alive.map((p) => {
        const here = alive.filter((q) => q.pos === p.pos);
        return <Token key={p.id} g={g} player={player(p.id)} pos={p.pos} slot={here.indexOf(p)} slots={here.length} size={size} delay={1050} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: INK, borderRadius: 10, borderWidth: 2.5, borderColor: INK, overflow: 'hidden' },
  centre: { position: 'absolute', backgroundColor: TABLE, overflow: 'hidden' },
  square: { position: 'absolute', backgroundColor: PAPER, borderWidth: 0.75, borderColor: INK, overflow: 'hidden' },
  band: { position: 'absolute', borderColor: INK },
  content: { alignItems: 'center', justifyContent: 'center', padding: 1 },
  owner: { position: 'absolute' },
  houses: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 1.5 },
  house: { backgroundColor: '#2FB67C', borderWidth: 1, borderColor: INK, borderRadius: 1.5 },
  hotel: { backgroundColor: '#E2263F', borderWidth: 1, borderColor: INK, borderRadius: 2 },
  mortgaged: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(21,23,38,0.55)', alignItems: 'center', justifyContent: 'center' },
  token: { position: 'absolute', left: 0, top: 0 },
});
