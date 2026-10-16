/** «الكذّاب» — play cards face down, claim a rank, and catch the liars. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { RANKS } from '@/shared/cards';
import type { KdabView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { CardRow, Felt, LastEvent, PlayingCard, Seats } from './cards/card-ui';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';

const RANK_NAME: Record<number, string> = { 1: 'آص', 10: 'صوطا', 11: 'عود', 12: 'ري' };
const rankLabel = (r: number) => RANK_NAME[r] ?? String(r);

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
        <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="kdab" size={84} />} title={view.winner ? `فاز ${h.player(view.winner).name}` : 'انتهت اللعبة'} sub="تخلّص من كل أوراقه أولاً" />
        <Seats seats={view.order} turn={null} counts={view.handCounts} h={h} />
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
      <Seats seats={view.order} turn={view.turn} counts={view.handCounts} h={h} label={(id) => (view.finishing?.id === id ? 'آخر ورقة!' : null)} />

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
            <Txt v="small" center color="#FFF4DA">
              {h.player(view.last.by).name} لعب {num(view.last.count)} {view.last.count === 1 ? 'ورقة' : 'أوراق'} وقال «{rankLabel(view.last.rank)}»
            </Txt>
          ) : null}
        </View>
      </Felt>

      {view.canCall ? (
        <Animated.View entering={ZoomIn.duration(180)}>
          <Btn
            size="xl"
            color={C.red}
            icon="siren"
            label="كذّاب!"
            onPress={() => {
              haptic.heavy();
              h.act('call');
            }}
          />
        </Animated.View>
      ) : null}

      {view.reveal ? (
        <Animated.View key={view.reveal.id} entering={FadeIn.duration(220)} style={[styles.reveal, { borderColor: view.reveal.truthful ? C.green : C.red }]}>
          <Txt v="bold" center>
            {view.reveal.truthful
              ? `${h.player(view.reveal.player).name} كان صادقاً — ${h.player(view.reveal.taker).name} يأخذ الكومة`
              : `${h.player(view.reveal.player).name} كذب! يأخذ الكومة`}
          </Txt>
          <CardRow cards={view.reveal.cards} size="sm" />
        </Animated.View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Txt v="bold" center color={myTurn ? C.yellow : C.muted}>
          {myTurn ? (starting ? `ابدأ كومة: اختر من 1 إلى ${num(max)} أوراق والرقم الذي تدّعيه` : `العب أوراقاً وقل «${rankLabel(view.rank!)}» — أو مرّ`) : `دور ${h.player(view.turn).name}…`}
        </Txt>
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
            {!starting ? <Btn size="lg" ghost label="مرّ" onPress={() => h.act('pass')} /> : null}
          </Row>
        ) : null}
      </View>
      <LastEvent feed={view.feed} h={h} />
    </>
  );
}

const styles = StyleSheet.create({
  emptyPile: { width: 58, height: 87, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  reveal: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, padding: 10, gap: 8 },
  rank: { minWidth: 44, alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 2, borderColor: C.border },
  rankOn: { backgroundColor: C.yellow, borderColor: C.yellow },
});
