/**
 * «سلسلة الذاكرة» — the screen. The chain's length, my hearts and a state banner («شاهد» while the phones
 * play the chain, «دورك» with the tap timer while I repeat it, then done / a mistake / out); the pads big and
 * centred (they light up with their tone during the playback and under my finger); the other players as a
 * strip with their state only (still in, done this round ✓, a life lost, out) — never their taps. After a
 * round, who fell in it, then the next playback. At the end: the podium and «أطول سلسلة».
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  SILSILA_LIT,
  SILSILA_LIVES,
  SILSILA_PADS,
  SILSILA_TAP_MS,
  type SilsilaPlayerState,
  type SilsilaSettings as Settings,
  type SilsilaView,
} from '@/shared/games/silsila';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { Board, Hearts, MiniPad } from './silsila-pads';
import { playTone, warmTones } from './silsila-tones';

const VIOLET = '#7A5BD6';
/** Taps this close to the end of the playback already count (the server agrees). */
const EARLY_MS = 200;

const livesText = (n: number) => (n === 1 ? 'قلب واحد' : n === 2 ? 'قلبان' : `${num(n)} قلوب`);
/** «خطوة واحدة»، «خطوتان»، «5 خطوات»، «12 خطوة» */
const stepsText = (n: number) => (n === 1 ? 'خطوة واحدة' : n === 2 ? 'خطوتان' : n <= 10 ? `${num(n)} خطوات` : `${num(n)} خطوة`);

export function SilsilaGame({ room, view }: { room: RoomView; view: SilsilaView }) {
  const h = helpers(room);
  if (view.phase === 'final' && view.final) return <Final room={room} view={view} h={h} />;
  if (!view.me) return <Spectator room={room} />;
  return <Round room={room} view={view} h={h} />;
}

/* ------------------------------------------------------------------ */
/* The playback                                                        */
/* ------------------------------------------------------------------ */

/**
 * The pad lit by the playback now (from the server's clock, so every phone lights the same pad at the same
 * moment), with its tone as it lights; `over` once the playback is (nearly) finished.
 */
const IDLE = { lit: null, over: true };
const FRESH = { lit: null, over: false };

function usePlayback(view: SilsilaView) {
  const [st, setSt] = useState<{ at: number; lit: number | null; over: boolean }>({ at: 0, lit: null, over: false });
  const active = view.phase === 'watch' || view.phase === 'input';
  const seqKey = view.seq.join(',');
  useEffect(() => {
    if (!active) return;
    const seq = seqKey ? seqKey.split(',').map(Number) : [];
    const total = seq.length * view.stepMs;
    let shown = -2;
    let played = -1;
    let over = false;
    const run = () => {
      const t = client.serverNow() - view.playAt;
      const idx = Math.floor(t / view.stepMs);
      const on = t >= 0 && idx < seq.length && t - idx * view.stepMs < view.stepMs * SILSILA_LIT ? idx : -1;
      const nowOver = t >= total - EARLY_MS;
      if (on !== shown || nowOver !== over) {
        shown = on;
        over = nowOver;
        setSt({ at: view.playAt, lit: on >= 0 ? seq[on] : null, over: nowOver });
        if (on > played) {
          played = on;
          playTone(seq[on]);
        }
      }
      return t > total;
    };
    const id = setInterval(() => {
      if (run()) clearInterval(id);
    }, 20);
    return () => clearInterval(id);
  }, [active, seqKey, view.playAt, view.stepMs]);
  if (!active) return IDLE;
  // (the state of the round before, until the first look at this one)
  return st.at === view.playAt ? st : FRESH;
}

/* ------------------------------------------------------------------ */
/* A round                                                             */
/* ------------------------------------------------------------------ */

