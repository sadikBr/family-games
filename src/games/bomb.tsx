/**
 * «القنبلة» — the screen. From the top: the players as a strip (cards in hand, who is out; the player whose turn it
 * is framed); whose turn it is, with the turns left after an attack («دوران متبقيان») and the turn's clock; the table
 * (the deck as a back with its count and the bombs in it, tap it to draw on my turn; the discard pile with the
 * last card played); the moment's panel: the «لا!» window (the action, the «لا!» played on it, the same countdown
 * for everyone, and my «لا!» button if I hold one), «طلب» (the asked player chooses a card), the bomb (a short shake
 * and flash with the bomb card), the defuse and the secret place picker; what I know of the top of the deck; my
 * hand as a fan (tap a card: it rises and its full effect and button appear under the hand; a long hand scrolls);
 * a private line (the card I was given or that was stolen from me); the last events; the cards reference; the end
 * with the places.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  BOMB_KINDS,
  BOMB_TURN_SECONDS,
  BOMB_WINDOW_SECONDS,
  CARD_INFO,
  deckAfterDeal,
  isActionKind,
  isPairKind,
  turnsLeftText,
  type BombCard,
  type BombKind,
  type BombPlace,
  type BombSettings as Settings,
  type BombView,
} from '@/shared/games/bomb';
import { li } from '@/shared/li';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { BombCardBack, BombCardFace, CREAM, HandCard, INDIGO, MiniCard, SPARK } from './bomb-art';
import { cardsWord } from './cards/card-ui';
import { CardMotion, CardStage } from './cards/motion';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { useScreenClock } from './touch-motion';

const RED = '#E2543B';
const TABLE = '#3A1F2E';

/** The usable width (a phone's column; the stage on a computer). */
function useInner() {
  return Math.min(useContentWidth(), dk(560));
}

/** «قنبلة واحدة»، «قنبلتان»، «3 قنابل» */
function bombsText(n: number) {
  if (n === 0) return 'لا قنابل';
  if (n === 1) return 'قنبلة واحدة';
  if (n === 2) return 'قنبلتان';
  return n <= 10 ? `${num(n)} قنابل` : `${num(n)} قنبلة`;
}

const ORDER = new Map(BOMB_KINDS.map((k, i) => [k, i]));
const sortHand = (hand: BombCard[]) => [...hand].sort((a, b) => ORDER.get(a.kind)! - ORDER.get(b.kind)! || (a.id < b.id ? -1 : 1));

/** May I play «لا!» now? (Same rule as the server: never on my own action with nothing on it, nor on my own «لا!».) */
function canNope(view: BombView, me: string) {
  const p = view.pending;
  if (view.phase !== 'window' || !p || view.seats[me]?.out) return false;
  if (!view.hand.some((c) => c.kind === 'nope')) return false;
  const last = p.nopes.length ? p.nopes[p.nopes.length - 1] : p.by;
  return last !== me;
}

