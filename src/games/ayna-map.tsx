/**
 * «أين تقع؟» — the map: one of three maps drawn from Natural Earth (src/shared/ayna-map.ts), the pins,
 * the true spot and taps. While playing, the first tap drops the pin and zooms the map around it
 * (the spot under the finger stays put), so the pin can be moved precisely; «الخريطة كاملة» zooms out.
 * At the reveal the map frames the true spot and everyone's pins.
 */
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { Icon } from '@/art/icons';
import { AYNA_BORDERS, AYNA_GEO, AYNA_LAND, AYNA_MOROCCO } from '@/shared/ayna-map';
import { AYNA_MAPS, aynaProject, aynaUnproject, type AynaMapKey, type AynaPoint } from '@/shared/games/ayna';
import type { PlayerPublic } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { Txt } from '@/ui/txt';

const SEA = '#173A5E';
const LAND = '#D9CCA6';
/** Morocco, whole with its Sahara: a warmer tone of the same land */
const MOROCCO = '#E8BE7E';
const BORDER = '#8E7D55';

export interface AynaPin {
  key: string;
  point: AynaPoint;
  color: string;
  /** drawn bigger, on top */
  me?: boolean;
  /** reveal: their avatar above the pin */
  player?: PlayerPublic;
}

/** Sea names: candidate spots (lat, lon); a label shows at the first spot that fits on screen. `w` = width (px). */
const SEAS: Record<AynaMapKey, { name: string; w: number; at: [number, number][] }[]> = {
  morocco: [{ name: 'المحيط الأطلسي', w: 46, at: [[31.6, -12.6], [26.5, -16.6]] }],
  arab: [
    { name: 'البحر الأبيض المتوسط', w: 92, at: [[34.1, 19.5], [33.6, 24.5]] },
    { name: 'المحيط الأطلسي', w: 44, at: [[29.5, -14.4], [22.5, -17]] },
    { name: 'بحر العرب', w: 54, at: [[14.2, 58.2], [11, 56]] },
  ],
  world: [
    { name: 'المحيط الأطلسي', w: 46, at: [[28, -42], [10, -32], [-25, -18]] },
    { name: 'المحيط الهادئ', w: 46, at: [[5, -132], [20, 170], [-30, -110]] },
    { name: 'المحيط الهندي', w: 46, at: [[-22, 76], [-10, 70]] },
  ],
};

type Box = [number, number, number, number];

/** The tallest frame a wide map gets (width ÷ height): the world map is shown with sea above and below it. */
const MIN_ASPECT = 1.7;

/** The whole map in the frame's shape (centred; a frame taller than the map adds sea above and below). */
function fullBox(map: AynaMapKey, aspect: number): Box {
  const g = AYNA_GEO[map];
  if (g.w / g.h >= aspect) {
    const h = g.w / aspect;
    return [0, (g.h - h) / 2, g.w, h];
  }
  const w = g.h * aspect;
  return [(g.w - w) / 2, 0, w, g.h];
}

/** A box of `w × h` centred near (cx, cy), kept inside `full`. */
function within(full: Box, cx: number, cy: number, w: number, h: number): Box {
  const [fx, fy, fw, fh] = full;
  return [Math.max(fx, Math.min(fx + fw - w, cx - w / 2)), Math.max(fy, Math.min(fy + fh - h, cy - h / 2)), w, h];
}

/** The smallest box of the frame's shape holding these points, with room around them (never closer than `minShare` of the map). */
function fitBox(full: Box, pts: [number, number][], minShare: number): Box {
  const aspect = full[2] / full[3];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  // room on each side (the avatars stand above the pins)
  const w = Math.min(full[2], Math.max((x1 - x0) * 1.5, (y1 - y0) * 1.6 * aspect, full[2] * minShare));
  const h = w / aspect;
  return within(full, (x0 + x1) / 2, (y0 + y1) / 2 - h * 0.04, w, h);
}

