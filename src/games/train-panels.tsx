/**
 * «قطار المغرب» — the panels around the map: the players (wagons, cards, tickets, route points; never
 * which cards or tickets), the face-up cards and the deck, my hand as coloured stacks, my tickets (a
 * drawer), the ticket choice, the chosen route (pay with which colour?) and the final scoring, step by step.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { SEAT_NAMES, payOptions, type PayOption, type TrainView } from '@/shared/games/train';
import { CITY, COLOR_NAME, ROUTES, ROUTE_POINTS, TICKETS, TRAIN_COLORS, type TrainCard } from '@/shared/train-map';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, CountUp, Podium } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner } from './common';
import { winLine } from './duel';
import type { Helpers } from './helpers';
import { CARD_HEX, CARD_INK, DeckCard, WagonCard, seatColor } from './train-art';
import { TrainBoard } from './train-board';

export const ticketName = (id: number) => `${CITY[TICKETS[id].a].name} – ${CITY[TICKETS[id].b].name}`;
export const routeName = (id: number) => `${CITY[ROUTES[id].a].name} – ${CITY[ROUTES[id].b].name}`;

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

function Stat({ icon, n, label }: { icon: 'train' | 'cards' | 'book'; n: number; label: string }) {
  return (
    <View accessibilityLabel={`${label}: ${n}`} style={styles.stat}>
      <Icon name={icon} size={12} color={C.muted} />
      <Txt v="tiny" color={C.text} style={{ fontSize: 12, lineHeight: 16 }}>
        {num(n)}
      </Txt>
    </View>
  );
}

/** Every player: their wagon colour, wagons left, cards and tickets in hand (counts only), route points. */
export function PlayersBar({ view, h, width }: { view: TrainView; h: Helpers; width: number }) {
  const n = view.order.length;
  // 4 players: two by two; 5: three on the first line when there is room
  const perLine = n <= 3 ? n : n === 4 || width < 300 ? 2 : 3;
  const gap = 6;
  const w = (width - gap * (perLine - 1)) / perLine;
  return (
    <Row wrap gap={gap} style={{ justifyContent: 'center' }}>
      {view.order.map((id) => {
        const p = view.players[id];
        const on = view.turn === id || (view.phase === 'pick' && p.picking);
        const color = seatColor(p.seat);
        return (
          <View key={id} style={[styles.player, { width: w, borderColor: on ? color : 'transparent', backgroundColor: on ? alpha(color, 0.16) : C.surface, opacity: p.gone ? 0.45 : 1 }]}>
            <Row gap={6}>
              <Avatar player={h.player(id)} size={w < 110 ? 20 : 24} ring={color} />
              <Txt v="tiny" style={{ flex: 1, fontSize: w < 110 ? 12 : 13 }} numberOfLines={1}>
                {h.player(id).name}
                {id === h.me ? ' (أنت)' : ''}
              </Txt>
              <Txt v="h3" color={C.yellow} style={{ fontSize: 15, lineHeight: 20 }}>
                {num(p.points)}
              </Txt>
            </Row>
            <Row gap={4} style={{ justifyContent: 'space-between' }}>
              <Stat icon="train" n={p.wagons} label="عربات" />
              <Stat icon="cards" n={p.cards} label="بطاقات" />
              <Stat icon="book" n={p.tickets} label="تذاكر" />
            </Row>
          </View>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* The face-up cards and the deck                                      */
/* ------------------------------------------------------------------ */

/** One face-up card: a new card fades in where one was taken. */
function FaceUp({ card, w, onPress, dim }: { card: TrainCard | null; w: number; onPress?: () => void; dim?: boolean }) {
  // a counter bumped whenever the card here changes (the new one fades in)
  const [was, setWas] = useState(card);
  const [k, setK] = useState(0);
  if (was !== card) {
    setWas(card);
    setK(k + 1);
  }
  if (!card) return <View style={{ width: w, height: Math.round(w * 1.4), borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.border }} />;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`خذ بطاقة ${COLOR_NAME[card]}`}>
      <Animated.View key={k} entering={FadeInDown.duration(260)}>
        <WagonCard card={card} w={w} dim={dim} />
      </Animated.View>
    </Pressable>
  );
}

export function DrawRow({ view, h, width, myTurn }: { view: TrainView; h: Helpers; width: number; myTurn: boolean }) {
  const gap = 6;
  const w = Math.floor(Math.min(dk(66), (width - gap * 5) / 6));
  const drawing = myTurn && (view.step === 'start' || view.step === 'second');
  const second = view.step === 'second';
  return (
    <View style={{ gap: 8 }}>
      <Row gap={gap} style={{ justifyContent: 'center', direction: 'ltr' }}>
        {view.faceUp.map((c, i) => (
          <FaceUp key={i} card={c} w={w} dim={drawing && second && c === 'loco'} onPress={drawing && !(second && c === 'loco') && c ? () => h.act('face', { i }) : undefined} />
        ))}
        <Pressable onPress={drawing && view.deck + view.discard > 0 ? () => h.act('deck') : undefined} disabled={!drawing} accessibilityRole="button" accessibilityLabel="خذ بطاقة من الكومة">
          <DeckCard w={w} count={view.deck} />
        </Pressable>
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* My hand                                                             */
/* ------------------------------------------------------------------ */

export function Hand({ view, width }: { view: TrainView; width: number }) {
  const hand = view.me!.hand;
  const kinds = ([...TRAIN_COLORS, 'loco'] as TrainCard[]).filter((c) => hand[c] > 0);
  const gap = 8;
  const n = Math.max(6, kinds.length);
  const w = Math.floor(Math.min(dk(52), (width - 4 * n - gap * (n - 1)) / n));
  if (!kinds.length)
    return (
      <Txt v="small" color={C.dim} center>
        لا بطاقات في يدك
      </Txt>
    );
  return (
    <Row wrap gap={gap} style={{ justifyContent: 'center', direction: 'ltr' }}>
      {kinds.map((c) => (
        <View key={c} accessibilityLabel={`${COLOR_NAME[c]}: ${hand[c]}`} style={{ paddingTop: 4, paddingRight: 4 }}>
          {/* a stack: one shadow card behind when there are several */}
          {hand[c] > 1 ? <View style={{ position: 'absolute', top: 0, right: 0, width: w, height: Math.round(w * 1.4), borderRadius: 7, backgroundColor: alpha(CARD_HEX[c], 0.55) }} /> : null}
          <WagonCard card={c} w={w} label={false} />
          <Animated.View key={hand[c]} entering={FadeIn.duration(220)} style={[styles.count, { backgroundColor: CARD_INK[c] === '#FFFFFF' ? '#FFFFFF' : C.ink }]}>
            <Txt v="tiny" color={CARD_INK[c] === '#FFFFFF' ? C.ink : '#FFFFFF'} style={{ fontSize: 13, lineHeight: 17 }}>
              {num(hand[c])}
            </Txt>
          </Animated.View>
        </View>
      ))}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

function TicketChip({ id, done, on, onPress, state }: { id: number; done?: boolean; on?: boolean; onPress?: () => void; state?: 'plus' | 'minus' }) {
  const t = TICKETS[id];
  const tone = state === 'minus' ? C.red : done || state === 'plus' ? C.green : C.yellow;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={[styles.ticket, on && { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.14) }]}>
      <View style={[styles.ticketValue, { backgroundColor: alpha(tone, 0.22) }]}>
        <Txt v="h3" color={tone} style={{ fontSize: 15, lineHeight: 20 }}>
          {state === 'minus' ? num(`-${t.value}`) : state === 'plus' ? num(`+${t.value}`) : num(t.value)}
        </Txt>
      </View>
      <Txt v="bold" style={{ flex: 1, fontSize: 14, lineHeight: 21 }} numberOfLines={1}>
        {ticketName(id)}
      </Txt>
      {done ? <Icon name="check" size={16} color={C.green} /> : null}
    </Pressable>
  );
}

/** My tickets, folded: tap one to ring its cities on the map. */
export function TicketDrawer({ view, focus, onFocus }: { view: TrainView; focus: number | null; onFocus: (id: number | null) => void }) {
  const [open, setOpen] = useState(true);
  const mine = view.me!.tickets;
  const done = mine.filter((t) => t.done).length;
  return (
    <View style={styles.drawer}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" style={styles.drawerHead}>
        <Icon name="book" size={18} color={C.yellow} />
        <Txt v="bold" style={{ flex: 1 }}>
          {`تذاكري: ${num(mine.length)}`}
          <Txt v="small" color={C.muted}>{` · المكتملة ${num(done)}`}</Txt>
        </Txt>
        <View style={{ transform: [{ rotate: open ? '90deg' : '-90deg' }] }}>
          <Icon name="chevron" size={16} color={C.muted} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: 6 }}>
          {mine.map((t) => (
            <TicketChip key={t.id} id={t.id} done={t.done} on={focus === t.id} onPress={() => onFocus(focus === t.id ? null : t.id)} />
          ))}
          {mine.length ? (
            <Txt v="tiny" color={C.dim}>
              المس تذكرة لترى مدينتيها على الخريطة. التذكرة الناقصة في النهاية تُطرح قيمتها.
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Choosing tickets: toggle each, then keep (at least `keepMin`). */
export function TicketChoice({ view, h, picked, setPicked }: { view: TrainView; h: Helpers; picked: number[]; setPicked: (ids: number[]) => void }) {
  const me = view.me!;
  const offer = me.offer!;
  const ok = picked.length >= me.keepMin;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.drawer, { borderColor: C.yellow }]}>
      <Txt v="h3">{view.phase === 'pick' ? 'تذاكر رحلاتك الأولى' : 'تذاكر جديدة'}</Txt>
      <Txt v="small" color={C.muted}>
        {me.keepMin >= 2 ? 'احتفظ باثنتين على الأقل. التذكرة المكتملة تضيف قيمتها، والناقصة تطرحها.' : 'احتفظ بواحدة على الأقل، والباقي يعود تحت الكومة.'}
      </Txt>
      {offer.map((id) => {
        const on = picked.includes(id);
        return (
          <Pressable
            key={id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => {
              haptic.tap();
              setPicked(on ? picked.filter((x) => x !== id) : [...picked, id]);
            }}
            style={[styles.ticket, on && { borderColor: C.green, backgroundColor: alpha(C.green, 0.14) }]}>
            <View style={[styles.box, on && { backgroundColor: C.green, borderColor: C.green }]}>{on ? <Icon name="check" size={14} color="#FFFFFF" /> : null}</View>
            <Txt v="bold" style={{ flex: 1, fontSize: 14, lineHeight: 21 }} numberOfLines={1}>
              {ticketName(id)}
            </Txt>
            <Txt v="h3" color={C.yellow} style={{ fontSize: 15, lineHeight: 20 }}>
              {num(TICKETS[id].value)}
            </Txt>
          </Pressable>
        );
      })}
      <Btn size="md" icon="check" color={C.green} disabled={!ok} label={`احتفظ بـ${num(picked.length)}`} onPress={() => h.act('keep', { ids: picked })} />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The chosen route                                                    */
/* ------------------------------------------------------------------ */

function PayLabel({ o }: { o: PayOption }) {
  return (
    <Row gap={4}>
      {o.n > 0 && o.color !== 'loco' ? (
        <>
          <View style={[styles.swatch, { backgroundColor: CARD_HEX[o.color] }]} />
          <Txt v="bold" style={{ fontSize: 14 }}>{`${num(o.n)} ${COLOR_NAME[o.color]}`}</Txt>
        </>
      ) : null}
      {o.n > 0 && o.locos > 0 ? <Txt v="bold">+</Txt> : null}
      {o.locos > 0 ? <Txt v="bold" style={{ fontSize: 14 }}>{`${num(o.locos)} ${o.locos === 1 ? 'قاطرة' : 'قاطرات'}`}</Txt> : null}
    </Row>
  );
}

/** What the chosen route is, who has it, and (my turn) how to pay for it. */
export function RoutePanel({ view, h, id, canClaim, onClose }: { view: TrainView; h: Helpers; id: number; canClaim: boolean; onClose: () => void }) {
  const r = ROUTES[id];
  const owner = view.owners[id];
  const me = view.me;
  const opts = me ? payOptions(me.hand, r) : [];
  let note: string | null = null;
  if (owner) note = owner === h.me ? 'سكتك' : `سكة ${h.player(owner).name}`;
  else if (r.twin !== undefined && view.owners[r.twin] && !view.doubles) note = 'المسار الثاني مغلق: مع 2–3 لاعبين يُستعمل مسار واحد';
  else if (r.twin !== undefined && view.owners[r.twin] === h.me) note = 'المسار الآخر لك: لا يملك اللاعب المسارين معاً';
  else if (me && (view.players[h.me]?.wagons ?? 0) < r.len) note = 'عرباتك لا تكفي';
  else if (me && !opts.length) note = r.color === 'grey' ? `تحتاج ${num(r.len)} بطاقات من لون واحد (والقاطرات تكمّل)` : `تحتاج ${num(r.len)} ${COLOR_NAME[r.color]} (والقاطرات تكمّل)`;
  const colour = r.color === 'grey' ? 'رمادية: أي لون واحد' : COLOR_NAME[r.color];
  return (
    <Animated.View entering={FadeIn.duration(160)} style={[styles.drawer, { borderColor: C.yellow }]}>
      <Row gap={8}>
        <View style={[styles.swatch, { width: 16, height: 16, backgroundColor: CARD_HEX[r.color] }]} />
        <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
          {routeName(id)}
        </Txt>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="إغلاق">
          <Icon name="close" size={18} color={C.muted} />
        </Pressable>
      </Row>
      <Txt v="small" color={C.muted}>{`${num(r.len)} ${r.len === 1 ? 'عربة' : r.len === 2 ? 'عربتان' : 'عربات'} · ${colour} · ${num(ROUTE_POINTS[r.len])} ${ROUTE_POINTS[r.len] === 1 ? 'نقطة' : 'نقاط'}`}</Txt>
      {note ? (
        <Txt v="small" color={owner ? C.text : C.orange}>
          {note}
        </Txt>
      ) : canClaim ? (
        <View style={{ gap: 6 }}>
          <Txt v="tiny" color={C.dim}>
            {opts.length > 1 ? 'بأي لون تدفع؟' : 'الدفع:'}
          </Txt>
          {opts.map((o) => (
            <Pressable key={o.color} onPress={() => h.act('claim', { route: id, color: o.color })} accessibilityRole="button" style={styles.payBtn}>
              <PayLabel o={o} />
              <Txt v="bold" color={C.ink} style={styles.payGo}>
                امتلك
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : me ? (
        <Txt v="tiny" color={C.dim}>
          {view.turn === h.me ? 'أكمل سحب البطاقات أولاً' : 'امتلاك السكك في الدور فقط'}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The end: scoring step by step                                       */
/* ------------------------------------------------------------------ */

const STEP_MS = 2200;

export function TrainFinal({ room, view, h, width }: { room: RoomView; view: TrainView; h: Helpers; width: number }) {
  const f = view.final!;
  // 0 routes · 1 tickets · 2 the longest path · 3 totals
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= 3) return;
    const t = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step]);
  const shown = (id: string) => {
    const r = f.rows[id];
    return r.routes + (step >= 1 ? r.ticketPlus - r.ticketMinus : 0) + (step >= 2 ? r.bonus : 0);
  };
  // the order of the moment (the final ranking only at the end)
  const ids = step >= 3 ? f.ranking : f.ranking.slice().sort((a, b) => shown(b) - shown(a));
  const winners = f.winners;
  const iWon = winners.includes(h.me);
  const title = winners.length > 1 ? 'تعادل في الصدارة' : iWon ? 'الفوز لك!' : winners[0] ? winLine(h.player(winners[0]).name) : 'انتهت الرحلة';
  const STEPS = ['نقاط السكك', 'التذاكر: المكتملة تضيف والناقصة تطرح', `أطول طريق متصل: ${num('+10')}`, 'المجموع'];
  const best = Math.max(0, ...ids.map((id) => f.rows[id].longest));
  return (
    <View style={{ gap: 12 }}>
      {step >= 3 && iWon ? <Confetti /> : null}
      {step >= 3 ? (
        <ResultBanner tone={iWon ? 'good' : 'neutral'} title={title} sub={f.reason === 'left' ? 'مغادرة باقي اللاعبين' : `${num(f.rows[ids[0]]?.total ?? 0)} نقطة`} />
      ) : (
        <View style={styles.stepHead}>
          <Txt v="h2" center>
            حساب النقاط
          </Txt>
          <Txt v="bold" center color={C.yellow}>
            {STEPS[step]}
          </Txt>
        </View>
      )}
      {step >= 3 ? <Podium players={ids.map((id) => h.player(id))} scores={Object.fromEntries(ids.map((id) => [id, f.rows[id].total]))} /> : null}
      <View style={{ gap: 8 }}>
        {ids.map((id) => {
          const r = f.rows[id];
          const seat = view.players[id]?.seat ?? 0;
          return (
            <View key={id} style={[styles.finalRow, step >= 3 && winners.includes(id) && { borderColor: C.yellow }]}>
              <Row gap={8}>
                <Avatar player={h.player(id)} size={30} ring={seatColor(seat)} />
                <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                  {h.player(id).name}
                  {id === h.me ? ' (أنت)' : ''}
                </Txt>
                <Txt v="h2" color={step >= 3 && winners.includes(id) ? C.yellow : C.text}>
                  <CountUp value={shown(id)} />
                </Txt>
              </Row>
              <Row gap={6} wrap>
                <View style={styles.chip}>
                  <Txt v="tiny">{`السكك ${num(r.routes)}`}</Txt>
                </View>
                {step >= 1 ? (
                  <Animated.View entering={FadeIn.duration(250)} style={styles.chip}>
                    <Txt v="tiny" color={r.ticketPlus - r.ticketMinus >= 0 ? C.green : C.red}>{`التذاكر ${num(r.ticketPlus - r.ticketMinus)}`}</Txt>
                  </Animated.View>
                ) : null}
                {step >= 2 ? (
                  <Animated.View entering={FadeIn.duration(250)} style={[styles.chip, r.bonus > 0 && { backgroundColor: alpha(C.yellow, 0.22) }]}>
                    <Txt v="tiny" color={r.bonus ? C.yellow : C.muted}>{`أطول طريق ${num(r.longest)}${r.bonus ? ` (+${num(r.bonus)})` : ''}`}</Txt>
                  </Animated.View>
                ) : null}
              </Row>
              {step >= 1 ? (
                <Animated.View entering={FadeIn.duration(250)} style={{ gap: 4 }}>
                  {r.tickets.map((t) => (
                    <TicketChip key={t.id} id={t.id} done={t.done} state={t.done ? 'plus' : 'minus'} />
                  ))}
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </View>
      {step < 3 ? <Btn size="sm" ghost icon="skip" label="أظهر المجموع" onPress={() => setStep(3)} /> : null}
      {step >= 2 && best > 0 ? (
        <Txt v="tiny" color={C.dim} center>
          {`أطول طريق متصل في الرحلة: ${num(best)} عربة`}
        </Txt>
      ) : null}
      <TrainBoard view={view} width={width} selected={null} />
      {step >= 3 ? <PlayAgain room={room} /> : null}
      <Txt v="tiny" color={C.dim} center>
        {view.order.map((id) => `${h.player(id).name}: ${SEAT_NAMES[view.players[id]?.seat ?? 0]}`).join(' · ')}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  player: { gap: 4, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 7, borderWidth: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { position: 'absolute', bottom: -4, left: -4, minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  drawer: { gap: 8, backgroundColor: C.surface, borderRadius: 14, padding: 10, borderWidth: 2, borderColor: 'transparent' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: C.bg2, borderWidth: 1.5, borderColor: C.border },
  ticketValue: { minWidth: 34, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: alpha('#000000', 0.3) },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 46, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.bg2, borderWidth: 1.5, borderColor: alpha(C.green, 0.6) },
  payGo: { backgroundColor: C.green, color: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  stepHead: { gap: 2, backgroundColor: C.surface, borderRadius: 16, padding: 12 },
  finalRow: { gap: 6, backgroundColor: C.surface, borderRadius: 14, padding: 10, borderWidth: 2, borderColor: 'transparent' },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
});
