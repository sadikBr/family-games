/**
 * «قطار المغرب» — the screen. From the top: the players (wagons, cards, tickets, points), the last-round
 * banner, what to do now, the ticket choice when there is one, the map (tap a route: it lights up and
 * the panel under the map says how to pay for it), the face-up cards and the deck, my hand and my
 * tickets. On a computer the map and the panels sit side by side. The end: the scores step by step.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { TRAIN_SECONDS, TRAIN_WAGONS, type TrainView } from '@/shared/games/train';
import { BOARD_H, CITY, ROUTES, TICKETS } from '@/shared/train-map';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { TrainBoard, boardOpen } from './train-board';
import { DrawRow, Hand, PlayersBar, RoutePanel, TicketChoice, TicketDrawer, TrainFinal } from './train-panels';

function instruction(view: TrainView, h: Helpers): string {
  const name = (id: string | null) => (id ? h.player(id).name : '');
  if (view.phase === 'pick') {
    if (view.me?.offer) return 'اختر تذاكر رحلاتك الأولى';
    const wait = view.order.filter((id) => view.players[id].picking).map(name);
    return `في انتظار اختيار التذاكر: ${wait.join('، ')}`;
  }
  const mine = view.turn === h.me;
  if (!mine) return view.step === 'second' ? `دور ${name(view.turn)}: البطاقة الثانية` : view.step === 'tickets' ? `دور ${name(view.turn)}: اختيار تذاكر` : `دور ${name(view.turn)}`;
  if (view.step === 'second') return 'خذ بطاقة ثانية (لا تؤخذ القاطرة المكشوفة الآن)';
  if (view.step === 'tickets') return 'اختر من التذاكر الجديدة';
  return 'دورك: خذ بطاقتين، أو امتلك سكة من الخريطة، أو اسحب تذاكر';
}

export function TrainGame({ room, view }: { room: RoomView; view: TrainView }) {
  const h = helpers(room);
  const width = useContentWidth();
  // the route I tapped (kept while it stays the same turn), the ticket I'm looking at, the tickets I'm keeping
  const [selState, setSel] = useState<{ id: number } | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [pickedState, setPicked] = useState<{ key: string; ids: number[] } | null>(null);

  if (view.phase === 'final' && view.final) return <TrainFinal room={room} view={view} h={h} width={Math.min(width, dk(520))} />;

  const me = view.me;
  const mine = !!me && view.phase === 'play' && view.turn === h.me;
  const wide = width >= 700;
  const mapW = wide ? Math.min(Math.round(width * 0.56), dk(520)) : Math.min(width, dk(520));
  const sideW = wide ? width - mapW - 16 : width;

  const sel = selState?.id ?? null;
  const offerKey = me?.offer ? `${view.turnNo}:${me.offer.join(',')}` : '';
  const picked = pickedState && pickedState.key === offerKey ? pickedState.ids : (me?.offer ?? []);
  const canClaim = mine && view.step === 'start' && sel !== null && boardOpen(view, sel, h.me);

  // rings on the map: the tickets on offer, the ticket I'm looking at, my open and completed tickets
  const ring = (ids: number[]) => ids.flatMap((id) => [TICKETS[id].a, TICKETS[id].b]);
  const marks = {
    cities: me?.offer ? ring(picked.length ? picked : me.offer) : focus !== null ? ring([focus]) : [],
    soft: me ? ring(me.tickets.filter((t) => !t.done).map((t) => t.id)) : [],
    done: me ? ring(me.tickets.filter((t) => t.done).map((t) => t.id)) : [],
  };

  const lr = view.lastRound;
  const banner = lr ? (
    <Animated.View entering={FadeIn.duration(300)} style={styles.banner}>
      <Txt v="bold" center color={C.ink}>
        {lr.left.includes(h.me) ? 'الجولة الأخيرة: هذا آخر دور لك' : 'الجولة الأخيرة'}
      </Txt>
      <Txt v="tiny" center color={alpha(C.ink, 0.8)}>
        {`بقي ${num(view.players[lr.by]?.wagons ?? 0)} عربات مع ${h.player(lr.by).name} · ما زال: ${lr.left.map((id) => h.player(id).name).join('، ') || '—'}`}
      </Txt>
    </Animated.View>
  ) : null;

  // what to do: on my turn, or while waiting for the others' first tickets (the turn bar says the rest)
  const showStatus = mine || (view.phase === 'pick' && !me?.offer);
  const status = !showStatus ? null : (
    <View style={[styles.status, (mine || !!me?.offer) && { borderColor: C.yellow }]}>
      <Txt v="bold" color={mine || me?.offer ? C.yellow : C.text} numberOfLines={2}>
        {instruction(view, h)}
      </Txt>
      {view.total > 0 && view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={mine || !!me?.offer} /> : null}
    </View>
  );

  const panel = sel !== null ? <RoutePanel view={view} h={h} id={sel} canClaim={canClaim} onClose={() => setSel(null)} /> : null;
  // on a phone the panel floats over the half of the map away from the route (no scrolling to pay)
  const lowRoute = sel !== null && (CITY[ROUTES[sel].a].y + CITY[ROUTES[sel].b].y) / 2 > BOARD_H / 2;
  const map = (
    <View style={{ gap: 8 }}>
      <View>
        <TrainBoard view={view} width={mapW} selected={sel} marks={marks} onRoute={(id) => setSel(sel === id ? null : { id })} />
        {!wide && panel ? <View style={[styles.float, lowRoute ? { top: 8 } : { bottom: 8 }]}>{panel}</View> : null}
      </View>
      {sel === null ? (
        <Txt v="tiny" color={C.dim} center>
          {mine && view.step === 'start' ? 'المس سكة على الخريطة لتمتلكها' : 'المس سكة لترى طولها ونقاطها'}
        </Txt>
      ) : null}
    </View>
  );

  const side = (
    <View style={{ gap: 12 }}>
      {wide ? panel : null}
      {view.phase === 'play' ? (
        <View style={{ gap: 8 }}>
          <DrawRow view={view} h={h} width={sideW} myTurn={mine} />
          <Row gap={8}>
            <Txt v="tiny" color={C.dim} style={{ flex: 1 }} numberOfLines={2}>
              {`القاطرة المكشوفة بطاقتان · المهملة ${num(view.discard)}`}
            </Txt>
            <Btn
              size="sm"
              ghost
              icon="book"
              label={`3 تذاكر (${num(view.ticketDeck)})`}
              disabled={!mine || view.step !== 'start' || view.ticketDeck === 0}
              onPress={() => h.act('tickets')}
            />
          </Row>
        </View>
      ) : null}
      {me ? (
        <View style={{ gap: 6 }}>
          <Txt v="h3">{`بطاقاتك · عرباتك ${num(view.players[h.me]?.wagons ?? 0)}`}</Txt>
          <Hand view={view} width={sideW} />
        </View>
      ) : null}
      {me && me.tickets.length ? <TicketDrawer view={view} focus={focus} onFocus={setFocus} /> : null}
      {!me ? <Spectator room={room} /> : null}
    </View>
  );

  const choice = me?.offer ? <TicketChoice view={view} h={h} picked={picked} setPicked={(ids) => setPicked({ key: offerKey, ids })} /> : null;

  return (
    <View style={{ gap: 12 }}>
      <PlayersBar view={view} h={h} width={width} />
      {banner}
      {status}
      {wide ? (
        <Row gap={16} style={{ alignItems: 'flex-start' }}>
          {map}
          <View style={{ width: sideW, gap: 12 }}>
            {choice}
            {side}
          </View>
        </Row>
      ) : (
        <>
          {choice}
          {map}
          {side}
        </>
      )}
    </View>
  );
}

/** Lobby settings: wagons per player, time per turn. */
export function TrainSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.train;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'train', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">العربات لكل لاعب</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.wagons)}
        onChange={(v) => change({ wagons: Number(v) })}
        options={TRAIN_WAGONS.map((w) => ({ key: String(w), label: w === 30 ? '30 (رحلة قصيرة)' : String(w) }))}
      />
      <Txt v="bold">الوقت لكل دور</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.seconds)}
        onChange={(v) => change({ seconds: Number(v) })}
        options={TRAIN_SECONDS.map((t) => ({ key: String(t), label: t ? `${t} ث` : 'بدون وقت' }))}
      />
      <Txt v="tiny" color={C.muted}>
        عندما ينتهي الوقت تُسحب بطاقتان من الكومة تلقائياً. مع 2–3 لاعبين يُستعمل مسار واحد فقط من كل سكة مزدوجة.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 2, borderColor: 'transparent' },
  float: { position: 'absolute', left: 8, right: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  banner: { backgroundColor: C.yellow, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
});
