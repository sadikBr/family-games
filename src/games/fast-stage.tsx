/**
 * «الأسرع» — the mini-games on the screen: the stimulus (the circle, the grid, the stars, the word…) and
 * its answer buttons. Everything is sized from the width it's given, so it fits a 320 px phone, and every
 * tap target is at least 48 px.
 *
 * The stimulus appears at once (no fade: a reaction game must not blur the moment it starts). At the
 * reveal, the right answer gets a calm green frame and my wrong tap a red one; the rest dims.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';

import { AvatarArt } from '@/art/avatars';
import { Icon } from '@/art/icons';
import {
  FAST_COLOR_HEX,
  FAST_COLOR_NAME,
  FAST_DIRS,
  type FastAnswer,
  type FastColor,
  type FastContent,
  type FastDir,
  type FastShape,
  type FastShapeKind,
} from '@/shared/games/fast';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Txt, num } from '@/ui/txt';

export type Tone = 'idle' | 'picked' | 'right' | 'wrong' | 'dim';

export interface StageProps {
  content: FastContent;
  /** usable width */
  width: number;
  /** the most height the stage may take (without its buttons) */
  maxHeight: number;
  /** the stimulus is on the screen (false: green's red circle / not yet) */
  shown: boolean;
  /** taps are taken */
  live: boolean;
  /** my answer this round (tapped or sent) */
  mine: FastAnswer | null;
  /** reveal: the right answer */
  right: FastAnswer | null;
  /** «اضغط بالترتيب»: the spots tapped so far */
  seq: number[];
  onAnswer: (a: FastAnswer) => void;
  /** «اضغط عند الأخضر»: a tap on the red circle */
  onEarly: () => void;
  /** «اضغط بالترتيب»: one spot tapped */
  onSpot: (i: number) => void;
}

/** The tone of option `i`: picked by me (yellow) while playing; right / wrong / dim at the reveal. */
export function toneOf(i: number, mine: FastAnswer | null, right: FastAnswer | null): Tone {
  if (right !== null) return i === right ? 'right' : i === mine ? 'wrong' : 'dim';
  return i === mine ? 'picked' : 'idle';
}

const TONE_COLOR: Record<Tone, string | null> = { idle: null, picked: C.yellow, right: C.green, wrong: C.red, dim: null };

/**
 * A tap counted at the finger's touch (`onPressIn`: a release would add a variable delay), with the
 * click as a fallback for a very quick tap the touch handler missed (seen on the web); never twice.
 */
function useTap(fn: () => void) {
  const fired = useRef(false);
  return {
    onPressIn: () => {
      fired.current = true;
      fn();
    },
    onPress: () => {
      if (!fired.current) fn();
      fired.current = false;
    },
  };
}

/** A panel's padding and border on each side: its inner width is `width - 2 * INSET`. */
const INSET = 14;

/** The frame of the stimulus, in the game's colour. */
function Panel({ children, height, pad = 12 }: { children: ReactNode; height?: number; pad?: number }) {
  const accent = useAccent();
  return <View style={[styles.panel, { borderColor: alpha(accent, 0.6), padding: pad }, height !== undefined && { height }]}>{children}</View>;
}

