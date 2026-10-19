/** «التوتي» — the screen: table, auction, trump choice, «الغناء», my hand, the score sheet and the end of each hand. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { useCountdown } from '@/lib/time';
import { TOUTI_TARGETS, type ToutiView, type TSide } from '@/shared/games/touti';
import type { RoomView } from '@/shared/protocol';
import { suitName } from '@/shared/touti-rules';
import { C, F } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { useTapToPlay } from './cards/card-ui';
import { CardStage, SoftNumber, useCardLook } from './cards/motion';
import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { BidPanel, ClaimReveal, ContractBar, HandBreakdown, HandFan, InfoRow, ScoreSheet, SingPanel, SungLine, Table, ToutiCard, TrumpPanel } from './touti-parts';

const teamNames = (v: ToutiView, h: Helpers, side: TSide) =>
  v.sides.find((x) => x.key === side)!.members.map((m) => h.player(m).name).join(' و');

function NextHand({ v, h }: { v: ToutiView; h: Helpers }) {
  const left = Math.ceil(useCountdown(v.nextAt) / 1000);
  return (
    <View style={{ gap: 6 }}>
      {h.isHost ? <Btn size="xl" icon="cards" label="التالي" onPress={() => h.act('next')} /> : null}
      <HostNote>{left > 0 ? `تبدأ اليد التالية بعد ${num(left)} ث` : 'تبدأ اليد التالية الآن'}</HostNote>
    </View>
  );
}

/** The duty for my card, in words. */
function playHint(v: ToutiView): string {
  if (!v.trick.length) return 'ابدأ الأكلة بأي ورقة';
  const legal = v.myHand.filter((c) => v.playable.includes(c.id));
  if (legal.length === v.myHand.length) return 'العب أي ورقة';
  const led = v.trick[0].card.suit;
  const trump = v.trump!;
  const trumps = v.myHand.filter((c) => c.suit === trump).length;
  if (led !== trump && legal.every((c) => c.suit === trump) && legal.length < trumps) return 'اعلُ على الطرونفو الموجود';
  if (legal.every((c) => c.suit === led)) return `اتبع الشكل المطلوب: ${suitName(led)}`;
  if (legal.every((c) => c.suit === trump)) return `اقطع بالطرونفو: ${suitName(trump)}`;
  return 'العب ورقة مضيئة';
}

export function ToutiGame({ room, view }: { room: RoomView; view: ToutiView }) {
  const h = helpers(room);
  const playing = view.phase === 'play' && view.turn === h.me && !view.singer;
  const tap = useTapToPlay({
    canPlay: (id) => playing && view.playable.includes(id),
    onPlay: (id) => h.act('play', { card: id }),
  });
  if (!view.seats.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase (it stays mounted from hand to hand, so the next deal glides in)
  return (
    <CardStage>
      {view.phase === 'handEnd' || view.phase === 'final' ? <HandEnd room={room} v={view} h={h} /> : <TableScreen v={view} h={h} tap={tap} playing={playing} />}
    </CardStage>
  );
}

function HandEnd({ room, v, h }: { room: RoomView; v: ToutiView; h: Helpers }) {
  const mySide = v.sides.find((x) => x.members.includes(h.me))!.key as TSide;
  const theirSide: TSide = mySide === 'A' ? 'B' : 'A';
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
              <ToutiCard card={{ id: 'cups-12', suit: 'cups', rank: 12 }} width={42} />
              <ToutiCard card={{ id: 'cups-11', suit: 'cups', rank: 11 }} width={42} />
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
      <HandBreakdown v={v} h={h} />
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

function TableScreen({ v, h, tap, playing }: { v: ToutiView; h: Helpers; tap: ReturnType<typeof useTapToPlay>; playing: boolean }) {
  const cw = useContentWidth();
  const [sheet, setSheet] = useState(false);
  const mySide = v.sides.find((x) => x.members.includes(h.me))!.key as TSide;
  const theirSide: TSide = mySide === 'A' ? 'B' : 'A';
  const myTurn = v.turn === h.me;
  const selected = tap.selected;
  const score = (n: number) => <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 26 }}>{num(n)}</Txt>;
  const hint = playing ? playHint(v) : '';
  const singing = v.phase === 'play' && v.singer === h.me && v.mySing.length > 0;

  return (
    <>
      <View style={{ gap: 6 }}>
        <ContractBar v={v} h={h} />
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
        <InfoRow v={v} />
        <SungLine sung={v.sung} h={h} trump={v.trump} />
      </View>

      <ClaimReveal v={v} h={h} />

      {singing ? <SingPanel v={v} width={Math.min(cw, 360)} onSing={(suit) => h.act('sing', { suit })} /> : null}

      <View style={{ gap: 4 }}>
        {/* every remaining trick is certain: end the hand at once (calm, above the hand) */}
        {playing && v.canClaim ? <Btn size="md" icon="check" label="الباقي لنا — أنهِ اليد" ghost onPress={() => h.act('claim')} /> : null}
        {v.phase === 'play' && !singing ? <KeptHint text={hint} show={playing} /> : null}
        <HandFan cards={v.myHand} width={cw} playable={v.playable} myTurn={playing} selected={selected} onPress={playing ? (c) => tap.tap(c.id) : undefined} />
        {/* the button keeps its place for the whole play: nothing jumps when a card is selected or played */}
        {v.phase === 'play' && !singing ? (
          <View style={{ minHeight: 56, justifyContent: 'center' }}>{selected ? <Btn size="lg" icon="down" label="العب هذه الورقة" onPress={tap.play} /> : null}</View>
        ) : null}
      </View>

      {v.phase === 'bid' && myTurn ? <BidPanel v={v} width={cw} onBid={(bid) => h.act('bid', { bid })} /> : null}
      {v.phase === 'trump' && myTurn ? <TrumpPanel v={v} width={cw} onPick={(suit) => h.act('trump', { suit })} /> : null}
    </>
  );
}

/** Lobby settings: target, timer, who sings, the partner rule (the bots' strength is the room's). */
export function ToutiSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.touti;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'touti', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">نهاية اللعبة</Txt>
      <ChipPicker
        editable={editable}
        value={String(TOUTI_TARGETS.includes(s.target) ? s.target : TOUTI_TARGETS[0])}
        onChange={(x) => change({ target: Number(x) })}
        options={[
          { key: '600', label: '600 نقطة' },
          { key: '300', label: '300 (قصيرة)' },
          { key: '1000', label: '1000 (طويلة)' },
        ]}
      />
      <Txt v="bold">من يغنّي بعد الأكلة؟</Txt>
      <ChipPicker
        editable={editable}
        value={s.singBy}
        onChange={(x) => change({ singBy: x })}
        options={[
          { key: 'winner', label: 'آخذ الأكلة' },
          { key: 'team', label: 'أي لاعب من الفريق' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        {s.singBy === 'team'
          ? 'بعد أكلة لفريق الشاري يغنّي آخذها زوجاً، وإلا فشريكه.'
          : 'بعد أكلة لفريق الشاري يغنّي آخذها وحده زوجاً من يده (الملك والفارس من شكل واحد).'}
      </Txt>
      <Toggle label="لا قطع على الشريك: إن كانت الأكلة لشريكك فالعب ما تشاء" value={s.partnerFree} editable={editable} onChange={(x) => change({ partnerFree: x })} />
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
      <Txt v="tiny" color={C.muted}>
        4 لاعبين في فريقين متقابلين؛ أكملوا المقاعد بالبوتات. عندما ينتهي الوقت يقول الحاسوب «باص» أو يغنّي أو يلعب ورقة بدلاً منك.
      </Txt>
    </View>
  );
}
