/** «الكذّاب» — play cards face down, claim a rank, and catch the liars. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CARD_RATIO } from '@/art/spanish-card';
import { GameArt } from '@/art/game-art';
import { haptic } from '@/lib/sfx';
import { RANKS } from '@/shared/cards';
import type { KdabView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { Felt, PlayingCard, TableStrip, TurnLine, cardsWord } from './cards/card-ui';
import { Grow, HandRow, handSize } from './cards/hand';
import { CardMotion, CardStage, MOTION, useLeaving } from './cards/motion';
import { usePicks } from './cards/pick';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';

const RANK_NAME: Record<number, string> = { 1: 'الآس', 10: 'الخادم', 11: 'الفارس', 12: 'الملك' };
const rankLabel = (r: number) => RANK_NAME[r] ?? String(r);

/** the pile's cards are size md: 58 px wide plus the 2 px frame of PlayingCard */
const CARD_W = 62;
const CARD_H = 58 * CARD_RATIO + 4;
const PILE_W = CARD_W + 30;
const PILE_H = CARD_H + 16;
/** how many cards of the pile are drawn (the ones under them are hidden anyway) */
const PILE_SHOWN = 8;

/** The cards a «كذّاب!» turned over: were they what was claimed, and who takes the pile. */
function RevealBox({ reveal, h, arrive }: { reveal: NonNullable<KdabView['reveal']>; h: Helpers; arrive: boolean }) {
  return (
    <Animated.View key={reveal.id} entering={FadeIn.duration(220)} style={[styles.reveal, { borderColor: reveal.truthful ? C.green : C.red }]}>
      <Txt v="bold" numberOfLines={2} style={{ flex: 1 }}>
        {reveal.truthful ? `صدقٌ من ${h.player(reveal.player).name} — الكومة لـ${h.player(reveal.taker).name}` : `كذبٌ من ${h.player(reveal.player).name}! — الكومة لـ${h.player(reveal.taker).name}`}
      </Txt>
      <Row gap={3}>
        {/* turned over on the pile: my own cards glide up from it, the others' slide in */}
        {reveal.cards.map((c) => (
          <CardMotion key={c.id} id={c.id} enter={arrive ? 'play' : 'none'} from="top" source={false}>
            <PlayingCard card={c} size="xs" />
          </CardMotion>
        ))}
      </Row>
    </Animated.View>
  );
}

/** A card of the pile as this phone knows it: my own cards keep their id (they fly from my hand), the others' get one. */
type PileCard = { key: string; by: string; play: number };
type PileExit = { taker: string | null };
type PileState = { sig: string; cards: PileCard[]; lastPlay: number; revealId: number; exit: PileExit };

/**
 * The pile, rebuilt from the view: each play adds its cards on top; when the pile is emptied, the
 * cards leave toward whoever took them (a «كذّاب!»), or aside (everybody passed).
 */
function usePile(view: KdabView, me: string, sent: string[]): PileState {
  const revealId = view.reveal?.id ?? 0;
  const sig = `${view.last?.id ?? 0}:${view.pileCount}:${revealId}`;
  const [st, setSt] = useState<PileState>(() => ({ sig: '', cards: [], lastPlay: 0, revealId, exit: { taker: null } }));
  if (st.sig === sig) return st;
  const exit: PileExit = { taker: revealId !== st.revealId && view.reveal ? view.reveal.taker : null };
  let cards = st.cards;
  let lastPlay = st.lastPlay;
  if (!view.pileCount) cards = [];
  else if (view.last && view.last.id !== st.lastPlay) {
    const play = view.last;
    lastPlay = play.id;
    // the cards I just played keep their ids: they glide from my hand onto the pile
    const mine = play.by === me && sent.length === play.count && sent.every((id) => !view.myHand.some((c) => c.id === id));
    const added = Array.from({ length: play.count }, (_, k) => ({ key: mine ? sent[k] : `kdab-${play.id}-${k}`, by: play.by, play: play.id }));
    cards = [...(view.pileCount === play.count ? [] : cards), ...added];
  }
  // joined in the middle of a pile, or a play this phone missed: the rest of the pile, face down
  if (cards.length < view.pileCount) {
    const n = view.pileCount - cards.length;
    cards = [...Array.from({ length: n }, (_, k) => ({ key: `kdab-base-${lastPlay}-${k}`, by: '', play: 0 })), ...cards];
  } else if (cards.length > view.pileCount) cards = cards.slice(cards.length - view.pileCount);
  // the exit is decided when cards leave the pile
  const left = st.cards.some((c) => !cards.some((x) => x.key === c.key));
  const next = { sig, cards, lastPlay, revealId, exit: left ? exit : st.exit };
  setSt(next);
  return next;
}

/** A small, steady tilt and offset for each card of the pile (from its key, so it never changes). */
function jitter(key: string) {
  let n = 2166136261;
  for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 16777619);
  const f = () => {
    n = Math.imul(n ^ (n >>> 15), 2246822507);
    n = Math.imul(n ^ (n >>> 13), 3266489909);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5;
  };
  return { x: 15 + f() * 16, y: 8 + f() * 10, rot: f() * 28 };
}

