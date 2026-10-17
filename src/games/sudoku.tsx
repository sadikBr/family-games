/** «سودوكو» — everyone races through the same puzzle on their own phone. Notes (pencil marks) stay on this phone. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { haptic } from '@/lib/sfx';
import { useElapsed } from '@/lib/time';
import type { RoomView, SudokuView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { McqFinal } from './islamic-ui';

const INK = '#151726';
const PAPER = '#FFFDF6';
const GIVEN = '#1F2A44';
const MINE = '#1F6F57';
const LEVEL = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' } as const;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const sameUnit = (a: number, b: number) => {
  const ra = Math.floor(a / 9), ca = a % 9, rb = Math.floor(b / 9), cb = b % 9;
  return ra === rb || ca === cb || (Math.floor(ra / 3) === Math.floor(rb / 3) && Math.floor(ca / 3) === Math.floor(cb / 3));
};

export function SudokuGame({ room, view }: { room: RoomView; view: SudokuView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 24, 440);
  const cell = W / 9;
  const [sel, setSel] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(0);
  const [giveUp, setGiveUp] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  // pencil marks per cell, tied to the game they were written in (startedAt) so a new game starts clean
  const [notesState, setNotes] = useState<{ game: number; cells: Record<number, number[]> }>({ game: 0, cells: {} });
  const elapsed = useElapsed(view.phase === 'play' ? view.startedAt : null, 1000);
  const wrongId = view.wrong?.id ?? 0;
  useEffect(() => {
    if (!wrongId) return;
    const t = setTimeout(() => setDismissed(wrongId), 1100);
    return () => clearTimeout(t);
  }, [wrongId]);

  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="sudoku" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;

  const mine = view.finished.find((f) => f.id === h.me);
  const playing = !mine;
  const grid = view.myGrid;
  const selValue = sel !== null ? grid[sel] : 0;
  const wrong = view.wrong && view.wrong.id !== dismissed ? view.wrong : null;
  const counts = Array(10).fill(0);
  for (const v of grid) counts[v] += 1;
  const notes = notesState.game === view.startedAt ? notesState.cells : {};

  const press = (n: number) => {
    if (!playing || sel === null || grid[sel]) return;
    haptic.tap();
    if (noteMode) {
      const cur = notes[sel] ?? [];
      const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
      setNotes({ game: view.startedAt, cells: { ...notes, [sel]: next } });
      return;
    }
    h.act('set', { cell: sel, value: n });
  };

  return (
    <>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <View style={styles.chip}>
          <Txt v="tiny">{LEVEL[view.level]}</Txt>
        </View>
        <Txt style={styles.clock}>{num(clock(mine ? mine.ms : elapsed))}</Txt>
        <View style={[styles.chip, view.mistakes ? { backgroundColor: alpha(C.red, 0.25) } : null]}>
          <Txt v="tiny">الأخطاء: {num(view.mistakes)}</Txt>
        </View>
      </Row>

      <View style={[styles.grid, { width: W + 6, height: W + 6 }]}>
        {grid.map((v, i) => {
          const r = Math.floor(i / 9), c = i % 9;
          const given = !!view.givens[i];
          const isSel = sel === i;
          const peer = sel !== null && !isSel && sameUnit(sel, i);
          const same = !!v && v === selValue && !isSel;
          const bad = wrong?.cell === i;
          return (
            <Pressable
              key={i}
              onPress={() => {
                haptic.tap();
                setSel(i);
              }}
              accessibilityLabel={`الصف ${r + 1} العمود ${c + 1}${v ? ` الرقم ${v}` : ''}`}
              style={[
                styles.cell,
                { left: c * cell, top: r * cell, width: cell, height: cell },
                peer && { backgroundColor: '#EAF1FF' },
                same && { backgroundColor: '#FCE9B4' },
                isSel && { backgroundColor: '#FFD66B' },
                bad && { backgroundColor: '#F7B3BE' },
              ]}>
              {v ? (
                <Txt style={[styles.num, { fontSize: cell * 0.56, lineHeight: cell * 0.86, color: given ? GIVEN : MINE }]}>{String(v)}</Txt>
              ) : bad ? (
                <Animated.View entering={FadeIn.duration(80)} exiting={FadeOut.duration(300)}>
                  <Txt style={[styles.num, { fontSize: cell * 0.56, lineHeight: cell * 0.86, color: C.red }]}>{String(wrong!.value)}</Txt>
                </Animated.View>
              ) : notes[i]?.length ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {notes[i].map((n) => (
                    <Txt
                      key={n}
                      style={[styles.note, { left: ((n - 1) % 3) * (cell / 3), top: Math.floor((n - 1) / 3) * (cell / 3), width: cell / 3, height: cell / 3, fontSize: cell * 0.24, lineHeight: cell / 3 }]}>
                      {String(n)}
                    </Txt>
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {[1, 2, 4, 5, 7, 8].map((k) => (
          <View key={`v${k}`} pointerEvents="none" style={[styles.thin, { left: k * cell - 0.5, top: 0, bottom: 0, width: 1 }]} />
        ))}
        {[1, 2, 4, 5, 7, 8].map((k) => (
          <View key={`h${k}`} pointerEvents="none" style={[styles.thin, { top: k * cell - 0.5, left: 0, right: 0, height: 1 }]} />
        ))}
        {[3, 6].map((k) => (
          <View key={`V${k}`} pointerEvents="none" style={[styles.thick, { left: k * cell - 1.5, top: 0, bottom: 0, width: 3 }]} />
        ))}
        {[3, 6].map((k) => (
          <View key={`H${k}`} pointerEvents="none" style={[styles.thick, { top: k * cell - 1.5, left: 0, right: 0, height: 3 }]} />
        ))}
      </View>

      {playing ? (
        <Row center>
          <Btn size="sm" ghost={!noteMode} icon="edit" label={noteMode ? 'ملاحظات (مفعّلة)' : 'ملاحظات'} onPress={() => setNoteMode(!noteMode)} />
        </Row>
      ) : null}
      {playing ? (
        <Row gap={5} center style={{ direction: 'ltr' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
            const done = counts[n] >= 9;
            return (
              <Pressable
                key={n}
                disabled={done}
                onPress={() => press(n)}
                accessibilityLabel={`الرقم ${n}`}
                style={({ pressed }) => [styles.key, { width: Math.min(44, (W - 40) / 9) }, noteMode && styles.keyNote, done && { opacity: 0.25 }, pressed && { backgroundColor: C.yellow }]}>
                <Txt style={styles.keyNum}>{String(n)}</Txt>
                <Txt v="tiny" color={C.dim} style={{ fontSize: 10, lineHeight: 13 }}>
                  {done ? '✓' : String(9 - counts[n])}
                </Txt>
              </Pressable>
            );
          })}
        </Row>
      ) : (
        <Animated.View entering={FadeIn.duration(200)}>
          <Txt v="bold" center color={mine!.ms >= 0 ? C.green : C.muted}>
            {mine!.ms >= 0 ? `أحسنت! أنهيت اللغز في ${clock(mine!.ms)} — المرتبة ${num(view.finished.filter((f) => f.ms >= 0).findIndex((f) => f.id === h.me) + 1)}` : 'انسحبت — في انتظار الآخرين'}
          </Txt>
        </Animated.View>
      )}

      <View style={{ gap: 6 }}>
        {Object.keys(view.progress)
          .sort((a, b) => view.progress[b] - view.progress[a])
          .map((id) => {
            const f = view.finished.find((x) => x.id === id);
            const ratio = view.empty ? view.progress[id] / view.empty : 1;
            return (
              <Row key={id} gap={8} style={styles.racer}>
                <Avatar player={h.player(id)} size={24} badge={f && f.ms >= 0 ? 'check' : undefined} />
                <Txt v="tiny" numberOfLines={1} style={{ width: 80 }}>
                  {h.player(id).name}
                </Txt>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: f && f.ms >= 0 ? C.green : h.player(id).color }]} />
                </View>
                <Txt v="tiny" color={C.muted} style={{ minWidth: 40, textAlign: 'center' }}>
                  {f ? (f.ms >= 0 ? num(clock(f.ms)) : 'انسحب') : `${num(Math.round(ratio * 100))}%`}
                </Txt>
              </Row>
            );
          })}
      </View>

      {playing ? <Btn size="sm" ghost icon="stop" label="استسلم" onPress={() => setGiveUp(true)} /> : null}
      <ConfirmModal
        visible={giveUp}
        danger
        icon="door"
        title="تتوقف عن حلّ اللغز؟"
        message="لن تحصل على نقاط في هذا الدور."
        confirmLabel="توقّف"
        onCancel={() => setGiveUp(false)}
        onConfirm={() => {
          setGiveUp(false);
          h.act('giveup');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chip: { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  clock: { fontFamily: F.black, fontSize: 20, lineHeight: 28, color: C.text },
  grid: { alignSelf: 'center', direction: 'ltr', backgroundColor: PAPER, borderRadius: 12, borderWidth: 3, borderColor: INK, overflow: 'hidden' },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: F.black, textAlign: 'center' },
  note: { position: 'absolute', fontFamily: F.black, textAlign: 'center', color: '#6B7390' },
  thin: { position: 'absolute', backgroundColor: '#C9CEDF' },
  thick: { position: 'absolute', backgroundColor: INK },
  key: { height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.surfaceStrong },
  keyNote: { borderWidth: 2, borderColor: C.yellow, borderStyle: 'dashed' },
  keyNum: { fontFamily: F.black, fontSize: 22, lineHeight: 28, color: C.text },
  racer: { backgroundColor: C.surface, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 8 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.bg3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
