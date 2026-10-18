/**
 * «شبكة الكلمات» — the screen. Your 7 tiles at the bottom: tap a tile, then a square to put it there
 * (tap it again to take it back). On narrow phones the first tap on the board zooms into a 9×9 window
 * around that square. «العب» shows the score the move would make (same scoring code as the server);
 * the server checks the words in the dictionary.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { client, useClient } from '@/lib/client';
import type { ScrabbleMove, ScrabbleTile, ScrabbleView } from '@/shared/games/scrabble';
import type { RoomView } from '@/shared/protocol';
import { CENTER, LETTERS, RACK, SIZE, analyse, colOf, rowOf } from '@/shared/scrabble-rules';
import { C, F } from '@/theme';
import { Avatar, Card, Pill, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, Shake, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { Board, Legend, TileFace, type BoardWindow } from './scrabble-board';

interface Pend {
  id: number;
  cell: number;
  l: string;
  v: number;
  blank: boolean;
}

const ZOOM = 9;
/** below this cell size the full board is for looking, the zoomed one for placing */
const SMALL_CELL = 27;

const clampWin = (v: number) => Math.max(0, Math.min(SIZE - ZOOM, v));
const windowAround = (cell: number) => ({ r0: clampWin(rowOf(cell) - 4), c0: clampWin(colOf(cell) - 4) });

function lastPlay(view: ScrabbleView): ScrabbleMove | null {
  for (let i = view.log.length - 1; i >= 0; i--) if (view.log[i].kind === 'play') return view.log[i];
  return null;
}

/** Every tile of the words a move made: its new tiles and the tiles they joined, in both directions. */
function wordCells(board: ScrabbleView['board'], cells: readonly number[]): Set<number> {
  const out = new Set<number>();
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < SIZE && c < SIZE && !!board[r * SIZE + c];
  for (const cell of cells) {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ]) {
      const run = [cell];
      for (let r = rowOf(cell) - dr, c = colOf(cell) - dc; has(r, c); r -= dr, c -= dc) run.push(r * SIZE + c);
      for (let r = rowOf(cell) + dr, c = colOf(cell) + dc; has(r, c); r += dr, c += dc) run.push(r * SIZE + c);
      if (run.length > 1) for (const x of run) out.add(x);
    }
  }
  return out;
}

function moveText(m: ScrabbleMove, h: Helpers): string {
  const name = m.by === h.me ? 'أنت' : h.player(m.by).name;
  switch (m.kind) {
    case 'play':
      return `${name}: ${m.words.map((w) => `«${w.w}»`).join(' + ')}  ${num(`+${m.score}`)}${m.bingo ? ' (الأحرف السبعة!)' : ''}`;
    case 'swap':
      return `${name}: بدّل ${num(m.count)} ${m.count === 1 ? 'حرفاً' : 'أحرف'}`;
    case 'pass':
      return `${name}: مرّر الدور`;
    case 'timeout':
      return `${name}: انتهى الوقت`;
  }
}

function Players({ view, h, width }: { view: ScrabbleView; h: Helpers; width: number }) {
  const n = view.order.length;
  const per = n === 3 ? 3 : 2;
  const w = (width - (per - 1) * 6) / per;
  return (
    <Row gap={6} wrap center>
      {view.order.map((id) => {
        const on = view.turn === id;
        return (
          <View key={id} style={[styles.player, { width: w }, on && styles.playerOn]}>
            <Avatar player={h.player(id)} size={26} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="tiny" numberOfLines={1}>
                {id === h.me ? 'أنت' : h.player(id).name}
              </Txt>
              <Row gap={3}>
                <Icon name="layers" size={11} color={C.dim} />
                <Txt v="tiny" color={C.dim} numberOfLines={1}>
                  {num(view.rackCounts[id] ?? 0)}
                </Txt>
              </Row>
            </View>
            <Txt style={{ fontFamily: F.black, fontSize: 17, lineHeight: 24, color: on ? C.yellow : C.text }}>{num(view.scores[id] ?? 0)}</Txt>
          </View>
        );
      })}
    </Row>
  );
}