/** A tappable box with a tone frame (answers, cells, number buttons). */
function OptBox({
  tone,
  live,
  onPress,
  label,
  style,
  children,
}: {
  tone: Tone;
  live: boolean;
  onPress: () => void;
  label: string;
  style?: object;
  children: ReactNode;
}) {
  const color = TONE_COLOR[tone];
  const tap = useTap(onPress);
  return (
    <Pressable
      disabled={!live}
      {...tap}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.opt,
        style,
        color && { borderColor: color, backgroundColor: alpha(color, 0.18) },
        tone === 'dim' && { opacity: 0.4 },
        pressed && live && { opacity: 0.8 },
      ]}>
      {children}
      {tone === 'right' || tone === 'wrong' ? (
        <View style={[styles.mark, { backgroundColor: color! }]}>
          <Icon name={tone === 'right' ? 'check' : 'close'} size={12} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

/** A row (or a grid) of option boxes that always fits `width`. */
function optSize(width: number, n: number, gap = 8, max = 96) {
  return Math.min(max, Math.floor((width - gap * (n - 1)) / n));
}

/* —— shapes —————————————————————————————————————————————————————————————————— */

function starPoints(cx: number, cy: number, r: number, inner = 0.45) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function ShapePath({ shape, fill }: { shape: FastShapeKind; fill: string }) {
  const stroke = { stroke: 'rgba(0,0,0,0.35)', strokeWidth: 3 };
  switch (shape) {
    case 'circle':
      return <Circle cx={50} cy={50} r={40} fill={fill} {...stroke} />;
    case 'square':
      return <Rect x={13} y={13} width={74} height={74} rx={10} fill={fill} {...stroke} />;
    case 'triangle':
      return <Path d="M50 9 L92 86 H8Z" fill={fill} strokeLinejoin="round" {...stroke} />;
    case 'star':
      return <Polygon points={starPoints(50, 54, 46)} fill={fill} strokeLinejoin="round" {...stroke} />;
    case 'heart':
      return <Path d="M50 88 C22 68 7 50 7 32 C7 17 18 8 31 8 C40 8 46 13 50 21 C54 13 60 8 69 8 C82 8 93 17 93 32 C93 50 78 68 50 88Z" fill={fill} {...stroke} />;
    case 'diamond':
      return <Path d="M50 6 L90 50 L50 94 L10 50Z" fill={fill} strokeLinejoin="round" {...stroke} />;
  }
}

function ShapeArt({ s, size }: { s: FastShape; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G rotation={s.rot} origin="50, 50">
        <ShapePath shape={s.shape} fill={FAST_COLOR_HEX[s.color]} />
      </G>
    </Svg>
  );
}

const ARROW_ROT: Record<FastDir, number> = { right: 0, down: 90, left: 180, up: 270 };

function ArrowArt({ dir, size, color }: { dir: FastDir; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G rotation={ARROW_ROT[dir]} origin="50, 50">
        <Path d="M10 38 H54 V16 L92 50 L54 84 V62 H10Z" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={3} strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/* —— the mini-games —————————————————————————————————————————————————————————————— */

/** «اضغط عند الأخضر»: one big circle, red then green; the whole circle is the button. */
function Green({ width, maxHeight, shown, live, mine, right, onAnswer, onEarly }: StageProps) {
  const d = Math.round(Math.min(width - 24, maxHeight - 24, 300));
  const go = shown || right !== null;
  const color = go ? C.green : C.red;
  const label = right !== null ? 'الأخضر' : mine !== null ? (go ? 'تم!' : 'مبكر!') : go ? 'الآن!' : 'انتظر';
  const tap = useTap(() => (go ? onAnswer(0) : onEarly()));
  return (
    <Panel>
      <View style={{ alignItems: 'center' }}>
        <Pressable
          disabled={!live}
          {...tap}
          accessibilityRole="button"
          accessibilityLabel={go ? 'اضغط الآن' : 'انتظر الأخضر'}
          style={[styles.bigCircle, { width: d, height: d, borderRadius: d / 2, backgroundColor: color, borderColor: alpha('#FFFFFF', 0.35) }]}>
          <Txt v="display" center style={{ fontSize: Math.max(28, d / 6.5), lineHeight: Math.max(42, d / 4.3) }} color="#FFFFFF">
            {label}
          </Txt>
        </Pressable>
      </View>
    </Panel>
  );
}

/** «أيّ شكل مختلف؟»: a grid of shapes; the cell itself is the button. */
function Odd({ content, width, maxHeight, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'odd' }> }) {
  const gap = 6;
  const side = Math.min(width - 2 * INSET, maxHeight - 2 * INSET);
  const cell = Math.floor((side - gap * (content.cols - 1)) / content.cols);
  return (
    <Panel>
      <View style={[styles.grid, { width: cell * content.cols + gap * (content.cols - 1), gap, alignSelf: 'center' }]}>
        {content.cells.map((s, i) => (
          <OptBox key={i} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={`شكل ${i + 1}`} style={{ width: cell, height: cell, borderRadius: 12 }}>
            <ShapeArt s={s} size={Math.round(cell * 0.68)} />
          </OptBox>
        ))}
      </View>
    </Panel>
  );
}

/** «عُدّ النجوم»: the stars for a moment, then a «؟»; four count buttons. */
function Stars({ content, width, maxHeight, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'stars' }> }) {
  const h = Math.round(Math.min(width * 0.62, maxHeight - 24));
  const w = width - 2 * INSET;
  const [gone, setGone] = useState(false);
  // the stars stay as long as the server says, counted from when they appeared on this phone
  useEffect(() => {
    const t = setTimeout(() => setGone(true), content.showMs);
    return () => clearTimeout(t);
  }, [content.showMs]);
  const showStars = !gone || right !== null;
  const r = Math.min(w / 4, h / 3) * 0.32;
  const size = optSize(width, 4);
  return (
    <>
      <Panel height={h + 2 * INSET}>
        {showStars ? (
          <Svg width={w} height={h}>
            {content.stars.map(([x, y], i) => (
              <Polygon key={i} points={starPoints(x * w, y * h, r)} fill={C.yellow} stroke="rgba(0,0,0,0.3)" strokeWidth={2} strokeLinejoin="round" />
            ))}
          </Svg>
        ) : (
          <View style={styles.center}>
            <Txt v="hero" color={C.muted}>
              ؟
            </Txt>
          </View>
        )}
      </Panel>
      <View style={styles.row}>
        {content.options.map((n, i) => (
          <OptBox key={i} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={String(n)} style={{ width: size, height: 64 }}>
            <Txt style={styles.bigNum}>{num(n)}</Txt>
          </OptBox>
        ))}
      </View>
    </>
  );
}

/** «اللون والكلمة»: a colour's name written in another colour; four colour buttons. */
function Stroop({ content, width, maxHeight, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'stroop' }> }) {
  const h = Math.round(Math.min(150, maxHeight - 24));
  const size = optSize(width, 4, 10, 76);
  return (
    <>
      <Panel height={h}>
        <View style={styles.center}>
          <Txt v="hero" center color={FAST_COLOR_HEX[content.ink]} style={{ fontSize: 58, lineHeight: 84 }}>
            {FAST_COLOR_NAME[content.word]}
          </Txt>
        </View>
      </Panel>
      <View style={[styles.row, { gap: 10 }]}>
        {content.options.map((c: FastColor, i) => (
          <OptBox key={c} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={FAST_COLOR_NAME[c]} style={{ width: size, height: size, borderRadius: size / 2 }}>
            <View style={{ width: size - 18, height: size - 18, borderRadius: (size - 18) / 2, backgroundColor: FAST_COLOR_HEX[c] }} />
          </OptBox>
        ))}
      </View>
    </>
  );
}

/** «الأكبر»: six numbers, three by two; each number is a button. */
function Biggest({ content, width, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'biggest' }> }) {
  const gap = 8;
  const w = Math.floor((width - 2 * INSET - gap * 2) / 3);
  return (
    <Panel>
      <View style={[styles.grid, { gap, justifyContent: 'center' }]}>
        {content.numbers.map((n, i) => (
          <OptBox key={i} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={String(n)} style={{ width: w, height: 76 }}>
            <Txt style={[styles.bigNum, { fontSize: 34, lineHeight: 48 }]}>{num(n)}</Txt>
          </OptBox>
        ))}
      </View>
    </Panel>
  );
}