export function BombGame({ room, view }: { room: RoomView; view: BombView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <BombFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return (
    <CardStage>
      <BombTable room={room} view={view} h={h} />
    </CardStage>
  );
}

function BombTable({ room, view, h }: { room: RoomView; view: BombView; h: Helpers }) {
  const [sel, setSel] = useState<string | null>(null);
  // a card waiting for its target («طلب», a pair), only for the step it was chosen on
  const [aim, setAim] = useState<{ cards: string[]; kind: BombKind; seq: number } | null>(null);
  const hand = sortHand(view.hand);
  const selected = hand.find((c) => c.id === sel) ?? null;
  const myTurn = view.phase === 'turn' && view.turn === h.me;
  const out = !!view.seats[h.me]?.out;
  const giving = view.phase === 'give' && view.give?.from === h.me;
  const aiming = aim && aim.seq === view.seq && myTurn ? aim : null;

  const tap = (c: BombCard) => {
    haptic.tap();
    setSel((s) => (s === c.id ? null : c.id));
  };
  const play = (cards: string[], target?: string) => {
    haptic.medium();
    setSel(null);
    setAim(null);
    h.act('play', { seq: view.seq, cards, ...(target ? { target } : {}) });
  };
  const draw = () => {
    haptic.medium();
    setSel(null);
    setAim(null);
    h.act('draw', { seq: view.seq });
  };

  return (
    <>
      <PlayerStrip
        room={room}
        entries={view.players.map((id) => ({ id, out: view.seats[id].out, sub: view.seats[id].out ? 'خارج اللعبة' : cardsWord(view.seats[id].cards) }))}
        active={view.turn ? [view.turn] : []}
        gains={false}
      />
      <TableFelt view={view} h={h} onDraw={myTurn ? draw : undefined} />
      <MomentPanel view={view} h={h} />
      <KnownTop view={view} />
      {out ? (
        <View style={styles.panel}>
          <Txt v="bold" center color={C.muted}>
            خارج اللعبة: تابع حتى النهاية
          </Txt>
        </View>
      ) : (
        <>
          <HandFan hand={hand} selected={selected?.id ?? null} onTap={tap} dimOthers={giving ? null : myTurn ? playableIds(hand) : null} />
          {aiming ? (
            <TargetPicker view={view} h={h} kind={aiming.kind} onPick={(t) => play(aiming.cards, t)} onCancel={() => setAim(null)} />
          ) : (
            <CardActions
              view={view}
              h={h}
              hand={hand}
              selected={selected}
              myTurn={myTurn}
              giving={giving}
              onPlay={(cards, kind) => (kind === 'favor' || isPairKind(kind) ? setAim({ cards, kind, seq: view.seq }) : play(cards))}
              onGive={(id) => {
                haptic.medium();
                setSel(null);
                h.act('give', { seq: view.seq, card: id });
              }}
              onDraw={draw}
            />
          )}
        </>
      )}
      <PrivateNote view={view} />
      <LogLines view={view} h={h} />
      <CardsRef view={view} />
    </>
  );
}

/** Cards that can be played on my turn (action cards, characters with a twin). */
function playableIds(hand: BombCard[]): string[] {
  const count = (k: BombKind) => hand.filter((c) => c.kind === k).length;
  return hand.filter((c) => isActionKind(c.kind) || (isPairKind(c.kind) && count(c.kind) >= 2)).map((c) => c.id);
}

/* ------------------------------------------------------------------ */
/* Whose turn                                                           */
/* ------------------------------------------------------------------ */

function TurnBanner({ view, h }: { view: BombView; h: Helpers }) {
  if (!view.turn) return null;
  const mine = view.turn === h.me;
  const p = h.player(view.turn);
  return (
    <View style={{ gap: 4 }}>
      <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Avatar player={p} size={26} ring={mine ? SPARK : p.color} />
        <Txt v="bold" style={{ color: mine ? SPARK : CREAM, fontSize: 17 }}>
          {mine ? 'دورك' : `دور ${p.name}`}
        </Txt>
        {view.turns > 1 ? (
          <View style={styles.turnsChip} accessibilityLabel={turnsLeftText(view.turns)}>
            <Icon name="bolt" size={14} color="#FFFFFF" />
            <Txt v="tiny" color="#FFFFFF" style={{ fontFamily: F.bold }}>
              {turnsLeftText(view.turns)}
            </Txt>
          </View>
        ) : null}
      </Row>
      {view.phase === 'turn' && mine ? (
        <Txt v="tiny" center color={alpha(CREAM, 0.75)}>
          العب ما تشاء من الأوراق، ثم اسحب ورقة لإنهاء الدور
        </Txt>
      ) : null}
      {view.phase === 'turn' && view.turnEndsAt && !p.bot ? <TimerBar key={`t${view.seq}`} endsAt={view.turnEndsAt} total={view.turnTotal} onTick={mine} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The table: the deck and the discard pile                            */
/* ------------------------------------------------------------------ */

function TableFelt({ view, h, onDraw }: { view: BombView; h: Helpers; onDraw?: () => void }) {
  const inner = useInner();
  const cw = Math.min(dk(72), Math.round((inner - 80) / 2.6));
  const top = view.discard[view.discard.length - 1] ?? null;
  const under = view.discard.length > 1 ? view.discard[view.discard.length - 2] : null;
  const boom = view.phase === 'boom' ? view.boom : null;
  return (
    <Shaker on={boom ? view.seq : null}>
      <View style={styles.felt}>
        {boom ? <Flash key={view.seq} /> : null}
        <TurnBanner view={view} h={h} />
        <Row gap={18} style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
          <Pressable disabled={!onDraw} onPress={onDraw} accessibilityRole="button" accessibilityLabel={`الرزمة: ${cardsWord(view.deck)}${onDraw ? '، اضغط للسحب' : ''}`} style={[styles.pile, onDraw && styles.pileOn]}>
            <View>
              {view.deck > 1 ? (
                <View style={{ position: 'absolute', top: 3, left: 3 }}>
                  <BombCardBack w={cw} />
                </View>
              ) : null}
              {view.deck > 0 ? <BombCardBack w={cw} /> : <View style={{ width: cw, height: Math.round(cw * 1.4) }} />}
            </View>
            <Txt v="bold" center color={CREAM} style={{ fontSize: 14 }}>
              {onDraw ? `اسحب (${num(view.deck)})` : `الرزمة: ${num(view.deck)}`}
            </Txt>
            <View style={styles.bombPill}>
              <Txt v="tiny" color="#FFFFFF" style={{ fontFamily: F.bold }}>
                فيها {bombsText(view.bombs)}
              </Txt>
            </View>
          </Pressable>
          <View style={[styles.pile, { alignItems: 'center' }]}>
            <View style={{ width: cw + 6, height: Math.round(cw * 1.4) + 6 }}>
              {under ? (
                <View style={{ position: 'absolute', top: 6, left: 6, transform: [{ rotate: '-5deg' }], opacity: 0.75 }}>
                  <BombCardFace kind={under.kind} w={cw} bare />
                </View>
              ) : null}
              {top ? (
                <CardMotion key={top.id} id={top.id} enter="play" from="top" source={false} style={{ position: 'absolute', top: 0, left: 0 }}>
                  <BombCardFace kind={top.kind} w={cw} bare={cw < 70} />
                </CardMotion>
              ) : (
                <View style={[styles.emptyPile, { width: cw, height: Math.round(cw * 1.4) }]}>
                  <Txt v="tiny" color={alpha(CREAM, 0.6)} center>
                    المرمى
                  </Txt>
                </View>
              )}
            </View>
            <Txt v="tiny" center color={alpha(CREAM, 0.75)}>
              المرمى: {num(view.discardCount)}
            </Txt>
          </View>
        </Row>
        {!view.nopeLive ? (
          <Txt v="tiny" center color={alpha(CREAM, 0.7)}>
            كل أوراق «لا!» في المرمى: لا مهلة بعد الآن
          </Txt>
        ) : null}
        {boom ? <BoomLine view={view} h={h} /> : null}
      </View>
    </Shaker>
  );
}

/** A gentle shake of the table when a bomb is drawn (nothing with reduced motion). */
function Shaker({ on, children }: { on: number | null; children: ReactNode }) {
  const x = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (on === null || reduced) return;
    x.set(withSequence(withTiming(-7, { duration: 50 }), withRepeat(withSequence(withTiming(7, { duration: 90 }), withTiming(-7, { duration: 90 })), 3), withTiming(0, { duration: 60 })));
  }, [on, reduced, x]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** Two soft red flashes over the table. */
function Flash() {
  const o = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    o.set(reduced ? withSequence(withTiming(0.35, { duration: 200 }), withTiming(0, { duration: 500 })) : withSequence(withTiming(0.55, { duration: 110 }), withTiming(0.05, { duration: 260 }), withTiming(0.4, { duration: 110 }), withTiming(0, { duration: 520 })));
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FF4D3A', borderRadius: 22 }, st]} />;
}

function BoomLine({ view, h }: { view: BombView; h: Helpers }) {
  const b = view.boom!;
  const mine = b.who === h.me;
  const hasDefuse = view.hand.some((c) => c.kind === 'defuse');
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.boom}>
      <Wobble>
        <BombCardFace kind="bomb" w={dk(84)} />
      </Wobble>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt v="h2" style={{ color: '#FFFFFF' }}>
          {mine ? 'قنبلة عندك!' : `قنبلة عند ${h.player(b.who).name}!`}
        </Txt>
        <Txt v="small" color={alpha(CREAM, 0.9)}>
          {mine ? (hasDefuse ? 'معك مفكّك: نجاة بعد لحظة…' : 'لا مفكّك معك…') : 'والمفكّك؟ لحظة…'}
        </Txt>
      </View>
    </Animated.View>
  );
}

/** The bomb card rocks a little. */
function Wobble({ children }: { children: ReactNode }) {
  const r = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) r.set(withRepeat(withSequence(withTiming(-5, { duration: 160 }), withTiming(5, { duration: 160 })), 4, true));
  }, [r, reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ */
/* The moment: the «لا!» window, «طلب», the defuse                     */
/* ------------------------------------------------------------------ */

function MomentPanel({ view, h }: { view: BombView; h: Helpers }) {
  if (view.phase === 'window' && view.pending) return <WindowPanel key={`w${view.seq}`} view={view} h={h} />;
  if (view.phase === 'give' && view.give) {
    const g = view.give;
    const mine = g.from === h.me;
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.moment, mine && { borderColor: SPARK }]}>
        <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
          <MiniCard kind="favor" w={dk(30)} />
          <Txt v="bold" center style={{ color: mine ? SPARK : C.text, flexShrink: 1 }}>
            {mine ? `طلب من ${h.player(g.to).name}: اختر ورقة من يدك تعطيها` : `طلب ورقة: من ${h.player(g.from).name} إلى ${g.to === h.me ? 'أنت' : h.player(g.to).name}…`}
          </Txt>
        </Row>
        <TimerBar key={`g${view.seq}`} endsAt={g.endsAt} total={g.total} onTick={mine} />
      </Animated.View>
    );
  }
  if (view.phase === 'place' && view.place) {
    if (view.place.who === h.me) return <PlacePicker key={`p${view.seq}`} view={view} h={h} />;
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.moment}>
        <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
          <MiniCard kind="defuse" w={dk(30)} />
          <Txt v="bold" center style={{ flexShrink: 1 }}>
            المفكّك من {h.player(view.place.who).name}: إعادة القنبلة إلى الرزمة سرّاً…
          </Txt>
        </Row>
        <TimerBar key={`p${view.seq}`} endsAt={view.place.endsAt} total={view.place.total} />
      </Animated.View>
    );
  }
  return null;
}