function Round({ room, view, h }: { room: RoomView; view: SilsilaView; h: Helpers }) {
  const me = view.me!;
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  const { lit: playLit, over } = usePlayback(view);
  // my taps this round, shown at once (the server confirms them)
  const [taps, setTaps] = useState<{ len: number; pads: number[] }>({ len: 0, pads: [] });
  const [pressed, setPressed] = useState<{ pad: number; k: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => warmTones(view.pads), [view.pads]);
  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  // (a screen opened again in the middle of my turn starts from the steps the server already has)
  const local = taps.len === view.len ? taps.pads : [];
  const mine = local.length >= me.prog ? local : view.seq.slice(0, me.prog);
  const wrongAt = mine.findIndex((p, i) => p !== view.seq[i]);
  // my state, a step ahead of the server for my own taps
  let state: SilsilaPlayerState = me.state;
  if (me.state === 'play' && view.phase !== 'fallen') {
    if (wrongAt >= 0) state = me.lives <= 1 ? 'out' : 'fail';
    else if (mine.length >= view.len && view.len > 0) state = 'done';
  }
  // a tap the server didn't take (it came before the end of the playback by its clock): forget it, so my
  // next tap is for the step the server is waiting for
  const lastTap = useRef(0);
  const ahead = me.state === 'play' && wrongAt < 0 && mine.length > me.prog;
  useEffect(() => {
    if (!ahead) return;
    const id = setTimeout(() => setTaps((t) => (t.len === view.len && t.pads.length > me.prog ? { len: t.len, pads: t.pads.slice(0, me.prog) } : t)), Math.max(0, lastTap.current + 1500 - Date.now()));
    return () => clearTimeout(id);
  }, [ahead, me.prog, view.len, mine.length]);
  const inputOpen = view.phase === 'input' || (view.phase === 'watch' && over);
  const canTap = state === 'play' && inputOpen;

  const onPad = (pad: number) => {
    if (!canTap) return;
    const i = mine.length;
    lastTap.current = Date.now();
    playTone(pad);
    haptic.tap();
    setTaps({ len: view.len, pads: [...mine, pad] });
    setPressed((p) => ({ pad, k: (p?.k ?? 0) + 1 }));
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(null), 230);
    h.act('tap', { len: view.len, i, pad });
  };

  const lit = playLit ?? pressed?.pad ?? null;
  const boardW = Math.min(width, dk(view.pads === 6 ? 470 : 400));
  const others = view.rows.filter((r) => r.id !== h.me);
  const inCount = view.rows.filter((r) => r.lives > 0).length;
  const miss = me.miss ?? (wrongAt >= 0 ? { want: view.seq[wrongAt], got: mine[wrongAt] } : null);

  return (
    <>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <View style={styles.lenChip} accessibilityLabel={`طول السلسلة: ${view.len}`}>
          <Txt v="tiny" color={C.muted}>
            طول السلسلة
          </Txt>
          <Txt style={styles.lenNum}>{num(view.len)}</Txt>
        </View>
        <Hearts lives={me.lives} max={view.maxLives} size={20} />
        <Txt v="tiny" color={C.muted} style={{ minWidth: 70, textAlign: 'left' }}>
          {view.solo ? (view.roomBest ? `الأفضل: ${num(view.roomBest)}` : 'أول محاولة') : `في اللعب: ${num(inCount)} من ${num(view.rows.length)}`}
        </Txt>
      </Row>

      {view.phase === 'fallen' ? (
        <Fallen view={view} h={h} />
      ) : (
        <Banner view={view} state={state} inputOpen={inputOpen} done={mine.length} miss={state === 'fail' || state === 'out' ? miss : null} />
      )}

      <Board pads={view.pads} width={boardW} max={Math.min(dk(view.pads === 6 ? 150 : 180), Math.max(104, Math.floor((height - 400) / 2) - 12))} lit={lit} enabled={canTap} onPress={onPad} />

      {others.length ? <Others room={room} view={view} rows={others} /> : null}
    </>
  );
}

function BannerBox({ icon, color, title, sub, children }: { icon: IconName; color: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <View style={[styles.banner, { borderColor: alpha(color, 0.7), backgroundColor: alpha(color, 0.14) }]}>
      <Row gap={10}>
        <View style={[styles.bannerIcon, { backgroundColor: alpha(color, 0.25) }]}>
          <Icon name={icon} size={22} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="title" style={{ lineHeight: 34 }}>
            {title}
          </Txt>
          {sub ? (
            <Txt v="tiny" color={C.muted}>
              {sub}
            </Txt>
          ) : null}
        </View>
        {children}
      </Row>
    </View>
  );
}

