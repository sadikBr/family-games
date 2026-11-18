/**
 * «كلم» — the screen. The word in the middle («الساحة») as three letter cards, each a little pile, the one just
 * laid in yellow as on the box; the trail of the last words; the vote on a doubtful word; my hand of
 * double-sided cards (tap = choose, tap again = turn it over; the small corner letter is the other face),
 * then tap a letter of the word to lay it there (a star asks which letter it stands for); «ما عندي كلمة»;
 * the round's result; the final podium.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import {
  KALIM_EMPTY_BONUS,
  KALIM_HAND_SIZES,
  KALIM_KEYS,
  KALIM_ROUNDS,
  cardLetter,
  isStarCard,
  type KalimCard,
  type KalimDialect,
  type KalimSettings as Settings,
  type KalimView,
} from '@/shared/games/kalim';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HostNext, QuizFinal, ResultRows, RoundHeader, winnerTitle } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';
import { dk } from '@/ui/layout';

const NAVY = '#2B2766';
const MAGENTA = '#D81B60';
const YELLOW = '#F6B53D';
const CREAM = '#FFF4DA';
const SKY = '#8FD3DC';

const DIALECT_LABEL: Record<KalimDialect, string> = { fusha: 'فصحى فقط', mixed: 'فصحى وعامية' };

/** «بطاقة واحدة»، «3 بطاقات»، «11 بطاقة» */
function cardsText(n: number) {
  if (n === 0) return 'لا بطاقات';
  if (n === 1) return 'بطاقة واحدة';
  if (n === 2) return 'بطاقتان';
  return n <= 10 ? `${num(n)} بطاقات` : `${num(n)} بطاقة`;
}

