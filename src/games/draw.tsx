import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import type { DrawStroke, DrawView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PhaseTitle, PlayAgain, Spectator } from './common';
import { helpers } from './helpers';

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
  const point = (e: GestureResponderEvent) =>
    [Math.max(0, Math.min(1000, Math.round(e.nativeEvent.locationX * k))), Math.max(0, Math.min(1000, Math.round(e.nativeEvent.locationY * k)))] as const;
  const start = (e: GestureResponderEvent) => {
    const [x, y] = point(e);
    seq.current += 1;
    cur.current = { id: `s${seq.current}`, c: tool.current.color, w: tool.current.width, pts: [x, y], sent: 0 };
    setLocal({ ...cur.current, pts: [x, y] });
    timer.current = setInterval(flush, 160);
  };
  const move = (e: GestureResponderEvent) => {
    const s = cur.current;
    if (!s) return;
    const [x, y] = point(e);
    const lx = s.pts[s.pts.length - 2], ly = s.pts[s.pts.length - 1];
    if (Math.hypot(x - lx, y - ly) < 6) return;
    s.pts.push(x, y);
    setLocal({ ...s, pts: s.pts.slice() });
  };
  const end = () => {
    flush();
    if (timer.current) clearInterval(timer.current);
    cur.current = null;
    setLocal(null);
  };

  const shown = local && !view.strokes.some((s) => s.id === local.id && s.pts.length >= local.pts.length) ? [...view.strokes.filter((s) => s.id !== local.id), local] : view.strokes;

  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.canvas, { width: size, height: size }]}>
        <Strokes strokes={shown} size={size} />
        {/* a child-less layer on top, so touch coordinates are always relative to the canvas */}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={start}
          onResponderMove={move}
          onResponderRelease={end}
          onResponderTerminate={end}
        />
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
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 440);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  const isDrawer = view.drawer === h.me;
  const drawer = h.player(view.drawer);
  const iGuessed = view.guessed.includes(h.me);

  if (view.phase === 'final') {
    return (
      <>
        <Confetti />
        <PhaseTitle art={<GameArt id="draw" size={84} />} title="أبطال الرسم" />
        <Podium players={room.players} scores={view.scores} />
        <Card>
          <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
        </Card>
        <PlayAgain room={room} />
      </>
    );
  }

  const header = (
    <Row gap={10}>
      <Avatar player={drawer} size={34} badge="mic" />
      <View style={{ flex: 1 }}>
        <Txt v="bold" numberOfLines={1}>
          {isDrawer ? 'أنت ترسم' : `${drawer.name} يرسم`}
        </Txt>
        <Txt v="tiny" color={C.dim}>
          الجولة {view.round} من {view.totalRounds} · خمّن {view.guessed.length} من {view.participants.length - 1}
        </Txt>
      </View>
    </Row>
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
                <Btn key={w} size="lg" label={w} color={C.surfaceStrong} textColor={C.text} onPress={() => h.act('choose', { word: w })} />
              ))}
            </View>
          </>
        ) : (
          <PhaseTitle art={<Avatar player={drawer} size={84} />} title={`${drawer.name} يختار كلمة…`} sub="استعدوا للتخمين" />
        )}
      </>
    );
  }

  const word = view.word;
  return (
    <>
      {header}
      {view.phase === 'draw' || view.phase === 'reveal' ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={isDrawer && view.phase === 'draw'} /> : null}
      <View style={styles.wordBox}>
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

      {view.phase === 'reveal' && view.roundPoints ? (
        <Card>
          <Txt v="h3">نقاط هذا الدور</Txt>
          <Scoreboard players={room.players} scores={view.roundPoints} highlight={h.me} />
          {h.isHost ? <Btn size="md" icon="next" label="التالي" onPress={() => h.act('next')} /> : null}
        </Card>
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
                  {f.ok ? `${h.player(f.by).name} خمّن الكلمة!` : f.text}
                </Txt>
              </Row>
            ))}
        </ScrollView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  canvas: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 3, borderColor: '#151726', overflow: 'hidden' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#151726' },
  swatchOn: { borderColor: C.yellow, borderWidth: 3, transform: [{ scale: 1.06 }] },
  eraser: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  width: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  widthOn: { borderColor: C.yellow },
  wordBox: { backgroundColor: C.surface, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
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
