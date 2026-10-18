/** «المراحل العشر» — the screen. */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { P10_HAND_END_MS, phaseLabel, reqLabel, type P10Card, type P10Group, type P10GroupKind, type Phase10View } from '@/shared/games/phase10';
import { arrangeGroup, canHit, fitsExactly, groupOk, isSkip, phaseReqs, solvePhase, sortP10 } from '@/shared/phase10-rules';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card as Panel, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Toggle } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { AnnounceBanner, Felt, TableStrip, TurnLine } from './cards/card-ui';
import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { P10CardView } from './phase10-card';

const KIND_LABEL: Record<P10GroupKind, string> = { set: 'مجموعة', run: 'متتالية', color: 'لون واحد' };

/** The phase number a player is on (null once they finished them all). */
const phaseOf = (view: Phase10View, id: string): number | null => view.phases[view.progress[id] ?? 0] ?? null;

/** «المرحلة 3» (and «2 من 5» in a short game). */
function phaseTag(view: Phase10View, id: string): string {
  const p = phaseOf(view, id);
  if (p === null) return 'المراحل مكتملة';
  return `المرحلة ${num(p)}`;
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

function GroupBox({ group, w, fits, fresh, onPress }: { group: P10Group; w: number; fits: boolean; fresh?: string; onPress: () => void }) {
  const cards = arrangeGroup(group.kind, group.cards);
  return (
    <Pressable
      disabled={!fits}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole={fits ? 'button' : undefined}
      accessibilityLabel={fits ? `أضف إلى ${KIND_LABEL[group.kind]}` : KIND_LABEL[group.kind]}
      style={[styles.group, fresh ? { borderColor: alpha(fresh, 0.95), backgroundColor: alpha(fresh, 0.14) } : null, fits && styles.groupFits]}>
      <Row gap={2} wrap style={{ direction: 'ltr' }}>
        {cards.map((x) => (
          <P10CardView key={x.card.id} card={x.card} w={w} value={x.value} />
        ))}
      </Row>
      {fits ? (
        <View style={styles.addBadge} pointerEvents="none">
          <Txt v="tiny" color={C.ink} style={{ lineHeight: 16 }}>
            أضف هنا
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Skip target picker                                                  */
/* ------------------------------------------------------------------ */

function SkipPicker({ view, h, onPick, onCancel }: { view: Phase10View; h: Helpers; onPick: (id: string) => void; onCancel: () => void }) {
  const targets = view.active.filter((id) => id !== h.me && !view.skipped.includes(id));
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Animated.View entering={FadeIn.duration(160)} style={styles.picker}>
          <Txt v="title" center>
            من يفقد دوره؟
          </Txt>
          <Txt v="small" center color={C.muted}>
            اختر لاعباً يتخطّى دوره القادم
          </Txt>
          {targets.map((id) => (
            <Pressable key={id} onPress={() => onPick(id)} accessibilityRole="button" style={({ pressed }) => [styles.target, pressed && { opacity: 0.8 }]}>
              <Avatar player={h.player(id)} size={36} />
              <View style={{ flex: 1 }}>
                <Txt v="bold" numberOfLines={1}>
                  {h.player(id).name}
                </Txt>
                <Txt v="tiny" color={C.muted}>
                  {phaseTag(view, id)} · {num(view.counts[id] ?? 0)} أوراق{view.laid.includes(id) ? ' · المرحلة على الطاولة' : ''}
                </Txt>
              </View>
              <Icon name="skip" size={22} color={C.yellow} />
            </Pressable>
          ))}
          <Btn size="md" ghost label="إلغاء" onPress={onCancel} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* End of a hand / of the game                                         */
/* ------------------------------------------------------------------ */

function Standings({ view, h }: { view: Phase10View; h: Helpers }) {
  const rows = view.participants
    .filter((id) => id in view.scores)
    .sort((a, b) => (view.progress[b] ?? 0) - (view.progress[a] ?? 0) || (view.scores[a] ?? 0) - (view.scores[b] ?? 0));
  return (
    <Panel>
      <Txt v="small" color={C.muted}>
        الترتيب: الأبعد في المراحل، ثم الأقل نقاطاً
      </Txt>
      {rows.map((id, i) => (
        <Row key={id} gap={8} style={[styles.standRow, id === h.me && styles.standMe, !view.active.includes(id) && { opacity: 0.45 }]}>
          <Txt v="h3" color={i === 0 ? C.yellow : C.dim} style={{ width: 20, textAlign: 'center' }}>
            {num(i + 1)}
          </Txt>
          <Avatar player={h.player(id)} size={30} crown={view.phase === 'final' && id === view.winner} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="bold" numberOfLines={1}>
              {h.player(id).name}
            </Txt>
            <Txt v="tiny" color={C.muted}>
              {phaseOf(view, id) === null ? 'كل المراحل مكتملة' : `التالي: ${phaseTag(view, id)}`}
            </Txt>
          </View>
          <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26 }}>{num(view.scores[id] ?? 0)}</Txt>
          <Txt v="tiny" color={C.dim}>
            نقطة
          </Txt>
        </Row>
      ))}
    </Panel>
  );
}

function HandEnd({ room, view, h }: { room: RoomView; view: Phase10View; h: Helpers }) {
  const final = view.phase === 'final';
  const won = final && view.winner === h.me;
  const title = final
    ? view.winner
      ? `فاز ${h.player(view.winner).name}`
      : 'انتهت اللعبة'
    : view.handWinner
      ? `نفدت أوراق ${h.player(view.handWinner).name}`
      : 'انتهت الأوراق';
  const mine = view.handSummary?.find((r) => r.id === h.me);
  const sub = final
    ? view.winner
      ? 'أكمل المرحلة الأخيرة أولاً'
      : undefined
    : mine
      ? mine.done
        ? `أكملت المرحلة ${num(mine.phase)} — تنتقل للتالية`
        : `لم تكمل المرحلة ${num(mine.phase)} — ستعيدها`
      : undefined;
  return (
    <>
      {won || (!final && view.handWinner === h.me) ? <Confetti /> : null}
      <ResultBanner
        tone={won || (!final && mine?.done) ? 'good' : 'neutral'}
        art={
          <Row gap={-10} style={{ direction: 'ltr', paddingBottom: 4 }}>
            <View style={{ transform: [{ rotate: '-12deg' }] }}>
              <P10CardView card={{ id: 'a', kind: 'num', n: 10, color: 'purple' }} w={44} />
            </View>
            <View style={{ transform: [{ translateY: -6 }] }}>
              <P10CardView card={{ id: 'b', kind: 'wild' }} w={44} />
            </View>
            <View style={{ transform: [{ rotate: '12deg' }] }}>
              <P10CardView card={{ id: 'c', kind: 'num', n: 1, color: 'teal' }} w={44} />
            </View>
          </Row>
        }
        title={title}
        sub={sub}
      />
      {final ? <Standings view={view} h={h} /> : null}
      {view.handSummary ? (
        <Panel>
          <Txt v="small" color={C.muted}>
            اليد {num(view.hand)} — نقاط الأوراق الباقية
          </Txt>
          {view.handSummary.map((r) => (
            <View key={r.id} style={{ gap: 4 }}>
              <Row gap={8}>
                <Avatar player={h.player(r.id)} size={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="bold" numberOfLines={1}>
                    {h.player(r.id).name}
                  </Txt>
                  <Txt v="tiny" color={r.done ? C.green : C.muted}>
                    {r.done ? `المرحلة ${num(r.phase)} مكتملة ✓` : `إعادة المرحلة ${num(r.phase)}`}
                  </Txt>
                </View>
                <Txt v="h3" color={r.points ? C.red : C.green}>
                  {num(`+${r.points}`)}
                </Txt>
              </Row>
              {r.cards.length ? (
                <Row wrap gap={3} style={{ direction: 'ltr' }}>
                  {r.cards.map((c) => (
                    <P10CardView key={c.id} card={c} w={26} />
                  ))}
                </Row>
              ) : null}
            </View>
          ))}
        </Panel>
      ) : null}
      {final ? <PlayAgain room={room} /> : null}
      {final ? null : (
        <View style={{ gap: 10 }}>
          <Standings view={view} h={h} />
          <TimerBar endsAt={view.nextAt} total={P10_HAND_END_MS} />
          {h.isHost ? <Btn size="xl" icon="cards" label="اليد التالية" onPress={() => h.act('next')} /> : <HostNote>اليد التالية تبدأ تلقائياً، أو عندما يوزّع المضيف</HostNote>}
        </View>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The game                                                            */
/* ------------------------------------------------------------------ */

export function Phase10Game({ room, view }: { room: RoomView; view: Phase10View }) {
  const h = helpers(room);
  const width = useContentWidth();
  const accent = useAccent();
  const [sortBy, setSortBy] = useState<'number' | 'color'>('number');
  // selections and the staged phase belong to one hand (card ids come back in the next deal)
  const [picked, setPicked] = useState<{ hand: number; ids: string[] }>({ hand: 0, ids: [] });
  const [staged, setStaged] = useState<{ hand: number; slots: string[][] }>({ hand: 0, slots: [] });
  const [skipCard, setSkipCard] = useState<string | null>(null);

  if (!view.participants.includes(h.me) || (!view.active.includes(h.me) && view.phase === 'play')) return <Spectator room={room} />;
  if (view.phase !== 'play') return <HandEnd room={room} view={view} h={h} />;

  const byId = new Map(view.myHand.map((c) => [c.id, c]));
  const myPhase = phaseOf(view, h.me);
  const reqs = myPhase ? phaseReqs(myPhase) : [];
  const laid = view.laid.includes(h.me);
  const slots: string[][] = reqs.map((_, i) => (staged.hand === view.hand && !laid ? (staged.slots[i] ?? []).filter((id) => byId.has(id)) : []));
  const stagedIds = new Set(slots.flat());
  const sel = picked.hand === view.hand ? picked.ids.filter((id) => byId.has(id) && !stagedIds.has(id)) : [];
  const selCards = sel.map((id) => byId.get(id)!);
  const slotCards = slots.map((ids) => ids.map((id) => byId.get(id)!));
  const slotOk = slotCards.map((cs, i) => groupOk(reqs[i].kind, cs, reqs[i].size));

  const myTurn = view.turn === h.me;
  const drawing = myTurn && view.step === 'draw';
  const playing = myTurn && view.step === 'play';
  const ready: P10Card[][] | null =
    laid || !reqs.length ? null : slotOk.every(Boolean) ? slotCards : fitsExactly(reqs, [...slotCards.flat(), ...selCards]);
  const suggestion = playing && !laid && !ready ? solvePhase(reqs, view.myHand) : null;
  const top = view.discardTop;
  const canTakeTop = drawing && !!top && !isSkip(top);

  const setSel = (ids: string[]) => setPicked({ hand: view.hand, ids });
  const toggle = (c: P10Card) => setSel(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]);
  const putInSlot = (i: number) => {
    if (!sel.length) return;
    setStaged({ hand: view.hand, slots: slots.map((s, k) => (k === i ? [...s, ...sel] : s)) });
    setSel([]);
  };
  const unstage = (id: string) => setStaged({ hand: view.hand, slots: slots.map((s) => s.filter((x) => x !== id)) });
  const clearAll = () => {
    setStaged({ hand: view.hand, slots: [] });
    setSel([]);
  };
  const lay = (groups: P10Card[][]) => {
    h.act('lay', { groups: groups.map((g) => g.map((c) => c.id)) });
    clearAll();
  };
  const discard = (target?: string) => {
    const c = selCards[0];
    if (!c) return;
    const targets = view.active.filter((id) => id !== h.me && !view.skipped.includes(id));
    if (isSkip(c) && !target && targets.length > 1) {
      setSkipCard(c.id);
      return;
    }
    h.act('discard', { card: c.id, ...(target ? { target } : {}) });
    setSel([]);
    setSkipCard(null);
  };

  // sizes from the screen width (fits 320 px phones)
  const handGap = 5;
  const handW = Math.min(60, Math.floor((width - 8 - 5 * handGap) / 6) - 4);
  const tableW = Math.max(20, Math.min(30, Math.floor((width - 100) / 9)));
  const slotW = Math.max(22, Math.min(32, Math.floor((width - 72) / 10)));
  const pileW = Math.min(60, Math.floor(width / 6));

  const handShown = sortP10(
    view.myHand.filter((c) => !stagedIds.has(c.id)),
    sortBy,
  );
  const owners = view.participants.filter((id) => view.groups.some((g) => g.owner === id));
  const anyFits = playing && laid && selCards.length > 0 && view.groups.some((g) => canHit(g.kind, g.cards, selCards));
  const skip = view.skipEvent;
  const thrower = view.discardBy ? h.player(view.discardBy) : null;

  let hint = laid ? 'انتظر دورك لتضيف أوراقاً أو ترمي ورقة' : 'يمكنك تجهيز مرحلتك وأنت تنتظر دورك';
  if (drawing) hint = 'اضغط على الكومة، أو على الورقة المكشوفة لتأخذها';
  else if (playing && !laid) {
    if (ready) hint = 'أوراقك تكمل المرحلة — اضغط «ضع المرحلة»';
    else if (sel.length === 1) hint = 'ارمِ هذه الورقة، أو ضعها في خانة من خانات مرحلتك';
    else if (sel.length) hint = 'اضغط على خانة من خانات مرحلتك لتضع فيها الأوراق المختارة';
    else hint = 'اختر أوراقاً ثم اضغط على خانة، أو اختر ورقة واحدة لترميها';
  } else if (playing && laid) {
    if (anyFits) hint = 'اضغط على مجموعة مضاءة لتضيف إليها';
    else if (sel.length > 1) hint = 'هذه الأوراق لا تصلح معاً لأي مجموعة — جرّب ورقة واحدة';
    else hint = 'اختر ورقة لتضيفها إلى مجموعة على الطاولة، أو لترميها';
  }

  return (
    <>
      <TableStrip
        room={room}
        ids={view.participants.filter((id) => view.active.includes(id))}
        turn={view.turn}
        score={(id) => view.counts[id] ?? 0}
        sub={(id) => `${phaseTag(view, id)}${view.laid.includes(id) ? ' ✓' : ''}${view.skipped.includes(id) ? ' · تخطَّ' : ''}`}
      />

      {/* the table: piles, groups laid down */}
      <Felt active={myTurn} minHeight={0}>
        <Row center gap={18}>
          <Pressable
            disabled={!drawing}
            onPress={() => h.act('drawDeck')}
            style={[styles.pile, drawing && styles.pileActive]}
            accessibilityRole="button"
            accessibilityLabel="اسحب من الكومة">
            <P10CardView card={null} w={pileW} />
            <Txt v="tiny" center color="rgba(255,255,255,0.85)">
              الكومة ({num(view.stockLeft)})
            </Txt>
          </Pressable>
          <Pressable
            disabled={!canTakeTop}
            onPress={() => h.act('drawDiscard')}
            style={[styles.pile, canTakeTop && styles.pileActive]}
            accessibilityRole="button"
            accessibilityLabel="خذ الورقة المكشوفة">
            {top ? (
              <Animated.View key={top.id} entering={FadeIn.duration(160)}>
                <P10CardView card={top} w={pileW} />
                {thrower ? (
                  <View style={styles.thrower} pointerEvents="none">
                    <Avatar player={thrower} size={22} ring={thrower.color} />
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <View style={{ width: pileW + 4, height: Math.round(pileW * 1.42) + 4 }} />
            )}
            <Txt v="tiny" center color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ maxWidth: pileW + 40 }}>
              {top && isSkip(top) ? 'لا تُسحب' : thrower ? `من ${thrower.id === h.me ? 'عندك' : thrower.name}` : 'المكشوفة'}
            </Txt>
          </Pressable>
        </Row>
        {owners.map((o) => (
          <View key={o} style={styles.owner}>
            <View style={{ alignItems: 'center', width: 34 }} accessibilityLabel={`${h.player(o).name} — ${phaseTag(view, o)}`}>
              <Avatar player={h.player(o)} size={26} />
              <Txt v="tiny" color="rgba(255,255,255,0.85)" style={{ lineHeight: 16 }}>
                م{num(phaseOf(view, o) ?? 0)}
              </Txt>
            </View>
            <Row wrap gap={6} style={{ flex: 1 }}>
              {view.groups
                .filter((g) => g.owner === o)
                .map((g) => (
                  <GroupBox
                    key={g.id}
                    group={g}
                    w={tableW}
                    fits={playing && laid && selCards.length > 0 && canHit(g.kind, g.cards, selCards)}
                    fresh={view.lastGroups?.ids.includes(g.id) ? h.player(view.lastGroups.by).color : undefined}
                    onPress={() => {
                      h.act('hit', { group: g.id, cards: sel });
                      setSel([]);
                    }}
                  />
                ))}
            </Row>
          </View>
        ))}
        {!owners.length ? (
          <Txt v="tiny" center color="rgba(255,255,255,0.6)">
            لم يضع أحد مرحلته بعد
          </Txt>
        ) : null}
        <AnnounceBanner
          announce={skip ? { id: skip.id, by: skip.target, text: skip.target === h.me ? 'أنت تفقد دورك!' : `«تخطَّ» لـ${h.player(skip.target).name}!` } : null}
          h={h}
        />
      </Felt>

      <TurnLine
        myTurn={myTurn}
        text={drawing ? 'اسحب ورقة' : laid ? 'أضف أوراقاً على المجموعات ثم ارمِ ورقة' : 'ضع مرحلتك أو أضف أوراقاً ثم ارمِ ورقة'}
      />
      {view.skipped.includes(h.me) ? (
        <Txt v="small" center color={C.red}>
          ستفقد دورك القادم (تخطَّ)
        </Txt>
      ) : null}

      {/* my phase: tap cards, then tap a slot */}
      {myPhase !== null && !laid ? (
        <Panel style={{ gap: 8 }}>
          <Row gap={8}>
            <View style={[styles.phaseNum, { backgroundColor: accent }]}>
              <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 24, color: '#FFFFFF' }}>{num(myPhase)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="tiny" color={C.muted}>
                مرحلتك{view.phases.length < 10 ? ` (${num((view.progress[h.me] ?? 0) + 1)} من ${num(view.phases.length)})` : ''}
              </Txt>
              <Txt v="bold">{phaseLabel(myPhase)}</Txt>
            </View>
          </Row>
          <Row wrap gap={8} style={{ alignItems: 'stretch' }}>
          {reqs.map((r, i) => {
            const cards = slotCards[i];
            const ok = slotOk[i];
            const canDrop = sel.length > 0;
            const half = reqs.length === 2 && reqs.every((x) => x.size <= 5);
            const status = ok ? null : cards.length < r.size ? (cards.length ? `ينقص ${num(r.size - cards.length)}` : null) : 'لا تصلح';
            return (
              <Pressable
                key={i}
                onPress={() => {
                  haptic.tap();
                  putInSlot(i);
                }}
                accessibilityRole="button"
                accessibilityLabel={`خانة ${reqLabel(r)}`}
                style={[styles.slot, half && styles.slotHalf, ok && styles.slotOk, canDrop && !ok && styles.slotDrop]}>
                <Row gap={4}>
                  <Txt v="tiny" color={ok ? C.green : canDrop ? C.yellow : C.muted} style={{ flex: 1 }} numberOfLines={1}>
                    {reqLabel(r)}
                  </Txt>
                  {ok ? <Icon name="check" size={16} color={C.green} /> : null}
                </Row>
                {status ? (
                  <Txt v="tiny" color={status === 'لا تصلح' ? C.red : C.dim} style={{ lineHeight: 16 }}>
                    {status}
                  </Txt>
                ) : null}
                {cards.length ? (
                  <Row wrap gap={3} style={{ direction: 'ltr' }}>
                    {(ok ? arrangeGroup(r.kind, cards) : cards.map((card) => ({ card, value: undefined }))).map((x) => (
                      <P10CardView key={x.card.id} card={x.card} w={slotW} value={x.value} onPress={() => unstage(x.card.id)} />
                    ))}
                  </Row>
                ) : (
                  <Txt v="tiny" color={canDrop ? C.yellow : C.dim}>
                    {canDrop ? 'اضغط هنا لوضعها' : 'اختر ثم اضغط هنا'}
                  </Txt>
                )}
              </Pressable>
            );
          })}
          </Row>
          {ready ? (
            <Btn size="lg" icon="layers" label="ضع المرحلة" color={C.green} disabled={!playing} onPress={() => lay(ready)} />
          ) : suggestion ? (
            <Btn
              size="md"
              icon="sparkle"
              label="مرحلتك في يدك! جهّزها لي"
              ghost
              onPress={() => {
                setStaged({ hand: view.hand, slots: suggestion.map((g) => g.map((c) => c.id)) });
                setSel([]);
              }}
            />
          ) : null}
          {ready && !playing ? (
            <Txt v="tiny" center color={C.dim}>
              {drawing ? 'اسحب ورقة أولاً، ثم ضع مرحلتك' : 'انتظر دورك لتضع مرحلتك'}
            </Txt>
          ) : null}
          {stagedIds.size ? <Btn size="sm" ghost icon="refresh" label="أرجع الأوراق إلى يدي" onPress={clearAll} /> : null}
        </Panel>
      ) : laid ? (
        <Txt v="small" center color={C.green}>
          وضعت مرحلتك ✓ — تخلّص من أوراقك بإضافتها إلى أي مجموعة
        </Txt>
      ) : null}

      {/* my hand */}
      <View style={{ gap: 8 }}>
        <Row gap={6}>
          <Txt v="small" color={C.muted} style={{ flex: 1 }}>
            أوراقك ({num(view.myHand.length)})
          </Txt>
          {(['number', 'color'] as const).map((k) => (
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
                {k === 'number' ? 'حسب الرقم' : 'حسب اللون'}
              </Txt>
            </Pressable>
          ))}
        </Row>
        <Row wrap gap={handGap} center style={{ direction: 'ltr', paddingTop: 8 }}>
          {handShown.map((c) => (
            <P10CardView key={c.id} card={c} w={handW} selected={sel.includes(c.id)} onPress={() => toggle(c)} />
          ))}
        </Row>
        {playing ? (
          <Row gap={10}>
            <Btn
              flex
              size="md"
              icon="trash"
              label={selCards.length === 1 && isSkip(selCards[0]) ? 'ارمِ «تخطَّ»' : 'ارمِ الورقة'}
              disabled={sel.length !== 1}
              onPress={() => discard()}
            />
            {sel.length ? <Btn size="md" ghost icon="close" label="إلغاء" onPress={() => setSel([])} /> : null}
          </Row>
        ) : null}
        <Txt v="tiny" center color={C.dim}>
          {hint}
        </Txt>
      </View>
      <Txt v="tiny" center color={C.dim}>
        اليد {num(view.hand)} · نقاطك {num(view.scores[h.me] ?? 0)}
      </Txt>

      {skipCard ? <SkipPicker view={view} h={h} onPick={(id) => discard(id)} onCancel={() => setSkipCard(null)} /> : null}
    </>
  );
}

/** Lobby settings: the short game. */
export function Phase10Settings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.phase10;
  return (
    <View style={{ gap: 8 }}>
      <Toggle
        label="لعبة قصيرة (5 مراحل)"
        value={!!s.short}
        editable={editable}
        onChange={(short) => client.roomAction({ type: 'settings', game: 'phase10', patch: { short } })}
      />
      <Txt v="tiny" color={C.dim}>
        {s.short ? 'المراحل الزوجية فقط: 2، 4، 6، 8، 10' : 'المراحل العشر كاملة، من 1 إلى 10'}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  pile: { alignItems: 'center', gap: 2, padding: 4, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.12) },
  thrower: { position: 'absolute', top: -9, right: -9 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.16)', borderRadius: 14, padding: 6 },
  group: { padding: 4, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)', maxWidth: '100%' },
  addBadge: { position: 'absolute', top: -9, alignSelf: 'center', backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 6 },
  groupFits: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.15) },
  phaseNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  slot: { gap: 4, padding: 8, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: C.borderStrong, minHeight: 48, flexBasis: '100%', flexGrow: 1 },
  slotHalf: { flexBasis: '40%' },
  slotOk: { borderStyle: 'solid', borderColor: C.green, backgroundColor: alpha(C.green, 0.1) },
  slotDrop: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.08) },
  sortChip: { paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: C.surface },
  sortChipOn: { backgroundColor: C.yellow },
  standRow: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12 },
  standMe: { backgroundColor: alpha(C.yellow, 0.12) },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' },
  picker: { backgroundColor: C.bg2, borderRadius: 24, padding: 18, gap: 10, width: '100%', maxWidth: 380 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 16, padding: 10, minHeight: 56 },
});
