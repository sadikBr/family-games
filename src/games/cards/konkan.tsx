import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CARD_RATIO } from '@/art/spanish-card';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { isKonkanMeld, type Card } from '@/shared/cards';
import type { KonkanViewPlus } from '@/shared/games/konkan';
import type { KonkanView, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers, type Helpers } from '../helpers';
import { CardRow, Felt, HandRows, PlayingCard, TableStrip, TurnLine, cardsWord } from './card-ui';
import { Grow, HandRow, handSize } from './hand';
import { CardMotion, CardStage, MOTION, useLeaving } from './motion';
import { usePicks } from './pick';

/** the piles' cards (size md: 58 px wide, plus the 2 px frame of PlayingCard) */
const PILE_W = 62;
const PILE_H = 58 * CARD_RATIO + 4;

type Picks = ReturnType<typeof usePicks>;

/** cards dealt to each player (as on the server): the hand's card size is chosen from it once per hand, so the cards never change size mid-hand */
const dealSize = (players: number) => (players <= 2 ? 10 : players === 3 ? 8 : 7);

export function KonkanGame({ room, view: base }: { room: RoomView; view: KonkanView }) {
  const h = helpers(room);
  const view = base as KonkanViewPlus;
  const playing = view.phase === 'play' && view.turn === h.me && view.step === 'play';
  // tap cards to pick them (a group to lay down); a lone picked card tapped again is thrown away
  const picks = usePicks({
    resetKey: `${view.phase}:${view.hand}:${view.turn}:${view.step}`,
    canPick: (id) => playing && view.myHand.some((c) => c.id === id),
    quick: (id) => !(id === view.takenDiscard && view.myHand.length > 1),
    onQuick: (id) => h.act('discard', { card: id }),
  });
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase, so it stays mounted from hand to hand (new hands then deal in smoothly)
  return (
    <CardStage>
      <KonkanScreen room={room} view={view} picks={picks} />
    </CardStage>
  );
}