/** The map fitted to `width` (and at most `maxHeight`). */
export function AynaMap({
  map,
  width,
  maxHeight,
  pins,
  truth,
  onTap,
}: {
  map: AynaMapKey;
  width: number;
  maxHeight: number;
  pins: AynaPin[];
  truth?: AynaPoint | null;
  onTap?: (p: AynaPoint) => void;
}) {
  const g = AYNA_GEO[map];
  const zoom = AYNA_MAPS[map].zoom;
  const fit = Math.min(width / g.w, maxHeight / g.h);
  const fw = Math.round(g.w * fit);
  const fh = Math.round(Math.min(maxHeight, Math.max(g.h * fit, fw / MIN_ASPECT)));
  /** the zoomed view while playing (null: the whole map) */
  const [view, setView] = useState<Box | null>(null);

  const full = fullBox(map, fw / fh);
  let box: Box = full;
  if (truth) {
    const pts = [aynaProject(map, truth.lon, truth.lat), ...pins.map((p) => aynaProject(map, p.point.lon, p.point.lat))];
    box = fitBox(full, pts, 1 / zoom);
  } else if (onTap && view) box = view;
  const [bx, by, bw, bh] = box;
  const s = fw / bw; // screen px per map unit
  const u = 1 / s; // one screen px in map units
  const toPx = (lat: number, lon: number) => {
    const [x, y] = aynaProject(map, lon, lat);
    return { left: (x - bx) * s, top: (y - by) * s };
  };

  const frame = useRef<View>(null);
  const at = (lx: number, ly: number) => {
    if (!onTap || !Number.isFinite(lx) || !Number.isFinite(ly)) return;
    const px = Math.max(0, Math.min(fw, lx));
    const py = Math.max(0, Math.min(fh, ly));
    const x = bx + px / s;
    const y = by + py / s;
    // a tap in the sea above or below the world map lands on its edge
    const p = aynaUnproject(map, x, Math.max(0, Math.min(g.h, y)));
    onTap({ lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000 });
    if (!view && zoom > 1) {
      // zoom in around the tap, keeping the tapped spot under the finger
      const w = full[2] / zoom;
      const h = full[3] / zoom;
      setView(within(full, x - (px / fw) * w + w / 2, y - (py / fh) * h + h / 2, w, h));
    }
  };
  const tap = (e: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    // the web has no reliable locationX: measure the map and use page coordinates
    if (Platform.OS !== 'web' && Number.isFinite(locationX)) return at(locationX, locationY);
    frame.current?.measure((_x, _y, _w, _h, left, top) => at(pageX - left, pageY - top));
  };

  const seas = SEAS[map].flatMap((sea) => {
    const fits = (p: { left: number; top: number }) => p.left - sea.w / 2 >= 4 && p.left + sea.w / 2 <= fw - 4 && p.top >= 14 && p.top <= fh - 14;
    const spot = sea.at.map(([lat, lon]) => toPx(lat, lon)).find(fits);
    return spot ? [{ name: sea.name, w: sea.w, ...spot }] : [];
  });

  const truthXY = truth ? aynaProject(map, truth.lon, truth.lat) : null;
  const sorted = [...pins].sort((a, b) => Number(!!a.me) - Number(!!b.me));
  const playing = !truth;

  return (
    <View style={[styles.wrap, { width: fw }]}>
      <Pressable
        testID="ayna-map"
        disabled={!onTap}
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel={onTap ? 'الخريطة: المس مكان الإجابة' : 'الخريطة'}>
        <View ref={frame} collapsable={false} style={[styles.frame, { width: fw, height: fh }]}>
          <Svg width={fw} height={fh} viewBox={`${bx} ${by} ${bw} ${bh}`} pointerEvents="none">
            <Rect x={-g.w} y={-g.h} width={g.w * 3} height={g.h * 3} fill={SEA} />
            <Path d={AYNA_LAND[map]} fill={LAND} />
            <Path d={AYNA_MOROCCO[map]} fill={MOROCCO} />
            <Path d={AYNA_BORDERS[map]} fill="none" stroke={BORDER} strokeWidth={0.8 * u} strokeLinejoin="round" strokeLinecap="round" />
            {truthXY
              ? sorted.map((p) => {
                  const [x, y] = aynaProject(map, p.point.lon, p.point.lat);
                  return <Line key={`l-${p.key}`} x1={x} y1={y} x2={truthXY[0]} y2={truthXY[1]} stroke={p.color} strokeWidth={2 * u} strokeDasharray={`${5 * u} ${3 * u}`} strokeLinecap="round" />;
                })
              : null}
            {sorted.map((p) => {
              const [x, y] = aynaProject(map, p.point.lon, p.point.lat);
              if (playing) {
                // a map pin: the tip on the spot
                const r = 8 * u;
                const cy = y - 17 * u;
                return (
                  <G key={p.key}>
                    <Circle cx={x} cy={y} r={2.5 * u} fill="#151726" opacity={0.55} />
                    <Path d={`M${x} ${y}L${x - r * 0.8} ${cy + r * 0.55}A${r} ${r} 0 1 1 ${x + r * 0.8} ${cy + r * 0.55}Z`} fill={p.color} stroke="#FFFFFF" strokeWidth={2 * u} strokeLinejoin="round" />
                    <Circle cx={x} cy={cy} r={3 * u} fill="#FFFFFF" />
                  </G>
                );
              }
              const r = (p.me ? 6.5 : 5) * u;
              return (
                <G key={p.key}>
                  <Circle cx={x} cy={y} r={r + 1.8 * u} fill="#151726" />
                  <Circle cx={x} cy={y} r={r} fill={p.color} stroke="#FFFFFF" strokeWidth={(p.me ? 2 : 1.4) * u} />
                </G>
              );
            })}
            {truthXY ? (
              <G>
                <Circle cx={truthXY[0]} cy={truthXY[1]} r={15 * u} fill={alpha(C.green, 0.28)} stroke={C.green} strokeWidth={2 * u} />
                <Circle cx={truthXY[0]} cy={truthXY[1]} r={6 * u} fill={C.green} stroke="#FFFFFF" strokeWidth={2.2 * u} />
              </G>
            ) : null}
          </Svg>
          {seas.map((sea) => (
            <View key={sea.name} pointerEvents="none" style={[styles.sea, { width: sea.w, left: sea.left - sea.w / 2, top: sea.top - 10 }]}>
              <Txt v="tiny" center color={alpha('#FFFFFF', 0.8)} style={styles.seaText} numberOfLines={2}>
                {sea.name}
              </Txt>
            </View>
          ))}
          {truth
            ? sorted
                .filter((p) => p.player)
                .map((p) => {
                  const { left, top } = toPx(p.point.lat, p.point.lon);
                  const size = p.me ? 24 : 20;
                  return (
                    <View key={`a-${p.key}`} pointerEvents="none" style={[styles.avatar, { left: left - size / 2, top: top - size - 8 }]}>
                      <Avatar player={{ ...p.player!, connected: true }} size={size} ring={p.color} />
                    </View>
                  );
                })
            : null}
          <View pointerEvents="none" style={styles.edge} />
        </View>
      </Pressable>
      {playing && view ? (
        <Pressable accessibilityRole="button" accessibilityLabel="الخريطة كاملة" hitSlop={6} onPress={() => setView(null)} style={styles.zoomOut}>
          <Icon name="compress" size={16} color={C.text} />
          <Txt v="tiny" color={C.text}>
            الخريطة كاملة
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  frame: { borderRadius: 14, overflow: 'hidden', direction: 'ltr' },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 2, borderColor: alpha('#FFFFFF', 0.14) },
  sea: { position: 'absolute' },
  seaText: { fontSize: 10, lineHeight: 13, textShadowColor: 'rgba(14,30,52,0.95)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  avatar: { position: 'absolute' },
  zoomOut: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: alpha('#101229', 0.82),
    borderWidth: 1,
    borderColor: alpha('#FFFFFF', 0.2),
  },
});