/** «اتبع السهم»: a big arrow; four direction buttons (left, up, down, right as on the screen). */
function Arrow({ content, width, maxHeight, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'arrow' }> }) {
  const h = Math.round(Math.min(170, maxHeight - 24));
  const size = optSize(width, 4, 8, 84);
  return (
    <>
      <Panel height={h}>
        <View style={styles.center}>
          <ArrowArt dir={content.dir} size={h - 30} color={C.yellow} />
        </View>
      </Panel>
      <View style={styles.row}>
        {FAST_DIRS.map((d, i) => (
          <OptBox key={d} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={DIR_NAME[d]} style={{ width: size, height: size }}>
            <ArrowArt dir={d} size={size * 0.6} color={C.text} />
          </OptBox>
        ))}
      </View>
    </>
  );
}

const DIR_NAME: Record<FastDir, string> = { left: 'يسار', up: 'أعلى', down: 'أسفل', right: 'يمين' };

/** «الصورة المطابقة»: the target animal; four (or six) to choose from. */
function Match({ content, width, maxHeight, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'match' }> }) {
  const accent = useAccent();
  const h = Math.round(Math.min(160, maxHeight - 24));
  const perRow = content.options.length > 4 ? 3 : 4;
  const size = optSize(width, perRow, 8, 92);
  const disc = h - 28;
  return (
    <>
      <Panel height={h}>
        <View style={styles.center}>
          <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: alpha(accent, 0.25), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <AvatarArt id={content.target} size={disc * 0.95} />
          </View>
        </View>
      </Panel>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {content.options.map((a, i) => (
          <OptBox key={a} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={`صورة ${i + 1}`} style={{ width: size, height: size, overflow: 'hidden' }}>
            <AvatarArt id={a} size={size - 10} />
          </OptBox>
        ))}
      </View>
    </>
  );
}

/** «حساب سريع»: «3 + 4 = ؟» and four answers. */
function Sum({ content, width, maxHeight, live, mine, right, onAnswer }: StageProps & { content: Extract<FastContent, { kind: 'sum' }> }) {
  const h = Math.round(Math.min(140, maxHeight - 24));
  const size = optSize(width, 4);
  const value = right !== null ? content.options[right as number] : null;
  return (
    <>
      <Panel height={h}>
        <View style={[styles.center, { flexDirection: 'row', direction: 'ltr', gap: 10 }]}>
          <Txt style={styles.sum}>{content.a}</Txt>
          <Txt style={[styles.sum, { color: C.yellow }]}>{content.op === '+' ? '+' : '−'}</Txt>
          <Txt style={styles.sum}>{content.b}</Txt>
          <Txt style={[styles.sum, { color: C.muted }]}>=</Txt>
          <Txt style={[styles.sum, { color: value !== null ? C.green : C.muted }]}>{value !== null ? value : '؟'}</Txt>
        </View>
      </Panel>
      <View style={styles.row}>
        {content.options.map((n, i) => (
          <OptBox key={i} tone={toneOf(i, mine, right)} live={live} onPress={() => onAnswer(i)} label={String(n)} style={{ width: size, height: 64 }}>
            <Txt style={styles.bigNum}>{num(n)}</Txt>
          </OptBox>
        ))}
      </View>
    </>
  );
}

