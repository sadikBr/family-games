/** «حروف» — claim letter hexagons: buzz first, then type the answer. Red joins right ↔ left, green joins top ↔ bottom. */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { displayLetter } from '@/shared/arabic';
import { HEX_N } from '@/shared/islamic';
import type { HuroofTeam, HuroofView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

const TEAM_COLOR: Record<HuroofTeam, string> = { red: '#E2475F', green: '#2FB67C' };
const TEAM_NAME: Record<HuroofTeam, string> = { red: 'الفريق الأحمر', green: 'الفريق الأخضر' };
const INK = '#151726';
const PAPER = '#FFF4DA';

function Grid({ view, size, canPick, onPick }: { view: HuroofView; size: number; canPick: boolean; onPick: (i: number) => void }) {
  // pointy-top hexes, odd rows shifted right; a band on each side shows which team joins it
  const pad = size * 0.06;
  const R = (size - 2 * pad) / (Math.sqrt(3) * (HEX_N + 0.5));
  const w = Math.sqrt(3) * R;
  const H = 2 * R + (HEX_N - 1) * 1.5 * R + 2 * pad;
  const centre = (i: number) => {
    const r = Math.floor(i / HEX_N), c = i % HEX_N;
    return { x: pad + w / 2 + c * w + (r % 2 ? w / 2 : 0), y: pad + R + r * 1.5 * R };
  };
  const poly = (x: number, y: number, rr: number) =>
    [...Array(6)].map((_, k) => {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
  const win = new Set(view.winPath ?? []);
  // the hexagon settled last keeps a light ring until the next question is settled
  const lastCell = view.last && view.cell === null ? view.last.cell : null;
  return (
    <View style={{ width: size, height: H, alignSelf: 'center', direction: 'ltr' }}>
      <Svg width={size} height={H}>
        <Rect x={0} y={0} width={size} height={H} rx={18} fill="#1B1F48" />
        <Rect x={0} y={pad * 0.2} width={pad * 0.8} height={H - pad * 0.4} rx={pad * 0.4} fill={TEAM_COLOR.red} />
        <Rect x={size - pad * 0.8} y={pad * 0.2} width={pad * 0.8} height={H - pad * 0.4} rx={pad * 0.4} fill={TEAM_COLOR.red} />
        <Rect x={pad} y={0} width={size - 2 * pad} height={pad * 0.7} rx={pad * 0.35} fill={TEAM_COLOR.green} />
        <Rect x={pad} y={H - pad * 0.7} width={size - 2 * pad} height={pad * 0.7} rx={pad * 0.35} fill={TEAM_COLOR.green} />
        {view.cells.map((cell, i) => {
          const { x, y } = centre(i);
          const owner = cell.owner;
          const active = view.cell === i;
          return (
            <Polygon
              key={i}
              points={poly(x, y, R * 0.95)}
              fill={owner ? TEAM_COLOR[owner] : PAPER}
              stroke={win.has(i) || active ? '#F4C02E' : lastCell === i ? '#FFFFFF' : INK}
              strokeWidth={win.has(i) || active ? 4 : lastCell === i ? 3.5 : 2}
            />
          );
        })}
        {view.cells.map((cell, i) => {
          const { x, y } = centre(i);
          return (
            <SvgText key={`t${i}`} x={x} y={y + R * 0.32} fontSize={R * 0.95} fontFamily={F.display} fill={cell.owner ? '#FFFFFF' : INK} textAnchor="middle">
              {displayLetter(cell.letter)}
            </SvgText>
          );
        })}
      </Svg>
      {canPick
        ? view.cells.map((cell, i) => {
            if (cell.owner) return null;
            const { x, y } = centre(i);
            return (
              <Pressable
                key={`p${i}`}
                onPress={() => {
                  haptic.medium();
                  onPick(i);
                }}
                accessibilityLabel={`حرف ${displayLetter(cell.letter)}`}
                style={{ position: 'absolute', left: x - R * 0.8, top: y - R * 0.8, width: R * 1.6, height: R * 1.6, borderRadius: R }}
              />
            );
          })
        : null}
    </View>
  );
}

/** The two teams, in the same language as the player strip: the team picking now is framed in its colour. */
function Teams({ view, h, mine }: { view: HuroofView; h: Helpers; mine: HuroofTeam | null }) {
  return (
    <Row gap={6} style={{ alignItems: 'stretch' }}>
      {(['red', 'green'] as HuroofTeam[]).map((t) => {
        const count = view.cells.filter((c) => c.owner === t).length;
        const active = view.phase === 'pick' && view.turn === t;
        return (
          <View
            key={t}
            style={[styles.team, { borderColor: active ? TEAM_COLOR[t] : C.border, backgroundColor: alpha(TEAM_COLOR[t], active ? 0.22 : 0.1) }]}>
            <Row gap={6} style={{ justifyContent: 'space-between' }}>
              <Txt v="tiny" color={C.text} numberOfLines={1} style={{ flexShrink: 1 }}>
                {TEAM_NAME[t]}
                {mine === t ? ' (فريقك)' : ''}
              </Txt>
              <Txt v="bold" color={active ? C.text : C.yellow} style={{ fontSize: 17 }}>
                {num(count)}
              </Txt>
            </Row>
            <Row gap={4} wrap>
              {view.teams[t].map((id) => (
                <Avatar key={id} player={h.player(id)} size={24} ring={view.buzzer === id ? C.yellow : TEAM_COLOR[t]} badge={view.buzzer === id ? 'mic' : undefined} />
              ))}
            </Row>
          </View>
        );
      })}
    </Row>
  );
}

export function HuroofGame({ room, view }: { room: RoomView; view: HuroofView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 24, 460);
  const [typed, setTyped] = useState<{ key: string; text: string }>({ key: '', text: '' });
  const mine: HuroofTeam | null = view.teams.red.includes(h.me) ? 'red' : view.teams.green.includes(h.me) ? 'green' : null;
  if (!mine && view.phase !== 'final') return <Spectator room={room} />;

  if (view.phase === 'final') {
    const won = view.winner === mine;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="huroof" size={84} />} title={view.winner ? `فاز ${TEAM_NAME[view.winner]}` : 'انتهت اللعبة'} sub="أحسنتم جميعاً!" />
        <Grid view={view} size={size} canPick={false} onPick={() => {}} />
        <Teams view={view} h={h} mine={mine} />
        <PlayAgain room={room} />
      </>
    );
  }

  const myPick = view.phase === 'pick' && view.turn === mine;
  const q = view.question;
  const canAnswer = !!mine && view.canAnswer.includes(mine);
  const letter = view.cell !== null ? view.cells[view.cell].letter : null;
  const iBuzzed = view.phase === 'answer' && view.buzzer === h.me;
  // what I type is kept per buzz, so a new question starts empty
  const answerKey = `${view.cell}:${view.buzzer}:${view.canAnswer.join()}`;
  const answer = typed.key === answerKey ? typed.text : '';
  const send = () => {
    if (!answer.trim()) return;
    haptic.medium();
    h.act('answer', { text: answer });
  };

  return (
    <>
      <Teams view={view} h={h} mine={mine} />
      <Grid view={view} size={size} canPick={myPick} onPick={(cell) => h.act('pick', { cell })} />

      {view.phase === 'pick' ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.panel}>
          <Txt v="bold" center color={myPick ? C.yellow : C.muted}>
            {myPick ? 'اختر حرفاً من الشبكة' : `${TEAM_NAME[view.turn]} يختار حرفاً…`}
          </Txt>
          <Txt v="tiny" center color={C.dim}>
            {mine === 'red' ? 'فريقك يصل بين اليمين واليسار' : 'فريقك يصل بين الأعلى والأسفل'}
          </Txt>
        </Animated.View>
      ) : q && letter ? (
        <Animated.View key={q.text} entering={FadeIn.duration(200)} style={styles.panel}>
          <Row gap={10}>
            <View style={styles.letter}>
              <Txt style={{ fontFamily: F.display, fontSize: 30, lineHeight: 44, color: C.ink }}>{displayLetter(letter)}</Txt>
            </View>
            <Txt v="h3" style={{ flex: 1 }}>
              {q.text}
            </Txt>
          </Row>
          <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick />
          {view.wrong ? (
            <Animated.View key={view.wrong.id} entering={FadeIn.duration(200)}>
              <Txt v="small" center color={C.red}>
                {h.player(view.wrong.by).name}: «{view.wrong.text}» — خطأ
              </Txt>
            </Animated.View>
          ) : null}

          {view.phase === 'question' ? (
            canAnswer ? (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Pressable
                  onPress={() => {
                    haptic.heavy();
                    h.act('buzz');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="اضغط الجرس"
                  style={({ pressed }) => [styles.buzzer, pressed && styles.buzzerDown]}>
                  <Txt style={styles.buzzerText}>أجب!</Txt>
                </Pressable>
                <Txt v="tiny" center color={C.yellow}>
                  {view.canAnswer.length === 2 ? 'أول من يضغط الجرس يجيب' : 'الفريق الآخر أخطأ — الفرصة لكم!'}
                </Txt>
              </View>
            ) : (
              <Txt v="small" center color={C.dim}>
                فريقك أخطأ — الفرصة الآن للفريق الآخر
              </Txt>
            )
          ) : view.buzzer && iBuzzed ? (
            <View style={{ gap: 8 }}>
              <Txt v="bold" center color={C.yellow}>
                ضغطت الجرس — اكتب جوابك
              </Txt>
              <Row gap={8}>
                <Field
                  value={answer}
                  onChangeText={(text) => setTyped({ key: answerKey, text })}
                  onSubmitEditing={send}
                  placeholder={`جواب يبدأ بحرف ${displayLetter(letter)}`}
                  placeholderTextColor={C.dim}
                  autoFocus
                  autoCorrect={false}
                  maxLength={60}
                  returnKeyType="send"
                  style={styles.input}
                />
                <Btn size="md" icon="check" label="أرسل" disabled={!answer.trim()} onPress={send} />
              </Row>
            </View>
          ) : view.buzzer ? (
            <Row gap={8} center>
              <Avatar player={h.player(view.buzzer)} size={28} />
              <Txt v="bold" color={C.muted}>
                {h.player(view.buzzer).name}: جارٍ كتابة الجواب…
              </Txt>
            </Row>
          ) : null}
        </Animated.View>
      ) : null}

      {view.last ? (
        <Animated.View
          key={view.last.id}
          entering={FadeIn.duration(200)}
          style={[styles.last, view.last.team ? { borderColor: alpha(TEAM_COLOR[view.last.team], 0.7), backgroundColor: alpha(TEAM_COLOR[view.last.team], 0.12) } : null]}>
          <Txt v="small" center>
            الجواب: «{view.last.answer}» — {view.last.team ? `الحرف ل${TEAM_NAME[view.last.team].slice(1)}` : 'لم يأخذه أحد'}
          </Txt>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  team: { flex: 1, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8, gap: 6, borderWidth: 1.5 },
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 10, borderWidth: 2, borderColor: C.border },
  buzzer: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: INK, borderBottomWidth: 10 },
  buzzerDown: { borderBottomWidth: 4, transform: [{ translateY: 5 }] },
  buzzerText: { fontFamily: F.display, fontSize: 30, lineHeight: 46, color: '#FFFFFF' },
  input: { flex: 1, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontFamily: F.bold, fontSize: 17, textAlign: 'right', borderWidth: 2, borderColor: C.yellow },
  letter: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: INK },
  last: { borderRadius: 14, borderWidth: 1.5, borderColor: C.borderStrong, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.surface },
});