export function KdabGame({ room, view }: { room: RoomView; view: KdabView }) {
  const h = helpers(room);
  const max = room.settings.kdab.maxPlay;
  const myTurn = view.phase === 'play' && view.turn === h.me;
  const starting = view.rank === null;
  // the claim for a new pile, forgotten when the turn moves on
  const claimKey = `${view.turn}:${view.reveal?.id ?? 0}`;
  const [claimSt, setClaimSt] = useState<{ key: string; rank: number | null }>({ key: claimKey, rank: null });
  const claim = claimSt.key === claimKey ? claimSt.rank : null;
  const setClaim = (r: number | null) => setClaimSt({ key: claimKey, rank: r });
  const rank = starting ? claim : view.rank;
  // the cards of my latest play: they keep their ids on the pile, so they glide there from my hand
  const [sent, setSent] = useState<string[]>([]);
  const send = (ids: string[]) => {
    haptic.medium();
    setSent(ids);
    h.act('play', { cards: ids, rank });
    setClaim(null);
  };
  // pick 1..max cards; a lone picked card tapped again is played (once the claimed number is known)
  const picks = usePicks({
    resetKey: `${claimKey}:${view.rank ?? 'new'}`,
    max,
    canPick: (id) => myTurn && view.myHand.some((c) => c.id === id),
    quick: () => rank !== null,
    onQuick: (id) => send([id]),
  });
  const pile = usePile(view, h.me, sent);
  if (!view.order.includes(h.me) && view.phase !== 'final') return <Spectator room={room} />;
  return (
    <CardStage>
      <KdabScreen room={room} view={view} picks={picks} pile={pile} claim={claim} setClaim={setClaim} rank={rank} send={send} max={max} />
    </CardStage>
  );
}

