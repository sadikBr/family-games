/**
 * «مشوار الحياة» — the board: a sandy road winding over a green table, the spaces as coloured
 * discs, zone names, the pawns (hopping space by space after the die lands) and the thrown die.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Zellige } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import type { LifeMove, LifeView } from '@/shared/games/life';
import { LIFE_STOPS, lifeBoard, type LifeKind, type LifeNode } from '@/shared/life-board';
import type { PlayerPublic } from '@/shared/protocol';
import { F, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { DICE_THROW_MS, ThrownDice } from '@/ui/dice3d';
import { Txt } from '@/ui/txt';

import { stackOffsets } from './dice-race';

export const INK = '#151726';
const TABLE = '#1E6B4A';
const ROAD = '#EBDDBB';
/** one hop of a pawn along the road */
export const HOP_MS = 210;
/** pawns start walking once the die has landed */
export const WALK_DELAY = DICE_THROW_MS;

export const SPACE: Record<LifeKind, { color: string; icon: IconName; name: string; help: string }> = {
  start: { color: '#2FB67C', icon: 'go', name: 'الانطلاق', help: 'هنا يبدأ المشوار.' },
  event: { color: '#F08A3E', icon: 'question', name: 'مفاجأة', help: 'حدث من الحياة: قد تربح أو تخسر.' },
  payday: { color: '#2F9E6E', icon: 'coins', name: 'يوم الأجرة', help: 'تقبض راتبك كلما مررت من هنا (ناقص فائدة القروض).' },
  family: { color: '#E86FA6', icon: 'heart', name: 'العائلة', help: 'فرد جديد (عائلة أو صديق أو حيوان أليف) وهدية من كل لاعب.' },
  house: { color: '#4F5BD5', icon: 'house', name: 'المنزل', help: 'توقّف هنا: اختر داراً تشتريها أو واصل بالكراء.' },
  insure: { color: '#22B8B0', icon: 'hand', name: 'التأمين', help: 'اشترِ التأمين ليحميك من الأعطال والسرقات.' },
  risk: { color: '#E2475F', icon: 'rocket', name: 'مشروع مغامر', help: 'ارمِ النرد إن شئت: ربح كبير أو خسارة.' },
  fork: { color: '#F2B33D', icon: 'swap', name: 'مفترق الطرق', help: 'توقّف هنا واختر طريقك.' },
  grad: { color: '#7B61D9', icon: 'book', name: 'التخرج', help: 'توقّف هنا: اختر مهنتك من بطاقات أصحاب الشهادات.' },
  raise: { color: '#C98A14', icon: 'starFull', name: 'ترقية', help: 'راتبك يزيد.' },
  retire: { color: '#F2B33D', icon: 'tea', name: 'التقاعد', help: 'نهاية المشوار: بيع الدار، تسديد القروض… وكأس شاي.' },
};

const sizeOf = (n: LifeNode, u: number) => (n.kind === 'retire' ? 0.92 : LIFE_STOPS.includes(n.kind) || n.kind === 'start' ? 0.78 : 0.62) * u;

/** A player's pawn: hops along the path of its last move once the die has landed. */
function Pawn({ player, pos, move, at, size, offset, active }: {
  player: PlayerPublic;
  pos: number;
  move: LifeMove | null;
  at: (i: number) => { x: number; y: number };
  size: number;
  offset: { x: number; y: number };
  active: boolean;
}) {
  const p = at(pos);
  const tx = p.x + offset.x - size / 2;
  const ty = p.y + offset.y - size / 2;
  const x = useSharedValue(tx);
  const y = useSharedValue(ty);
  const lift = useSharedValue(0);
  const seen = useRef(move?.id ?? 0);
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.set(active ? withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true) : withTiming(0, { duration: 200 }));
  }, [active, glow]);

  useEffect(() => {
    const m = move;
    if (m && m.id !== seen.current && m.by === player.id && m.path.length && m.path[m.path.length - 1] === pos) {
      seen.current = m.id;
      const xs = [];
      const ys = [];
      const ls = [];
      for (let k = 0; k < m.path.length; k++) {
        const last = k === m.path.length - 1;
        const c = at(m.path[k]);
        xs.push(withTiming(last ? tx : c.x - size / 2, { duration: HOP_MS, easing: Easing.inOut(Easing.quad) }));
        ys.push(withTiming(last ? ty : c.y - size / 2, { duration: HOP_MS, easing: Easing.inOut(Easing.quad) }));
        ls.push(withTiming(-size * 0.4, { duration: HOP_MS / 2, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: HOP_MS / 2, easing: Easing.in(Easing.quad) }));
      }
      x.set(withDelay(WALK_DELAY, withSequence(...xs)));
      y.set(withDelay(WALK_DELAY, withSequence(...ys)));
      lift.set(withDelay(WALK_DELAY, withSequence(...ls)));
      return;
    }
    if (m) seen.current = Math.max(seen.current, m.id);
    x.set(withTiming(tx, { duration: 260 }));
    y.set(withTiming(ty, { duration: 260 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.id, pos, tx, ty]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() + lift.get() }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.35 + glow.get() * 0.5, transform: [{ scale: 1 + glow.get() * 0.18 }] }));
  return (
    <Animated.View style={[styles.pawn, { zIndex: active ? 6 : 5 }, style]} pointerEvents="none">
      {active ? <Animated.View style={[styles.halo, { width: size * 1.3, height: size * 1.3, borderRadius: size, left: -size * 0.15, top: -size * 0.15, borderColor: player.color }, halo]} /> : null}
      <Avatar player={player} size={size} ring={player.color} />
    </Animated.View>
  );
}

