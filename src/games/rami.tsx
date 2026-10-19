/** «الرامي» — the screen: the table (piles and melds), my laydown being built, my hand. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { RCard, RMeld, RamiView } from '@/shared/games/rami';
import { addToMeld, arrange, canUseCard, checkLay, findLay, ramiCardName, sortRami, swapIndex } from '@/shared/rami-rules';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card as Panel, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { DOUBLE_TAP_MS, Felt, TableStrip, TurnLine, cardsWord, tapClock } from './cards/card-ui';
import { FRENCH_RATIO, FrenchCard } from './cards/french-card';
import { CardMotion, CardStage, SoftNumber } from './cards/motion';
import { FromStock, STOCK_ID, tiltOf, useArrivals, usePile, type PileChange } from './cards/pile';
import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { KIND_AR, MeldBox, RoundEnd, SwapChoice } from './rami-parts';

export { RamiSettings } from './rami-parts';

export function RamiGame({ room, view }: { room: RoomView; view: RamiView }) {
  const h = helpers(room);
  if (!view.participants.includes(h.me) || (!view.active.includes(h.me) && view.phase === 'play')) return <Spectator room={room} />;
  // one stage for every phase: it stays mounted from round to round, so the next deal glides in
  return <CardStage>{view.phase !== 'play' ? <RoundEnd room={room} view={view} h={h} /> : <PlayTable room={room} view={view} h={h} />}</CardStage>;
}

/** What tapping this meld does with the picked cards (null: nothing). */
function meldFit(m: RMeld, cards: RCard[]): 'add' | 'swap' | 'both' | null {
  if (!cards.length) return null;
  const add = addToMeld(m, cards) !== null;
  const swap = cards.length === 1 && swapIndex(m, cards[0]) >= 0;
  return add && swap ? 'both' : swap ? 'swap' : add ? 'add' : null;
}

