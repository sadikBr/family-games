/** «هزّ 2» — the screen: the other players' hands, the table (stock, pile, suit to follow), my hand. */
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { SpanishCard } from '@/art/spanish-card';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { MA_SUIT } from '@/shared/baloot-morocco';
import { SUIT_INFO, SUITS, type Card, type Suit } from '@/shared/cards';
import type { BSuit } from '@/shared/games/baloot';
import { HEZ2_ROUND_END_MS, HEZ2_TARGETS, type Hez2View } from '@/shared/games/hez2';
import { li } from '@/shared/li';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card as Panel, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Stepper, Toggle } from '@/ui/controls';
import { Confetti, Podium, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { SuitIcon } from './baloot-suit';
import { AnnounceBanner, Felt, HandRows, PlayingCard, TurnLine, cardsWord, useTapToPlay } from './cards/card-ui';
import { CardMotion, CardStage, EASE, MOTION, SoftNumber, TurnHalo, useCardStage } from './cards/motion';
import { FromStock, STOCK_ID, tiltOf, useArrivals, usePile } from './cards/pile';
import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

/** The Moroccan suit symbol (drawn for Moroccan Baloot) for one of our suits. */
const B_OF: Record<Suit, BSuit> = Object.fromEntries((Object.keys(MA_SUIT) as BSuit[]).map((b) => [MA_SUIT[b], b])) as Record<Suit, BSuit>;
const SuitMark = ({ suit, size = 16 }: { suit: Suit; size?: number }) => <SuitIcon suit={B_OF[suit]} size={size} />;

/** Ranking at the end: fewest points first, then the better last round. */
function ranked(view: Hez2View): string[] {
  const last = view.history[view.history.length - 1] ?? {};
  return [...view.participants].sort((a, b) => (view.scores[a] ?? 0) - (view.scores[b] ?? 0) || (last[a] ?? 0) - (last[b] ?? 0));
}

export function Hez2Game({ room, view }: { room: RoomView; view: Hez2View }) {
  const h = helpers(room);
  const myTurn = view.phase === 'play' && view.turn === h.me && !view.choosing;
  // tap a card to select it, tap it again to play it (a 7 then asks for the suit)
  const tap = useTapToPlay({ canPlay: (id) => myTurn && view.playable.includes(id), onPlay: (id) => h.act('play', { card: id }) });
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase: it stays mounted from round to round, so the next deal glides in
  return (
    <CardStage>
      {view.phase === 'roundEnd' || view.phase === 'final' ? <RoundEnd room={room} view={view} h={h} /> : <Table view={view} h={h} tap={tap} myTurn={myTurn} />}
    </CardStage>
  );
}

/* ------------------------------------------------------------------ */
/* The other players                                                   */
/* ------------------------------------------------------------------ */

/**
 * The other players: avatar, cards left, points, and their hand face down. The first card of each fan
 * is where that player's cards fly from onto the pile (`seat:<id>`).
 */
function Opponents({ view, h, compact }: { view: Hez2View; h: Helpers; compact: boolean }) {
  const others = view.participants.filter((id) => id !== h.me);
  const av = compact ? 26 : 32;
  const back = compact ? 22 : 26;
  return (
    <View style={{ gap: 6 }}>
      {others.map((id) => {
        const p = h.player(id);
        const active = view.phase === 'play' && (view.choosing ? view.choosing === id : view.turn === id);
        const k = view.counts[id] ?? 0;
        return (
          <View
            key={id}
            accessibilityLabel={`${p.name}: ${cardsWord(k)}، ${num(view.scores[id] ?? 0)} نقطة${active ? ' — الدور الآن' : ''}`}
            style={[styles.opp, compact && { paddingVertical: 3 }, active && { borderColor: p.color, backgroundColor: alpha(p.color, 0.18) }]}>
            <View>
              <TurnHalo active={active} size={av} color={p.color} />
              <Avatar player={p} size={av} />
            </View>
            <View style={{ width: 74 }}>
              <Txt v="tiny" numberOfLines={1} style={{ fontSize: 13 }}>
                {p.name}
              </Txt>
              <Row gap={3}>
                <SoftNumber
                  value={k}
                  render={(v) => (
                    <Txt v="tiny" color={v === 1 ? C.yellow : C.muted} numberOfLines={1} style={{ fontSize: 11 }}>
                      {cardsWord(v)}
                    </Txt>
                  )}
                />
                <Txt v="tiny" color={C.dim} style={{ fontSize: 11 }}>
                  ·
                </Txt>
                <SoftNumber
                  value={view.scores[id] ?? 0}
                  render={(v) => (
                    <Txt v="tiny" color={C.muted} style={{ fontSize: 11 }}>
                      {num(v)}
                    </Txt>
                  )}
                />
              </Row>
            </View>
            <View style={styles.fan}>
              {Array.from({ length: Math.max(1, Math.min(k, 12)) }, (_, i) => (
                <CardMotion key={i} id={i === 0 ? `seat:${id}` : `opp:${id}:${i}`} enter="deal" from="bottom" style={{ marginStart: i === 0 ? 0 : -Math.round(back * 0.58) }}>
                  {/* an empty hand keeps an invisible first card: the seat stays a flight origin */}
                  {k ? <SpanishCard card={null} width={back} /> : <View style={{ width: back, height: back * 1.5 }} />}
                </CardMotion>
              ))}
            </View>
            {view.out === id ? (
              <View style={styles.tag}>
                <Txt v="tiny" color={C.ink} style={{ lineHeight: 16 }}>
                  آخر ورقة
                </Txt>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Suit picker (after a 7)                                             */
/* ------------------------------------------------------------------ */

function SuitPicker({ view, onPick }: { view: Hez2View; onPick: (s: Suit) => void }) {
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <Animated.View entering={FadeIn.duration(160)} style={styles.picker}>
          <Txt v="title" center>
            اختر اللون
          </Txt>
          <Txt v="small" center color={C.muted}>
            يتبعه الجميع حتى تأتي 7 أخرى
          </Txt>
          <View style={styles.suitGrid}>
            {SUITS.map((s) => {
              const mine = view.myHand.filter((c) => c.suit === s && c.rank !== 7).length;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    haptic.tap();
                    onPick(s);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={SUIT_INFO[s].name}
                  style={({ pressed }) => [styles.suitBtn, { borderColor: alpha(SUIT_INFO[s].color, 0.9), backgroundColor: alpha(SUIT_INFO[s].color, 0.22) }, pressed && { opacity: 0.8 }]}>
                  <SuitMark suit={s} size={34} />
                  <Txt v="h3">{SUIT_INFO[s].name}</Txt>
                  <Txt v="tiny" color={C.muted}>
                    {mine ? `في يدك: ${cardsWord(mine)}` : 'لا شيء في يدك'}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const HAND_W = 68;

/** Just enough overlap for the whole hand to fit (every card keeps its corner index visible); a long hand scrolls. */
function handOverlap(k: number, room: number): number {
  if (k < 2) return 0;
  const step = Math.max(22, Math.min(HAND_W + 4, (room - HAND_W) / (k - 1)));
  return Math.round(HAND_W - step);
}

const PLAIN_LINE = 'اختر ورقة واضغطها مرة ثانية للعب';

/** What to do now, on my turn. */
function instruction(view: Hez2View, me: string): string {
  if (view.pending) return view.playable.length ? `ردّ بـ2 أو اسحب ${cardsWord(view.pending)}` : `لا 2 في يدك — اسحب ${cardsWord(view.pending)}`;
  if (view.drawn && view.playable.length) return 'الورقة المسحوبة تصلح — العبها أو مرّر';
  if (!view.playable.length) return view.myHand.length === 1 && view.myHand[0].rank === 10 ? 'لا تنتهي الأوراق بالخادم — اسحب ورقة' : 'لا توجد ورقة مناسبة — اسحب';
  if (view.again === me) return 'دور إضافي — العب ورقة أخرى';
  return PLAIN_LINE;
}

function Table({ view, h, tap, myTurn }: { view: Hez2View; h: Helpers; tap: ReturnType<typeof useTapToPlay>; myTurn: boolean }) {
  const stage = useCardStage();
  const accent = useAccent();
  const width = useContentWidth();
  // short phones (320×640…): thinner player rows and a smaller pile, so the hand stays on screen
  const compact = useWindowDimensions().height < 720;
  const overlap = handOverlap(view.myHand.length, width - 20);
  const topW = Math.min(compact ? 66 : 88, Math.floor(width / 4.2));
  const stockW = Math.round(topW * 0.8);
  const selected = view.myHand.find((c) => c.id === tap.selected) ?? null;
  // a single card drawn glides from the stock; several at once (a penalty) are dealt in turn
  const added = useArrivals(view.myHand.map((c) => c.id));
  const fromStock = added.length === 1 ? added[0] : null;
  // the pile: the card under the top one stays visible while the next card glides onto it
  const top = view.top;
  const { under } = usePile(top, (c) => c.id, view.topBy ? 'cover' : 'reset');
  const lastBy = view.topBy ? h.player(view.topBy) : null;
  // my card flies from my hand; another player's from the first card of their fan
  const topMotionId = top ? (!lastBy || lastBy.id === h.me ? top.id : `seat:${lastBy.id}`) : 'none';
  const handLayout = stage?.reduced ? undefined : LinearTransition.duration(MOTION.glide).easing(EASE);
  const over = view.phase === 'over';
  const ev = view.event;

  // one instruction line, shown on my turn only (the turn bar already says whose turn it is); while it
  // is not my turn the line fades out keeping its plain text, so it never flashes another one
  const turnText = myTurn ? instruction(view, h.me) : PLAIN_LINE;

  const banner = ev
    ? {
        id: ev.id,
        by: ev.kind === 'suit' ? ev.by : (ev.target ?? null),
        text:
          ev.kind === 'two'
            ? `+${num(ev.n ?? 2)} ${ev.target === h.me ? 'عليك!' : `على ${h.player(ev.target).name}`}`
            : ev.kind === 'skip'
              ? ev.target === h.me
                ? 'دورك ضائع!'
                : `دور ضائع على ${h.player(ev.target).name}`
              : ev.kind === 'suit'
                ? `اللون: ${SUIT_INFO[ev.suit ?? 'coins'].name}`
                : `عادت العقوبة: ${cardsWord(ev.n ?? 2)}`,
      }
    : null;

  return (
    <>
      <Opponents view={view} h={h} compact={compact} />

      <Felt active={myTurn} minHeight={0}>
        {/* what the next card must follow, and what is pending */}
        <Row gap={6} wrap center>
          <View style={[styles.pill, { borderColor: alpha(SUIT_INFO[view.suit].color, 0.95), backgroundColor: 'rgba(0,0,0,0.28)' }]} accessibilityLabel={`اللون المطلوب: ${SUIT_INFO[view.suit].name}`}>
            <SuitMark suit={view.suit} size={16} />
            <Txt v="tiny" color="#FFFFFF">
              {view.suitChosen ? 'اللون المختار' : 'اللون'}: {SUIT_INFO[view.suit].name}
            </Txt>
          </View>
          {view.pending ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.pill, { backgroundColor: C.red, borderColor: C.red }]}>
              <Txt v="tiny" color="#FFFFFF">
                +{num(view.pending)} للسحب
              </Txt>
            </Animated.View>
          ) : null}
          {view.again ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.pill, { borderColor: alpha(C.yellow, 0.9), backgroundColor: alpha(C.yellow, 0.18) }]}>
              <Txt v="tiny" color={C.yellow} numberOfLines={1}>
                دور إضافي {view.again === h.me ? 'لك' : li(h.player(view.again).name)}
              </Txt>
            </Animated.View>
          ) : null}
        </Row>

        <Row center gap={22}>
          <Pressable disabled={!view.canDraw} onPress={() => h.act('draw')} style={[styles.pile, view.canDraw && styles.pileActive]} accessibilityRole="button" accessibilityLabel={view.pending ? `اسحب ${cardsWord(view.pending)}` : 'اسحب ورقة'}>
            <CardMotion id={STOCK_ID}>{view.deckLeft ? <SpanishCard card={null} width={stockW} /> : <View style={[styles.emptyStock, { width: stockW, height: stockW * 1.5 }]} />}</CardMotion>
            <Txt v="tiny" center color="rgba(255,255,255,0.85)">
              الكومة ({num(view.deckLeft)})
            </Txt>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: topW + 12, height: topW * 1.5 + 12 }}>
              {/* the previous top card keeps its element and simply lies under the new one */}
              {top
                ? [...(under && under.id !== top.id ? [under] : []), top].map((c) => {
                    const isTop = c === top;
                    return (
                      <CardMotion
                        key={c.id}
                        id={isTop ? topMotionId : `under:${c.id}`}
                        enter={isTop && lastBy ? 'play' : 'none'}
                        from="top"
                        source={false}
                        place={{ x: 6, y: 6, rot: tiltOf(c.id) }}>
                        <View style={styles.topCard}>
                          <SpanishCard card={c} width={topW} />
                        </View>
                      </CardMotion>
                    );
                  })
                : null}
              {lastBy && top ? (
                <Animated.View key={`by-${top.id}`} entering={FadeIn.duration(220).delay(MOTION.fly - 60)} style={styles.playedBy} pointerEvents="none">
                  <Avatar player={lastBy} size={24} ring={lastBy.color} />
                </Animated.View>
              ) : null}
            </View>
            <Txt v="tiny" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ maxWidth: topW + 40 }}>
              {lastBy ? `من ${lastBy.id === h.me ? 'عندك' : lastBy.name}` : 'المكشوفة'}
            </Txt>
          </View>
        </Row>
        {view.out ? (
          <Txt v="tiny" center color={C.yellow}>
            آخر ورقة من {view.out === h.me ? 'عندك' : h.player(view.out).name}: 2 — لا تنتهي الجولة حتى تُسحب عقوبتها
          </Txt>
        ) : null}
        <AnnounceBanner announce={banner} h={h} />
      </Felt>

      {/* one line that keeps its place: the hand under it never jumps */}
      {over ? (
        <Animated.View entering={FadeIn.duration(220)}>
          <Txt v="bold" center color={C.green} numberOfLines={1}>
            {view.roundWinner ? `انتهت الجولة — الفوز بها ${view.roundWinner === h.me ? 'لك' : li(h.player(view.roundWinner).name)}` : 'انتهت الجولة'}
          </Txt>
        </Animated.View>
      ) : view.choosing && view.choosing !== h.me ? (
        <Txt v="bold" center color={C.muted} numberOfLines={1}>
          اختيار اللون: {h.player(view.choosing).name}…
        </Txt>
      ) : (
        <TurnLine myTurn={myTurn} text={turnText} keep />
      )}

      {/* my hand */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand}>
        {view.myHand.map((c, i) => {
          const ok = view.playable.includes(c.id);
          const fresh = c.id === fromStock;
          return (
            // the selected card comes to the front, so the second tap lands on it and not on a neighbour
            <Animated.View key={c.id} layout={handLayout} style={{ marginStart: i === 0 ? 0 : -overlap, zIndex: c.id === selected?.id ? 50 : i }}>
              <CardMotion id={c.id} enter={fresh ? 'none' : 'deal'} from="top">
                <FromStock id={c.id} fromStock={fresh}>
                  <PlayingCard card={c} size="lg" selected={c.id === selected?.id} glow={c.id === view.drawn} dim={myTurn && !ok} onPress={myTurn && ok ? () => tap.tap(c.id) : undefined} steady />
                </FromStock>
              </CardMotion>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* the buttons keep their place for the whole round: nothing jumps when a card is selected */}
      <Row gap={10} style={{ minHeight: 56 }}>
        {myTurn && selected ? <Btn flex size="lg" icon="down" label="العب الورقة" onPress={tap.play} /> : null}
        {view.canDraw && !selected ? (
          <Btn flex size="lg" icon="layers" label={view.pending ? `اسحب ${cardsWord(view.pending)}` : 'اسحب ورقة'} color={view.pending ? C.red : undefined} ghost={!view.pending} onPress={() => h.act('draw')} />
        ) : null}
        {view.canPass && !selected ? <Btn flex size="lg" icon="skip" label="مرّر" ghost onPress={() => h.act('pass')} /> : null}
      </Row>

      <Row gap={4} center>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Txt v="tiny" color={C.dim}>
          الجولة {num(view.round)} · نقاطك
        </Txt>
        <SoftNumber
          value={view.scores[h.me] ?? 0}
          render={(k) => (
            <Txt v="tiny" color={C.dim}>
              {num(k)}
            </Txt>
          )}
        />
        <Txt v="tiny" color={C.dim}>
          — النهاية عند {num(view.target)}، والأقل يفوز
        </Txt>
      </Row>

      {view.choosing === h.me && view.phase === 'play' ? <SuitPicker view={view} onPick={(s) => h.act('suit', { suit: s })} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* End of a round / of the game                                        */
/* ------------------------------------------------------------------ */

/** Every round's points, player by player, and the totals (fewest = best). */
function ScoreSheet({ view, h }: { view: Hez2View; h: Helpers }) {
  const ids = view.participants;
  const leader = ranked(view)[0];
  const rows = view.history.slice(-8);
  const skipped = view.history.length - rows.length;
  return (
    <Panel style={{ gap: 6 }}>
      <Txt v="small" color={C.muted}>
        ورقة النقاط — النهاية عند {num(view.target)}
      </Txt>
      <Row gap={4}>
        <View style={styles.sheetLabel} />
        {ids.map((id) => (
          <View key={id} style={styles.sheetCell}>
            <Avatar player={h.player(id)} size={26} crown={view.phase === 'final' && id === view.winner} />
          </View>
        ))}
      </Row>
      {rows.map((r, i) => (
        <Row key={i} gap={4} style={styles.sheetRow}>
          <Txt v="tiny" color={C.dim} style={styles.sheetLabel}>
            الجولة {num(skipped + i + 1)}
          </Txt>
          {ids.map((id) => (
            <Txt key={id} v="small" center color={r[id] ? C.text : C.green} style={styles.sheetCell}>
              {r[id] === undefined ? '—' : num(r[id])}
            </Txt>
          ))}
        </Row>
      ))}
      <Row gap={4} style={[styles.sheetRow, styles.sheetTotal]}>
        <Txt v="tiny" color={C.muted} style={styles.sheetLabel}>
          المجموع
        </Txt>
        {ids.map((id) => (
          <Txt key={id} center style={[styles.sheetCell, { fontFamily: F.black, fontSize: 17, lineHeight: 26, color: id === leader ? C.green : (view.scores[id] ?? 0) >= view.target ? C.red : C.text }]}>
            {num(view.scores[id] ?? 0)}
          </Txt>
        ))}
      </Row>
    </Panel>
  );
}

function RoundEnd({ room, view, h }: { room: RoomView; view: Hez2View; h: Helpers }) {
  const final = view.phase === 'final';
  const winner = final ? view.winner : view.roundWinner;
  const won = winner === h.me;
  const mine = view.roundSummary?.find((r) => r.id === h.me);
  const title = winner ? (final ? `الفوز ${li(h.player(winner).name)}` : `الجولة ${num(view.round)} ${li(h.player(winner).name)}`) : 'انتهت اللعبة';
  let sub: string | undefined;
  if (final && winner) sub = `أقل النقاط: ${num(view.scores[winner] ?? 0)}`;
  else if (view.stuck) sub = 'لا أوراق للسحب — الفوز للأقل نقاطاً في يده';
  else if (mine) sub = mine.points ? `عليك ${num(mine.points)} نقطة من أوراقك الباقية` : 'لا نقاط عليك في هذه الجولة';
  const order = ranked(view);
  const rows = [...(view.roundSummary ?? [])].sort((a, b) => a.points - b.points);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="hez2" size={84} />} title={title} sub={sub} />
      {final ? <Podium players={order.map((id) => h.player(id))} scores={view.scores} lowIsBetter /> : null}
      {rows.length ? (
        <HandRows
          title={`الأوراق الباقية — الجولة ${num(view.round)}`}
          rows={rows.map((r) => ({
            key: r.id,
            players: [h.player(r.id)],
            name: `${h.player(r.id).name}${r.id === h.me ? ' (أنت)' : ''}`,
            detail: r.cards.length ? cardsWord(r.cards.length) : 'يد فارغة',
            points: num(`+${r.points}`),
            tone: r.id === view.roundWinner ? 'good' : r.points ? 'bad' : 'plain',
            extra: r.cards.length ? (
              <Row wrap gap={3} style={{ paddingStart: 34 }}>
                {r.cards.map((c: Card) => (
                  <SpanishCard key={c.id} card={c} width={26} />
                ))}
              </Row>
            ) : undefined,
          }))}
        />
      ) : null}
      <ScoreSheet view={view} h={h} />
      {final ? (
        <PlayAgain room={room} />
      ) : (
        <View style={{ gap: 10 }}>
          <TimerBar endsAt={view.nextAt} total={HEZ2_ROUND_END_MS} />
          {h.isHost ? <Btn size="xl" icon="cards" label="الجولة التالية" onPress={() => h.act('next')} /> : <HostNote>الجولة التالية تبدأ تلقائياً، أو عندما يوزّع المضيف</HostNote>}
        </View>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

export function Hez2Settings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.hez2;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'hez2', patch });
  return (
    <View style={{ gap: 8 }}>
      <Stepper label="حدّ النقاط" value={s.target} min={HEZ2_TARGETS[0]} max={HEZ2_TARGETS[HEZ2_TARGETS.length - 1]} step={50} editable={editable} onChange={(target) => change({ target })} />
      <Toggle label="آخر ورقة 2: لا تنتهي الجولة حتى تُسحب عقوبتها" value={s.lastTwo} editable={editable} onChange={(lastTwo) => change({ lastTwo })} />
      <Txt v="tiny" color={C.dim}>
        {s.lastTwo ? 'إن ردّ الجميع بـ2 وعادت العقوبة إلى صاحبها، يسحبها ويكمل اللعب.' : 'يسحب اللاعب التالي العقوبة وتنتهي الجولة فوراً.'}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  opp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  fan: { flex: 1, flexDirection: 'row', overflow: 'hidden', direction: 'ltr' },
  tag: { backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 2 },
  pile: { alignItems: 'center', gap: 4, padding: 5, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.12) },
  emptyStock: { borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  topCard: {
    borderRadius: 9,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  playedBy: { position: 'absolute', top: -6, right: -6 },
  hand: { flexGrow: 1, justifyContent: 'center', paddingTop: 16, paddingBottom: 4, paddingHorizontal: 4, direction: 'ltr' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' },
  picker: { backgroundColor: C.bg2, borderRadius: 24, padding: 18, gap: 12, width: '100%', maxWidth: 380 },
  suitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  suitBtn: { flexBasis: '40%', flexGrow: 1, minHeight: 104, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  sheetLabel: { width: 58 },
  sheetCell: { flex: 1, alignItems: 'center' },
  sheetRow: { paddingVertical: 2, borderTopWidth: 1, borderTopColor: C.border },
  sheetTotal: { borderTopColor: C.borderStrong, paddingTop: 4 },
});
