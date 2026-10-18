/**
 * «المستوطنون» — the screen. From the top: every player's status (points, cards, development cards,
 * knights, road length, the two titles), whose turn it is and what to do, the island (only the legal
 * spots light up; tap one, then confirm — or tap it again), the actions of the moment (roll, build,
 * trade, the robber, discarding), my cards, my development cards and the last events.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BOARD_IMG } from '@/art/assets';
import { client } from '@/lib/client';
import type { CatanView } from '@/shared/games/catan';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti, Podium, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { SEAT_NAMES } from './catan-art';
import { CatanBoard, boardHeight, type Target, type TargetKind } from './catan-board';
import { BankSheet, BuildRow, DevPanel, DiscardPanel, Hand, LogList, OfferSheet, PlayersPanel, SeatDot, TradeIn, TradeOut, namer, type BuildKind, type Namer } from './catan-panels';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { winLine } from './duel';
import { helpers, type Helpers } from './helpers';

const ZOOM = 1.7;

const PIECE_LABEL: Record<TargetKind, string> = { settle: 'القرية', city: 'المدينة', road: 'الطريق', hex: 'اللص' };

function DiceFaces({ dice, dim }: { dice: [number, number] | null; dim?: boolean }) {
  if (!dice) return null;
  return (
    <Row gap={2} style={{ opacity: dim ? 0.45 : 1, direction: 'ltr' }}>
      {dice.map((d, i) => (
        <Image key={i} source={BOARD_IMG[`dice3d-${d}`]} style={{ width: 28, height: 28 }} contentFit="contain" />
      ))}
    </Row>
  );
}

/** One line telling everyone what's going on and what I should do. */
function instruction(view: CatanView, h: Helpers, nm: Namer, mode: BuildKind | null): string {
  const mine = view.turn === h.me;
  const who = nm(view.turn);
  switch (view.phase) {
    case 'setup': {
      const s = view.setup!;
      if (mine) return s.need === 'settlement' ? `ضع قريتك ${s.round === 1 ? 'الأولى' : 'الثانية'}: اختر تقاطعاً مضيئاً` : 'ضع طريقاً بجانب قريتك';
      return `${who}: وضع ${s.need === 'settlement' ? 'قرية' : 'طريق'}`;
    }
    case 'roll':
      return mine ? 'ارمِ النرد' : `${who}: رمي النرد`;
    case 'discard': {
      if (view.discard[h.me]) return 'ظهر 7: أعِد نصف بطاقاتك';
      const names = Object.keys(view.discard).map((id) => nm(id));
      return `ظهر 7: ننتظر ${names.join(' و')}`;
    }
    case 'robber':
      return mine ? 'انقل اللص: اختر أرضاً مضيئة' : `${who}: نقل اللص`;
    case 'steal':
      return mine ? 'اختر من تسرق منه بطاقة' : `${who}: اختيار بطاقة للسرقة`;
    case 'roads':
      return mine ? `ضع ${view.freeRoads === 1 ? 'طريقاً مجانياً' : `${num(view.freeRoads)} طرق مجانية`}` : `${who}: بناء طرق مجانية`;
    case 'main':
      if (!mine) return `${who}: تجارة وبناء`;
      if (mode) return `اختر مكان ${mode === 'road' ? 'الطريق' : mode === 'settle' ? 'القرية' : 'المدينة'} على الخريطة`;
      return 'تاجر وابنِ بأي ترتيب، ثم أنهِ دورك';
    default:
      return '';
  }
}