function Banner({ view, state, inputOpen, done, miss }: { view: SilsilaView; state: SilsilaPlayerState; inputOpen: boolean; done: number; miss: { want: number; got: number | null } | null }) {
  const me = view.me!;
  const rightPad = miss ? (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <MiniPad pad={miss.want} size={34} />
      <Txt v="tiny" color={C.muted} style={{ fontSize: 10, lineHeight: 14 }}>
        الصحيح
      </Txt>
    </View>
  ) : null;
  if (state === 'out') {
    return (
      <BannerBox icon="eye" color={C.dim} title={miss ? (miss.got === null ? 'انتهى الوقت!' : 'خطأ!') : 'خارج اللعبة'} sub={view.solo ? 'نهاية المحاولة' : miss ? 'خارج اللعبة · تابع البقية حتى النهاية' : 'تابع البقية حتى النهاية'}>
        {rightPad}
      </BannerBox>
    );
  }
  if (state === 'fail') {
    return (
      <BannerBox icon="heart" color={C.red} title={miss?.got === null ? 'انتهى الوقت!' : 'خطأ!'} sub={`قلب أقل · الباقي: ${livesText(Math.max(1, me.lives - (me.state === 'play' ? 1 : 0)))}`}>
        {rightPad}
      </BannerBox>
    );
  }
  if (state === 'done') {
    return <BannerBox icon="check" color={C.green} title="السلسلة كاملة ✓" sub={view.solo ? 'استعدّ للسلسلة التالية…' : 'بانتظار البقية…'} />;
  }
  if (!inputOpen) {
    return <BannerBox icon="eye" color={C.yellow} title="شاهد" sub={`${view.len === 1 ? 'الخطوة الأولى' : `سلسلة من ${num(view.len)}`} · احفظ الترتيب`} />;
  }
  return (
    <View style={[styles.banner, { borderColor: alpha(VIOLET, 0.9), backgroundColor: alpha(VIOLET, 0.22), gap: 6 }]}>
      <Row gap={10}>
        <View style={[styles.bannerIcon, { backgroundColor: alpha(VIOLET, 0.4) }]}>
          <Icon name="hand" size={22} color={C.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ lineHeight: 34 }}>
            دورك
          </Txt>
          <Txt v="tiny" color={C.muted}>
            أعد السلسلة بالترتيب
          </Txt>
        </View>
        <Txt style={styles.stepNum}>
          {num(Math.min(done + 1, view.len))}
          <Txt v="tiny" color={C.muted}>
            {' '}
            من {num(view.len)}
          </Txt>
        </Txt>
      </Row>
      {me.deadline ? <TimerBar key={`${view.len}|${done}`} endsAt={me.deadline} total={SILSILA_TAP_MS} /> : null}
    </View>
  );
}

/** The round just played: who lost a life, who is out, then the next chain. */
function Fallen({ view, h }: { view: SilsilaView; h: Helpers }) {
  const f = view.fallen;
  return (
    <Animated.View entering={FadeIn.duration(240)} style={[styles.banner, { borderColor: alpha(C.yellow, 0.6), backgroundColor: alpha(C.yellow, 0.1), gap: 6 }]}>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt v="h3" style={{ flexShrink: 1 }}>
          {f.length ? `نهاية الجولة ${num(view.len)}` : view.solo ? 'سلسلة كاملة!' : 'سلسلة كاملة من الجميع!'}
        </Txt>
        <Txt v="tiny" color={C.muted}>
          التالية: سلسلة من {num(view.len + 1)}
        </Txt>
      </Row>
      {f.length ? (
        <Row wrap gap={6}>
          {f.map((x) => (
            <View key={x.id} style={styles.fallChip}>
              <Avatar player={h.player(x.id)} size={22} dim={x.out} />
              <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 80 }}>
                {x.id === h.me ? 'أنت' : h.player(x.id).name}
              </Txt>
              <Txt v="tiny" color={x.out ? C.red : C.orange}>
                {x.out ? '· خارج اللعبة' : '· قلب أقل'}
              </Txt>
            </View>
          ))}
        </Row>
      ) : null}
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={2000} /> : null}
    </Animated.View>
  );
}

const STATE_BADGE: Record<SilsilaPlayerState, { icon: IconName; color: string; label: string } | null> = {
  play: null,
  done: { icon: 'check', color: C.green, label: 'السلسلة كاملة' },
  fail: { icon: 'close', color: C.orange, label: 'قلب أقل' },
  out: { icon: 'skull', color: C.dim, label: 'خارج اللعبة' },
};

