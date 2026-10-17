/** «مشوار الحياة» — the screen: board, what to do now, the last card, everyone's life, and the feed. */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  LIFE_CASH,
  LIFE_RULES as R,
  lifeMoney,
  type LifeCard,
  type LifeCardKind,
  type LifeChoice,
  type LifeHouse,
  type LifeJob,
  type LifeLength,
  type LifePlayer,
  type LifeTokenKind,
  type LifeView,
} from '@/shared/games/life';
import { lifeBoard } from '@/shared/life-board';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, IconBubble, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HOP_MS, INK, LifeBoardView, SPACE, WALK_DELAY } from './life-board';

const money = (n: number) => num(lifeMoney(n));
const TOKEN_ICON: Record<LifeTokenKind, IconName> = { family: 'heart', pet: 'paw', friend: 'users' };
const MEDAL = [C.yellow, '#C9CED8', '#D08A55'];
const TOKEN_NAME: Record<LifeTokenKind, string> = { family: 'عائلة', pet: 'حيوان أليف', friend: 'صديق' };

export function LifeGame({ room, view }: { room: RoomView; view: LifeView }) {
  const h = helpers(room);
  const { width, height } = useWindowDimensions();
  const content = Math.min(width - 32, 560);
  const aspect = lifeBoard(view.length).height / lifeBoard(view.length).width;
  // keep the action panel in sight on short phones: the board shrinks a little rather than push it away
  const W = Math.round(Math.min(content, Math.max(250, (height - 290) / aspect)));
  const [landed, setLanded] = useState(view.rollId);
  const [walked, setWalked] = useState(view.move?.id ?? 0);
  const [info, setInfo] = useState<number | null>(null);

  // the pawn walks once the die has landed: the result shows when it arrives
  const move = view.move;
  const moveId = move?.id ?? 0;
  const steps = move?.path.length ?? 0;
  useEffect(() => {
    if (!moveId || moveId === walked) return;
    const t = setTimeout(() => setWalked(moveId), WALK_DELAY + steps * HOP_MS + 250);
    return () => clearTimeout(t);
  }, [moveId, steps, walked]);

  const me = view.players.find((p) => p.id === h.me);
  if (!me && view.phase !== 'final') return <Spectator room={room} />;
  if (view.phase === 'final') return <LifeFinal room={room} view={view} h={h} />;

  const rolling = view.rollId !== landed;
  const walking = !!move && move.id !== walked;
  const busy = rolling || walking;
  const card = view.card && !busy && view.card.move <= walked ? view.card : null;
  const b = lifeBoard(view.length);
  const forkNode = view.choice?.kind === 'fork' ? view.players.find((p) => p.id === view.turn)?.pos : undefined;
  const highlight = !busy && forkNode !== undefined ? b.nodes[forkNode].next : undefined;

  return (
    <>
      <LifeBoardView W={W} view={view} player={h.player} onLanded={() => setLanded(view.rollId)} onSpace={(i) => setInfo(info === i ? null : i)} highlight={highlight} />
      {info !== null ? <SpaceInfo i={info} view={view} onClose={() => setInfo(null)} /> : null}
      <ActionPanel view={view} h={h} busy={busy} rolling={rolling} />
      {card ? <CardView key={card.id} card={card} h={h} /> : null}
      <PlayersGrid view={view} h={h} />
      <FeedList view={view} h={h} />
    </>
  );
}

/* ---------------- what to do now ---------------- */

function ActionPanel({ view, h, busy, rolling }: { view: LifeView; h: Helpers; busy: boolean; rolling: boolean }) {
  const me = view.players.find((p) => p.id === h.me)!;
  const turn = h.player(view.turn);
  const mine = view.turn === h.me;
  let body: ReactNode;
  if (busy) {
    body = (
      <Txt v="bold" center color={C.muted}>
        {rolling ? (mine ? 'النرد يتدحرج…' : `${turn.name} يرمي النرد…`) : `${mine ? 'تمشي' : `${turn.name} يمشي`} في طريق الحياة…`}
      </Txt>
    );
  } else if (view.phase === 'choose' && view.choice) {
    body = <ChoicePanel choice={view.choice} me={me} mine={mine} h={h} who={turn.name} />;
  } else if (mine) {
    const canRepay = me.loans > 0 && me.money >= R.loan;
    body = (
      <View style={{ gap: 8 }}>
        <Btn
          size="xl"
          icon="shuffle"
          label="ارمِ النرد"
          onPress={() => {
            haptic.medium();
            h.act('roll');
          }}
        />
        {canRepay ? <Btn size="sm" ghost icon="bank" label={`سدّد قرضاً (${money(R.loan)})`} onPress={() => h.act('repay')} /> : null}
      </View>
    );
  } else {
    body = (
      <Row gap={8} center>
        <Avatar player={turn} size={28} ring={turn.color} />
        <Txt v="bold" color={C.muted}>
          دور {turn.name}…
        </Txt>
      </Row>
    );
  }
  return (
    <Animated.View layout={LinearTransition.duration(200)} style={[styles.panel, mine && !busy && { borderColor: alpha(C.yellow, 0.6) }]}>
      {body}
    </Animated.View>
  );
}