function PlayTable({ room, view, h }: { room: RoomView; view: RamiView; h: Helpers }) {
  const width = useContentWidth();
  const [sortBy, setSortBy] = useState<'suit' | 'rank'>('suit');
  // the picks and the laydown being built belong to one round (card ids come back in the next deal)
  const [picked, setPicked] = useState<{ round: number; ids: string[] }>({ round: 0, ids: [] });
  const [staged, setStaged] = useState<{ round: number; groups: string[][] }>({ round: 0, groups: [] });
  const [tapAt, setTapAt] = useState<{ id: string; at: number } | null>(null);
  const [choice, setChoice] = useState<{ meld: number; card: string } | null>(null);
  const [giveUp, setGiveUp] = useState(false);

  const top = view.discardTop;
  const pileHow: PileChange = !top || view.step === 'play' ? 'take' : view.discardBy ? 'cover' : 'reset';
  const pile = usePile(top, (c) => c.id, pileHow);
  const added = useArrivals(view.myHand.map((c) => c.id));
  const fromStock = added.length === 1 && added[0] !== pile.taken?.id ? added[0] : null;

  const byId = new Map(view.myHand.map((c) => [c.id, c]));
  const groups = staged.round === view.round ? staged.groups.map((g) => g.filter((id) => byId.has(id))).filter((g) => g.length) : [];
  const stagedIds = new Set(groups.flat());
  const sel = picked.round === view.round ? picked.ids.filter((id) => byId.has(id) && !stagedIds.has(id)) : [];
  const selCards = sel.map((id) => byId.get(id)!);
  const groupCards = groups.map((g) => g.map((id) => byId.get(id)!));

  const myTurn = view.turn === h.me;
  const drawing = myTurn && view.step === 'draw';
  const playing = myTurn && view.step === 'play';
  const talaj = view.variant === 'talaj';
  const opened = h.me in view.openings;
  const taken = view.taken ? byId.get(view.taken) ?? null : null;

  // the laydown being built: is it allowed now? (the same rules as the server)
  const check = groups.length ? checkLay(groupCards) : null;
  const left = view.myHand.length - stagedIds.size;
  const leftIsTaken = left === 1 && !!taken && !stagedIds.has(taken.id) && talaj;
  const outAtOnce = left === 0 || (left === 1 && !leftIsTaken);
  const needsFirst = !opened;
  const layOk =
    !!check &&
    (!needsFirst || (check.frankSet && check.frankRun && (talaj ? outAtOnce || check.value >= view.need : outAtOnce)));

  // a suggested laydown, built from the cards still free in my hand
  const free = view.myHand.filter((c) => !stagedIds.has(c.id));
  const goal = { opened, need: talaj ? view.need : Infinity, mustInclude: view.mustUse ? view.taken : null };
  const suggestion = playing && !groups.length ? findLay(free, goal) : null;
  // can I take the discard? (not in the first round, not with one card, and — التلّاج — only if it can go down now)
  const takeBlock = !top
    ? 'لا توجد ورقة مرمية'
    : view.firstRound
      ? 'مغلقة في الدورة الأولى'
      : view.myHand.length <= 1
        ? 'لا تُؤخذ بورقة واحدة'
        : talaj && drawing && !canUseCard(view.myHand, top, { opened, need: view.need, melds: view.melds })
          ? 'لا تنزل في هذا الدور'
          : null;
  const canTake = drawing && !takeBlock;

  const setSel = (ids: string[]) => setPicked({ round: view.round, ids });
  const toggle = (c: RCard) => setSel(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]);
  const canThrow = (c: RCard) => playing && !view.mustUse && !(c.id === view.taken && view.myHand.length > 1);
  const discard = (id: string) => {
    h.act('discard', { card: id });
    setSel([]);
  };
  const stage = () => {
    if (!arrange(selCards)) return;
    setStaged({ round: view.round, groups: [...groups, sel] });
    setSel([]);
  };
  const unstage = (i: number) => setStaged({ round: view.round, groups: groups.filter((_, k) => k !== i) });
  const clearStage = () => setStaged({ round: view.round, groups: [] });
  const lay = () => {
    h.act('lay', { groups });
    setSel([]);
  };
  // melds on the table the picked cards fit (only once I'm down)
  const fitOf = (m: RMeld, cards: RCard[]) => (opened && playing ? meldFit(m, cards) : null);
  const playOnMeld = (m: RMeld, cards: RCard[]) => {
    const fit = meldFit(m, cards);
    if (fit === 'both') setChoice({ meld: m.id, card: cards[0].id });
    else if (fit === 'swap') h.act('swap', { meld: m.id, card: cards[0].id });
    else if (fit === 'add') h.act('add', { meld: m.id, cards: cards.map((c) => c.id) });
    setSel([]);
  };
  // tap a card to pick it (several for a meld); tap the only picked card again for the one natural
  // move: onto the one meld it fits, or else throw it away (that ends the turn)
  const tapCard = (c: RCard) => {
    const now = tapClock();
    if (sel.length === 1 && sel[0] === c.id) {
      if (tapAt?.id === c.id && now - tapAt.at < DOUBLE_TAP_MS) return; // the same touch twice
      if (!playing) {
        setSel([]);
        return;
      }
      const fits = view.melds.filter((m) => fitOf(m, [c]));
      if (fits.length === 1) playOnMeld(fits[0], [c]);
      else if (!fits.length && canThrow(c)) discard(c.id);
      return;
    }
    setTapAt({ id: c.id, at: now });
    toggle(c);
  };

  // sizes from the screen width (fits 320 px phones): 5 cards a line in the hand
  const handGap = 5;
  const handW = Math.max(40, Math.min(58, Math.floor((width - 8 - 4 * handGap) / 5) - 4));
  const tableW = Math.max(22, Math.min(30, Math.floor((width - 96) / 9)));
  const stageW = Math.max(24, Math.min(32, Math.floor((width - 60) / 9)));
  const pileW = Math.min(58, Math.floor(width / 6));

  const handShown = sortRami(free, sortBy);
  const owners = view.participants.filter((id) => view.melds.some((m) => m.owner === id));
  const thrower = view.discardBy ? h.player(view.discardBy) : null;
  const selMeld = arrange(selCards);
  const fitting = playing ? view.melds.filter((m) => fitOf(m, selCards)) : [];

  // the one instruction line under the table
  let hint = '';
  if (drawing) hint = canTake ? 'اضغط على الكومة، أو على الورقة المرمية لتأخذها' : 'اضغط على الكومة لتسحب ورقة';
  else if (playing) {
    if (view.mustUse && taken) hint = `${ramiCardName(taken)} من المرمية: يجب أن تنزل في هذا الدور`;
    else if (sel.length === 1 && fitting.length === 1) hint = 'اضغط الورقة مرة ثانية لتضعها على التشكيلة المضاءة';
    else if (fitting.length) hint = 'اضغط على تشكيلة مضاءة';
    else if (selMeld) hint = `${KIND_AR[selMeld.kind]}${selMeld.frank ? ' فرانك' : ' بجوكر'} — اضغط «تشكيلة» لتضيفها إلى نزلتك`;
    else if (sel.length === 1) hint = canThrow(selCards[0]) ? 'اضغطها مرة ثانية لترميها، أو اختر أوراقاً لتشكيلة' : 'لا يمكن رمي هذه الورقة الآن';
    else if (sel.length) hint = 'ليست تشكيلة: تيرسي أو سويفي، 3 أوراق على الأقل';
    else hint = opened ? 'نزّل تشكيلات أو أضف إلى الطاولة، ثم ارمِ ورقة' : 'اختر أوراق تشكيلة، أو اضغط ورقة مرتين لترميها';
  } else hint = 'يمكنك تجهيز تشكيلاتك وأنت تنتظر دورك';

  const needLine = !talaj
    ? 'سامبل: لا نزول إلا بتنزيل اليد كاملة دفعة واحدة'
    : opened
      ? `نزلتك الأولى: ${num(view.openings[h.me])} — أضف ونزّل بحرية`
      : view.ceiling && Object.keys(view.openings).length
        ? `أول نزلة: ${num(view.need)} نقطة على الأقل (أعلى من ${num(view.need - 1)})`
        : `أول نزلة: ${num(view.need)} نقطة على الأقل من تشكيلات فرانك`;

  return (
    <>
      <TableStrip
        room={room}
        ids={view.participants.filter((id) => view.active.includes(id))}
        turn={view.turn}
        score={(id) => view.scores[id] ?? 0}
        sub={(id) => `${cardsWord(view.counts[id] ?? 0)}${id in view.openings ? (talaj ? ` · نزل ${num(view.openings[id])}` : ' · نزل') : ''}`}
        note={`الجولة ${num(view.round)} · المجموع الأقل يفوز (الحد ${num(view.limit)})`}
      />

      {view.deadline ? <TimerBar endsAt={view.deadline} total={view.timer * 1000} onTick={myTurn} /> : null}

      {/* the table: piles, then the melds by owner */}
      <Felt active={myTurn} minHeight={0}>
        <Row center gap={18}>
          <Pressable
            disabled={!drawing}
            onPress={() => h.act('drawStock')}
            style={[styles.pile, drawing && styles.pileActive]}
            accessibilityRole="button"
            accessibilityLabel="اسحب من الكومة">
            <CardMotion id={STOCK_ID}>
              <FrenchCard card={null} width={pileW} />
            </CardMotion>
            <Txt v="tiny" center color="rgba(255,255,255,0.85)">
              الكومة ({num(view.stockLeft)})
            </Txt>
          </Pressable>
          <Pressable
            disabled={!canTake}
            onPress={() => h.act('drawDiscard')}
            style={[styles.pile, canTake && styles.pileActive]}
            accessibilityRole="button"
            accessibilityLabel={takeBlock ? `المرمية: ${takeBlock}` : 'خذ الورقة المرمية'}>
            <View style={{ width: pileW + 12, height: Math.round(pileW * FRENCH_RATIO) + 12 }}>
              {!top && !pile.under ? <View style={[styles.empty, { width: pileW, height: Math.round(pileW * FRENCH_RATIO) }]} /> : null}
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
                    <FrenchCard card={c} width={pileW} ring={isTop ? thrower?.color : undefined} />
                  </CardMotion>
                );
              })}
              {pile.taken && view.turn !== h.me ? (
                // taken by another player: it lifts off toward the players' strip
                <CardMotion key={`taken-${pile.taken.id}`} id={`taken:${pile.taken.id}`} source={false} leaving leave={{ to: { x: 0, y: -56 }, scale: 0.9 }} place={{ x: 4, y: 4, rot: tiltOf(pile.taken.id) }}>
                  <FrenchCard card={pile.taken} width={pileW} />
                </CardMotion>
              ) : null}
              {thrower && top ? (
                <Animated.View key={`by-${top.id}`} entering={FadeIn.duration(220).delay(pileHow === 'cover' ? 300 : 0)} style={styles.thrower} pointerEvents="none">
                  <Avatar player={thrower} size={22} ring={thrower.color} />
                </Animated.View>
              ) : null}
              {top && view.firstRound ? (
                <View style={styles.lock} pointerEvents="none">
                  <Icon name="key" size={14} color={C.ink} />
                </View>
              ) : null}
            </View>
            <Txt v="tiny" center color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ maxWidth: pileW + 48 }}>
              {top && view.firstRound ? 'مغلقة في الدورة الأولى' : thrower ? `من ${thrower.id === h.me ? 'عندك' : thrower.name}` : 'المرمية'}
            </Txt>
          </Pressable>
        </Row>
        <Txt v="tiny" center color="rgba(255,255,255,0.75)">
          {needLine}
        </Txt>
        {owners.map((o) => (
          <View key={o} style={styles.owner}>
            <View style={{ alignItems: 'center', width: 34 }} accessibilityLabel={h.player(o).name}>
              <Avatar player={h.player(o)} size={26} />
              {talaj && o in view.openings ? (
                <Txt v="tiny" color="rgba(255,255,255,0.85)" style={{ lineHeight: 16 }}>
                  {num(view.openings[o])}
                </Txt>
              ) : null}
            </View>
            <Row wrap gap={8} style={{ flex: 1, paddingTop: 6 }}>
              {view.melds
                .filter((m) => m.owner === o)
                .map((m) => (
                  <MeldBox
                    key={m.id}
                    meld={m}
                    w={tableW}
                    fits={fitting.includes(m) ? fitOf(m, selCards) : null}
                    fresh={view.lastMelds?.ids.includes(m.id) ? h.player(view.lastMelds.by).color : undefined}
                    from={view.lastMelds?.by === h.me ? 'bottom' : 'top'}
                    onPress={() => playOnMeld(m, selCards)}
                  />
                ))}
            </Row>
          </View>
        ))}
        {!owners.length ? (
          <Txt v="tiny" center color="rgba(255,255,255,0.55)">
            لم ينزل أحد بعد
          </Txt>
        ) : null}
      </Felt>

      <TurnLine myTurn={myTurn} text={drawing ? 'اسحب ورقة' : view.mustUse ? 'نزّل الورقة المأخوذة ثم ارمِ ورقة' : 'نزّل ما تستطيع ثم ارمِ ورقة'} keep />

      {/* the card taken from the discard pile must go down (التلّاج) */}
      {playing && view.mustUse && taken ? (
        <View style={styles.must}>
          <FrenchCard card={taken} width={30} />
          <Txt v="small" style={{ flex: 1 }}>
            ورقة المرمية يجب أن تنزل في هذا الدور، وإلا خسرت الجولة (+100).
          </Txt>
          <Btn size="sm" ghost label="أتخلّى" onPress={() => setGiveUp(true)} />
        </View>
      ) : null}

      {/* my laydown being built: groups of cards, checked as I go */}
      {groups.length || suggestion ? (
        <Panel style={{ gap: 8 }}>
          <Row gap={8}>
            <Icon name="layers" size={18} color={C.muted} />
            <Txt v="bold" style={{ flex: 1 }}>
              {opened ? 'تشكيلات للتنزيل' : talaj ? 'نزلتك الأولى' : 'يدك كاملة'}
            </Txt>
            {groups.length && needsFirst ? <Rules check={check} talaj={talaj} need={view.need} left={left} outAtOnce={outAtOnce} /> : null}
          </Row>
          {groupCards.map((cards, i) => {
            const a = arrange(cards);
            return (
              <Pressable
                key={groups[i].join(',')}
                onPress={() => {
                  haptic.tap();
                  unstage(i);
                }}
                accessibilityRole="button"
                accessibilityLabel="أعد هذه التشكيلة إلى يدك"
                style={styles.staged}>
                <Row gap={2} wrap style={{ direction: 'ltr', flex: 1 }}>
                  {(a ? a.slots.map((x) => x.card) : cards).map((c) => (
                    <CardMotion key={c.id} id={c.id} enter="play" from="bottom" flow>
                      <FrenchCard card={c} width={stageW} />
                    </CardMotion>
                  ))}
                </Row>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt v="tiny" color={a?.frank ? C.green : C.muted}>
                    {a ? `${KIND_AR[a.kind]} ${a.frank ? 'فرانك' : 'بجوكر'}` : ''}
                  </Txt>
                  {a && talaj && needsFirst ? (
                    <Txt v="tiny" color={C.dim}>
                      {num(a.value)} نقطة
                    </Txt>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {groups.length ? (
            <Row gap={8}>
              <Btn flex size="md" icon="layers" label="نزّل" color={C.green} disabled={!playing || !layOk} onPress={lay} />
              <Btn size="md" ghost icon="refresh" label="أرجع" onPress={clearStage} />
            </Row>
          ) : null}
          {suggestion ? (
            <Btn
              size="md"
              ghost
              icon="sparkle"
              label={opened ? 'في يدك تشكيلات — جهّزها لي' : 'نزلتك في يدك! جهّزها لي'}
              onPress={() => {
                setStaged({ round: view.round, groups: suggestion.map((g) => g.map((c) => c.id)) });
                setSel([]);
              }}
            />
          ) : null}
          {groups.length && !playing ? (
            <Txt v="tiny" center color={C.dim}>
              {drawing ? 'اسحب ورقة أولاً، ثم نزّل' : 'تنزّل في دورك'}
            </Txt>
          ) : null}
        </Panel>
      ) : null}

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
          </Row>
          {(['suit', 'rank'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                haptic.tap();
                setSortBy(k);
              }}
              style={[styles.sortChip, sortBy === k && styles.sortChipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === k }}>
              <Txt v="tiny" color={sortBy === k ? C.ink : C.text}>
                {k === 'suit' ? 'حسب النوع' : 'حسب الرتبة'}
              </Txt>
            </Pressable>
          ))}
        </Row>
        <Row wrap gap={handGap} center style={{ direction: 'ltr', paddingTop: 8 }}>
          {handShown.map((c) => {
            const fresh = c.id === fromStock;
            return (
              <CardMotion key={c.id} id={c.id} enter={fresh ? 'none' : 'deal'} from="top" flow>
                <FromStock id={c.id} fromStock={fresh}>
                  <FrenchCard card={c} width={handW} selected={sel.includes(c.id)} glow={view.mustUse && c.id === view.taken} onPress={() => tapCard(c)} steady />
                </FromStock>
              </CardMotion>
            );
          })}
        </Row>
        {/* the buttons keep their place: nothing jumps when the turn comes or goes */}
        <Row gap={8} style={{ minHeight: 48 }}>
          <Btn flex size="md" icon="plus" label="تشكيلة" color={C.green} disabled={!selMeld} onPress={stage} />
          <Btn
            flex
            size="md"
            icon="trash"
            label="ارمِ"
            ghost
            disabled={sel.length !== 1 || !canThrow(selCards[0])}
            onPress={() => discard(sel[0])}
          />
          <Btn size="md" icon="close" ghost disabled={!sel.length} onPress={() => setSel([])} style={!sel.length && styles.off} />
        </Row>
        <Txt v="tiny" center color={C.dim} numberOfLines={2}>
          {hint}
        </Txt>
      </View>

      {choice ? (
        <SwapChoice
          onSwap={() => {
            h.act('swap', { meld: choice.meld, card: choice.card });
            setChoice(null);
          }}
          onAdd={() => {
            h.act('add', { meld: choice.meld, cards: [choice.card] });
            setChoice(null);
          }}
          onCancel={() => setChoice(null)}
        />
      ) : null}
      <ConfirmModal
        visible={giveUp && view.mustUse}
        danger
        icon="close"
        title="التخلّي عن الجولة؟"
        message="الورقة التي أخذتها من المرمية لم تنزل: تنتهي الجولة وعليك 100 نقطة."
        confirmLabel="أتخلّى عن الجولة"
        onConfirm={() => {
          h.act('forfeit');
          setGiveUp(false);
        }}
        onCancel={() => setGiveUp(false)}
      />
    </>
  );
}

/** The conditions of a first laydown, ticked as the groups come together. */
function Rules({ check, talaj, need, left, outAtOnce }: { check: ReturnType<typeof checkLay>; talaj: boolean; need: number; left: number; outAtOnce: boolean }) {
  const items: { label: string; ok: boolean }[] = [
    { label: 'تيرسي فرانك', ok: !!check?.frankSet },
    { label: 'سويفي فرانك', ok: !!check?.frankRun },
  ];
  if (talaj && !outAtOnce) items.unshift({ label: `${num(check?.value ?? 0)}/${num(need)}`, ok: (check?.value ?? 0) >= need });
  if (!talaj) items.unshift({ label: outAtOnce ? 'اليد كاملة' : `باقٍ ${num(left)}`, ok: outAtOnce });
  return (
    <Row gap={4} wrap style={{ justifyContent: 'flex-end', flexShrink: 1 }}>
      {items.map((x) => (
        <View key={x.label} style={[styles.rule, x.ok && styles.ruleOk]}>
          <Txt style={[styles.ruleText, { color: x.ok ? C.green : C.muted }]}>
            {x.ok ? '✓ ' : ''}
            {x.label}
          </Txt>
        </View>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  pile: { alignItems: 'center', gap: 2, padding: 4, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.12) },
  empty: { position: 'absolute', left: 4, top: 4, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' },
  thrower: { position: 'absolute', top: -9, right: -9 },
  lock: { position: 'absolute', bottom: -4, left: -4, backgroundColor: C.yellow, borderRadius: 999, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  owner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: 'rgba(0,0,0,0.16)', borderRadius: 14, padding: 6 },
  must: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, borderWidth: 1.5, borderColor: alpha(C.yellow, 0.7), backgroundColor: alpha(C.yellow, 0.1) },
  staged: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 12, backgroundColor: C.surface },
  rule: { paddingHorizontal: 8, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  ruleOk: { borderColor: alpha(C.green, 0.7), backgroundColor: alpha(C.green, 0.12) },
  ruleText: { fontFamily: F.bold, fontSize: 12, lineHeight: 20 },
  sortChip: { paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: C.surface },
  sortChipOn: { backgroundColor: C.yellow },
  off: { opacity: 0.45 },
});

