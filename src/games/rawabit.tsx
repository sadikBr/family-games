/**
 * «الروابط» — the screen. The found groups as coloured bars (theme + words), a 4×4 grid of word tiles (the text
 * sized to fit each tile), the mistakes left as dots, «خلط» / «إلغاء التحديد» / «تحقّق», the answer to the
 * last check, the others' progress (race: counts only), the end of a puzzle (all four groups, the puzzle's
 * points), the podium — or, in «تعاون», the family's result.
 *
 * The selection lives on the server (the family's shared one in co-op); a tap shows at once and the server's
 * answer follows. «خلط» only changes the order on this phone.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import {
  RAWABIT_COLOR_NAME,
  RAWABIT_HEX,
  RAWABIT_MINUTES,
  RAWABIT_MISTAKES,
  RAWABIT_PUZZLES,
  type RawabitBoardView,
  type RawabitGroup,
  type RawabitMode,
  type RawabitSettings as Settings,
  type RawabitTile,
  type RawabitView,
} from '@/shared/games/rawabit';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HostNext, QuizFinal, ResultRows, RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';

const TILE = '#EFE8D6';
const TILE_INK = '#24203F';
const PICKED = '#5B5591';
const INK = '#1C1A2E';

const MODE_LABEL: Record<RawabitMode, string> = { race: 'سباق', coop: 'تعاون' };

/** «خطأ واحد»، «خطآن»، «3 أخطاء» */
function mistakesText(n: number) {
  if (n === 0) return 'بلا أخطاء';
  if (n === 1) return 'خطأ واحد';
  if (n === 2) return 'خطآن';
  return `${num(n)} أخطاء`;
}

/** «مجموعة واحدة»، «مجموعتان»، «3 مجموعات» */
function groupsText(n: number) {
  if (n === 0) return 'لا مجموعات';
  if (n === 1) return 'مجموعة واحدة';
  if (n === 2) return 'مجموعتان';
  return `${num(n)} مجموعات`;
}

function puzzlesText(n: number) {
  if (n === 1) return 'لغز واحد';
  if (n === 2) return 'لغزان';
  return `${num(n)} ألغاز`;
}

/** The grid's width: the column, capped (larger on a computer's stage). */
function useGridWidth() {
  const width = useContentWidth();
  return Math.min(width, dk(560));
}

export function RawabitGame({ room, view }: { room: RoomView; view: RawabitView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') {
    if (view.mode === 'coop') return <CoopFinal room={room} view={view} h={h} />;
    return <QuizFinal room={room} scores={view.scores} game="rawabit" h={h} sub="ست عشرة كلمة… وأربعة روابط!" />;
  }
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Puzzle key={view.puzzle} room={room} view={view} h={h} />;
}

/* ------------------------------------------------------------------ */
/* A puzzle                                                            */
/* ------------------------------------------------------------------ */

