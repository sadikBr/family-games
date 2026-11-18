/**
 * «الانقلاب» — the screen. From the top: the other players around the table (coins, hidden cards as backs, the
 * cards turned face up, their last claim; the player acting has a gold frame, the one aimed at a red one);
 * the table in the middle (whose turn, the action announced with the role it claims, the block, the window to
 * challenge or block with its timer and my answer buttons, a challenge's result, who is choosing a card); my
 * two cards with their portraits and my coins (tap a card to reveal it when I lose an influence); the actions
 * on my turn (each says which role it claims, and «خدعة» when that card isn't in my hand); the last events;
 * the «مرجع الأدوار» panel; the end with the order of the players.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  ACTION_INFO,
  COUP_ACTIONS,
  COUP_COPIES,
  COUP_FORCE,
  COUP_ROLES,
  COUP_TURN_SECONDS,
  COUP_WINDOW_SECONDS,
  ROLE_INFO,
  type CoupAction,
  type CoupLoseReason,
  type CoupRole,
  type CoupSettings as Settings,
  type CoupView,
} from '@/shared/games/coup';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { CREAM, GOLD, MiniCard, RoleCard, RoleIcon, TapCard } from './coup-art';
import { helpers, type Helpers } from './helpers';
import { winnerTitle } from './islamic-ui';
import { useScreenClock, useSettled } from './touch-motion';

const WINE = '#9C3D54';

/** The usable width (a phone's column; the stage on a computer). */
function useInner() {
  const cw = useContentWidth();
  return Math.min(cw, dk(560));
}

/** «قطعة واحدة»، «قطعتان»، «3 قطع» */
function coinsText(n: number) {
  if (n === 0) return 'لا قطع';
  if (n === 1) return 'قطعة واحدة';
  if (n === 2) return 'قطعتان';
  return n <= 10 ? `${num(n)} قطع` : `${num(n)} قطعة`;
}

const LOSE_TEXT: Record<CoupLoseReason, string> = {
  coup: 'انقلاب',
  inform: 'وشاية',
  caught: 'خدعة مكشوفة',
  wrong: 'تحدٍّ في غير محلّه',
  left: 'مغادرة',
};

