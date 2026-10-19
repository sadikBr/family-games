/**
 * «شبكة الكلمات» — the screen. Your 7 tiles at the bottom: tap a tile, then a square to put it there
 * (tap it again to take it back). On narrow phones the first tap on the board zooms into a 9×9 window
 * around that square. «العب» shows the score the move would make (same scoring code as the server);
 * the server checks the words in the dictionary.
 * Motion: a tile I put down glides from my rack to its square, my rack closes its gaps and refills with
 * new tiles sliding in, another player's word appears tile by tile and its points count up above it.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/sfx';
import { client } from '@/lib/client';
import type { ScrabbleMove, ScrabbleTile, ScrabbleView } from '@/shared/games/scrabble';
import type { RoomView } from '@/shared/protocol';
import { CENTER, LETTERS, RACK, SIZE, analyse, colOf, rowOf } from '@/shared/scrabble-rules';
import { C, F, alpha } from '@/theme';
import { Card, Pill, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { CardMotion, CardStage } from './cards/motion';
import { PlayerStrip } from './player-strip';
import { Board, Legend, TileFace, type BoardWindow } from './scrabble-board';
import { ARRIVE, useSettled } from './scrabble-motion';
import { useRefusedFlash } from './wordle-ui';

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

/** Reading order of a word's new tiles: top to bottom, then right to left (column 0 is on the right). */
const readingOrder = (cells: readonly number[]) => [...cells].sort((a, b) => rowOf(a) - rowOf(b) || colOf(a) - colOf(b));

/**
 * The word that just came, to animate: other players' tiles appear one by one, and the points count up
 * (also for my own word). Only for a move made while the screen is open; a later move replaces it.
 */
function useFreshWord(view: ScrabbleView, me: string, settled: boolean) {
  const move = view.last?.kind === 'play' ? view.last : null;
  const key = move ? `${view.turnNo}` : null;
  const [seen, setSeen] = useState<{ key: string | null; fresh: boolean }>({ key, fresh: false });
  let cur = seen;
  if (seen.key !== key) {
    cur = { key, fresh: settled && key !== null };
    setSeen(cur);
  }
  if (!move || !key || !cur.fresh) return { arrive: null, badge: null };
  const cells = readingOrder(move.cells);
  const mine = move.by === me;
  const arrive = mine ? null : { key, order: new Map(cells.map((c, k) => [c, k])) };
  // the points start counting once the last tile is down
  const delay = mine ? 120 : (cells.length - 1) * ARRIVE.stagger + ARRIVE.ms;
  return { arrive, badge: { key, cell: cells[0], score: move.score, delay } };
}