function Puzzle({ room, view, h }: { room: RoomView; view: RawabitView; h: Helpers }) {
  const board = view.board!;
  const coop = view.mode === 'coop';
  const playing = view.phase === 'play' && !board.done;
  // the selection shown at once after a tap, until the server's own changes (or a moment passes)
  const serverSel = board.sel.join(',');
  const [pending, setPending] = useState<{ sel: number[]; base: string } | null>(null);
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(null), 1500);
    return () => clearTimeout(id);
  }, [pending]);
  const sel = pending && pending.base === serverSel ? pending.sel : board.sel;

  // this phone's order of the tiles («خلط»)
  const [order, setOrder] = useState<number[] | null>(null);
  const tiles = useMemo(() => {
    if (!order) return board.tiles;
    const at = new Map(order.map((id, i) => [id, i]));
    return [...board.tiles].sort((a, b) => (at.get(a.id) ?? 99) - (at.get(b.id) ?? 99));
  }, [board.tiles, order]);
  const shuffle = () => {
    haptic.tap();
    const ids = board.tiles.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrder(ids);
  };

  const tap = (id: number) => {
    if (!playing) return;
    const on = sel.includes(id);
    if (!on && sel.length >= 4) return;
    haptic.tap();
    setPending({ sel: on ? sel.filter((x) => x !== id) : [...sel, id], base: serverSel });
    h.act('toggle', { round: view.puzzle, id });
  };
  const clear = () => {
    haptic.tap();
    setPending({ sel: [], base: serverSel });
    h.act('clear', { round: view.puzzle });
  };
  const submit = () => {
    if (sel.length !== 4) return;
    haptic.medium();
    h.act('guess', { round: view.puzzle, ids: sel });
  };

  const flash = useFlash(board, h.me, coop);
  const narrow = useGridWidth() < 320;
  // bots don't play in co-op: the family's strip shows the people
  const people = coop ? view.players.filter((id) => !h.player(id).bot) : view.players;
  const myScore = view.scores[h.me] ?? 0;
  return (
    <>
      <RoundHeader
        label={MODE_LABEL[view.mode]}
        round={view.puzzle}
        rounds={view.puzzles}
        right={
          <Txt v="tiny" color={C.muted}>
            {coop ? `ألغاز محلولة: ${num(view.solved)}` : `نقاطك: ${num(myScore)}`}
          </Txt>
        }
      />
      {view.phase === 'play' && view.endsAt && view.timerTotal > 0 ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={playing} /> : null}
      {view.phase === 'reveal' && view.reveal ? (
        <RevealBoard view={view} h={h} />
      ) : (
        <>
          <FoundBars found={board.found} coop={coop} h={h} />
          {board.tiles.length ? <Grid tiles={tiles} sel={sel} disabled={!playing} onTap={tap} /> : null}
          <Feedback flash={flash} />
          {playing ? (
            <>
              <Mistakes left={RAWABIT_MISTAKES - board.mistakes} />
              <Actions narrow={narrow} canClear={sel.length > 0} canCheck={sel.length === 4} onShuffle={shuffle} onClear={clear} onCheck={submit} />
            </>
          ) : (
            <DoneNote board={board} coop={coop} />
          )}
          {coop ? (
            <PlayerStrip room={room} gains={false} entries={people.map((id) => ({ id, score: view.scores[id] ?? 0, sub: 'مجموعات' }))} />
          ) : (
            <Progress room={room} view={view} />
          )}
        </>
      )}
    </>
  );
}

/** «خلط», «إلغاء التحديد» and «تحقّق»: one row, or two on a narrow phone (so «تحقّق» is never cut). */
function Actions({ narrow, canClear, canCheck, onShuffle, onClear, onCheck }: { narrow: boolean; canClear: boolean; canCheck: boolean; onShuffle: () => void; onClear: () => void; onCheck: () => void }) {
  const check = <Btn flex size="md" icon="check" color={C.green} label="تحقّق" disabled={!canCheck} onPress={onCheck} />;
  const small = (
    <>
      <Btn flex={narrow} size="sm" ghost icon="shuffle" label="خلط" onPress={onShuffle} />
      <Btn flex={narrow} size="sm" ghost icon="close" label="إلغاء التحديد" disabled={!canClear} onPress={onClear} />
    </>
  );
  if (!narrow)
    return (
      <Row gap={8} style={{ alignItems: 'center' }}>
        {small}
        {check}
      </Row>
    );
  return (
    <View style={{ gap: 8 }}>
      <Row gap={8}>{check}</Row>
      <Row gap={8}>{small}</Row>
    </View>
  );
}

/** The answer to the last check, for a moment (and my sound: in a race nobody else hears my checks). */
function useFlash(board: RawabitBoardView, me: string, coop: boolean) {
  const f = board.flash;
  // a check from before this screen opened isn't news
  const [first] = useState(f?.seq ?? 0);
  const [gone, setGone] = useState(0);
  const seq = f?.seq ?? 0;
  const kind = f?.kind;
  const by = f?.by;
  useEffect(() => {
    if (!seq || seq === first) return;
    if (!coop && by === me) {
      if (kind === 'right') {
        play('correct');
        haptic.success();
      } else {
        play('buzz');
        haptic.error();
      }
    }
    const id = setTimeout(() => setGone(seq), 2400);
    return () => clearTimeout(id);
  }, [seq, first, kind, by, me, coop]);
  return f && seq !== first && gone !== seq ? { seq, kind: f.kind, by: f.by, color: f.color, coop } : null;
}