/** The other players: avatar, name, hearts and their state — never their taps. */
function Others({ room, view, rows }: { room: RoomView; view: SilsilaView; rows: SilsilaView['rows'] }) {
  const width = useContentWidth();
  const per = Math.max(3, Math.min(rows.length, Math.floor((width + 6) / 70)));
  const w = Math.floor((width - 6 * (per - 1)) / per);
  return (
    <Row wrap gap={6} center style={{ marginTop: 2 }}>
      {rows.map((r) => {
        const p = room.players.find((x) => x.id === r.id) ?? { id: r.id, name: '؟', avatar: 'owl', color: C.dim, connected: false };
        const b = STATE_BADGE[r.state];
        const playing = r.state === 'play' && (view.phase === 'input' || view.phase === 'watch');
        return (
          <View key={r.id} style={[styles.other, { width: Math.min(w, 96), opacity: r.state === 'out' ? 0.5 : 1 }]} accessibilityLabel={`${p.name}: ${b ? b.label : 'في اللعب'}`}>
            <View>
              <Avatar player={p} size={36} ring={playing ? alpha(VIOLET, 0.9) : undefined} />
              {b ? (
                <View style={[styles.badge, { backgroundColor: b.color }]}>
                  <Icon name={b.icon} size={11} color={C.ink} />
                </View>
              ) : null}
            </View>
            <Txt v="tiny" numberOfLines={1} center style={{ fontSize: 11, lineHeight: 16 }}>
              {p.name}
            </Txt>
            <Hearts lives={r.lives} max={view.maxLives} size={10} />
          </View>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* The end                                                             */
/* ------------------------------------------------------------------ */

const MEDAL = [C.yellow, '#C9CED8', '#D08A55'];

function Final({ room, view, h }: { room: RoomView; view: SilsilaView; h: Helpers }) {
  const f = view.final!;
  const width = useContentWidth();
  const placeOf: Record<string, number> = {};
  f.places.forEach((ids, i) => ids.forEach((id) => (placeOf[id] = i)));
  const ranked = f.places.flat().filter((id) => view.rows.some((r) => r.id === id));
  const best = Object.fromEntries(view.rows.map((r) => [r.id, r.best]));
  const top = f.places[0] ?? [];
  const won = !view.solo && top.includes(h.me) && top.length === 1;
  const names = (ids: string[]) => ids.map((id) => (id === h.me ? 'أنت' : h.player(id).name)).join(' و');

  let title: string;
  let sub: string;
  if (view.solo) {
    title = f.longest ? `سلسلة من ${num(f.longest)}!` : 'نهاية المحاولة';
    sub = f.record ? 'رقم جديد في هذه الغرفة!' : f.roomBest ? `أفضل سلسلة في الغرفة: ${num(f.roomBest)}` : 'حاول من جديد لتطول السلسلة';
  } else {
    title = top.length === 1 ? (top[0] === h.me ? 'الفوز لك!' : `الفوز من نصيب ${h.player(top[0]).name}!`) : 'تعادل!';
    sub = f.together ? 'لا أحد بقي في الجولة الأخيرة: الترتيب لمن وصل أبعد فيها، ثم للأسرع' : 'آخر من بقي في السلسلة';
  }

  // the podium: the first three players in the ranking
  const podium = ranked.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as string[];
  const colW = Math.min(dk(110), (Math.min(width, dk(560)) - 20) / 3);
  const heights = [84, 60, 44];

  return (
    <>
      {won || (view.solo && f.record) ? <Confetti /> : null}
      <ResultBanner tone={won || (view.solo && f.record) ? 'good' : 'neutral'} art={<GameArt id="silsila" size={84} />} title={title} sub={sub} />

      {!view.solo && order.length > 1 ? (
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Row gap={10} style={{ alignItems: 'flex-end', justifyContent: 'center', direction: 'ltr' }}>
            {order.map((id) => {
              const place = placeOf[id] ?? 2;
              return (
                <View key={id} style={{ alignItems: 'center', gap: 6, width: colW }}>
                  <Avatar player={h.player(id)} size={Math.min(place === 0 ? 64 : 52, colW - 20)} crown={place === 0 && top.length === 1} />
                  <Txt v="bold" numberOfLines={1} center>
                    {h.player(id).name}
                  </Txt>
                  <View style={[styles.podium, { height: heights[Math.min(place, 2)], backgroundColor: alpha(MEDAL[Math.min(place, 2)], 0.9) }]}>
                    <Txt style={{ fontFamily: F.black, fontSize: 20, lineHeight: 28, color: C.ink }}>{num(best[id] ?? 0)}</Txt>
                  </View>
                </View>
              );
            })}
          </Row>
          <View style={{ height: 8, width: order.length * (colW + 10), borderRadius: 4, backgroundColor: alpha(VIOLET, 0.55) }} />
        </View>
      ) : null}

      <View style={[styles.longest]}>
        <Row gap={10}>
          <View style={[styles.bannerIcon, { backgroundColor: alpha(VIOLET, 0.35) }]}>
            <Icon name="trophy" size={22} color={C.yellow} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="tiny" color={C.muted}>
              أطول سلسلة
            </Txt>
            <Txt v="bold" numberOfLines={2}>
              {f.longest ? (view.solo ? stepsText(f.longest) : `${stepsText(f.longest)} · ${names(f.longestBy)}`) : 'لا سلسلة كاملة هذه المرة'}
            </Txt>
          </View>
          <Txt style={[styles.lenNum, { fontSize: 34, lineHeight: 46 }]}>{num(f.longest)}</Txt>
        </Row>
        <Txt v="tiny" color={f.record ? C.yellow : C.muted}>
          {f.record
            ? `رقم جديد للغرفة مع ${num(view.pads)} أزرار!`
            : f.roomBest
              ? `أفضل سلسلة في الغرفة مع ${num(view.pads)} أزرار: ${num(f.roomBest)} · ${f.roomBestBy.join(' و')}`
              : ''}
        </Txt>
      </View>

      {!view.solo ? (
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 10 }}>
            <Txt v="tiny" color={C.dim}>
              الترتيب
            </Txt>
            <Txt v="tiny" color={C.dim}>
              أطول سلسلة
            </Txt>
          </Row>
          {ranked.map((id) => {
            const place = placeOf[id] ?? 0;
            const out = f.outRound[id];
            return (
              <View key={id} style={[styles.rankRow, id === h.me && { backgroundColor: alpha(C.yellow, 0.1) }]}>
                <View style={[styles.rank, { backgroundColor: MEDAL[place] ?? C.surfaceStrong }]}>
                  <Txt v="tiny" color={place < 3 ? C.ink : C.text}>
                    {num(place + 1)}
                  </Txt>
                </View>
                <Avatar player={h.player(id)} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="bold" numberOfLines={1}>
                    {h.player(id).name}
                  </Txt>
                  <Txt v="tiny" color={C.muted}>
                    {out ? `خروج في الجولة ${num(out)}` : 'حتى النهاية'}
                  </Txt>
                </View>
                <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26, minWidth: 30, textAlign: 'center' }}>{num(best[id] ?? 0)}</Txt>
              </View>
            );
          })}
        </View>
      ) : null}
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const PAD_OPTIONS = SILSILA_PADS.map((n) => ({ key: String(n), label: `${num(n)} أزرار` }));
const LIVES_OPTIONS = SILSILA_LIVES.map((n) => ({ key: String(n), label: livesText(n) }));

export function SilsilaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.silsila;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'silsila', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الأزرار</Txt>
      <ChipPicker<string> editable={editable} value={String(s.pads)} onChange={(v) => change({ pads: Number(v) })} options={PAD_OPTIONS} />
      <Row gap={6}>
        {Array.from({ length: s.pads }, (_, i) => (
          <MiniPad key={i} pad={i} size={28} />
        ))}
      </Row>
      <Txt v="bold">المحاولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.lives)} onChange={(v) => change({ lives: Number(v) })} options={LIVES_OPTIONS} />
      <Txt v="tiny" color={C.muted}>
        {s.lives === 1 ? 'خطأ واحد = خروج من اللعبة.' : `الخروج بعد ${s.lives === 2 ? 'خطأين' : `${num(s.lives)} أخطاء`}.`} لكل ضغطة {num(SILSILA_TAP_MS / 1000)} ثوانٍ.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  lenChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: alpha(VIOLET, 0.22), borderColor: alpha(VIOLET, 0.55), borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 1 },
  lenNum: { fontFamily: F.black, fontSize: 22, lineHeight: 32, color: C.text },
  stepNum: { fontFamily: F.black, fontSize: 22, lineHeight: 32, color: C.text },
  // the same height in every state (the timer row included), so the pads never move under a finger
  banner: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, minHeight: 112, justifyContent: 'center' },
  bannerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  fallChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderRadius: 999, paddingVertical: 3, paddingStart: 4, paddingEnd: 10 },
  other: { alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 14, backgroundColor: C.surface },
  badge: { position: 'absolute', bottom: -2, left: -2, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.bg },
  longest: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: alpha(VIOLET, 0.6), padding: 14, gap: 6 },
  podium: { width: '100%', borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: 'center', paddingTop: 6 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
