/**
 * «المدن والطرق» — the screen. Scores and followers left on top, the board in the middle (drag, pinch
 * or +/−), the drawn tile at the bottom. On your turn: tap a lit cell to try the tile there (the
 * preview only turns through the rotations that fit, and everyone sees it live), confirm, then tap a
 * free feature of the tile (on the big copy below the board, or on the board) to put a follower, or
 * go on without one.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Circle } from 'react-native-svg';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { TILES, legalRotations, legalSpots, makeBoard, rotatePoint, type CarcaKind } from '@/shared/carca-tiles';
import type { CarcaBreakdown, CarcaEvent, CarcaView } from '@/shared/games/carca';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Card, Pill, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, Podium, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { CarcaBoard, type BoardOptions } from './carca-board';
import { CarcaSpots, ReturnFlights, useReturns } from './carca-motion';
import { CountUp, Settle, useSettled } from './catan-motion';
import { Meeple, MeepleIcon, TileView } from './carca-tile';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { winLine } from './duel';
import { helpers, type Helpers } from './helpers';

const ROLE: Record<CarcaKind, string> = { city: 'فارس في المدينة', road: 'قاطع طريق على الطريق', monastery: 'راهب في الدير', field: 'مزارع في الحقل' };

/** «نقطة واحدة», «نقطتان», «5 نقاط», «12 نقطة» */
export function ptsText(n: number): string {
  if (n === 0) return 'لا نقاط';
  if (n === 1) return 'نقطة واحدة';
  if (n === 2) return 'نقطتان';
  return `${num(n)} ${n <= 10 ? 'نقاط' : 'نقطة'}`;
}

function eventText(e: CarcaEvent, h: Helpers): string {
  if (e.kind === 'discard') return 'استُبعدت بلاطة لا مكان لها، وسُحبت غيرها';
  const label =
    e.kind === 'road' ? (e.end ? 'طريق لم يكتمل' : 'اكتمل طريق')
    : e.kind === 'city' ? (e.end ? 'مدينة لم تكتمل' : 'اكتملت مدينة')
    : e.kind === 'monastery' ? (e.end ? 'دير لم يكتمل' : 'اكتمل دير')
    : 'مزارعون في حقل';
  if (!e.who.length) return `${label} — لا أحد يأخذ النقاط`;
  const names = e.who.map((id) => (id === h.me ? 'أنت' : h.player(id).name)).join(' و');
  return `${label} — ${names}: ${ptsText(e.pts)}`;
}

/* ------------------------------------------------------------------ */
/* Score track                                                         */
/* ------------------------------------------------------------------ */

/**
 * The score track: a chip per player in the same style as the shared PlayerStrip (the player on turn
 * framed and tinted in their colour, «(أنت)» for me), with what this game needs on it: the colour of
 * their followers, the score and the followers left.
 */
