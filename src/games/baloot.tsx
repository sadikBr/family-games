/** «البلوط» — the screen: table, bidding, doubling, my hand, the score sheet and the end of each hand. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { useCountdown } from '@/lib/time';
import { maSuitName } from '@/shared/baloot-morocco';
import { SUIT_SYM } from '@/shared/baloot-rules';
import { BALOOT_TARGETS, type BalootView, type BCard, type BSide } from '@/shared/games/baloot';
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
import { DOUBLE_TAP_MS, tapClock } from './cards/card-ui';
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
  if (legal.every((c) => c.suit === trump) && legal.length < trumps) return 'العب أتو أعلى من الأتو الموجود';
  if (led === trump && legal.every((c) => c.suit === trump)) return 'اتبع الأتو';
  if (legal.every((c) => c.suit === led)) return `اتبع الشكل المطلوب: ${maSuitName(led)}`;
  if (legal.every((c) => c.suit === trump)) return `يجب أن تقطع بالأتو: ${maSuitName(trump)}`;
  return 'العب ورقة مضيئة';
}

export function BalootGame({ room, view }: { room: RoomView; view: BalootView }) {
  const h = helpers(room);
  const cw = useContentWidth();
  const [sel, setSel] = useState<string | null>(null);
  const [selAt, setSelAt] = useState(0);
  const [off, setOff] = useState<{ hand: number; keys: string[] }>({ hand: 0, keys: [] });
  const [sheet, setSheet] = useState(false);
  if (!view.seats.includes(h.me)) return <Spectator room={room} />;

  const v = view;
  const ma = v.rules === 'morocco';
  const mySide = v.sides.find((x) => x.members.includes(h.me))!.key as BSide;
  const theirSide: BSide = mySide === 'A' ? 'B' : 'A';

  if (v.phase === 'handEnd' || v.phase === 'final') {
    const final = v.phase === 'final';
    const won = final && v.winner === mySide;
    return (
      <MoroccoDeck value={ma}>
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
      </MoroccoDeck>
    );
  }

  const myTurn = v.turn === h.me;
  const playing = v.phase === 'play' && myTurn;
  const selected = playing && sel && v.playable.includes(sel) ? sel : null;
  const offKeys = off.hand === v.hand ? off.keys : [];
  const play = (id: string) => {
    h.act('play', { card: id, declare: v.myProjects.filter((p) => !offKeys.includes(p.key)).map((p) => p.key) });
    setSel(null);
  };
  const tap = (c: BCard) => {
    if (!v.playable.includes(c.id)) return;
    const now = tapClock();
    if (sel !== c.id) {
      setSel(c.id);
      setSelAt(now);
    } else if (now - selAt >= DOUBLE_TAP_MS) play(c.id);
  };

  return (
    <MoroccoDeck value={ma}>
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
          <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 26 }}>{num(v.scores[mySide])}</Txt>
          <Txt v="tiny" color={C.dim}>
            ·
          </Txt>
          <Txt v="tiny" color={C.muted}>
            لهم
          </Txt>
          <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 26 }}>{num(v.scores[theirSide])}</Txt>
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
      </View>

      <View style={{ gap: 4 }}>
        {playing ? (
          <Txt v="bold" center color={C.yellow}>
            {ma ? maPlayHint(v) : playHint(v, h.me)}
          </Txt>
        ) : null}
        <HandFan cards={v.myHand} width={cw} playable={v.playable} myTurn={playing} selected={selected} onPress={playing ? tap : undefined} />
        {selected ? <Btn size="lg" icon="down" label="العب هذه الورقة" onPress={() => play(selected)} /> : null}
      </View>

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
    </MoroccoDeck>
  );
}

/** Lobby settings: the rules (Saudi / Moroccan), target, timer, doubling, bots. */
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
          ? 'البلوط المغربي بالورق المغربي: الأتو والإعلانات وبلوط-ريبلوط، واللعب حتى 1000. القواعد في «كيف نلعب؟».'
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
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.level) as '1' | '2'}
        onChange={(x) => change({ level: Number(x) })}
        options={[
          { key: '1', label: 'مبتدئ' },
          { key: '2', label: 'قوي' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        4 لاعبين في فريقين متقابلين؛ أكملوا المقاعد بالبوتات. عندما ينتهي الوقت يمرّر الحاسوب الشراء أو يلعب ورقة بدلاً منك.
      </Txt>
    </View>
  );
}
