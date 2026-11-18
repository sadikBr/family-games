import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import type { DrawStroke, DrawView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { useScrollLock } from '@/ui/screen';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { dk } from '@/ui/layout';

const COLORS = ['#1B1830', '#E2475F', '#F08A3E', '#F2B33D', '#2FB67C', '#2D9CDB', '#7B61D9', '#8A5A2B'];
const WIDTHS = [6, 14, 30];
const ERASER = '#FFFFFF';

function pathOf(pts: number[], k: number) {
  if (pts.length < 2) return '';
  let d = `M${pts[0] * k} ${pts[1] * k}`;
  if (pts.length === 2) d += `L${pts[0] * k + 0.1} ${pts[1] * k}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i] * k} ${pts[i + 1] * k}`;
  return d;
}

function Strokes({ strokes, size }: { strokes: DrawStroke[]; size: number }) {
  const k = size / 1000;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {strokes.map((s) => (
        <Path key={s.id} d={pathOf(s.pts, k)} stroke={s.c} strokeWidth={s.w * k} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}

/** The drawer's canvas: draws locally right away and streams points to the server in small batches. */
function Canvas({ view, size }: { view: DrawView; size: number }) {
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [local, setLocal] = useState<DrawStroke | null>(null);
  const cur = useRef<{ id: string; c: string; w: number; pts: number[]; sent: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seq = useRef(0);
  const tool = useRef({ color: COLORS[0], width: WIDTHS[1] });
  // the page must not scroll while a finger is on the board (Android's scroll would cut the stroke)
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
  // leaving the board (end of the turn) with a finger still down: give the page its scroll back
  useEffect(
    () => () => {
      if (holding.current) hold(false);
    },
    [hold],
  );
  const pickColor = (c: string) => {
    tool.current.color = c;
    setColor(c);
  };
  const pickWidth = (w: number) => {
    tool.current.width = w;
    setWidth(w);
  };

  const flush = () => {
    const s = cur.current;
    if (!s || s.sent >= s.pts.length) return;
    const chunk = s.pts.slice(s.sent);
    client.act({ type: 'stroke', id: s.id, c: s.c, w: s.w, pts: chunk });
    s.sent = s.pts.length;
  };

  const k = 1000 / size;
  const point = (px: number, py: number) => [Math.max(0, Math.min(1000, Math.round(px * k))), Math.max(0, Math.min(1000, Math.round(py * k)))] as const;
  const start = (px: number, py: number) => {
    grab();
    const [x, y] = point(px, py);
    seq.current += 1;
    cur.current = { id: `s${seq.current}`, c: tool.current.color, w: tool.current.width, pts: [x, y], sent: 0 };
    setLocal({ ...cur.current, pts: [x, y] });
    timer.current = setInterval(flush, 160);
  };
  const move = (px: number, py: number) => {
    const s = cur.current;
    if (!s) return;
    const [x, y] = point(px, py);
    const lx = s.pts[s.pts.length - 2], ly = s.pts[s.pts.length - 1];
    if (Math.hypot(x - lx, y - ly) < 6) return;
    s.pts.push(x, y);
    setLocal({ ...s, pts: s.pts.slice() });
  };
  const end = () => {
    if (!cur.current) return letGo();
    flush();
    if (timer.current) clearInterval(timer.current);
    cur.current = null;
    setLocal(null);
    letGo();
  };

  // the handlers only run on touch events (never during render); the lint can't see that through the
  // gesture builder
  /* eslint-disable react-hooks/refs */
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => start(e.x, e.y))
    .onUpdate((e) => move(e.x, e.y))
    .onFinalize(() => end());
  /* eslint-enable react-hooks/refs */

  const shown = local && !view.strokes.some((s) => s.id === local.id && s.pts.length >= local.pts.length) ? [...view.strokes.filter((s) => s.id !== local.id), local] : view.strokes;

  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.canvas, { width: size, height: size }]}>
        <Strokes strokes={shown} size={size} />
        {/* a native pan gesture: it owns the finger from the first pixel, so the page's scroll can't
            take a vertical stroke (Android); a child-less layer, so coordinates are the board's */}
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
        {/* the frame on top: it doesn't shrink the drawing area (coordinates match the strokes) */}
        <View style={styles.frame} pointerEvents="none" />
      </View>
      <Row gap={6} center wrap>
        {COLORS.map((c) => (
          <Pressable key={c} onPress={() => pickColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} accessibilityLabel={`لون ${c}`} />
        ))}
        <Pressable onPress={() => pickColor(ERASER)} style={[styles.swatch, styles.eraser, color === ERASER && styles.swatchOn]} accessibilityLabel="ممحاة">
          <Icon name="close" size={14} color={C.ink} />
        </Pressable>
      </Row>
      <Row gap={10} center>
        {WIDTHS.map((w) => (
          <Pressable key={w} onPress={() => pickWidth(w)} style={[styles.width, width === w && styles.widthOn]} accessibilityLabel={`سمك ${w}`}>
            <View style={{ width: w * 0.6 + 4, height: w * 0.6 + 4, borderRadius: 99, backgroundColor: color === ERASER ? C.dim : color }} />
          </Pressable>
        ))}
        <IconBtn icon="back" size={40} label="تراجع" onPress={() => client.act({ type: 'undo' })} />
        <IconBtn icon="trash" size={40} label="مسح الكل" onPress={() => client.act({ type: 'clear' })} />
      </Row>
    </View>
  );
}

function GuessBox() {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    client.act({ type: 'guess', text: t });
    setText('');
  };
  return (
    <Row gap={8}>
      <Field
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        placeholder="اكتب تخمينك…"
        placeholderTextColor={C.dim}
        style={styles.input}
        returnKeyType="send"
        autoCorrect={false}
        blurOnSubmit={false}
      />
      <Btn size="md" icon="next" label="خمّن" onPress={send} />
    </Row>
  );
}