function Feedback({ flash }: { flash: ReturnType<typeof useFlash> }) {
  const h = 30;
  if (!flash) return <View style={{ height: h }} />;
  const text = flash.kind === 'right' ? 'مجموعة صحيحة!' : flash.kind === 'away' ? 'ينقص واحد!' : 'ليست مجموعة';
  const color = flash.kind === 'right' ? (flash.color ? RAWABIT_HEX[flash.color] : C.green) : flash.kind === 'away' ? C.yellow : C.red;
  return (
    <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View key={flash.seq} entering={FadeIn.duration(180)} exiting={FadeOut.duration(200)} style={[styles.flash, { backgroundColor: alpha(color, 0.18), borderColor: alpha(color, 0.7) }]}>
        <Txt v="bold" style={{ fontSize: 14, lineHeight: 22, color }}>
          {text}
        </Txt>
      </Animated.View>
    </View>
  );
}

function Mistakes({ left }: { left: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={`الأخطاء المتبقية: ${left}`}>
      <Txt v="tiny" color={C.muted}>
        الأخطاء المتبقية
      </Txt>
      <Row gap={6}>
        {Array.from({ length: RAWABIT_MISTAKES }, (_, i) => (
          <View key={i} style={[styles.dot, i < left ? { backgroundColor: C.text } : { backgroundColor: 'transparent', borderColor: alpha(C.text, 0.3) }]} />
        ))}
      </Row>
    </View>
  );
}

function DoneNote({ board, coop }: { board: RawabitBoardView; coop: boolean }) {
  if (!board.done) return null;
  const solved = board.done === 'solved';
  const title = solved ? (coop ? 'اللوحة كاملة!' : `اللوحة كاملة! المركز ${num(board.rank ?? 1)}`) : board.done === 'out' ? 'نفدت المحاولات' : 'انتهى الوقت';
  const sub = coop ? 'المجموعات كلها بعد لحظة' : solved ? 'بانتظار البقية…' : 'المجموعات كلها تظهر في نهاية اللغز';
  const color = solved ? C.green : C.red;
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.note, { borderColor: alpha(color, 0.6), backgroundColor: alpha(color, 0.12) }]}>
      <Icon name={solved ? 'trophy' : board.done === 'out' ? 'stop' : 'clock'} size={22} color={color} />
      <View style={{ flex: 1 }}>
        <Txt v="bold">{title}</Txt>
        <Txt v="tiny" color={C.muted}>
          {sub}
        </Txt>
      </View>
    </Animated.View>
  );
}

