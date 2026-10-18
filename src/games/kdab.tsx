/** «الكذّاب» — play cards face down, claim a rank, and catch the liars. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { RANKS } from '@/shared/cards';
import type { KdabView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { CardRow, Felt, PlayingCard, TableStrip, TurnLine, cardsWord } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

const RANK_NAME: Record<number, string> = { 1: 'الآس', 10: 'الخادم', 11: 'الفارس', 12: 'الملك' };
const rankLabel = (r: number) => RANK_NAME[r] ?? String(r);

/** The cards a «كذّاب!» turned over: were they what was claimed, and who takes the pile. */
function RevealBox({ reveal, h }: { reveal: NonNullable<KdabView['reveal']>; h: Helpers }) {
  return (
    <Animated.View key={reveal.id} entering={FadeIn.duration(220)} style={[styles.reveal, { borderColor: reveal.truthful ? C.green : C.red }]}>
      <Txt v="bold" numberOfLines={2} style={{ flex: 1 }}>
        {reveal.truthful ? `صدقٌ من ${h.player(reveal.player).name} — الكومة لـ${h.player(reveal.taker).name}` : `كذبٌ من ${h.player(reveal.player).name}! — الكومة لـ${h.player(reveal.taker).name}`}
      </Txt>
      <Row gap={3}>
        {reveal.cards.map((c) => (
          <PlayingCard key={c.id} card={c} size="xs" />
        ))}
      </Row>
    </Animated.View>
  );
}

export function KdabGame({ room, view }: { room: RoomView; view: KdabView }) {
  const h = helpers(room);
  const max = room.settings.kdab.maxPlay;
  const [picked, setPicked] = useState<string[]>([]);
  const [claim, setClaim] = useState<number | null>(null);
  if (!view.order.includes(h.me) && view.phase !== 'final') return <Spectator room={room} />;

  if (view.phase === 'final') {
    const won = view.winner === h.me;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="kdab" size={84} />} title={view.winner ? `الفوز ${li(h.player(view.winner).name)}` : 'انتهت اللعبة'} sub="أول يدٍ فارغة من الأوراق" />
        <Podium players={view.order.map((id) => h.player(id))} scores={view.handCounts} lowIsBetter />
        <Scoreboard players={room.players} scores={view.handCounts} lowIsBetter unit="ورقة" highlight={h.me} />
        <PlayAgain room={room} />
      </>
    );
  }

  const myTurn = view.turn === h.me;
  const sel = picked.filter((id) => view.myHand.some((c) => c.id === id));
  const starting = view.rank === null;
  const rank = starting ? claim : view.rank;

  return (
    <>
      <TableStrip room={room} ids={view.order} turn={view.turn} sub={(id) => (view.finishing?.id === id ? 'آخر ورقة!' : cardsWord(view.handCounts[id] ?? 0))} />

      <Felt minHeight={150} active={myTurn}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Row gap={12} center>
            <View style={{ width: 70, height: 100 }}>
              {Array.from({ length: Math.min(view.pileCount, 5) }, (_, k) => (
                <View key={k} style={{ position: 'absolute', left: k * 3, top: -k * 3 }}>
                  <PlayingCard card={null} size="md" />
                </View>
              ))}
              {!view.pileCount ? <View style={styles.emptyPile} /> : null}
            </View>
            <View style={{ gap: 4 }}>
              <Txt v="tiny" color={alpha('#FFFFFF', 0.7)}>
                الكومة: {num(view.pileCount)} ورقة
              </Txt>
              <Txt style={{ fontFamily: F.display, fontSize: 24, lineHeight: 36, color: '#FFF4DA' }}>{view.rank !== null ? `الرقم: ${rankLabel(view.rank)}` : 'كومة جديدة'}</Txt>
            </View>
          </Row>
          {view.last ? (
            <Animated.View key={view.last.id} entering={FadeIn.duration(220)}>
              <Row gap={6} center>
                <Avatar player={h.player(view.last.by)} size={20} />
                <Txt v="small" center color="#FFF4DA" style={{ flexShrink: 1 }}>
                  {h.player(view.last.by).name}: {cardsWord(view.last.count)} — «{rankLabel(view.last.rank)}»
                </Txt>
              </Row>
            </Animated.View>
          ) : null}
          {/* the «كذّاب!» button holds the slot below: the cards of the last reveal stay visible here */}
          {view.canCall && view.reveal ? <RevealBox reveal={view.reveal} h={h} /> : null}
        </View>
      </Felt>

      {/* fixed-height slot: the «كذّاب!» button or the reveal, so the hand below never jumps */}
      <View style={styles.slot}>
        {view.canCall && view.last ? (
          <Animated.View key={view.last.id} entering={FadeIn.duration(180)}>
            <Btn
              size="xl"
              color={C.red}
              icon="siren"
              label="كذّاب!"
              onPress={() => {
                haptic.heavy();
                h.act('call', { play: view.last!.id });
              }}
            />
          </Animated.View>
        ) : view.reveal ? (
          <RevealBox reveal={view.reveal} h={h} />
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <TurnLine myTurn={myTurn} text={starting ? `ابدأ كومة: اختر من 1 إلى ${num(max)} أوراق والرقم الذي تدّعيه` : `العب أوراقاً وقل «${rankLabel(view.rank ?? 1)}» — أو مرّر`} />
        <CardRow
          cards={view.myHand}
          size="md"
          selected={sel}
          onPress={
            myTurn
              ? (c) =>
                  setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : p.length >= max ? p : [...p, c.id]))
              : undefined
          }
          empty="لم تبق لديك أوراق"
        />
        {myTurn && starting ? (
          <Row gap={6} wrap center>
            {RANKS.map((r) => (
              <Pressable key={r} onPress={() => setClaim(r)} style={[styles.rank, claim === r && styles.rankOn]} accessibilityLabel={`أدّعي ${rankLabel(r)}`}>
                <Txt v="bold" color={claim === r ? C.ink : C.text}>
                  {rankLabel(r)}
                </Txt>
              </Pressable>
            ))}
          </Row>
        ) : null}
        {myTurn ? (
          <Row gap={8}>
            <Btn
              flex
              size="lg"
              icon="cards"
              label={sel.length ? `العب ${num(sel.length)}${rank !== null ? ` — «${rankLabel(rank)}»` : ''}` : 'اختر أوراقاً'}
              disabled={!sel.length || rank === null}
              onPress={() => {
                haptic.medium();
                h.act('play', { cards: sel, rank });
                setPicked([]);
                setClaim(null);
              }}
            />
            {!starting ? <Btn size="lg" ghost label="مرّر" onPress={() => h.act('pass')} /> : null}
          </Row>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  emptyPile: { width: 58, height: 87, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  slot: { height: 78, justifyContent: 'center' },
  reveal: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, paddingVertical: 6, paddingHorizontal: 10, gap: 8 },
  rank: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 8, borderWidth: 2, borderColor: C.border },
  rankOn: { backgroundColor: C.yellow, borderColor: C.yellow },
});
