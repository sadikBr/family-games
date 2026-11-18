/** «الطاولة» — the screen (players, the board, the dice and the turn's buttons) and the lobby settings. */
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { TAWLA_MATCH, type TawlaSide, type TawlaView, type TawlaWinKind } from '@/shared/games/tawla';
import type { RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk, isDesktopSize } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { DuelBar, li, winLine } from './duel';
import { helpers } from './helpers';
import { DieFace, LOOK, TawlaBoard } from './tawla-board';

const KIND: Record<TawlaWinKind, string> = { 1: 'فوز عادي: نقطة واحدة', 2: 'مارس: نقطتان', 3: 'مارس كبير: ثلاث نقاط' };

/** «نقطة واحدة»، «نقطتان»، «٣ نقاط» */
export const pointsText = (n: number) => (n === 1 ? 'نقطة واحدة' : n === 2 ? 'نقطتان' : `${num(n)} نقاط`);

/** «١٦٧ خطوة»، «٥ خطوات» */
const stepsText = (n: number) => (n >= 3 && n <= 10 ? `${num(n)} خطوات` : `${num(n)} خطوة`);

function Swatch({ side, size = 12 }: { side: TawlaSide; size?: number }) {
  const look = LOOK[side];
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: look.face, borderWidth: 1.5, borderColor: look.edge }} />;
}

