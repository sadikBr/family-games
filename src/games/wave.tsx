/** «موجة» — one clue, everyone turns their dial to the secret point on the scale. */
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/sfx';
import type { RoomView, WaveView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { McqFinal, RoundHeader } from './islamic-ui';

const INK = '#151726';
// 0 sits at the right end of the dial (where Arabic reading starts), 100 at the left end
const angle = (v: number) => (Math.PI * v) / 100;

function Dial({
  size,
  spectrum,
  target,
  needles,
  value,
  onChange,
}: {
  size: number;
  spectrum: [string, string];
  target: number | null;
  needles: { value: number; color: string }[];
  value: number | null;
  onChange?: (v: number) => void;
}) {
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size * 0.5;
  const pt = (v: number, rr = r) => ({ x: cx + rr * Math.cos(angle(v)), y: cy - rr * Math.sin(angle(v)) });
  const wedge = (a: number, b: number, fill: string) => {
    const lo = Math.max(0, a), hi = Math.min(100, b);
    if (hi <= lo) return null;
    const p1 = pt(lo), p2 = pt(hi);
    return <Path d={`M${cx} ${cy} L${p1.x} ${p1.y} A${r} ${r} 0 0 0 ${p2.x} ${p2.y} Z`} fill={fill} />;
  };
  const move = (e: GestureResponderEvent) => {
    if (!onChange) return;
    const { locationX, locationY } = e.nativeEvent;
    const a = Math.atan2(cy - locationY, locationX - cx);
    const v = Math.round((Math.max(0, Math.min(Math.PI, a < -Math.PI / 2 ? Math.PI : a < 0 ? 0 : a)) / Math.PI) * 100);
    onChange(v);
  };
  const needle = (v: number, color: string, w = 4) => {
    const p = pt(v, r * 0.95);
    return (
      <G key={`${color}${v}`}>
        <Line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={INK} strokeWidth={w + 3} strokeLinecap="round" />
        <Line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={color} strokeWidth={w} strokeLinecap="round" />
      </G>
    );
  };
  return (
    <View style={{ width: size, height: size * 0.62, alignSelf: 'center', direction: 'ltr' }}>
      <Svg width={size} height={size * 0.62}>
        <Path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill="#FFF4DA" stroke={INK} strokeWidth={3} />
        {target !== null ? (
          <G>
            {wedge(target - 17, target + 17, '#F2C23D')}
            {wedge(target - 10, target + 10, '#F08A3E')}
            {wedge(target - 4, target + 4, '#E2475F')}
            {[[-13.5, '2'], [-7, '3'], [0, '4'], [7, '3'], [13.5, '2']].map(([d, t]) => {
              const v = target + Number(d);
              if (v < 0 || v > 100) return null;
              const p = pt(v, r * 0.82);
              return (
                <SvgText key={String(d)} x={p.x} y={p.y + 5} fontSize={14} fontFamily={F.black} fill={INK} textAnchor="middle">
                  {String(t)}
                </SvgText>
              );
            })}
          </G>
        ) : null}
        {needles.map((n) => needle(n.value, n.color, 3))}
        {value !== null ? needle(value, '#3D7BE0', 5) : null}
        <Circle cx={cx} cy={cy} r={9} fill="#3D7BE0" stroke={INK} strokeWidth={3} />
      </Svg>
      <View style={[styles.end, { right: 0 }]}>
        <Txt v="tiny" style={styles.endTxt}>
          {spectrum[0]}
        </Txt>
      </View>
      <View style={[styles.end, { left: 0 }]}>
        <Txt v="tiny" style={styles.endTxt}>
          {spectrum[1]}
        </Txt>
      </View>
      {onChange ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={move}
          onResponderMove={move}
        />
      ) : null}
    </View>
  );
}

