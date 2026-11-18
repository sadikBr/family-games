/**
 * «العقل الواحد» — the screen. A calm indigo table: the pile in the middle (the last card big, the few before it
 * small), a quiet row of dots that light up while nobody plays (the time since the last card, no numbers),
 * the cards put aside face up; the level, the lives (hearts) and the stars above it. Below: my hand in rising
 * order with the lowest card highlighted and one big button «العب أصغر بطاقة»; the star proposal; everyone's
 * card count. The focus moment («تركيز» → «جاهز»), the mistake shown gently, the calm success screen between
 * levels and the end of the game (won or lost together).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useElapsed } from '@/lib/time';
import { MIND_STARTS, mindLevels, mindStartKit, type MindSettings as Settings, type MindView } from '@/shared/games/mind';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';

const INDIGO = '#232058';
const BLUE = '#5B6CE0';
const CREAM = '#FFF4DA';
const GOLD = '#F6B53D';
const ROSE = '#F07C8E';

/** «بطاقة واحدة»، «بطاقتان»، «3 بطاقات»، «11 بطاقة» */
function cardsText(n: number) {
  if (n === 0) return 'بلا بطاقات';
  if (n === 1) return 'بطاقة واحدة';
  if (n === 2) return 'بطاقتان';
  return n <= 10 ? `${num(n)} بطاقات` : `${num(n)} بطاقة`;
}

/** «و» between the items of a short list. */
const andList = (xs: string[]) => xs.join(' و');

function useInner() {
  const width = useContentWidth();
  return Math.min(width, dk(520));
}

