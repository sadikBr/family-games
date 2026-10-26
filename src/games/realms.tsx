/** «الممالك الخمس» — the screen: the round line, the table (piles, the groups of whoever went out), my hand. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { RealmCard, RealmsView } from '@/shared/games/realms';
import { cardPoints, isJoker, isWild, rankLabel, realmCardName } from '@/shared/realms-rules';
import type { RoomView } from '@/shared/protocol';
import { li } from '@/shared/li';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { AnnounceBanner, DOUBLE_TAP_MS, Felt, TableStrip, TurnLine, cardsWord, tapClock } from './cards/card-ui';
import { CardMotion, CardStage, SoftNumber } from './cards/motion';
import { FromStock, STOCK_ID, tiltOf, useArrivals, usePile, type PileChange } from './cards/pile';
import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { GroupsRow, REALM_RATIO, RealmCardView } from './realms-card';
import { RoundEnd } from './realms-parts';

export { RealmsSettings } from './realms-parts';

export function RealmsGame({ room, view }: { room: RoomView; view: RealmsView }) {
  const h = helpers(room);
  if (!view.participants.includes(h.me) || (!view.active.includes(h.me) && view.phase === 'play')) return <Spectator room={room} />;
  // one stage for every phase: it stays mounted from round to round, so the next deal glides in
  return <CardStage>{view.phase !== 'play' ? <RoundEnd room={room} view={view} h={h} /> : <PlayTable room={room} view={view} h={h} />}</CardStage>;
}

/** «الجولة 3 — الأوراق: 5 — الجوكر: 5», with the round's wild drawn as a golden chip. */
export function RoundLine({ view }: { view: RealmsView }) {
  const accent = useAccent();
  return (
    <Row gap={8} style={[styles.roundLine, { borderColor: alpha(accent, 0.55) }]}>
      <View style={styles.wildChip} accessibilityLabel={`جوكر الجولة: ${rankLabel(view.wild)}`}>
        <Icon name="starFull" size={14} color={C.ink} />
        <Txt style={styles.wildChipText}>{rankLabel(view.wild)}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="bold" numberOfLines={1}>
          الجولة {num(view.round)} — الأوراق: {num(view.dealt)} — الجوكر: {rankLabel(view.wild)}
        </Txt>
        <Txt v="tiny" color={C.muted} numberOfLines={1}>
          من {num(view.rounds)} {view.rounds > 10 ? 'جولة' : 'جولات'} · والجوكر ★ جوكر دائماً · المجموع الأقل يفوز
        </Txt>
      </View>
    </Row>
  );
}