function BlankPicker({ visible, onPick, onCancel }: { visible: boolean; onPick: (l: string) => void; onCancel: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.picker}>
          <Txt v="h3" center>
            أي حرف يمثّل المربع الفارغ؟
          </Txt>
          <Row gap={6} wrap center>
            {LETTERS.map((l) => (
              <Pressable key={l} onPress={() => onPick(l)} style={({ pressed }) => [styles.pick, pressed && { backgroundColor: C.yellow }]} accessibilityLabel={l}>
                <Txt style={{ fontFamily: F.display, fontSize: 22, lineHeight: 32, color: C.ink }}>{l}</Txt>
              </Pressable>
            ))}
          </Row>
          <Btn size="sm" ghost label="إلغاء" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

function Final({ room, view, h, width }: { room: RoomView; view: ScrabbleView; h: Helpers; width: number }) {
  const f = view.final;
  const winner = f?.winner ?? null;
  const all = Object.keys(view.scores);
  const players = all.map((id) => h.player(id)).filter((p) => room.players.some((x) => x.id === p.id));
  const last = lastPlay(view);
  return (
    <>
      {winner === h.me ? <Confetti /> : null}
      <ResultBanner
        tone={winner === h.me ? 'good' : winner ? 'bad' : 'neutral'}
        title={winner ? (winner === h.me ? 'فزت!' : `فاز ${h.player(winner).name}`) : 'تعادل!'}
        sub={f?.out ? `${f.out === h.me ? 'أنهيت' : `${h.player(f.out).name} أنهى`} كل أحرفه` : view.order.length <= 1 ? 'غادر باقي اللاعبين' : 'لا أحد يستطيع اللعب'}
      />
      <Podium players={players} scores={view.scores} />
      <Scoreboard players={players} scores={view.scores} highlight={h.me} />
      {f && Object.keys(f.adjust).length ? (
        <Card style={{ gap: 6 }}>
          <Txt v="h3">الأحرف الباقية</Txt>
          {view.order.map((id) => (
            <Row key={id} gap={6}>
              <Txt v="small" style={{ flex: 1 }} numberOfLines={1}>
                {h.player(id).name}
              </Txt>
              <Row gap={2}>
                {(f.left[id] ?? []).map((t) => (
                  <TileFace key={t.id} l={t.l} v={t.v} blank={!t.l} size={22} />
                ))}
              </Row>
              <Txt v="bold" color={(f.adjust[id] ?? 0) >= 0 ? C.green : C.red} style={{ minWidth: 40, textAlign: 'center' }}>
                {num(`${(f.adjust[id] ?? 0) > 0 ? '+' : ''}${f.adjust[id] ?? 0}`)}
              </Txt>
            </Row>
          ))}
        </Card>
      ) : null}
      <Board board={view.board} pending={new Map()} last={new Set(last?.cells ?? [])} width={width} win={{ r0: 0, c0: 0, n: SIZE }} />
      <PlayAgain room={room} />
    </>
  );
}

export function ScrabbleGame({ room, view }: { room: RoomView; view: ScrabbleView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const { error } = useClient();
  const [pend, setPend] = useState<{ since: number; list: Pend[] }>({ since: 0, list: [] });
  const [sel, setSel] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [zoom, setZoom] = useState<{ on: boolean; r0: number; c0: number }>({ on: false, r0: 3, c0: 3 });
  const [swap, setSwap] = useState<number[] | null>(null);
  const [blankAt, setBlankAt] = useState<{ id: number; cell: number } | null>(null);
  const [confirmPass, setConfirmPass] = useState(false);

  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} />;
  const playing = view.order.includes(h.me);

  const myTurn = view.turn === h.me;
  const rack = view.rack;
  const rackIds = new Set(rack.map((t) => t.id));
  // placements still valid (a new game, a tile played, or a square taken by someone else drops them)
  const list = pend.since <= view.turnNo ? pend.list.filter((p) => rackIds.has(p.id) && !view.board[p.cell]) : [];
  const placedIds = new Set(list.map((p) => p.id));
  const pendingMap = new Map(list.map((p) => [p.cell, { l: p.l, v: p.v, blank: p.blank }]));
  const shown: ScrabbleTile[] = [...order.filter((id) => rackIds.has(id)), ...rack.map((t) => t.id).filter((id) => !order.includes(id))].map((id) => rack.find((t) => t.id === id)!);
  const selected = sel !== null && rackIds.has(sel) && !placedIds.has(sel) ? sel : null;
  const swapSel = swap?.filter((id) => rackIds.has(id)) ?? null;
  const res = list.length ? analyse(view.board, list) : null;
  const last = lastPlay(view);
  // the word just played stays marked until the next move (a pass or a swap clears it)
  const lastMove = view.last?.kind === 'play' ? view.last : null;
  const lastCells = new Set(lastMove?.cells ?? []);
  const lastWord = lastMove ? wordCells(view.board, lastMove.cells) : undefined;

  const fullCell = (width - 6) / SIZE;
  const small = fullCell < SMALL_CELL;
  const zoomed = zoom.on;
  const win: BoardWindow = zoomed ? { r0: zoom.r0, c0: zoom.c0, n: ZOOM } : { r0: 0, c0: 0, n: SIZE };

  const setList = (next: Pend[]) => setPend({ since: view.turnNo, list: next });
  const focusCell = () => list[list.length - 1]?.cell ?? last?.cells[0] ?? CENTER;

  const onCell = (cell: number) => {
    if (!playing || swapSel) return;
    if (!zoomed && small) {
      haptic.tap();
      setZoom({ on: true, ...windowAround(cell) });
      return;
    }
    const here = list.find((p) => p.cell === cell);
    if (here) {
      haptic.tap();
      setList(list.filter((p) => p !== here));
      return;
    }
    if (view.board[cell] || selected === null) return;
    const tile = rack.find((t) => t.id === selected)!;
    haptic.light();
    if (!tile.l) {
      setBlankAt({ id: tile.id, cell });
      return;
    }
    setList([...list, { id: tile.id, cell, l: tile.l, v: tile.v, blank: false }]);
    setSel(null);
  };

  const onTile = (t: ScrabbleTile) => {
    haptic.tap();
    if (swapSel) {
      setSwap(swapSel.includes(t.id) ? swapSel.filter((x) => x !== t.id) : [...swapSel, t.id]);
      return;
    }
    if (placedIds.has(t.id)) {
      setList(list.filter((p) => p.id !== t.id));
      setSel(t.id);
      return;
    }
    setSel(selected === t.id ? null : t.id);
  };

  const shuffleRack = () => {
    const ids = shown.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrder(ids);
  };

  const pan = (dr: number, dc: number) => setZoom({ on: true, r0: clampWin(zoom.r0 + dr), c0: clampWin(zoom.c0 + dc) });

  const tileSize = Math.min(46, Math.floor((width - 8 - (RACK - 1) * 4) / RACK));

  return (
    <>
      <Players view={view} h={h} width={width} />
      {view.total > 0 ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={myTurn} /> : null}
      <View style={{ gap: 2 }}>
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Txt v="bold" color={myTurn ? C.yellow : C.muted} style={{ flex: 1 }} numberOfLines={1}>
            {myTurn ? 'ضع أحرفك على اللوحة ثم «العب»' : ''}
          </Txt>
          <Pill icon="box" label={`في الكيس: ${num(view.bag)}`} />
        </Row>
        {view.last ? (
          <Animated.View key={view.turnNo} entering={FadeIn.duration(200)}>
            <Txt v="small" center color={view.last.kind === 'play' ? C.text : C.muted} numberOfLines={2}>
              {moveText(view.last, h)}
            </Txt>
          </Animated.View>
        ) : (
          <Txt v="small" center color={C.muted}>
            الكلمة الأولى تمر بالنجمة ★ في الوسط
          </Txt>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Board board={view.board} pending={pendingMap} last={lastCells} word={lastWord} width={width} win={win} onCell={playing ? onCell : undefined} />
        <Row gap={6} center>
          <Btn
            size="sm"
            ghost
            icon="search"
            label={zoomed ? 'اللوحة كاملة' : 'تكبير'}
            onPress={() => setZoom(zoomed ? { ...zoom, on: false } : { on: true, ...windowAround(focusCell()) })}
          />
          {zoomed ? (
            <Row gap={4}>
              {/* column 0 is on the right: «→» shows columns further right (smaller), «←» further left */}
              {[
                { k: '↑', a: () => pan(-3, 0) },
                { k: '↓', a: () => pan(3, 0) },
                { k: '→', a: () => pan(0, -3) },
                { k: '←', a: () => pan(0, 3) },
              ].map((b) => (
                <Pressable key={b.k} onPress={b.a} style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.6 }]} accessibilityLabel={b.k}>
                  <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 24 }}>{b.k}</Txt>
                </Pressable>
              ))}
            </Row>
          ) : null}
        </Row>
        {playing ? (
          <Shake trigger={error?.id}>
            <View style={[styles.rack, { direction: 'rtl' }]}>
              {shown.map((t) => {
                const placed = placedIds.has(t.id);
                const on = swapSel ? swapSel.includes(t.id) : selected === t.id;
                return (
                  <Pressable key={t.id} onPress={() => onTile(t)} accessibilityLabel={t.l || 'مربع فارغ'}>
                    <View style={on ? { transform: [{ translateY: -6 }] } : null}>
                      <TileFace l={t.l} v={t.v} blank={!t.l} size={tileSize} dim={placed} selected={on} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Shake>
        ) : null}
      </View>

      {!playing ? (
        <Spectator room={room} />
      ) : (
        <>
          {swapSel ? (
            <View style={{ gap: 8 }}>
              <Txt v="small" center color={C.muted}>
                اختر الأحرف التي تريد إرجاعها إلى الكيس
              </Txt>
              <Row gap={8}>
                <Btn
                  flex
                  size="md"
                  icon="swap"
                  color={C.cyan}
                  disabled={!myTurn || !swapSel.length}
                  label={swapSel.length ? `بدّل ${num(swapSel.length)}` : 'بدّل'}
                  onPress={() => {
                    h.act('swap', { ids: swapSel });
                    setSwap(null);
                  }}
                />
                <Btn flex size="md" ghost label="إلغاء" onPress={() => setSwap(null)} />
              </Row>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {res && list.length ? (
                res.ok ? (
                  <Txt v="small" center color={C.muted} numberOfLines={2}>
                    {res.words.map((w) => `«${w.w}» ${num(w.score)}`).join(' · ')}
                    {res.bingo ? ` · الأحرف السبعة ${num(`+50`)}` : ''}
                  </Txt>
                ) : (
                  <Txt v="small" center color={C.orange}>
                    {res.error}
                  </Txt>
                )
              ) : null}
              <Btn
                size="lg"
                icon="check"
                color={C.green}
                disabled={!myTurn || !res?.ok}
                label={res?.ok ? `العب  ${num(`+${res.score}`)}` : myTurn ? 'العب' : 'انتظر دورك'}
                onPress={() => {
                  if (!res?.ok) return;
                  h.act('play', { tiles: list.map((p) => ({ id: p.id, cell: p.cell, l: p.l })) });
                }}
              />
              <Row gap={8}>
                <Btn flex size="sm" ghost icon="refresh" label="أعد الأحرف" disabled={!list.length} onPress={() => setList([])} />
                <Btn flex size="sm" ghost icon="shuffle" label="اخلط" onPress={shuffleRack} />
              </Row>
              <Row gap={8}>
                <Btn
                  flex
                  size="sm"
                  ghost
                  icon="swap"
                  label="بدّل"
                  disabled={!myTurn || view.bag < RACK}
                  onPress={() => {
                    setList([]);
                    setSwap([]);
                  }}
                />
                <Btn flex size="sm" ghost icon="skip" label="مرّر" disabled={!myTurn} onPress={() => setConfirmPass(true)} />
              </Row>
            </View>
          )}
        </>
      )}

      <Legend />
      {view.log.length > 1 ? (
        <View style={{ gap: 2 }}>
          {view.log
            .slice(0, -1)
            .slice(-4)
            .reverse()
            .map((m, i) => (
              <Txt key={i} v="tiny" center color={C.dim} numberOfLines={1}>
                {moveText(m, h)}
              </Txt>
            ))}
        </View>
      ) : null}

      <BlankPicker
        visible={blankAt !== null}
        onCancel={() => setBlankAt(null)}
        onPick={(l) => {
          if (blankAt) setList([...list, { id: blankAt.id, cell: blankAt.cell, l, v: 0, blank: true }]);
          setBlankAt(null);
          setSel(null);
        }}
      />
      <ConfirmModal
        visible={confirmPass}
        icon="skip"
        title="تمرير الدور؟"
        message="إذا مرّر الجميع دورين متتاليين تنتهي اللعبة."
        confirmLabel="مرّر"
        onCancel={() => setConfirmPass(false)}
        onConfirm={() => {
          setConfirmPass(false);
          setList([]);
          h.act('pass');
        }}
      />
    </>
  );
}

/** Lobby settings: time per turn and the bots' level. */
export function ScrabbleSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.scrabble;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'scrabble', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الوقت لكل دور</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.seconds) as '0' | '60' | '90' | '120'}
        onChange={(v) => change({ seconds: Number(v) })}
        options={[
          { key: '0', label: 'بدون وقت' },
          { key: '60', label: '60 ث' },
          { key: '90', label: '90 ث' },
          { key: '120', label: '120 ث' },
        ]}
      />
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.level) as '1' | '2'}
        onChange={(v) => change({ level: Number(v) })}
        options={[
          { key: '1', label: 'سهل' },
          { key: '2', label: 'قوي' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        عندما ينتهي الوقت يمر الدور تلقائياً.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  player: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 6, borderWidth: 2, borderColor: 'transparent' },
  playerOn: { borderColor: C.yellow, backgroundColor: 'rgba(242,179,61,0.14)' },
  rack: { flexDirection: 'row', justifyContent: 'center', gap: 4, backgroundColor: '#5A3A1E', borderRadius: 12, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 4, borderBottomWidth: 4, borderColor: '#3B2512' },
  arrow: { width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  picker: { width: '100%', maxWidth: 380, backgroundColor: C.bg2, borderRadius: 20, padding: 14, gap: 12, borderWidth: 1, borderColor: C.borderStrong },
  pick: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4E3BC' },
});
