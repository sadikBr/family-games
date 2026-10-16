import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { BOARD, GROUP_COLOR, JAIL_FINE, STATION_RENT, groupSquares, priceOf, type EstateGroup } from '@/shared/estate';
import type { EstateView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal, Stepper } from '@/ui/controls';
import { ThrownDice } from '@/ui/dice3d';
import { Confetti, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { LastEvent } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { EstateBoard, INK, PAPER, shortName, squareIcon } from './estate-board';
import { helpers, type Helpers } from './helpers';

const money = (n: number) => `${num(n)} د`;

export function EstateGame({ room, view }: { room: RoomView; view: EstateView }) {
  const h = helpers(room);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 16, 540);
  const [landedRoll, setLandedRoll] = useState(view.rollId);
  const [detail, setDetail] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'mine' | 'trade' | null>(null);
  const [seenCard, setSeenCard] = useState(0);
  const [confirmBk, setConfirmBk] = useState(false);

  const me = view.players.find((p) => p.id === h.me);
  if (!me && view.phase !== 'final') return <Spectator room={room} />;

  if (view.phase === 'final') {
    const won = view.winner === h.me;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={<GameArt id="estate" size={84} />}
          title={view.winner ? `${h.player(view.winner).name} ملك العقار` : 'انتهت اللعبة'}
          sub={view.maxRounds && view.round > view.maxRounds ? 'انتهت الجولات — الفائز هو الأغنى' : 'آخر من بقي في اللعبة'}
        />
        <Scoreboard players={room.players} scores={view.worth} unit="درهم" highlight={view.winner ?? undefined} />
        <PlayAgain room={room} />
      </>
    );
  }

  const myTurn = view.turn === h.me;
  const rolling = view.rollId !== landedRoll;
  const C0 = W - 2 * W * 0.14; // centre size
  const card = view.card && view.card.id !== seenCard && !rolling ? view.card : null;
  const incoming = view.trade && view.trade.to === h.me ? view.trade : null;

  return (
    <>
      <PlayersStrip view={view} h={h} />

      <EstateBoard W={W} view={view} player={h.player} onSquare={setDetail}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Txt style={{ fontFamily: F.display, fontSize: C0 * 0.1, lineHeight: C0 * 0.15, color: alpha('#FFFFFF', 0.16), position: 'absolute', top: C0 * 0.06 }}>ملك العقار</Txt>
          <Txt v="tiny" color={alpha('#FFFFFF', 0.45)} style={{ position: 'absolute', bottom: C0 * 0.05 }}>
            {view.maxRounds ? `الجولة ${num(Math.min(view.round, view.maxRounds))} من ${num(view.maxRounds)}` : `الجولة ${num(view.round)}`}
          </Txt>
          <View style={{ position: 'absolute', left: 0, top: C0 * 0.2, width: C0, height: C0 * 0.6 }} pointerEvents="none">
            <ThrownDice values={view.dice} rollId={view.rollId} width={C0} height={C0 * 0.6} size={C0 * 0.16} onLanded={() => setLandedRoll(view.rollId)} />
          </View>
          {card ? (
            <Animated.View entering={ZoomIn.duration(220)} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Pressable onPress={() => setSeenCard(card.id)} style={[styles.luckCard, { width: C0 * 0.82 }]} accessibilityLabel="إغلاق البطاقة">
                <View style={[styles.luckHead, { backgroundColor: card.deck === 'luck' ? '#F08A3E' : '#22B8B0' }]}>
                  <Icon name={card.deck === 'luck' ? 'question' : 'gift'} size={18} color={INK} />
                  <Txt v="h3" color={INK}>
                    {card.deck === 'luck' ? 'حظ' : 'صندوق العائلة'}
                  </Txt>
                </View>
                <Txt v="bold" center color={INK} style={{ padding: 10 }}>
                  {card.text}
                </Txt>
                <Txt v="tiny" center color="#6B6480" style={{ paddingBottom: 6 }}>
                  {h.player(card.by).name}
                </Txt>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </EstateBoard>

      <ActionPanel view={view} h={h} myTurn={myTurn} rolling={rolling} onSheet={setSheet} onBankrupt={() => setConfirmBk(true)} />
      <LastEvent feed={view.feed} h={h} />

      <SquareSheet i={detail} view={view} h={h} onClose={() => setDetail(null)} />
      <MineSheet visible={sheet === 'mine'} view={view} h={h} onClose={() => setSheet(null)} onOpen={(i) => setDetail(i)} />
      {sheet === 'trade' ? <TradeSheet view={view} h={h} onClose={() => setSheet(null)} /> : null}
      <OfferModal h={h} trade={incoming} />
      <ConfirmModal
        visible={confirmBk}
        danger
        icon="skull"
        title="إعلان الإفلاس؟"
        message="ستخرج من اللعبة وتذهب عقاراتك لمن تدين له."
        confirmLabel="أعلن الإفلاس"
        onCancel={() => setConfirmBk(false)}
        onConfirm={() => {
          setConfirmBk(false);
          h.act('bankrupt');
        }}
      />
    </>
  );
}

/* ---------------- players ---------------- */

function PlayersStrip({ view, h }: { view: EstateView; h: Helpers }) {
  return (
    <View style={styles.players}>
      {view.players.map((p) => {
        const pl = h.player(p.id);
        const active = p.id === view.turn;
        return (
          <View key={p.id} style={[styles.player, active && { borderColor: pl.color, backgroundColor: alpha(pl.color, 0.2) }, p.bankrupt && { opacity: 0.4 }]}>
            <Avatar player={pl} size={28} ring={pl.color} badge={p.jail !== null ? 'bars' : undefined} />
            <View>
              <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 76 }}>
                {pl.name}
              </Txt>
              <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 18, color: p.bankrupt ? C.red : C.yellow }}>{p.bankrupt ? 'أفلس' : money(p.cash)}</Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ---------------- actions ---------------- */

function PropTile({ i, compact }: { i: number; compact?: boolean }) {
  const sq = BOARD[i];
  const icon = squareIcon(sq);
  return (
    <View style={[styles.tile, compact && { minWidth: 0 }]}>
      <View style={[styles.tileBand, { backgroundColor: sq.kind === 'city' ? GROUP_COLOR[sq.group] : '#D8CDB0' }]}>{icon ? <Icon name={icon} size={14} color={INK} /> : null}</View>
      <Txt numberOfLines={1} style={{ fontFamily: F.display, fontSize: compact ? 13 : 17, lineHeight: compact ? 20 : 26, color: INK, paddingHorizontal: 8, textAlign: 'center' }}>
        {sq.name}
      </Txt>
    </View>
  );
}

function ActionPanel({ view, h, myTurn, rolling, onSheet, onBankrupt }: {
  view: EstateView;
  h: Helpers;
  myTurn: boolean;
  rolling: boolean;
  onSheet: (s: 'mine' | 'trade') => void;
  onBankrupt: () => void;
}) {
  const me = view.players.find((p) => p.id === h.me)!;
  const mineCount = Object.values(view.props).filter((p) => p.owner === h.me).length;
  const outgoing = view.trade && view.trade.from === h.me ? view.trade : null;
  const tools = (
    <Row gap={8}>
      <Btn flex size="sm" ghost icon="house" label={`عقاراتي (${num(mineCount)})`} onPress={() => onSheet('mine')} />
      <Btn flex size="sm" ghost icon="swap" label="صفقة" disabled={!myTurn || !!view.trade || !['roll', 'manage'].includes(view.phase)} onPress={() => onSheet('trade')} />
    </Row>
  );

  let body: ReactNode;
  if (rolling) {
    body = (
      <Txt v="bold" center color={C.muted}>
        {myTurn ? 'النرد يتدحرج…' : `${h.player(view.turn).name} يرمي النرد…`}
      </Txt>
    );
  } else if (!myTurn) {
    body = (
      <Txt v="bold" center color={C.muted}>
        دور {h.player(view.turn).name}…
      </Txt>
    );
  } else if (view.phase === 'roll') {
    body = (
      <View style={{ gap: 8 }}>
        {me.jail !== null ? (
          <>
            <Txt v="bold" center color={C.orange}>
              أنت في السجن — ارمِ زوجاً لتخرج (المحاولة {num(me.jail + 1)} من 3)
            </Txt>
            <Row gap={8}>
              <Btn flex size="md" color={C.orange} label={`ادفع ${num(JAIL_FINE)}`} disabled={me.cash < JAIL_FINE} onPress={() => h.act('payJail')} />
              {me.jailCards ? <Btn flex size="md" color={C.cyan} label="استعمل البطاقة" onPress={() => h.act('useCard')} /> : null}
            </Row>
          </>
        ) : null}
        <Btn
          size="xl"
          icon="shuffle"
          label="ارمِ النردين"
          onPress={() => {
            haptic.medium();
            h.act('roll');
          }}
        />
      </View>
    );
  } else if (view.phase === 'buy' && view.buy !== null) {
    const price = priceOf(view.buy);
    const sq = BOARD[view.buy];
    body = (
      <View style={{ gap: 10, alignItems: 'stretch' }}>
        <PropTile i={view.buy} />
        <Txt center color={C.muted}>
          {sq.kind === 'city' ? `الكراء ${num(sq.rent[0])} — ويتضاعف إذا ملكت كل اللون` : sq.kind === 'station' ? `الكراء ${num(STATION_RENT[0])} إلى ${num(200)} حسب عدد المحطات` : 'الكراء 4× أو 10× مجموع النرد'}
        </Txt>
        <Row gap={8}>
          <Btn flex size="lg" color={C.green} icon="check" label={`اشترِ بـ ${num(price)}`} disabled={me.cash < price} onPress={() => h.act('buy')} />
          <Btn flex size="lg" ghost label="تجاوز" onPress={() => h.act('skip')} />
        </Row>
        {me.cash < price ? (
          <Txt v="tiny" center color={C.dim}>
            لا يكفي المال — ارهن عقاراً من «عقاراتي» أو تجاوز
          </Txt>
        ) : null}
      </View>
    );
  } else if (view.phase === 'debt' && view.debt) {
    body = (
      <View style={{ gap: 8 }}>
        <Txt v="bold" center color={C.red}>
          عليك دفع {num(view.debt.amount)}
          {view.debt.to ? ` لـ ${h.player(view.debt.to).name}` : ''} — معك {num(me.cash)}
        </Txt>
        <Txt v="small" center color={C.muted}>
          بِع منازل أو ارهن عقارات من «عقاراتي» لتجمع المبلغ.
        </Txt>
        <Row gap={8}>
          <Btn flex size="md" color={C.green} label="سدّد" disabled={me.cash < view.debt.amount} onPress={() => h.act('settle')} />
          <Btn flex size="md" color={C.red} icon="skull" label="إفلاس" onPress={onBankrupt} />
        </Row>
      </View>
    );
  } else {
    body = <Btn size="lg" icon="check" label="إنهاء الدور" onPress={() => h.act('end')} />;
  }

  return (
    <View style={styles.panel}>
      {body}
      {outgoing ? (
        <Row gap={8} style={styles.waitTrade}>
          <Icon name="swap" size={18} color={C.yellow} />
          <Txt v="small" style={{ flex: 1 }}>
            في انتظار رد {h.player(outgoing.to).name} على عرضك
          </Txt>
          <Btn size="sm" ghost label="إلغاء" onPress={() => h.act('tradeCancel')} />
        </Row>
      ) : null}
      {tools}
    </View>
  );
}

/* ---------------- sheets ---------------- */

function Sheet({ visible, onClose, children, title }: { visible: boolean; onClose: () => void; children: ReactNode; title: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <Animated.View entering={FadeIn.duration(150)} style={styles.sheet}>
          <Row gap={8} style={{ justifyContent: 'space-between' }}>
            <Txt v="title">{title}</Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق">
              <Icon name="close" size={24} color={C.muted} />
            </Pressable>
          </Row>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function manageable(view: EstateView, me: string) {
  return view.turn === me && ['roll', 'manage', 'debt', 'buy'].includes(view.phase);
}

function SquareSheet({ i, view, h, onClose }: { i: number | null; view: EstateView; h: Helpers; onClose: () => void }) {
  if (i === null) return null;
  const sq = BOARD[i];
  const p = view.props[i];
  const mine = p?.owner === h.me;
  const can = mine && manageable(view, h.me);
  const rows: [string, number][] = [];
  if (sq.kind === 'city') {
    rows.push(['الكراء', sq.rent[0]], ['مع كل مدن اللون', sq.rent[0] * 2]);
    for (let k = 1; k <= 4; k++) rows.push([`مع ${num(k)} ${k === 1 ? 'منزل' : k === 2 ? 'منزلين' : 'منازل'}`, sq.rent[k]]);
    rows.push(['مع فندق', sq.rent[5]]);
  } else if (sq.kind === 'station') {
    STATION_RENT.forEach((r, k) => rows.push([`${num(k + 1)} ${k === 0 ? 'محطة' : 'محطات'}`, r]));
  }
  const desc: Record<string, string> = {
    go: `كلما مررت من هنا تأخذ ${num(200)}.`,
    jail: 'زيارة فقط — إلا إذا أُرسلت إلى السجن.',
    rest: 'استراحة: لا شيء يحدث هنا.',
    gotojail: 'اذهب مباشرة إلى السجن ولا تأخذ 200.',
    luck: 'اسحب بطاقة «حظ».',
    family: 'اسحب بطاقة من «صندوق العائلة».',
    tax: sq.kind === 'tax' ? `ادفع ${num(sq.amount)} للبنك.` : '',
    utility: 'الكراء 4× مجموع النرد، أو 10× إذا ملك نفس اللاعب الشركتين.',
  };
  return (
    <Sheet visible onClose={onClose} title={sq.name}>
      {sq.kind === 'city' ? <View style={[styles.detailBand, { backgroundColor: GROUP_COLOR[sq.group] }]} /> : null}
      {desc[sq.kind] ? <Txt color={C.muted}>{desc[sq.kind]}</Txt> : null}
      {priceOf(i) ? (
        <Row gap={10} wrap>
          <Txt v="bold">الثمن: {num(priceOf(i))}</Txt>
          {sq.kind === 'city' ? <Txt v="bold">ثمن المنزل: {num(sq.house)}</Txt> : null}
          <Txt v="bold" color={C.muted}>
            الرهن: {num(priceOf(i) / 2)}
          </Txt>
        </Row>
      ) : null}
      {rows.length ? (
        <View style={styles.rentTable}>
          {rows.map(([label, v], k) => (
            <Row key={k} gap={8} style={[styles.rentRow, p && sq.kind === 'city' && (p.houses ? p.houses + 1 : groupSquares(sq.group).every((j) => view.props[j]?.owner === p.owner) ? 1 : 0) === k && { backgroundColor: alpha(C.yellow, 0.18) }]}>
              <Txt style={{ flex: 1 }} color={C.muted}>
                {label}
              </Txt>
              <Txt v="bold">{num(v)}</Txt>
            </Row>
          ))}
        </View>
      ) : null}
      {p ? (
        <Row gap={8}>
          <Avatar player={h.player(p.owner)} size={28} />
          <Txt v="bold" style={{ flex: 1 }}>
            {mine ? 'ملكك' : `ملك ${h.player(p.owner).name}`}
            {p.mortgaged ? ' — مرهون' : p.houses === 5 ? ' — فندق' : p.houses ? ` — ${num(p.houses)} منازل` : ''}
          </Txt>
        </Row>
      ) : priceOf(i) ? (
        <Txt color={C.dim}>لا يملكه أحد بعد.</Txt>
      ) : null}
      {can ? <ManageRow i={i} view={view} h={h} /> : null}
    </Sheet>
  );
}

function ManageRow({ i, view, h }: { i: number; view: EstateView; h: Helpers }) {
  const sq = BOARD[i];
  const p = view.props[i];
  const me = view.players.find((x) => x.id === h.me)!;
  if (!p) return null;
  const group = sq.kind === 'city' ? groupSquares(sq.group) : null;
  const full = group ? group.every((j) => view.props[j]?.owner === h.me) : false;
  const groupBuilt = group ? group.some((j) => view.props[j]?.houses) : false;
  const unmortgage = Math.ceil((priceOf(i) / 2) * 1.1);
  return (
    <Row gap={6} wrap>
      {sq.kind === 'city' && full ? (
        <>
          <Btn size="sm" color={C.green} icon="plus" label={p.houses === 4 ? 'فندق' : 'منزل'} disabled={p.houses >= 5 || view.phase === 'debt' || me.cash < sq.house} onPress={() => h.act('build', { sq: i })} />
          <Btn size="sm" color={C.orange} icon="minus" label="بيع" disabled={!p.houses} onPress={() => h.act('sell', { sq: i })} />
        </>
      ) : null}
      {p.mortgaged ? (
        <Btn size="sm" color={C.cyan} icon="bank" label={`فك الرهن ${num(unmortgage)}`} disabled={me.cash < unmortgage || view.phase === 'debt'} onPress={() => h.act('unmortgage', { sq: i })} />
      ) : (
        <Btn size="sm" ghost icon="bank" label={`ارهن +${num(priceOf(i) / 2)}`} disabled={groupBuilt} onPress={() => h.act('mortgage', { sq: i })} />
      )}
    </Row>
  );
}

function MineSheet({ visible, view, h, onClose, onOpen }: { visible: boolean; view: EstateView; h: Helpers; onClose: () => void; onOpen: (i: number) => void }) {
  const mine = Object.keys(view.props)
    .map(Number)
    .filter((i) => view.props[i].owner === h.me)
    .sort((a, b) => a - b);
  const can = manageable(view, h.me);
  return (
    <Sheet visible={visible} onClose={onClose} title="عقاراتي">
      {!mine.length ? <Txt color={C.muted}>لا تملك أي عقار بعد. اشترِ المدن التي تقف عليها.</Txt> : null}
      {!can && mine.length ? (
        <Txt v="small" color={C.dim}>
          يمكنك البناء والرهن في دورك فقط.
        </Txt>
      ) : null}
      {mine.map((i) => {
        const p = view.props[i];
        return (
          <View key={i} style={styles.mineRow}>
            <Pressable onPress={() => onOpen(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel={`تفاصيل ${BOARD[i].name}`}>
              <SwatchIcon i={i} />
              <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
                {BOARD[i].name}
              </Txt>
              <Txt v="tiny" color={p.mortgaged ? C.red : C.muted}>
                {p.mortgaged ? 'مرهون' : p.houses === 5 ? 'فندق' : p.houses ? `${num(p.houses)} منازل` : ''}
              </Txt>
              <Icon name="next" size={16} color={C.dim} />
            </Pressable>
            {can ? <ManageRow i={i} view={view} h={h} /> : null}
          </View>
        );
      })}
    </Sheet>
  );
}

function SwatchIcon({ i }: { i: number }) {
  const sq = BOARD[i];
  const icon = squareIcon(sq);
  return (
    <View style={[styles.swatch, { backgroundColor: sq.kind === 'city' ? GROUP_COLOR[sq.group] : '#E9DFC4' }]}>
      {icon ? <Icon name={icon} size={16} color={INK} /> : null}
    </View>
  );
}

function PropChips({ props, view, selected, onToggle }: { props: number[]; view: EstateView; selected: number[]; onToggle: (i: number) => void }) {
  if (!props.length) return <Txt v="small" color={C.dim}>لا عقارات</Txt>;
  return (
    <Row gap={6} wrap>
      {props.map((i) => {
        const sq = BOARD[i];
        const built = sq.kind === 'city' && groupSquares(sq.group).some((j) => view.props[j]?.houses);
        const on = selected.includes(i);
        return (
          <Pressable
            key={i}
            disabled={built}
            onPress={() => onToggle(i)}
            accessibilityLabel={sq.name}
            style={[styles.chip, on && { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.2) }, built && { opacity: 0.35 }]}>
            <View style={[styles.chipDot, { backgroundColor: sq.kind === 'city' ? GROUP_COLOR[sq.group as EstateGroup] : '#D8CDB0' }]} />
            <Txt v="tiny">{shortName(sq)}</Txt>
            {view.props[i].mortgaged ? <Txt v="tiny" color={C.red}>(رهن)</Txt> : null}
          </Pressable>
        );
      })}
    </Row>
  );
}

function TradeSheet({ view, h, onClose }: { view: EstateView; h: Helpers; onClose: () => void }) {
  const others = view.players.filter((p) => p.id !== h.me && !p.bankrupt);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const me = view.players.find((p) => p.id === h.me)!;
  const them = view.players.find((p) => p.id === to);
  const propsOf = (id: string) =>
    Object.keys(view.props)
      .map(Number)
      .filter((i) => view.props[i].owner === id)
      .sort((a, b) => a - b);
  const toggle = (list: number[], set: (v: number[]) => void, i: number) => set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const empty = !give.length && !get.length && !giveCash && !getCash;
  return (
    <Sheet visible onClose={onClose} title="اقترح صفقة">
      <Txt v="bold">مع من؟</Txt>
      <Row gap={6} wrap>
        {others.map((p) => {
          const pl = h.player(p.id);
          const on = p.id === to;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                setTo(p.id);
                setGet([]);
                setGetCash(0);
              }}
              style={[styles.chip, on && { borderColor: pl.color, backgroundColor: alpha(pl.color, 0.22) }]}>
              <Avatar player={pl} size={22} />
              <Txt v="tiny">{pl.name}</Txt>
            </Pressable>
          );
        })}
      </Row>
      <Txt v="bold">تعطيه</Txt>
      <PropChips props={propsOf(h.me)} view={view} selected={give} onToggle={(i) => toggle(give, setGive, i)} />
      <Stepper label="مال" value={giveCash} min={0} max={Math.max(0, Math.floor(me.cash / 50) * 50)} step={50} onChange={setGiveCash} />
      <Txt v="bold">يعطيك</Txt>
      {them ? (
        <>
          <PropChips props={propsOf(them.id)} view={view} selected={get} onToggle={(i) => toggle(get, setGet, i)} />
          <Stepper label="مال" value={getCash} min={0} max={Math.max(0, Math.floor(them.cash / 50) * 50)} step={50} onChange={setGetCash} />
        </>
      ) : null}
      <Btn
        icon="swap"
        label="أرسل العرض"
        disabled={empty || !them}
        onPress={() => {
          h.act('trade', { to, give: { props: give, cash: giveCash }, get: { props: get, cash: getCash } });
          onClose();
        }}
      />
    </Sheet>
  );
}

function OfferModal({ h, trade }: { h: Helpers; trade: EstateView['trade'] }) {
  if (!trade) return null;
  const from = h.player(trade.from);
  const side = (s: { props: number[]; cash: number }) => (
    <View style={{ gap: 6 }}>
      {s.props.map((i) => (
        <PropTile key={i} i={i} compact />
      ))}
      {s.cash ? <Txt v="bold" color={C.yellow}>{money(s.cash)}</Txt> : null}
      {!s.props.length && !s.cash ? <Txt color={C.dim}>لا شيء</Txt> : null}
    </View>
  );
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.duration(180)} style={styles.sheet}>
          <Row gap={8}>
            <Avatar player={from} size={36} />
            <Txt v="h2" style={{ flex: 1 }}>
              {from.name} يقترح صفقة
            </Txt>
          </Row>
          <Txt v="bold" color={C.green}>
            تأخذ
          </Txt>
          {side(trade.give)}
          <Txt v="bold" color={C.red}>
            تعطي
          </Txt>
          {side(trade.get)}
          <Row gap={10} style={{ marginTop: 6 }}>
            <Btn flex size="md" ghost label="رفض" onPress={() => h.act('tradeDecline')} />
            <Btn flex size="md" color={C.green} label="قبول" onPress={() => h.act('tradeAccept')} />
          </Row>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  players: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  player: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 2, borderColor: 'transparent' },
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 10 },
  waitTrade: { backgroundColor: alpha(C.yellow, 0.1), borderRadius: 12, padding: 8 },
  tile: { backgroundColor: PAPER, borderRadius: 10, borderWidth: 2, borderColor: INK, overflow: 'hidden', minWidth: 160, alignSelf: 'center' },
  tileBand: { height: 20, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderColor: INK },
  luckCard: { backgroundColor: PAPER, borderRadius: 12, borderWidth: 2.5, borderColor: INK, overflow: 'hidden' },
  luckHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4, borderBottomWidth: 2, borderColor: INK },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: C.bg2, borderRadius: 22, padding: 16, gap: 10, borderWidth: 1, borderColor: C.borderStrong },
  detailBand: { height: 14, borderRadius: 7, borderWidth: 2, borderColor: INK },
  rentTable: { backgroundColor: C.surface, borderRadius: 14, padding: 6 },
  rentRow: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  mineRow: { backgroundColor: C.surface, borderRadius: 14, padding: 8, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  chipDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: INK },
});