function moveText(m: ScrabbleMove, h: Helpers): string {
  const name = m.by === h.me ? 'أنت' : h.player(m.by).name;
  switch (m.kind) {
    case 'play':
      return `${name}: ${m.words.map((w) => `«${w.w}»`).join(' + ')}  ${num(`+${m.score}`)}${m.bingo ? ' (الأحرف السبعة!)' : ''}`;
    case 'swap':
      return `${name}: تبديل ${num(m.count)} ${m.count === 1 ? 'حرف' : 'أحرف'}`;
    case 'pass':
      return `${name}: تمرير الدور`;
    case 'timeout':
      return `${name}: انتهى الوقت`;
  }
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
        tone={winner === h.me ? 'good' : 'neutral'}
        title={winner ? (winner === h.me ? 'فزت!' : `الفوز ${li(h.player(winner).name)}`) : 'تعادل!'}
        sub={f?.out ? (f.out === h.me ? 'أنهيت كل أحرفك' : `نفدت أحرف ${h.player(f.out).name}`) : view.order.length <= 1 ? 'غادر باقي اللاعبين' : 'لا أحد يستطيع اللعب'}
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
  const refused = useRefusedFlash();
  const [pend, setPend] = useState<{ since: number; list: Pend[] }>({ since: 0, list: [] });
  const [sel, setSel] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [zoom, setZoom] = useState<{ on: boolean; r0: number; c0: number }>({ on: false, r0: 3, c0: 3 });
  const [swap, setSwap] = useState<number[] | null>(null);
  const [blankAt, setBlankAt] = useState<{ id: number; cell: number } | null>(null);
  const [confirmPass, setConfirmPass] = useState(false);
  const settled = useSettled();
  const fresh = useFreshWord(view, h.me, settled);
  // the tile I just put down glides from the rack (only then: not when the zoomed board scrolls back to it)
  const [flying, setFlying] = useState<number | null>(null);
  useEffect(() => {
    if (flying === null) return;
    const t = setTimeout(() => setFlying(null), 700);
    return () => clearTimeout(t);
  }, [flying]);

  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} />;
  const playing = view.order.includes(h.me);

  const myTurn = view.turn === h.me;
  const rack = view.rack;
  const rackIds = new Set(rack.map((t) => t.id));
  // placements still valid (a new game, a tile played, or a square taken by someone else drops them)
  const list = pend.since <= view.turnNo ? pend.list.filter((p) => rackIds.has(p.id) && !view.board[p.cell]) : [];
  const placedIds = new Set(list.map((p) => p.id));
  const pendingMap = new Map(list.map((p) => [p.cell, { l: p.l, v: p.v, blank: p.blank, id: p.id === flying ? p.id : undefined }]));
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
    setFlying(tile.id);
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
    <CardStage>
      <PlayerStrip
        room={room}
        entries={view.order.map((id) => ({ id, score: view.scores[id] ?? 0, sub: `${num(view.rackCounts[id] ?? 0)} أحرف` }))}
        active={view.turn ? [view.turn] : []}
      />
      {view.total > 0 ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={myTurn} /> : null}
      <View style={{ gap: 2 }}>
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Txt v="bold" color={myTurn ? C.yellow : C.muted} style={{ flex: 1 }} numberOfLines={1}>
            {myTurn ? 'ضع أحرفك على اللوحة ثم «العب»' : ''}
          </Txt>
          <Pill icon="box" label={`في الكيس: ${num(view.bag)}`} />
        </Row>
        {/* the latest move is in the room's last-move line; before the first one, where to start */}
        {view.last ? null : (
          <Txt v="small" center color={C.muted}>
            الكلمة الأولى تمر بالنجمة ★ في الوسط
          </Txt>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Board
          board={view.board}
          pending={pendingMap}
          last={lastCells}
          word={lastWord}
          width={width}
          win={win}
          onCell={playing ? onCell : undefined}
          arrive={fresh.arrive}
          badge={fresh.badge}
        />
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
          <View>
            <View style={[styles.rack, { direction: 'rtl' }, refused && styles.rackRefused]}>
              {shown.map((t) => {
                const placed = placedIds.has(t.id);
                const on = swapSel ? swapSel.includes(t.id) : selected === t.id;
                // new tiles slide in from the bag side; the others close the gaps smoothly
                return (
                  <CardMotion key={t.id} id={`t${t.id}`} enter="deal" from="top" flow>
                    <Pressable onPress={() => onTile(t)} accessibilityLabel={t.l || 'مربع فارغ'}>
                      <View style={on ? { transform: [{ translateY: -6 }] } : null}>
                        <TileFace l={t.l} v={t.v} blank={!t.l} size={tileSize} dim={placed} selected={on} />
                      </View>
                    </Pressable>
                  </CardMotion>
                );
              })}
            </View>
          </View>
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
          if (blankAt) {
            setList([...list, { id: blankAt.id, cell: blankAt.cell, l, v: 0, blank: true }]);
            setFlying(blankAt.id);
          }
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
    </CardStage>
  );
}

/** Lobby settings: time per turn (the bots follow the room's «مستوى البوتات»). */
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
      <Txt v="tiny" color={C.muted}>
        عندما ينتهي الوقت يمر الدور تلقائياً.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  rack: { flexDirection: 'row', justifyContent: 'center', gap: 4, backgroundColor: '#5A3A1E', borderRadius: 12, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 4, borderBottomWidth: 4, borderColor: '#3B2512' },
  rackRefused: { backgroundColor: alpha(C.red, 0.55), borderColor: C.red },
  arrow: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  picker: { width: '100%', maxWidth: 380, backgroundColor: C.bg2, borderRadius: 20, padding: 14, gap: 12, borderWidth: 1, borderColor: C.borderStrong },
  pick: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4E3BC' },
});