export function CoupGame({ room, view }: { room: RoomView; view: CoupView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <CoupFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <CoupTable view={view} h={h} />;
}

function CoupTable({ view, h }: { view: CoupView; h: Helpers }) {
  // a targeted action waiting for its target (only for the step it was chosen on)
  const [picking, setPicking] = useState<{ action: CoupAction; seq: number } | null>(null);
  const [showRef, setShowRef] = useState(false);
  const aim = picking && picking.seq === view.seq ? picking.action : null;
  const myTurn = view.phase === 'turn' && view.turn === h.me;
  const send = (action: CoupAction, target?: string) => {
    haptic.medium();
    setPicking(null);
    h.act('declare', { seq: view.seq, action, ...(target ? { target } : {}) });
  };
  return (
    <>
      <Seats view={view} h={h} />
      <TablePanel view={view} h={h} />
      <MyArea view={view} h={h} compact={myTurn} />
      {myTurn ? (
        aim ? (
          <TargetPicker view={view} h={h} action={aim} onPick={(t) => send(aim, t)} onCancel={() => setPicking(null)} />
        ) : (
          <Actions view={view} h={h} onPick={(a) => (ACTION_INFO[a].target ? setPicking({ action: a, seq: view.seq }) : send(a))} />
        )
      ) : null}
      <LogLines view={view} h={h} />
      <Btn size="sm" ghost icon="book" label={showRef ? 'إخفاء مرجع الأدوار' : 'مرجع الأدوار'} onPress={() => setShowRef((v) => !v)} />
      {showRef ? <RolesRef view={view} /> : null}
      <Txt v="tiny" center color={C.dim}>
        في الرزمة {num(view.deck)} {view.deck === 1 ? 'بطاقة' : view.deck === 2 ? 'بطاقتان' : 'بطاقات'}
        {view.twoPlayer ? ' · لاعبان: بدأ صاحب الدور الأول بقطعة واحدة' : ''}
      </Txt>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The others around the table                                         */
/* ------------------------------------------------------------------ */

function Seats({ view, h }: { view: CoupView; h: Helpers }) {
  const inner = useInner();
  const others = view.players.filter((id) => id !== h.me);
  if (!others.length) return null;
  const gap = 6;
  const per = others.length === 1 ? 1 : inner < 420 ? 2 : 3;
  const w = Math.floor((inner - gap * (per - 1)) / per);
  const p = view.pending;
  const actor = view.phase === 'turn' ? view.turn : (p?.by ?? null);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center' }}>
      {others.map((id) => {
        const seat = view.seats[id];
        const pl = h.player(id);
        const isActor = id === actor;
        const isTarget = !!p && p.target === id && view.phase !== 'turn';
        const ring = isActor ? GOLD : isTarget ? C.red : seat.out ? C.border : C.borderStrong;
        return (
          <View key={id} style={[styles.seat, { width: w, borderColor: ring, backgroundColor: isActor ? alpha(GOLD, 0.1) : isTarget ? alpha(C.red, 0.1) : C.surface, opacity: seat.out ? 0.55 : 1 }]}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <Avatar player={pl} size={30} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="bold" numberOfLines={1} style={{ fontSize: 14, lineHeight: 20 }}>
                  {pl.name}
                </Txt>
                {seat.out ? (
                  <Txt v="tiny" color={C.dim}>
                    خارج القصر
                  </Txt>
                ) : (
                  <Row gap={4} style={{ alignItems: 'center' }}>
                    <Icon name="coins" size={14} color={GOLD} />
                    <Txt style={{ fontFamily: F.black, fontSize: 14, lineHeight: 20, color: GOLD }}>{num(seat.coins)}</Txt>
                  </Row>
                )}
              </View>
              <Row gap={3}>
                {Array.from({ length: seat.hidden }, (_, i) => (
                  <MiniCard key={`h${i}`} role={null} />
                ))}
                {seat.revealed.map((r, i) => (
                  <MiniCard key={`r${i}`} role={r} />
                ))}
              </Row>
            </Row>
            {seat.claim && !seat.out ? (
              <Row gap={4} style={{ alignItems: 'center' }}>
                <RoleIcon role={seat.claim} size={13} />
                <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
                  آخر ادّعاء: {ROLE_INFO[seat.claim].name}
                </Txt>
              </Row>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The table: the action and the answers                               */
/* ------------------------------------------------------------------ */

function TablePanel({ view, h }: { view: CoupView; h: Helpers }) {
  const settled = useSettled();
  const p = view.pending;
  const name = (id: string | null | undefined) => h.player(id).name;
  let body;
  if (view.phase === 'turn' || !p) {
    const mine = view.turn === h.me;
    const forced = mine && (view.seats[h.me]?.coins ?? 0) >= COUP_FORCE;
    body = (
      <>
        <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {view.turn ? <Avatar player={h.player(view.turn)} size={30} ring={GOLD} /> : null}
          <Txt v="h2" style={{ color: CREAM }}>
            {mine ? 'دورك: اختر عملاً' : `دور ${h.player(view.turn).name}`}
          </Txt>
        </Row>
        <Txt v="tiny" center color={alpha(CREAM, 0.75)}>
          {forced ? 'مع 10 قطع أو أكثر: الانقلاب فقط' : mine ? 'ادّعِ أي دور تريده… ولكن احذر التحدّي!' : 'ترقّب العمل، وتحدَّ إن شككت في الادّعاء'}
        </Txt>
        {view.turnEndsAt && !h.player(view.turn).bot ? <TimerBar key={`t${view.seq}`} endsAt={view.turnEndsAt} total={view.turnTotal} onTick={mine} /> : null}
      </>
    );
  } else {
    body = (
      <>
        <ActionLine view={view} h={h} />
        {view.phase === 'window' && view.window ? <WindowBar view={view} h={h} /> : null}
        {view.phase === 'proof' && p.challenge ? <Proof view={view} h={h} /> : null}
        {view.phase === 'lose' && view.lose ? (
          view.lose.who === h.me ? (
            <View style={{ gap: 6 }}>
              <Txt v="bold" center style={{ color: GOLD }}>
                {LOSE_TEXT[view.lose.reason]}: اختر بطاقة تكشفها من بطاقتيك أدناه
              </Txt>
              <TimerBar key={`l${view.seq}`} endsAt={view.lose.endsAt} total={view.lose.total} onTick />
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <Row gap={6} style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Avatar player={h.player(view.lose.who)} size={24} />
                <Txt v="small" center style={{ color: CREAM }}>
                  {LOSE_TEXT[view.lose.reason]}: خسارة نفوذ لـ{name(view.lose.who)}… اختيار البطاقة المكشوفة
                </Txt>
              </Row>
              <TimerBar key={`l${view.seq}`} endsAt={view.lose.endsAt} total={view.lose.total} />
            </View>
          )
        ) : null}
        {view.phase === 'exchange' && view.exchange ? (
          view.exchange.by === h.me ? (
            <Exchange key={view.seq} view={view} h={h} />
          ) : (
            <View style={{ gap: 6 }}>
              <Txt v="small" center style={{ color: CREAM }}>
                تبديل البطاقات مع الرزمة: {name(view.exchange.by)}…
              </Txt>
              <TimerBar key={`x${view.seq}`} endsAt={view.exchange.endsAt} total={view.exchange.total} />
            </View>
          )
        ) : null}
      </>
    );
  }
  return (
    <Animated.View key={`${view.phase}|${view.seq}`} entering={settled ? FadeIn.duration(240) : undefined} style={styles.table}>
      {body}
    </Animated.View>
  );
}

/** «الضريبة» · ادّعاء الوزير — من سارة، على علي; and the block under it. */
function ActionLine({ view, h }: { view: CoupView; h: Helpers }) {
  const p = view.pending!;
  const info = ACTION_INFO[p.action];
  const by = h.player(p.by);
  const nm = (id: string) => (id === h.me ? 'أنت' : h.player(id).name);
  return (
    <View style={{ gap: 6 }}>
      <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Avatar player={by} size={28} ring={GOLD} />
        <Txt v="bold" style={{ color: CREAM }}>
          {nm(p.by)}
        </Txt>
        <View style={[styles.chip, { backgroundColor: alpha(GOLD, 0.22), borderColor: GOLD }]}>
          <Txt style={{ fontFamily: F.display, fontSize: 17, lineHeight: 26, color: CREAM }}>{info.name}</Txt>
        </View>
        {p.target ? (
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Txt v="small" color={alpha(CREAM, 0.8)}>
              {p.target === h.me ? 'عليك' : 'على'}
            </Txt>
            <Avatar player={h.player(p.target)} size={24} ring={C.red} />
            {p.target === h.me ? null : (
              <Txt v="bold" style={{ color: CREAM }}>
                {nm(p.target)}
              </Txt>
            )}
          </Row>
        ) : null}
      </Row>
      {p.claim ? (
        <Row gap={6} style={{ alignItems: 'center', justifyContent: 'center' }}>
          <RoleIcon role={p.claim} size={18} color={CREAM} />
          <Txt v="small" color={alpha(CREAM, 0.85)}>
            ادّعاء: {ROLE_INFO[p.claim].name}
          </Txt>
        </Row>
      ) : null}
      {p.block ? (
        <Row gap={6} style={[styles.blockLine]}>
          <Icon name="hand" size={16} color={CREAM} />
          <Avatar player={h.player(p.block.by)} size={22} />
          <Txt v="small" style={{ color: CREAM, flexShrink: 1 }}>
            {p.block.by === h.me ? 'منعك' : `منع من ${nm(p.block.by)}`} بادّعاء {ROLE_INFO[p.block.role].name}
          </Txt>
          <RoleIcon role={p.block.role} size={18} color={CREAM} />
        </Row>
      ) : null}
    </View>
  );
}

/** The open window: the question, the timer, my buttons (or who we wait for). */
function WindowBar({ view, h }: { view: CoupView; h: Helpers }) {
  const w = view.window!;
  const p = view.pending!;
  const canAnswer = w.eligible.includes(h.me) && !w.passed.includes(h.me);
  const waiting = w.eligible.filter((id) => !w.passed.includes(id));
  const actName = ACTION_INFO[p.action].name;
  const nm = (id: string) => h.player(id).name;
  let question: string;
  if (w.kind === 'challenge') question = canAnswer ? `هل تصدّق ادّعاء ${nm(p.by)}؟ (${ROLE_INFO[p.claim!].name})` : 'مهلة التحدّي';
  else if (w.kind === 'block') question = canAnswer ? (p.action === 'aid' ? 'من عنده الوزير يمنع المعونة: هل تمنعها؟' : `هل تمنع «${actName}»؟`) : `مهلة المنع (${ACTION_INFO[p.action].blockedBy.map((r) => ROLE_INFO[r].name).join(' أو ')})`;
  else question = canAnswer ? `هل تصدّق منع ${nm(p.block!.by)}؟ (${ROLE_INFO[p.block!.role].name})` : 'مهلة تحدّي المنع';
  const answer = (type: string, extra: Record<string, unknown> = {}) => {
    haptic.medium();
    h.act(type, { seq: view.seq, ...extra });
  };
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold" center style={{ color: GOLD }}>
        {question}
      </Txt>
      <TimerBar key={`w${view.seq}`} endsAt={w.endsAt} total={w.total} onTick={canAnswer} />
      {canAnswer ? (
        w.kind === 'block' ? (
          <View style={{ gap: 8 }}>
            <Row gap={8} wrap style={{ justifyContent: 'center' }}>
              {w.roles.map((r) => (
                <Btn key={r} flex size="md" color={ROLE_INFO[r].color} icon="hand" label={`منع: ${ROLE_INFO[r].name}`} onPress={() => answer('block', { role: r })} />
              ))}
            </Row>
            <Btn size="sm" ghost icon="check" label="لا منع" onPress={() => answer('pass')} />
          </View>
        ) : (
          <Row gap={8}>
            <Btn flex size="md" color={C.red} icon="bolt" label={w.kind === 'challenge' ? 'تحدٍّ!' : 'تحدّي المنع'} onPress={() => answer('challenge')} />
            <Btn flex size="md" ghost icon="check" label="تصديق" onPress={() => answer('pass')} />
          </Row>
        )
      ) : (
        <Row gap={6} style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="tiny" color={alpha(CREAM, 0.7)}>
            {w.eligible.includes(h.me) ? 'شكراً! بانتظار:' : 'بانتظار:'}
          </Txt>
          {waiting.map((id) => (
            <Avatar key={id} player={h.player(id)} size={22} />
          ))}
        </Row>
      )}
    </View>
  );
}

/** A challenge's result: the card shown, or the bluff caught. */
function Proof({ view, h }: { view: CoupView; h: Helpers }) {
  const c = view.pending!.challenge!;
  const role = ROLE_INFO[c.role].name;
  const of = c.of === h.me ? 'عندك' : `عند ${h.player(c.of).name}`;
  return (
    <Row gap={12} style={{ alignItems: 'center', justifyContent: 'center' }}>
      <RoleCard role={c.role} w={64} dim={!c.proven} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6} style={{ alignItems: 'center' }}>
          <Icon name="bolt" size={16} color={C.red} />
          <Txt v="small" color={alpha(CREAM, 0.85)} style={{ flexShrink: 1 }}>
            {c.by === h.me ? 'تحدّيك' : `تحدٍّ من ${h.player(c.by).name}`}
          </Txt>
        </Row>
        <Txt v="h2" style={{ color: c.proven ? C.green : C.red }}>
          {c.proven ? 'ادّعاء صادق!' : 'خدعة مكشوفة!'}
        </Txt>
        <Txt v="tiny" color={alpha(CREAM, 0.8)}>
          {c.proven ? `بطاقة ${role} ${of} فعلاً: تعود إلى الرزمة وتُسحب بدلها بطاقة جديدة. الخسارة على المتحدّي.` : `لم تكن بطاقة ${role} ${of}: الخسارة على صاحب الادّعاء.`}
        </Txt>
      </View>
    </Row>
  );
}

/** My exchange: keep as many cards as I had. */
function Exchange({ view, h }: { view: CoupView; h: Helpers }) {
  const inner = useInner();
  const x = view.exchange!;
  const cards = x.cards ?? [];
  const [chosen, setChosen] = useState<number[]>([]);
  const w = Math.min(dk(96), Math.floor((inner - 28 - 8 * 3 - 20) / 4));
  const toggle = (i: number) => {
    haptic.tap();
    setChosen((c) => (c.includes(i) ? c.filter((k) => k !== i) : c.length >= x.keep ? [...c.slice(1), i] : [...c, i]));
  };
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold" center style={{ color: GOLD }}>
        التبديل: اختر {x.keep === 1 ? 'بطاقة واحدة تحتفظ بها' : 'بطاقتين تحتفظ بهما'}
      </Txt>
      <Row gap={8} style={{ justifyContent: 'center' }}>
        {cards.map((r, i) => (
          <TapCard key={i} role={r} w={w} on={chosen.includes(i)} onPress={() => toggle(i)} label={i >= x.keep ? 'جديدة' : undefined} />
        ))}
      </Row>
      <TimerBar key={`x${view.seq}`} endsAt={x.endsAt} total={x.total} onTick />
      <Btn size="md" icon="check" color={GOLD} disabled={chosen.length !== x.keep} label="احتفظ بهذه" onPress={() => h.act('keep', { seq: view.seq, keep: chosen })} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* My cards and coins                                                  */
/* ------------------------------------------------------------------ */

function MyArea({ view, h, compact }: { view: CoupView; h: Helpers; compact?: boolean }) {
  const inner = useInner();
  const seat = view.seats[h.me];
  const [pick, setPick] = useState<{ idx: number; seq: number } | null>(null);
  if (!seat) return null;
  const losing = view.phase === 'lose' && view.lose?.who === h.me && view.hand.length > 1;
  const chosen = losing && pick && pick.seq === view.seq ? pick.idx : null;
  const cards = seat.hidden + seat.revealed.length;
  const coinW = 74;
  // the panel's padding and border (2 × 13.5), the coin box, the gaps between the cards
  // on my turn the cards are smaller so the actions stay in sight
  const w = Math.min(dk(compact ? 84 : 132), Math.floor((inner - 27 - coinW - 8 * Math.max(2, cards)) / Math.max(2, cards)));
  return (
    <View style={[styles.mine, losing && { borderColor: GOLD }]}>
      <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <View style={styles.coinBox} accessibilityLabel={`معك ${coinsText(seat.coins)}`}>
          <Icon name="coins" size={22} color={GOLD} />
          <Txt style={{ fontFamily: F.black, fontSize: 26, lineHeight: 34, color: GOLD }}>{num(seat.coins)}</Txt>
          <Txt v="tiny" color={C.muted}>
            {seat.coins === 1 ? 'قطعة' : seat.coins === 2 ? 'قطعتان' : seat.coins >= 3 && seat.coins <= 10 ? 'قطع' : 'قطعة'}
          </Txt>
        </View>
        {view.hand.map((r, i) =>
          losing ? (
            <TapCard key={`h${i}`} role={r} w={w - 10} on={chosen === i} onPress={() => setPick({ idx: i, seq: view.seq })} />
          ) : (
            <RoleCard key={`h${i}`} role={r} w={w} />
          ),
        )}
        {seat.revealed.map((r, i) => (
          <RoleCard key={`r${i}`} role={r} w={w} dim label="مكشوفة" />
        ))}
      </Row>
      {losing ? (
        <Btn
          size="md"
          color={C.red}
          icon="eye"
          disabled={chosen === null}
          label={chosen === null ? 'اضغط البطاقة التي تكشفها' : `اكشف ${ROLE_INFO[view.hand[chosen]].name}`}
          onPress={() => {
            if (chosen === null) return;
            haptic.medium();
            h.act('lose', { seq: view.seq, idx: chosen });
          }}
        />
      ) : seat.out ? (
        <Txt v="small" center color={C.muted}>
          خارج القصر: تابع اللعب حتى النهاية
        </Txt>
      ) : (
        <Txt v="tiny" center color={C.dim}>
          بطاقتاك لا يراهما غيرك
        </Txt>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* My actions                                                          */
/* ------------------------------------------------------------------ */

function Actions({ view, h, onPick }: { view: CoupView; h: Helpers; onPick: (a: CoupAction) => void }) {
  const inner = useInner();
  const seat = view.seats[h.me];
  const forced = seat.coins >= COUP_FORCE;
  const gap = 8;
  const per = inner < 400 ? 2 : 3;
  const w = Math.floor((inner - gap * (per - 1)) / per);
  const seizable = view.players.some((id) => id !== h.me && !view.seats[id].out && view.seats[id].coins > 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center' }}>
      {COUP_ACTIONS.map((a) => {
        const info = ACTION_INFO[a];
        const can = forced ? a === 'coup' : seat.coins >= info.cost && (a !== 'seize' || seizable);
        const role = info.role;
        const bluff = !!role && !view.hand.includes(role);
        return (
          <Pressable
            key={a}
            disabled={!can}
            onPress={() => onPick(a)}
            accessibilityRole="button"
            accessibilityLabel={`${info.name}${role ? ` — ادّعاء ${ROLE_INFO[role].name}` : ''}`}
            style={({ pressed }) => [
              styles.action,
              { width: w, opacity: can ? 1 : 0.4, borderColor: role ? alpha(ROLE_INFO[role].color, 0.9) : C.borderStrong, backgroundColor: pressed ? C.raised : C.surface },
              a === 'coup' && { borderColor: WINE, backgroundColor: pressed ? alpha(WINE, 0.5) : alpha(WINE, 0.28) },
            ]}>
            <Row gap={6} style={{ alignItems: 'center' }}>
              <Txt style={{ fontFamily: F.display, fontSize: 17, lineHeight: 27, flex: 1 }} numberOfLines={1}>
                {info.name}
              </Txt>
              <View style={[styles.gain, { backgroundColor: info.cost ? alpha(C.red, 0.25) : alpha(C.green, 0.25) }]}>
                <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 19, color: info.cost ? '#FF9AA8' : '#7FE0B5' }}>{num(info.gain)}</Txt>
              </View>
            </Row>
            <Row gap={5} style={{ alignItems: 'center' }}>
              {role ? <RoleIcon role={role} size={15} /> : <Icon name={a === 'coup' ? 'bolt' : 'coins'} size={14} color={C.muted} />}
              <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
                {role ? ROLE_INFO[role].name : a === 'coup' ? 'لا يُمنع' : a === 'aid' ? 'يمنعها الوزير' : 'لا يُمنع'}
              </Txt>
              {role ? (
                <Txt v="tiny" color={bluff ? C.orange : C.green}>
                  {bluff ? 'خدعة' : 'بطاقتك'}
                </Txt>
              ) : null}
            </Row>
          </Pressable>
        );
      })}
    </View>
  );
}

function TargetPicker({ view, h, action, onPick, onCancel }: { view: CoupView; h: Helpers; action: CoupAction; onPick: (id: string) => void; onCancel: () => void }) {
  const inner = useInner();
  const targets = view.players.filter((id) => id !== h.me && !view.seats[id].out && (action !== 'seize' || view.seats[id].coins > 0));
  const per = inner < 400 ? 2 : 3;
  const w = Math.floor((inner - 28 - 8 * (per - 1)) / per);
  return (
    <View style={styles.panel}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Txt v="bold" style={{ flex: 1 }}>
          «{ACTION_INFO[action].name}»: اختر الهدف
        </Txt>
        <Btn size="sm" ghost icon="close" label="إلغاء" onPress={onCancel} />
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {targets.map((id) => {
          const seat = view.seats[id];
          return (
            <Pressable
              key={id}
              onPress={() => onPick(id)}
              accessibilityRole="button"
              accessibilityLabel={h.player(id).name}
              style={({ pressed }) => [styles.target, { width: w, backgroundColor: pressed ? alpha(C.red, 0.3) : C.surfaceStrong }]}>
              <Avatar player={h.player(id)} size={34} />
              <Txt v="bold" numberOfLines={1} style={{ fontSize: 14 }}>
                {h.player(id).name}
              </Txt>
              <Txt v="tiny" color={C.muted}>
                {coinsText(seat.coins)} · {seat.hidden === 1 ? 'بطاقة واحدة' : 'بطاقتان'}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The log and the roles reference                                     */
/* ------------------------------------------------------------------ */

function LogLines({ view, h }: { view: CoupView; h: Helpers }) {
  const lines = view.log.slice(-3);
  if (!lines.length) return null;
  return (
    <View style={styles.log}>
      {lines.map((l, i) => (
        <Row key={`${view.log.length - lines.length + i}`} gap={6} style={{ alignItems: 'center', opacity: i === lines.length - 1 ? 1 : 0.6 }}>
          {l.by ? <Avatar player={h.player(l.by)} size={18} /> : <Icon name="info" size={16} color={C.dim} />}
          <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
            {l.text}
          </Txt>
        </Row>
      ))}
    </View>
  );
}

function RolesRef({ view }: { view: CoupView }) {
  const shown = (r: CoupRole) => view.players.reduce((n, id) => n + view.seats[id].revealed.filter((x) => x === r).length, 0);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.panel}>
      <Txt v="h3">مرجع الأدوار</Txt>
      {COUP_ROLES.map((r) => {
        const info = ROLE_INFO[r];
        return (
          <Row key={r} gap={10} style={{ alignItems: 'center' }}>
            <View style={[styles.refIcon, { borderColor: info.color }]}>
              <RoleIcon role={r} size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <Txt v="bold" style={{ color: info.color === '#3F4A6B' ? '#9FB0DA' : info.color }}>
                  {info.name}
                </Txt>
                <Txt v="tiny" color={C.dim} style={{ flex: 1 }} numberOfLines={1}>
                  {info.line}
                </Txt>
              </Row>
              {info.action ? (
                <Txt v="tiny" color={C.text}>
                  {info.action}
                </Txt>
              ) : null}
              {info.blocks ? (
                <Txt v="tiny" color={C.muted}>
                  {info.blocks}
                </Txt>
              ) : null}
            </View>
            <Txt v="tiny" color={C.dim} style={{ width: 54, textAlign: 'center' }}>
              مكشوف {num(shown(r))} من {num(COUP_COPIES)}
            </Txt>
          </Row>
        );
      })}
      <View style={styles.sep} />
      <Txt v="tiny" color={C.text}>
        أعمال للجميع بلا ادّعاء:
      </Txt>
      <Txt v="tiny" color={C.muted}>
        • «الدخل»: {num('+1')}، لا يُمنع.{'\n'}• «المعونة»: {num('+2')}، يمنعها الوزير.{'\n'}• «الانقلاب»: ادفع {num(7)} قطع ليخسر لاعب تختاره نفوذاً. لا يُمنع، وهو إلزامي مع {num(10)} قطع.
      </Txt>
      <Txt v="tiny" color={C.muted}>
        التحدّي: إن صدق الادّعاء فالخسارة على المتحدّي، وإن كان خدعة فعلى صاحبه.
      </Txt>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

function CoupFinal({ room, view, h }: { room: RoomView; view: CoupView; h: Helpers }) {
  const won = view.winner === h.me;
  const order = [...(view.winner ? [view.winner] : []), ...[...view.outOrder].reverse().filter((id) => id !== view.winner)];
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="coup" size={84} />} title={view.winner ? winnerTitle([h.player(view.winner).name]) : 'انتهت اللعبة'} sub="آخر من بقي له نفوذ في القصر" />
      <View style={styles.panel}>
        {order.map((id, i) => {
          const seat = view.seats[id];
          return (
            <Row key={id} gap={10} style={{ alignItems: 'center' }}>
              <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26, width: 24, textAlign: 'center', color: i === 0 ? GOLD : C.muted }}>{num(i + 1)}</Txt>
              <Avatar player={h.player(id)} size={34} crown={i === 0} />
              <Txt v="bold" numberOfLines={1} style={{ flex: 1 }}>
                {h.player(id).name}
                {id === h.me ? ' (أنت)' : ''}
              </Txt>
              <Row gap={3}>
                {seat?.revealed.map((r, k) => (
                  <MiniCard key={k} role={r} w={20} />
                ))}
                {seat?.kept?.map((r, k) => (
                  <View key={`k${k}`} style={{ borderRadius: 4, borderWidth: 1.5, borderColor: GOLD }}>
                    <MiniCard role={r} w={20} />
                  </View>
                ))}
              </Row>
            </Row>
          );
        })}
      </View>
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const WINDOW_OPTIONS = COUP_WINDOW_SECONDS.map((n) => ({ key: String(n), label: `${num(n)} ثوانٍ` }));
const TURN_OPTIONS = COUP_TURN_SECONDS.map((n) => ({ key: String(n), label: n === 0 ? 'بلا حد' : `${num(n)} ثانية` }));

export function CoupSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.coup;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'coup', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">مهلة التحدّي والمنع</Txt>
      <ChipPicker<string> editable={editable} value={String(s.windowSec)} onChange={(v) => change({ windowSec: Number(v) })} options={WINDOW_OPTIONS} />
      <Txt v="bold">وقت الدور</Txt>
      <ChipPicker<string> editable={editable} value={String(s.turnSec)} onChange={(v) => change({ turnSec: Number(v) })} options={TURN_OPTIONS} />
      <Row gap={8}>
        <GameArt id="coup" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          خمسة أدوار في القصر، وكل لاعب يدّعي ما يشاء. بعد كل ادّعاء مهلة قصيرة للتحدّي أو المنع.
          {s.turnSec ? ' وإذا انتهى وقت الدور أُخذ «الدخل» تلقائياً.' : ''}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  seat: { borderRadius: 16, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 10, gap: 4 },
  table: { backgroundColor: WINE, borderRadius: 22, borderWidth: 1.5, borderColor: alpha(GOLD, 0.5), padding: 14, gap: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12 },
  blockLine: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,22,51,0.35)', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'center' },
  mine: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 12, gap: 10 },
  coinBox: { width: 74, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg2, borderRadius: 16, paddingVertical: 8 },
  action: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, gap: 2, minHeight: 64 },
  gain: { borderRadius: 999, paddingHorizontal: 8 },
  target: { borderRadius: 16, alignItems: 'center', paddingVertical: 10, gap: 2 },
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 14, gap: 10 },
  log: { gap: 4, paddingHorizontal: 4 },
  refIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1.5, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, backgroundColor: C.border },
});
