/**
 * «البلياردو» — the game screen: the players' strips (group, balls left, racks won), a line for what
 * just happened (a foul, a group, the 8 / the 9) or what to do now, the table (billiards-table.tsx) with
 * a column beside it (the shooter's spin, fine aim and the power bar — pull it down and let go to shoot;
 * for everyone else, the balls pocketed this rack), and the end of a rack / the match.
 *
 * The shooter's aim is sent a few times a second so the others see the cue turn.
 *
 * Full screen (the button beside the table): the room's header, the strips and the banner go away and
 * the table takes the whole screen (portrait, within the safe areas, the status bar hidden), with a slim
 * bar under it (power, spin, fine aim, the way out), a pill for whose turn it is, and a short toast for
 * what just happened. The choice is kept for the session; the back button leaves full screen.
 */
import { setStatusBarHidden } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { GameArt } from '@/art/game-art';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import {
  BILLIARDS_RACES,
  GROUP_SHORT,
  MODE_NAME,
  groupBalls,
  unpackBalls,
  type BilliardsGuide,
  type BilliardsMode,
  type BilliardsSettings as Settings,
  type BilliardsView,
} from '@/shared/games/billiards';
import { legalCueSpot, nearestCueSpot } from '@/shared/games/billiards-physics';
import { li } from '@/shared/li';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { ChipPicker, ConfirmModal, Toggle } from '@/ui/controls';
import { useImmersive } from '@/ui/immersive';
import { useContentWidth, useScrollLock } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { RAIL, TABLE_H, TABLE_W } from './billiards-art';
import { StaticBall } from './billiards-ball';
import { BilliardsTable, strike, type Aiming } from './billiards-table';
import { PlayAgain, ResultBanner } from './common';
import { helpers, type Helpers } from './helpers';
import { useSettled } from './touch-motion';

const COL = 46;
const GAP = 6;
/** full screen: the bar under the table */
const BAR = 54;

/** full screen, as chosen on this phone for the session */
let fullChoice = false;
/** fine aim: one tap (rad) */
const FINE = 0.1 * (Math.PI / 180);

const sideName = (h: Helpers, ids: string[]) => ids.map((id) => h.player(id).name).join(' و');

/* ------------------------------------------------------------------ */
/* The players                                                          */
/* ------------------------------------------------------------------ */

function MiniBall({ id, size = 15, dim = false }: { id: number; size?: number; dim?: boolean }) {
  return (
    <View style={{ opacity: dim ? 0.22 : 1 }}>
      <StaticBall id={id} size={size} shadow={false} />
    </View>
  );
}