function KdabScreen({
  room,
  view,
  picks,
  pile,
  claim,
  setClaim,
  rank,
  send,
  max,
}: {
  room: RoomView;
  view: KdabView;
  picks: ReturnType<typeof usePicks>;
  pile: PileState;
  claim: number | null;
  setClaim: (r: number | null) => void;
  rank: number | null;
  send: (ids: string[]) => void;
  max: number;
}) {
  const h = helpers(room);
  const width = useContentWidth();
  const revealId = view.reveal?.id ?? 0;
  const [revealSeen, setRevealSeen] = useState(revealId);
  useEffect(() => {
    if (revealId === revealSeen) return;
    const t = setTimeout(() => setRevealSeen(revealId), MOTION.fly + 200);
    return () => clearTimeout(t);
  }, [revealId, revealSeen]);
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
  const sel = picks.picked;
  // the revealed cards glide in only when the reveal is new (the box later moves between the slot and the table)
  const freshReveal = !!view.reveal && view.reveal.id !== revealSeen;
  const starting = view.rank === null;
  const full = max > 1 && sel.length >= max;
  const hint = !myTurn
    ? ''
    : starting && claim === null
      ? 'اختر الرقم الذي تدّعيه'
      : sel.length === 1
        ? 'اضغط الورقة مرة ثانية للعب، أو اختر أوراقاً أخرى'
        : full
          ? `${num(max)} أوراق: الحدّ الأقصى`
          : '';

  return (
    <>
      <TableStrip room={room} ids={view.order} turn={view.turn} sub={(id) => (view.finishing?.id === id ? 'آخر ورقة!' : cardsWord(view.handCounts[id] ?? 0))} />

      <Felt minHeight={0} active={myTurn}>
        <Row gap={12} center>
          <PileView view={view} pile={pile} h={h} />
          <View style={{ gap: 4 }}>
            <Txt v="tiny" color={alpha('#FFFFFF', 0.7)}>
              {view.pileCount ? `الكومة: ${cardsWord(view.pileCount)}` : 'الكومة فارغة'}
            </Txt>
            <Txt style={{ fontFamily: F.display, fontSize: 24, lineHeight: 36, color: '#FFF4DA' }}>{view.rank !== null ? `الرقم: ${rankLabel(view.rank)}` : 'كومة جديدة'}</Txt>
          </View>
        </Row>
        {/* the table grows smoothly when the last play's line or the reveal appears */}
        <Grow>
          <View style={{ alignItems: 'center', gap: 8 }}>
            {view.last ? (
              <Animated.View key={view.last.id} entering={FadeIn.duration(220)} style={[styles.lastLine, { borderColor: alpha(h.player(view.last.by).color, 0.8) }]}>
                <Avatar player={h.player(view.last.by)} size={20} />
                <Txt v="small" center color="#FFF4DA" style={{ flexShrink: 1 }} numberOfLines={1}>
                  {h.player(view.last.by).name}: {cardsWord(view.last.count)} — «{rankLabel(view.last.rank)}»
                </Txt>
              </Animated.View>
            ) : null}
            {/* the «كذّاب!» button holds the slot below: the cards of the last reveal stay visible here */}
            {view.canCall && view.reveal ? <RevealBox reveal={view.reveal} h={h} arrive={freshReveal} /> : null}
          </View>
        </Grow>
      </Felt>

      <View style={{ gap: 14 }}>
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
            <RevealBox reveal={view.reveal} h={h} arrive={freshReveal} />
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <TurnLine myTurn={myTurn} text={starting ? `ابدأ كومة: اختر من 1 إلى ${num(max)} أوراق والرقم الذي تدّعيه` : `العب أوراقاً وقل «${rankLabel(view.rank ?? 1)}» — أو مرّر`} keep />
          {/* one card size for the whole game, chosen from the deal; always pressable (picks ignores a tap
              when it isn't my turn): dropping the press handler would rebuild every card face and blink the hand */}
          <HandRow
            cards={view.myHand}
            size={handSize(Math.ceil(40 / view.order.length), width, 6)}
            gap={6}
            selected={sel}
            dim={full ? view.myHand.filter((c) => !sel.includes(c.id)).map((c) => c.id) : []}
            onPress={(c) => picks.tap(c.id)}
            // the hand keeps its height during a pile (cards leaving never lift the buttons), and fits again between piles
            keep={`${view.reveal?.id ?? 0}-${view.rank === null ? (view.last?.id ?? 0) : 'pile'}`}
            empty="لم تبق لديك أوراق"
          />
          {myTurn && starting ? (
            <Row gap={6} wrap center>
              {RANKS.map((r) => (
                <Pressable key={r} onPress={() => setClaim(r)} style={[styles.rank, claim === r && styles.rankOn]} accessibilityRole="button" accessibilityState={{ selected: claim === r }} accessibilityLabel={`أدّعي ${rankLabel(r)}`}>
                  <Txt v="bold" color={claim === r ? C.ink : C.text}>
                    {rankLabel(r)}
                  </Txt>
                </Pressable>
              ))}
            </Row>
          ) : null}
          {/* the buttons keep their place: nothing jumps when the turn comes or goes */}
          <View style={{ minHeight: 80, gap: 6 }}>
            {myTurn ? (
              <>
                <Row gap={8}>
                  <Btn
                    flex
                    size="lg"
                    icon="cards"
                    // the claimed number is on the table and in the line above: on a narrow screen the button says only how many
                    label={sel.length ? `العب ${num(sel.length)}${rank !== null && width >= 340 ? ` — «${rankLabel(rank)}»` : ''}` : 'اختر أوراقاً'}
                    disabled={!sel.length || rank === null}
                    onPress={() => {
                      send(sel);
                      picks.clear();
                    }}
                  />
                  {!starting ? <Btn size="lg" ghost label="مرّر" onPress={() => h.act('pass')} /> : null}
                  <Btn size="lg" icon="close" ghost disabled={!sel.length} onPress={picks.clear} style={!sel.length && styles.off} />
                </Row>
                <Txt v="tiny" center color={C.dim} numberOfLines={1}>
                  {hint}
                </Txt>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}

/**
 * The pile on the table, face down and a little untidy. Played cards land on it (mine glide from my
 * hand, the others' slide in from the top); the last play is framed in its player's colour. When the
 * pile is taken, it slides toward the taker (into my hand: the cards arrive there by themselves), or
 * aside when everybody passed.
 */
function PileView({ view, pile, h }: { view: KdabView; pile: PileState; h: Helpers }) {
  const items = useLeaving(pile.cards, (c) => c.key);
  const last = view.last;
  const shownFrom = pile.cards.length - PILE_SHOWN;
  const taker = pile.exit.taker;
  const away = taker ? { x: 0, y: -90 } : { x: -70, y: 6 };
  return (
    <View style={{ width: PILE_W, height: PILE_H }}>
      {!pile.cards.length ? <View style={styles.emptyPile} /> : null}
      {items.map(({ item, key, leaving }, i) => {
        if (leaving && taker === h.me) return null; // into my hand
        if (!leaving && i < shownFrom) return null;
        const j = jitter(key);
        const ring = !leaving && last && item.play === last.id ? h.player(last.by).color : undefined;
        return (
          <CardMotion
            key={key}
            id={key}
            enter="play"
            from={item.by === h.me ? 'bottom' : 'top'}
            place={{ x: j.x, y: j.y, rot: j.rot }}
            leaving={leaving}
            leave={{ to: away, scale: 0.9 }}>
            <PlayingCard card={null} size="md" ring={ring} />
          </CardMotion>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyPile: { position: 'absolute', left: 15, top: 8, width: CARD_W, height: CARD_H, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  slot: { height: 78, justifyContent: 'center' },
  lastLine: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 3 },
  reveal: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, paddingVertical: 6, paddingHorizontal: 10, gap: 8 },
  rank: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 8, borderWidth: 2, borderColor: C.border },
  rankOn: { backgroundColor: C.yellow, borderColor: C.yellow },
  off: { opacity: 0.45 },
});