function Final({ room, view, h, nm, width }: { room: RoomView; view: CatanView; h: Helpers; nm: Namer; width: number }) {
  const f = view.final!;
  const players = view.order.map((id) => ({ ...h.player(id), name: nm(id) }));
  const scores = Object.fromEntries(view.order.map((id) => [id, f.rows[id]?.total ?? 0]));
  const ranked = view.order.slice().sort((a, b) => scores[b] - scores[a]);
  return (
    <>
      {f.winner === h.me ? <Confetti /> : null}
      <ResultBanner
        tone={f.winner === h.me ? 'good' : f.winner ? 'bad' : 'neutral'}
        title={f.winner ? (f.winner === h.me ? 'فزت!' : winLine(nm(f.winner))) : 'انتهت اللعبة'}
        sub={f.reason === 'left' ? 'مغادرة باقي اللاعبين' : `الوصول إلى ${num(scores[f.winner ?? ''] ?? view.target)} نقاط`}
      />
      <Podium players={players} scores={scores} />
      <View style={{ gap: 8 }}>
        {ranked.map((id) => {
          const r = f.rows[id];
          const seat = view.order.indexOf(id);
          const parts = [
            { l: 'من القرى', v: r.settlements },
            { l: 'من المدن', v: r.cities * 2 },
            { l: 'بطاقات النصر', v: r.vpCards },
            { l: 'أطول طريق', v: r.longest },
            { l: 'أكبر جيش', v: r.army },
          ];
          return (
            <View key={id} style={[styles.finalRow, f.winner === id && { borderColor: C.yellow }]}>
              <Row gap={8}>
                <Avatar player={h.player(id)} size={30} ring={undefined} />
                <SeatDot seat={seat} />
                <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                  {nm(id)}
                  {id === h.me ? ' (أنت)' : ''}
                </Txt>
                <Txt style={{ fontFamily: F.black, fontSize: 22, lineHeight: 30, color: f.winner === id ? C.yellow : C.text }}>{num(r.total)}</Txt>
              </Row>
              <Row gap={6} wrap>
                {parts.map((p) => (
                  <View key={p.l} style={[styles.chip, p.v > 0 && { backgroundColor: alpha(C.green, 0.22) }]}>
                    <Txt v="tiny" color={p.v > 0 ? C.text : C.dim}>
                      {p.l} {num(p.v)}
                    </Txt>
                  </View>
                ))}
              </Row>
              <Txt v="tiny" color={C.dim}>
                {`القرى: ${num(r.settlements)} (نقطة لكل قرية) · المدن: ${num(r.cities)} (نقطتان لكل مدينة)`}
              </Txt>
            </View>
          );
        })}
      </View>
      <CatanBoard view={view} width={width} kind={null} ids={[]} sel={null} mySeat={view.me?.seat ?? 0} />
      <PlayAgain room={room} />
    </>
  );
}