export function TawlaGame({ room, view }: { room: RoomView; view: TawlaView }) {
  const h = helpers(room);
  const content = useContentWidth();
  const { width: winW, height } = useWindowDimensions();
  const [resign, setResign] = useState(false);
  // the picked checker belongs to one moment of the turn: a move, an undo or new dice start over
  const moment = `${view.rollId}:${view.last?.seq ?? 0}:${view.left.join('')}`;
  const [pick, setPick] = useState<{ moment: string; p: number | null }>({ moment: '', p: null });

  if (view.mySide === null && view.phase !== 'final') return <Spectator room={room} />;

  const me = view.mySide;
  const near = view.near;
  const far: TawlaSide = near === 0 ? 1 : 0;
  const myMove = view.phase === 'move' && me === view.turn;
  const targets = view.targets;
  const sources = new Set(targets.map((t) => t.from));
  // one checker to move (the bar, or a single point): picked already
  const auto = sources.size === 1 ? [...sources][0] : null;
  const selected = pick.moment === moment ? pick.p : auto;
  // on a computer the board also fits the window's height, so the turn's buttons stay in view
  const W = Math.min(content, dk(560), isDesktopSize(winW) ? Math.max(420, (height - 390) / 0.84) : Infinity);

  const act = (from: number, to: number) => {
    haptic.tap();
    client.act({ type: 'move', from, to });
    setPick({ moment: '', p: null });
  };
  const choose = (p: number | null) => setPick({ moment, p });
  const onPoint = (p: number) => {
    if (selected !== null && targets.some((t) => t.from === selected && t.to === p)) return act(selected, p);
    if (sources.has(p)) return choose(selected === p && auto === null ? null : p);
    // a place only one checker can reach: go there
    const by = targets.filter((t) => t.to === p);
    if (by.length && new Set(by.map((t) => t.from)).size === 1) return act(by[0].from, p);
    choose(null);
  };
  const onOff = () => {
    if (selected !== null && targets.some((t) => t.from === selected && t.to === 0)) return act(selected, 0);
    const by = targets.filter((t) => t.to === 0);
    if (by.length && new Set(by.map((t) => t.from)).size === 1) act(by[0].from, 0);
  };

  // the line under the players
  let line = '';
  let strong = false;
  if (view.phase === 'opening') {
    const mine = me !== null ? view.opening[me] : null;
    if (view.openTie) line = `تعادل في رمية البداية (${num(view.openTie)}): رمية جديدة`;
    else line = 'رمية البداية: صاحب الرقم الأكبر يبدأ';
    strong = me !== null && mine === null;
  } else if (view.phase === 'move') {
    if (view.stuck) line = me === view.turn ? 'لا حركة ممكنة بهذا الرمي' : `لا حركة ممكنة ${li(h.player(view.seats[view.turn]).name)}`;
    else if (myMove) {
      strong = true;
      if (view.canDone) line = 'انتهت حركات الدور: «تمّ» أو تراجع';
      else if (view.bar[0] > 0) line = 'أدخل الحجر الذي في الوسط أولاً';
      else if (selected !== null) line = 'اختر مكاناً مضيئاً';
      else line = 'اختر حجراً لتحريكه';
    }
  }

  const res = view.gameResult;
  const iWonGame = res !== null && res.winner === me;
  const pts = (side: TawlaSide) => view.points2[view.seats[side]] ?? 0;
  const scoreLine = `النتيجة: ${num(pts(near))} – ${num(pts(far))} · المباراة إلى ${pointsText(view.match)}`;

  return (
    <>
      {view.phase === 'final' && view.winner === me && me !== null ? <Confetti /> : null}
      {view.phase === 'final' ? (
        <ResultBanner
          tone={view.winner === me ? 'good' : 'neutral'}
          art={<DieFace value={6} size={44} />}
          title={view.winner === me ? 'الفوز لك!' : winLine(h.player(view.seats[view.winner ?? 0]).name)}
          sub={view.reason === 'forfeit' ? (view.winner !== me && me !== null ? 'انتهت المباراة بانسحابك' : `انسحاب ${h.player(view.seats[view.winner === 0 ? 1 : 0]).name}`) : `${res ? KIND[res.kind] : ''} — ${num(Math.max(pts(0), pts(1)))} مقابل ${num(Math.min(pts(0), pts(1)))}`}
        />
      ) : null}
      {view.phase === 'between' && res ? (
        <ResultBanner
          tone={iWonGame ? 'good' : 'neutral'}
          title={iWonGame ? 'الجولة لك!' : `الجولة ${li(h.player(view.seats[res.winner]).name)}`}
          sub={`${KIND[res.kind]}\n${scoreLine}`}
        />
      ) : null}

      <DuelBar
        h={h}
        active={view.phase === 'roll' || view.phase === 'move' ? view.seats[view.turn] : null}
        slots={([near, far] as TawlaSide[]).map((side, i) => ({
          id: view.seats[side],
          mark: <Swatch side={side} />,
          sub: view.off[i] === 15 ? 'كل الحجارة خارج اللوحة' : `${stepsText(view.pips[i])}${view.off[i] ? ` · ${num(view.off[i])} خارج` : ''}`,
          score: pts(side),
        }))}
      />
      {view.phase !== 'between' && view.phase !== 'final' ? (
        <Txt v="tiny" center color={C.dim}>
          {view.match > 1 ? `الجولة ${num(view.gameNo)} · المباراة إلى ${pointsText(view.match)}` : 'جولة واحدة'}
        </Txt>
      ) : null}
      {line ? (
        <Txt v="bold" center color={strong ? C.yellow : C.muted}>
          {line}
        </Txt>
      ) : null}

      <TawlaBoard
        view={view}
        W={W}
        selected={myMove ? selected : null}
        targets={targets}
        sources={sources}
        interactive={myMove && targets.length > 0}
        onPoint={onPoint}
        onBar={() => sources.has(25) && choose(25)}
        onOff={onOff}
      />

      {view.phase === 'opening' && me !== null && view.opening[me] === null ? <Btn icon="dice" label="ارمِ النرد" onPress={() => h.act('roll')} /> : null}
      {view.phase === 'roll' && me === view.turn ? <Btn icon="dice" label="ارمِ النرد" onPress={() => h.act('roll')} /> : null}
      {myMove && !view.stuck ? (
        <Row gap={8}>
          <Btn flex size="md" ghost icon="back" label="تراجع" disabled={!view.canUndo} style={view.canUndo ? null : { opacity: 0.5 }} onPress={() => h.act('undo')} />
          <Btn flex size="md" icon="check" label="تمّ" color={C.green} disabled={!view.canDone} onPress={() => h.act('done')} />
        </Row>
      ) : null}
      {view.phase === 'between' ? (
        <View style={{ gap: 8 }}>
          <TimerBar endsAt={view.timerAt} total={9000} />
          {me !== null && !view.ready.includes(h.me) ? <Btn icon="next" label="الجولة التالية" onPress={() => h.act('next')} /> : <Txt center color={C.muted}>في انتظار الخصم…</Txt>}
        </View>
      ) : null}

      {view.phase === 'final' ? (
        <PlayAgain room={room} />
      ) : me !== null ? (
        <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} />
      ) : null}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من المباراة؟"
        message="يذهب الفوز بالمباراة إلى خصمك"
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

/** Lobby settings: the points to win the match. */
export function TawlaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.tawla;
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold">المباراة إلى</Txt>
      <ChipPicker
        options={TAWLA_MATCH.map((n) => ({ key: String(n), label: pointsText(n) }))}
        value={String(settings.match)}
        editable={editable}
        onChange={(v) => client.roomAction({ type: 'settings', game: 'tawla', patch: { match: Number(v) } })}
      />
      <Txt v="small" color={C.muted}>
        الجولة بنقطة، و«مارس» بنقطتين، و«مارس كبير» بثلاث.
      </Txt>
    </View>
  );
}
