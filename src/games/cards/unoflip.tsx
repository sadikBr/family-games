import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import type { RoomView, UnoView } from '@/shared/protocol';
import { UNO_COLOR_INFO, colorsOf, otherSide } from '@/shared/uno';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from '../common';
import { helpers, type Helpers } from '../helpers';
import { DOUBLE_TAP_MS, Felt, HandRows, TurnLine, cardsWord, tapClock } from './card-ui';
import { UnoCard } from './uno-card';

const FELT = { light: C.felt, dark: '#3A2466' } as const;

/** The other players: avatar, count and the other side of their cards (that's the twist of UNO FLIP). */
function Opponents({ view, h }: { view: UnoView; h: Helpers }) {
  const back = otherSide(view.side);
  const others = view.participants.filter((id) => id !== h.me);
  return (
    <View style={{ gap: 6 }}>
      {others.map((id) => {
        const p = h.player(id);
        const active = view.turn === id;
        const faces = view.backs[id] ?? [];
        return (
          <View
            key={id}
            accessibilityLabel={`${p.name}: ${cardsWord(faces.length)}${active ? ' — دوره الآن' : ''}`}
            style={[styles.opp, active && { borderColor: p.color, backgroundColor: alpha(p.color, 0.2) }]}>
            <Avatar player={p} size={30} />
            <View style={{ width: 66 }}>
              <Txt v="tiny" numberOfLines={1} style={{ fontSize: 13 }}>
                {p.name}
              </Txt>
              <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ fontSize: 11 }}>
                {cardsWord(faces.length)} · {num(view.scores[id] ?? 0)}
              </Txt>
            </View>
            <View style={styles.fan}>
              {faces.slice(0, 14).map((f, i) => (
                <View key={i} style={{ marginStart: i === 0 ? 0 : -13 }}>
                  <UnoCard face={f} side={back} width={26} />
                </View>
              ))}
            </View>
            {view.unoSaid.includes(id) ? (
              <View style={styles.unoTag}>
                <Txt v="tiny" color="#fff">
                  أونو
                </Txt>
              </View>
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
  const [sel, setSel] = useState<string | null>(null);
  const [selAt, setSelAt] = useState(0);
  if (!view.participants.includes(h.me)) return <Spectator room={room} />;

  const myTurn = view.phase === 'play' && view.turn === h.me && !view.choosing;
  const selected = view.myHand.find((c) => c.id === sel && view.playable.includes(c.id)) ?? null;
  const canDraw = myTurn && !view.drawn;
  const showUno = view.phase === 'play' && !view.unoSaid.includes(h.me) && (view.myHand.length === 1 || (myTurn && view.myHand.length === 2 && view.playable.length > 0));
  const canCatch = view.phase === 'play' && view.catchable && view.catchable !== h.me;
  const play = (id: string) => {
    h.act('play', { card: id });
    setSel(null);
  };
  const tap = (id: string) => {
    const now = tapClock();
    if (sel !== id) {
      setSel(id);
      setSelAt(now);
    } else if (now - selAt >= DOUBLE_TAP_MS) play(id);
  };

  if (view.phase === 'roundEnd' || view.phase === 'final') {
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
          title={winner ? (final ? `فاز ${h.player(winner).name}` : `الجولة لـ${h.player(winner).name}`) : 'انتهت اللعبة'}
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

  const felt = FELT[view.side];
  // who played the card on top of the pile (it stays marked until the next card is played)
  const lastBy = view.lastPlay ? h.player(view.lastPlay.by) : null;
  let turnText = 'العب ورقة أو اسحب';
  if (view.drawn) turnText = 'سحبت ورقة تناسب — العبها أو مرّر';
  else if (!view.playable.length) turnText = 'لا توجد ورقة مناسبة — اسحب';

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
            {view.deckTop ? <UnoCard face={view.deckTop} side={otherSide(view.side)} width={70} /> : <View style={{ width: 70, height: 105 }} />}
            <Txt v="tiny" center color="rgba(255,255,255,0.85)">
              اسحب ({view.deckLeft})
            </Txt>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Animated.View key={`${view.top.kind}${view.top.color}${view.top.n}${view.lastPlay?.by}`} entering={FadeIn.duration(160)}>
              <UnoCard face={view.top} side={view.side} width={88} />
              {lastBy ? (
                <View style={styles.playedBy} pointerEvents="none">
                  <Avatar player={lastBy} size={24} ring={lastBy.color} />
                </View>
              ) : null}
            </Animated.View>
            {lastBy ? (
              <Txt v="tiny" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ maxWidth: 110 }}>
                من {lastBy.id === h.me ? 'عندك' : lastBy.name}
              </Txt>
            ) : null}
            <View style={[styles.colorPill, { backgroundColor: UNO_COLOR_INFO[view.color].hex }]}>
              <Txt v="tiny" color="#fff">
                اللون: {UNO_COLOR_INFO[view.color].name}
              </Txt>
            </View>
          </View>
        </Row>
      </Felt>

      {canCatch ? <Btn size="md" icon="siren" color={C.red} label={`امسك ${h.player(view.catchable!).name}! — بلا «أونو»`} onPress={() => h.act('catch')} /> : null}

      {view.choosing && view.choosing !== h.me ? (
        <Txt v="bold" center color={C.muted}>
          اختيار اللون: {h.player(view.choosing).name}…
        </Txt>
      ) : (
        <TurnLine myTurn={myTurn} text={turnText} />
      )}

      {/* my hand */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand}>
        {view.myHand.map((c, i) => {
          const ok = view.playable.includes(c.id);
          return (
            <View key={c.id} style={{ marginStart: i === 0 ? 0 : -14, zIndex: c.id === sel ? 50 : i }}>
              <UnoCard
                face={c.face}
                side={view.side}
                width={66}
                selected={c.id === sel}
                dim={myTurn && !ok}
                onPress={myTurn && ok ? () => tap(c.id) : undefined}
              />
            </View>
          );
        })}
      </ScrollView>

      <Row gap={10}>
        {myTurn && selected ? <Btn flex size="lg" icon="down" label="العب الورقة" onPress={() => play(selected.id)} /> : null}
        {canDraw && !selected ? <Btn flex size="lg" icon="layers" label="اسحب ورقة" ghost onPress={() => h.act('draw')} /> : null}
        {view.canPass && !selected ? <Btn flex size="lg" icon="skip" label="مرّر" ghost onPress={() => h.act('pass')} /> : null}
        {showUno ? (
          <Pressable onPress={() => h.act('uno')} style={({ pressed }) => [styles.unoBtn, pressed && { transform: [{ translateY: 2 }] }]} accessibilityLabel="أونو">
            <Txt style={styles.unoText}>أونو!</Txt>
          </Pressable>
        ) : null}
      </Row>
      <Txt v="tiny" center color={C.dim}>
        الجولة {num(view.round)} · نقاطك {num(view.scores[h.me] ?? 0)} من {num(view.target)}
      </Txt>

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
  playedBy: { position: 'absolute', top: -10, right: -10 },
  colorPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 1, borderWidth: 2, borderColor: '#151726' },
  hand: { paddingTop: 18, paddingBottom: 4, paddingHorizontal: 4 },
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
