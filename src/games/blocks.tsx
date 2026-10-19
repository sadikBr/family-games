/**
 * «القطع الملونة» — the screen. Pick a piece in your tray, turn or flip it, touch the board to see it
 * there (green = allowed, red = not), nudge it with the arrows, then «ضع». Touching a square snaps the
 * piece to an allowed spot covering it when there is one. Corner spots where a piece of yours still fits
 * show as dots. On narrow phones the 20×20 board is small: the first touch zooms into a 10×10 window.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/lib/sfx';
import { client } from '@/lib/client';
import {
  PIECE_COUNT,
  PIECE_SIZES,
  PLACE_ERRORS,
  checkCells,
  flipT,
  hasMove,
  liveAnchors,
  pieceBox,
  placementCells,
  rotateT,
  snapPlacement,
  type SeatCtx,
} from '@/shared/blocks-rules';
import type { BlocksView } from '@/shared/games/blocks';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { BLOCKS_COLORS, Board, OK_GREEN, PieceMini, type BoardWindow } from './blocks-board';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { winLine } from './duel';
import { helpers, type Helpers } from './helpers';
import { PlayerStrip } from './player-strip';

/** below this cell size the whole board is for looking, a zoomed window for placing */
const SMALL_CELL = 24;
const MAX_BOARD = 520;

const nameOf = (h: Helpers, view: BlocksView, id: string) => (h.players.some((p) => p.id === id) ? h.player(id).name : (view.names[id] ?? '؟'));
const seatCtx = (view: BlocksView, seat: number): SeatCtx => ({ board: view.board, n: view.n, seat, start: view.starts[seat], first: view.left[seat].length === PIECE_COUNT });
const squaresOf = (left: readonly number[]) => left.reduce((a, p) => a + PIECE_SIZES[p], 0);
/** «٣ قطع»، «١١ قطعة»… (Arabic counted nouns: plural from 3 to 10) */
const count = (k: number, one: string, two: string, few: string, many: string) => (k === 1 ? one : k === 2 ? two : k >= 3 && k <= 10 ? `${num(k)} ${few}` : `${num(k)} ${many}`);
const pieces = (k: number) => count(k, 'قطعة واحدة', 'قطعتان', 'قطع', 'قطعة');
const squares = (k: number) => count(k, 'مربع واحد', 'مربعان', 'مربعات', 'مربعاً');
/** the tray: big pieces first */
const trayOrder = (left: readonly number[]) => left.slice().sort((a, b) => PIECE_SIZES[b] - PIECE_SIZES[a] || a - b);

/** Orientations to try, starting from t: the four turns, then the four turns of the mirror image. */
function orientationsFrom(t: number) {
  const out: number[] = [];
  let x = t;
  for (let k = 0; k < 4; k++, x = rotateT(x)) out.push(x);
  x = flipT(t);
  for (let k = 0; k < 4; k++, x = rotateT(x)) out.push(x);
  return out;
}

function Players({ room, view }: { room: RoomView; view: BlocksView }) {
  return (
    <PlayerStrip
      room={room}
      active={view.phase === 'play' && view.turn ? [view.turn] : []}
      entries={view.seats.map((id, i) => ({
        id,
        color: BLOCKS_COLORS[i],
        sub: view.gone[i] ? 'خارج اللعبة' : view.phase === 'play' && view.done[i] ? (view.left[i].length ? 'لا مكان' : 'انتهت القطع') : pieces(view.left[i].length),
        out: view.gone[i] || (view.phase === 'play' && view.done[i]),
      }))}
    />
  );
}

/** A small emblem for the result banner: three pieces touching at the corners. */
function BlocksArt({ size }: { size: number }) {
  const b = size * 0.62;
  return (
    <View style={{ width: size * 1.5, height: size, direction: 'ltr' }}>
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <PieceMini piece={9} t={0} cell={b / 3} box={b} color={BLOCKS_COLORS[0]} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.55, top: size * 0.38 }}>
        <PieceMini piece={15} t={0} cell={b / 3} box={b} color={BLOCKS_COLORS[1]} />
      </View>
    </View>
  );
}