function KonkanScreen({ room, view, picks }: { room: RoomView; view: KonkanViewPlus; picks: Picks }) {
  const h = helpers(room);
  const width = useContentWidth();
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const drawing = myTurn && view.step === 'draw';
  const playing = myTurn && view.step === 'play';
  const sel = picks.picked;
  const selected: Card[] = view.myHand.filter((c) => sel.includes(c.id));
  const validMeld = isKonkanMeld(selected);
  // the card just taken from the discard pile can't be thrown straight back (unless it's the last one)
  const justTaken = selected.length === 1 && selected[0].id === view.takenDiscard && view.myHand.length > 1;
  const amOut = !view.active.includes(h.me);

  if (view.phase === 'handEnd' || view.phase === 'final') {
    const final = view.phase === 'final';
    const won = final && view.winner === h.me;
    return (
      <>
        {won || (!final && view.handWinner === h.me) ? <Confetti /> : null}
        <ResultBanner
          tone={(final ? view.winner : view.handWinner) === h.me ? 'good' : 'neutral'}
          art={<GameArt id="konkan" size={72} />}
          title={final ? `الفوز ${li(h.player(view.winner).name)}` : view.handWinner ? `${h.player(view.handWinner).name}: كونكان` : 'انتهت الأوراق'}
        />
        {final ? <Podium players={view.participants.map((id) => h.player(id))} scores={view.scores} lowIsBetter /> : null}
        <View style={{ gap: 6 }}>
          <Txt v="small" center color={C.muted}>
            نقاط الخسارة — من يصل {num(view.limit)} يخرج
          </Txt>
          <Scoreboard players={room.players} scores={view.scores} lowIsBetter highlight={h.me} />
        </View>
        {view.handSummary ? (
          <HandRows
            title="الأوراق الباقية في اليد (الصور = 10)"
            rows={view.handSummary.map((r) => ({
              key: r.id,
              players: [h.player(r.id)],
              name: h.player(r.id).name,
              points: num(`+${r.points}`),
              tone: r.points ? 'bad' : 'good',
              extra: r.cards.length ? <CardRow cards={r.cards} size="xs" gap={3} /> : undefined,
            }))}
          />
        ) : null}
        {final ? (
          <PlayAgain room={room} />
        ) : h.isHost ? (
          <Btn size="xl" icon="cards" label="اليد التالية" onPress={() => h.act('next')} />
        ) : (
          <HostNote>المضيف يوزّع اليد التالية</HostNote>
        )}
      </>
    );
  }

  const fitsAny = playing && selected.length > 0 && view.melds.some((m) => isKonkanMeld([...m.cards, ...selected]));
  const hint =
    selected.length === 0
      ? 'اختر 3 أوراق أو أكثر لتنزيل مجموعة، أو اضغط ورقة مرتين لرميها'
      : justTaken
        ? 'لا يمكنك رمي الورقة التي أخذتها للتو'
        : selected.length === 1
          ? fitsAny
            ? 'اضغطها مرة ثانية لرميها، أو اضغط المجموعة المضيئة لإضافتها'
            : 'اضغطها مرة ثانية لرميها، أو اختر أوراقاً أخرى لمجموعة'
          : validMeld
            ? 'مجموعة صحيحة — اضغط «نزّل»'
            : fitsAny
              ? 'اضغط المجموعة المضيئة لإضافة الأوراق إليها'
              : 'مجموعة: 3–4 من الرقم نفسه، أو 3 متتالية من النوع نفسه';

  return (
    <>
      <TableStrip
        room={room}
        ids={view.participants}
        turn={view.turn}
        score={(id) => view.scores[id] ?? 0}
        sub={(id) => (view.active.includes(id) ? cardsWord(view.handCounts[id] ?? 0) : 'خارج اللعبة')}
        out={view.participants.filter((id) => !view.active.includes(id))}
        note={`نقاط الخسارة — من يصل ${num(view.limit)} يخرج`}
      />

      {/* table: piles + melds */}
      <Felt active={myTurn} minHeight={0}>
        <Row center gap={18}>
          <StockPile view={view} h={h} drawing={drawing} />
          <DiscardPile view={view} h={h} drawing={drawing} />
        </Row>
        {/* the table grows smoothly when a new group is laid down */}
        <Grow>
          <View style={{ gap: 10 }}>
            {view.melds.map((m) => {
              const fits = playing && selected.length > 0 && isKonkanMeld([...m.cards, ...selected]);
              const fresh = view.lastMeld?.id === m.id ? h.player(view.lastMeld.by).color : null;
              return (
                <Animated.View key={m.id} entering={FadeIn.duration(220)}>
                  <Pressable
                    disabled={!fits}
                    onPress={() => {
                      haptic.tap();
                      h.act('layoff', { cards: sel, meld: m.id });
                      picks.clear();
                    }}
                    accessibilityLabel={fits ? 'أضف الأوراق إلى هذه المجموعة' : undefined}
                    style={[styles.meld, fresh ? { borderColor: alpha(fresh, 0.9) } : null, fits && styles.meldFits]}>
                    <Avatar player={h.player(m.owner)} size={22} />
                    <View style={{ flex: 1 }}>
                      {/* laid-down cards glide from my hand; other players' slide in from the top (their strip) */}
                      <CardRow cards={m.cards} size="xs" gap={3} motion={{ enter: 'play', from: 'top' }} />
                    </View>
                    {fits ? (
                      <Txt v="tiny" color={C.yellow}>
                        أضف هنا
                      </Txt>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Grow>
      </Felt>

      <View style={{ gap: 14 }}>
        {amOut ? (
          <Txt v="bold" center color={C.muted}>
            خرجت من اللعبة — تابع الآخرين
          </Txt>
        ) : (
          <TurnLine myTurn={myTurn} text={drawing ? 'اسحب من الكومة أو خذ المرمية' : 'نزّل مجموعاتك ثم ارمِ ورقة'} keep />
        )}

        <View style={{ gap: 10, paddingTop: 6 }}>
          {/* one card size for the whole hand, chosen from the deal; always pressable (picks ignores a tap
              when it isn't my move): dropping the press handler would rebuild every card face and blink the hand */}
          <HandRow
            cards={view.myHand}
            size={handSize(dealSize(view.active.length) + 1, width)}
            selected={sel}
            onPress={(c) => picks.tap(c.id)}
            keep={String(view.hand)}
          />
          {/* the buttons keep their place for the whole hand: nothing jumps when the turn comes or goes */}
          {amOut ? null : (
            <View style={{ minHeight: 92, gap: 8 }}>
              {playing ? (
                <>
                  <Row gap={8}>
                    <Btn
                      flex
                      size="md"
                      icon="layers"
                      label="نزّل"
                      color={C.green}
                      disabled={!validMeld}
                      onPress={() => {
                        h.act('meld', { cards: sel });
                        picks.clear();
                      }}
                    />
                    <Btn
                      flex
                      size="md"
                      icon="trash"
                      label="ارمِ"
                      ghost
                      disabled={selected.length !== 1 || justTaken}
                      onPress={() => {
                        h.act('discard', { card: sel[0] });
                        picks.clear();
                      }}
                    />
                    <Btn size="md" icon="close" ghost disabled={!sel.length} onPress={picks.clear} style={!sel.length && styles.off} />
                  </Row>
                  <Txt v="tiny" center color={C.dim} numberOfLines={2}>
                    {hint}
                  </Txt>
                </>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </>
  );
}

/** The face-down stock; when someone draws, a card back slides off toward them (my hand below, the others above). */
function StockPile({ view, h, drawing }: { view: KonkanViewPlus; h: Helpers; drawing: boolean }) {
  const left = useLeaving([view.stockLeft], (n) => String(n));
  // only a single draw (a reshuffle makes the stock grow again)
  const drawn = left.filter((x) => x.leaving && x.item === view.stockLeft + 1);
  const toMe = view.turn === h.me;
  return (
    <Pressable
      disabled={!drawing}
      onPress={() => h.act('drawStock')}
      style={[styles.pile, drawing && styles.pileActive]}
      accessibilityRole="button"
      accessibilityLabel={`الكومة: ${num(view.stockLeft)}`}>
      <View style={styles.pileBox}>
        {view.stockLeft ? <PlayingCard card={null} size="md" /> : <View style={styles.emptyPile} />}
        {drawn.map((x) => (
          <CardMotion key={x.key} id={`konkan-stock-${x.key}`} source={false} leaving leave={{ to: { x: 0, y: toMe ? 90 : -80 }, scale: 0.9 }} style={styles.stack}>
            <PlayingCard card={null} size="md" />
          </CardMotion>
        ))}
      </View>
      <Txt v="tiny" center color="rgba(255,255,255,0.8)">
        الكومة ({num(view.stockLeft)})
      </Txt>
    </Pressable>
  );
}

/**
 * The face-up discard pile. A thrown card glides onto it (from my hand, or in from the top for the
 * others) over the card it covers; a card taken from it glides into my hand, or slides off toward
 * the player who took it.
 */
function DiscardPile({ view, h, drawing }: { view: KonkanViewPlus; h: Helpers; drawing: boolean }) {
  const top = view.discardTop;
  const items = useLeaving(top ? [top] : [], (c) => c.id);
  const gone = items.filter((x) => x.leaving).map((x) => x.item);
  const taken = (c: Card) => c.id === view.takenDiscard;
  // a covered card stays under the new one until it has landed
  const covered = gone.filter((c) => !taken(c));
  // a card I took is in my hand now (it flies there by itself)
  const takenByOther = gone.filter((c) => taken(c) && !view.myHand.some((x) => x.id === c.id));
  const thrower = view.discardBy ? h.player(view.discardBy) : null;
  const can = drawing && !!top;
  return (
    <Pressable
      disabled={!can}
      onPress={() => h.act('drawDiscard')}
      style={[styles.pile, can && styles.pileActive]}
      accessibilityRole="button"
      accessibilityLabel={thrower ? `المرمية من ${thrower.name}` : 'المرمية'}>
      <View style={styles.pileBox}>
        {!top && !covered.length ? <View style={styles.emptyPile} /> : null}
        {covered.map((c) => (
          <View key={c.id} style={styles.stack}>
            <PlayingCard card={c} size="md" />
          </View>
        ))}
        {top ? (
          // a card uncovered by a take was already there: it does not arrive
          <CardMotion key={top.id} id={top.id} enter={view.takenDiscard ? 'none' : 'play'} from={view.discardBy === h.me ? 'bottom' : 'top'} style={styles.stack}>
            <PlayingCard card={top} size="md" ring={thrower?.color} />
          </CardMotion>
        ) : null}
        {takenByOther.map((c) => (
          <CardMotion key={`taken-${c.id}`} id={c.id} source={false} leaving leave={{ to: { x: 0, y: -80 }, scale: 0.9 }} style={styles.stack}>
            <PlayingCard card={c} size="md" />
          </CardMotion>
        ))}
        {top && thrower ? (
          <Animated.View key={`by-${top.id}`} entering={FadeIn.delay(MOTION.fly - 60).duration(200)} style={styles.thrower} pointerEvents="none">
            <Avatar player={thrower} size={20} />
          </Animated.View>
        ) : null}
      </View>
      <Txt v="tiny" center color="rgba(255,255,255,0.8)" numberOfLines={1} style={{ maxWidth: 90 }}>
        {thrower ? `من ${thrower.name}` : 'المرمية'}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pile: { alignItems: 'center', gap: 4, padding: 6, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow },
  pileBox: { width: PILE_W, height: PILE_H },
  stack: { position: 'absolute', left: 0, top: 0 },
  emptyPile: { width: PILE_W, height: PILE_H, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' },
  meld: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  meldFits: { borderColor: C.yellow },
  thrower: { position: 'absolute', top: -8, right: -8 },
  off: { opacity: 0.45 },
});