function Sides({ view, h }: { view: BilliardsView; h: Helpers }) {
  const cw = useContentWidth();
  const balls = unpackBalls(view.balls);
  const onTable = new Set(balls.map((b) => b.id));
  const n = view.sides.length;
  const perLine = n <= 2 ? n : cw < 400 ? 2 : n;
  const chipW = (cw - GAP * (perLine - 1)) / perLine;
  const activeSide = view.phase === 'aim' || view.phase === 'rolling' ? view.side : -1;
  return (
    <Row wrap gap={GAP} style={{ justifyContent: 'center' }}>
      {view.sides.map((side, i) => {
        const on = i === activeSide && !side.out;
        const color = h.player(side.ids[0]).color;
        const me = side.ids.includes(h.me);
        const left = side.group ? groupBalls(side.group).filter((b) => onTable.has(b)) : [];
        const onEight = view.mode === 'eight' && !!side.group && left.length === 0;
        const ball = Math.max(11, Math.min(16, Math.floor((chipW - 22) / 8.6)));
        return (
          <View
            key={i}
            accessibilityLabel={`${sideName(h, side.ids)}${side.group ? ` — ${GROUP_SHORT[side.group]}` : ''}${on ? ' — الدور الآن' : ''}`}
            style={[styles.chip, { width: chipW, opacity: side.out ? 0.45 : 1 }, on && { borderColor: color, backgroundColor: alpha(color, 0.2) }]}>
            <Row gap={6}>
              <Row gap={-6}>
                {side.ids.map((id) => (
                  <Avatar key={id} player={h.player(id)} size={side.ids.length > 1 ? 24 : 28} />
                ))}
              </Row>
              <Txt v="tiny" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
                {me && side.ids.length === 1 ? (chipW < 150 ? 'أنت' : `${h.player(side.ids[0]).name} (أنت)`) : sideName(h, side.ids)}
              </Txt>
              {view.race > 1 ? (
                <Txt v="bold" color={on ? C.text : C.yellow} style={{ fontSize: 16 }}>
                  {num(side.wins)}
                </Txt>
              ) : null}
            </Row>
            {view.mode === 'eight' ? (
              side.group ? (
                <Row gap={2} style={{ direction: 'ltr', marginTop: 4, justifyContent: 'center' }}>
                  {onEight ? (
                    <>
                      <MiniBall id={8} size={ball} />
                      <Txt v="tiny" color={C.muted} style={{ fontSize: 11, marginStart: 4 }}>
                        على الكرة 8
                      </Txt>
                    </>
                  ) : (
                    groupBalls(side.group).map((b) => <MiniBall key={b} id={b} size={ball} dim={!onTable.has(b)} />)
                  )}
                </Row>
              ) : (
                <Txt v="tiny" color={C.dim} center style={{ fontSize: 11, marginTop: 2 }}>
                  {view.breakShot ? 'قبل الكسر' : 'الطاولة مفتوحة'}
                </Txt>
              )
            ) : (
              <Row gap={2} style={{ direction: 'ltr', marginTop: 4, minHeight: ball, justifyContent: 'center' }}>
                {side.pocketed.length ? side.pocketed.map((b) => <MiniBall key={b} id={b} size={ball} />) : (
                  <Txt v="tiny" color={C.dim} style={{ fontSize: 11 }}>
                    لا كرات بعد
                  </Txt>
                )}
              </Row>
            )}
          </View>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* What happened / what to do                                           */
/* ------------------------------------------------------------------ */

interface Info {
  tone: 'foul' | 'good' | 'info' | 'mine';
  text: string;
  sub?: string;
  key: string;
  /** stays while it is true (a prompt for the shooter that must not be missed) */
  keep?: boolean;
}

/** What the banner (or, in full screen, the toast) says: what just happened, or what to do now. */
function infoOf(view: BilliardsView, h: Helpers, mine: boolean, pocket: number | null): Info | null {
  const n = view.note;
  if (view.phase === 'aim' && mine) {
    const call = view.needCall && pocket === null;
    let text = 'اسحب على الطاولة للتصويب، ثم اسحب شريط القوة واتركه';
    let sub: string | undefined;
    if (call) text = 'اختر جيب الكرة 8: اضغط على الجيب';
    else if (view.inHand === 'kitchen') text = 'الكسر: اسحب الكرة البيضاء خلف الخط، ثم صوّب';
    else if (view.inHand) text = 'الكرة في اليد: اسحب الكرة البيضاء إلى أي مكان';
    if (n && n.kind === 'foul') sub = `${n.text} — ${n.sub ?? ''}`;
    else if (n && n.kind !== 'rack') sub = n.text;
    else if (view.mode === 'nine' && view.targets.length) sub = `الكرة المطلوبة: ${view.targets[0]}`;
    return { tone: 'mine', text, sub, key: `mine-${view.shotId}-${view.inHand}-${call}`, keep: call || !!view.inHand };
  }
  if (n && view.phase !== 'rack' && view.phase !== 'final') {
    return { tone: n.kind === 'foul' ? 'foul' : n.kind === 'group' ? 'good' : 'info', text: n.text, sub: n.sub, key: `n${n.id}` };
  }
  if (view.phase === 'aim' && view.shooter) {
    return {
      tone: 'info',
      text: view.breakShot ? `الكسر ${li(h.player(view.shooter).name)}` : `الدور ${li(h.player(view.shooter).name)}`,
      sub: view.mode === 'nine' && view.targets.length ? `الكرة المطلوبة: ${view.targets[0]}` : undefined,
      key: `t-${view.shooter}-${view.shotId}`,
    };
  }
  if (view.phase === 'rolling') return { tone: 'info', text: 'الكرات تتحرك…', key: `r${view.shotId}` };
  return null;
}

const TONE_BG = { foul: alpha(C.red, 0.22), good: alpha(C.green, 0.2), mine: alpha(C.yellow, 0.16), info: C.surface };
const TONE_BORDER = { foul: alpha(C.red, 0.7), good: alpha(C.green, 0.6), mine: alpha(C.yellow, 0.6), info: C.border };

function Banner({ info }: { info: Info | null }) {
  const settled = useSettled();
  if (!info) return <View style={{ minHeight: 44 }} />;
  return (
    <Animated.View key={info.key} entering={settled ? FadeIn.duration(260) : undefined} style={[styles.banner, { backgroundColor: TONE_BG[info.tone], borderColor: TONE_BORDER[info.tone] }]} accessibilityLiveRegion="polite">
      <Txt v="bold" center numberOfLines={2} style={{ fontSize: 14, lineHeight: 21 }} color={info.tone === 'foul' ? '#FFD9DE' : C.text}>
        {info.text}
      </Txt>
      {info.sub ? (
        <Txt v="tiny" center color={C.muted} numberOfLines={2}>
          {info.sub}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

// on the web an exiting view is replaced by a clone pinned where it was
const TOAST_OUT = Platform.OS === 'web' ? undefined : FadeOut.duration(220);

/** Full screen: the same words as a short toast over the top of the table (touches go through it). */
function Toast({ info, top, width }: { info: Info | null; top: number; width: number }) {
  const settled = useSettled();
  const [gone, setGone] = useState<string | null>(null);
  const key = info?.key ?? null;
  const keep = !!info?.keep;
  const long = info?.tone === 'foul' || info?.tone === 'good';
  useEffect(() => {
    if (!key || keep) return;
    const t = setTimeout(() => setGone(key), long ? 4200 : 3000);
    return () => clearTimeout(t);
  }, [key, keep, long]);
  // the plain "balls are rolling" line is not worth a toast
  if (!info || gone === info.key || info.key.startsWith('r')) return null;
  return (
    <Animated.View
      key={info.key}
      pointerEvents="none"
      entering={settled ? FadeIn.duration(220) : undefined}
      exiting={TOAST_OUT}
      accessibilityLiveRegion="polite"
      style={[styles.toast, { top, maxWidth: width - 24, borderColor: TONE_BORDER[info.tone] }]}>
      <Txt v="bold" center numberOfLines={2} style={{ fontSize: 13, lineHeight: 19 }} color={info.tone === 'foul' ? '#FFD9DE' : C.text}>
        {info.text}
      </Txt>
      {info.sub ? (
        <Txt v="tiny" center color={C.muted} numberOfLines={1} style={{ fontSize: 11, lineHeight: 15 }}>
          {info.sub}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/** Full screen: whose turn it is, a small pill on the top rail. */
function TurnPill({ view, h }: { view: BilliardsView; h: Helpers }) {
  if (!view.shooter || (view.phase !== 'aim' && view.phase !== 'rolling')) return null;
  const p = h.player(view.shooter);
  const me = view.shooter === h.me;
  return (
    <View pointerEvents="none" style={[styles.pill, { borderColor: alpha(p.color, 0.9) }]} accessibilityLabel={me ? 'الدور لك' : `الدور ${li(p.name)}`}>
      <Avatar player={p} size={18} />
      <Txt v="tiny" numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, maxWidth: 120 }}>
        {me ? 'دورك' : p.name}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The shooter's column: spin, fine aim, power                          */
/* ------------------------------------------------------------------ */

function Arrow({ dir }: { dir: 1 | -1 }) {
  // a small curved arrow: turn the cue clockwise (1) or counter-clockwise (−1)
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {dir > 0 ? (
        <>
          <Path d="M5.4 14.4 A7 7 0 1 1 18.6 14.4" fill="none" stroke={C.text} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M21.7 14.5 L17.4 17.7 L16.1 12.4Z" fill={C.text} />
        </>
      ) : (
        <>
          <Path d="M18.6 14.4 A7 7 0 1 0 5.4 14.4" fill="none" stroke={C.text} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M2.3 14.5 L6.6 17.7 L7.9 12.4Z" fill={C.text} />
        </>
      )}
    </Svg>
  );
}

function FineBtn({ dir, onStep }: { dir: 1 | -1; onStep: (d: number) => void }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = useRef(0);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir > 0 ? 'تدوير العصا مع عقارب الساعة قليلاً' : 'تدوير العصا عكس عقارب الساعة قليلاً'}
      onPressIn={() => {
        haptic.tap();
        onStep(dir);
        count.current = 0;
        stop();
        timer.current = setInterval(() => {
          count.current++;
          if (count.current > 5) onStep(dir * (count.current > 30 ? 4 : 1.5));
        }, 70);
      }}
      onPressOut={stop}
      style={({ pressed }) => [styles.colBtn, pressed && { backgroundColor: C.surfaceStrong }]}>
      <Arrow dir={dir} />
    </Pressable>
  );
}

const SPIN_LABEL: Record<string, string> = { '-1': 'سحب قوي', '-0.5': 'سحب', '0': 'عادية', '0.5': 'تتبع', '1': 'تتبع قوي' };

function SpinPicker({ spin, setSpin, d = 34 }: { spin: number; setSpin: (s: number) => void; d?: number }) {
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel={`نوع الضربة: ${SPIN_LABEL[String(spin)]}`}
      onPress={(e) => {
        haptic.tap();
        const up = e.nativeEvent.locationY < d / 2;
        setSpin(Math.max(-1, Math.min(1, spin + (up ? 0.5 : -0.5))));
      }}
      style={{ alignItems: 'center', gap: 2 }}>
      <Svg width={d} height={d}>
        <Circle cx={d / 2} cy={d / 2} r={d / 2 - 1} fill="#F7F3E8" stroke="rgba(0,0,0,0.4)" />
        <Path d={`M3 ${d / 2} H${d - 3} M${d / 2} 3 V${d - 3}`} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
        <Circle cx={d / 2} cy={d / 2 - spin * (d / 2) * 0.55} r={4.2} fill={C.red} />
      </Svg>
      <Txt v="tiny" center color={C.muted} numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>
        {SPIN_LABEL[String(spin)]}
      </Txt>
    </Pressable>
  );
}

/**
 * Pull and let go: the stroke (down the vertical bar beside the table; to the left along the full-screen
 * bar). A pull of almost nothing cancels.
 */
function PowerBar({ length, horizontal = false, onPull, onShoot, disabled }: { length: number; horizontal?: boolean; onPull: (p: number) => void; onShoot: (p: number) => void; disabled: boolean }) {
  const [p, setP] = useState(0);
  const at0 = useRef(0);
  const cur = useRef(0);
  const hold = useScrollLock();
  const track = horizontal ? length : length - 26;
  const set = (v: number) => {
    cur.current = v;
    setP(v);
    onPull(v);
  };
  /* eslint-disable react-hooks/refs */
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!disabled)
    .minDistance(0)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      hold(true);
      at0.current = horizontal ? e.x : e.y;
      set(0);
    })
    .onUpdate((e) => set(Math.max(0, Math.min(1, (horizontal ? at0.current - e.x : e.y - at0.current) / (track * 0.92)))))
    .onFinalize(() => {
      hold(false);
      const v = cur.current;
      cur.current = 0;
      setP(0);
      // the stick strokes from where it was pulled to (the shot), or goes back to rest (cancelled)
      if (v > 0.03) onShoot(v);
      else onPull(0);
    });
  /* eslint-enable react-hooks/refs */
  const fill = p * track;
  const color = p > 0.75 ? C.red : p > 0.4 ? C.orange : C.yellow;
  const label = `القوة ${Math.round(p * 100)}٪ — ${horizontal ? 'اسحب إلى اليسار' : 'اسحب للأسفل'} واترك للضرب`;
  if (horizontal) {
    return (
      <GestureDetector gesture={pan}>
        <View accessibilityLabel={label} style={{ width: length, height: 44, justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}>
          <View style={[styles.powerTrack, { width: length, height: 28 }]}>
            <View style={[styles.powerFillH, { width: fill, backgroundColor: color }]} />
            <View style={[styles.powerGripH, { right: Math.max(0, fill - 6) }]} />
            <View style={styles.powerTextH} pointerEvents="none">
              <Txt v="tiny" color={p > 0 ? C.yellow : C.muted} style={{ fontSize: 11, lineHeight: 16 }}>
                {p > 0 ? `${num(Math.round(p * 100))}٪` : 'القوة ←'}
              </Txt>
            </View>
          </View>
        </View>
      </GestureDetector>
    );
  }
  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel={label} style={[styles.power, { height: length, opacity: disabled ? 0.45 : 1 }]}>
        <Txt v="tiny" center color={p > 0 ? C.yellow : C.muted} style={{ fontSize: 11, lineHeight: 16 }}>
          {p > 0 ? `${num(Math.round(p * 100))}٪` : 'القوة'}
        </Txt>
        <View style={[styles.powerTrack, { height: track }]}>
          <View style={[styles.powerFill, { height: fill, backgroundColor: color }]} />
          <View style={[styles.powerGrip, { top: Math.max(0, fill - 6) }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

/** For everyone but the shooter: the balls pocketed this rack, in order (a ball return). */
function Tray({ view, height, width }: { view: BilliardsView; height: number; width?: number }) {
  const all = view.sides.flatMap((s) => s.pocketed);
  const size = 22;
  const fit = Math.max(1, Math.floor(((width ?? height) - 8) / (size + 3)));
  return (
    <View style={[styles.tray, width ? { width, height, flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 0 } : { height }]} accessibilityLabel={`الكرات في الجيوب: ${all.length}`}>
      {all.slice(-fit).map((b) => (
        <MiniBall key={b} id={b} size={size} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

export function BilliardsGame({ room, view }: { room: RoomView; view: BilliardsView }) {
  const h = helpers(room);
  const cw = useContentWidth();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ratio = TABLE_H / TABLE_W;

  // —— full screen (kept for the session; not over the end of the match) ——
  const [fullOn, setFullOn] = useState(fullChoice);
  const full = fullOn && view.phase !== 'final';
  const setFull = (on: boolean) => {
    fullChoice = on;
    setFullOn(on);
  };
  const immersive = useImmersive();
  useEffect(() => {
    immersive(full);
  }, [full, immersive]);
  useEffect(() => () => immersive(false), [immersive]);
  useEffect(() => {
    if (!full) return;
    try {
      setStatusBarHidden(true, 'fade');
    } catch {}
    // the back button leaves full screen first
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      fullChoice = false;
      setFullOn(false);
      return true;
    });
    return () => {
      sub.remove();
      try {
        setStatusBarHidden(false, 'fade');
      } catch {}
    };
  }, [full]);

  let tw: number;
  if (full) {
    const availW = winW - insets.left - insets.right - 8;
    const availH = winH - insets.top - insets.bottom - BAR - 10;
    tw = Math.floor(Math.min(availW, availH / ratio));
  } else {
    const byW = Math.min(cw - COL - GAP, 470);
    const th = Math.min(byW * ratio, Math.max(winH - 252, byW * ratio * 0.8));
    tw = Math.floor(th / ratio);
  }
  const tableH = tw * ratio;

  const seated = view.players.includes(h.me);
  const mine = view.phase === 'aim' && view.shooter === h.me;
  const [resign, setResign] = useState(false);

  // —— my aim (local while I aim; sent a few times a second) ——
  const turnKey = `${view.rack}|${view.shotId}|${view.shooter}|${view.inHand}`;
  const [aim, setAim] = useState(() => ({ key: turnKey, angle: view.aim?.a ?? -Math.PI / 2, cue: view.aim?.cue ? { x: view.aim.cue[0], y: view.aim.cue[1] } : null, pocket: null as number | null, spin: 0 }));
  let a = aim;
  if (aim.key !== turnKey) {
    a = { key: turnKey, angle: view.aim?.a ?? aim.angle, cue: view.aim?.cue ? { x: view.aim.cue[0], y: view.aim.cue[1] } : null, pocket: null, spin: 0 };
    setAim(a);
  }
  const pull = useSharedValue(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(a);
  useEffect(() => {
    latest.current = a;
  });
  useEffect(() => () => {
    if (trailing.current) clearTimeout(trailing.current);
  }, []);
  const send = () => {
    const x = latest.current;
    trailing.current = null;
    h.act('aim', { a: x.angle, cue: x.cue ? [x.cue.x, x.cue.y] : undefined, pocket: x.pocket ?? undefined });
  };
  const queueSend = () => {
    // at most about six aims a second: the first change waits a moment, later ones join it
    if (trailing.current) return;
    trailing.current = setTimeout(send, 170);
  };
  const update = (patch: Partial<typeof a>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setAim(next);
    if (mine) queueSend();
  };

  const aiming: Aiming | null = mine
    ? {
        angle: a.angle,
        setAngle: (angle) => update({ angle }),
        cue: a.cue,
        setCue: (cue) => update({ cue }),
        pocket: a.pocket,
        setPocket: (pocket) => update({ pocket }),
        pull,
      }
    : null;

  const shoot = (power: number) => {
    if (!mine) return;
    const x = latest.current;
    if (view.needCall && x.pocket === null) {
      haptic.error();
      pull.set(withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }));
      return;
    }
    let cue = x.cue;
    if (view.inHand) {
      const objects = unpackBalls(view.balls).filter((b) => b.id !== 0);
      const kitchen = view.inHand === 'kitchen';
      if (!cue) cue = nearestCueSpot(objects, 495, 1600, kitchen);
      else if (!legalCueSpot(objects, cue.x, cue.y, kitchen)) cue = nearestCueSpot(objects, cue.x, cue.y, kitchen);
    }
    if (trailing.current) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }
    haptic.medium();
    strike(pull, power);
    h.act('shot', { a: x.angle, power, spin: x.spin, cue: cue ? [cue.x, cue.y] : undefined, pocket: x.pocket ?? undefined });
  };

  const winnerSide = view.winner !== null ? view.sides[view.winner] : null;
  const iWon = !!winnerSide && winnerSide.ids.includes(h.me);
  const winName = winnerSide ? sideName(h, winnerSide.ids) : '';
  let info = infoOf(view, h, mine, a.pocket);
  // full screen: the shooter's usual "how to aim" line is not repeated over the table; a foul or a
  // group before my turn still shows
  if (full && info?.tone === 'mine' && !info.keep) info = info.sub ? { tone: view.note?.kind === 'foul' ? 'foul' : 'info', text: info.sub, key: `${info.key}-s` } : null;
  if (full && view.phase === 'rack' && winnerSide) {
    info = { tone: 'good', text: `الشوط ${li(winName)}`, sub: view.sides.map((s) => `${sideName(h, s.ids)}: ${s.wins}`).join(' — '), key: `rack${view.rack}`, keep: true };
  }

  const stepAngle = (d: number) => update({ angle: latest.current.angle + d * FINE });
  const callBlocked = view.needCall && a.pocket === null;
  const fullBtn = (
    <IconBtn icon={full ? 'compress' : 'expand'} size={40} label={full ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'} onPress={() => setFull(!full)} />
  );

  return (
    <>
      {full ? null : <Sides view={view} h={h} />}
      {full ? null : view.phase === 'final' && winnerSide ? (
        <ResultBanner
          tone={iWon ? 'good' : seated ? 'bad' : 'neutral'}
          art={<GameArt id="billiards" size={64} />}
          title={iWon ? 'الفوز لك!' : `الفوز ${li(winName)}`}
          sub={view.note?.kind === 'rack' ? view.note.sub : view.race > 1 ? view.sides.map((s) => `${sideName(h, s.ids)} ${s.wins}`).join(' — ') : undefined}
        />
      ) : view.phase === 'rack' && winnerSide ? (
        <RackPause view={view} h={h} winName={winName} />
      ) : (
        <Banner info={info} />
      )}

      <View style={full ? { height: winH - insets.top - insets.bottom, alignItems: 'center', justifyContent: 'center', gap: 6 } : null}>
        <View style={{ flexDirection: 'row', direction: 'ltr', alignSelf: 'center', gap: GAP }}>
          <BilliardsTable view={view} width={tw} aiming={aiming} />
          {full ? null : mine ? (
            <View style={{ width: COL, height: tableH, alignItems: 'center', gap: 8 }}>
              <SpinPicker spin={a.spin} setSpin={(spin) => setAim((x) => ({ ...x, spin }))} />
              <FineBtn dir={-1} onStep={stepAngle} />
              <FineBtn dir={1} onStep={stepAngle} />
              <PowerBar length={Math.max(110, tableH - 34 - 16 - 3 * 40 - 4 * 8)} onPull={(p) => pull.set(p)} onShoot={shoot} disabled={callBlocked} />
              {fullBtn}
            </View>
          ) : (
            <View style={{ width: COL, height: tableH, alignItems: 'center', gap: 8 }}>
              <Tray view={view} height={view.phase === 'final' ? tableH : tableH - 48} />
              {view.phase === 'final' ? null : fullBtn}
            </View>
          )}
        </View>
        {full ? (
          <>
            <View style={{ position: 'absolute', top: (winH - insets.top - insets.bottom - tableH - BAR - 6) / 2, alignSelf: 'center', width: tw, alignItems: 'center' }} pointerEvents="box-none">
              <View style={{ marginTop: Math.max(1, (RAIL * (tw / TABLE_W) - 21) / 2) }} pointerEvents="none">
                <TurnPill view={view} h={h} />
              </View>
              <Toast info={info} top={RAIL * (tw / TABLE_W) + 30} width={tw} />
            </View>
            <View style={[styles.bar, { width: tw }]}>
              {fullBtn}
              {mine ? (
                <>
                  <SpinPicker d={28} spin={a.spin} setSpin={(spin) => setAim((x) => ({ ...x, spin }))} />
                  <FineBtn dir={-1} onStep={stepAngle} />
                  <FineBtn dir={1} onStep={stepAngle} />
                  <PowerBar horizontal length={Math.max(90, tw - 40 - 40 - 2 * 40 - 4 * 6)} onPull={(p) => pull.set(p)} onShoot={shoot} disabled={callBlocked} />
                </>
              ) : (
                <Tray view={view} height={40} width={tw - 46} />
              )}
            </View>
          </>
        ) : null}
      </View>

      {full ? null : (
        <Row center gap={10} style={{ flexWrap: 'wrap' }}>
          <Txt v="tiny" color={C.dim}>
            {`${MODE_NAME[view.mode]} — ${view.race > 1 ? `الشوط ${view.rack} — الفوز بـ${view.race} أشواط` : 'شوط واحد'}`}
          </Txt>
          {seated && view.phase !== 'final' ? <Btn size="sm" ghost icon="door" label="انسحاب" onPress={() => setResign(true)} /> : null}
        </Row>
      )}
      {view.phase === 'final' ? <PlayAgain room={room} /> : null}
      <ConfirmModal
        visible={resign}
        danger
        icon="door"
        title="الانسحاب من المباراة؟"
        message={view.sides.length > 2 ? 'تخرج من هذه المباراة ويكمل الآخرون' : 'تذهب المباراة إلى الخصم'}
        confirmLabel="انسحب"
        onCancel={() => setResign(false)}
        onConfirm={() => {
          setResign(false);
          h.act('resign');
        }}
      />
    </>
  );
}

function RackPause({ view, h, winName }: { view: BilliardsView; h: Helpers; winName: string }) {
  const left = useCountdown(view.nextAt);
  const settled = useSettled();
  return (
    <Animated.View entering={settled ? FadeIn.duration(260) : undefined} style={[styles.banner, { backgroundColor: alpha(C.green, 0.22), borderColor: alpha(C.green, 0.6), paddingVertical: 10 }]}>
      <Txt v="h2" center>{`الشوط ${li(winName)}`}</Txt>
      {view.note?.sub ? (
        <Txt v="tiny" center color={C.muted}>
          {view.note.sub}
        </Txt>
      ) : null}
      <Txt v="tiny" center color={C.text}>
        {view.sides.map((s) => `${sideName(h, s.ids)}: ${s.wins}`).join(' — ')}
      </Txt>
      <Txt v="tiny" center color={C.dim}>{`الشوط التالي بعد ${num(Math.ceil(left / 1000))} — الكسر للفائز`}</Txt>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

const MODES: { key: BilliardsMode; label: string }[] = [
  { key: 'eight', label: 'الكرة 8' },
  { key: 'nine', label: 'الكرة 9' },
];
const RACES = BILLIARDS_RACES.map((r) => ({ key: String(r), label: r === 1 ? 'شوط واحد' : r === 2 ? 'شوطان' : `${num(r)} أشواط` }));
const GUIDES: { key: BilliardsGuide; label: string }[] = [
  { key: 'long', label: 'طويل' },
  { key: 'short', label: 'قصير' },
  { key: 'off', label: 'بدون' },
];

export function BilliardsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.billiards;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'billiards', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">اللعبة</Txt>
      <ChipPicker editable={editable} value={s.mode} onChange={(mode) => change({ mode })} options={MODES} />
      <Txt v="tiny" color={C.muted}>
        {s.mode === 'eight' ? 'لاعبان، أو أربعة في فريقين.' : 'من لاعبَين إلى أربعة، كل واحد لنفسه.'}
      </Txt>
      <Txt v="bold">عدد الأشواط للفوز</Txt>
      <ChipPicker<string> editable={editable} value={String(s.race)} onChange={(v) => change({ race: Number(v) })} options={RACES} />
      {s.mode === 'eight' ? <Toggle label="تسمية جيب الكرة 8" value={s.callPocket} editable={editable} onChange={(callPocket) => change({ callPocket })} /> : null}
      <Txt v="bold">خط التصويب</Txt>
      <ChipPicker editable={editable} value={s.guide} onChange={(guide) => change({ guide })} options={GUIDES} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, paddingVertical: 6, paddingHorizontal: 8 },
  banner: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, paddingVertical: 5, paddingHorizontal: 10, justifyContent: 'center', gap: 1 },
  colBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  power: { width: 40, alignItems: 'center' },
  powerTrack: { width: 30, borderRadius: 10, backgroundColor: C.bg3, borderWidth: 1.5, borderColor: C.borderStrong, overflow: 'hidden' },
  powerFill: { position: 'absolute', left: 0, right: 0, top: 0 },
  powerGrip: { position: 'absolute', left: 2, right: 2, height: 12, borderRadius: 4, backgroundColor: '#F7F3E8', borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  powerFillH: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  powerGripH: { position: 'absolute', top: 2, bottom: 2, width: 12, borderRadius: 4, backgroundColor: '#F7F3E8', borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  powerTextH: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 10 },
  bar: { height: BAR, flexDirection: 'row', direction: 'ltr', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingStart: 2, paddingEnd: 8, height: 22, borderRadius: 11, backgroundColor: 'rgba(16,18,41,0.82)', borderWidth: 1 },
  toast: { position: 'absolute', alignSelf: 'center', borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(16,18,41,0.86)', paddingVertical: 4, paddingHorizontal: 12 },
  tray: { width: COL, borderRadius: 14, backgroundColor: alpha('#000000', 0.18), borderWidth: 1, borderColor: C.border, alignItems: 'center', paddingVertical: 4, gap: 3 },
});