function PlayTable({ room, view, h }: { room: RoomView; view: RealmsView; h: Helpers }) {
  const width = useContentWidth();
  // my order of the hand (per round: card ids come back in the next deal), the selected card
  const [order, setOrder] = useState<{ round: number; ids: string[] }>({ round: 0, ids: [] });
  const [picked, setPicked] = useState<{ round: number; id: string | null }>({ round: 0, id: null });
  const [tapAt, setTapAt] = useState<{ id: string; at: number } | null>(null);

  const top = view.discardTop;
  const pileHow: PileChange = !top || view.step === 'discard' ? 'take' : view.discardBy ? 'cover' : 'reset';
  const pile = usePile(top, (c) => c.id, pileHow);
  const added = useArrivals(view.myHand.map((c) => c.id));
  const fromStock = added.length === 1 && added[0] !== pile.taken?.id ? added[0] : null;

  const plan = view.plan;
  // the best arrangement: the groups, the cards that fit nowhere, and (on my turn) the card to throw last
  const arranged = plan ? [...plan.groups.flat(), ...plan.left, ...(plan.throw ? [plan.throw] : [])] : view.myHand.map((c) => c.id);
  // a new round starts in the best arrangement; then the cards keep the order I gave them, new ones at the end
  if (order.round !== view.round && plan) setOrder({ round: view.round, ids: arranged });
  const byId = new Map(view.myHand.map((c) => [c.id, c]));
  const base = order.round === view.round ? order.ids.filter((id) => byId.has(id)) : arranged.filter((id) => byId.has(id));
  const shownIds = [...base, ...view.myHand.map((c) => c.id).filter((id) => !base.includes(id))];
  const shown = shownIds.map((id) => byId.get(id)!);
  const sel = picked.round === view.round && picked.id && byId.has(picked.id) ? picked.id : null;
  const selCard = sel ? byId.get(sel)! : null;

  const myTurn = view.turn === h.me;
  const drawing = myTurn && view.step === 'draw';
  const throwing = myTurn && view.step === 'discard';
  const lastLap = !!view.outBy;
  const myLast = lastLap && view.lastTurn.includes(h.me);
  const outs = plan?.outCards ?? [];
  // the cards that would count against me (the card to throw too, unless it's the one to go out with)
  const leftSet = new Set([...(plan?.left ?? []), ...(plan?.throw && !outs.includes(plan.throw) ? [plan.throw] : [])]);
  const canThrow = (c: RealmCard) => throwing && c.id !== view.taken;

  const setSel = (id: string | null) => setPicked({ round: view.round, id });
  /** the card to go out with: the selected one if it works, else the dearest that works */
  const outCard = outs.length
    ? sel && outs.includes(sel)
      ? sel
      : plan?.throw && outs.includes(plan.throw)
        ? plan.throw
        : outs[0]
    : null;
  const goOut = (id: string) => {
    h.act('out', { card: id });
    setSel(null);
  };
  const throwCard = (id: string) => {
    // a throw that lays everything else down is a going out (or, on a last turn, the same throw)
    if (outs.includes(id) && !lastLap) goOut(id);
    else h.act('discard', { card: id });
    setSel(null);
  };
  const tapCard = (c: RealmCard) => {
    const now = tapClock();
    if (sel === c.id) {
      if (tapAt?.id === c.id && now - tapAt.at < DOUBLE_TAP_MS) return; // the same touch twice
      if (canThrow(c)) throwCard(c.id);
      else setSel(null);
      return;
    }
    setTapAt({ id: c.id, at: now });
    setSel(c.id);
  };
  /** move the selected card one place left or right in my hand (my own order) */
  const shift = (d: -1 | 1) => {
    if (!sel) return;
    const ids = shownIds.slice();
    const i = ids.indexOf(sel);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder({ round: view.round, ids });
  };
  const sortBest = () => {
    haptic.tap();
    setOrder({ round: view.round, ids: arranged });
  };

  // sizes from the screen width (fits 320 px phones): 5 cards a line in the hand
  const handGap = 5;
  const handW = Math.max(40, Math.min(58, Math.floor((width - 8 - 4 * handGap) / 5) - 4));
  const pileW = Math.min(58, Math.floor(width / 6));
  const outW = Math.max(22, Math.min(30, Math.floor((width - 60) / 10)));
  const thrower = view.discardBy ? h.player(view.discardBy) : null;
  const outName = view.outBy ? h.player(view.outBy).name : '';

  // the one instruction line under the hand
  let hint = '';
  if (drawing) hint = myLast ? 'دورك الأخير: اسحب من الكومة أو خذ المكشوفة' : 'اضغط على الكومة، أو على الورقة المكشوفة لتأخذها';
  else if (throwing) {
    if (myLast && plan?.best) {
      const b = byId.get(plan.best.card);
      hint = plan.best.points === 0 ? `ارمِ ${b ? realmCardName(b) : ''} وتدخل كل أوراقك في مجموعات: صفر` : `أقل ما يبقى عليك: ${num(plan.best.points)} نقطة (برمي ${b ? realmCardName(b) : ''})`;
    } else if (selCard && selCard.id === view.taken) hint = 'لا يمكن رمي الورقة المأخوذة للتو';
    else if (selCard && outs.includes(selCard.id) && !lastLap) hint = 'اضغطها مرة ثانية لتخرج بها';
    else if (selCard) hint = 'اضغطها مرة ثانية لترميها، أو انقلها بالسهمين';
    else if (outs.length && !lastLap) hint = 'كل أوراقك تصلح! اضغط «اخرج»';
    else hint = 'اختر ورقة لترميها (اضغطها مرتين)';
  } else if (selCard) hint = 'انقل الورقة بالسهمين لترتيب يدك';
  else hint = myLast ? `خروج ${li(outName)} — بقي لك دور أخير` : 'الأوراق ذات الرقم الأحمر لا تدخل في مجموعة بعد';

  return (
    <>
      <TableStrip
        room={room}
        ids={view.participants.filter((id) => view.active.includes(id))}
        turn={view.turn}
        score={(id) => view.scores[id] ?? 0}
        sub={(id) => `${cardsWord(view.counts[id] ?? 0)}${id === view.outBy ? ' · خروج ✓' : view.lastTurn.includes(id) ? ' · دور أخير' : ''}`}
      />
      <RoundLine view={view} />

      {view.deadline ? <TimerBar endsAt={view.deadline} total={view.timer * 1000} onTick={myTurn} /> : null}

      {/* the table: the piles, and the groups of whoever went out */}
      <Felt active={myTurn} minHeight={0}>
        <Row center gap={18}>
          <Pressable
            disabled={!drawing}
            onPress={() => h.act('drawDeck')}
            style={[styles.pile, drawing && styles.pileActive]}
            accessibilityRole="button"
            accessibilityLabel="اسحب من الكومة">
            <CardMotion id={STOCK_ID}>
              <RealmCardView card={null} width={pileW} />
            </CardMotion>
            <Txt v="tiny" center color="rgba(255,255,255,0.85)">
              الكومة ({num(view.stockLeft)})
            </Txt>
          </Pressable>
          <Pressable
            disabled={!drawing || !top}
            onPress={() => h.act('drawDiscard')}
            style={[styles.pile, drawing && !!top && styles.pileActive]}
            accessibilityRole="button"
            accessibilityLabel={top ? `خذ ${realmCardName(top)}` : 'لا توجد ورقة مكشوفة'}>
            <View style={{ width: pileW + 12, height: Math.round(pileW * REALM_RATIO) + 12 }}>
              {!top && !pile.under ? <View style={[styles.empty, { width: pileW, height: Math.round(pileW * REALM_RATIO) }]} /> : null}
              {/* the previous top card keeps its element and lies under the new one */}
              {[...(pile.under && pile.under.id !== top?.id ? [pile.under] : []), ...(top ? [top] : [])].map((c) => {
                const isTop = c === top;
                return (
                  <CardMotion
                    key={c.id}
                    id={isTop ? c.id : `under:${c.id}`}
                    enter={isTop && pileHow === 'cover' ? 'play' : 'none'}
                    from={view.discardBy === h.me ? 'bottom' : 'top'}
                    source={isTop}
                    place={{ x: 4, y: 4, rot: tiltOf(c.id) }}>
                    <RealmCardView card={c} width={pileW} wild={isWild(c, view.wild)} ring={isTop ? thrower?.color : undefined} />
                  </CardMotion>
                );
              })}
              {pile.taken && view.turn !== h.me ? (
                // taken by another player: it lifts off toward the players' strip
                <CardMotion key={`taken-${pile.taken.id}`} id={`taken:${pile.taken.id}`} source={false} leaving leave={{ to: { x: 0, y: -56 }, scale: 0.9 }} place={{ x: 4, y: 4, rot: tiltOf(pile.taken.id) }}>
                  <RealmCardView card={pile.taken} width={pileW} wild={isWild(pile.taken, view.wild)} />
                </CardMotion>
              ) : null}
              {thrower && top ? (
                <Animated.View key={`by-${top.id}`} entering={FadeIn.duration(220).delay(pileHow === 'cover' ? 300 : 0)} style={styles.thrower} pointerEvents="none">
                  <Avatar player={thrower} size={22} ring={thrower.color} />
                </Animated.View>
              ) : null}
            </View>
            <Txt v="tiny" center color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ maxWidth: pileW + 48 }}>
              {thrower ? `من ${thrower.id === h.me ? 'عندك' : thrower.name}` : 'المكشوفة'}
            </Txt>
          </Pressable>
        </Row>
        {view.outBy && view.outGroups ? (
          <Animated.View entering={FadeIn.duration(260)} style={styles.outBox}>
            <Row gap={6}>
              <Avatar player={h.player(view.outBy)} size={24} />
              <Txt v="small" style={{ flex: 1 }} numberOfLines={1}>
                {view.outBy === h.me ? 'خروجك ✓ — دور أخير للباقين' : `خروج ${li(outName)} — دور أخير للباقين`}
              </Txt>
            </Row>
            <GroupsRow groups={view.outGroups} w={outW} wild={view.wild} from={view.outBy === h.me ? 'bottom' : 'top'} />
          </Animated.View>
        ) : null}
        <AnnounceBanner
          announce={view.outEvent ? { id: view.outEvent.id, by: view.outEvent.by, text: view.outEvent.by === h.me ? 'خروجك! صفر في هذه الجولة' : `خروج ${li(h.player(view.outEvent.by).name)}!` } : null}
          h={h}
        />
      </Felt>

      <TurnLine myTurn={myTurn} text={drawing ? (myLast ? 'دورك الأخير — اسحب ورقة' : 'اسحب ورقة') : myLast ? 'دورك الأخير — ارمِ ورقة' : 'ارمِ ورقة، أو اخرج إن صلحت أوراقك'} keep />

      {/* my hand */}
      <View style={{ gap: 8 }}>
        <Row gap={6}>
          <Row gap={4} style={{ flex: 1 }}>
            <Txt v="small" color={C.muted}>
              أوراقك
            </Txt>
            <SoftNumber
              value={view.myHand.length}
              render={(k) => (
                <Txt v="small" color={C.muted}>
                  ({num(k)})
                </Txt>
              )}
            />
            {plan ? (
              <View style={[styles.points, { borderColor: plan.points ? alpha(C.red, 0.6) : alpha(C.green, 0.7) }]}>
                <Txt style={[styles.pointsText, { color: plan.points ? C.red : C.green }]} numberOfLines={1}>
                  {plan.throw ? (plan.points ? `بعد الرمي: ${num(plan.points)}` : 'بعد الرمي: كلها في مجموعات ✓') : plan.points ? `الباقي: ${num(plan.points)}` : 'كلها في مجموعات ✓'}
                </Txt>
              </View>
            ) : null}
          </Row>
          <Pressable onPress={sortBest} style={styles.sortChip} accessibilityRole="button" accessibilityLabel="رتّب يدي في أفضل مجموعات">
            <Icon name="sparkle" size={14} color={C.ink} />
            <Txt v="tiny" color={C.ink}>
              رتّب
            </Txt>
          </Pressable>
        </Row>
        <Row wrap gap={handGap} center style={{ direction: 'ltr', paddingTop: 10, rowGap: 16 }}>
          {shown.map((c) => {
            const fresh = c.id === fromStock;
            const wild = isWild(c, view.wild);
            return (
              <CardMotion key={c.id} id={c.id} enter={fresh ? 'none' : 'deal'} from="top" flow>
                <FromStock id={c.id} fromStock={fresh}>
                  <RealmCardView
                    card={c}
                    width={handW}
                    wild={wild && !isJoker(c)}
                    selected={sel === c.id}
                    badge={leftSet.has(c.id) ? `+${cardPoints(c, view.wild)}` : undefined}
                    onPress={() => tapCard(c)}
                    steady
                  />
                </FromStock>
              </CardMotion>
            );
          })}
        </Row>
        {/* the buttons keep their place: nothing jumps when the turn comes or goes */}
        <Row gap={8} style={{ minHeight: 48 }}>
          {outCard && !lastLap ? (
            <Btn flex size="md" icon="check" label={`اخرج برمي ${realmCardName(byId.get(outCard)!)}`} color={C.green} disabled={!throwing} onPress={() => goOut(outCard)} />
          ) : (
            <Btn flex size="md" icon="trash" label="ارمِ" disabled={!selCard || !canThrow(selCard)} onPress={() => selCard && throwCard(selCard.id)} />
          )}
          <View style={!sel && styles.off}>
            <IconBtn icon="back" label="انقل الورقة يميناً" onPress={sel ? () => shift(1) : undefined} />
          </View>
          <View style={!sel && styles.off}>
            <IconBtn icon="next" label="انقل الورقة يساراً" onPress={sel ? () => shift(-1) : undefined} />
          </View>
        </Row>
        <Txt v="tiny" center color={C.dim} numberOfLines={2}>
          {hint}
        </Txt>
      </View>
      <Row gap={4} center>
        <Txt v="tiny" color={C.dim}>
          مجموعك
        </Txt>
        <SoftNumber
          value={view.scores[h.me] ?? 0}
          render={(k) => (
            <Txt v="tiny" color={C.dim}>
              {num(k)}
            </Txt>
          )}
        />
      </Row>
    </>
  );
}

const styles = StyleSheet.create({
  roundLine: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.surface },
  wildChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F2C23D', borderRadius: 999, paddingHorizontal: 8, minHeight: 30 },
  wildChipText: { fontFamily: F.black, fontSize: 16, lineHeight: 24, color: C.ink },
  pile: { alignItems: 'center', gap: 2, padding: 4, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.12) },
  empty: { position: 'absolute', left: 4, top: 4, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' },
  thrower: { position: 'absolute', top: -9, right: -9 },
  outBox: { gap: 6, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, padding: 8 },
  points: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, marginStart: 4, flexShrink: 1 },
  pointsText: { fontFamily: F.bold, fontSize: 12, lineHeight: 20 },
  off: { opacity: 0.4 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 40, borderRadius: 999, backgroundColor: C.yellow },
});
