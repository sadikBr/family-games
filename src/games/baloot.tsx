/** «البلوط» — the screen: table, bidding, doubling, my hand, the score sheet and the end of each hand. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { useCountdown } from '@/lib/time';
import { maSuitName } from '@/shared/baloot-morocco';
import { SUIT_SYM } from '@/shared/baloot-rules';
import { BALOOT_TARGETS, type BalootView, type BSide } from '@/shared/games/baloot';
import type { RoomView } from '@/shared/protocol';
import { C, F } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { BalootCard, MoroccoDeck } from './baloot-card';
import { MaBidPanel, MaContractBar, MaHandBreakdown } from './baloot-morocco';
import { BidPanel, ContractBar, HandBreakdown, HandFan, InfoRow, ProjectLine, RaisePanel, ScoreSheet, Table } from './baloot-parts';
import { useTapToPlay } from './cards/card-ui';
import { ClaimButton, ClaimReveal } from './cards/claim';
import { CardStage, EASE, MOTION, SoftNumber, useCardLook } from './cards/motion';
import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

const teamNames = (v: BalootView, h: Helpers, side: BSide) =>
  v.sides.find((x) => x.key === side)!.members.map((m) => h.player(m).name).join(' و');

function NextHand({ v, h }: { v: BalootView; h: Helpers }) {
  const left = Math.ceil(useCountdown(v.nextAt) / 1000);
  return (
    <View style={{ gap: 6 }}>
      {h.isHost ? <Btn size="xl" icon="cards" label="التالي" onPress={() => h.act('next')} /> : null}
      <HostNote>{left > 0 ? `تبدأ اليد التالية بعد ${num(left)} ث` : 'تبدأ اليد التالية الآن'}</HostNote>
    </View>
  );
}

function playHint(v: BalootView, me: string): string {
  if (!v.trick.length) return 'ابدأ الأكلة بأي ورقة';
  const legal = v.myHand.filter((c) => v.playable.includes(c.id));
  if (legal.length === v.myHand.length) return 'العب أي ورقة';
  const led = v.trick[0].card.suit;
  if (legal.every((c) => c.suit === led)) return `اتبع الشكل المطلوب ${SUIT_SYM[led]}`;
  if (v.contract?.trump && legal.every((c) => c.suit === v.contract!.trump)) return `يجب أن تقطع بالحكم ${SUIT_SYM[v.contract.trump]}`;
  return me ? 'العب ورقة مضيئة' : '';
}

/** The Moroccan duties, in words. */
function maPlayHint(v: BalootView): string {
  if (!v.trick.length) return 'ابدأ الأكلة بأي ورقة';
  const legal = v.myHand.filter((c) => v.playable.includes(c.id));
  if (legal.length === v.myHand.length) return 'العب أي ورقة';
  const led = v.trick[0].card.suit;
  const trump = v.contract!.trump!;
  const trumps = v.myHand.filter((c) => c.suit === trump).length;
  if (legal.every((c) => c.suit === trump) && legal.length < trumps) return 'العب طرونفو أعلى من الطرونفو الموجود';
  if (led === trump && legal.every((c) => c.suit === trump)) return 'اتبع الطرونفو';
  if (legal.every((c) => c.suit === led)) return `اتبع الشكل المطلوب: ${maSuitName(led)}`;
  if (legal.every((c) => c.suit === trump)) return `يجب أن تقطع بالطرونفو: ${maSuitName(trump)}`;
  return 'العب ورقة مضيئة';
}

