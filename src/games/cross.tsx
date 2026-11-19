/**
 * «الكلمات المتقاطعة» — the screen and the lobby settings.
 *
 * Playing: the mode and the time (co-op: the family's clock with its penalties; a race or a time limit: the
 * timer bar), the current clue above the grid (tap it to switch across/down, the arrows go to the previous
 * or next clue), the grid (tap a cell to choose it, tap it again to switch direction), what the last word
 * brought (race), «اكشف حرفاً» and «تحقّق» (co-op), the letter keyboard (on a computer the keyboard types
 * too: letters, Backspace, arrows, Space to switch, Enter/Tab for the next clue), everyone's words or
 * points, and the two lists of clues (tap one to choose its word).
 *
 * A typed letter shows at once and is sent to the server, which checks it; the server's grid wins after a
 * moment. The end: the result, the solution (letters not written right faded), the words or points of each one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import {
  CROSS_HINT_COST,
  CROSS_KEY_RULE,
  CROSS_LEVEL_LABEL,
  CROSS_MINUTES,
  CROSS_MODE_LABEL,
  CROSS_WRONG_MS,
  crossLetter,
  type CrossClue,
  type CrossDir,
  type CrossLevel,
  type CrossMode,
  type CrossSettings as Settings,
  type CrossView,
} from '@/shared/games/cross';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { CrossGrid, LetterKeys } from './cross-grid';
import { helpers, type Helpers } from './helpers';
import { ResultRows, RoundHeader, winnerTitle } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock } from './touch-motion';

const DIR_NAME: Record<CrossDir, string> = { a: 'أفقي', d: 'عمودي' };

/** «3:05» */
function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return num(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
}

/** «كلمة واحدة»، «كلمتان»، «3 كلمات» */
function wordsText(n: number) {
  if (n === 0) return 'لا كلمات';
  if (n === 1) return 'كلمة واحدة';
  if (n === 2) return 'كلمتان';
  return n <= 10 ? `${num(n)} كلمات` : `${num(n)} كلمة`;
}

function secondsText(n: number) {
  if (n === 1) return 'ثانية واحدة';
  if (n === 2) return 'ثانيتان';
  return n <= 10 ? `${num(n)} ثوانٍ` : `${num(n)} ثانية`;
}

/** The grid's width: the column, capped (larger on a computer's stage), and short screens keep the keyboard in view. */
function useGridWidth(rows: number, cols: number) {
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  // room above (the room's header, the clue) and below (the keyboard): about 390 px
  const byHeight = Math.max(170, height - 390) * (cols / rows);
  // cells never smaller than ~34 px (a finger): a short phone scrolls a little instead
  return Math.floor(Math.min(width, dk(430), Math.max(cols * 36, byHeight)));
}