/** One numbered disc of «اضغط بالترتيب». */
function Spot({ onTap, ...rest }: Omit<PressableProps, 'onPress' | 'onPressIn'> & { onTap: () => void }) {
  const tap = useTap(onTap);
  return <Pressable {...rest} {...tap} />;
}

/**
 * «اضغط بالترتيب»: numbered discs scattered on the stage. A tapped disc turns yellow; at the reveal each
 * tap shows whether it was the right one at that step (green) or not (red).
 */
function Order({ content, width, maxHeight, live, mine, right, seq, onSpot }: StageProps & { content: Extract<FastContent, { kind: 'order' }> }) {
  const w = width - 2 * INSET;
  const h = Math.round(Math.min(w, maxHeight - 2 * INSET));
  const d = Math.max(50, Math.min(68, Math.floor(Math.min(w, h) / 4.4)));
  const taps = Array.isArray(mine) ? mine : seq;
  const want = Array.isArray(right) ? right : null;
  return (
    <Panel height={h + 2 * INSET}>
      <View style={{ width: w, height: h }}>
        {content.spots.map(([x, y], i) => {
          const step = taps.indexOf(i);
          let tone: Tone = step >= 0 ? 'picked' : 'idle';
          if (want) tone = step < 0 ? 'dim' : want[step] === i ? 'right' : 'wrong';
          const color = TONE_COLOR[tone];
          return (
            <Spot
              key={i}
              disabled={!live || step >= 0}
              onTap={() => onSpot(i)}
              accessibilityRole="button"
              accessibilityLabel={String(content.labels[i])}
              style={[
                styles.spot,
                {
                  width: d,
                  height: d,
                  borderRadius: d / 2,
                  left: Math.max(0, Math.min(w - d, x * w - d / 2)),
                  top: Math.max(0, Math.min(h - d, y * h - d / 2)),
                },
                color ? { backgroundColor: color, borderColor: color } : null,
                tone === 'dim' && { opacity: 0.45 },
              ]}>
              <Txt style={[styles.bigNum, { fontSize: d * 0.48, lineHeight: d * 0.68, color: color ? C.ink : C.text }]}>{num(content.labels[i])}</Txt>
            </Spot>
          );
        })}
      </View>
    </Panel>
  );
}

export function Stage(props: StageProps) {
  const c = props.content;
  // nothing of the stimulus before its moment (green: the red circle is the stage)
  if (!props.shown && c.kind !== 'green' && props.right === null) return null;
  switch (c.kind) {
    case 'green':
      return <Green {...props} />;
    case 'odd':
      return <Odd {...props} content={c} />;
    case 'stars':
      return <Stars {...props} content={c} />;
    case 'stroop':
      return <Stroop {...props} content={c} />;
    case 'biggest':
      return <Biggest {...props} content={c} />;
    case 'arrow':
      return <Arrow {...props} content={c} />;
    case 'match':
      return <Match {...props} content={c} />;
    case 'sum':
      return <Sum {...props} content={c} />;
    case 'order':
      return <Order {...props} content={c} />;
  }
}

/** The right answer in words, for the reveal (only where the stage alone doesn't say it). */
export function answerText(c: FastContent, a: FastAnswer | null): string | null {
  if (a === null) return null;
  switch (c.kind) {
    case 'stars':
      return `${num(c.options[a as number])} نجوم`;
    case 'stroop':
      return `لون الكتابة: ${FAST_COLOR_NAME[c.ink]}`;
    default:
      return null;
  }
}


const styles = StyleSheet.create({
  panel: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 2, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', direction: 'ltr' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8, direction: 'ltr' },
  opt: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.raised,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.borderStrong,
  },
  mark: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bigCircle: { alignItems: 'center', justifyContent: 'center', borderWidth: 4 },
  bigNum: { fontFamily: F.black, fontSize: 28, lineHeight: 40, color: C.text, textAlign: 'center' },
  sum: { fontFamily: F.black, fontSize: 44, lineHeight: 60, color: C.text },
  spot: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised, borderWidth: 2, borderColor: C.borderStrong },
});