function WindowPanel({ view, h }: { view: BombView; h: Helpers }) {
  const p = view.pending!;
  const info = CARD_INFO[p.card];
  const by = h.player(p.by);
  const stands = p.nopes.length % 2 === 0;
  const mayNope = canNope(view, h.me);
  const nm = (id: string) => (id === h.me ? 'أنت' : h.player(id).name);
  const what = p.kind === 'pair' ? `زوج «${info.name}»` : `«${info.name}»`;
  let aimLine: string | null = null;
  if (p.target) {
    if (p.kind === 'attack') aimLine = p.target === h.me ? 'هجوم عليك: دوران' : `هجوم على ${nm(p.target)}: دوران`;
    else if (p.kind === 'favor') aimLine = p.target === h.me ? 'طلب ورقة منك' : `طلب ورقة من ${nm(p.target)}`;
    else aimLine = p.target === h.me ? 'سرقة ورقة منك' : `سرقة ورقة من ${nm(p.target)}`;
  }
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[styles.moment, { borderColor: alpha(info.color, 0.9) }]}>
      <Row gap={10} style={{ alignItems: 'center' }}>
        <MiniCard kind={p.card} w={dk(40)} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar player={by} size={22} />
            <Txt v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {what} من {nm(p.by)}
            </Txt>
          </Row>
          <Txt v="tiny" color={C.muted}>
            {aimLine ?? info.effect}
          </Txt>
        </View>
      </Row>
      {p.nopes.length ? (
        <Row gap={6} wrap style={{ alignItems: 'center', justifyContent: 'center' }}>
          {p.nopes.map((id, i) => (
            <View key={`${id}${i}`} style={styles.nopeChip}>
              <Avatar player={h.player(id)} size={18} />
              <Txt v="tiny" color="#FFFFFF" style={{ fontFamily: F.bold }}>
                لا!
              </Txt>
            </View>
          ))}
        </Row>
      ) : null}
      <Txt v="small" center style={{ color: stands ? C.green : C.red, fontFamily: F.bold }}>
        {stands ? (p.nopes.length ? 'عودة الورقة: تنفيذ بعد المهلة' : 'تنفيذ بعد المهلة… إلا مع «لا!»') : 'إلغاء… إلا مع «لا!» أخرى'}
      </Txt>
      {/* no tick sound: a phone ticking would tell the table who can still answer */}
      <TimerBar key={`w${view.seq}`} endsAt={p.endsAt} total={p.total} />
      {mayNope ? (
        <Pressable
          onPress={() => {
            haptic.heavy();
            h.act('nope', { seq: view.seq });
          }}
          accessibilityRole="button"
          accessibilityLabel="العب «لا!»"
          style={({ pressed }) => [styles.nopeBtn, pressed && { transform: [{ translateY: 2 }] }]}>
          <Txt style={styles.nopeText}>لا!</Txt>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const QUICK: { key: Exclude<BombPlace, number>; label: string }[] = [
  { key: 'top', label: 'الأعلى' },
  { key: 'second', label: 'الثانية' },
  { key: 'third', label: 'الثالثة' },
  { key: 'bottom', label: 'الأسفل' },
  { key: 'random', label: 'عشوائي' },
];

/** The defused bomb goes back: a quick place, or an exact one with − / +. */
function PlacePicker({ view, h }: { view: BombView; h: Helpers }) {
  const deck = view.deck;
  const [choice, setChoice] = useState<BombPlace>('random');
  // positions 1 … deck + 1 (1 = on top)
  const exact = typeof choice === 'number' ? choice + 1 : choice === 'top' ? 1 : choice === 'second' ? Math.min(2, deck + 1) : choice === 'third' ? Math.min(3, deck + 1) : choice === 'bottom' ? deck + 1 : null;
  const step = (d: number) => {
    haptic.tap();
    const cur = exact ?? Math.ceil((deck + 1) / 2);
    setChoice(Math.max(0, Math.min(deck, cur - 1 + d)));
  };
  const where = exact === null ? 'موضع عشوائي' : exact === 1 ? 'في الأعلى: الورقة التالية' : exact === deck + 1 ? 'في الأسفل' : `الموضع ${num(exact)} من الأعلى`;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.moment, { borderColor: C.green }]}>
      <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <MiniCard kind="defuse" w={dk(32)} />
        <View style={{ flexShrink: 1 }}>
          <Txt v="h3" style={{ color: C.green }}>
            نجاة بالمفكّك!
          </Txt>
          <Txt v="tiny" color={C.muted}>
            أين تعود القنبلة في الرزمة؟ لا يرى ذلك غيرك.
          </Txt>
        </View>
      </Row>
      <Row wrap gap={6} style={{ justifyContent: 'center' }}>
        {QUICK.map((q) => {
          const on = choice === q.key;
          return (
            <Pressable
              key={q.key}
              onPress={() => {
                haptic.tap();
                setChoice(q.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.placeChip, on && styles.placeChipOn]}>
              <Txt v="bold" color={on ? C.ink : C.text} style={{ fontSize: 14 }}>
                {q.label}
              </Txt>
            </Pressable>
          );
        })}
      </Row>
      <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={() => step(-1)} accessibilityLabel="أقرب إلى الأعلى" style={styles.stepBtn}>
          <Icon name="minus" size={20} color={C.text} />
        </Pressable>
        <View style={{ minWidth: 120, alignItems: 'center' }}>
          <Txt v="bold" center>
            {where}
          </Txt>
          <Txt v="tiny" center color={C.dim}>
            {num(1)} = الأعلى · {num(deck + 1)} = الأسفل
          </Txt>
        </View>
        <Pressable onPress={() => step(1)} accessibilityLabel="أعمق" style={styles.stepBtn}>
          <Icon name="plus" size={20} color={C.text} />
        </Pressable>
      </Row>
      <TimerBar key={`p${view.seq}`} endsAt={view.place!.endsAt} total={view.place!.total} onTick />
      <Btn
        size="md"
        icon="check"
        color={C.green}
        label="أعِد القنبلة هنا"
        onPress={() => {
          haptic.medium();
          h.act('place', { seq: view.seq, at: choice });
        }}
      />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* What I know of the deck                                              */
/* ------------------------------------------------------------------ */

function KnownTop({ view }: { view: BombView }) {
  const k = view.known;
  if (!k.length) return null;
  const shown = k.slice(0, 3);
  const deepBomb = k.findIndex((x, i) => i >= 3 && x === 'bomb');
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.known}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Icon name="eye" size={18} color={CARD_INFO.peek.color} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          ما تعرفه عن أعلى الرزمة (لك وحدك)
        </Txt>
      </Row>
      <Row gap={8} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
        {shown.map((kind, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 2 }}>
            <MiniCard kind={kind} w={dk(34)} />
            <Txt v="tiny" color={C.dim} style={{ fontSize: 11 }}>
              {i === 0 ? 'التالية' : num(i + 1)}
            </Txt>
          </View>
        ))}
      </Row>
      {deepBomb >= 0 ? (
        <Txt v="tiny" center color={C.muted}>
          {deepBomb === view.deck - 1 ? 'القنبلة التي أعدتها: في الأسفل' : `القنبلة التي أعدتها: الموضع ${num(deepBomb + 1)} من الأعلى`}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* My hand                                                             */
/* ------------------------------------------------------------------ */

/**
 * My cards in one gentle fan: the first card on the right, each next one a little to the left and over it (the
 * name, at the top right, stays visible). The selected card rises and comes to the front. When the cards no
 * longer fit with a comfortable strip each, the fan scrolls sideways.
 */
function HandFan({ hand, selected, onTap, dimOthers }: { hand: BombCard[]; selected: string | null; onTap: (c: BombCard) => void; dimOthers: string[] | null }) {
  const inner = useInner();
  const scroller = useRef<ScrollView>(null);
  const n = hand.length;
  const cw = inner < 340 ? 76 : Math.min(dk(100), 86);
  const box = cw + 8;
  const ch = Math.round(cw * 1.4) + 8;
  const minStep = 34;
  // a little room on both sides for the tilted outer cards
  const fit = n > 1 ? (inner - 14 - box) / (n - 1) : 0;
  const step = n > 1 ? Math.max(minStep, Math.min(box + 6, fit)) : 0;
  const total = box + step * (n - 1);
  const scroll = total > inner - 14;
  // scrolling: room on both sides for the tilted end cards
  const width = scroll ? total + 24 : inner;
  const start = (width - total) / 2;
  const mid = (n - 1) / 2;
  const tilt = n > 6 ? 1.3 : 2.2;
  const curve = n > 6 ? 0.45 : 0.8;
  if (!n) {
    return (
      <View style={[styles.panel, { alignItems: 'center' }]}>
        <Txt v="small" color={C.dim}>
          لا أوراق في يدك
        </Txt>
      </View>
    );
  }
  const fan = (
    <View style={{ width, height: ch + 30, direction: 'ltr' }}>
      {hand.map((c, k) => {
        const off = k - mid;
        const on = c.id === selected;
        const info = CARD_INFO[c.kind];
        return (
          <CardMotion
            key={c.id}
            id={c.id}
            enter="deal"
            from="top"
            place={{ x: start + (n - 1 - k) * step, y: on ? 2 : 20 + off * off * curve, rot: on ? 0 : -off * tilt }}
            style={{ zIndex: on ? 50 : k + 1 }}>
            <HandCard kind={c.kind} w={cw} on={on} dim={!!dimOthers && !dimOthers.includes(c.id) && !on} onPress={() => onTap(c)} label={`${info.name}: ${info.effect}`} />
          </CardMotion>
        );
      })}
    </View>
  );
  if (!scroll) return fan;
  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })} style={{ direction: 'ltr' }}>
      {fan}
    </ScrollView>
  );
}