export function CrossGame({ room, view }: { room: RoomView; view: CrossView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <Final room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Play key={view.startedAt} room={room} view={view} h={h} />;
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

/** Letters of an English keyboard → the Arabic letters on the same keys (a computer without the Arabic layout). */
const LATIN_KEYS: Record<string, string> = {
  KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح', BracketLeft: 'ج', BracketRight: 'د',
  KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن', KeyL: 'م', Semicolon: 'ك', Quote: 'ط',
  KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', KeyM: 'ة', Comma: 'و', Period: 'ز', Slash: 'ظ', Backquote: 'ذ',
};

/** The cells' letters a key press types («لا» types two). */
function typedLetters(e: KeyboardEvent): string[] {
  const raw = [...e.key].length <= 2 && /[ء-يٱ]/.test(e.key) ? e.key : /^[a-zA-Z]$|^[[\];',./`]$/.test(e.key) ? (LATIN_KEYS[e.code] ?? '') : '';
  return [...raw].map((ch) => crossLetter(ch)).filter((x): x is string => !!x);
}

interface Sel {
  cell: number;
  dir: CrossDir;
}

function Play({ room, view, h }: { room: RoomView; view: CrossView; h: Helpers }) {
  const coop = view.mode === 'coop';
  const width = useContentWidth();
  const gridW = useGridWidth(view.rows, view.cols);
  const clueOf = useMemo(() => {
    const m: Record<CrossDir, (number | undefined)[]> = { a: [], d: [] };
    for (const cl of view.clues) for (const c of cl.cells) m[cl.dir][c] = cl.id;
    return m;
  }, [view.clues]);
  // across first, then down, each by number
  const order = useMemo(() => [...view.clues].sort((x, y) => (x.dir === y.dir ? x.num - y.num : x.dir === 'a' ? -1 : 1)).map((c) => c.id), [view.clues]);

  const [sel, setSel] = useState<Sel>(() => {
    const first = view.clues[order[0]];
    return { cell: first.cells[0], dir: first.dir };
  });
  const clueId = clueOf[sel.dir][sel.cell] ?? clueOf[sel.dir === 'a' ? 'd' : 'a'][sel.cell] ?? order[0];
  const clue = view.clues[clueId];

  // letters typed here, shown at once until the server's grid changes that cell (or a moment passes)
  const [pending, setPending] = useState<Record<number, { l: string; base: string }>>({});
  useEffect(() => {
    const id = setTimeout(() => setPending({}), 1800);
    return () => clearTimeout(id);
  }, [pending]);
  const shown = useMemo(() => view.letters.map((l, i) => (pending[i] && pending[i].base === l && !view.locked[i] ? pending[i].l : l)), [view.letters, view.locked, pending]);

  const right = useMemo(() => {
    const out = view.open.map(() => false);
    view.clues.forEach((cl) => view.solved[cl.id] !== null && cl.cells.forEach((c) => (out[c] = true)));
    return out;
  }, [view.clues, view.solved, view.open]);

  // «تحقّق»: the wrong cells light up for a moment
  const [wrongShown, setWrongShown] = useState<{ seq: number; cells: number[] }>({ seq: view.checkSeq, cells: [] });
  if (view.checkSeq !== wrongShown.seq) setWrongShown({ seq: view.checkSeq, cells: view.wrong });
  useEffect(() => {
    if (!wrongShown.cells.length) return;
    const id = setTimeout(() => setWrongShown((w) => ({ ...w, cells: [] })), CROSS_WRONG_MS);
    return () => clearTimeout(id);
  }, [wrongShown]);
  const wrongSet = useMemo(() => new Set(wrongShown.cells.filter((c) => shown[c] && !view.locked[c])), [wrongShown, shown, view.locked]);

  /* moving around */
  const wordCells = (id: number) => view.clues[id].cells;
  const free = (c: number) => !view.locked[c];
  const choose = (cell: number) => {
    if (!view.open[cell]) return;
    haptic.tap();
    if (cell === sel.cell) {
      const other: CrossDir = sel.dir === 'a' ? 'd' : 'a';
      if (clueOf[other][cell] !== undefined) setSel({ cell, dir: other });
      return;
    }
    const dir = clueOf[sel.dir][cell] !== undefined ? sel.dir : sel.dir === 'a' ? 'd' : 'a';
    setSel({ cell, dir });
  };
  const toClue = (id: number) => {
    const cl = view.clues[id];
    const empty = cl.cells.find((c) => !shown[c] && free(c));
    setSel({ cell: empty ?? cl.cells[0], dir: cl.dir });
  };
  const stepClue = (delta: number) => {
    haptic.tap();
    const k = order.indexOf(clueId);
    toClue(order[(k + delta + order.length) % order.length]);
  };
  const toggleDir = () => {
    const other: CrossDir = sel.dir === 'a' ? 'd' : 'a';
    if (clueOf[other][sel.cell] !== undefined) {
      haptic.tap();
      setSel({ cell: sel.cell, dir: other });
    }
  };
  /** After a letter: the next empty cell of the word, else the next word not complete. */
  const advance = (from: number, letters: string[]) => {
    const cells = wordCells(clueId);
    const at = cells.indexOf(from);
    const next = cells.slice(at + 1).find((c) => free(c) && !letters[c]) ?? cells.slice(0, at).find((c) => free(c) && !letters[c]);
    if (next !== undefined) return setSel({ cell: next, dir: clue.dir });
    const k = order.indexOf(clueId);
    for (let j = 1; j <= order.length; j++) {
      const id = order[(k + j) % order.length];
      const empty = view.clues[id].cells.find((c) => free(c) && !letters[c]);
      if (empty !== undefined) return setSel({ cell: empty, dir: view.clues[id].dir });
    }
    // everything written: just the next cell of the word
    const step = cells[at + 1];
    if (step !== undefined) setSel({ cell: step, dir: clue.dir });
  };

  const write = (cell: number, letter: string) => {
    setPending((p) => ({ ...p, [cell]: { l: letter, base: view.letters[cell] } }));
    h.act('set', { cell, letter });
  };
  const type = (keys: string[]) => {
    let cell = sel.cell;
    const letters = [...shown];
    for (const k of keys) {
      if (!free(cell)) {
        // a locked cell: the next free one of the word
        const cells = wordCells(clueId);
        const nxt = cells.slice(cells.indexOf(cell) + 1).find(free);
        if (nxt === undefined) return;
        cell = nxt;
      }
      haptic.tap();
      letters[cell] = k;
      write(cell, k);
      const cells = wordCells(clueId);
      const nxt = cells[cells.indexOf(cell) + 1];
      if (keys.length > 1 && nxt !== undefined) cell = nxt;
    }
    advance(cell, letters);
  };
  const del = () => {
    haptic.tap();
    if (free(sel.cell) && shown[sel.cell]) return write(sel.cell, '');
    const cells = wordCells(clueId);
    const prev = cells.slice(0, cells.indexOf(sel.cell)).reverse().find(free);
    if (prev === undefined) return;
    setSel({ cell: prev, dir: clue.dir });
    if (shown[prev]) write(prev, '');
  };
  /** Arrow keys on a computer: the cell on that side (right = col − 1 in this right-to-left grid). */
  const arrow = (dr: number, dc: number) => {
    let r = Math.floor(sel.cell / view.cols), c = sel.cell % view.cols;
    for (;;) {
      r += dr;
      c += dc;
      if (r < 0 || c < 0 || r >= view.rows || c >= view.cols) return;
      const i = r * view.cols + c;
      if (view.open[i]) {
        const dir: CrossDir = dc ? 'a' : 'd';
        return setSel({ cell: i, dir: clueOf[dir][i] !== undefined ? dir : sel.dir });
      }
    }
  };

  // the web: the keyboard types too
  const ref = useRef({ type, del, arrow, toggleDir, stepClue });
  useEffect(() => {
    ref.current = { type, del, arrow, toggleDir, stepClue };
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const r = ref.current;
      const keys: Record<string, () => void> = {
        Backspace: r.del,
        Delete: r.del,
        ArrowRight: () => r.arrow(0, -1),
        ArrowLeft: () => r.arrow(0, 1),
        ArrowUp: () => r.arrow(-1, 0),
        ArrowDown: () => r.arrow(1, 0),
        ' ': r.toggleDir,
        Enter: () => r.stepClue(e.shiftKey ? -1 : 1),
        Tab: () => r.stepClue(e.shiftKey ? -1 : 1),
      };
      const f = keys[e.key];
      if (f) {
        e.preventDefault();
        f();
        return;
      }
      const letters = typedLetters(e);
      if (!letters.length) return;
      e.preventDefault();
      r.type(letters);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const [confirmEnd, setConfirmEnd] = useState(false);
  const selWord = useMemo(() => new Set(clue.cells), [clue]);
  const colorOf = (id: string | null) => (id ? h.player(id).color : null);
  const total = view.clues.length;
  const myWords = view.solved.filter((x) => x !== null).length;
  const narrow = width < 340;

  return (
    <>
      <RoundHeader
        label={`${CROSS_MODE_LABEL[view.mode]} · ${CROSS_LEVEL_LABEL[view.level]}`}
        round={0}
        rounds={0}
        right={
          <Row gap={10} style={{ alignItems: 'center' }}>
            <Txt v="tiny" color={C.muted}>
              {coop ? `كلمات: ${num(`${myWords}/${total}`)}` : `نقاطك: ${num(view.scores[h.me] ?? 0)}`}
            </Txt>
            {coop && !view.endsAt ? <FamilyClock view={view} /> : null}
          </Row>
        }
      />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick /> : null}

      <ClueBar clue={clue} solved={view.solved[clue.id] !== null} onToggle={toggleDir} onPrev={() => stepClue(-1)} onNext={() => stepClue(1)} />

      <View>
        <CrossGrid
          rows={view.rows}
          cols={view.cols}
          open={view.open}
          nums={view.nums}
          letters={shown}
          dots={coop ? view.by.map(colorOf) : undefined}
          revealed={view.revealed}
          right={right}
          wrong={wrongSet}
          selCell={sel.cell}
          selWord={selWord}
          width={gridW}
          onTap={choose}
        />
        {/* what just happened, for a moment, in the gap between the clue and the grid */}
        <View pointerEvents="none" style={styles.feedback}>
          <Feedback view={view} wrongCount={wrongShown.cells.length} />
        </View>
      </View>

      <LetterKeys width={width} onKey={(k) => type([k])} onDel={del} />

      <Row gap={8} style={{ alignItems: 'center' }}>
        <Btn
          flex
          size="sm"
          ghost
          icon="eye"
          label={narrow ? `اكشف حرفاً (${num(view.hintsLeft)})` : `اكشف حرفاً · بقي ${num(view.hintsLeft)}${coop ? '' : ` · −${num(CROSS_HINT_COST)}`}`}
          disabled={view.hintsLeft <= 0 || view.locked[sel.cell]}
          onPress={() => {
            haptic.medium();
            h.act('reveal', { cell: sel.cell, clue: clueId });
          }}
        />
        {coop ? <Btn flex size="sm" icon="check" color={C.green} label="تحقّق (+10 ث)" onPress={() => h.act('check')} /> : null}
      </Row>
      <Txt v="tiny" center color={C.dim}>
        {CROSS_KEY_RULE}
      </Txt>

      {coop ? (
        <PlayerStrip room={room} gains={false} entries={view.players.map((id) => ({ id, score: view.words[id] ?? 0, sub: 'كلمات' }))} />
      ) : (
        <PlayerStrip
          room={room}
          gains={false}
          active={view.players.filter((id) => view.progress[id]?.done)}
          entries={view.players.map((id) => ({ id, score: view.scores[id] ?? 0, sub: `كلمات: ${num(`${view.progress[id]?.words ?? 0}/${total}`)}` }))}
        />
      )}

      <ClueLists view={view} order={order} current={clue.id} onPick={(id) => {
        haptic.tap();
        toClue(id);
      }} />

      {coop && h.isHost ? (
        <>
          <Btn size="sm" ghost icon="stop" label="إنهاء الشبكة وعرض الحل" onPress={() => setConfirmEnd(true)} />
          <ConfirmModal
            visible={confirmEnd}
            icon="stop"
            title="إنهاء الشبكة؟"
            message="يظهر الحل للجميع، ولا تُحسب الشبكة كاملة."
            confirmLabel="أنهِ وأظهر الحل"
            onCancel={() => setConfirmEnd(false)}
            onConfirm={() => {
              setConfirmEnd(false);
              h.act('giveup');
            }}
          />
        </>
      ) : null}
    </>
  );
}

/** Co-op without a time limit: the family's clock, penalties included. */
function FamilyClock({ view }: { view: CrossView }) {
  const [now, setNow] = useState(() => client.serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(client.serverNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Row gap={4} style={{ alignItems: 'center' }}>
      <Icon name="clock" size={14} color={C.muted} />
      <Txt v="tiny" color={view.penaltyMs ? C.orange : C.muted}>
        {clock(now - view.startedAt + view.penaltyMs)}
      </Txt>
    </Row>
  );
}

function ClueBar({ clue, solved, onToggle, onPrev, onNext }: { clue: CrossClue; solved: boolean; onToggle: () => void; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={[styles.clueBar, solved && { borderColor: alpha(C.green, 0.7) }]}>
      <Pressable onPress={onPrev} hitSlop={8} style={styles.arrow} accessibilityLabel="التعريف السابق">
        <View style={{ transform: [{ scaleX: -1 }] }}>
          <Icon name="forward" size={20} color={C.text} />
        </View>
      </Pressable>
      <Pressable onPress={onToggle} style={{ flex: 1, minWidth: 0 }} accessibilityLabel={`${clue.num} ${DIR_NAME[clue.dir]}: ${clue.text}`}>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <View style={styles.clueTag}>
            <Txt style={styles.clueTagText}>
              {num(clue.num)} {DIR_NAME[clue.dir]}
            </Txt>
          </View>
          <Txt v="bold" numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>
            {clue.text}
            <Txt v="tiny" color={C.muted}>
              {' '}
              ({num(clue.cells.length)})
            </Txt>
            {solved ? <Txt color={C.green}> ✓</Txt> : null}
          </Txt>
        </Row>
      </Pressable>
      <Pressable onPress={onNext} hitSlop={8} style={styles.arrow} accessibilityLabel="التعريف التالي">
        <Icon name="forward" size={20} color={C.text} />
      </Pressable>
    </View>
  );
}

/** What just happened: my last word (race) or the last «تحقّق» (co-op), for a moment. */
function Feedback({ view, wrongCount }: { view: CrossView; wrongCount: number }) {
  const g = view.gain;
  const [first] = useState(() => ({ gain: g?.seq ?? 0, check: view.checkSeq }));
  const [gone, setGone] = useState('');
  const key = g && g.seq !== first.gain ? `g${g.seq}` : view.checkSeq !== first.check ? `c${view.checkSeq}` : '';
  useEffect(() => {
    if (!key) return;
    if (key.startsWith('g')) play('correct');
    const id = setTimeout(() => setGone(key), 2600);
    return () => clearTimeout(id);
  }, [key]);
  if (!key || gone === key) return null;
  let text: string, color: string;
  if (key.startsWith('g') && g) {
    text = `كلمة صحيحة · ${num(`+${g.points}`)}${g.first ? ' · الأسبق إليها!' : ''}`;
    color = C.green;
  } else {
    text = wrongCount ? 'الحروف الخاطئة بالأحمر' : 'لا خطأ في الحروف المكتوبة';
    color = wrongCount ? C.red : C.green;
  }
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View key={key} entering={FadeIn.duration(180)} exiting={FadeOut.duration(200)} style={[styles.flash, { borderColor: alpha(color, 0.8) }]}>
        <View style={{ backgroundColor: alpha(color, 0.2), paddingHorizontal: 14, paddingVertical: 1 }}>
          <Txt v="bold" style={{ fontSize: 13, lineHeight: 20, color }}>
            {text}
          </Txt>
        </View>
      </Animated.View>
    </View>
  );
}

function ClueLists({ view, order, current, onPick }: { view: CrossView; order: number[]; current: number; onPick: (id: number) => void }) {
  const width = useContentWidth();
  const two = width >= 520;
  const list = (dir: CrossDir) => (
    <View style={{ gap: 4, flex: two ? 1 : undefined }}>
      <Txt v="bold" color={C.yellow}>
        {dir === 'a' ? 'أفقياً' : 'عمودياً'}
      </Txt>
      {order
        .map((id) => view.clues[id])
        .filter((c) => c.dir === dir)
        .map((c) => {
          const done = view.solved[c.id] !== null;
          const on = c.id === current;
          return (
            <Pressable key={c.id} onPress={() => onPick(c.id)} style={[styles.clueRow, on && { backgroundColor: alpha(C.blue, 0.35), borderColor: alpha('#CFE0FF', 0.5) }]} accessibilityLabel={`${c.num} ${DIR_NAME[c.dir]}: ${c.text}`}>
              <Txt style={[styles.clueNum, done && { color: C.green }]}>{num(c.num)}</Txt>
              <Txt style={[styles.clueText, done && { color: C.dim, textDecorationLine: 'line-through' }]}>
                {c.text} <Txt style={{ fontSize: 12, color: C.dim }}>({num(c.cells.length)})</Txt>
              </Txt>
              {done ? <Icon name="check" size={16} color={C.green} /> : null}
            </Pressable>
          );
        })}
    </View>
  );
  return (
    <View style={[styles.lists, two && { flexDirection: 'row', gap: 14 }]}>
      {list('a')}
      {list('d')}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

function Final({ room, view, h }: { room: RoomView; view: CrossView; h: Helpers }) {
  const f = view.final!;
  const coop = view.mode === 'coop';
  const gridW = Math.min(useGridWidth(view.rows, view.cols), dk(340));
  const faded = view.open.map((o, i) => o && view.letters[i] !== f.solution[i]);
  const right = view.open.map(() => false);
  const ids = view.players;
  let title: string, sub: string, won: boolean;
  if (coop) {
    won = f.completed;
    title = f.completed ? 'الفوز للعائلة!' : 'إليكم الحل';
    const pen = f.penaltyMs ? ` (منها ${secondsText(Math.round(f.penaltyMs / 1000))} للتحقق)` : '';
    sub = f.completed ? `الشبكة كاملة في ${clock(f.ms)}${pen}` : `${wordsText(Object.values(view.words).reduce((a, b) => a + b, 0))} من ${num(view.clues.length)}`;
  } else {
    const best = Math.max(...ids.map((id) => view.scores[id] ?? 0));
    const top = ids.filter((id) => (view.scores[id] ?? 0) === best);
    won = top.includes(h.me);
    title = winnerTitle(top.map((id) => h.player(id).name));
    sub = f.winner ? `الشبكة كاملة أولاً عند ${h.player(f.winner).name} في ${clock(f.ms)}` : 'انتهى الوقت';
  }
  const most = Math.max(0, ...ids.map((id) => view.words[id] ?? 0));
  const sorted = [...ids].sort((a, b) => (coop ? (view.words[b] ?? 0) - (view.words[a] ?? 0) : (view.scores[b] ?? 0) - (view.scores[a] ?? 0)));
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="cross" size={84} />} title={title} sub={sub} />
      <Txt v="h3" center>
        الحل
      </Txt>
      <CrossGrid rows={view.rows} cols={view.cols} open={view.open} nums={view.nums} letters={f.solution} revealed={view.revealed} right={right} faded={faded} width={gridW} />
      {faded.some(Boolean) ? (
        <Txt v="tiny" center color={C.dim}>
          الحروف الباهتة لم تُكتب صحيحة في {coop ? 'الشبكة' : 'شبكتك'}
        </Txt>
      ) : null}
      <Txt v="h3" center>
        {coop ? 'كلمات كل واحد' : 'النقاط'}
      </Txt>
      <ResultRows
        h={h}
        ordered
        gainLabel={coop ? 'كلمات' : 'نقاط'}
        lines={sorted.map((id) => ({
          id,
          detail: coop ? (most > 0 && (view.words[id] ?? 0) === most ? 'الأكثر كلمات' : undefined) : wordsText(view.words[id] ?? 0),
          gain: num(coop ? (view.words[id] ?? 0) : (view.scores[id] ?? 0)),
          good: (coop ? (view.words[id] ?? 0) : (view.scores[id] ?? 0)) > 0,
        }))}
      />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const MODE_OPTIONS: { key: CrossMode; label: string }[] = [
  { key: 'coop', label: 'تعاوني' },
  { key: 'race', label: 'سباق' },
];
const LEVEL_OPTIONS: { key: CrossLevel; label: string }[] = [
  { key: 'easy', label: 'سهل' },
  { key: 'medium', label: 'متوسط' },
  { key: 'mixed', label: 'مزيج' },
];

export function CrossSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.cross;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'cross', patch });
  const race = s.mode === 'race';
  const times = CROSS_MINUTES.filter((m) => !race || m > 0).map((m) => ({ key: String(m), label: m === 0 ? 'بلا وقت' : `${num(m)} دقائق` }));
  const minutes = race && !s.minutes ? 8 : s.minutes;
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">طريقة اللعب</Txt>
      <ChipPicker<CrossMode> editable={editable} value={s.mode} onChange={(v) => change({ mode: v })} options={MODE_OPTIONS} />
      <Txt v="bold">الصعوبة</Txt>
      <ChipPicker<CrossLevel> editable={editable} value={s.level} onChange={(v) => change({ level: v })} options={LEVEL_OPTIONS} />
      <Txt v="bold">الوقت</Txt>
      <ChipPicker<string> editable={editable} value={String(minutes)} onChange={(v) => change({ minutes: Number(v) })} options={times} />
      <Row gap={8}>
        <GameArt id="cross" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          {race
            ? 'لكل لاعب نسخة من الشبكة نفسها: الكلمة الصحيحة بعدد حروفها، و2 إضافيتان للأسبق إليها، و5 لمن يكمل الشبكة أولاً.'
            : 'شبكة واحدة للعائلة يكتب فيها الجميع معاً، والبوتات تكتب بعض الكلمات بهدوء. «تحقّق» يضيف 10 ثوانٍ.'}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  clueBar: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: alpha('#CFE0FF', 0.35), paddingHorizontal: 4, paddingVertical: 4 },
  arrow: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  clueTag: { backgroundColor: '#CFE0FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  clueTagText: { fontFamily: F.black, fontSize: 12, lineHeight: 19, color: '#1C1A2E' },
  flash: { borderRadius: 999, borderWidth: 1.5, overflow: 'hidden', backgroundColor: C.bg },
  feedback: { position: 'absolute', top: -13, left: 0, right: 0, alignItems: 'center' },
  lists: { gap: 12, backgroundColor: C.surface, borderRadius: 18, padding: 12 },
  clueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: 'transparent', minHeight: 40 },
  clueNum: { fontFamily: F.black, fontSize: 14, lineHeight: 22, color: C.yellow, minWidth: 20, textAlign: 'center' },
  clueText: { flex: 1, fontFamily: F.bold, fontSize: 14, lineHeight: 22, color: C.text },
});