function FinalScores({ view, h }: { view: BlocksView; h: Helpers }) {
  const rows = view.seats.map((id, i) => ({ id, i, s: view.scores[i] })).sort((a, b) => Number(view.gone[a.i]) - Number(view.gone[b.i]) || b.s.total - a.s.total);
  return (
    <Card style={{ gap: 6 }}>
      {rows.map(({ id, i, s }, k) => (
        <View key={id} style={[styles.scoreRow, id === h.me && { borderColor: alpha(C.yellow, 0.6) }]}>
          <Txt v="h3" color={C.dim} style={{ width: 18, textAlign: 'center' }}>
            {view.gone[i] ? '–' : num(rows.filter((x) => !view.gone[x.i] && x.s.total > s.total).length + 1)}
          </Txt>
          <View style={[styles.swatch, { backgroundColor: BLOCKS_COLORS[i], width: 14, height: 14 }]} />
          <View style={{ flex: 1 }}>
            <Txt v="bold" numberOfLines={1}>
              {nameOf(h, view, id)}
              {view.winners?.includes(id) ? ' 👑' : ''}
            </Txt>
            <Txt v="tiny" color={C.muted} numberOfLines={1}>
              {view.gone[i] ? 'خارج اللعبة' : s.squares ? `بقي ${squares(s.squares)} (${pieces(view.left[i].length)})` : s.bonus === 20 ? 'كل القطع على اللوحة، وآخرها المربع الواحد' : 'كل القطع على اللوحة'}
              {s.bonus ? `  ${num(`+${s.bonus}`)}` : ''}
            </Txt>
          </View>
          <Txt style={{ fontFamily: F.black, fontSize: 20, lineHeight: 28 }} color={s.total >= 0 ? OK_GREEN : C.text}>
            {num(s.total)}
          </Txt>
        </View>
      ))}
      <Txt v="tiny" color={C.dim} center>
        تُخصم نقطة عن كل مربع باقٍ، ويُضاف +١٥ لمن وضع كل قطعه (+٥ إن كانت آخرها ذات المربع الواحد)
      </Txt>
    </Card>
  );
}

function Final({ room, view, h, width }: { room: RoomView; view: BlocksView; h: Helpers; width: number }) {
  const meId = view.seats[view.me];
  const ws = view.winners ?? [];
  const won = ws.length === 1 && ws[0] === meId;
  const title = ws.length === 1 ? (won ? 'فزت!' : winLine(nameOf(h, view, ws[0]))) : ws.length ? 'تعادل!' : 'انتهت اللعبة';
  const best = ws.length ? view.scores[view.seats.indexOf(ws[0])].total : 0;
  const sub = view.reason === 'forfeit' ? 'خروج الآخرين من اللعبة' : ws.length ? `${num(best)} نقطة — لا أحد يستطيع اللعب` : '';
  const boardW = Math.min(width, MAX_BOARD);
  // the podium: everyone still in the game, by score
  const podium = h.players.filter((p) => view.seats.some((id, i) => id === p.id && !view.gone[i]));
  const scores = Object.fromEntries(view.seats.map((id, i) => [id, view.scores[i].total]));
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : ws.includes(meId) ? 'neutral' : view.me < 0 ? 'neutral' : 'bad'} art={<BlocksArt size={52} />} title={title} sub={sub} />
      {podium.length > 1 ? <Podium players={podium} scores={scores} /> : null}
      <FinalScores view={view} h={h} />
      <Board n={view.n} board={view.board} starts={view.starts} last={view.last?.cells ?? []} width={boardW} win={{ r0: 0, c0: 0, size: view.n }} />
      <PlayAgain room={room} />
    </>
  );
}

interface Sel {
  piece: number;
  t: number;
}
interface Pos {
  r: number;
  c: number;
  /** the square the player touched: turning or flipping keeps the piece on it */
  at: number;
}