function OptionCard({ icon, color, title, lines, onPress, disabled, wide }: {
  icon: IconName;
  color: string;
  title: string;
  lines: string[];
  onPress?: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress || disabled}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.option, { borderColor: color, backgroundColor: alpha(color, 0.14) }, wide && { minWidth: 130 }, disabled && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={[styles.optionIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={20} color="#FFFFFF" />
      </View>
      <Txt v="h3" center numberOfLines={2}>
        {title}
      </Txt>
      {lines.map((l, k) => (
        <Txt key={k} v="tiny" center color={k === 0 ? C.text : C.muted}>
          {l}
        </Txt>
      ))}
    </Pressable>
  );
}

function ChoicePanel({ choice, me, mine, h, who }: { choice: LifeChoice; me: LifePlayer; mine: boolean; h: Helpers; who: string }) {
  const tap = (type: string, payload: Record<string, unknown>) => (mine ? () => h.act(type, payload) : undefined);
  const head = (title: string, sub?: string) => (
    <View style={{ gap: 2 }}>
      <Txt v="h2" center>
        {mine ? title : `${who} يختار…`}
      </Txt>
      {sub ? (
        <Txt v="small" center color={C.muted}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
  switch (choice.kind) {
    case 'fork':
      return (
        <View style={{ gap: 10 }}>
          {head(choice.fork === 1 ? 'أي طريق تختار؟' : 'المفترق الثاني', choice.fork === 1 ? 'الشهادة أم العمل؟' : 'المغامرة أم الهدوء؟')}
          <Row gap={8} style={{ alignItems: 'stretch' }}>
            {choice.fork === 1 ? (
              <>
                <OptionCard icon="book" color={C.purple} title="الجامعة" lines={[`المصاريف ${money(R.tuition)}`, 'طريق أطول ومهن أحسن راتباً']} onPress={tap('fork', { way: 0 })} />
                <OptionCard icon="coins" color={C.orange} title="العمل مباشرة" lines={['مجاناً', 'اختر مهنتك الآن وابدأ تقبض']} onPress={tap('fork', { way: 1 })} />
              </>
            ) : (
              <>
                <OptionCard icon="rocket" color={C.red} title="طريق المغامرة" lines={['أقصر', 'مشاريع قد تربح أو تخسر']} onPress={tap('fork', { way: 0 })} />
                <OptionCard icon="leaf" color={C.green} title="الطريق الهادئ" lines={['أطول', 'أيام أجرة أكثر وأمان']} onPress={tap('fork', { way: 1 })} />
              </>
            )}
          </Row>
        </View>
      );
    case 'job':
      return (
        <View style={{ gap: 10 }}>
          {head(choice.degree ? 'مبروك التخرج! اختر مهنتك' : 'اختر مهنتك', 'الراتب تقبضه في كل يوم أجرة')}
          <Row gap={6} style={{ alignItems: 'stretch' }}>
            {choice.cards.map((j: LifeJob) => (
              <OptionCard key={j.id} icon={j.icon as IconName} color={choice.degree ? C.purple : C.orange} title={j.title} lines={[`${money(j.salary)} د`]} onPress={tap('job', { id: j.id })} />
            ))}
          </Row>
        </View>
      );
    case 'house':
      return (
        <View style={{ gap: 10 }}>
          {head('اختر داراً', `معك ${money(me.money)} — الباقي قرض`)}
          <Row gap={6} style={{ alignItems: 'stretch' }}>
            {choice.cards.map((x: LifeHouse) => {
              const loans = Math.max(0, Math.ceil((x.price - me.money) / R.loan));
              return (
                <OptionCard
                  key={x.id}
                  icon={x.icon as IconName}
                  color={C.blue}
                  title={x.title}
                  lines={[`الثمن ${money(x.price)}`, `البيع ${money(x.sell)}`, ...(mine && loans ? [`${num(loans)} ${loans === 1 ? 'قرض' : 'قروض'}`] : [])]}
                  onPress={tap('house', { id: x.id })}
                />
              );
            })}
          </Row>
          {mine ? <Btn size="md" ghost label="لا، أفضّل الكراء" onPress={() => h.act('house', { id: null })} /> : null}
        </View>
      );
    case 'insure':
      return (
        <View style={{ gap: 10 }}>
          {head(`التأمين بـ ${money(choice.price)}؟`, 'يدفع عنك الأعطال والسرقات والإصلاحات حتى التقاعد')}
          {mine ? (
            <Row gap={8}>
              <Btn flex size="lg" color={C.cyan} icon="hand" label="نعم" onPress={() => h.act('insure', { yes: true })} />
              <Btn flex size="lg" ghost label="لا" onPress={() => h.act('insure', { yes: false })} />
            </Row>
          ) : null}
        </View>
      );
    case 'risk':
      return (
        <View style={{ gap: 10 }}>
          {head(`مشروع مغامر: ${choice.title}`, 'ارمِ النرد إن شئت')}
          <Row gap={6} center>
            <RiskChip label="1–2" amount={R.risk[0]} />
            <RiskChip label="3–4" amount={R.risk[1]} />
            <RiskChip label="5–6" amount={R.risk[2]} />
          </Row>
          {mine ? (
            <Row gap={8}>
              <Btn
                flex
                size="lg"
                color={C.red}
                icon="rocket"
                label="جرّب حظك"
                onPress={() => {
                  haptic.medium();
                  h.act('risk', { go: true });
                }}
              />
              <Btn flex size="lg" ghost label="لا، شكراً" onPress={() => h.act('risk', { go: false })} />
            </Row>
          ) : null}
        </View>
      );
  }
}

function RiskChip({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={[styles.riskChip, { borderColor: amount < 0 ? C.red : C.green }]}>
      <Txt v="tiny" color={C.muted}>
        {num(label)}
      </Txt>
      <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 19, color: amount < 0 ? C.red : C.green }}>{money(amount)}</Txt>
    </View>
  );
}

/* ---------------- the last card ---------------- */

const CARD_LOOK: Record<LifeCardKind, { color: string; icon: IconName }> = {
  school: { color: '#3D9BE9', icon: 'book' },
  event: { color: '#F08A3E', icon: 'question' },
  family: { color: '#E86FA6', icon: 'heart' },
  payday: { color: '#2F9E6E', icon: 'coins' },
  raise: { color: '#C98A14', icon: 'starFull' },
  risk: { color: '#E2475F', icon: 'rocket' },
  retire: { color: '#F2B33D', icon: 'tea' },
  house: { color: '#4F5BD5', icon: 'house' },
  job: { color: '#7B61D9', icon: 'user' },
  insure: { color: '#22B8B0', icon: 'hand' },
  uni: { color: '#7B61D9', icon: 'book' },
  loan: { color: '#E2475F', icon: 'bank' },
};

function CardView({ card, h }: { card: LifeCard; h: Helpers }) {
  const look = CARD_LOOK[card.kind];
  const light = card.kind === 'retire';
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={[styles.card, { borderColor: look.color }]}>
      <View style={[styles.cardHead, { backgroundColor: look.color }]}>
        <Icon name={look.icon} size={18} color={light ? INK : '#FFFFFF'} />
        <Txt v="h3" color={light ? INK : '#FFFFFF'} style={{ flex: 1 }} numberOfLines={1}>
          {card.title}
        </Txt>
        <Avatar player={h.player(card.by)} size={24} />
      </View>
      <Row gap={10} style={{ padding: 12 }}>
        <Txt v="bold" style={{ flex: 1 }}>
          {card.text}
        </Txt>
        {card.amount ? (
          <View style={[styles.amount, { backgroundColor: alpha(card.amount > 0 ? C.green : C.red, 0.18) }]}>
            <Txt style={{ fontFamily: F.black, fontSize: 17, lineHeight: 25, color: card.amount > 0 ? C.green : C.red }}>
              {card.amount > 0 ? num(`+${lifeMoney(card.amount)}`) : money(card.amount)}
            </Txt>
          </View>
        ) : null}
      </Row>
    </Animated.View>
  );
}

function SpaceInfo({ i, view, onClose }: { i: number; view: LifeView; onClose: () => void }) {
  const n = lifeBoard(view.length).nodes[i];
  const sp = SPACE[n.kind];
  const here = view.players.filter((p) => p.pos === i);
  return (
    <Animated.View entering={FadeIn.duration(150)}>
      <Pressable onPress={onClose} style={[styles.info, { borderColor: sp.color }]} accessibilityLabel="إغلاق">
        <View style={[styles.optionIcon, { backgroundColor: sp.color, width: 30, height: 30 }]}>
          <Icon name={sp.icon} size={16} color={n.kind === 'fork' || n.kind === 'retire' ? INK : '#FFFFFF'} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="h3">{sp.name}</Txt>
          <Txt v="small" color={C.muted}>
            {sp.help}
            {here.length ? ` (هنا: ${num(here.length)} ${here.length === 1 ? 'لاعب' : 'لاعبين'})` : ''}
          </Txt>
        </View>
        <Icon name="close" size={18} color={C.dim} />
      </Pressable>
    </Animated.View>
  );
}

/* ---------------- everyone's life ---------------- */

function TokenRow({ tokens, size = 13 }: { tokens: LifeTokenKind[]; size?: number }) {
  if (!tokens.length) return null;
  const counts = (['family', 'friend', 'pet'] as LifeTokenKind[]).map((k) => [k, tokens.filter((t) => t === k).length] as const).filter(([, n]) => n);
  return (
    <Row gap={6}>
      {counts.map(([k, n]) => (
        <Row key={k} gap={2}>
          <Icon name={TOKEN_ICON[k]} size={size} color={C.pink} />
          {n > 1 ? (
            <Txt v="tiny" color={C.pink}>
              {num(n)}
            </Txt>
          ) : null}
        </Row>
      ))}
    </Row>
  );
}

function PlayerCard({ p, view, h, w }: { p: LifePlayer; view: LifeView; h: Helpers; w: number }) {
  const pl = h.player(p.id);
  const active = p.id === view.turn;
  return (
    <View style={[styles.player, { width: w }, active && { borderColor: pl.color, backgroundColor: alpha(pl.color, 0.16) }, p.retired !== null && { opacity: 0.85 }]}>
      <Row gap={6}>
        <Avatar player={pl} size={26} ring={pl.color} />
        <Txt v="tiny" numberOfLines={1} style={{ flex: 1 }}>
          {pl.name}
          {p.id === h.me ? ' (أنت)' : ''}
        </Txt>
        <Txt style={{ fontFamily: F.black, fontSize: 14, lineHeight: 20, color: C.yellow }} numberOfLines={1}>
          {money(p.money)}
        </Txt>
      </Row>
      <Row gap={4}>
        <Icon name={p.job ? (p.job.icon as IconName) : p.degree ? 'book' : 'user'} size={13} color={C.muted} />
        <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
          {p.job ? `${p.job.title} · ${money(p.salary)}` : p.degree ? 'طالب جامعي' : 'تلميذ'}
        </Txt>
      </Row>
      <Row gap={6} wrap>
        {p.retired !== null ? (
          <Row gap={3}>
            <Icon name="tea" size={13} color={C.yellow} />
            <Txt v="tiny" color={C.yellow}>
              متقاعد · {money(p.score?.total ?? 0)}
            </Txt>
          </Row>
        ) : null}
        {p.house ? <Icon name="house" size={13} color={C.blue} /> : null}
        {p.insured ? <Icon name="hand" size={13} color={C.cyan} /> : null}
        <TokenRow tokens={p.tokens} />
        {p.loans ? (
          <Row gap={2}>
            <Icon name="bank" size={13} color={C.red} />
            <Txt v="tiny" color={C.red}>
              {num(p.loans)}
            </Txt>
          </Row>
        ) : null}
      </Row>
    </View>
  );
}

function PlayersGrid({ view, h }: { view: LifeView; h: Helpers }) {
  const { width } = useWindowDimensions();
  const content = Math.min(width - 32, 560);
  const cols = content >= 470 ? 3 : 2;
  const w = (content - (cols - 1) * 6) / cols;
  return (
    <View style={styles.grid}>
      {view.players.map((p) => (
        <PlayerCard key={p.id} p={p} view={view} h={h} w={w} />
      ))}
    </View>
  );
}

function FeedList({ view, h }: { view: LifeView; h: Helpers }) {
  const items = view.feed.slice(-5).reverse();
  if (!items.length) return null;
  return (
    <View style={styles.feed}>
      {items.map((f, k) => (
        <Animated.View key={f.id} entering={FadeIn.duration(220)} layout={LinearTransition.duration(200)} style={[styles.feedRow, k > 0 && { opacity: 0.7 }]}>
          {f.by ? <Avatar player={h.player(f.by)} size={20} /> : <Icon name="info" size={16} color={C.dim} />}
          <Txt v="small" numberOfLines={2} style={{ flex: 1 }}>
            {f.text}
          </Txt>
        </Animated.View>
      ))}
    </View>
  );
}

/* ---------------- the end ---------------- */

function LifeFinal({ room, view, h }: { room: RoomView; view: LifeView; h: Helpers }) {
  const won = view.winner === h.me;
  const ranked = [...view.players].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<IconBubble icon="tea" size={72} color={alpha('#FFFFFF', 0.18)} iconColor={C.yellow} />}
        title={view.winner ? `${h.player(view.winner).name} عاش أغنى مشوار` : 'انتهى المشوار'}
        sub="المال + الدار + أفراد العائلة − القروض"
      />
      <View style={{ gap: 8 }}>
        {ranked.map((p, k) => {
          const pl = h.player(p.id);
          const s = p.score;
          return (
            <Animated.View key={p.id} entering={FadeInDown.delay(k * 80).duration(260)} style={[styles.scoreRow, p.id === view.winner && { borderColor: C.yellow }]}>
              <Row gap={8}>
                <View style={[styles.rank, { backgroundColor: MEDAL[k] ?? C.surfaceStrong }]}>
                  <Txt v="tiny" color={k < 3 ? C.ink : C.text}>
                    {num(k + 1)}
                  </Txt>
                </View>
                <Avatar player={pl} size={32} ring={pl.color} crown={p.id === view.winner} />
                <View style={{ flex: 1 }}>
                  <Txt v="bold" numberOfLines={1}>
                    {pl.name}
                  </Txt>
                  <Txt v="tiny" color={C.muted} numberOfLines={1}>
                    {p.job ? p.job.title : '—'}
                    {p.retired ? ` · تقاعد ${p.retired === 1 ? 'أولاً' : `في المرتبة ${num(p.retired)}`}` : ''}
                  </Txt>
                </View>
                <Txt style={{ fontFamily: F.black, fontSize: 19, lineHeight: 27, color: C.yellow }}>{money(s?.total ?? 0)}</Txt>
              </Row>
              {s ? (
                <Row gap={6} wrap>
                  <ScoreBit icon="coins" label="المال" v={s.money} />
                  {s.house ? <ScoreBit icon="house" label={p.house?.title ?? 'الدار'} v={s.house} /> : null}
                  {s.tokens ? <ScoreBit icon="heart" label={`${num(p.tokens.length)} ${p.tokens.length === 1 ? 'فرد' : 'أفراد'}`} v={s.tokens} /> : null}
                  {s.loans ? <ScoreBit icon="bank" label="القروض" v={-s.loans} /> : null}
                </Row>
              ) : null}
              {p.tokens.length ? (
                <Txt v="tiny" color={C.dim}>
                  {(['family', 'friend', 'pet'] as LifeTokenKind[])
                    .filter((k2) => p.tokens.includes(k2))
                    .map((k2) => `${TOKEN_NAME[k2]} ×${num(p.tokens.filter((t) => t === k2).length)}`)
                    .join(' · ')}
                </Txt>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
      <PlayAgain room={room} />
    </>
  );
}

function ScoreBit({ icon, label, v }: { icon: IconName; label: string; v: number }) {
  return (
    <View style={styles.bit}>
      <Icon name={icon} size={12} color={v < 0 ? C.red : C.muted} />
      <Txt v="tiny" color={C.muted} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="tiny" color={v < 0 ? C.red : C.text}>
        {money(v)}
      </Txt>
    </View>
  );
}

/* ---------------- lobby settings ---------------- */

export function LifeSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.life;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'life', patch });
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold">طول الطريق</Txt>
      <ChipPicker
        options={[
          { key: 'short', label: 'قصير' },
          { key: 'normal', label: 'عادي' },
        ]}
        value={s.length}
        editable={editable}
        onChange={(length: LifeLength) => change({ length })}
      />
      <Txt v="bold">المال في البداية</Txt>
      <ChipPicker
        options={LIFE_CASH.map((n) => ({ key: String(n), label: lifeMoney(n) }))}
        value={String(s.startCash)}
        editable={editable}
        onChange={(v) => change({ startCash: Number(v) })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 10, borderWidth: 2, borderColor: 'transparent' },
  option: { flex: 1, alignItems: 'center', gap: 3, borderWidth: 2, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4, minHeight: 44 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: INK },
  riskChip: { alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: C.bg2 },
  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  amount: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 16, borderWidth: 2, padding: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  player: { backgroundColor: C.surface, borderRadius: 14, padding: 8, gap: 3, borderWidth: 2, borderColor: 'transparent' },
  feed: { backgroundColor: alpha('#FFFFFF', 0.04), borderRadius: 16, padding: 10, gap: 6 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreRow: { backgroundColor: C.surface, borderRadius: 16, padding: 10, gap: 6, borderWidth: 2, borderColor: 'transparent' },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bit: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bg2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
});