export function CatanGame({ room, view }: { room: RoomView; view: CatanView }) {
  const h = helpers(room);
  const nm = namer(h, view);
  const width = useContentWidth();
  const [pickState, setPick] = useState<{ at: string; t: Target } | null>(null);
  const [modeState, setModeState] = useState<{ turn: number; m: BuildKind } | null>(null);
  const [sheetState, setSheetState] = useState<{ turn: number; s: 'bank' | 'offer' } | null>(null);
  const [zoom, setZoom] = useState(false);

  if (view.phase === 'final' && view.final) return <Final room={room} view={view} h={h} nm={nm} width={width} />;

  const me = view.me;
  const mine = !!me && view.turn === h.me;
  const at = `${view.turnNo}|${view.phase}|${view.setup?.need ?? ''}|${view.setup?.at ?? ''}|${view.freeRoads}`;
  const mode = mine && view.phase === 'main' && modeState?.turn === view.turnNo ? modeState.m : null;
  const sheet = mine && view.phase === 'main' && sheetState?.turn === view.turnNo ? sheetState.s : null;
  const setMode = (m: BuildKind | null) => {
    setModeState(m ? { turn: view.turnNo, m } : null);
    setPick(null);
  };
  const setSheet = (s: 'bank' | 'offer' | null) => setSheetState(s ? { turn: view.turnNo, s } : null);

  // what can be tapped on the board now
  let kind: TargetKind | null = null;
  let ids: number[] = [];
  if (me && mine) {
    const L = me.legal;
    if (view.phase === 'setup') {
      kind = view.setup?.need === 'settlement' ? 'settle' : 'road';
      ids = kind === 'settle' ? L.settlements : L.roads;
    } else if (view.phase === 'robber') {
      kind = 'hex';
      ids = L.hexes;
    } else if (view.phase === 'roads') {
      kind = 'road';
      ids = L.roads;
    } else if (view.phase === 'main' && mode) {
      kind = mode;
      ids = mode === 'road' ? L.roads : mode === 'settle' ? L.settlements : L.cities;
    }
  }
  const pick = pickState && pickState.at === at && pickState.t.kind === kind && ids.includes(pickState.t.id) ? pickState.t : null;

  const confirm = (t: Target) => {
    if (t.kind === 'settle') h.act('settle', { v: t.id });
    else if (t.kind === 'city') h.act('city', { v: t.id });
    else if (t.kind === 'road') h.act('road', { e: t.id });
    else h.act('robber', { h: t.id });
    setPick(null);
    if (view.phase === 'main') setModeState(null);
  };
  const onTarget = (t: Target) => {
    if (pick && pick.kind === t.kind && pick.id === t.id) confirm(t);
    else setPick({ at, t });
  };

  const myDiscard = me ? (view.discard[h.me] ?? 0) : 0;
  const tradeIn = view.trade && me && view.trade.from !== h.me ? view.trade : null;
  const tradeOut = view.trade && view.trade.from === h.me ? view.trade : null;
  const bw = zoom ? Math.round(width * ZOOM) : width;
  const knightReady = !!me && !view.devPlayed && me.devs.some((d) => d.k === 'knight' && !d.fresh);
  const waitingOnMe = mine || myDiscard > 0 || (!!tradeIn && !(h.me in tradeIn.answers));

  const board = (
    <CatanBoard view={view} width={bw} kind={kind} ids={ids} sel={pick} mySeat={me?.seat ?? 0} onTarget={onTarget}>
      <ThrownDice values={view.dice} rollId={view.rollId} width={bw} height={boardHeight(bw)} size={Math.min(64, bw * 0.13)} linger={1600} />
    </CatanBoard>
  );

  return (
    <>
      <PlayersPanel view={view} h={h} nm={nm} width={width} />

      <View style={[styles.turnBar, waitingOnMe && { borderColor: C.yellow }]}>
        <Row gap={8}>
          {view.turn ? <SeatDot seat={view.order.indexOf(view.turn)} size={14} /> : null}
          <Txt v="bold" color={waitingOnMe ? C.yellow : C.text} style={{ flex: 1 }} numberOfLines={2}>
            {instruction(view, h, nm, mode)}
          </Txt>
          <DiceFaces dice={view.dice} dim={view.phase === 'roll'} />
        </Row>
        {view.total > 0 && view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={waitingOnMe} /> : null}
      </View>

      {tradeIn ? <TradeIn view={view} h={h} nm={nm} /> : null}
      {myDiscard > 0 ? <DiscardPanel view={view} h={h} need={myDiscard} width={width} /> : null}

      <View style={{ gap: 6 }}>
        {zoom ? (
          <ScrollView horizontal style={{ width, direction: 'ltr' }} contentContainerStyle={{ width: bw }} contentOffset={{ x: (bw - width) / 2, y: 0 }} showsHorizontalScrollIndicator={false}>
            {board}
          </ScrollView>
        ) : (
          board
        )}
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Btn size="sm" ghost icon="search" label={zoom ? 'تصغير' : 'تكبير'} onPress={() => setZoom(!zoom)} />
          <Txt v="tiny" color={C.dim} style={{ flex: 1 }} numberOfLines={2}>
            {`${me ? `لونك ${SEAT_NAMES[me.seat]} · ` : ''}بطاقات التطوير الباقية: ${num(view.deck)}`}
          </Txt>
        </Row>
      </View>

      {pick ? (
        <Animated.View entering={FadeIn.duration(150)} style={styles.confirm}>
          <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
            {pick.kind === 'hex' ? 'انقل اللص إلى هنا؟' : `${PIECE_LABEL[pick.kind]} هنا؟`}
          </Txt>
          <Btn size="sm" ghost label="إلغاء" onPress={() => setPick(null)} />
          <Btn size="sm" color={C.green} icon="check" label="تأكيد" onPress={() => confirm(pick)} />
        </Animated.View>
      ) : null}

      {!me ? <Spectator room={room} /> : null}

      {me && mine && view.phase === 'roll' ? (
        <View style={{ gap: 6 }}>
          <Btn size="lg" icon="refresh" color={C.yellow} label="ارمِ النرد" onPress={() => h.act('roll')} />
          {knightReady ? (
            <Txt v="tiny" center color={C.muted}>
              يمكنك لعب الفارس قبل الرمي (من بطاقات التطوير بالأسفل)
            </Txt>
          ) : null}
        </View>
      ) : null}

      {me && mine && view.phase === 'steal' ? (
        <Card style={{ gap: 8 }}>
          <Txt v="h3">اسرق بطاقة من:</Txt>
          {view.victims.map((id) => (
            <Btn key={id} size="md" ghost onPress={() => h.act('steal', { p: id })}>
              <Row gap={8}>
                <Avatar player={h.player(id)} size={26} />
                <Txt v="bold">{nm(id)}</Txt>
                <Txt v="tiny" color={C.muted}>
                  {num(view.players[id].cards)} بطاقة
                </Txt>
              </Row>
            </Btn>
          ))}
        </Card>
      ) : null}

      {me && mine && view.phase === 'roads' ? <Btn size="sm" ghost label="توقّف عن بناء الطرق المجانية" onPress={() => h.act('stopRoads')} /> : null}

      {me && mine && view.phase === 'main' ? (
        <View style={{ gap: 8 }}>
          <BuildRow
            view={view}
            mode={mode}
            width={width}
            onMode={(m) => {
              setSheet(null);
              setMode(m);
            }}
            onBuy={() => h.act('buy')}
          />
          {tradeOut ? (
            <TradeOut view={view} h={h} nm={nm} />
          ) : sheet === 'bank' ? (
            <BankSheet view={view} act={h.act} onClose={() => setSheet(null)} />
          ) : sheet === 'offer' ? (
            <OfferSheet view={view} act={h.act} width={width} onClose={() => setSheet(null)} />
          ) : (
            <Row gap={8}>
              <Btn
                flex
                size="sm"
                ghost
                icon="bank"
                label="البنك والموانئ"
                onPress={() => {
                  setMode(null);
                  setSheet('bank');
                }}
              />
              <Btn
                flex
                size="sm"
                ghost
                icon="users"
                label="تبادل مع لاعب"
                onPress={() => {
                  setMode(null);
                  setSheet('offer');
                }}
              />
            </Row>
          )}
          <Btn size="md" icon="next" label="أنهِ دورك" onPress={() => h.act('end')} />
        </View>
      ) : null}

      {me ? (
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3">بطاقاتك</Txt>
            <Txt v="tiny" color={C.muted}>
              {`نقاطك ${num(me.vp)} من ${num(view.target)}`}
            </Txt>
          </Row>
          <Hand hand={me.hand} width={width} />
        </View>
      ) : null}

      {me ? <DevPanel view={view} h={h} /> : null}

      <LogList view={view} me={h.me} nm={nm} count={7} />
    </>
  );
}

/** Lobby settings: board, points to win, time per turn. */
export function CatanSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.catan;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'catan', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الخريطة</Txt>
      <ChipPicker
        editable={editable}
        value={s.layout}
        onChange={(v) => change({ layout: v })}
        options={[
          { key: 'random', label: 'عشوائية' },
          { key: 'beginner', label: 'لوحة المبتدئين' },
        ]}
      />
      <Txt v="bold">نقاط الفوز</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.target) as '8' | '10' | '12'}
        onChange={(v) => change({ target: Number(v) })}
        options={[
          { key: '8', label: '8' },
          { key: '10', label: '10' },
          { key: '12', label: '12' },
        ]}
      />
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
        عندما ينتهي الوقت يُرمى النرد ويُنهى الدور تلقائياً. في الخريطة العشوائية لا يتجاور الرقمان الأحمران 6 و8 أبداً.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  turnBar: { gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 2, borderColor: 'transparent' },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg2, borderRadius: 14, padding: 8, borderWidth: 2, borderColor: C.yellow },
  finalRow: { gap: 6, backgroundColor: C.surface, borderRadius: 14, padding: 10, borderWidth: 2, borderColor: 'transparent' },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
});
