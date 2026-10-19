/**
 * «الرسم المتسلسل» — drawing. The same pen as «ارسم وخمّن» (colours, widths, eraser, undo), but the
 * drawing is private: lines are drawn on the phone, thinned out, and sent one by one when the finger
 * lifts (the server keeps a draft so nothing is lost if time runs out or the phone reconnects).
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { client } from '@/lib/client';
import type { TeledrawStroke } from '@/shared/games/teledraw';
import { simplifyPoints } from '@/shared/teledraw-geom';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { IconBtn } from '@/ui/btn';
import { useScrollLock } from '@/ui/screen';
import { Txt } from '@/ui/txt';

export const PEN_COLORS = ['#1B1830', '#E2475F', '#F08A3E', '#F2B33D', '#2FB67C', '#2D9CDB', '#7B61D9', '#8A5A2B'];
const WIDTHS = [6, 14, 30];
const ERASER = '#FFFFFF';
export const PAPER = '#FFFFFF';

function pathOf(pts: number[], k: number) {
  if (pts.length < 2) return '';
  let d = `M${pts[0] * k} ${pts[1] * k}`;
  if (pts.length === 2) d += `L${pts[0] * k + 0.1} ${pts[1] * k}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i] * k} ${pts[i + 1] * k}`;
  return d;
}

function Strokes({ strokes, size }: { strokes: TeledrawStroke[]; size: number }) {
  const k = size / 1000;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {strokes.map((s, i) => (
        <Path key={i} d={pathOf(s.p, k)} stroke={s.c} strokeWidth={s.w * k} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}

/** A finished drawing on its sheet of paper; `note` («(لا شيء)»…) is written in the middle of an empty one. */
export function Sketch({ strokes, size, note, frame }: { strokes: TeledrawStroke[]; size: number; note?: string; frame?: string }) {
  return (
    <View style={[styles.paper, { width: size, height: size, borderRadius: size < 160 ? 12 : 18, borderColor: frame ?? '#151726' }]}>
      <Strokes strokes={strokes} size={size} />
      {note ? (
        <View style={styles.note}>
          <Txt v={size < 160 ? 'small' : 'h2'} color="#8B88A8" center>
            {note}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/** My canvas for this step. Starts from the server's draft (after a reconnect), then keeps its own copy. */
export function DrawPad({ size, initial, frame }: { size: number; initial: TeledrawStroke[]; frame: string }) {
  const [strokes, setStrokes] = useState<TeledrawStroke[]>(initial);
  const [live, setLive] = useState<TeledrawStroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const cur = useRef<TeledrawStroke | null>(null);
  const tool = useRef({ color: PEN_COLORS[0], width: WIDTHS[1] });
  // the page must not scroll while a finger is on the pad (Android's scroll would cut the stroke)
  const hold = useScrollLock();
  const holding = useRef(false);
  const grab = () => {
    if (holding.current) return;
    holding.current = true;
    hold(true);
  };
  const letGo = () => {
    if (!holding.current) return;
    holding.current = false;
    hold(false);
  };
  // and while the board is on screen at all: a stroke that starts with a quick swipe would otherwise be
  // taken by the page before the lock above arrives (the board is sized to fit, nothing to scroll to)
  useEffect(() => {
    hold(true);
    return () => {
      hold(false);
      if (holding.current) hold(false);
    };
  }, [hold]);
  const pickColor = (c: string) => {
    tool.current.color = c;
    setColor(c);
  };
  const pickWidth = (w: number) => {
    tool.current.width = w;
    setWidth(w);
  };

  const k = 1000 / size;
  const point = (e: GestureResponderEvent) =>
    [Math.max(0, Math.min(1000, Math.round(e.nativeEvent.locationX * k))), Math.max(0, Math.min(1000, Math.round(e.nativeEvent.locationY * k)))] as const;
  const start = (e: GestureResponderEvent) => {
    const [x, y] = point(e);
    cur.current = { c: tool.current.color, w: tool.current.width, p: [x, y] };
    setLive({ ...cur.current, p: [x, y] });
  };
  const move = (e: GestureResponderEvent) => {
    const s = cur.current;
    if (!s) return;
    const [x, y] = point(e);
    const lx = s.p[s.p.length - 2];
    const ly = s.p[s.p.length - 1];
    if (Math.hypot(x - lx, y - ly) < 5) return;
    s.p.push(x, y);
    setLive({ ...s, p: s.p.slice() });
  };
  const end = () => {
    letGo();
    const s = cur.current;
    cur.current = null;
    setLive(null);
    if (!s) return;
    const done: TeledrawStroke = { c: s.c, w: s.w, p: simplifyPoints(s.p) };
    setStrokes((all) => [...all, done]);
    client.act({ type: 'stroke', ...done });
  };
  const undo = () => {
    setStrokes((all) => all.slice(0, -1));
    client.act({ type: 'undo' });
  };
  const clear = () => {
    setStrokes([]);
    client.act({ type: 'clear' });
  };

  const shown = live ? [...strokes, live] : strokes;
  const sw = Math.min(40, Math.floor((size - 7 * 5) / 8));
  const eraser = color === ERASER;

  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <View style={[styles.paper, { width: size, height: size, borderColor: frame }]}>
        <Strokes strokes={shown} size={size} />
        {/* a child-less layer on top, so touch coordinates are always relative to the canvas */}
        <View
          style={StyleSheet.absoluteFill}
          accessibilityLabel="لوحة الرسم"
          onTouchStart={grab}
          onTouchEnd={letGo}
          onTouchCancel={letGo}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={start}
          onResponderMove={move}
          onResponderRelease={end}
          onResponderTerminate={end}
        />
      </View>
      <Row gap={5} center style={{ direction: 'ltr' }}>
        {PEN_COLORS.map((c) => (
          <Pressable
            key={c}
            hitSlop={4}
            onPress={() => pickColor(c)}
            style={[styles.swatch, { width: sw, height: sw, borderRadius: sw / 2, backgroundColor: c }, color === c && styles.swatchOn]}
            accessibilityLabel="لون"
          />
        ))}
      </Row>
      <Row gap={8} center>
        <Pressable onPress={() => pickColor(ERASER)} style={[styles.tool, eraser && styles.toolOn]} accessibilityLabel="ممحاة">
          <View style={styles.eraser} />
        </Pressable>
        {WIDTHS.map((w) => (
          <Pressable key={w} onPress={() => pickWidth(w)} style={[styles.tool, width === w && styles.toolOn]} accessibilityLabel={`سمك ${w}`}>
            <View style={[styles.dot, { width: w * 0.6 + 4, height: w * 0.6 + 4, backgroundColor: eraser ? C.dim : color }]} />
          </Pressable>
        ))}
        <IconBtn icon="back" size={40} label="تراجع" onPress={undo} />
        <IconBtn icon="trash" size={40} label="مسح الكل" onPress={clear} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { alignSelf: 'center', backgroundColor: PAPER, borderRadius: 18, borderWidth: 3, overflow: 'hidden' },
  note: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  swatch: { borderWidth: 2, borderColor: '#151726' },
  swatchOn: { borderColor: C.yellow, borderWidth: 3, transform: [{ scale: 1.06 }] },
  tool: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  toolOn: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.12) },
  dot: { borderRadius: 99, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  eraser: { width: 22, height: 14, borderRadius: 4, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#B4B1D4', transform: [{ rotate: '-20deg' }] },
});
