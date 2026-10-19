/** «الشطرنج» — tap a piece, then a highlighted square. The board turns so your pieces are at the bottom. */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BOARD_IMG } from '@/art/assets';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { sqName } from '@/shared/chess';
import type { ChessView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { FadeAside, Glide, Hint, SoftMark, glideMs, nudge, useBoardChange } from './board-motion';
import { DuelBar, winLine } from './duel';
import { helpers } from './helpers';

const LIGHT = '#F3E6C8';
const DARK = '#5E8C6A';
const REASON: Record<string, string> = {
  mate: 'كش مات!',
  stalemate: 'تعادل — لا توجد حركة',
  fifty: 'تعادل — 50 حركة بلا أكل',
  repetition: 'تعادل — تكرار الوضعية',
  material: 'تعادل — لا تكفي القطع للفوز',
  resign: 'انسحاب',
  left: 'مغادرة اللاعب',
};
const img = (pc: string) => BOARD_IMG[`chess-${pc === pc.toUpperCase() ? 'w' : 'b'}${pc.toLowerCase()}`];
const white = (pc: string) => pc === pc.toUpperCase();

/**
 * What moved between two boards, when `prev → board` is exactly the last move: the pieces that glide
 * (to → from; the rook too when castling) and the pieces taken (the square they were on). Null when the
 * boards don't fit the move (two moves arrived together, a reconnect): then nothing animates.
 */
function chessMotion(prev: string[] | null, board: string[], lm: { from: number; to: number } | null) {
  if (!prev || !lm || prev.length !== board.length) return null;
  const mover = prev[lm.from];
  const landed = board[lm.to];
  if (!mover || !landed || board[lm.from] || white(mover) !== white(landed)) return null;
  const glides = new Map<number, number>([[lm.to, lm.from]]);
  const taken: { at: number; pc: string }[] = prev[lm.to] ? [{ at: lm.to, pc: prev[lm.to] }] : [];
  const rest = board.map((_, i) => i).filter((i) => i !== lm.from && i !== lm.to && prev[i] !== board[i]);
  const vacated = rest.filter((i) => prev[i] && !board[i]);
  const filled = rest.filter((i) => !prev[i] && board[i]);
  if (vacated.length + filled.length !== rest.length) return null;
  if (vacated.length === 1 && filled.length === 1 && prev[vacated[0]] === board[filled[0]]) glides.set(filled[0], vacated[0]); // castling
  else if (vacated.length === 1 && !filled.length && !taken.length) taken.push({ at: vacated[0], pc: prev[vacated[0]] }); // en passant
  else if (rest.length) return null;
  return { glides, taken };
}

/** The pieces one side has taken, shown next to the board on that player's side. */
function Taken({ pieces }: { pieces: string[] }) {
  return (
    <Row gap={0} wrap style={{ minHeight: 18, direction: 'ltr', justifyContent: 'center' }}>
      {pieces.map((pc, i) => (
        <Image key={i} source={img(pc)} style={{ width: 18, height: 18 }} contentFit="contain" />
      ))}
    </Row>
  );
}

export function ChessGame({ room, view }: { room: RoomView; view: ChessView }) {
  const h = helpers(room);
  const accent = useAccent();
  const { width } = useWindowDimensions();
  // the board fills the content width (inside the 16 px gutters); squares sit inside its 3 px frame
  const W = Math.min(width - 32, 480);
  const sq = (W - 6) / 8;
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [resign, setResign] = useState(false);
  const lm = view.lastMove;
  const moveKey = `${view.board.join(',')}|${lm ? `${lm.from}-${lm.to}` : ''}`;
  const mv = useBoardChange(moveKey, view.board);
  if (!view.myColor && view.phase === 'play') return <Spectator room={room} />;

  const flip = view.myColor === 'b';
  const myTurn = view.phase === 'play' && view.turn === view.myColor;
  const selMoves = sel !== null ? view.moves.filter((m) => m.from === sel) : [];
  const targets = new Set(selMoves.map((m) => m.to));
  const kingSq = view.check ? view.board.indexOf(view.turn === 'w' ? 'K' : 'k') : -1;
  const me = view.myColor ?? 'w';
  const them = me === 'w' ? 'b' : 'w';
  // the last move took a piece (the server writes «(أكل)» in its log line)
  const tookLast = !!lm && !!view.feed[view.feed.length - 1]?.text.includes('(أكل)');
  const at = (i: number) => {
    const k = flip ? 63 - i : i;
    return { x: (k % 8) * sq, y: Math.floor(k / 8) * sq };
  };
  // the last move, played while the board was on screen: the piece glides, a taken piece fades aside
  const motion = mv.live ? chessMotion(mv.prev, view.board, lm) : null;
  const travel = (from: number, to: number) => Math.hypot(at(from).x - at(to).x, at(from).y - at(to).y) / sq;
  const mainMs = lm ? glideMs(travel(lm.from, lm.to)) : 0;

  const tap = (i: number) => {
    if (!myTurn) return;
    if (sel !== null && targets.has(i)) {
      const options = selMoves.filter((m) => m.to === i);
      if (options.some((m) => m.promo)) setPromo({ from: sel, to: i });
      else {
        haptic.medium();
        h.act('move', { from: sel, to: i });
      }
      setSel(null);
      return;
    }
    if (view.moves.some((m) => m.from === i)) {
      haptic.tap();
      setSel(i === sel ? null : i);
    } else setSel(null);
  };

  const won = view.phase === 'final' && view.winner === view.myColor;
  return (
    <>
      {won ? <Confetti /> : null}
      <DuelBar
        h={h}
        active={view.phase === 'play' ? (view.turn === 'w' ? view.white : view.black) : null}
        slots={(['w', 'b'] as const).map((c) => ({
          id: c === 'w' ? view.white : view.black,
          mark: <Image source={img(c === 'w' ? 'K' : 'k')} style={{ width: 16, height: 16 }} contentFit="contain" />,
          sub: view.phase === 'play' && view.check && view.turn === c ? 'كش!' : c === 'w' ? 'الأبيض' : 'الأسود',
          score: view.score[c === 'w' ? view.white : view.black] ?? 0,
        }))}
      />
      {view.phase === 'final' ? (
        <ResultBanner
          tone={won ? 'good' : view.winner === 'draw' ? 'neutral' : 'bad'}
          art={<GameArt id="chess" size={72} />}
          title={view.winner === 'draw' ? 'تعادل' : won ? 'فزت!' : winLine(h.player(view.winner === 'w' ? view.white : view.black).name)}
          sub={REASON[view.reason ?? ''] ?? ''}
        />
      ) : null}
      <Taken pieces={view.captured[them]} />

      <View style={[styles.board, { width: W, height: W, borderColor: accent }]}>
        {Array.from({ length: 64 }, (_, k) => {
          const i = flip ? 63 - k : k;
          const r = Math.floor(k / 8), c = k % 8;
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const pc = view.board[i];
          const isLast = lm && (lm.from === i || lm.to === i);
          const landed = !!lm && lm.to === i && !!pc;
          const pieceImg = pc ? <Image source={img(pc)} style={{ width: sq * 0.92, height: sq * 0.92 }} contentFit="contain" transition={0} /> : null;
          const glideFrom = mv.fresh ? motion?.glides.get(i) : undefined;
          const taken = motion?.taken.find((t) => t.at === i);
          return (
            <Pressable
              key={i}
              onPress={() => tap(i)}
              accessibilityLabel={`${sqName(i)}${pc ? ' — قطعة' : ''}`}
              style={[styles.sq, { left: c * sq, top: r * sq, width: sq, height: sq, backgroundColor: dark ? DARK : LIGHT }, (landed || glideFrom !== undefined) && { zIndex: 2 }]}>
              {isLast ? <SoftMark key={`last${moveKey}`} animate={mv.fresh} style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#F2C23D', 0.36) }]} /> : null}
              {landed && tookLast ? <SoftMark key={`took${moveKey}`} animate={mv.fresh} delay={mainMs * 0.6} style={[StyleSheet.absoluteFill, styles.took]} /> : null}
              {sel === i ? <Hint style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#F2C23D', 0.65) }]} /> : null}
              {kingSq === i ? <SoftMark key={`check${moveKey}`} animate={mv.fresh} delay={mainMs * 0.6} style={[StyleSheet.absoluteFill, styles.check]} /> : null}
              {taken && lm ? (
                <FadeAside
                  key={`gone${moveKey}`}
                  reduced={!mv.fresh}
                  delay={mainMs * 0.55}
                  drift={nudge(at(lm.from), at(lm.to), sq * 0.2)}
                  style={{ position: 'absolute', left: sq * 0.04, top: sq * 0.04 }}>
                  <Image source={img(taken.pc)} style={{ width: sq * 0.92, height: sq * 0.92 }} contentFit="contain" transition={0} />
                </FadeAside>
              ) : null}
              {glideFrom !== undefined ? (
                <Glide key={`glide${moveKey}`} steps={[{ x: at(glideFrom).x - at(i).x, y: at(glideFrom).y - at(i).y }]} ms={glideMs(travel(glideFrom, i))}>
                  {pieceImg}
                </Glide>
              ) : (
                pieceImg
              )}
              {targets.has(i) ? (
                <Hint style={[pc ? styles.ring : styles.dot, pc ? { width: sq * 0.9, height: sq * 0.9, borderRadius: sq } : { width: sq * 0.28, height: sq * 0.28, borderRadius: sq }]} />
              ) : null}
              {c === 0 ? <Txt style={[styles.coord, { top: 1, left: 3, color: dark ? LIGHT : DARK }]}>{String(8 - Math.floor(i / 8))}</Txt> : null}
              {r === 7 ? <Txt style={[styles.coord, { bottom: 0, right: 3, color: dark ? LIGHT : DARK }]}>{'abcdefgh'[i % 8]}</Txt> : null}
            </Pressable>
          );
        })}
      </View>

      <Taken pieces={view.captured[me]} />

      {view.phase === 'play' ? (
        <Row gap={10}>
          <Txt v="bold" style={{ flex: 1 }} color={C.yellow}>
            {myTurn ? (view.check ? 'كش! احمِ ملكك' : sel === null ? 'اختر قطعة لتحريكها' : 'اختر المربع المضيء') : ''}
          </Txt>
          <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />
        </Row>
      ) : (
        <PlayAgain room={room} />
      )}

      <Modal visible={!!promo} transparent animationType="fade" onRequestClose={() => setPromo(null)}>
        <View style={styles.backdrop}>
          <View style={styles.promo}>
            <Txt v="title" center>
              ترقية الجندي
            </Txt>
            <Row gap={10} center>
              {(['q', 'r', 'b', 'n'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => {
                    if (promo) h.act('move', { from: promo.from, to: promo.to, promo: t });
                    setPromo(null);
                  }}
                  style={styles.promoBtn}
                  accessibilityLabel={{ q: 'وزير', r: 'رخ', b: 'فيل', n: 'حصان' }[t]}>
                  <Image source={img(me === 'w' ? t.toUpperCase() : t)} style={{ width: 56, height: 56 }} contentFit="contain" />
                </Pressable>
              ))}
            </Row>
          </View>
        </View>
      </Modal>
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من الدور؟"
        confirmLabel="انسحب"
        onCancel={() => setResign(false)}
        onConfirm={() => {
          setResign(false);
          h.act('resign');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', borderRadius: 8, overflow: 'hidden', borderWidth: 3, borderColor: '#151726' },
  sq: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  took: { borderWidth: 3, borderColor: alpha('#E2263F', 0.7) },
  check: { backgroundColor: alpha('#E2263F', 0.55), borderRadius: 999 },
  dot: { position: 'absolute', backgroundColor: alpha('#151726', 0.35) },
  ring: { position: 'absolute', borderWidth: 4, borderColor: alpha('#151726', 0.4) },
  coord: { position: 'absolute', fontSize: 9, lineHeight: 12, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  promo: { backgroundColor: C.bg2, borderRadius: 22, padding: 18, gap: 14, borderWidth: 1, borderColor: C.borderStrong },
  promoBtn: { backgroundColor: LIGHT, borderRadius: 14, padding: 4, borderWidth: 2, borderColor: '#151726' },
});