export function KalimGame({ room, view }: { room: RoomView; view: KalimView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="kalim" h={h} sub="كلمة بعد كلمة… أحسنتم جميعاً!" />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <KalimRound key={view.round} room={room} view={view} h={h} />;
}

function useInner() {
  const { width } = useWindowDimensions();
  return Math.min(width - 32, dk(520));
}

function KalimRound({ room, view, h }: { room: RoomView; view: KalimView; h: Helpers }) {
  // the card chosen, and which face of each card is up (on this phone only)
  const [chosen, setChosen] = useState<number | null>(null);
  const [faces, setFaces] = useState<Record<number, 0 | 1>>({});
  // the letter a star is about to cover (only for the word it was chosen on)
  const [starPick, setStarPick] = useState<{ pos: number; seq: number } | null>(null);
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  // (a card laid, or a new round: nothing chosen any more)
  const card = view.hand.find((c) => c.id === chosen) ?? null;
  const starAt = card && isStarCard(card) && starPick && starPick.seq === view.seq ? starPick.pos : null;
  const setStarAt = (pos: number | null) => setStarPick(pos === null ? null : { pos, seq: view.seq });
  const face = card ? (faces[card.id] ?? 0) : 0;
  const key = card && !isStarCard(card) ? (face ? card.b : card.a) : null;
  const lockLeft = useCountdown(view.lockUntil, 200);
  const locked = lockLeft > 0;
  const pending = pendingSeq === view.seq;
  const playing = view.phase === 'play';

  // a play sent: wait for the word to change (or for a refusal, shown as a message)
  useEffect(() => {
    if (pendingSeq === null) return;
    const id = setTimeout(() => setPendingSeq(null), 1800);
    return () => clearTimeout(id);
  }, [pendingSeq]);
  const send = (pos: number, as?: string) => {
    if (!card) return;
    haptic.medium();
    setPendingSeq(view.seq);
    setStarAt(null);
    h.act('play', { round: view.round, base: view.seq, card: card.id, face, pos, ...(as ? { as } : {}) });
  };
  const onTile = (pos: number) => {
    if (!card || !playing || locked || pending) return;
    if (isStarCard(card)) {
      haptic.tap();
      setStarAt(pos);
      return;
    }
    send(pos);
  };
  const onCard = (c: KalimCard) => {
    haptic.tap();
    setStarAt(null);
    if (chosen === c.id) {
      if (!isStarCard(c)) setFaces((f) => ({ ...f, [c.id]: f[c.id] ? 0 : 1 }));
      return;
    }
    setChosen(c.id);
  };

  const mine = view.counts[h.me] ?? 0;
  const iStuck = view.stuck.includes(h.me);
  return (
    <>
      <RoundHeader
        label={DIALECT_LABEL[view.dialect]}
        round={view.round}
        rounds={view.rounds}
        right={
          <Txt v="tiny" color={C.muted}>
            نقاطك: {num(view.scores[h.me] ?? 0)}
          </Txt>
        }
      />
      {view.endsAt && view.phase !== 'reveal' ? <TimerBar key={`${view.phase}|${view.seq}`} endsAt={view.endsAt} total={view.timerTotal} /> : null}
      <Arena view={view} h={h} target={card && playing && !locked && !pending ? { key, star: isStarCard(card) } : null} onTile={onTile} />
      {view.phase === 'vote' && view.vote ? <VotePanel view={view} h={h} /> : null}
      {view.phase === 'reveal' && view.result ? <Reveal view={view} h={h} /> : null}
      {playing ? (
        <>
          {starAt !== null ? (
            <StarPicker current={view.board.keys[starAt]} onPick={(k) => send(starAt, k)} onCancel={() => setStarAt(null)} />
          ) : (
            <Txt v="tiny" center color={card ? C.text : C.muted}>
              {locked
                ? `لم تُقبل الكلمة: انتظر ${num(Math.ceil(lockLeft / 1000))} ث`
                : card
                  ? isStarCard(card)
                    ? 'النجمة جاهزة: اضغط الحرف الذي تضعها عليه'
                    : `اضغط الحرف الذي تضع عليه «${cardLetter(key!)}»`
                  : 'اختر بطاقة من يدك، واضغطها مرة أخرى لقلبها'}
            </Txt>
          )}
        </>
      ) : null}
      {view.phase !== 'reveal' ? (
        <>
          <Hand hand={view.hand} chosen={chosen} faces={faces} dim={locked || !playing} onCard={onCard} />
          {playing ? (
            <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Btn
                size="sm"
                ghost={!iStuck}
                color={iStuck ? C.muted : SKY}
                icon={iStuck ? 'check' : 'hand'}
                label="ما عندي كلمة"
                onPress={() => h.act('stuck', { round: view.round, base: view.seq, on: !iStuck })}
              />
              <Txt v="tiny" color={C.dim}>
                {num(view.stuck.length)} من {num(view.players.length)}
              </Txt>
            </Row>
          ) : null}
          <PlayerStrip
            room={room}
            gains={false}
            active={view.last && view.last.seq === view.seq ? [view.last.by] : []}
            entries={view.players.map((id) => ({ id, score: view.counts[id] ?? 0, sub: view.stuck.includes(id) ? 'بلا كلمة' : id === h.me ? `${cardsText(mine)} في يدك` : undefined }))}
          />
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The word                                                            */
/* ------------------------------------------------------------------ */

function Arena({ view, h, target, onTile }: { view: KalimView; h: Helpers; target: { key: string | null; star: boolean } | null; onTile: (pos: number) => void }) {
  const inner = useInner();
  const settled = useSettled();
  const gap = 10;
  const size = Math.min(dk(88), Math.floor((inner - 28 - gap * 2 - 12) / 3));
  const b = view.board;
  const fresh = view.last && view.last.seq === view.seq ? view.last.pos : -1;
  const lastBy = view.last && view.last.seq === view.seq ? view.last.by : null;
  return (
    <View style={styles.arena}>
      <Trail view={view} />
      <View style={{ flexDirection: 'row', gap, justifyContent: 'center', paddingVertical: 6 }} accessibilityLabel={`الكلمة: ${b.shown.join('')}`}>
        {b.keys.map((k, i) => {
          const same = !!target && !target.star && target.key === k;
          const can = !!target && !same;
          const layers = Math.min(3, Math.max(0, b.pile[i] - 1));
          return (
            <Pressable
              key={i}
              disabled={!can}
              onPress={() => onTile(i)}
              accessibilityRole="button"
              accessibilityLabel={`الحرف ${b.shown[i]}${can ? ' — ضع البطاقة هنا' : ''}`}
              style={{ width: size + layers * 3, height: Math.round(size * 1.3) + layers * 3 }}>
              {Array.from({ length: layers }, (_, j) => (
                <View key={j} style={[styles.tile, { width: size, height: Math.round(size * 1.3), position: 'absolute', top: (layers - j) * 3, left: (layers - j) * 3, backgroundColor: alpha(MAGENTA, 0.55), borderColor: alpha(CREAM, 0.25) }]} />
              ))}
              <View
                style={[
                  styles.tile,
                  {
                    width: size,
                    height: Math.round(size * 1.3),
                    backgroundColor: i === fresh ? YELLOW : MAGENTA,
                    borderColor: can ? CREAM : alpha(CREAM, 0.3),
                    borderStyle: can ? 'dashed' : 'solid',
                    opacity: same ? 0.45 : 1,
                  },
                ]}>
                <Animated.View key={`${b.pile[i]}|${k}`} entering={settled ? FadeIn.duration(300) : undefined}>
                  <Txt style={{ fontFamily: F.display, color: i === fresh ? NAVY : CREAM, fontSize: Math.round(size * 0.6), lineHeight: Math.round(size * 1.05), textAlign: 'center' }}>{b.shown[i]}</Txt>
                </Animated.View>
                {b.star[i] ? (
                  <View style={styles.starBadge}>
                    <Icon name="starFull" size={12} color={YELLOW} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {lastBy ? (
        <Row gap={6} center style={{ justifyContent: 'center' }}>
          <Avatar player={h.player(lastBy)} size={20} />
          <Txt v="tiny" color={alpha(CREAM, 0.8)}>
            آخر تغيير: {h.player(lastBy).name}
            {view.last?.star ? ' · بالنجمة' : ''}
          </Txt>
        </Row>
      ) : (
        <Txt v="tiny" center color={alpha(CREAM, 0.7)}>
          الأسرع يغيّر حرفاً واحداً!
        </Txt>
      )}
    </View>
  );
}

/** The last words, oldest first (right to left): «كلم ← قلم ← قسم». */
function Trail({ view }: { view: KalimView }) {
  const steps = view.trail.slice(-5);
  return (
    <Row gap={4} wrap style={{ justifyContent: 'center', alignItems: 'center' }}>
      {steps.map((s, i) => {
        const now = i === steps.length - 1;
        return (
          <Row key={`${i}|${s.word}`} gap={4} style={{ alignItems: 'center' }}>
            {i > 0 ? <Txt style={{ color: alpha(CREAM, 0.45), fontFamily: F.bold, fontSize: 12 }}>←</Txt> : null}
            <View style={[styles.trailChip, now && { backgroundColor: alpha(CREAM, 0.16), borderColor: alpha(CREAM, 0.5) }]}>
              <Txt style={{ fontFamily: F.bold, fontSize: 13, lineHeight: 20, color: now ? CREAM : alpha(CREAM, 0.6) }}>{s.word}</Txt>
            </View>
          </Row>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* The hand                                                            */
/* ------------------------------------------------------------------ */

function Hand({ hand, chosen, faces, dim, onCard }: { hand: KalimCard[]; chosen: number | null; faces: Record<number, 0 | 1>; dim: boolean; onCard: (c: KalimCard) => void }) {
  const inner = useInner();
  const gap = 6;
  const perRow = inner < 340 ? 5 : 6;
  const w = Math.min(dk(64), Math.floor((inner - gap * (perRow - 1)) / perRow));
  if (!hand.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center', opacity: dim ? 0.55 : 1, paddingTop: 6 }}>
      {hand.map((c) => (
        <HandCard key={c.id} card={c} w={w} up={faces[c.id] ?? 0} chosen={chosen === c.id} onPress={() => onCard(c)} disabled={dim} />
      ))}
    </View>
  );
}

function HandCard({ card, w, up, chosen, onPress, disabled }: { card: KalimCard; w: number; up: 0 | 1; chosen: boolean; onPress: () => void; disabled: boolean }) {
  const hgt = Math.round(w * 1.34);
  const star = isStarCard(card);
  const big = up ? card.b : card.a;
  const small = up ? card.a : card.b;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={star ? 'بطاقة النجمة: أي حرف' : `بطاقة ${cardLetter(big)}، وعلى وجهها الآخر ${cardLetter(small)}${chosen ? ' — مختارة، اضغطها لقلبها' : ''}`}
      style={[
        styles.card,
        { width: w, height: hgt, borderColor: chosen ? YELLOW : alpha(CREAM, 0.25), borderWidth: chosen ? 3 : 1.5, transform: [{ translateY: chosen ? -6 : 0 }] },
        star && { backgroundColor: NAVY },
      ]}>
      {star ? (
        <>
          <View style={[styles.stripe, { backgroundColor: YELLOW, top: 0, height: hgt * 0.34 }]} />
          <View style={[styles.stripe, { backgroundColor: MAGENTA, top: hgt * 0.34, height: hgt * 0.33 }]} />
          <View style={[styles.stripe, { backgroundColor: '#5B4BB7', top: hgt * 0.67, height: hgt * 0.33 }]} />
          <View style={styles.starFace}>
            <Icon name="starFull" size={Math.round(w * 0.5)} color={CREAM} />
          </View>
        </>
      ) : (
        <>
          <Animated.View key={up} entering={FadeIn.duration(220)}>
            <Txt style={{ fontFamily: F.display, color: CREAM, fontSize: Math.round(w * 0.58), lineHeight: Math.round(hgt * 0.8), textAlign: 'center' }}>{cardLetter(big)}</Txt>
          </Animated.View>
          <View style={styles.corner}>
            <Txt style={{ fontFamily: F.bold, color: CREAM, fontSize: 10, lineHeight: 14, textAlign: 'center' }}>{cardLetter(small)}</Txt>
          </View>
          {chosen ? (
            <View style={styles.flip}>
              <Icon name="refresh" size={11} color={NAVY} />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** The star's letter: the 28 letters, 7 a row (the letter already there is left out). */
function StarPicker({ current, onPick, onCancel }: { current: string; onPick: (k: string) => void; onCancel: () => void }) {
  const inner = useInner();
  const gap = 5;
  const w = Math.floor((inner - 28 - gap * 6) / 7);
  return (
    <View style={styles.panel}>
      <Row gap={6} style={{ alignItems: 'center' }}>
        <Icon name="starFull" size={16} color={YELLOW} />
        <Txt v="bold" style={{ flex: 1 }}>
          أي حرف تمثّل النجمة؟
        </Txt>
        <Btn size="sm" ghost icon="close" label="إلغاء" onPress={onCancel} />
      </Row>
      {[0, 1, 2, 3].map((row) => (
        <Row key={row} gap={gap} style={{ justifyContent: 'center' }}>
          {KALIM_KEYS.slice(row * 7, row * 7 + 7).map((k) => (
            <Pressable
              key={k}
              disabled={k === current}
              onPress={() => onPick(k)}
              accessibilityRole="button"
              accessibilityLabel={`حرف ${cardLetter(k)}`}
              style={({ pressed }) => [styles.key, { width: w, height: Math.min(dk(46), Math.round(w * 1.1)), opacity: k === current ? 0.3 : 1, backgroundColor: pressed ? alpha(YELLOW, 0.4) : C.surfaceStrong }]}>
              <Txt style={{ fontFamily: F.display, fontSize: Math.round(w * 0.5), lineHeight: Math.round(w * 0.95), color: C.text, textAlign: 'center' }}>{cardLetter(k)}</Txt>
            </Pressable>
          ))}
        </Row>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The vote                                                            */
/* ------------------------------------------------------------------ */

function VotePanel({ view, h }: { view: KalimView; h: Helpers }) {
  const v = view.vote!;
  const asked = v.voters.includes(h.me);
  const voted = v.yes.includes(h.me) || v.no.includes(h.me);
  const name = h.player(v.by).name;
  return (
    <View style={[styles.panel, { borderColor: alpha(YELLOW, 0.7), alignItems: 'center' }]}>
      <Row gap={6} center>
        <Avatar player={h.player(v.by)} size={24} />
        <Txt v="small" color={C.muted}>
          {v.by === h.me ? 'كلمتك تحت التصويت' : `اقتراح من ${name}: هل هي كلمة؟`}
        </Txt>
      </Row>
      <Txt v="display" center style={{ color: CREAM }}>
        {v.word}
      </Txt>
      <Txt v="tiny" center color={C.muted}>
        {v.inDict ? 'في القاموس لكنها غير شائعة' : 'ليست في قاموس التطبيق'}
        {view.dialect === 'fusha' ? ' · الكلمات فصحى فقط' : ' · فصحى أو عامية'}
      </Txt>
      {asked && !voted ? (
        <Row gap={8} style={{ alignSelf: 'stretch' }}>
          <Btn flex size="md" icon="check" color={C.green} label="نعم" onPress={() => h.act('vote', { round: view.round, yes: true })} />
          <Btn flex size="md" icon="close" color={C.red} label="لا" onPress={() => h.act('vote', { round: view.round, yes: false })} />
        </Row>
      ) : (
        <Txt v="small" center color={C.muted}>
          {v.by === h.me ? 'بانتظار تصويت البقية…' : 'شكراً! بانتظار البقية…'} ({num(v.yes.length)} نعم · {num(v.no.length)} لا)
        </Txt>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The round's result                                                  */
/* ------------------------------------------------------------------ */

function Reveal({ view, h }: { view: KalimView; h: Helpers }) {
  const r = view.result!;
  const settled = useSettled();
  const last = view.round >= view.rounds;
  const names = r.winners.map((id) => h.player(id).name);
  const title = r.how === 'left' ? 'انتهت الجولة' : winnerTitle(names);
  const sub =
    r.how === 'emptied'
      ? `يد فارغة أولاً: ${num(`+${KALIM_EMPTY_BONUS}`)} نقاط`
      : r.how === 'stuck'
        ? `لا كلمة جديدة بعد «${view.trail[view.trail.length - 1]?.word ?? ''}»: الفوز لأقل البطاقات`
        : null;
  const won = r.winners.includes(h.me);
  return (
    <>
      <Animated.View entering={settled ? FadeIn.duration(260) : undefined} style={[styles.result, { borderColor: alpha(won ? C.green : YELLOW, 0.65), backgroundColor: alpha(won ? C.green : YELLOW, 0.12) }]}>
        <Row gap={10} style={{ alignItems: 'center' }}>
          <GameArt id="kalim" size={44} />
          <View style={{ flex: 1 }}>
            <Txt v="h2">{title}</Txt>
            {sub ? (
              <Txt v="tiny" color={C.muted}>
                {sub}
              </Txt>
            ) : null}
          </View>
        </Row>
      </Animated.View>
      <ResultRows
        h={h}
        gainLabel="الجولة"
        lines={view.players.map((id) => {
          const g = r.gains[id] ?? 0;
          const left = r.left[id] ?? 0;
          return { id, detail: left ? `بقيت ${cardsText(left)}` : 'يد فارغة', gain: num(`+${g}`), good: r.winners.includes(id), total: view.scores[id] ?? 0 };
        })}
      />
      <HostNext h={h} last={last} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const DIALECT_OPTIONS: { key: KalimDialect; label: string }[] = [
  { key: 'fusha', label: 'فصحى فقط' },
  { key: 'mixed', label: 'فصحى وعامية' },
];
const HAND_OPTIONS = KALIM_HAND_SIZES.map((n) => ({ key: String(n), label: cardsText(n) }));
const ROUND_OPTIONS = KALIM_ROUNDS.map((n) => ({ key: String(n), label: n === 1 ? 'جولة واحدة' : `${num(n)} جولات` }));

export function KalimSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.kalim;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'kalim', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الكلمات</Txt>
      <ChipPicker<KalimDialect> editable={editable} value={s.dialect} onChange={(v) => change({ dialect: v })} options={DIALECT_OPTIONS} />
      <Txt v="bold">البطاقات في كل يد</Txt>
      <ChipPicker<string> editable={editable} value={String(s.hand)} onChange={(v) => change({ hand: Number(v) })} options={HAND_OPTIONS} />
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Row gap={8}>
        <GameArt id="kalim" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          {s.dialect === 'mixed'
            ? 'الكلمات الفصحى والعامية المغربية تُقبل، والكلمة الغريبة يصوّت عليها البقية.'
            : 'الكلمات الفصحى فقط، والكلمة الغريبة يصوّت عليها البقية.'}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  arena: { backgroundColor: NAVY, borderRadius: 22, borderWidth: 1.5, borderColor: alpha(CREAM, 0.12), padding: 14, gap: 8 },
  tile: { borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  starBadge: { position: 'absolute', top: 4, left: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  trailChip: { borderRadius: 999, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 8 },
  card: { borderRadius: 12, backgroundColor: MAGENTA, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, right: 0 },
  starFace: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', top: 3, left: 3, width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: alpha(CREAM, 0.7), alignItems: 'center', justifyContent: 'center' },
  flip: { position: 'absolute', bottom: 3, right: 3, width: 17, height: 17, borderRadius: 9, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 14, gap: 10 },
  key: { borderRadius: 10, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  result: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14 },
});