export function BalootGame({ room, view }: { room: RoomView; view: BalootView }) {
  const h = helpers(room);
  const [off, setOff] = useState<{ hand: number; keys: string[] }>({ hand: 0, keys: [] });
  const playing = view.phase === 'play' && view.turn === h.me;
  const offKeys = off.hand === view.hand ? off.keys : [];
  const tap = useTapToPlay({
    canPlay: (id) => playing && view.playable.includes(id),
    onPlay: (id) => h.act('play', { card: id, declare: view.myProjects.filter((p) => !offKeys.includes(p.key)).map((p) => p.key) }),
  });
  if (!view.seats.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase (it stays mounted from hand to hand, so the next deal glides in)
  return (
    <MoroccoDeck value={view.rules === 'morocco'}>
      <CardStage>
        {view.phase === 'handEnd' || view.phase === 'final' ? (
          <HandEnd room={room} v={view} h={h} />
        ) : (
          <TableScreen v={view} h={h} tap={tap} offKeys={offKeys} setOff={setOff} />
        )}
      </CardStage>
    </MoroccoDeck>
  );
}

function HandEnd({ room, v, h }: { room: RoomView; v: BalootView; h: Helpers }) {
  const ma = v.rules === 'morocco';
  const mySide = v.sides.find((x) => x.members.includes(h.me))!.key as BSide;
  const theirSide: BSide = mySide === 'A' ? 'B' : 'A';
  const final = v.phase === 'final';
  const won = final && v.winner === mySide;
  return (
    <>
      {won ? <Confetti /> : null}
      {final ? (
        <ResultBanner
          tone={won ? 'good' : 'neutral'}
          art={
            <Row gap={6} style={{ direction: 'ltr' }}>
              <BalootCard card={{ id: 'JS', suit: 'S', rank: 'J' }} width={44} />
              <BalootCard card={{ id: 'AH', suit: 'H', rank: 'A' }} width={44} />
            </Row>
          }
          title={won ? 'فاز فريقكم!' : v.winner ? `الفوز لفريق ${teamNames(v, h, v.winner)}` : 'انتهت اللعبة'}
          sub={`لنا ${num(v.scores[mySide])} — لهم ${num(v.scores[theirSide])}`}
        />
      ) : (
        <Txt v="display" center>
          نهاية اليد {num(v.hand)}
        </Txt>
      )}
      {!final && v.bel ? (
        <Txt v="bold" center color={C.orange}>
          تعادل فوق الهدف — «البيل»: يد فاصلة
        </Txt>
      ) : null}
      {ma ? <MaHandBreakdown v={v} h={h} /> : <HandBreakdown v={v} h={h} />}
      <ScoreSheet v={v} h={h} />
      {final ? <PlayAgain room={room} /> : <NextHand v={v} h={h} />}
    </>
  );
}

/** A line that keeps its place and only fades: the hand under it never jumps when the turn changes. */
function KeptHint({ text, show }: { text: string; show: boolean }) {
  const look = useCardLook({ dim: !show, dimTo: 0 });
  // the last hint stays (faded) while others play
  const [kept, setKept] = useState(text);
  if (text && text !== kept) setKept(text);
  return (
    <Animated.View style={[{ minHeight: 25 }, look]}>
      <Txt v="bold" center color={C.yellow} numberOfLines={1}>
        {text || kept}
      </Txt>
    </Animated.View>
  );
}

function TableScreen({
  v,
  h,
  tap,
  offKeys,
  setOff,
}: {
  v: BalootView;
  h: Helpers;
  tap: ReturnType<typeof useTapToPlay>;
  offKeys: string[];
  setOff: (x: { hand: number; keys: string[] }) => void;
}) {
  const cw = useContentWidth();
  const [sheet, setSheet] = useState(false);
  const ma = v.rules === 'morocco';
  const mySide = v.sides.find((x) => x.members.includes(h.me))!.key as BSide;
  const theirSide: BSide = mySide === 'A' ? 'B' : 'A';
  const myTurn = v.turn === h.me;
  const playing = v.phase === 'play' && myTurn;
  const selected = tap.selected;
  const score = (n: number) => <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 26 }}>{num(n)}</Txt>;
  const hint = playing ? (ma ? maPlayHint(v) : playHint(v, h.me)) : '';

  return (
    <>
      <View style={{ gap: 6 }}>
        {ma ? <MaContractBar v={v} h={h} /> : <ContractBar v={v} h={h} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="سجل النتائج"
          onPress={() => setSheet(!sheet)}
          style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, borderWidth: 1, borderColor: sheet ? C.yellow : C.borderStrong }}>
          <Txt v="tiny" color={C.muted}>
            لنا
          </Txt>
          <SoftNumber value={v.scores[mySide]} render={score} />
          <Txt v="tiny" color={C.dim}>
            ·
          </Txt>
          <Txt v="tiny" color={C.muted}>
            لهم
          </Txt>
          <SoftNumber value={v.scores[theirSide]} render={score} />
          <Txt v="tiny" color={C.dim}>
            / {num(v.target)}
          </Txt>
          <Icon name="bars" size={14} color={C.muted} />
        </Pressable>
        {sheet ? <ScoreSheet v={v} h={h} compact /> : null}
      </View>

      <View style={{ gap: 6 }}>
        <Table v={v} h={h} width={cw} />
        {v.deadline ? <TimerBar endsAt={v.deadline} total={v.timer * 1000} onTick={myTurn} /> : null}
        <InfoRow v={v} mine={mySide} />
      </View>

      {/* «الباقي لنا»: the option above my hand, then the claimer's cards face up */}
      {v.canClaim && !v.claimed ? <ClaimButton onPress={() => h.act('claim')} /> : null}
      {v.claimed ? (
        <ClaimReveal
          claimed={v.claimed}
          mySide={mySide}
          sideNames={(side) => teamNames(v, h, side as BSide)}
          h={h}
          renderCard={(c) => <BalootCard card={c} width={Math.max(28, Math.min(42, Math.floor((cw - 40) / 8)))} />}
        />
      ) : null}

      {/* the hand glides down (instead of jumping) when the claim option comes */}
      <Animated.View layout={LinearTransition.duration(MOTION.glide).easing(EASE)} style={{ gap: 4 }}>
        {v.phase === 'play' ? <KeptHint text={hint} show={playing} /> : null}
        <HandFan cards={v.myHand} width={cw} playable={v.playable} myTurn={playing} selected={selected} onPress={playing ? (c) => tap.tap(c.id) : undefined} />
        {/* the button keeps its place for the whole play: nothing jumps when a card is selected or played */}
        {v.phase === 'play' ? (
          <View style={{ minHeight: 56, justifyContent: 'center' }}>
            {selected ? <Btn size="lg" icon="down" label="العب هذه الورقة" onPress={tap.play} /> : null}
          </View>
        ) : null}
      </Animated.View>

      {/* the best team's projects (2nd trick) sit under my hand, so the hand itself never moves */}
      {v.shown ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 4, alignItems: 'center' }}>
          <Txt v="tiny" color={C.yellow}>
            {ma ? 'الإعلانات' : 'المشاريع'} {v.shown.side === mySide ? 'لنا' : 'لهم'}:
          </Txt>
          {v.shown.items.map((p, k) => (
            <ProjectLine key={k} p={p} h={h} />
          ))}
        </Animated.View>
      ) : null}

      {playing && v.myProjects.length ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 4, alignItems: 'center' }}>
          <Txt v="tiny" color={C.muted} center>
            {ma ? 'إعلاناتك تُعلن مع ورقتك في هذه الأكلة (اضغط إعلاناً لإلغائه):' : 'مشاريعك تُعلن مع ورقتك الأولى (اضغط مشروعاً لإلغاء إعلانه):'}
          </Txt>
          {v.myProjects.map((p) => {
            const on = !offKeys.includes(p.key);
            return (
              <ProjectLine
                key={p.key}
                p={p}
                h={h}
                on={on}
                onPress={() => setOff({ hand: v.hand, keys: on ? [...offKeys, p.key] : offKeys.filter((k) => k !== p.key) })}
              />
            );
          })}
        </Animated.View>
      ) : null}

      {v.phase === 'bid' && myTurn && ma ? <MaBidPanel v={v} width={cw} onCall={(call, suit) => h.act('bid', { call, suit })} /> : null}
      {v.phase === 'bid' && myTurn && !ma ? <BidPanel v={v} width={cw} onCall={(call, suit) => h.act('bid', { call, suit })} /> : null}
      {v.phase === 'double' && myTurn ? <RaisePanel v={v} width={cw} onRaise={(raise) => h.act('raise', { raise })} /> : null}
    </>
  );
}

