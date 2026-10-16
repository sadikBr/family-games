/** «حروف» — claim letter hexagons by answering; red joins right ↔ left, green joins top ↔ bottom. */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import Svg, { Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { displayLetter } from '@/shared/arabic';
import { HEX_N } from '@/shared/islamic';
import type { HuroofTeam, HuroofView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { LastEvent } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { OptionGrid } from './islamic-ui';

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
              stroke={win.has(i) ? '#F4C02E' : active ? '#F4C02E' : INK}
              strokeWidth={win.has(i) || active ? 4 : 2}
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

function Teams({ view, h, mine }: { view: HuroofView; h: Helpers; mine: HuroofTeam | null }) {
  return (
    <Row gap={8} style={{ alignItems: 'stretch' }}>
      {(['red', 'green'] as HuroofTeam[]).map((t) => {
        const count = view.cells.filter((c) => c.owner === t).length;
        const active = view.phase === 'pick' && view.turn === t;
        return (
          <View key={t} style={[styles.team, { borderColor: active ? TEAM_COLOR[t] : 'transparent', backgroundColor: alpha(TEAM_COLOR[t], mine === t ? 0.24 : 0.12) }]}>
            <Row gap={6} style={{ justifyContent: 'space-between' }}>
              <Txt v="tiny" color={TEAM_COLOR[t]}>
                {TEAM_NAME[t]}
                {mine === t ? ' (فريقك)' : ''}
              </Txt>
              <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 20, color: C.text }}>{count}</Txt>
            </Row>
            <Row gap={4} wrap>
              {view.teams[t].map((id) => (
                <Avatar key={id} player={h.player(id)} size={24} ring={TEAM_COLOR[t]} />
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
  const [picked, setPicked] = useState<{ q: string; i: number } | null>(null);
  const mine: HuroofTeam | null = view.teams.red.includes(h.me) ? 'red' : view.teams.green.includes(h.me) ? 'green' : null;
  if (!mine && view.phase !== 'final') return <Spectator room={room} />;

  if (view.phase === 'final') {
    const won = view.winner === mine;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="huroof" size={84} />} title={view.winner ? `فاز ${TEAM_NAME[view.winner]}` : 'انتهت اللعبة'} sub="أحسنتم جميعاً!" />
        <Grid view={view} size={size} canPick={false} onPick={() => {}} />
        <PlayAgain room={room} />
      </>
    );
  }

  const myPick = view.phase === 'pick' && view.turn === mine;
  const q = view.question;
  const myChoice = q && picked?.q === q.text ? picked.i : null;
  const canAnswer = !!mine && view.canAnswer.includes(mine);
  const letter = view.cell !== null ? view.cells[view.cell].letter : null;

  return (
    <>
      <Teams view={view} h={h} mine={mine} />
      <Grid view={view} size={size} canPick={myPick} onPick={(cell) => h.act('pick', { cell })} />

      {view.phase === 'pick' ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.panel}>
          <Txt v="bold" center color={myPick ? C.yellow : C.muted}>
            {myPick ? 'دور فريقك — اختر حرفاً من الشبكة' : `${TEAM_NAME[view.turn]} يختار حرفاً…`}
          </Txt>
          <Txt v="tiny" center color={C.dim}>
            {mine === 'red' ? 'فريقك يصل بين اليمين واليسار' : 'فريقك يصل بين الأعلى والأسفل'}
          </Txt>
        </Animated.View>
      ) : q && letter ? (
        <Animated.View key={q.text} entering={ZoomIn.duration(200)} style={styles.panel}>
          <Row gap={10}>
            <View style={styles.letter}>
              <Txt style={{ fontFamily: F.display, fontSize: 30, lineHeight: 44, color: C.ink }}>{displayLetter(letter)}</Txt>
            </View>
            <Txt v="h3" style={{ flex: 1 }}>
              {q.text}
            </Txt>
          </Row>
          <TimerBar endsAt={view.endsAt} total={room.settings.huroof.seconds * 1000} onTick />
          <OptionGrid
            options={q.options}
            mine={myChoice}
            correct={null}
            disabled={!canAnswer}
            onPick={(i) => {
              setPicked({ q: q.text, i });
              h.act('answer', { choice: i });
            }}
          />
          <Txt v="tiny" center color={canAnswer ? C.yellow : C.dim}>
            {canAnswer
              ? view.canAnswer.length === 2
                ? 'أسرع فريق يجيب صحيحاً يأخذ الحرف'
                : 'الفريق الآخر أخطأ — الفرصة لكم!'
              : 'فريقك أخطأ — الفرصة الآن للفريق الآخر'}
          </Txt>
        </Animated.View>
      ) : null}

      {view.last ? (
        <Animated.View key={view.last.id} entering={FadeIn.duration(200)} style={[styles.last, { borderColor: view.last.team ? TEAM_COLOR[view.last.team] : C.borderStrong }]}>
          <Txt v="small" center>
            الجواب: «{view.last.answer}» — {view.last.team ? `الحرف لـ${TEAM_NAME[view.last.team]}` : 'لم يأخذه أحد'}
          </Txt>
        </Animated.View>
      ) : null}
      <LastEvent feed={view.feed} h={h} />
    </>
  );
}

const styles = StyleSheet.create({
  team: { flex: 1, borderRadius: 16, padding: 8, gap: 6, borderWidth: 2 },
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 10 },
  letter: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: INK },
  last: { borderRadius: 14, borderWidth: 2, padding: 8, backgroundColor: C.bg2 },
});
