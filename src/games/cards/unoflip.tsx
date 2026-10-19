import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import type { RoomView, UnoView } from '@/shared/protocol';
import { UNO_COLOR_INFO, colorsOf, otherSide } from '@/shared/uno';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers, type Helpers } from '../helpers';
import { Felt, HandRows, TurnLine, cardsWord, useTapToPlay } from './card-ui';
import { CardMotion, CardStage, EASE, MOTION, SoftNumber, TurnHalo, useCardStage } from './motion';
import { FromStock, STOCK_ID, tiltOf, useArrivals, usePile } from './pile';
import { UnoCard, unoKey } from './uno-card';

const FELT = { light: C.felt, dark: '#3A2466' } as const;

/**
 * The other players: avatar, count and the other side of their cards (that's the twist of UNO FLIP).
 * The first card of each fan is where that player's cards fly from onto the pile (`seat:<id>`).
 */
function Opponents({ view, h }: { view: UnoView; h: Helpers }) {
  const back = otherSide(view.side);
  const others = view.participants.filter((id) => id !== h.me);
  return (
    <View style={{ gap: 6 }}>
      {others.map((id) => {
        const p = h.player(id);
        const active = view.turn === id && view.phase === 'play';
        const faces = view.backs[id] ?? [];
        return (
          <View
            key={id}
            accessibilityLabel={`${p.name}: ${cardsWord(faces.length)}${active ? ' — الدور الآن' : ''}`}
            style={[styles.opp, active && { borderColor: p.color, backgroundColor: alpha(p.color, 0.2) }]}>
            <View>
              <TurnHalo active={active} size={30} color={p.color} />
              <Avatar player={p} size={30} />
            </View>
            <View style={{ width: 66 }}>
              <Txt v="tiny" numberOfLines={1} style={{ fontSize: 13 }}>
                {p.name}
              </Txt>
              <Row gap={3}>
                <SoftNumber
                  value={faces.length}
                  render={(k) => (
                    <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ fontSize: 11 }}>
                      {cardsWord(k)}
                    </Txt>
                  )}
                />
                <Txt v="tiny" color={C.dim} style={{ fontSize: 11 }}>
                  ·
                </Txt>
                <SoftNumber
                  value={view.scores[id] ?? 0}
                  render={(k) => (
                    <Txt v="tiny" color={C.muted} style={{ fontSize: 11 }}>
                      {num(k)}
                    </Txt>
                  )}
                />
              </Row>
            </View>
            <View style={styles.fan}>
              {faces.slice(0, 14).map((f, i) => (
                <CardMotion key={i} id={i === 0 ? `seat:${id}` : `opp:${id}:${i}`} enter="deal" from="bottom" style={{ marginStart: i === 0 ? 0 : -13 }}>
                  <UnoCard face={f} side={back} width={26} />
                </CardMotion>
              ))}
            </View>
            {view.unoSaid.includes(id) ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.unoTag}>
                <Txt v="tiny" color="#fff">
                  أونو
                </Txt>
              </Animated.View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ColorPicker({ view, onPick }: { view: UnoView; onPick: (c: string) => void }) {
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <Animated.View entering={FadeIn.duration(160)} style={styles.picker}>
          <Txt v="title" center>
            اختر لوناً
          </Txt>
          <View style={styles.colorGrid}>
            {colorsOf(view.side).map((c) => (
              <Pressable key={c} onPress={() => onPick(c)} style={({ pressed }) => [styles.colorBtn, { backgroundColor: UNO_COLOR_INFO[c].hex }, pressed && { opacity: 0.8 }]}>
                <Txt v="h3" color="#fff">
                  {UNO_COLOR_INFO[c].name}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function UnoFlipGame({ room, view }: { room: RoomView; view: UnoView }) {
  const h = helpers(room);
  const myTurn = view.phase === 'play' && view.turn === h.me && !view.choosing;
  // tap a card to select it, tap it again to play it (a Wild then asks for the colour)
  const tap = useTapToPlay({ canPlay: (id) => myTurn && view.playable.includes(id), onPlay: (id) => h.act('play', { card: id }) });
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;
  // one stage for every phase: it stays mounted from round to round, so the next deal glides in
  return (
    <CardStage>
      {view.phase === 'roundEnd' || view.phase === 'final' ? <RoundEnd room={room} view={view} h={h} /> : <Table room={room} view={view} h={h} tap={tap} myTurn={myTurn} />}
    </CardStage>
  );
}

function RoundEnd({ room, view, h }: { room: RoomView; view: UnoView; h: Helpers }) {
  const rs = view.roundSummary;
  const final = view.phase === 'final';
  const winner = final ? view.winner : rs?.winner;
  const won = winner === h.me;
  const board = (
    <View style={{ gap: 6 }}>
      <Txt v="small" center color={C.muted}>
        النقاط — الهدف {num(view.target)}
      </Txt>
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
    </View>
  );
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<GameArt id="unoflip" size={84} />}
        title={winner ? (final ? `الفوز ${li(h.player(winner).name)}` : `الجولة ${li(h.player(winner).name)}`) : 'انتهت اللعبة'}
        sub={rs ? `${num(`+${rs.points}`)} نقطة` : undefined}
      />
      {final ? <Podium players={view.participants.map((id) => h.player(id))} scores={view.scores} /> : null}
      {final ? board : null}
      {rs ? (
        <HandRows
          title="الأوراق الباقية في الجولة"
          rows={rs.hands.map((r) => ({
            key: r.id,
            players: [h.player(r.id)],
            name: h.player(r.id).name,
            points: num(r.points),
            tone: 'plain',
            extra: r.faces.length ? (
              <Row wrap gap={3}>
                {r.faces.map((f, i) => (
                  <UnoCard key={i} face={f} side={view.side} width={26} />
                ))}
              </Row>
            ) : undefined,
          }))}
        />
      ) : null}
      {final ? null : board}
      {final ? (
        <PlayAgain room={room} />
      ) : h.isHost ? (
        <Btn size="xl" icon="cards" label="الجولة التالية" onPress={() => h.act('next')} />
      ) : (
        <HostNote>المضيف يوزّع الجولة التالية</HostNote>
      )}
    </>
  );
}

const TOP_W = 88;
const HAND_W = 66;

/**
 * How far each card of my hand overlaps the previous one: just enough for the whole hand to fit the
 * screen (every card keeps at least its corner index visible); a very long hand scrolls.
 */
function handOverlap(n: number, room: number): number {
  if (n < 2) return 0;
  const step = Math.max(26, Math.min(HAND_W - 14, (room - HAND_W) / (n - 1)));
  return Math.round(HAND_W - step);
}

function Table({ room, view, h, tap, myTurn }: { room: RoomView; view: UnoView; h: Helpers; tap: ReturnType<typeof useTapToPlay>; myTurn: boolean }) {
  const stage = useCardStage();
  const overlap = handOverlap(view.myHand.length, useContentWidth() - 20);
  const selected = view.myHand.find((c) => c.id === tap.selected) ?? null;
  const canDraw = myTurn && !view.drawn;
  const showUno = view.phase === 'play' && !view.unoSaid.includes(h.me) && (view.myHand.length === 1 || (myTurn && view.myHand.length === 2 && view.playable.length > 0));
  const canCatch = view.phase === 'play' && view.catchable && view.catchable !== h.me;
  // a single card drawn glides from the draw pile; several at once (a «+2»…) are dealt in turn
  const added = useArrivals(view.myHand.map((c) => c.id));
  const fromStock = added.length === 1 ? added[0] : null;
  // the pile: the card under the top one stays visible while the next card glides onto it
  const topCard = { id: view.topId ?? `face:${unoKey(view.side, view.top)}`, face: view.top, side: view.side };
  const { under } = usePile(topCard, (c) => c.id, view.lastPlay ? 'cover' : 'reset');

  const felt = FELT[view.side];
  // who played the card on top of the pile (it stays marked until the next card is played)
  const lastBy = view.lastPlay ? h.player(view.lastPlay.by) : null;
  // my card flies from my hand; another player's from the first card of their fan
  const topMotionId = !lastBy || lastBy.id === h.me ? topCard.id : `seat:${lastBy.id}`;
  // while it is not my turn the line is hidden and keeps the plain instruction (it never flashes another text as it fades)
  let turnText = 'اختر ورقة واضغطها مرة ثانية للعب';
  if (myTurn && view.drawn) turnText = 'سحبت ورقة تناسب — العبها أو مرّر';
  else if (myTurn && !view.playable.length) turnText = 'لا توجد ورقة مناسبة — اسحب';
  const handLayout = stage?.reduced ? undefined : LinearTransition.duration(MOTION.glide).easing(EASE);

  return (
    <>
      <Opponents view={view} h={h} />

      {/* table */}
      <Felt active={myTurn} minHeight={0} bg={felt}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={[styles.sideTag, { backgroundColor: view.side === 'light' ? '#FFF4DA' : '#1B1B2B' }]}>
            <Icon name={view.side === 'light' ? 'sun' : 'moon'} size={14} color={view.side === 'light' ? C.ink : '#FFF4DA'} />
            <Txt v="tiny" color={view.side === 'light' ? C.ink : '#FFF4DA'}>
              {view.side === 'light' ? 'الجهة المضيئة' : 'الجهة المظلمة'}
            </Txt>
          </View>
          <View style={[styles.sideTag, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <View style={{ transform: [{ scaleX: view.dir === 1 ? 1 : -1 }] }}>
              <Icon name="refresh" size={14} color="#fff" />
            </View>
            <Txt v="tiny" color="#fff">
              {view.dir === 1 ? 'الاتجاه عادي' : 'الاتجاه معكوس'}
            </Txt>
          </View>
        </Row>
        <Row center gap={22}>
          <Pressable disabled={!canDraw} onPress={() => h.act('draw')} style={[styles.pile, canDraw && styles.pileActive]} accessibilityLabel="اسحب ورقة">
            <CardMotion id={STOCK_ID}>
              {view.deckTop ? <UnoCard face={view.deckTop} side={otherSide(view.side)} width={70} /> : <View style={{ width: 70, height: 105 }} />}
            </CardMotion>
            <Txt v="tiny" center color="rgba(255,255,255,0.85)">
              اسحب ({view.deckLeft})
            </Txt>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={styles.discard}>
              {/* the previous top card keeps its element (no image reload, no blink) and simply lies under the new one */}
              {[...(under && under.side === view.side && under.id !== topCard.id ? [under] : []), topCard].map((c) => {
                const isTop = c === topCard;
                return (
                  <CardMotion
                    key={c.id}
                    id={isTop ? topMotionId : `under:${c.id}`}
                    enter={isTop && lastBy ? 'play' : 'none'}
                    from="top"
                    source={false}
                    place={{ x: 6, y: 6, rot: tiltOf(c.id) }}>
                    <UnoCard face={c.face} side={view.side} width={TOP_W} />
                  </CardMotion>
                );
              })}
              {lastBy ? (
                <Animated.View key={`by-${topCard.id}`} entering={FadeIn.duration(220).delay(MOTION.fly - 60)} style={styles.playedBy} pointerEvents="none">
                  <Avatar player={lastBy} size={24} ring={lastBy.color} />
                </Animated.View>
              ) : null}
            </View>
            <View style={{ minHeight: 18 }}>
              {lastBy ? (
                <Txt v="tiny" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ maxWidth: 110 }}>
                  من {lastBy.id === h.me ? 'عندك' : lastBy.name}
                </Txt>
              ) : null}
            </View>
            <View style={[styles.colorPill, { backgroundColor: UNO_COLOR_INFO[view.color].hex }]}>
              <Txt v="tiny" color="#fff">
                اللون: {UNO_COLOR_INFO[view.color].name}
              </Txt>
            </View>
          </View>
        </Row>
      </Felt>

      {/* one line that keeps its place: the hand under it never jumps */}
      {view.choosing && view.choosing !== h.me ? (
        <Txt v="bold" center color={C.muted} numberOfLines={1}>
          اختيار اللون: {h.player(view.choosing).name}…
        </Txt>
      ) : (
        <TurnLine myTurn={myTurn} text={turnText} keep />
      )}

      {/* my hand */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand}>
        {view.myHand.map((c, i) => {
          const ok = view.playable.includes(c.id);
          const fresh = c.id === fromStock;
          return (
            // the selected card comes to the front, so the second tap lands on it and not on a neighbour
            <Animated.View key={c.id} layout={handLayout} style={{ marginStart: i === 0 ? 0 : -overlap, zIndex: c.id === selected?.id ? 50 : i }}>
              <CardMotion id={c.id} enter={fresh ? 'none' : 'deal'} from="top">
                <FromStock id={c.id} fromStock={fresh}>
                  <UnoCard
                    face={c.face}
                    side={view.side}
                    width={HAND_W}
                    selected={c.id === selected?.id}
                    dim={myTurn && !ok}
                    onPress={myTurn && ok ? () => tap.tap(c.id) : undefined}
                  />
                </FromStock>
              </CardMotion>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* the buttons keep their place for the whole round: nothing jumps when a card is selected */}
      <Row gap={10} style={{ minHeight: 56 }}>
        {myTurn && selected ? <Btn flex size="lg" icon="down" label="العب الورقة" onPress={tap.play} /> : null}
        {canDraw && !selected ? <Btn flex size="lg" icon="layers" label="اسحب ورقة" ghost onPress={() => h.act('draw')} /> : null}
        {view.canPass && !selected ? <Btn flex size="lg" icon="skip" label="مرّر" ghost onPress={() => h.act('pass')} /> : null}
        {showUno ? (
          <Pressable onPress={() => h.act('uno')} style={({ pressed }) => [styles.unoBtn, pressed && { transform: [{ translateY: 2 }] }]} accessibilityLabel="أونو">
            <Txt style={styles.unoText}>أونو!</Txt>
          </Pressable>
        ) : null}
      </Row>
      {canCatch ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <Btn size="md" icon="siren" color={C.red} label={`امسك ${h.player(view.catchable!).name}! — بلا «أونو»`} onPress={() => h.act('catch')} />
        </Animated.View>
      ) : null}
      <Row gap={4} center>
        <Txt v="tiny" color={C.dim}>
          الجولة {num(view.round)} · نقاطك
        </Txt>
        <SoftNumber
          value={view.scores[h.me] ?? 0}
          render={(k) => (
            <Txt v="tiny" color={C.dim}>
              {num(k)}
            </Txt>
          )}
        />
        <Txt v="tiny" color={C.dim}>
          من {num(view.target)}
        </Txt>
      </Row>

      {view.choosing === h.me ? <ColorPicker view={view} onPick={(c) => h.act('color', { color: c })} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  opp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  fan: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  unoTag: { backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 8 },
  sideTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  pile: { alignItems: 'center', gap: 4, padding: 5, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileActive: { borderColor: C.yellow },
  discard: { width: TOP_W + 12, height: TOP_W * 1.5 + 12 },
  playedBy: { position: 'absolute', top: -6, right: -6 },
  colorPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 1, borderWidth: 2, borderColor: '#151726' },
  hand: { flexGrow: 1, justifyContent: 'center', paddingTop: 18, paddingBottom: 4, paddingHorizontal: 4 },
  unoBtn: {
    backgroundColor: C.red,
    borderRadius: 999,
    paddingHorizontal: 22,
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#151726',
    borderBottomWidth: 6,
  },
  unoText: { fontFamily: F.display, fontSize: 24, lineHeight: 40, color: '#FFF4DA' },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24, direction: 'rtl' },
  picker: { backgroundColor: C.bg2, borderRadius: 24, padding: 20, gap: 14, width: '100%', maxWidth: 360 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  colorBtn: { flexBasis: '40%', flexGrow: 1, height: 74, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#151726', borderBottomWidth: 6 },
});