/** Lobby settings: the rules (Saudi / Moroccan), target, timer, doubling (the bots' strength is the room's «مستوى البوتات»). */
export function BalootSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.baloot;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'baloot', patch });
  const ma = s.mode === 'morocco';
  const targets = BALOOT_TARGETS[ma ? 'morocco' : 'saudi'];
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">القواعد</Txt>
      <ChipPicker
        editable={editable}
        value={ma ? 'morocco' : 'saudi'}
        onChange={(x) => change({ mode: x })}
        options={[
          { key: 'saudi', label: 'سعودية' },
          { key: 'morocco', label: 'مغربية' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        {ma
          ? 'البلوط المغربي بالورق المغربي: الطرونفو والإعلانات وبلوط-ريبلوط، واللعب حتى 1000. القواعد في «كيف نلعب؟».'
          : 'البلوط السعودي بالورق الفرنسي: صن وحكم وأشكل والمشاريع والدبل، واللعب حتى 152.'}
      </Txt>
      <Txt v="bold">نهاية اللعبة</Txt>
      <ChipPicker
        editable={editable}
        value={String(targets.includes(s.target) ? s.target : targets[0])}
        onChange={(x) => change({ target: Number(x) })}
        options={[
          { key: String(targets[0]), label: `${targets[0]} نقطة` },
          { key: String(targets[1]), label: `${targets[1]} (قصيرة)` },
        ]}
      />
      <Txt v="bold">الوقت لكل قرار</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.timer) as '0' | '20' | '30' | '45'}
        onChange={(x) => change({ timer: Number(x) })}
        options={[
          { key: '0', label: 'بدون وقت' },
          { key: '20', label: '20 ث' },
          { key: '30', label: '30 ث' },
          { key: '45', label: '45 ث' },
        ]}
      />
      {ma ? null : <Toggle label="السماح بالدبل (ثري، فور، قهوة)" value={s.doubling} editable={editable} onChange={(x) => change({ doubling: x })} />}
      <Txt v="tiny" color={C.muted}>
        4 لاعبين في فريقين متقابلين؛ أكملوا المقاعد بالبوتات. عندما ينتهي الوقت يمرّر الحاسوب الشراء أو يلعب ورقة بدلاً منك.
      </Txt>
    </View>
  );
}