/** The selected card in full words, and what can be done with it now. */
function CardActions({
  view,
  h,
  hand,
  selected,
  myTurn,
  giving,
  onPlay,
  onGive,
  onDraw,
}: {
  view: BombView;
  h: Helpers;
  hand: BombCard[];
  selected: BombCard | null;
  myTurn: boolean;
  giving: boolean;
  onPlay: (cards: string[], kind: BombKind) => void;
  onGive: (id: string) => void;
  onDraw: () => void;
}) {
  const info = selected ? CARD_INFO[selected.kind] : null;
  let button: ReactNode = null;
  let hint: string | null = null;
  if (selected && info) {
    const k = selected.kind;
    if (giving) {
      button = <Btn flex size="md" icon="gift" color={CARD_INFO.favor.color} label={`أعطِ «${info.name}»`} onPress={() => onGive(selected.id)} />;
    } else if (k === 'nope') {
      if (canNope(view, h.me)) button = <Btn flex size="md" icon="hand" color={CARD_INFO.nope.color} label="العب «لا!»" onPress={() => h.act('nope', { seq: view.seq, card: selected.id })} />;
      else hint = 'تُلعب على ورقة حركة من أي لاعب، خلال مهلة «لا!»';
    } else if (k === 'defuse') {
      hint = 'يُستعمل وحده عند سحب القنبلة: احتفظ به!';
    } else if (isPairKind(k)) {
      const twin = hand.find((c) => c.kind === k && c.id !== selected.id);
      if (myTurn && twin) button = <Btn flex size="md" icon="grab" color={info.color} label="العب زوجاً: سرقة ورقة" onPress={() => onPlay([selected.id, twin.id], k)} />;
      else hint = twin ? 'زوج جاهز: العبه في دورك' : `تحتاج ورقة ثانية من «${info.name}» لتكوين زوج`;
    } else if (isActionKind(k)) {
      if (myTurn) button = <Btn flex size="md" icon="play" color={info.color} label={`العب «${info.name}»`} onPress={() => onPlay([selected.id], k)} />;
      else hint = 'تُلعب في دورك';
    }
  }
  return (
    <View style={{ gap: 8 }}>
      {selected && info ? (
        <Animated.View key={selected.id} entering={FadeIn.duration(160)} style={[styles.detail, { borderColor: alpha(info.color, 0.9) }]}>
          <Row gap={8} style={{ alignItems: 'center' }}>
            <View style={[styles.dot, { backgroundColor: info.color }]} />
            <Txt v="bold" style={{ color: C.text }}>
              {info.name}
            </Txt>
            <Txt v="small" color={C.muted} style={{ flex: 1 }}>
              {info.effect}
            </Txt>
          </Row>
          {hint ? (
            <Txt v="tiny" color={C.dim}>
              {hint}
            </Txt>
          ) : null}
        </Animated.View>
      ) : giving ? (
        <Txt v="small" center color={SPARK}>
          اضغط الورقة التي تعطيها
        </Txt>
      ) : myTurn ? (
        <Txt v="tiny" center color={C.dim}>
          اضغط ورقة لترى عملها
        </Txt>
      ) : null}
      <Row gap={8} style={{ minHeight: 46 }}>
        {button}
        {myTurn ? <Btn flex size="md" icon="layers" ghost={!!button} color={SPARK} label="اسحب ورقة وأنهِ الدور" onPress={onDraw} /> : null}
      </Row>
    </View>
  );
}