export function MindGame({ room, view }: { room: RoomView; view: MindView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <Final room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Level key={view.level} room={room} view={view} h={h} />;
}

/* ------------------------------------------------------------------ */
/* A level                                                             */
/* ------------------------------------------------------------------ */

function Level({ room, view, h }: { room: RoomView; view: MindView; h: Helpers }) {
  // a tap sent: wait for the pile (or my hand) to change
  const [sent, setSent] = useState<string | null>(null);
  const stamp = `${view.pile.length}|${view.hand.join(',')}|${view.phase}`;
  const pending = sent === stamp;
  useEffect(() => {
    if (sent === null) return;
    const t = setTimeout(() => setSent(null), 1500);
    return () => clearTimeout(t);
  }, [sent]);

  const lowest = view.hand[0] ?? null;
  const canPlay = view.phase === 'play' && lowest !== null && !pending;
  const playLowest = () => {
    if (!canPlay) return;
    haptic.medium();
    setSent(stamp);
    h.act('play', { level: view.level, base: view.pile.length, card: lowest });
  };

  return (
    <>
      <Status view={view} />
      <Table view={view} h={h} />
      {view.phase === 'focus' ? <Focus view={view} h={h} /> : null}
      {view.phase === 'cleared' ? <Cleared view={view} h={h} /> : null}
      {view.phase === 'play' && view.proposal ? <Proposal view={view} h={h} /> : null}
      {view.phase !== 'cleared' ? (
        <>
          <Hand hand={view.hand} dim={view.phase !== 'play' && view.phase !== 'focus'} />
          {view.phase === 'play' || view.phase === 'oops' ? (
            <View style={{ gap: 8 }}>
              {lowest !== null ? (
                <Btn size="xl" icon="play" color={GOLD} label={`العب أصغر بطاقة · ${lowest}`} disabled={!canPlay} onPress={playLowest} />
              ) : (
                <Txt v="small" center color={C.muted}>
                  لا بطاقات في يدك: تابع الفريق بهدوء
                </Txt>
              )}
              {view.phase === 'play' && !view.proposal ? (
                <Row gap={8} style={{ justifyContent: 'center', alignItems: 'center' }}>
                  <Btn
                    size="sm"
                    ghost
                    color={GOLD}
                    icon="starFull"
                    label="اقتراح نجمة"
                    disabled={view.stars <= 0}
                    onPress={() => h.act('star', { level: view.level, on: true })}
                  />
                  <Txt v="tiny" color={C.dim}>
                    {view.stars > 0 ? 'تكشف أصغر بطاقة من كل يد' : 'لا نجوم متبقية'}
                  </Txt>
                </Row>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
      <PlayerStrip
        room={room}
        gains={false}
        active={view.phase === 'play' && view.pile.length ? [view.pile[view.pile.length - 1].by] : []}
        entries={view.players.map((id) => ({
          id,
          score: view.counts[id] ?? 0,
          sub: view.phase === 'focus' ? (view.ready.includes(id) ? 'جاهز' : 'تركيز…') : (view.counts[id] ?? 0) === 0 ? 'بلا بطاقات' : cardsText(view.counts[id] ?? 0),
          out: view.phase === 'play' && (view.counts[id] ?? 0) === 0,
        }))}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Level, lives, stars                                                 */
/* ------------------------------------------------------------------ */

function Status({ view }: { view: MindView }) {
  const inner = useInner();
  const small = inner < 340;
  const icon = small ? 15 : 17;
  return (
    <Row gap={8} style={[styles.status, { width: inner, alignSelf: 'center' }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="h3" numberOfLines={1}>
          المستوى {num(view.level)}
          <Txt v="tiny" color={C.muted}>
            {' '}
            من {num(view.levels)}
          </Txt>
        </Txt>
      </View>
      <View style={styles.icons} accessibilityLabel={`القلوب: ${view.lives}`}>
        {view.lives <= 6 ? (
          Array.from({ length: view.lives }, (_, i) => <Icon key={i} name="heart" size={icon} color={ROSE} />)
        ) : (
          <>
            <Icon name="heart" size={icon} color={ROSE} />
            <Txt v="tiny">{num(view.lives)}</Txt>
          </>
        )}
        {view.lives === 0 ? <Txt v="tiny" color={C.dim}>لا قلوب</Txt> : null}
      </View>
      <View style={styles.sep} />
      <View style={styles.icons} accessibilityLabel={`النجوم: ${view.stars}`}>
        {view.stars ? (
          Array.from({ length: view.stars }, (_, i) => <Icon key={i} name="starFull" size={icon} color={GOLD} />)
        ) : (
          <Icon name="star" size={icon} color={C.dim} />
        )}
      </View>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* The table: the pile, the quiet dots, the cards put aside            */
/* ------------------------------------------------------------------ */

function Table({ view, h }: { view: MindView; h: Helpers }) {
  const inner = useInner();
  const settled = useSettled();
  const big = Math.min(dk(132), Math.round(inner * 0.34));
  const last = view.pile[view.pile.length - 1] ?? null;
  // the cards before it, on one line beside it (as many as fit, the newest nearest)
  const fit = Math.max(0, Math.min(5, Math.floor((inner - 28 - big - 8 + 4) / 38)));
  const before = fit ? view.pile.slice(Math.max(0, view.pile.length - 1 - fit), -1) : [];
  const oops = view.phase === 'oops' && view.mistake;
  const lastMistake = view.mistake && last && view.mistake.seq === view.pile.length && view.mistake.card === last.card;
  return (
    <View style={[styles.table, { width: inner, alignSelf: 'center' }, oops ? { borderColor: alpha(ROSE, 0.55) } : null]}>
      <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {before.length ? (
          <Row gap={4} style={{ alignItems: 'center' }}>
            {before.map((p, i) => (
              <View key={`${p.card}|${i}`} style={[styles.mini, { opacity: 0.4 + (0.5 * (i + 1)) / before.length }]}>
                <Txt style={styles.miniText}>{p.card}</Txt>
              </View>
            ))}
          </Row>
        ) : null}
        {last ? (
          <Animated.View key={last.card} entering={settled ? FadeIn.duration(320) : undefined}>
            <BigCard value={last.card} w={big} tone={lastMistake ? 'rose' : 'cream'} />
          </Animated.View>
        ) : (
          <View style={[styles.empty, { width: big, height: Math.round(big * 1.4) }]}>
            <Txt v="tiny" center color={alpha(CREAM, 0.6)}>
              {view.phase === 'focus' ? 'الكومة تنتظر' : 'الكومة فارغة'}
            </Txt>
          </View>
        )}
      </Row>
      {last ? (
        <Row gap={6} center style={{ justifyContent: 'center' }}>
          <Avatar player={h.player(last.by)} size={20} />
          <Txt v="tiny" color={alpha(CREAM, 0.8)}>
            آخر بطاقة: {h.player(last.by).name}
          </Txt>
        </Row>
      ) : null}
      {view.phase === 'play' ? <Quiet since={view.lastAt} /> : null}
      {oops ? <Mistake view={view} h={h} /> : null}
      {view.shown.length && !oops ? <ShownRow view={view} h={h} /> : null}
    </View>
  );
}

/** A cream card with its number (rose: the card laid too early). */
function BigCard({ value, w, tone }: { value: number; w: number; tone: 'cream' | 'rose' }) {
  const hgt = Math.round(w * 1.4);
  const fg = tone === 'rose' ? '#7A1F33' : INDIGO;
  return (
    <View style={[styles.big, { width: w, height: hgt, backgroundColor: tone === 'rose' ? '#FFE1E6' : CREAM }]} accessibilityLabel={`آخر بطاقة في الكومة: ${value}`}>
      <Txt style={[styles.corner, { color: alpha(fg, 0.6), top: 6, right: 9 }]}>{value}</Txt>
      <Txt style={{ fontFamily: F.display, fontSize: Math.round(w * 0.46), lineHeight: Math.round(w * 0.72), color: fg, textAlign: 'center' }}>{value}</Txt>
      <Txt style={[styles.corner, { color: alpha(fg, 0.6), bottom: 6, left: 9 }]}>{value}</Txt>
    </View>
  );
}

/** Ten small dots that light up slowly while nobody plays: the time since the last card, felt and not counted. */
function Quiet({ since }: { since: number | null }) {
  const elapsed = useElapsed(since, 500);
  const lit = Math.min(10, Math.floor(elapsed / 2500));
  return (
    <View style={styles.dots} accessibilityLabel="الوقت منذ آخر بطاقة">
      {Array.from({ length: 10 }, (_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i < lit ? alpha(CREAM, 0.25 + 0.05 * i) : alpha(CREAM, 0.08) }]} />
      ))}
    </View>
  );
}

/** The mistake, gently: the card laid and the lower ones that were still in hands. */
function Mistake({ view, h }: { view: MindView; h: Helpers }) {
  const m = view.mistake!;
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.mistake}>
      <Txt v="bold" center color={CREAM}>
        تمهّلوا… بطاقة {num(m.card)} سبقت بطاقات أصغر
      </Txt>
      <Row gap={6} wrap style={{ justifyContent: 'center' }}>
        {m.lower.map((l) => (
          <Row key={l.by} gap={4} style={styles.lowerChip}>
            <Avatar player={h.player(l.by)} size={18} />
            <Txt v="tiny" color={CREAM}>
              {l.by === h.me ? 'من يدك' : h.player(l.by).name}: {andList(l.cards.map((c) => `${c}`))}
            </Txt>
          </Row>
        ))}
      </Row>
      <Row gap={4} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="heart" size={14} color={ROSE} />
        <Txt v="tiny" color={alpha(CREAM, 0.85)}>
          {view.lives > 0 ? 'قلب أقل، والبطاقات الأصغر مكشوفة جانباً' : 'كان هذا آخر قلب'}
        </Txt>
      </Row>
    </Animated.View>
  );
}

/** The cards put aside face up this level. */
function ShownRow({ view, h }: { view: MindView; h: Helpers }) {
  const list = [...view.shown].sort((a, b) => a.card - b.card);
  return (
    <View style={{ gap: 4, alignItems: 'center' }}>
      <Txt v="tiny" color={alpha(CREAM, 0.6)}>
        مكشوفة جانباً
      </Txt>
      <Row gap={4} wrap style={{ justifyContent: 'center' }}>
        {list.map((x) => (
          <View key={`${x.card}`} style={[styles.shown, { borderColor: alpha(x.why === 'star' ? GOLD : ROSE, 0.6) }]} accessibilityLabel={`${x.card} من ${h.player(x.by).name}`}>
            {x.why === 'star' ? <Icon name="starFull" size={10} color={GOLD} /> : null}
            <Txt style={styles.shownText}>{x.card}</Txt>
            <View style={[styles.owner, { backgroundColor: h.player(x.by).color }]} />
          </View>
        ))}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* My hand                                                             */
/* ------------------------------------------------------------------ */

function Hand({ hand, dim }: { hand: number[]; dim: boolean }) {
  const inner = useInner();
  if (!hand.length) return null;
  const gap = 6;
  const perRow = Math.min(hand.length, inner < 340 ? 6 : 7);
  const w = Math.min(dk(62), Math.floor((inner - gap * (perRow - 1)) / perRow));
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center', opacity: dim ? 0.6 : 1, paddingTop: 8 }}>
        {hand.map((c, i) => (
          <View
            key={c}
            accessibilityLabel={i === 0 ? `أصغر بطاقة في يدك: ${c}` : `بطاقة ${c}`}
            style={[
              styles.card,
              { width: w, height: Math.round(w * 1.36) },
              i === 0 ? { borderColor: GOLD, borderWidth: 3, transform: [{ translateY: -6 }] } : null,
            ]}>
            <Txt style={{ fontFamily: F.display, fontSize: Math.round(w * 0.44), lineHeight: Math.round(w * 0.8), color: INDIGO, textAlign: 'center' }}>{c}</Txt>
          </View>
        ))}
      </View>
      <Txt v="tiny" center color={C.muted}>
        يدك بالترتيب · {hand.length > 1 ? 'المؤطّرة هي أصغرها' : 'بطاقة واحدة'}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Focus, the star proposal, the level cleared                         */
/* ------------------------------------------------------------------ */

function Focus({ view, h }: { view: MindView; h: Helpers }) {
  const ready = view.ready.includes(h.me);
  const missing = view.players.filter((p) => !view.ready.includes(p));
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.panel, { alignItems: 'center' }]}>
      <Txt v="title" center>
        تركيز
      </Txt>
      <Txt v="small" center color={C.muted}>
        {view.level === 1 ? 'بطاقة واحدة' : cardsText(view.level)} لكل لاعب. انظر إلى يدك، خذ نفساً هادئاً، ثم اضغط «جاهز».
      </Txt>
      {ready ? (
        <Txt v="bold" center color={C.green}>
          {missing.length ? `جاهز · بانتظار ${andList(missing.map((p) => h.player(p).name))}` : 'جاهزون!'}
        </Txt>
      ) : (
        <Btn size="xl" icon="check" color={C.green} label="جاهز" onPress={() => h.act('ready', { level: view.level })} style={{ alignSelf: 'stretch' }} />
      )}
    </Animated.View>
  );
}

function Proposal({ view, h }: { view: MindView; h: Helpers }) {
  const p = view.proposal!;
  const mine = p.by === h.me;
  const agreed = p.yes.includes(h.me);
  const asked = p.voters.includes(h.me);
  const missing = p.voters.filter((v) => !p.yes.includes(v));
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.panel, { borderColor: alpha(GOLD, 0.7) }]}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Icon name="starFull" size={22} color={GOLD} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="bold">{mine ? 'اقتراحك: استعمال نجمة' : `اقتراح من ${h.player(p.by).name}: استعمال نجمة`}</Txt>
          <Txt v="tiny" color={C.muted}>
            {missing.length ? `بانتظار موافقة ${andList(missing.map((v) => (v === h.me ? 'أنت' : h.player(v).name)))}` : 'الجميع موافقون'}
          </Txt>
        </View>
      </Row>
      {asked && !agreed ? (
        <Row gap={8}>
          <Btn flex size="md" icon="check" color={C.green} label="موافق" onPress={() => h.act('star', { level: view.level, on: true })} />
          <Btn flex size="md" icon="close" color={C.red} ghost label="ليس الآن" onPress={() => h.act('star', { level: view.level, on: false })} />
        </Row>
      ) : agreed ? (
        <Btn size="sm" ghost icon="close" color={C.muted} label={mine ? 'سحب الاقتراح' : 'تراجع'} onPress={() => h.act('star', { level: view.level, on: false })} />
      ) : null}
    </Animated.View>
  );
}

function Cleared({ view, h }: { view: MindView; h: Helpers }) {
  const r = view.reward;
  const rewardText = !r
    ? 'لا مكافأة بعد هذا المستوى'
    : r.capped
      ? r.kind === 'life'
        ? 'مكافأة قلب، لكن القلوب في حدّها الأقصى'
        : 'مكافأة نجمة، لكن النجوم في حدّها الأقصى'
      : r.kind === 'life'
        ? 'مكافأة: قلب إضافي'
        : 'مكافأة: نجمة إضافية';
  return (
    <Animated.View entering={FadeIn.duration(400)} style={[styles.panel, { alignItems: 'center', borderColor: alpha(C.green, 0.5), backgroundColor: alpha(C.green, 0.1) }]}>
      <GameArt id="mind" size={56} />
      <Txt v="title" center>
        اكتمل المستوى {num(view.level)}
      </Txt>
      <Txt v="small" center color={C.muted}>
        {view.mistake || view.shown.some((x) => x.why === 'mistake') ? 'بهدوء وصبر، معاً.' : 'بلا خطأ واحد. عقل واحد فعلاً!'}
      </Txt>
      {r ? (
        <Row gap={6} style={{ alignItems: 'center' }}>
          <Icon name={r.kind === 'life' ? 'heart' : 'starFull'} size={18} color={r.kind === 'life' ? ROSE : GOLD} />
          <Txt v="bold" color={r.capped ? C.muted : C.text}>
            {rewardText}
          </Txt>
        </Row>
      ) : (
        <Txt v="tiny" color={C.dim}>
          {rewardText}
        </Txt>
      )}
      <View style={{ alignSelf: 'stretch' }}>
        <TimerBar endsAt={view.endsAt} total={5000} />
      </View>
      {h.isHost ? (
        <Btn size="lg" icon="next" color={BLUE} label={`إلى المستوى ${view.level + 1}`} onPress={() => h.act('next')} style={{ alignSelf: 'stretch' }} />
      ) : (
        <HostNote>المستوى {num(view.level + 1)} بعد قليل</HostNote>
      )}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

function Final({ room, view, h }: { room: RoomView; view: MindView; h: Helpers }) {
  const won = view.won === true;
  const title = won ? 'عقل واحد!' : view.won === false ? 'نفدت القلوب' : 'انتهت اللعبة';
  const sub = won
    ? `المستويات الـ${view.levels} كلها، معاً وبلا كلمة`
    : view.won === false
      ? `آخر مستوى: ${view.level} من ${view.levels}. حاولوا مرة أخرى!`
      : 'عدد اللاعبين الباقين لا يكفي للعب';
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="mind" size={84} />} title={title} sub={sub} />
      <Row gap={8} style={{ justifyContent: 'center' }}>
        <Stat icon="layers" label="بطاقات في الكومة" value={view.stats.cards} />
        <Stat icon="heart" label="قلوب ضائعة" value={view.stats.mistakes} />
        <Stat icon="starFull" label="نجوم" value={view.stats.starsUsed} />
      </Row>
      {view.won === false && view.mistake ? (
        <Txt v="small" center color={C.muted}>
          آخر خطأ: {num(view.mistake.card)} قبل {andList(view.mistake.lower.flatMap((l) => l.cards).map((c) => `${c}`))}
        </Txt>
      ) : null}
      <PlayerStrip room={room} gains={false} entries={view.players.map((id) => ({ id }))} />
      <PlayAgain room={room} />
    </>
  );
}

function Stat({ icon, label, value }: { icon: 'layers' | 'heart' | 'starFull'; label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={18} color={icon === 'heart' ? ROSE : icon === 'starFull' ? GOLD : BLUE} />
      <Txt v="h2">{num(value)}</Txt>
      <Txt v="tiny" color={C.muted} center>
        {label}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const START_OPTIONS = MIND_STARTS.map((n) => ({ key: String(n), label: n === 1 ? 'من البداية' : `من المستوى ${num(n)}` }));

export function MindSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.mind;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'mind', patch });
  const n = Math.max(2, Math.min(6, room.players.length));
  const kit = mindStartKit(n, s);
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">نقطة البداية</Txt>
      <ChipPicker<string> editable={editable} value={String(s.start)} onChange={(v) => change({ start: Number(v) })} options={START_OPTIONS} />
      <Toggle label="بداية مريحة: قلب ونجمة إضافيان" value={s.extra} editable={editable} onChange={(v) => change({ extra: v })} />
      <Row gap={8}>
        <GameArt id="mind" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          مع {num(n)} لاعبين: {num(mindLevels(n))} مستويات، {num(kit.lives)} {kit.lives === 1 ? 'قلب' : kit.lives === 2 ? 'قلبان' : 'قلوب'} و{kit.stars === 1 ? 'نجمة واحدة' : kit.stars === 2 ? 'نجمتان' : `${num(kit.stars)} نجوم`} في البداية.
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, paddingVertical: 6, paddingHorizontal: 12 },
  sep: { width: 1, height: 18, backgroundColor: C.borderStrong },
  table: { backgroundColor: INDIGO, borderRadius: 24, borderWidth: 1.5, borderColor: alpha(CREAM, 0.12), padding: 14, gap: 10 },
  big: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: alpha(INDIGO, 0.15) },
  corner: { position: 'absolute', fontFamily: F.bold, fontSize: 12, lineHeight: 16 },
  empty: { borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: alpha(CREAM, 0.3), alignItems: 'center', justifyContent: 'center', padding: 6 },
  mini: { width: 34, height: 44, borderRadius: 8, backgroundColor: alpha(CREAM, 0.9), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  miniText: { fontFamily: F.black, fontSize: 13, lineHeight: 20, color: INDIGO },
  dot: { width: 7, height: 7, borderRadius: 4 },
  mistake: { borderRadius: 16, backgroundColor: alpha(ROSE, 0.16), borderWidth: 1, borderColor: alpha(ROSE, 0.4), padding: 10, gap: 6 },
  lowerChip: { alignItems: 'center', borderRadius: 999, backgroundColor: alpha(CREAM, 0.1), paddingHorizontal: 8, paddingVertical: 2 },
  shown: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, borderWidth: 1.5, backgroundColor: alpha(CREAM, 0.08), paddingHorizontal: 6, height: 26 },
  shownText: { fontFamily: F.black, fontSize: 13, lineHeight: 20, color: alpha(CREAM, 0.85) },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 2 },
  owner: { width: 6, height: 6, borderRadius: 3 },
  card: { borderRadius: 12, backgroundColor: CREAM, borderWidth: 1.5, borderColor: alpha(INDIGO, 0.2), alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 14, gap: 10 },
  stat: { flex: 1, maxWidth: 140, alignItems: 'center', gap: 2, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 6 },
});