export function LifeBoardView({ W, view, player, onLanded, onSpace, highlight }: {
  W: number;
  view: LifeView;
  player: (id: string) => PlayerPublic;
  onLanded: () => void;
  onSpace: (i: number) => void;
  /** spaces to ring (e.g. the two roads at a fork) */
  highlight?: number[];
}) {
  const b = lifeBoard(view.length);
  const u = W / b.width;
  const H = b.height * u;
  const at = (i: number) => ({ x: b.nodes[i].x * u, y: b.nodes[i].y * u });
  let road = '';
  for (const n of b.nodes) for (const j of n.next) road += `M${n.x * u} ${n.y * u}L${b.nodes[j].x * u} ${b.nodes[j].y * u}`;
  const onBoard = view.players;
  const pawn = u * 0.56;
  const offsets = stackOffsets(onBoard, pawn * 0.32);
  const labelSize = Math.max(9, u * 0.26);

  return (
    <View style={[styles.board, { width: W, height: H }]}>
      <Zellige width={W} height={H} opacity={0.07} />
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={road} stroke={INK} strokeWidth={u * 0.44} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={road} stroke={ROAD} strokeWidth={u * 0.32} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={road} stroke={alpha('#B89E6A', 0.7)} strokeWidth={Math.max(1, u * 0.04)} strokeDasharray={`${u * 0.12} ${u * 0.14}`} fill="none" />
      </Svg>
      {b.labels.map((l) => (
        <View key={l.text} pointerEvents="none" style={[styles.label, { left: l.x * u - u * 1.6, top: l.y * u - labelSize * 0.85, width: u * 3.2 }]}>
          <Txt numberOfLines={1} style={{ fontFamily: F.display, fontSize: labelSize, lineHeight: labelSize * 1.6, color: alpha('#FFFFFF', 0.78), textAlign: 'center' }}>
            {l.text}
          </Txt>
        </View>
      ))}
      {b.nodes.map((n) => {
        const d = sizeOf(n, u);
        const sp = SPACE[n.kind];
        const ring = highlight?.includes(n.i);
        return (
          <View
            key={n.i}
            pointerEvents="none"
            style={[
              styles.space,
              { left: n.x * u - d / 2, top: n.y * u - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: sp.color },
              ring && { borderColor: '#FFFFFF', borderWidth: 3 },
            ]}>
            <Icon name={sp.icon} size={d * 0.56} color={n.kind === 'fork' || n.kind === 'retire' ? INK : '#FFFFFF'} />
          </View>
        );
      })}
      {onBoard.map((p) => (
        <Pawn key={p.id} player={player(p.id)} pos={p.pos} move={view.move} at={at} size={pawn} offset={offsets[p.id] ?? { x: 0, y: 0 }} active={p.id === view.turn && view.phase !== 'final'} />
      ))}
      <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
        <ThrownDice values={view.dice ? [view.dice] : null} rollId={view.rollId} width={W} height={H} size={W * 0.15} linger={1500} onLanded={onLanded} />
      </View>
      {/* tap targets above the die layer (its canvas would catch the taps otherwise) */}
      {b.nodes.map((n) => {
        const d = Math.max(sizeOf(n, u), 34);
        return (
          <Pressable
            key={n.i}
            onPress={() => onSpace(n.i)}
            accessibilityLabel={SPACE[n.kind].name}
            style={[styles.hit, { left: n.x * u - d / 2, top: n.y * u - d / 2, width: d, height: d, borderRadius: d / 2 }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: TABLE, borderRadius: 18, borderWidth: 3, borderColor: INK, overflow: 'hidden' },
  space: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: INK },
  label: { position: 'absolute', alignItems: 'center' },
  hit: { position: 'absolute', zIndex: 30 },
  pawn: { position: 'absolute', left: 0, top: 0 },
  halo: { position: 'absolute', borderWidth: 3 },
});