/** The others in a race: groups found and mistakes, nothing else. */
function Progress({ room, view }: { room: RoomView; view: RawabitView }) {
  return (
    <PlayerStrip
      room={room}
      gains={false}
      active={view.players.filter((id) => view.progress[id]?.done === 'solved')}
      entries={view.players.map((id) => {
        const p = view.progress[id];
        const sub = !p ? undefined : p.done === 'solved' ? `كاملة · المركز ${num(p.rank ?? 1)}` : p.done === 'out' ? 'نفدت المحاولات' : mistakesText(p.mistakes);
        return { id, score: num(`${p?.found ?? 0}/4`), sub, out: p?.done === 'out' };
      })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Tiles and bars                                                      */
/* ------------------------------------------------------------------ */

/** The text of a tile: one line, or the two words of a name on two lines, as large as fits. */
export function tileText(word: string, w: number, hgt: number, max: number): { text: string; size: number } {
  const GLYPH = 0.5; // an Arabic letter's width, about, in em (Baloo Bhaijaan bold)
  const room = w - 10;
  const chars = [...word].length;
  const one = Math.floor(room / (chars * GLYPH));
  const parts = word.split(' ');
  if (parts.length < 2 || one >= Math.min(15, max)) return { text: word, size: Math.max(9, Math.min(max, one)) };
  const longest = Math.max(...parts.map((p) => [...p].length));
  const two = Math.min(Math.floor(room / (longest * GLYPH)), Math.floor((hgt - 8) / (2 * 1.3)));
  return two > one ? { text: parts.join('\n'), size: Math.max(9, Math.min(max, two)) } : { text: word, size: Math.max(9, Math.min(max, one)) };
}

function Grid({ tiles, sel, disabled, onTap }: { tiles: RawabitTile[]; sel: number[]; disabled: boolean; onTap: (id: number) => void }) {
  const inner = useGridWidth();
  const gap = inner < 330 ? 6 : 8;
  const w = Math.floor((inner - gap * 3) / 4);
  const hgt = Math.max(54, Math.min(dk(80), Math.round(w * 0.8)));
  const max = Math.min(dk(19), Math.round(w * 0.26));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width: inner, alignSelf: 'center' }}>
      {tiles.map((t) => {
        const on = sel.includes(t.id);
        const { text, size } = tileText(t.word, w, hgt, max);
        return (
          <Pressable
            key={t.id}
            onPress={() => onTap(t.id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={`${t.word}${on ? ' — محددة' : ''}`}
            style={({ pressed }) => [
              styles.tile,
              { width: w, height: hgt, backgroundColor: on ? PICKED : TILE, transform: [{ translateY: on ? -2 : 0 }], opacity: disabled && !on ? 0.75 : 1 },
              pressed && !disabled && { backgroundColor: on ? shade(PICKED, -0.1) : shade(TILE, -0.08) },
            ]}>
            <Txt numberOfLines={2} style={{ fontFamily: F.bold, fontSize: size, lineHeight: Math.round(size * 1.3), color: on ? '#FFFFFF' : TILE_INK, textAlign: 'center' }}>
              {text}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function GroupBar({ g, note, dim }: { g: RawabitGroup; note?: string | null; dim?: boolean }) {
  const inner = useGridWidth();
  const settled = useSettled(300);
  return (
    <Animated.View
      entering={settled ? FadeIn.duration(320) : undefined}
      accessibilityLabel={`المجموعة ${RAWABIT_COLOR_NAME[g.color]}: ${g.theme} — ${g.words.join('، ')}`}
      style={[styles.bar, { width: inner, minHeight: Math.max(56, Math.min(dk(76), 62)), backgroundColor: RAWABIT_HEX[g.color], opacity: dim ? 0.55 : 1 }]}>
      <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: INK, textAlign: 'center' }}>{g.theme}</Txt>
      <Txt style={{ fontFamily: F.bold, fontSize: 13, lineHeight: 20, color: alpha(INK, 0.85), textAlign: 'center' }}>{g.words.join('، ')}</Txt>
      {note ? (
        <View style={styles.barNote}>
          <Txt style={{ fontFamily: F.bold, fontSize: 11, lineHeight: 16, color: INK }}>{note}</Txt>
        </View>
      ) : null}
    </Animated.View>
  );
}

function FoundBars({ found, coop, h }: { found: RawabitBoardView['found']; coop: boolean; h: Helpers }) {
  if (!found.length) return null;
  return (
    <View style={{ gap: 8, alignItems: 'center' }}>
      {found.map((g) => (
        <GroupBar key={g.color} g={g} note={coop && g.by ? `من ${h.player(g.by).name}` : null} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The end of a puzzle                                                 */
/* ------------------------------------------------------------------ */

function RevealBoard({ view, h }: { view: RawabitView; h: Helpers }) {
  const r = view.reveal!;
  const coop = view.mode === 'coop';
  const last = view.puzzle >= view.puzzles;
  const me = r.results.find((x) => x.id === h.me);
  const mine = coop ? r.team : me;
  const foundColors = new Set(mine?.found ?? []);
  const solved = mine?.done === 'solved';
  const title = coop ? (solved ? 'اللغز محلول!' : 'لم يُحلّ اللغز هذه المرة') : solved ? 'اللوحة كاملة!' : `${groupsText(mine?.found.length ?? 0)} من أربع`;
  const sub = coop
    ? `${groupsText(r.team?.found.length ?? 0)} · ${mistakesText(r.team?.mistakes ?? 0)}`
    : me
      ? `${mistakesText(me.mistakes)}${me.rank ? ` · المركز ${num(me.rank)}` : ''} · ${num(`+${me.gain}`)}`
      : '';
  const tone = solved ? C.green : C.yellow;
  return (
    <>
      <Animated.View entering={FadeIn.duration(260)} style={[styles.result, { borderColor: alpha(tone, 0.65), backgroundColor: alpha(tone, 0.12) }]}>
        <Row gap={10} style={{ alignItems: 'center' }}>
          <GameArt id="rawabit" size={44} />
          <View style={{ flex: 1 }}>
            <Txt v="h2">{title}</Txt>
            {sub ? (
              <Txt v="tiny" color={C.muted}>
                {sub}
              </Txt>
            ) : null}
          </View>
        </Row>
      </Animated.View>
      <Txt v="tiny" center color={C.muted}>
        المجموعات الأربع
      </Txt>
      <View style={{ gap: 8, alignItems: 'center' }}>
        {r.groups.map((g) => (
          <GroupBar key={g.color} g={g} note={foundColors.has(g.color) ? '✓ وُجدت' : 'لم تُكتشف'} dim={!foundColors.has(g.color)} />
        ))}
      </View>
      {coop ? null : (
        <ResultRows
          h={h}
          gainLabel="اللغز"
          lines={r.results.map((x) => ({
            id: x.id,
            detail: `${x.rank ? `المركز ${num(x.rank)} · ` : `${num(`${x.found.length}/4`)} · `}${mistakesText(x.mistakes)}`,
            gain: num(`+${x.gain}`),
            good: x.done === 'solved',
            total: view.scores[x.id] ?? 0,
          }))}
        />
      )}
      <HostNext h={h} last={last} />
    </>
  );
}

function CoopFinal({ room, view, h }: { room: RoomView; view: RawabitView; h: Helpers }) {
  const won = view.solved * 2 > view.puzzles;
  const ids = view.players.filter((id) => !h.player(id).bot || (view.scores[id] ?? 0) > 0);
  const sorted = [...ids].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<GameArt id="rawabit" size={84} />}
        title={won ? 'الفوز للعائلة!' : 'المرة القادمة أفضل!'}
        sub={`ألغاز محلولة: ${num(view.solved)} من ${num(view.puzzles)}`}
      />
      <Txt v="h3" center>
        مجموعات كل واحد
      </Txt>
      <ResultRows
        h={h}
        ordered
        gainLabel="مجموعات"
        lines={sorted.map((id) => ({ id, gain: num(view.scores[id] ?? 0), good: (view.scores[id] ?? 0) > 0 }))}
      />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const MODE_OPTIONS: { key: RawabitMode; label: string }[] = [
  { key: 'race', label: 'سباق' },
  { key: 'coop', label: 'تعاون' },
];
const PUZZLE_OPTIONS = RAWABIT_PUZZLES.map((n) => ({ key: String(n), label: puzzlesText(n) }));
const TIME_OPTIONS = RAWABIT_MINUTES.map((n) => ({ key: String(n), label: n === 0 ? 'بلا وقت' : `${num(n)} دقائق` }));

export function RawabitSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.rawabit;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'rawabit', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">طريقة اللعب</Txt>
      <ChipPicker<RawabitMode> editable={editable} value={s.mode} onChange={(v) => change({ mode: v })} options={MODE_OPTIONS} />
      <Txt v="bold">عدد الألغاز</Txt>
      <ChipPicker<string> editable={editable} value={String(s.puzzles)} onChange={(v) => change({ puzzles: Number(v) })} options={PUZZLE_OPTIONS} />
      <Txt v="bold">الوقت لكل لغز</Txt>
      <ChipPicker<string> editable={editable} value={String(s.minutes)} onChange={(v) => change({ minutes: Number(v) })} options={TIME_OPTIONS} />
      <Row gap={8}>
        <GameArt id="rawabit" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          {s.mode === 'coop'
            ? 'لوحة واحدة للعائلة: يحدّد أي واحد ويتحقق أي واحد، والأخطاء الأربعة مشتركة. البوتات لا تلعب في التعاون.'
            : 'كلٌّ يحلّ اللغز نفسه على هاتفه، ويرى عدد مجموعات الآخرين وأخطائهم فقط. البنفسجي أغلى المجموعات.'}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bar: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  barNote: { marginTop: 3, borderRadius: 999, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.5)' },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: 'transparent' },
  flash: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12 },
  result: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14 },
});