export function DrawGame({ room, view }: { room: RoomView; view: DrawView }) {
  const h = helpers(room);
  const { width, height } = useWindowDimensions();
  // the board, its colours and the guess box fit on the screen without scrolling
  const size = Math.max(220, Math.min(width - 32, dk(440), height - 330));
  const accent = useAccent();
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  const isDrawer = view.drawer === h.me;
  const drawer = h.player(view.drawer);
  const iGuessed = view.guessed.includes(h.me);

  if (view.phase === 'final') {
    const scores = Object.fromEntries(view.participants.map((id) => [id, view.scores[id] ?? 0]));
    const best = Math.max(0, ...Object.values(scores));
    const winners = Object.keys(scores).filter((id) => scores[id] === best);
    const won = winners.includes(h.me);
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<GameArt id="draw" size={84} />}
          title={winners.length === 1 ? `الفوز ${li(h.player(winners[0]).name)}` : 'تعادل!'}
          sub="أبطال الرسم"
        />
        <Podium players={room.players} scores={scores} />
        <Scoreboard players={room.players} scores={scores} highlight={h.me} />
        <PlayAgain room={room} />
      </>
    );
  }

  const header = (
    <RoundHeader
      label={`الجولة ${num(view.round)} من ${num(view.totalRounds)}`}
      round={0}
      rounds={0}
      right={
        <Txt v="tiny" color={C.muted}>
          أصاب {num(view.guessed.length)} من {num(view.participants.length - 1)}
        </Txt>
      }
    />
  );
  // everyone's score; the drawer framed, a tick line for those who found the word
  const strip = (
    <PlayerStrip
      room={room}
      active={[view.drawer]}
      entries={view.participants.map((id) => ({
        id,
        score: view.scores[id] ?? 0,
        sub:
          view.phase === 'reveal' && view.roundPoints
            ? num(`+${view.roundPoints[id] ?? 0}`)
            : id === view.drawer
              ? 'الرسم'
              : view.guessed.includes(id)
                ? 'إصابة ✓'
                : undefined,
      }))}
    />
  );

  if (view.phase === 'choose') {
    return (
      <>
        {header}
        <TimerBar endsAt={view.endsAt} total={view.total} />
        {isDrawer && view.options ? (
          <>
            <PhaseTitle icon="edit" title="اختر كلمة لترسمها" sub="لا تكتب حروفاً ولا أرقاماً في الرسم" />
            <View style={{ gap: 10 }}>
              {view.options.map((w) => (
                <Btn key={w} size="lg" label={w} ghost onPress={() => h.act('choose', { word: w })} />
              ))}
            </View>
          </>
        ) : (
          <PhaseTitle art={<Avatar player={drawer} size={84} ring={drawer.color} />} title="اختيار الكلمة…" sub={`الرسم الآن من ${drawer.name}. استعدوا للتخمين`} />
        )}
        {strip}
      </>
    );
  }

  const word = view.word;
  return (
    <>
      {header}
      {view.phase === 'draw' || view.phase === 'reveal' ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={isDrawer && view.phase === 'draw'} /> : null}
      <View style={[styles.wordBox, { borderColor: alpha(accent, 0.5) }]}>
        {view.phase === 'reveal' ? (
          <Txt v="tiny" center color={C.muted}>
            الكلمة كانت
          </Txt>
        ) : null}
        {word ? (
          <Txt v="title" center color={view.phase === 'reveal' ? C.yellow : C.text}>
            {word}
          </Txt>
        ) : (
          <Txt style={styles.hint}>{view.hint}</Txt>
        )}
        {view.phase === 'draw' && !isDrawer && iGuessed ? (
          <Txt v="tiny" center color={C.green}>
            أصبت! خمّنت الكلمة
          </Txt>
        ) : null}
      </View>

      {isDrawer && view.phase === 'draw' ? (
        <Canvas view={view} size={size} />
      ) : (
        <View style={[styles.canvas, { width: size, height: size }]}>
          <Strokes strokes={view.strokes} size={size} />
          <View style={styles.frame} pointerEvents="none" />
        </View>
      )}

      {view.phase === 'draw' && !isDrawer && !iGuessed ? (
        <>
          {view.close ? (
            <Txt v="small" center color={C.yellow}>
              قريب جداً!
            </Txt>
          ) : null}
          <GuessBox />
        </>
      ) : null}
      {isDrawer && view.phase === 'draw' && !view.guessed.length ? <Btn size="sm" ghost icon="skip" label="تخطَّ هذه الكلمة" onPress={() => h.act('giveup')} /> : null}

      {view.phase === 'reveal' ? (
        <>
          <Txt v="small" center color={C.muted}>
            المجموع، وتحت كل اسم نقاط هذا الدور
          </Txt>
          {strip}
          {h.isHost ? <Btn size="lg" icon="next" label="التالي" onPress={() => h.act('next')} /> : <HostNote>المضيف ينتقل إلى الدور التالي</HostNote>}
        </>
      ) : null}

      {view.feed.length && view.phase === 'draw' ? (
        <ScrollView style={styles.feed} contentContainerStyle={{ gap: 4, padding: 8 }}>
          {view.feed
            .slice()
            .reverse()
            .map((f) => (
              <Row key={f.id} gap={6}>
                <Avatar player={h.player(f.by)} size={20} />
                <Txt v="small" color={f.ok ? C.green : C.text} style={{ flex: 1 }} numberOfLines={1}>
                  {f.ok ? `${h.player(f.by).name} — إصابة!` : f.text}
                </Txt>
              </Row>
            ))}
        </ScrollView>
      ) : null}
      {view.phase === 'draw' ? strip : null}
    </>
  );
}

const styles = StyleSheet.create({
  canvas: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18, borderWidth: 3, borderColor: '#151726' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#151726' },
  swatchOn: { borderColor: C.yellow, borderWidth: 3, transform: [{ scale: 1.06 }] },
  eraser: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  width: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  widthOn: { borderColor: C.yellow },
  wordBox: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  hint: { fontFamily: F.display, fontSize: 24, lineHeight: 36, color: C.text, letterSpacing: 2, writingDirection: 'rtl', textAlign: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: F.bold,
    fontSize: 18,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    writingDirection: 'rtl',
    borderWidth: 2,
    borderColor: C.border,
  },
  feed: { maxHeight: 160, backgroundColor: alpha('#000000', 0.18), borderRadius: 14 },
});
