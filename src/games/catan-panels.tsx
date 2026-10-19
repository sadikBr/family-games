/**
 * «المستوطنون» — the panels around the board: players' status, my hand, resource pickers, trading
 * (bank, offers to the players, incoming offers), discarding on a 7, development cards and the log.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { CatanDevKind, CatanLog, CatanRes, CatanResMap, CatanView } from '@/shared/games/catan';
import { COST, DEV_NAME, HEX_NAME, RES, RES_NAME, emptyRes, resTotal } from '@/shared/catan-board';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Txt, num } from '@/ui/txt';

import { MiniIcon, RES_COLOR, ResIcon, SEAT_COLORS, SEAT_OUTLINE } from './catan-art';
import type { Spots } from './catan-motion';
import { SoftNumber } from './cards/motion';
import { li } from './duel';
import type { Helpers } from './helpers';

export type Namer = (id: string | null | undefined) => string;

export function namer(h: Helpers, view: CatanView): Namer {
  return (id) => {
    if (!id) return '؟';
    const p = h.players.find((x) => x.id === id);
    return p?.name ?? view.names[id] ?? '؟';
  };
}

export const canPay = (hand: CatanResMap, cost: CatanResMap) => RES.every((r) => hand[r] >= cost[r]);

/** «2 قمح، 1 خشب» */
export function resList(m: Partial<CatanResMap>): string {
  return RES.filter((r) => (m[r] ?? 0) > 0)
    .map((r) => `${num(m[r]!)} ${RES_NAME[r]}`)
    .join('، ');
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */
/* ------------------------------------------------------------------ */

/** One line per event. Nouns, not verbs: we don't know whether a player is a man or a woman («رمية لماما: 8»). */
export function logText(e: CatanLog, view: CatanView, me: string, nm: Namer): string {
  const you = (id: string) => id === me;
  const who = (id: string) => (you(id) ? 'أنت' : nm(id));
  const of = (id: string) => (you(id) ? 'لك' : li(nm(id)));
  const from = (id: string) => (you(id) ? 'منك' : `من ${nm(id)}`);
  switch (e.t) {
    case 'roll':
      return `${you(e.p) ? 'رميتك' : `رمية ${li(nm(e.p))}`}: ${num(e.d[0] + e.d[1])}`;
    case 'gain':
      return `${resList(e.r)} ${of(e.p)}`;
    case 'nothing':
      return 'لم ينتج أحد شيئاً';
    case 'short':
      return `البنك لا يكفي من ${RES_NAME[e.r]}: لم يأخذه أحد`;
    case 'build':
      return `${e.b === 'dev' ? 'بطاقة تطوير جديدة' : e.b === 'road' ? 'طريق جديد' : e.b === 'settlement' ? 'قرية جديدة' : 'مدينة جديدة'} ${of(e.p)}`;
    case 'dev':
      if (e.k === 'knight') return `بطاقة فارس ${from(e.p)}`;
      if (e.k === 'roads') return `بطاقة بناء الطرق ${from(e.p)}`;
      if (e.k === 'plenty') return `الوفرة ${from(e.p)}: ${RES_NAME[e.r!]} و${RES_NAME[e.r2!]}`;
      return `احتكار ${RES_NAME[e.r!]} ${from(e.p)}: ${num(e.n ?? 0)} بطاقة`;
    case 'robber':
      return `نقل اللص إلى ${HEX_NAME[view.hexes[e.h]]}${view.nums[e.h] ? ` ${num(view.nums[e.h]!)}` : ''}: ${who(e.p)}`;
    case 'steal':
      return `سرقة بطاقة ${from(e.from)}${e.r ? ` (${RES_NAME[e.r]})` : ''}: ${who(e.p)}`;
    case 'discard':
      return `إعادة ${num(e.n)} بطاقات إلى البنك: ${who(e.p)}`;
    case 'bank':
      return `مبادلة ${num(e.n)} ${RES_NAME[e.give]} بـ ${RES_NAME[e.get]} مع البنك: ${who(e.p)}`;
    case 'trade':
      return `مبادلة ${resList(e.give)} بـ ${resList(e.get)} ${you(e.with) ? 'معك' : `مع ${nm(e.with)}`}: ${who(e.p)}`;
    case 'longest':
      return e.p ? `أطول طريق ${of(e.p)}` : 'لا أحد يملك أطول طريق الآن';
    case 'army':
      return `أكبر جيش ${of(e.p)}`;
    case 'timeout':
      return you(e.p) ? 'انتهى وقتك: لُعب دورك تلقائياً' : `انتهى وقت ${nm(e.p)}: دور تلقائي`;
    case 'left':
      return `مغادرة ${nm(e.p)} للعبة`;
  }
}

export function LogList({ view, me, nm, count = 6 }: { view: CatanView; me: string; nm: Namer; count?: number }) {
  const items = view.log.slice(-count).reverse();
  if (!items.length) return null;
  return (
    <View style={styles.log}>
      {items.map((e, i) => (
        <Txt key={e.id} v="tiny" color={i === 0 ? C.text : C.muted} numberOfLines={2}>
          {logText(e, view, me, nm)}
        </Txt>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

export function SeatDot({ seat, size = 12 }: { seat: number; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: SEAT_COLORS[seat], borderWidth: 1.5, borderColor: seat === 3 ? '#EDE6D2' : SEAT_OUTLINE[seat] }} />;
}

export function PlayersPanel({ view, h, nm, width, spots }: { view: CatanView; h: Helpers; nm: Namer; width: number; spots?: Spots }) {
  const per = width >= 520 ? 4 : 2;
  const w = (width - (per - 1) * 6) / per;
  return (
    <Row gap={6} wrap>
      {view.order.map((id, seat) => {
        const p = view.players[id];
        const on = view.turn === id;
        const vp = id === h.me && view.me ? view.me.vp : p.vp;
        return (
          <View key={id} style={[styles.player, { width: w }, on && { borderColor: h.player(id).color, backgroundColor: alpha(h.player(id).color, 0.2) }, p.gone && { opacity: 0.45 }]}>
            <Row gap={5}>
              <View>
                <Avatar player={h.player(id)} size={24} ring={SEAT_COLORS[seat]} />
              </View>
              <Txt v="tiny" style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>
                {nm(id)}
                {id === h.me ? ' (أنت)' : ''}
              </Txt>
              <Txt style={{ fontFamily: F.bold, fontSize: 17, lineHeight: 22, color: on ? C.text : C.yellow }}>{num(vp)}</Txt>
            </Row>
            <Row gap={7} style={{ marginTop: 1 }}>
              <SeatDot seat={seat} size={10} />
              {/* where the resources earned by a roll land */}
              <View ref={(n) => spots?.set(`cards:${id}`, n)} style={styles.count}>
                <MiniIcon k="card" size={12} color={p.cards > 7 ? C.orange : C.muted} />
                <SoftNumber
                  value={p.cards}
                  render={(v) => (
                    <Txt v="tiny" color={v > 7 ? C.orange : C.muted}>
                      {num(v)}
                    </Txt>
                  )}
                />
              </View>
              <Row gap={2}>
                <MiniIcon k="dev" size={12} color={C.muted} />
                <Txt v="tiny" color={C.muted}>
                  {num(p.dev)}
                </Txt>
              </Row>
              <Row gap={2}>
                <MiniIcon k={view.army === id ? 'army' : 'knight'} size={12} color={view.army === id ? C.yellow : C.muted} />
                <Txt v="tiny" color={view.army === id ? C.yellow : C.muted}>
                  {num(p.knights)}
                </Txt>
              </Row>
              <Row gap={2}>
                <MiniIcon k="road" size={12} color={view.longest === id ? C.yellow : C.muted} />
                <Txt v="tiny" color={view.longest === id ? C.yellow : C.muted}>
                  {num(p.road)}
                </Txt>
              </Row>
            </Row>
          </View>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

/** My resource cards: one tall card per resource with its count. */
export function Hand({ hand, width, picked, onPick }: { hand: CatanResMap; width: number; picked?: CatanResMap; onPick?: (r: CatanRes) => void }) {
  const w = Math.min(64, (width - 4 * 6) / 5);
  return (
    <Row gap={6} center>
      {RES.map((r) => {
        const n = hand[r];
        const sel = picked?.[r] ?? 0;
        const body = (
          <View style={[styles.card, { width: w, height: w * 1.3, backgroundColor: n ? alpha(RES_COLOR[r], 0.28) : C.surface, borderColor: sel ? C.yellow : n ? alpha(RES_COLOR[r], 0.8) : C.border }]}>
            <ResIcon r={r} size={w * 0.5} />
            <SoftNumber value={n} render={(v) => <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 22, color: v ? C.text : C.dim }}>{num(v)}</Txt>} />
            <Txt v="tiny" color={n ? C.muted : C.dim} style={{ fontSize: 11, lineHeight: 14 }}>
              {RES_NAME[r]}
            </Txt>
            {sel ? (
              <View style={styles.badge}>
                <Txt v="tiny" color={C.ink} style={{ lineHeight: 16 }}>
                  {num(`-${sel}`)}
                </Txt>
              </View>
            ) : null}
          </View>
        );
        return onPick ? (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityLabel={RES_NAME[r]}
            onPress={() => {
              haptic.tap();
              onPick(r);
            }}>
            {body}
          </Pressable>
        ) : (
          <View key={r}>{body}</View>
        );
      })}
    </Row>
  );
}

/** Pick one resource (bank trade, monopoly, year of plenty). */
export function ResChoice({ value, onChange, disabled, note }: { value: CatanRes | null; onChange: (r: CatanRes) => void; disabled?: (r: CatanRes) => boolean; note?: (r: CatanRes) => string }) {
  return (
    <Row gap={5} center>
      {RES.map((r) => {
        const off = disabled?.(r) ?? false;
        const on = value === r;
        return (
          <Pressable
            key={r}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={RES_NAME[r]}
            onPress={() => {
              haptic.tap();
              onChange(r);
            }}
            style={[styles.choice, on && { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.18) }, off && { opacity: 0.35 }]}>
            <ResIcon r={r} size={24} />
            <Txt v="tiny" style={{ fontSize: 11, lineHeight: 14 }}>
              {note ? note(r) : RES_NAME[r]}
            </Txt>
          </Pressable>
        );
      })}
    </Row>
  );
}

/** Choose a number of each resource: tap the card to add one, «−» to take one back. */
export function ResCounter({ value, onChange, max, width }: { value: CatanResMap; onChange: (m: CatanResMap) => void; max?: CatanResMap; width: number }) {
  const w = Math.min(60, (width - 4 * 5) / 5);
  return (
    <Row gap={5} center>
      {RES.map((r) => {
        const n = value[r];
        const lim = max ? max[r] : 9;
        return (
          <View key={r} style={{ width: w, alignItems: 'center', gap: 3 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`أضف ${RES_NAME[r]}`}
              disabled={n >= lim}
              onPress={() => {
                haptic.tap();
                onChange({ ...value, [r]: n + 1 });
              }}
              style={[styles.counter, { width: w, borderColor: n ? C.yellow : C.border }, n >= lim && !n && { opacity: 0.4 }]}>
              <ResIcon r={r} size={22} />
              <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 20, color: n ? C.yellow : C.dim }}>{num(n)}</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`أنقص ${RES_NAME[r]}`}
              disabled={!n}
              onPress={() => {
                haptic.tap();
                onChange({ ...value, [r]: n - 1 });
              }}
              style={[styles.minus, { width: w }, !n && { opacity: 0.3 }]}>
              <Icon name="minus" size={16} color={C.text} />
            </Pressable>
          </View>
        );
      })}
    </Row>
  );
}

/** A small row of cost icons. */
export function CostIcons({ cost, size = 14 }: { cost: CatanResMap; size?: number }) {
  return (
    <Row gap={1} style={{ direction: 'ltr' }}>
      {RES.flatMap((r) => Array.from({ length: cost[r] }, (_, i) => <ResIcon key={`${r}${i}`} r={r} size={size} />))}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Trading                                                             */
/* ------------------------------------------------------------------ */

export function BankSheet({ view, act, onClose }: { view: CatanView; act: (type: string, p?: Record<string, unknown>) => void; onClose: () => void }) {
  const me = view.me!;
  const [give, setGive] = useState<CatanRes | null>(null);
  const [get, setGet] = useState<CatanRes | null>(null);
  const can = (r: CatanRes) => me.hand[r] >= me.ratios[r];
  const g = give && can(give) ? give : null;
  return (
    <View style={styles.sheet}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">التجارة مع البنك</Txt>
        <IconBtn icon="close" size={40} label="أغلق" onPress={onClose} />
      </Row>
      <Txt v="tiny" color={C.muted}>
        أعطِ (الرقم: كم بطاقة مقابل واحدة)
      </Txt>
      <ResChoice value={g} onChange={setGive} disabled={(r) => !can(r)} note={(r) => num(`${me.ratios[r]}:1`)} />
      <Txt v="tiny" color={C.muted}>
        خذ
      </Txt>
      <ResChoice value={get} onChange={setGet} disabled={(r) => r === g || view.bank[r] <= 0} />
      <Btn
        size="md"
        icon="swap"
        color={C.cyan}
        disabled={!g || !get || g === get}
        label={g && get && g !== get ? `بادل ${num(me.ratios[g])} ${RES_NAME[g]} بـ ${RES_NAME[get]}` : 'اختر ما تعطي وما تأخذ'}
        onPress={() => g && get && act('bank', { give: g, get })}
      />
    </View>
  );
}

export function OfferSheet({ view, act, onClose, width }: { view: CatanView; act: (type: string, p?: Record<string, unknown>) => void; onClose: () => void; width: number }) {
  const me = view.me!;
  const [give, setGive] = useState<CatanResMap>(emptyRes());
  const [want, setWant] = useState<CatanResMap>(emptyRes());
  const ok = resTotal(give) > 0 && resTotal(want) > 0 && canPay(me.hand, give) && RES.every((r) => !(give[r] && want[r]));
  return (
    <View style={styles.sheet}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">عرض على اللاعبين</Txt>
        <IconBtn icon="close" size={40} label="أغلق" onPress={onClose} />
      </Row>
      <Txt v="tiny" color={C.muted}>
        أعطي
      </Txt>
      <ResCounter value={give} onChange={setGive} max={me.hand} width={width - 24} />
      <Txt v="tiny" color={C.muted}>
        وأريد
      </Txt>
      <ResCounter value={want} onChange={setWant} width={width - 24} />
      <Btn
        size="md"
        icon="share"
        color={C.cyan}
        disabled={!ok}
        label={ok ? 'أرسل العرض' : 'اختر ما تعطي وما تريد'}
        onPress={() => {
          act('offer', { give, want });
          onClose();
        }}
      />
    </View>
  );
}

function TradeLine({ give, want, giver }: { give: CatanResMap; want: CatanResMap; giver: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Row gap={6}>
        <Txt v="tiny" color={C.muted} style={{ minWidth: 54 }}>
          {giver}
        </Txt>
        <CostIcons cost={give} size={20} />
      </Row>
      <Row gap={6}>
        <Txt v="tiny" color={C.muted} style={{ minWidth: 54 }}>
          مقابل
        </Txt>
        <CostIcons cost={want} size={20} />
      </Row>
    </View>
  );
}

/** My open offer: who accepted, who declined; pick a partner. */
export function TradeOut({ view, h, nm }: { view: CatanView; h: Helpers; nm: Namer }) {
  const t = view.trade!;
  const others = view.order.filter((id) => id !== h.me && !view.players[id].gone);
  return (
    <View style={[styles.sheet, { borderColor: C.cyan }]}>
      <Txt v="h3">عرضك على اللاعبين</Txt>
      <TradeLine give={t.give} want={t.want} giver="أعطي" />
      {others.map((id) => {
        const a = t.answers[id];
        return (
          <Row key={id} gap={8}>
            <Avatar player={h.player(id)} size={26} />
            <Txt v="small" style={{ flex: 1 }} numberOfLines={1}>
              {nm(id)}
            </Txt>
            {a === true ? (
              <Btn size="sm" icon="check" color={C.green} label="بادل" onPress={() => h.act('accept', { id: t.id, p: id })} />
            ) : (
              <Txt v="tiny" color={a === false ? C.red : C.dim}>
                {a === false ? 'رفض' : 'يفكّر…'}
              </Txt>
            )}
          </Row>
        );
      })}
      <Btn size="sm" ghost label="اسحب العرض" onPress={() => h.act('cancel')} />
    </View>
  );
}

/** Someone else's offer, on my phone. */
export function TradeIn({ view, h, nm }: { view: CatanView; h: Helpers; nm: Namer }) {
  const t = view.trade!;
  const mine = t.answers[h.me];
  const can = view.me ? canPay(view.me.hand, t.want) : false;
  return (
    <View style={[styles.sheet, { borderColor: C.cyan }]}>
      <Row gap={8}>
        <Avatar player={h.player(t.from)} size={28} />
        <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
          عرض من {nm(t.from)}
        </Txt>
      </Row>
      <TradeLine give={t.give} want={t.want} giver="يعطيك" />
      {mine === undefined ? (
        <Row gap={8}>
          <Btn flex size="md" ghost label="أرفض" onPress={() => h.act('answer', { id: t.id, yes: false })} />
          <Btn flex size="md" color={C.green} icon="check" disabled={!can} label={can ? 'أقبل' : 'لا تكفي بطاقاتك'} onPress={() => h.act('answer', { id: t.id, yes: true })} />
        </Row>
      ) : (
        <Txt v="small" center color={mine ? C.green : C.muted}>
          {mine ? `قبلتَ — ينتظر قرار ${nm(t.from)}` : 'رفضتَ هذا العرض'}
        </Txt>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Discarding on a 7                                                   */
/* ------------------------------------------------------------------ */

export function DiscardPanel({ view, h, need, width }: { view: CatanView; h: Helpers; need: number; width: number }) {
  const [drop, setDrop] = useState<{ roll: number; m: CatanResMap }>({ roll: view.rollId, m: emptyRes() });
  const m = drop.roll === view.rollId ? drop.m : emptyRes();
  const hand = view.me!.hand;
  const n = resTotal(m);
  return (
    <View style={[styles.sheet, { borderColor: C.orange }]}>
      <Txt v="h3">ظهر 7: أعِد {num(need)} بطاقات</Txt>
      <Txt v="tiny" color={C.muted}>
        لديك أكثر من 7 بطاقات. اضغط على البطاقات التي تعيدها إلى البنك.
      </Txt>
      <Hand
        hand={hand}
        width={width - 24}
        picked={m}
        onPick={(r) => {
          if (m[r] >= hand[r] || n >= need) return;
          setDrop({ roll: view.rollId, m: { ...m, [r]: m[r] + 1 } });
        }}
      />
      <Row gap={8}>
        <Btn flex size="sm" ghost label="من جديد" disabled={!n} onPress={() => setDrop({ roll: view.rollId, m: emptyRes() })} />
        <Btn flex size="md" color={C.orange} disabled={n !== need} label={`أعِد ${num(n)}/${num(need)}`} onPress={() => h.act('discard', { cards: m })} />
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Development cards                                                   */
/* ------------------------------------------------------------------ */

const DEV_HELP: Record<CatanDevKind, string> = {
  knight: 'انقل اللص واسرق بطاقة',
  vp: 'نقطة سرية تُحسب لك',
  roads: 'ابنِ طريقين مجاناً',
  plenty: 'خذ موردين من البنك',
  monopoly: 'خذ مورداً من كل اللاعبين',
};

export function DevPanel({ view, h }: { view: CatanView; h: Helpers }) {
  const me = view.me!;
  const [open, setOpen] = useState<CatanDevKind | null>(null);
  const [r1, setR1] = useState<CatanRes | null>(null);
  const [r2, setR2] = useState<CatanRes | null>(null);
  if (!me.devs.length) return null;
  const myTurn = view.turn === h.me;
  const phaseOk = myTurn && (view.phase === 'roll' || view.phase === 'main') && !view.trade;
  const kinds = (['knight', 'roads', 'plenty', 'monopoly', 'vp'] as CatanDevKind[]).filter((k) => me.devs.some((d) => d.k === k));
  return (
    <View style={styles.sheet}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">بطاقات التطوير</Txt>
        {view.devPlayed && myTurn ? (
          <Txt v="tiny" color={C.dim}>
            لعبتَ بطاقة في هذا الدور
          </Txt>
        ) : null}
      </Row>
      {kinds.map((k) => {
        const all = me.devs.filter((d) => d.k === k);
        const ready = all.filter((d) => !d.fresh).length;
        const playable = k !== 'vp' && phaseOk && !view.devPlayed && ready > 0;
        return (
          <View key={k} style={{ gap: 6 }}>
            <Row gap={8}>
              <View style={[styles.devCard, k === 'vp' && { backgroundColor: alpha(C.yellow, 0.25) }]}>
                <MiniIcon k={k === 'knight' ? 'knight' : k === 'vp' ? 'army' : 'dev'} size={18} color={k === 'vp' ? C.yellow : C.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="bold" numberOfLines={1}>
                  {DEV_NAME[k]} {all.length > 1 ? `×${num(all.length)}` : ''}
                </Txt>
                <Txt v="tiny" color={C.muted} numberOfLines={1}>
                  {all.length > ready && k !== 'vp' ? 'اشتريتها الآن: العبها في دور قادم' : DEV_HELP[k]}
                </Txt>
              </View>
              {k !== 'vp' ? (
                <Btn
                  size="sm"
                  color={C.purple}
                  label="العب"
                  disabled={!playable}
                  onPress={() => {
                    if (k === 'knight' || k === 'roads') h.act('play', { k });
                    else {
                      setOpen(open === k ? null : k);
                      setR1(null);
                      setR2(null);
                    }
                  }}
                />
              ) : null}
            </Row>
            {open === k && playable && k === 'plenty' ? (
              <View style={{ gap: 6 }}>
                <Txt v="tiny" color={C.muted}>
                  المورد الأول
                </Txt>
                <ResChoice value={r1} onChange={setR1} disabled={(r) => view.bank[r] <= 0} />
                <Txt v="tiny" color={C.muted}>
                  المورد الثاني
                </Txt>
                <ResChoice value={r2} onChange={setR2} disabled={(r) => view.bank[r] <= (r === r1 ? 1 : 0)} />
                <Btn size="sm" color={C.purple} disabled={!r1 || !r2} label="خذهما" onPress={() => r1 && r2 && h.act('play', { k, r: r1, r2 })} />
              </View>
            ) : null}
            {open === k && playable && k === 'monopoly' ? (
              <View style={{ gap: 6 }}>
                <Txt v="tiny" color={C.muted}>
                  كل اللاعبين يعطونك كل ما لديهم من هذا المورد
                </Txt>
                <ResChoice value={r1} onChange={setR1} />
                <Btn size="sm" color={C.purple} disabled={!r1} label={r1 ? `احتكر ${RES_NAME[r1]}` : 'اختر مورداً'} onPress={() => r1 && h.act('play', { k, r: r1 })} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

export type BuildKind = 'road' | 'settle' | 'city';

export function BuildRow({ view, mode, onMode, onBuy, width }: { view: CatanView; mode: BuildKind | null; onMode: (m: BuildKind | null) => void; onBuy: () => void; width: number }) {
  const me = view.me!;
  const left = view.players[view.order[me.seat]].left;
  const items: { k: BuildKind | 'dev'; label: string; cost: CatanResMap; ok: boolean; why: string }[] = [
    { k: 'road', label: 'طريق', cost: COST.road, ok: left.road > 0 && me.legal.roads.length > 0, why: left.road > 0 ? 'لا مكان' : 'نفدت' },
    { k: 'settle', label: 'قرية', cost: COST.settlement, ok: left.settlement > 0 && me.legal.settlements.length > 0, why: left.settlement > 0 ? 'لا مكان' : 'نفدت' },
    { k: 'city', label: 'مدينة', cost: COST.city, ok: left.city > 0 && me.legal.cities.length > 0, why: left.city > 0 ? 'لا قرية' : 'نفدت' },
    { k: 'dev', label: 'تطوير', cost: COST.dev, ok: view.deck > 0, why: 'نفدت' },
  ];
  const w = (width - 3 * 6) / 4;
  return (
    <Row gap={6}>
      {items.map((it) => {
        const afford = canPay(me.hand, it.cost);
        const enabled = it.ok && afford;
        const on = mode === it.k;
        return (
          <Pressable
            key={it.k}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityLabel={`ابنِ ${it.label}`}
            onPress={() => {
              haptic.tap();
              if (it.k === 'dev') onBuy();
              else onMode(on ? null : it.k);
            }}
            style={[styles.build, { width: w }, on && { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.18) }, !enabled && { opacity: 0.45 }]}>
            <Txt v="bold" style={{ fontSize: 14, lineHeight: 20 }}>
              {it.label}
            </Txt>
            <CostIcons cost={it.cost} size={Math.min(14, (w - 8) / 5)} />
            <Txt v="tiny" color={enabled ? C.green : C.dim} style={{ fontSize: 10, lineHeight: 13 }}>
              {!it.ok ? it.why : afford ? (it.k === 'dev' ? 'اشترِ' : 'ابنِ') : 'ينقصك'}
            </Txt>
          </Pressable>
        );
      })}
    </Row>
  );
}

const styles = StyleSheet.create({
  count: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  log: { gap: 2, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 8 },
  player: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 7, borderWidth: 1.5, borderColor: C.border },
  card: { borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 0, paddingVertical: 2 },
  badge: { position: 'absolute', top: -6, end: -6, backgroundColor: C.yellow, borderRadius: 9, minWidth: 22, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  choice: { minWidth: 48, minHeight: 50, borderRadius: 10, borderWidth: 2, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  counter: { height: 50, borderRadius: 10, borderWidth: 2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  minus: { height: 34, borderRadius: 9, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  sheet: { gap: 8, backgroundColor: C.bg2, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.borderStrong },
  devCard: { width: 34, height: 44, borderRadius: 8, backgroundColor: alpha(C.purple, 0.35), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderStrong },
  build: { minHeight: 66, borderRadius: 12, borderWidth: 2, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
});