function Players({ view, h, width, stage, countAt = 0 }: { view: CarcaView; h: Helpers; width: number; stage?: CarcaSpots; countAt?: number }) {
  const n = view.order.length;
  const per = n === 3 || n === 5 ? 3 : 2;
  const w = Math.floor((width - (per - 1) * 6) / per);
  return (
    <Row gap={6} wrap center>
      {view.order.map((id) => {
        const on = view.turn === id;
        const p = h.player(id);
        return (
          <View key={id} style={[styles.player, { width: w }, on && { borderColor: p.color, backgroundColor: alpha(p.color, 0.2) }]}>
            <Row gap={4}>
              <MeepleIcon color={view.colors[id] ?? 0} size={16} />
              <Txt v="tiny" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
                {p.name}
                {id === h.me ? ' (أنت)' : ''}
              </Txt>
            </Row>
            <Row gap={4} style={{ justifyContent: 'space-between' }}>
              {/* the points count up once the followers that earned them are back */}
              <CountUp value={view.scores[id] ?? 0} delay={countAt} render={num} v="bold" color={on ? C.text : C.yellow} style={{ fontSize: 17 }} />
              <View ref={(n) => stage?.set(`supply:${id}`, n)} accessibilityLabel={`الأتباع الباقون: ${view.supply[id] ?? 0}`} style={styles.supply}>
                <CountUp value={view.supply[id] ?? 0} delay={countAt} render={num} v="tiny" color={C.muted} />
                <MeepleIcon color={view.colors[id] ?? 0} size={12} />
              </View>
            </Row>
          </View>
        );
      })}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Follower picker on a big copy of the placed tile                    */
/* ------------------------------------------------------------------ */

function FollowerPicker({ t, r, feats, sel, color, size, onPick }: { t: string; r: number; feats: number[]; sel: number | null; color: number; size: number; onPick: (f: number) => void }) {
  const k = size / 100;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', direction: 'ltr' }}>
      <View style={styles.bigTile}>
        <TileView t={t} r={r} size={size}>
          {feats.map((f) => {
            const feat = TILES[t].feats[f];
            const [x, y] = rotatePoint(feat.spot, r);
            return sel === f ? (
              <Meeple key={f} x={x} y={y} size={22} color={color} lying={feat.k === 'field'} />
            ) : (
              <Circle key={f} cx={x} cy={y} r={7} fill="rgba(255,255,255,0.85)" stroke="#1B1830" strokeWidth={2} />
            );
          })}
        </TileView>
      </View>
      {feats.map((f) => {
        const [x, y] = rotatePoint(TILES[t].feats[f].spot, r);
        return (
          <Pressable
            key={f}
            accessibilityLabel={ROLE[TILES[t].feats[f].k]}
            onPress={() => {
              haptic.tap();
              onPick(f);
            }}
            style={[styles.spot, { left: x * k - 20, top: y * k - 20 }, sel === f && styles.spotOn]}
          />
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Final screen                                                        */
/* ------------------------------------------------------------------ */

const COLS: { k: keyof CarcaBreakdown; label: string }[] = [
  { k: 'road', label: 'طرق' },
  { k: 'city', label: 'مدن' },
  { k: 'monastery', label: 'أديرة' },
  { k: 'farm', label: 'حقول' },
];

function Final({ room, view, h, width, boardH }: { room: RoomView; view: CarcaView; h: Helpers; width: number; boardH: number }) {
  const winners = view.final?.winners ?? [];
  const ids = view.order.slice().sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  const players = ids.map((id) => h.player(id)).filter((p) => room.players.some((x) => x.id === p.id));
  const iWon = winners.includes(h.me);
  const title = winners.length === 1 ? (winners[0] === h.me ? 'فزت!' : winLine(h.player(winners[0]).name)) : winners.length > 1 ? (iWon ? 'فوز مشترك!' : 'تعادل في القمة') : 'انتهت اللعبة';
  const sub = winners.length > 1 ? winners.map((id) => (id === h.me ? 'أنت' : h.player(id).name)).join(' و') : view.order.length <= 1 ? 'مغادرة باقي اللاعبين' : `${ptsText(view.scores[winners[0]] ?? 0)}`;
  const colW = width < 340 ? 34 : 44;
  return (
    <>
      {iWon ? <Confetti /> : null}
      <ResultBanner tone={iWon ? 'good' : winners.length ? 'bad' : 'neutral'} title={title} sub={sub} />
      <Podium players={players} scores={view.scores} />
      <Card style={{ gap: 6, padding: 12 }}>
        <Row gap={4}>
          <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
            اللاعب
          </Txt>
          {COLS.map((c) => (
            <Txt key={c.k} v="tiny" color={C.muted} style={{ width: colW, textAlign: 'center' }} numberOfLines={1}>
              {c.label}
            </Txt>
          ))}
          <Txt v="tiny" color={C.yellow} style={{ width: colW + 14, textAlign: 'center' }} numberOfLines={1}>
            المجموع
          </Txt>
        </Row>
        {ids.map((id) => {
          const b = view.breakdown[id];
          return (
            <Row key={id} gap={4} style={[styles.scoreRow, id === h.me && { backgroundColor: 'rgba(242,179,61,0.1)' }]}>
              <Row gap={4} style={{ flex: 1, minWidth: 0 }}>
                <MeepleIcon color={view.colors[id] ?? 0} size={16} />
                <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>
                  {id === h.me ? 'أنت' : h.player(id).name}
                </Txt>
              </Row>
              {COLS.map((c) => (
                <Txt key={c.k} v="small" style={{ width: colW, textAlign: 'center' }}>
                  {num(b?.[c.k] ?? 0)}
                </Txt>
              ))}
              <Txt v="h3" color={winners.includes(id) ? C.yellow : C.text} style={{ width: colW + 14, textAlign: 'center' }}>
                {num(view.scores[id] ?? 0)}
              </Txt>
            </Row>
          );
        })}
        {view.final?.left.length ? (
          <Txt v="tiny" color={C.dim}>
            {`مغادرة: ${view.final.left.map((id) => h.player(id).name).join('، ')}`}
          </Txt>
        ) : null}
      </Card>
      <CarcaBoard board={view.board} followers={view.followers} colors={view.colors} width={width} height={boardH} />
      <Log view={view} h={h} n={6} />
      <PlayAgain room={room} />
    </>
  );
}

function Log({ view, h, n }: { view: CarcaView; h: Helpers; n: number }) {
  if (!view.log.length) return null;
  const list = view.log.slice(-n).reverse();
  return (
    <View style={{ gap: 2 }}>
      {list.map((e, i) => (
        <Animated.View key={e.n} entering={i === 0 ? FadeIn.duration(250) : undefined}>
          <Txt v={i === 0 ? 'small' : 'tiny'} center color={i === 0 ? C.text : C.dim} numberOfLines={1}>
            {eventText(e, h)}
          </Txt>
        </Animated.View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */

export function CarcaGame({ room, view }: { room: RoomView; view: CarcaView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const { height: winH } = useWindowDimensions();
  // the board takes what the score chips, the status line and the tile card leave on the screen
  const n = view.order.length;
  const chipRows = Math.ceil(n / (n === 3 || n === 5 ? 3 : 2));
  const fitH = Math.round(Math.max(200, Math.min(winH - 330 - chipRows * 52, width * 1.15)));
  const fullH = view.phase === 'final' ? Math.round(Math.max(240, Math.min(winH * 0.5, width * 1.1))) : fitH;
  // my choices this turn: where I try the tile, the rotation I like, the follower spot
  const [sel, setSel] = useState<{ turnNo: number; x: number; y: number; r: number } | null>(null);
  const [rot, setRot] = useState<{ turnNo: number; r: number }>({ turnNo: 0, r: 0 });
  const [pick, setPick] = useState<{ turnNo: number; f: number } | null>(null);
  const [stage] = useState(() => new CarcaSpots());
  const settled = useSettled();
  const returns = useReturns(view);

  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} boardH={fullH} />;

  const playing = view.order.includes(h.me);
  const myTurn = view.turn === h.me;
  const turnName = view.turn ? (myTurn ? 'أنت' : h.player(view.turn).name) : '';
  const myColor = view.colors[h.me] ?? 0;
  const board = makeBoard(view.board);
  const tile = view.tile;

  const placing = myTurn && view.step === 'place' && !!tile;
  const spots = placing ? legalSpots(board, tile) : [];
  const mySel = placing && sel?.turnNo === view.turnNo ? sel : null;
  const prefR = rot.turnNo === view.turnNo ? rot.r : 0;
  const choosing = myTurn && view.step === 'follower' && !!view.last;
  const myPick = choosing && pick?.turnNo === view.turnNo && view.options.includes(pick.f) ? pick.f : null;
  const lastTile = view.last ? board.get(`${view.last.x},${view.last.y}`) : undefined;
  // while I choose a follower the big tile below needs the room
  const boardH = choosing ? Math.max(180, fullH - 110) : fullH;

  const send = (x: number | null, y?: number, r?: number) => h.act('preview', x === null ? { x: null } : { x, y, r });

  const choose = (x: number, y: number, r: number) => {
    setSel({ turnNo: view.turnNo, x, y, r });
    setRot({ turnNo: view.turnNo, r });
    send(x, y, r);
  };

  const onCell = (x: number, y: number) => {
    if (!placing) return;
    const rs = legalRotations(board, tile, x, y);
    if (!rs.length) return;
    haptic.light();
    if (mySel && mySel.x === x && mySel.y === y) {
      // a second tap on the same cell turns the tile to the next rotation that fits
      choose(x, y, rs[(rs.indexOf(mySel.r) + 1) % rs.length]);
      return;
    }
    const r = rs.includes(prefR) ? prefR : (rs.find((q) => q > prefR) ?? rs[0]);
    choose(x, y, r);
  };

  const turn = (dir: 1 | -1) => {
    if (!placing) return;
    haptic.tap();
    if (!mySel) {
      setRot({ turnNo: view.turnNo, r: (prefR + dir + 4) % 4 });
      return;
    }
    const rs = legalRotations(board, tile, mySel.x, mySel.y);
    const i = rs.indexOf(mySel.r);
    choose(mySel.x, mySel.y, rs[(i + dir + rs.length) % rs.length]);
  };

  // what the board shows as the tile being tried: mine, or the live preview of whoever is on turn
  const preview = placing ? (mySel ? { ...mySel, t: tile } : null) : view.preview && tile ? { ...view.preview, t: tile } : null;
  const shownR = placing ? (mySel?.r ?? prefR) : (view.preview?.r ?? 0);

  const options: BoardOptions | null =
    view.step === 'follower' && lastTile && view.options.length && myTurn
      ? { x: lastTile.x, y: lastTile.y, t: lastTile.t, r: lastTile.r, feats: view.options, sel: myPick, color: myColor }
      : null;

  const status = myTurn
    ? view.step === 'place'
      ? mySel
        ? 'دوّر البلاطة أو ثبّتها'
        : 'اختر مكاناً مضيئاً'
      : 'ضع تابعاً أو تابع بدونه'
    : view.turn
      ? `${turnName}: ${view.step === 'follower' ? 'اختيار التابع' : 'وضع البلاطة'}`
      : '';

  const tileSize = placing ? (width < 340 ? 92 : 104) : 72;
  const bigSize = Math.min(180, Math.round(width * 0.58));

  return (
    <View ref={(n) => stage.setRoot(n)} style={{ gap: 14 }}>
      <Players view={view} h={h} width={width} stage={stage} countAt={returns?.countAt ?? 0} />
      {view.total > 0 ? <TimerBar endsAt={view.endsAt} total={view.total} onTick={myTurn} /> : null}
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt v="bold" color={myTurn ? C.yellow : C.muted} style={{ flex: 1 }} numberOfLines={2}>
          {status}
        </Txt>
        <View accessibilityLabel={`البلاطات الباقية: ${view.deck}`}>
          <Pill icon="layers" label={num(view.deck)} />
        </View>
      </Row>

      <CarcaBoard
        board={view.board}
        followers={view.followers}
        colors={view.colors}
        width={width}
        height={boardH}
        fitKey={placing ? `t${view.turnNo}` : ''}
        spots={placing ? spots : undefined}
        preview={preview}
        last={view.last && !options ? { x: view.last.x, y: view.last.y, color: view.colors[view.last.by] ?? 0 } : null}
        options={options}
        onCell={onCell}
        onSpot={(f) => setPick({ turnNo: view.turnNo, f })}
        nodeRef={(n) => stage.set('board', n)}
        onTransform={(s, tx, ty) => stage.setXf(s, tx, ty)}
      />

      {!playing ? <Spectator room={room} /> : null}

      {choosing && lastTile ? (
        <Card style={{ gap: 10, padding: 12 }}>
          <Row gap={8}>
            <Btn flex size="md" icon="check" color={C.green} label="ضع التابع" disabled={myPick === null} onPress={() => h.act('follower', { f: myPick })} />
            <Btn flex size="md" ghost label="بدون تابع" onPress={() => h.act('follower', { f: null })} />
          </Row>
          <Txt v="small" center color={myPick !== null ? C.text : C.muted}>
            {myPick !== null ? ROLE[TILES[lastTile.t].feats[myPick].k] : `اختر مكان التابع (بقي لك ${num(view.supply[h.me] ?? 0)})`}
          </Txt>
          <FollowerPicker t={lastTile.t} r={lastTile.r} feats={view.options} sel={myPick} color={myColor} size={bigSize} onPick={(f) => setPick({ turnNo: view.turnNo, f })} />
        </Card>
      ) : tile ? (
        <Card style={{ padding: 10 }}>
          <Row gap={10}>
            {/* the tile just drawn settles into its card */}
            <Settle key={`${view.turnNo}:${tile}`} animate={settled} drop={6}>
              <View style={[styles.tileBox, { borderColor: myTurn ? C.yellow : view.turn ? h.player(view.turn).color : C.border }]}>
                <TileView t={tile} r={shownR} size={tileSize} />
              </View>
            </Settle>
            {placing ? (
              <View style={{ flex: 1, gap: 8 }}>
                <Row gap={10} center style={{ direction: 'ltr' }}>
                  <View style={{ transform: [{ scaleX: -1 }] }}>
                    <IconBtn icon="refresh" size={44} label="تدوير عكس عقارب الساعة" onPress={() => turn(-1)} />
                  </View>
                  <IconBtn icon="refresh" size={44} label="تدوير مع عقارب الساعة" onPress={() => turn(1)} />
                </Row>
                <Btn size="md" icon="check" color={C.green} label="ثبّت البلاطة" disabled={!mySel} onPress={() => mySel && h.act('place', { x: mySel.x, y: mySel.y, r: mySel.r })} />
              </View>
            ) : (
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="bold" numberOfLines={1}>
                  {myTurn ? 'بلاطتك' : `بلاطة ${turnName}`}
                </Txt>
                <Txt v="small" color={C.muted}>
                  {view.preview ? 'تظهر على اللوحة حيث يجرّبها الآن' : 'يراها جميع اللاعبين'}
                </Txt>
              </View>
            )}
          </Row>
        </Card>
      ) : null}

      <Log view={view} h={h} n={4} />

      {/* followers that scored go back to their owners */}
      <View pointerEvents="none" style={styles.overlay}>
        {returns ? <ReturnFlights key={returns.k} fx={returns} spots={stage} /> : null}
      </View>
    </View>
  );
}

/** Lobby settings: farmers, time per turn (the bots' strength is the room's «مستوى البوتات»). */
export function CarcaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.carca;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'carca', patch });
  return (
    <View style={{ gap: 10 }}>
      <Toggle label="المزارعون في الحقول" value={s.farmers} editable={editable} onChange={(v) => change({ farmers: v })} />
      <Txt v="bold">الوقت لكل دور</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.seconds) as '0' | '45' | '60' | '90'}
        onChange={(v) => change({ seconds: Number(v) })}
        options={[
          { key: '0', label: 'بدون وقت' },
          { key: '45', label: '45 ث' },
          { key: '60', label: '60 ث' },
          { key: '90', label: '90 ث' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        عندما ينتهي الوقت توضع البلاطة في أفضل مكان ممكن بدون تابع.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tileBox: { borderWidth: 3, borderRadius: 8, overflow: 'hidden' },
  bigTile: { borderRadius: 10, overflow: 'hidden' },
  spot: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
  spotOn: { borderWidth: 2, borderColor: '#FFFFFF' },
  player: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1.5, borderColor: C.border },
  supply: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  overlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, direction: 'ltr', zIndex: 100, elevation: 30 },
  scoreRow: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)' },
});