export function BlocksGame({ room, view }: { room: RoomView; view: BlocksView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const [rawSel, setSel] = useState<Sel | null>(null);
  const [pivot, setPivot] = useState<Pos | null>(null);
  const [zoom, setZoom] = useState<{ on: boolean; r0: number; c0: number }>({ on: false, r0: 0, c0: 0 });

  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} />;
  if (view.me < 0) return <Spectator room={room} />;

  const me = view.me;
  const n = view.n;
  const meId = view.seats[me];
  const myColor = BLOCKS_COLORS[me];
  const left = view.left[me];
  const out = view.done[me] || view.gone[me];
  const myTurn = view.turn === meId;
  const x = seatCtx(view, me);
  const sel = rawSel && left.includes(rawSel.piece) && !out ? rawSel : null;
  const pos = sel ? pivot : null;

  // board geometry and zoom
  const boardW = Math.min(width, MAX_BOARD);
  const fullCell = (boardW - 10) / n;
  const small = fullCell < SMALL_CELL;
  const Z = n >= 20 ? 10 : 9;
  const zoomed = small && zoom.on;
  const clampW = (v: number) => Math.max(0, Math.min(n - Z, v));
  const win: BoardWindow = zoomed ? { r0: zoom.r0, c0: zoom.c0, size: Z } : { r0: 0, c0: 0, size: n };

  // the ghost and its verdict
  const ghostCells = sel && pos ? placementCells(n, { piece: sel.piece, t: sel.t, r: pos.r, c: pos.c }) : null;
  const err = sel && pos ? checkCells(x, ghostCells) : null;
  const ghost = sel && pos && ghostCells ? { cells: ghostCells, ok: !err } : null;
  const canPlace = myTurn && !!ghost && ghost.ok;
  const hints = out ? [] : liveAnchors(x, sel ? [sel.piece] : left);
  const fits = new Set(out ? [] : left.filter((p) => hasMove(x, [p])));

  /** Move the zoom window (if zoomed) so that rows r..r+h-1 and columns c..c+w-1 are in view. */
  const follow = (r: number, c: number, hh: number, ww: number, on = zoomed) => {
    if (!small) return;
    const base = on ? zoom : { r0: clampW(r - Math.floor((Z - hh) / 2)), c0: clampW(c - Math.floor((Z - ww) / 2)) };
    let { r0, c0 } = base;
    if (r < r0) r0 = r;
    if (r + hh > r0 + Z) r0 = r + hh - Z;
    if (c < c0) c0 = c;
    if (c + ww > c0 + Z) c0 = c + ww - Z;
    setZoom({ on: true, r0: clampW(r0), c0: clampW(c0) });
  };

  /** Put the piece on square `at`: a legal spot covering it if there is one (trying other orientations when `search`). */
  const putAt = (piece: number, t: number, at: number, search: boolean, zoomIn: boolean) => {
    let bestT = t;
    let spot = snapPlacement(x, piece, t, at);
    if (search && checkCells(x, placementCells(n, { piece, t, ...spot }))) {
      for (const t2 of orientationsFrom(t).slice(1)) {
        const s2 = snapPlacement(x, piece, t2, at);
        if (!checkCells(x, placementCells(n, { piece, t: t2, ...s2 }))) {
          bestT = t2;
          spot = s2;
          break;
        }
      }
    }
    setSel({ piece, t: bestT });
    setPivot({ ...spot, at });
    const box = pieceBox(piece, bestT);
    if (zoomIn || zoomed) follow(spot.r, spot.c, box.h, box.w, zoomed);
  };

  const onCell = (cell: number) => {
    if (out) return;
    haptic.tap();
    const needZoom = small && !zoomed;
    if (sel) putAt(sel.piece, sel.t, cell, true, needZoom);
    else {
      setPivot({ r: Math.floor(cell / n), c: cell % n, at: cell });
      if (needZoom) follow(Math.floor(cell / n), cell % n, 1, 1, false);
    }
  };

  const onPiece = (piece: number) => {
    haptic.tap();
    if (sel?.piece === piece) {
      setSel(null);
      return;
    }
    const t = 0;
    // a touched square (or, for the first piece, the start square) gets the piece straight away
    const at = pivot?.at ?? (x.first ? view.starts[me] : null);
    if (at !== null) putAt(piece, t, at, true, small && !zoomed && x.first);
    else setSel({ piece, t });
  };

  const turn = (f: (t: number) => number) => {
    if (!sel) return;
    haptic.tap();
    const t = f(sel.t);
    if (pos) putAt(sel.piece, t, pos.at, false, false);
    else setSel({ piece: sel.piece, t });
  };

  const nudge = (dr: number, dc: number) => {
    haptic.tap();
    if (sel && pos) {
      const box = pieceBox(sel.piece, sel.t);
      const r = Math.max(0, Math.min(n - box.h, pos.r + dr));
      const c = Math.max(0, Math.min(n - box.w, pos.c + dc));
      const ar = Math.max(0, Math.min(n - 1, Math.floor(pos.at / n) + (r - pos.r)));
      const ac = Math.max(0, Math.min(n - 1, (pos.at % n) + (c - pos.c)));
      setPivot({ r, c, at: ar * n + ac });
      if (zoomed) follow(r, c, box.h, box.w);
    } else if (zoomed) setZoom({ on: true, r0: clampW(zoom.r0 + dr * 3), c0: clampW(zoom.c0 + dc * 3) });
  };

  const confirm = () => {
    if (!sel || !pos || !canPlace) return;
    haptic.medium();
    client.act({ type: 'place', piece: sel.piece, t: sel.t, r: pos.r, c: pos.c });
    setSel(null);
    setPivot(null);
    setZoom({ ...zoom, on: false });
  };

  const toggleZoom = () => {
    haptic.tap();
    if (zoomed) {
      setZoom({ ...zoom, on: false });
      return;
    }
    if (sel && pos) {
      const box = pieceBox(sel.piece, sel.t);
      follow(pos.r, pos.c, box.h, box.w, false);
    } else {
      const focus = pivot?.at ?? hints[0] ?? view.starts[me];
      follow(Math.floor(focus / n), focus % n, 1, 1, false);
    }
  };

  // what to tell the player
  const passedNames = view.passed.filter((i) => i !== me).map((i) => nameOf(h, view, view.seats[i]));
  let status: string;
  let statusColor: string = C.muted;
  if (out) status = view.gone[me] ? 'خرجت من هذه اللعبة' : left.length ? 'لا مكان لأي قطعة من قطعك — تابع الآخرين' : 'وضعت كل قطعك! 🎉';
  else if (myTurn) {
    statusColor = C.yellow;
    if (!sel) status = x.first ? 'اختر قطعة: الأولى تغطي الدائرة بلونك' : 'اختر قطعة من قطعك';
    else if (!pos) status = 'المس مكاناً على اللوحة (النقاط = أركان مسموحة)';
    else if (err) {
      status = PLACE_ERRORS[err];
      statusColor = '#FF8A9B';
    } else {
      status = 'مكان مسموح — اضغط «ضع»';
      statusColor = OK_GREEN;
    }
  } else status = sel ? 'القطعة جاهزة — توضع حين يحلّ دورك' : 'اختيار قطعة وتجهيزها ممكن قبل دورك';

  const piecesShown = trayOrder(left);
  const trayBox = 54;
  const arrows = [
    { k: '←', dr: 0, dc: -1, label: 'يسار' },
    { k: '↑', dr: -1, dc: 0, label: 'فوق' },
    { k: '↓', dr: 1, dc: 0, label: 'تحت' },
    { k: '→', dr: 0, dc: 1, label: 'يمين' },
  ];
  const canArrow = (sel && pos) || zoomed;

  return (
    <>
      <Players room={room} view={view} />
      <View style={{ gap: 2 }}>
        <Txt v="bold" center color={statusColor} numberOfLines={2}>
          {status}
        </Txt>
        {passedNames.length ? (
          <Animated.View key={`p${view.moveNo}`} entering={FadeIn.duration(200)}>
            <Txt v="small" center color={C.muted} numberOfLines={2}>
              لا مكان لقطع {passedNames.join(' و')} — الدور للتالي
            </Txt>
          </Animated.View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Board
          n={n}
          board={view.board}
          starts={view.starts}
          last={view.last?.cells ?? []}
          width={boardW}
          win={win}
          ghost={ghost}
          hints={hints}
          pivot={pivot?.at ?? null}
          hintColor={myColor}
          onCell={out ? undefined : onCell}
        />

        {!out ? (
          <>
            <Row gap={6}>
              <Btn flex size="sm" ghost icon="refresh" label="تدوير" disabled={!sel} onPress={() => turn(rotateT)} />
              <Btn flex size="sm" ghost icon="swap" label="قلب" disabled={!sel} onPress={() => turn(flipT)} />
              {small ? (
                zoomed ? (
                  <Btn flex size="sm" ghost label="الكل" onPress={toggleZoom}>
                    <View style={styles.miniMap}>
                      <View style={[styles.miniWin, { left: (zoom.c0 / n) * 22, top: (zoom.r0 / n) * 22, width: (Z / n) * 22, height: (Z / n) * 22, borderColor: myColor }]} />
                    </View>
                    <Txt style={{ fontFamily: F.black, fontSize: 14, lineHeight: 21 }}>الكل</Txt>
                  </Btn>
                ) : (
                  <Btn flex size="sm" ghost icon="search" label="تكبير" onPress={toggleZoom} />
                )
              ) : null}
            </Row>
            <Row gap={6}>
              <View style={{ flexDirection: 'row', direction: 'ltr', gap: 4 }}>
                {arrows.map((a) => (
                  <Pressable
                    key={a.k}
                    disabled={!canArrow}
                    onPress={() => nudge(a.dr, a.dc)}
                    style={({ pressed }) => [styles.arrow, !canArrow && { opacity: 0.35 }, pressed && { opacity: 0.6 }]}
                    accessibilityLabel={a.label}>
                    <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 24 }}>{a.k}</Txt>
                  </Pressable>
                ))}
              </View>
              <Btn flex size="md" icon="check" label="ضع" color={OK_GREEN} disabled={!canPlace} onPress={confirm} />
            </Row>
            <View style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="tiny" color={C.muted}>
                  {`قطعك: ${pieces(left.length)} (${squares(squaresOf(left))})`}
                </Txt>
                <Txt v="tiny" color={C.dim}>
                  اسحب لترى الباقي
                </Txt>
              </Row>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {piecesShown.map((p) => {
                  const on = sel?.piece === p;
                  const can = fits.has(p);
                  const cell = PIECE_SIZES[p] >= 4 ? 9 : 11;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => onPiece(p)}
                      style={[styles.trayItem, { width: trayBox, height: trayBox }, on && { borderColor: myColor, backgroundColor: alpha(myColor, 0.18) }, !can && { opacity: 0.35 }]}
                      accessibilityLabel={`قطعة: ${squares(PIECE_SIZES[p])}`}>
                      <PieceMini piece={p} t={on && sel ? sel.t : 0} cell={cell} box={trayBox - 6} color={myColor} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </>
        ) : (
          <OthersTrays view={view} h={h} />
        )}
      </View>
    </>
  );
}

/** When you're out: the pieces the others still hold. */
function OthersTrays({ view, h }: { view: BlocksView; h: Helpers }) {
  return (
    <View style={{ gap: 6 }}>
      {view.seats.map((id, i) =>
        view.gone[i] || !view.left[i].length ? null : (
          <View key={id} style={{ gap: 2 }}>
            <Txt v="tiny" color={C.muted}>
              {`${nameOf(h, view, id)}: ${pieces(view.left[i].length)} (${squares(squaresOf(view.left[i]))})`}
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {trayOrder(view.left[i]).map((p) => (
                <PieceMini key={p} piece={p} t={0} cell={6} box={34} color={BLOCKS_COLORS[i]} />
              ))}
            </ScrollView>
          </View>
        ),
      )}
    </View>
  );
}

/** Lobby settings: nothing to choose (the board size follows the number of players; the bots' strength is the room's). */
export function BlocksSettings(_props: { room: RoomView; editable: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt v="small" color={C.muted}>
        لاعبان: لوحة ١٤×١٤ والبداية قرب الوسط. ٣ أو ٤ لاعبين: لوحة ٢٠×٢٠ من الأركان.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  miniMap: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: '#262B63', direction: 'ltr' },
  miniWin: { position: 'absolute', borderWidth: 2, borderRadius: 2 },
  swatch: { width: 10, height: 10, borderRadius: 3, borderWidth: 1.5, borderColor: '#151726' },
  arrow: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderStrong },
  trayItem: { borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'transparent' },
});