function TargetPicker({ view, h, kind, onPick, onCancel }: { view: BombView; h: Helpers; kind: BombKind; onPick: (id: string) => void; onCancel: () => void }) {
  const inner = useInner();
  const targets = view.players.filter((id) => id !== h.me && !view.seats[id].out && view.seats[id].cards > 0);
  const per = inner < 400 ? 2 : 3;
  const w = Math.floor((inner - 28 - 8 * (per - 1)) / per);
  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.panel}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <MiniCard kind={kind} w={dk(26)} />
        <Txt v="bold" style={{ flex: 1 }}>
          {kind === 'favor' ? '«طلب»: من يعطيك ورقة؟' : 'زوج: ممن تسرق ورقة عشوائية؟'}
        </Txt>
        <Btn size="sm" ghost icon="close" label="إلغاء" onPress={onCancel} />
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {targets.map((id) => (
          <Pressable
            key={id}
            onPress={() => onPick(id)}
            accessibilityRole="button"
            accessibilityLabel={h.player(id).name}
            style={({ pressed }) => [styles.target, { width: w, backgroundColor: pressed ? alpha(RED, 0.3) : C.surfaceStrong }]}>
            <Avatar player={h.player(id)} size={34} />
            <Txt v="bold" numberOfLines={1} style={{ fontSize: 14 }}>
              {h.player(id).name}
            </Txt>
            <Txt v="tiny" color={C.muted}>
              {cardsWord(view.seats[id].cards)}
            </Txt>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Private line, log, reference                                        */
/* ------------------------------------------------------------------ */

/** The newest private line, for a few seconds (a line already there when the screen opens is not shown). */
function PrivateNote({ view }: { view: BombView }) {
  const k = view.note?.k ?? 0;
  const [seen] = useState(k);
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    if (k <= seen) return;
    const t = setTimeout(() => setHidden(k), 6000);
    return () => clearTimeout(t);
  }, [k, seen]);
  const n = view.note;
  if (!n || k <= seen || hidden === k) return null;
  return (
    <Animated.View key={k} entering={FadeIn.duration(200)} style={styles.note}>
      {n.card ? <MiniCard kind={n.card} w={dk(26)} /> : <Icon name="eye" size={18} color={SPARK} />}
      <View style={{ flex: 1 }}>
        <Txt v="small" style={{ color: CREAM }}>
          {n.text}
        </Txt>
        <Txt v="tiny" color={alpha(CREAM, 0.6)}>
          لك وحدك
        </Txt>
      </View>
    </Animated.View>
  );
}

function LogLines({ view, h }: { view: BombView; h: Helpers }) {
  const lines = view.log.slice(-3);
  if (!lines.length) return null;
  return (
    <View style={styles.log}>
      {lines.map((l, i) => (
        <Row key={`${view.log.length - lines.length + i}`} gap={6} style={{ alignItems: 'center', opacity: i === lines.length - 1 ? 1 : 0.6 }}>
          {l.by ? <Avatar player={h.player(l.by)} size={18} /> : <Icon name="info" size={16} color={C.dim} />}
          <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
            {l.text}
          </Txt>
        </Row>
      ))}
    </View>
  );
}

function CardsRef({ view }: { view: BombView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn size="sm" ghost icon="book" label={open ? 'إخفاء مرجع الأوراق' : 'مرجع الأوراق'} onPress={() => setOpen((v) => !v)} />
      {open ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.panel}>
          {BOMB_KINDS.filter((k) => view.total[k] > 0).map((k) => (
            <Row key={k} gap={10} style={{ alignItems: 'center' }}>
              <MiniCard kind={k} w={dk(30)} />
              <View style={{ flex: 1 }}>
                <Txt v="bold" style={{ fontSize: 14 }}>
                  {CARD_INFO[k].name}
                </Txt>
                <Txt v="tiny" color={C.muted}>
                  {CARD_INFO[k].effect}
                </Txt>
              </View>
              <Txt v="tiny" color={C.dim} style={{ width: 66, textAlign: 'center' }}>
                في المرمى {num(view.gone[k])} من {num(view.total[k])}
              </Txt>
            </Row>
          ))}
        </Animated.View>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

function BombFinal({ room, view, h }: { room: RoomView; view: BombView; h: Helpers }) {
  const won = view.winner === h.me;
  const order = [...(view.winner ? [view.winner] : []), ...[...view.outOrder].reverse().filter((id) => id !== view.winner)];
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="bomb" size={84} />} title={view.winner ? `الفوز ${li(h.player(view.winner).name)}` : 'انتهت اللعبة'} sub={won ? 'آخر من بقي: أنت!' : 'آخر من بقي بعيداً عن القنابل'} />
      <View style={styles.panel}>
        {order.map((id, i) => (
          <Row key={id} gap={10} style={{ alignItems: 'center' }}>
            <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26, width: 24, textAlign: 'center', color: i === 0 ? SPARK : C.muted }}>{num(i + 1)}</Txt>
            <Avatar player={h.player(id)} size={34} crown={i === 0} />
            <Txt v="bold" numberOfLines={1} style={{ flex: 1 }}>
              {h.player(id).name}
              {id === h.me ? ' (أنت)' : ''}
            </Txt>
            <Txt v="tiny" color={C.dim}>
              {i === 0 ? 'الفائز' : i === order.length - 1 && order.length > 1 ? 'أول الخارجين' : `خروج رقم ${num(order.length - i)}`}
            </Txt>
          </Row>
        ))}
      </View>
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const WINDOW_OPTIONS = BOMB_WINDOW_SECONDS.map((n) => ({ key: String(n), label: `${num(n)} ثوانٍ` }));
const TURN_OPTIONS = BOMB_TURN_SECONDS.map((n) => ({ key: String(n), label: n === 0 ? 'بلا حد' : `${num(n)} ثانية` }));

export function BombSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.bomb;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'bomb', patch });
  const n = Math.max(2, Math.min(8, room.players.length));
  const d = deckAfterDeal(n);
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">مهلة «لا!»</Txt>
      <ChipPicker<string> editable={editable} value={String(s.windowSec)} onChange={(v) => change({ windowSec: Number(v) })} options={WINDOW_OPTIONS} />
      <Txt v="bold">وقت الدور</Txt>
      <ChipPicker<string> editable={editable} value={String(s.turnSec)} onChange={(v) => change({ turnSec: Number(v) })} options={TURN_OPTIONS} />
      <Row gap={8}>
        <GameArt id="bomb" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          مع {num(n)} لاعبين: في الرزمة بعد التوزيع {num(d.deck)} ورقة، منها {bombsText(d.bombs)} و{num(d.defuse)} من المفكّكات. ولكل لاعب مفكّك و{num(5)} أوراق.
          {s.turnSec ? ' وإذا انتهى وقت الدور سُحبت ورقة تلقائياً.' : ''}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  turnsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: RED, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 1 },
  felt: { backgroundColor: TABLE, borderRadius: 22, borderWidth: 1.5, borderColor: alpha(RED, 0.55), padding: 12, gap: 8, overflow: 'hidden' },
  pile: { alignItems: 'center', gap: 4, padding: 5, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pileOn: { borderColor: SPARK, backgroundColor: alpha(SPARK, 0.08) },
  bombPill: { backgroundColor: alpha(RED, 0.9), borderRadius: 999, paddingHorizontal: 9 },
  emptyPile: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(CREAM, 0.35), alignItems: 'center', justifyContent: 'center' },
  boom: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, padding: 10 },
  moment: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 2, borderColor: C.borderStrong, padding: 12, gap: 8 },
  nopeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CARD_INFO.nope.color, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  nopeBtn: { alignSelf: 'center', minWidth: 160, alignItems: 'center', backgroundColor: CARD_INFO.nope.color, borderRadius: 999, paddingHorizontal: 28, borderWidth: 3, borderColor: '#151726', borderBottomWidth: 6 },
  nopeText: { fontFamily: F.display, fontSize: 28, lineHeight: 50, color: '#FFFFFF' },
  placeChip: { borderRadius: 999, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surfaceStrong, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  placeChipOn: { backgroundColor: C.green, borderColor: C.green },
  stepBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  known: { backgroundColor: alpha(INDIGO, 0.9), borderRadius: 16, borderWidth: 1.5, borderColor: alpha(CARD_INFO.peek.color, 0.7), padding: 10, gap: 6 },
  detail: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  target: { borderRadius: 16, alignItems: 'center', paddingVertical: 10, gap: 2 },
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 14, gap: 10 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: alpha(INDIGO, 0.95), borderRadius: 14, borderWidth: 1.5, borderColor: alpha(SPARK, 0.6), paddingVertical: 8, paddingHorizontal: 12 },
  log: { gap: 4, paddingHorizontal: 4 },
});