export function WaveGame({ room, view }: { room: RoomView; view: WaveView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 24, 420);
  const [clue, setClue] = useState('');
  const [dial, setDial] = useState<{ round: number; v: number }>({ round: view.round, v: 50 });
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="wave" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;
  const iAmPsychic = view.psychic === h.me;
  const value = dial.round === view.round ? dial.v : 50;
  const psychic = h.player(view.psychic);
  const colorOf = (id: string) => h.player(id).color;

  return (
    <>
      <RoundHeader label={`الجولة ${num(view.round)} من ${num(view.rounds)}`} round={0} rounds={0} />
      <Row gap={8} center>
        <Avatar player={psychic} size={30} />
        <Txt v="bold">{iAmPsychic ? 'أنت من يعطي التلميح' : `${psychic.name} يعطي التلميح`}</Txt>
      </Row>

      {view.clue ? (
        <View style={styles.clue}>
          <Txt v="tiny" color={C.muted} center>
            التلميح
          </Txt>
          <Txt style={{ fontFamily: F.display, fontSize: 28, lineHeight: 42, textAlign: 'center' }}>«{view.clue}»</Txt>
        </View>
      ) : null}

      {view.phase === 'guess' ? <TimerBar endsAt={view.endsAt} total={90000} /> : null}
      {view.phase === 'clue' ? <TimerBar endsAt={view.endsAt} total={60000} onTick={iAmPsychic} /> : null}
      {view.passedFrom ? (
        <Txt v="small" center color={C.yellow}>
          انتهى وقت {h.player(view.passedFrom).name} — التلميح الآن عند {psychic.name}
        </Txt>
      ) : null}

      <Dial
        size={size}
        spectrum={view.spectrum}
        target={view.target}
        needles={
          view.phase === 'reveal' && view.guesses
            ? Object.entries(view.guesses).map(([id, v]) => ({ value: v, color: colorOf(id) }))
            : []
        }
        value={view.phase === 'guess' && !iAmPsychic ? (view.myGuess ?? value) : null}
        onChange={view.phase === 'guess' && !iAmPsychic && view.myGuess === null ? (v) => setDial({ round: view.round, v }) : undefined}
      />

      {view.phase === 'clue' && iAmPsychic ? (
        <View style={{ gap: 8 }}>
          <Txt v="small" center color={C.muted}>
            النقطة السرية في المنطقة الحمراء. اكتب كلمة أو جملة قصيرة تجعل الآخرين يضعون المؤشر قريباً منها.
          </Txt>
          <Row gap={8}>
            <Field value={clue} onChangeText={setClue} placeholder="مثلاً: شاي الصباح" placeholderTextColor={C.dim} style={styles.input} maxLength={40} autoCorrect={false} />
            <Btn
              size="md"
              icon="chat"
              label="أرسل"
              disabled={!clue.trim()}
              onPress={() => {
                h.act('clue', { text: clue });
                setClue('');
              }}
            />
          </Row>
        </View>
      ) : view.phase === 'clue' ? (
        <Txt v="bold" center color={C.muted}>
          {psychic.name} يفكر في تلميح…
        </Txt>
      ) : null}

      {view.phase === 'guess' && !iAmPsychic ? (
        view.myGuess === null ? (
          <View style={{ gap: 6 }}>
            <Txt v="small" center color={C.muted}>
              اسحب المؤشر إلى حيث تظن أن التلميح يقع، ثم ثبّت.
            </Txt>
            <Btn
              size="lg"
              icon="check"
              label="ثبّت إجابتي"
              onPress={() => {
                haptic.medium();
                h.act('guess', { value });
              }}
            />
          </View>
        ) : (
          <Txt v="bold" center color={C.green}>
            ثبّتّ إجابتك — في انتظار الآخرين ({num(view.locked.length)})
          </Txt>
        )
      ) : view.phase === 'guess' ? (
        <Txt v="bold" center color={C.muted}>
          ثبّت {num(view.locked.length)} من {num(Object.keys(view.scores).length - 1)}
        </Txt>
      ) : null}

      {view.phase === 'reveal' && view.results ? (
        <View style={{ gap: 6 }}>
          {[...view.results]
            .sort((a, b) => b.points - a.points)
            .map((r) => (
              <Row key={r.id} gap={8} style={styles.result}>
                <View style={[styles.swatch, { backgroundColor: colorOf(r.id) }]} />
                <Avatar player={h.player(r.id)} size={24} />
                <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                  {h.player(r.id).name}
                  {r.id === view.psychic ? ' (التلميح)' : ''}
                </Txt>
                <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: r.points ? C.green : C.dim }}>{r.points ? `+${num(r.points)}` : '0'}</Txt>
              </Row>
            ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  end: { position: 'absolute', bottom: 0, maxWidth: '42%' },
  endTxt: { backgroundColor: alpha('#151726', 0.75), color: '#FFF4DA', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', textAlign: 'center' },
  clue: { backgroundColor: C.surface, borderRadius: 18, padding: 10, borderWidth: 2, borderColor: alpha(C.yellow, 0.5) },
  input: { flex: 1, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontFamily: F.bold, fontSize: 17, textAlign: 'right', borderWidth: 2, borderColor: C.border },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  swatch: { width: 10, height: 24, borderRadius: 4 },
});
